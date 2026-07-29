import { initializeFreshDatabase } from '../../db/database';
import { getProducts } from '../inventory';
import { getParties } from '../parties';
import { getPurchaseItems, getPurchases } from '../purchases';
import {
  PURCHASE_IMPORT_SAMPLE_XML,
  importPurchasesFromXml,
} from '../purchaseXmlImport';

describe('Hisab purchase XML sample import', () => {
  beforeEach(async () => {
    await initializeFreshDatabase();
  });

  it('imports two purchases with vendors and products', async () => {
    const result = await importPurchasesFromXml(PURCHASE_IMPORT_SAMPLE_XML);

    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(result.imported).toBe(2);
    expect(result.vendorsTouched).toBe(2);
    expect(result.productsCreated).toBe(3);

    const [parties, products, purchases] = await Promise.all([
      getParties('vendor'),
      getProducts(),
      getPurchases('all'),
    ]);

    expect(parties.some((p) => p.name === 'Supply Co')).toBe(true);
    expect(parties.some((p) => p.name === 'Office Mart')).toBe(true);
    expect(products.some((p) => p.name === 'Notebook A5')).toBe(true);
    expect(products.some((p) => p.name === 'Pen Blue')).toBe(true);
    expect(products.some((p) => p.name === 'A4 Paper')).toBe(true);

    const p1001 = purchases.find((p) => p.invoice_no === 'P-1001');
    expect(p1001).toBeTruthy();
    expect(p1001!.supplier_name).toBe('Supply Co');
    expect(p1001!.vendor_invoice_no).toBe('VIN-55');
    expect(p1001!.discount_amount).toBe(1000);

    const items = await getPurchaseItems(p1001!.id);
    expect(items).toHaveLength(2);

    const again = await importPurchasesFromXml(PURCHASE_IMPORT_SAMPLE_XML);
    expect(again.imported).toBe(0);
    expect(again.skipped).toBe(2);
    expect(again.skipReasons.some((r) => r.reason === 'Duplicate purchase number')).toBe(true);
  });
});
