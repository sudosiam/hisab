import type { PartyStatementLine } from '../types';
import { sharePartyStatementPdf, buildPartyStatementHtml } from './partyStatementPdf';

export interface VendorStatementPdfInput {
  vendorName: string;
  vendorPhone?: string | null;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  lines: PartyStatementLine[];
}

export function buildVendorStatementHtml(input: VendorStatementPdfInput): string {
  return buildPartyStatementHtml({
    partyType: 'vendor',
    partyName: input.vendorName,
    partyPhone: input.vendorPhone,
    fromDate: input.fromDate,
    toDate: input.toDate,
    openingBalance: input.openingBalance,
    closingBalance: input.closingBalance,
    lines: input.lines,
  });
}

export async function shareVendorStatementPdf(
  input: VendorStatementPdfInput
): Promise<{ success: boolean; message: string }> {
  return sharePartyStatementPdf({
    partyType: 'vendor',
    partyName: input.vendorName,
    partyPhone: input.vendorPhone,
    fromDate: input.fromDate,
    toDate: input.toDate,
    openingBalance: input.openingBalance,
    closingBalance: input.closingBalance,
    lines: input.lines,
  });
}
