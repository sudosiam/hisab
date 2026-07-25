import { initializeFreshDatabase } from '../../db/database';
import { importTallyXml } from '../tallyXml';
import { getSales } from '../sales';
import { getPurchases } from '../purchases';

function envelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
${body}
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

describe('Tally import FIFO payment allocation without BILLALLOCATIONS', () => {
  beforeEach(async () => {
    await initializeFreshDatabase();
  });

  it('marks sale paid when receipt has no bill allocations but matches party', async () => {
    const xml = envelope(`
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Acme Stores" RESERVEDNAME="">
      <NAME>Acme Stores</NAME>
      <PARENT>Sundry Debtors</PARENT>
      <PRIORSTATENAME>Karnataka</PRIORSTATENAME>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Sales" ACTION="Create">
      <DATE>20260401</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>S-1</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Acme Stores</PARTYLEDGERNAME>
      <ALLINVENTORYENTRIES.LIST>
       <STOCKITEMNAME>Widget</STOCKITEMNAME>
       <BILLEDQTY>1 pcs</BILLEDQTY>
       <RATE>1000/pcs</RATE>
       <AMOUNT>1000.00</AMOUNT>
       <GSTOVRDNTAXRATE>0</GSTOVRDNTAXRATE>
      </ALLINVENTORYENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Receipt" ACTION="Create">
      <DATE>20260405</DATE>
      <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
      <VOUCHERNUMBER>1</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Acme Stores</PARTYLEDGERNAME>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Acme Stores</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
       <AMOUNT>-1000.00</AMOUNT>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Cash</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <AMOUNT>1000.00</AMOUNT>
      </LEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>`);

    const result = await importTallyXml(xml);
    expect(result.errors).toEqual([]);
    expect(result.salesImported).toBe(1);
    expect(result.receiptsImported).toBe(1);

    const sales = await getSales('all');
    expect(sales).toHaveLength(1);
    expect(sales[0].status).toBe('paid');
    expect(sales[0].paid_amount).toBe(1000);
  });

  it('marks purchase paid when payment has no bill allocations but matches vendor', async () => {
    const xml = envelope(`
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="Supply Co" RESERVEDNAME="">
      <NAME>Supply Co</NAME>
      <PARENT>Sundry Creditors</PARENT>
      <PRIORSTATENAME>Karnataka</PRIORSTATENAME>
     </LEDGER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Purchase" ACTION="Create">
      <DATE>20260401</DATE>
      <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
      <VOUCHERNUMBER>P-1</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Supply Co</PARTYLEDGERNAME>
      <ALLINVENTORYENTRIES.LIST>
       <STOCKITEMNAME>Bolt</STOCKITEMNAME>
       <BILLEDQTY>1 pcs</BILLEDQTY>
       <RATE>500/pcs</RATE>
       <AMOUNT>500.00</AMOUNT>
       <GSTOVRDNTAXRATE>0</GSTOVRDNTAXRATE>
      </ALLINVENTORYENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Payment" ACTION="Create">
      <DATE>20260405</DATE>
      <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
      <VOUCHERNUMBER>1</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Supply Co</PARTYLEDGERNAME>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Supply Co</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
       <AMOUNT>500.00</AMOUNT>
      </LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>Cash</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <AMOUNT>-500.00</AMOUNT>
      </LEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>`);

    const result = await importTallyXml(xml);
    expect(result.errors).toEqual([]);
    expect(result.purchasesImported).toBe(1);
    expect(result.paymentsImported).toBe(1);

    const purchases = await getPurchases('all');
    expect(purchases).toHaveLength(1);
    expect(purchases[0].status).toBe('paid');
    expect(purchases[0].paid_amount).toBe(500);
  });
});
