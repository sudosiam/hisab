import {
  __purchaseXmlTestUtils,
  PURCHASE_IMPORT_MAX_CHARS,
  PURCHASE_IMPORT_SAMPLE_XML,
  formatPurchaseImportSummary,
  importPurchasesFromXml,
} from '../purchaseXmlImport';
import type { PurchaseImportResult } from '../purchaseXmlImport';

const { xmlAttr, extractPurchaseBlocks, extractItemBlocks, parsePurchasesXml } =
  __purchaseXmlTestUtils;

describe('purchaseXmlImport helpers', () => {
  it('reads quoted attributes', () => {
    expect(xmlAttr('supplier="Supply Co" date="2026-04-02"', 'supplier')).toBe('Supply Co');
    expect(xmlAttr('unitCost="40.00"', 'unitCost')).toBe('40.00');
    expect(xmlAttr('product="A"', 'missing')).toBe('');
  });

  it('extracts purchase and item blocks from sample', () => {
    const purchases = extractPurchaseBlocks(PURCHASE_IMPORT_SAMPLE_XML);
    expect(purchases).toHaveLength(2);
    expect(xmlAttr(purchases[0].attrs, 'purchaseNo')).toBe('P-1001');
    const items = extractItemBlocks(purchases[0].inner);
    expect(items).toHaveLength(2);
    expect(xmlAttr(items[0], 'product')).toBe('Notebook A5');
  });

  it('parses sample into structured purchases', () => {
    const rows = parsePurchasesXml(PURCHASE_IMPORT_SAMPLE_XML);
    expect(rows).toHaveLength(2);
    expect(rows[0].supplier).toBe('Supply Co');
    expect(rows[0].items).toHaveLength(2);
    expect(rows[0].items[0].unitCostPaise).toBe(4000);
    expect(rows[0].discountPaise).toBe(1000);
    expect(rows[1].purchaseNo).toBe('P-1002');
    expect(rows[1].items[0].product).toBe('A4 Paper');
  });

  it('formats import summary', () => {
    const result: PurchaseImportResult = {
      imported: 2,
      vendorsTouched: 2,
      productsCreated: 3,
      skipped: 1,
      skipReasons: [{ reason: 'Duplicate purchase number', count: 1 }],
      errors: [],
    };
    const text = formatPurchaseImportSummary(result);
    expect(text).toContain('Purchases imported: 2');
    expect(text).toContain('Products created: 3');
    expect(text).toContain('1 Duplicate purchase number');
  });

  it('rejects oversized XML before parsing', async () => {
    const huge = 'x'.repeat(PURCHASE_IMPORT_MAX_CHARS + 1);
    await expect(importPurchasesFromXml(huge)).rejects.toThrow(/too large \(max 10 MB\)/i);
  });
});
