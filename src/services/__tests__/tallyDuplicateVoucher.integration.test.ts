import { initializeFreshDatabase } from '../../db/database';
import { importTallyXml } from '../tallyXml';
import { getSales } from '../sales';
import { getPurchases } from '../purchases';
import { getPaymentVouchers } from '../paymentVouchers';

function envelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <BODY>
  <IMPORTDATA>
   <REQUESTDATA>
${body}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
}

function ledger(name: string, parent: 'Sundry Debtors' | 'Sundry Creditors'): string {
  return `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="${name}" RESERVEDNAME="">
      <NAME>${name}</NAME>
      <PARENT>${parent}</PARENT>
     </LEDGER>
    </TALLYMESSAGE>`;
}

function stockSaleOrPurchase(
  vchType: 'Sales' | 'Bill of Supply' | 'Purchase',
  number: string,
  date: string,
  party: string,
  itemName: string
): string {
  return `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="${vchType}" ACTION="Create">
      <DATE>${date}</DATE>
      <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${number}</VOUCHERNUMBER>
      <PARTYLEDGERNAME>${party}</PARTYLEDGERNAME>
      <ALLINVENTORYENTRIES.LIST>
       <STOCKITEMNAME>${itemName}</STOCKITEMNAME>
       <ACTUALQTY>1 pcs</ACTUALQTY>
       <BILLEDQTY>1 pcs</BILLEDQTY>
       <RATE>100/pcs</RATE>
       <AMOUNT>100.00</AMOUNT>
       <GSTOVRDNTAXRATE>0</GSTOVRDNTAXRATE>
      </ALLINVENTORYENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>`;
}

function receiptOrPayment(
  vchType: 'Receipt' | 'Payment',
  number: string,
  date: string,
  party: string,
  amount: number
): string {
  const partyPositive = vchType === 'Payment' ? 'No' : 'Yes';
  const partyAmount = vchType === 'Payment' ? amount.toFixed(2) : (-amount).toFixed(2);
  const cashPositive = vchType === 'Payment' ? 'Yes' : 'No';
  const cashAmount = vchType === 'Payment' ? (-amount).toFixed(2) : amount.toFixed(2);
  return `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="${vchType}" ACTION="Create">
      <DATE>${date}</DATE>
      <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${number}</VOUCHERNUMBER>
      <PARTYLEDGERNAME>${party}</PARTYLEDGERNAME>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>${party}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>${partyPositive}</ISDEEMEDPOSITIVE>
       <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
       <AMOUNT>${partyAmount}</AMOUNT>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Cash</LEDGERNAME>
       <ISDEEMEDPOSITIVE>${cashPositive}</ISDEEMEDPOSITIVE>
       <AMOUNT>${cashAmount}</AMOUNT>
      </LEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>`;
}

