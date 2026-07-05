import { getDatabase } from '../db/database';
import { triggerAutoBackup } from './backup';
import type { InventoryMovement, Product } from '../types';

/** Default sale unit price: stored sell price, or cost + 20% markup. */
export function getProductSellPrice(product: Pick<Product, 'sell_price' | 'avg_cost'>): number {
  if (product.sell_price > 0) return product.sell_price;
  if (product.avg_cost > 0) return Number((product.avg_cost * 1.2).toFixed(2));
  return 0;
}

export async function getProducts(): Promise<Product[]> {
  const db = await getDatabase();
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
  unit?: string;
  opening_qty?: number;
  opening_cost?: number;
  sell_price?: number;
}): Promise<number> {
  const db = await getDatabase();
  const openingQty = params.opening_qty ?? 0;
  const openingCost = params.opening_cost ?? 0;
  const sellPrice =
    params.sell_price != null && params.sell_price >= 0
      ? params.sell_price
      : openingCost > 0
        ? Number((openingCost * 1.2).toFixed(2))
        : 0;

  let productId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO products (name, sku, unit, opening_qty, opening_cost, avg_cost, sell_price, current_qty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.name,
        params.sku ?? null,
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

  await triggerAutoBackup();
  return productId;
}

export async function updateProduct(
  id: number,
  params: { name: string; sku?: string; unit?: string; sell_price?: number }
): Promise<void> {
  const db = await getDatabase();
  const sellPrice = params.sell_price != null ? Math.max(0, params.sell_price) : undefined;
  if (sellPrice != null) {
    await db.runAsync(
      'UPDATE products SET name = ?, sku = ?, unit = ?, sell_price = ? WHERE id = ?',
      [params.name, params.sku ?? null, params.unit ?? 'pcs', sellPrice, id]
    );
  } else {
    await db.runAsync('UPDATE products SET name = ?, sku = ?, unit = ? WHERE id = ?', [
      params.name,
      params.sku ?? null,
      params.unit ?? 'pcs',
      id,
    ]);
  }
  await triggerAutoBackup();
}

export async function adjustStock(
  productId: number,
  qty: number,
  notes?: string
): Promise<void> {
  const db = await getDatabase();
  const product = await getProductById(productId);
  if (!product) throw new Error('Product not found');

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE products SET current_qty = current_qty + ? WHERE id = ?', [
      qty,
      productId,
    ]);
    await db.runAsync(
      `INSERT INTO inventory_movements (product_id, type, qty, unit_cost, reference_type, notes)
       VALUES (?, 'adjustment', ?, ?, 'adjustment', ?)`,
      [productId, qty, product.avg_cost, notes ?? 'Stock adjustment']
    );
  });

  await triggerAutoBackup();
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

  await triggerAutoBackup();
}

export async function getInventoryValue(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(current_qty * avg_cost), 0) as total FROM products'
  );
  return row?.total ?? 0;
}
