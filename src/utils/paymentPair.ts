export interface PaymentCandidate {
  id: number;
}

/**
 * Resolve a legacy payment row when payment_id was never backfilled.
 * Returns null when no matching transaction exists (orphan payment row).
 */
export function tryPickLegacyPaymentMatch(
  candidates: PaymentCandidate[]
): PaymentCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    throw new Error(
      'Several payments match this entry on the same date and amount. Delete the payment from the invoice screen instead.'
    );
  }
  return candidates[0];
}

/** Resolve a legacy payment row when payment_id was never backfilled. */
export function pickLegacyPaymentMatch(candidates: PaymentCandidate[]): PaymentCandidate {
  const match = tryPickLegacyPaymentMatch(candidates);
  if (!match) {
    throw new Error('Could not find the matching payment row to delete together.');
  }
  return match;
}