describe('Tally import duplicate detection scoped by voucher type', () => {
  beforeEach(async () => {
    await initializeFreshDatabase();
  });

  it('imports Receipt #1 and Payment #1 with the same number (and even same date) as separate vouchers', async () => {
    const xml = envelope(
      [
        ledger('Acme Stores', 'Sundry Debtors'),
        ledger('Supply Co', 'Sundry Creditors'),
        receiptOrPayment('Receipt', '1', '20260402', 'Acme Stores', 500),
        receiptOrPayment('Payment', '1', '20260406', 'Supply Co', 300),
        // Same number + same date across types must still both import
        receiptOrPayment('Receipt', '2', '20260410', 'Acme Stores', 100),
        receiptOrPayment('Payment', '2', '20260410', 'Supply Co', 100),
      ].join('\n')
    );

    const result = await importTallyXml(xml);

    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(result.receiptsImported).toBe(2);
    expect(result.paymentsImported).toBe(2);

    const [receipts, payments] = await Promise.all([
      getPaymentVouchers({ voucherType: 'receipt' }),
      getPaymentVouchers({ voucherType: 'payment' }),
    ]);
    expect(receipts.map((r) => r.voucher_no).sort()).toEqual(['1', '2']);
    expect(payments.map((p) => p.voucher_no).sort()).toEqual(['1', '2']);
  });

  it('imports Sales / BOS / Purchase / Receipt / Payment all numbered "1" independently', async () => {
    const xml = envelope(
      [
        ledger('Acme Stores', 'Sundry Debtors'),
        ledger('Supply Co', 'Sundry Creditors'),
        stockSaleOrPurchase('Sales', '1', '20260401', 'Acme Stores', 'Widget A'),
        stockSaleOrPurchase('Bill of Supply', '1', '20260401', 'Acme Stores', 'Widget B'),
        stockSaleOrPurchase('Purchase', '1', '20260401', 'Supply Co', 'Widget C'),
        receiptOrPayment('Receipt', '1', '20260401', 'Acme Stores', 50),
        receiptOrPayment('Payment', '1', '20260401', 'Supply Co', 50),
      ].join('\n')
    );

    const result = await importTallyXml(xml);

    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(result.salesImported).toBe(2);
    expect(result.purchasesImported).toBe(1);
    expect(result.receiptsImported).toBe(1);
    expect(result.paymentsImported).toBe(1);

    const [sales, purchases, receipts, payments] = await Promise.all([
      getSales('all'),
      getPurchases('all'),
      getPaymentVouchers({ voucherType: 'receipt' }),
      getPaymentVouchers({ voucherType: 'payment' }),
    ]);
    expect(sales.filter((s) => s.invoice_no === '1')).toHaveLength(2);
    expect(purchases.filter((p) => p.invoice_no === '1')).toHaveLength(1);
    expect(receipts.filter((r) => r.voucher_no === '1')).toHaveLength(1);
    expect(payments.filter((p) => p.voucher_no === '1')).toHaveLength(1);
  });

  it('still flags same-type same number+date as duplicates', async () => {
    const xml = envelope(
      [
        ledger('Acme Stores', 'Sundry Debtors'),
        ledger('Supply Co', 'Sundry Creditors'),
        receiptOrPayment('Receipt', '1', '20260402', 'Acme Stores', 500),
        receiptOrPayment('Receipt', '1', '20260402', 'Acme Stores', 200),
        receiptOrPayment('Payment', '9', '20260406', 'Supply Co', 300),
        receiptOrPayment('Payment', '9', '20260406', 'Supply Co', 150),
        stockSaleOrPurchase('Purchase', '900', '20260403', 'Supply Co', 'Bolt'),
        stockSaleOrPurchase('Purchase', '900', '20260403', 'Supply Co', 'Nut'),
      ].join('\n')
    );

    const result = await importTallyXml(xml);

    expect(result.receiptsImported).toBe(1);
    expect(result.paymentsImported).toBe(1);
    expect(result.purchasesImported).toBe(1);
    expect(result.skipReasons).toEqual(
      expect.arrayContaining([
        { reason: 'Receipts: duplicate voucher number', count: 1 },
        { reason: 'Payments: duplicate voucher number', count: 1 },
        { reason: 'Purchases: duplicate voucher number', count: 1 },
      ])
    );
  });

  it('re-importing the same file skips true duplicates on the second pass', async () => {
    const xml = envelope(
      [
        ledger('Acme Stores', 'Sundry Debtors'),
        ledger('Supply Co', 'Sundry Creditors'),
        stockSaleOrPurchase('Sales', '1', '20260401', 'Acme Stores', 'Notebook'),
        stockSaleOrPurchase('Purchase', '1', '20260401', 'Supply Co', 'Paper'),
        receiptOrPayment('Receipt', '1', '20260402', 'Acme Stores', 500),
        receiptOrPayment('Payment', '1', '20260406', 'Supply Co', 300),
      ].join('\n')
    );

    const first = await importTallyXml(xml);
    expect(first.errors).toEqual([]);
    expect(first.skipped).toBe(0);
    expect(first.salesImported).toBe(1);
    expect(first.purchasesImported).toBe(1);
    expect(first.receiptsImported).toBe(1);
    expect(first.paymentsImported).toBe(1);

    const second = await importTallyXml(xml);
    expect(second.salesImported).toBe(0);
    expect(second.purchasesImported).toBe(0);
    expect(second.receiptsImported).toBe(0);
    expect(second.paymentsImported).toBe(0);
    expect(second.skipReasons).toEqual(
      expect.arrayContaining([
        { reason: 'Sales: duplicate voucher number', count: 1 },
        { reason: 'Purchases: duplicate voucher number', count: 1 },
        { reason: 'Receipts: duplicate voucher number', count: 1 },
        { reason: 'Payments: duplicate voucher number', count: 1 },
      ])
    );

    const [sales, purchases, receipts, payments] = await Promise.all([
      getSales('all'),
      getPurchases('all'),
      getPaymentVouchers({ voucherType: 'receipt' }),
      getPaymentVouchers({ voucherType: 'payment' }),
    ]);
    expect(sales).toHaveLength(1);
    expect(purchases).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(payments).toHaveLength(1);
  });

  it('does not treat Purchase #1 as a duplicate of Receipt/Payment/Sales #1 (cross-type purchase skip regression)', async () => {
    // Mirrors the earlier "2 Purchases: duplicate voucher number" suspicion:
    // shared numbers across types must not suppress purchases.
    const xml = envelope(
      [
        ledger('Acme Stores', 'Sundry Debtors'),
        ledger('Rockcell Power Private Limited', 'Sundry Creditors'),
        stockSaleOrPurchase('Sales', '900', '20260401', 'Acme Stores', 'Cell A'),
        receiptOrPayment('Receipt', '900', '20260402', 'Acme Stores', 100),
        receiptOrPayment('Payment', '900', '20260403', 'Rockcell Power Private Limited', 100),
        stockSaleOrPurchase('Purchase', '900', '20260404', 'Rockcell Power Private Limited', 'Cell B'),
        stockSaleOrPurchase('Purchase', '902', '20260405', 'Rockcell Power Private Limited', 'Cell C'),
      ].join('\n')
    );

    const result = await importTallyXml(xml);

    expect(result.errors).toEqual([]);
    expect(result.purchasesImported).toBe(2);
    expect(result.salesImported).toBe(1);
    expect(result.receiptsImported).toBe(1);
    expect(result.paymentsImported).toBe(1);
    expect(
      result.skipReasons.find((s) => s.reason === 'Purchases: duplicate voucher number')
    ).toBeUndefined();

    const purchases = await getPurchases('all');
    expect(purchases.map((p) => p.invoice_no).sort()).toEqual(['900', '902']);
  });
});
