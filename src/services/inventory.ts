import { getDatabase } from '../db/database';
import { mulMoney, roundMoney } from '../utils/money';
import type { InventoryMovement, Product } from '../types';

/** Default sale unit price: stored sell price, or cost + 20% markup. */
export function getProductSellPrice(product: Pick<Product, 'sell_price' | 'avg_cost'>): number {
  if (product.sell_price > 0) return product.sell_price;
  if (product.avg_cost > 0) return mulMoney(product.avg_cost, 1.2);
  return 0;
}

export async function getProductCategories(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM (
       SELECT name FROM product_categories
       UNION
       SELECT DISTINCT category AS name FROM products
       WHERE category IS NOT NULL AND TRIM(category) != ''
     )
     ORDER BY name COLLATE NOCASE ASC`
  );
  return rows.map((r) => r.name);
}

export async function addProductCategory(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required');

  const db = await getDatabase();
  await db.runAsync('INSERT OR IGNORE INTO product_categories (name) VALUES (?)', [trimmed]);
}

async function ensureProductCategory(
  db: Awaited<ReturnType<typeof getDatabase>>,
  category: string | null | undefined
): Promise<string | null> {
  const trimmed = category?.trim();
  if (!trimmed) return null;
  await db.runAsync('INSERT OR IGNORE INTO product_categories (name) VALUES (?)', [trimmed]);
  return trimmed;
}

export async function getProducts(category?: string): Promise<Product[]> {
  const db = await getDatabase();
  if (category?.trim()) {
    return db.getAllAsync<Product>(
      'SELECT * FROM products WHERE category = ? COLLATE NOCASE ORDER BY name ASC',
      [category.trim()]
    );
  }
  return db.getAllAsync<Product>('SELECT * FROM products ORDER BY name ASC');
}

export async function getProductById(id: number): Promise<Product | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Product>('SELECT * FROM products WHERE id = ?', [id]);
}

export async function getProductMovements(productId: number): Promise<InventoryMovement[]> {
  const db = await getDatabase();
  return db.getAllAsync<InventoryMovement>(
    `SELECT im.*, p.name as product_name FROM inventory_movements im
     JOIN products p ON p.id = im.product_id
     WHERE im.product_id = ?
     ORDER BY im.created_at DESC, im.id DESC`,
    [productId]
  );
}

export async function createProduct(params: {
  name: string;
  sku?: string;
  category?: string;
  unit?: string;
  opening_qty?: number;
  opening_cost?: number;
  sell_price?: number;
}): Promise<number> {
  const db = await getDatabase();
  const trimmed = params.name.trim();
  if (!trimmed) throw new Error('Product name is required');

  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM products WHERE name = ? COLLATE NOCASE',
    [trimmed]
  );
  if (duplicate) throw new Error('A product with this name already exists');

  const openingQty = params.opening_qty ?? 0;
  const openingCost = params.opening_cost ?? 0;
  if (!Number.isFinite(openingQty) || openingQty < 0) {
    throw new Error('Opening quantity cannot be negative');
  }
  if (!Number.isFinite(openingCost) || openingCost < 0) {
    throw new Error('Opening cost cannot be negative');
  }
  if (params.sell_price != null && (!Number.isFinite(params.sell_price) || params.sell_price < 0)) {
    throw new Error('Sell price cannot be negative');
  }
  const sellPrice =
    params.sell_price != null && params.sell_price >= 0
      ? roundMoney(params.sell_price)
      : openingCost > 0
        ? mulMoney(openingCost, 1.2)
        : 0;

  let productId = 0;

  await db.withTransactionAsync(async () => {
    const category = await ensureProductCategory(db, params.category);

    const result = await db.runAsync(
      `INSERT INTO products (name, sku, category, unit, opening_qty, opening_cost, avg_cost, sell_price, current_qty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.name,
        params.sku ?? null,
        category,
        params.unit ?? 'pcs',
        openingQty,
        openingCost,
        openingCost,
        sellPrice,
        openingQty,
      ]
    );

    productId = result.lastInsertRowId;

    if (openingQty > 0) {
      await db.runAsync(
        `INSERT INTO inventory_movements (product_id, type, qty, unit_cost, reference_type, notes)
         VALUES (?, 'opening', ?, ?, 'opening', ?)`,
        [productId, openingQty, openingCost, 'Opening stock']
      );
    }
  });

  return productId;
}

export async function updateProduct(
  id: number,
  params: { name: string; sku?: string; category?: string | null; unit?: string; sell_price?: number }
): Promise<void> {
  const db = await getDatabase();
  const trimmed = params.name.trim();
  if (!trimmed) throw new Error('Product name is required');

  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM products WHERE name = ? COLLATE NOCASE AND id != ?',
    [trimmed, id]
  );
  if (duplicate) throw new Error('A product with this name already exists');

  if (params.sell_price != null && (!Number.isFinite(params.sell_price) || params.sell_price < 0)) {
    throw new Error('Sell price cannot be negative');
  }
  const sellPrice = params.sell_price != null ? roundMoney(params.sell_price) : undefined;

  await db.withTransactionAsync(async () => {
    const category = await ensureProductCategory(db, params.category ?? null);
    if (sellPrice != null) {
      await db.runAsync(
        'UPDATE products SET name = ?, sku = ?, category = ?, unit = ?, sell_price = ? WHERE id = ?',
        [trimmed, params.sku ?? null, category, params.unit ?? 'pcs', sellPrice, id]
      );
    } else {
      await db.runAsync(
        'UPDATE products SET name = ?, sku = ?, category = ?, unit = ? WHERE id = ?',
        [trimmed, params.sku ?? null, category, params.unit ?? 'pcs', id]
      );
    }
  });
}

export async function adjustStock(
  productId: number,
  qty: number,
  notes?: string
): Promise<void> {
  if (!Number.isFinite(qty) || qty === 0) {
    throw new Error('Enter a non-zero adjustment quantity');
  }

  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    // Read inside the transaction so a concurrent sale cannot slip between
    // the stock check and the update.
    const product = await db.getFirstAsync<Product>('SELECT * FROM products WHERE id = ?', [
      productId,
    ]);
    if (!product) throw new Error('Product not found');

    const newQty = roundMoney(product.current_qty + qty);
    if (newQty < 0) {
      throw new Error(
        `Cannot reduce stock below zero (current: ${product.current_qty}, adjustment: ${qty})`
      );
    }

    await db.runAsync('UPDATE products SET current_qty = ? WHERE id = ?', [newQty, productId]);
    await db.runAsync(
      `INSERT INTO inventory_movements (product_id, type, qty, unit_cost, reference_type, notes)
       VALUES (?, 'adjustment', ?, ?, 'adjustment', ?)`,
      [productId, qty, product.avg_cost, notes ?? 'Stock adjustment']
    );
  });

}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDatabase();

  const inSales = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM sale_items WHERE product_id = ? LIMIT 1',
    [id]
  );
  if (inSales) throw new Error('Product is used in sales and cannot be deleted');

  const inPurchases = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM purchase_items WHERE product_id = ? LIMIT 1',
    [id]
  );
  if (inPurchases) throw new Error('Product is used in purchases and cannot be deleted');

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM inventory_movements WHERE product_id = ?', [id]);
    await db.runAsync('DELETE FROM products WHERE id = ?', [id]);
  });

}

export async function getInventoryValue(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(current_qty * avg_cost), 0) as total FROM products'
  );
  return roundMoney(row?.total ?? 0);
}
