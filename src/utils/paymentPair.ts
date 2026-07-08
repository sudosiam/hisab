export interface PaymentCandidate {
  id: number;
}

/** Resolve a legacy payment row when payment_id was never backfilled. */
export function pickLegacyPaymentMatch(candidates: PaymentCandidate[]): PaymentCandidate {
  if (candidates.length === 0) {
    throw new Error('Could not find the matching payment row to delete together.');
  }
  if (candidates.length > 1) {
    throw new Error(
      'Several payments match this entry on the same date and amount. Delete the payment from the invoice screen instead.'
    );
  }
  return candidates[0];
}
