import { roundMoney } from './money';

export interface TransferLegLike {
  id: number;
  account_id: number;
  amount: number;
  date: string;
  type: string;
  reference_type: string | null;
  reference_id: number | null;
}

export function isLinkedTransferLeg(leg: TransferLegLike): boolean {
  return leg.type === 'transfer' && leg.reference_type === 'transfer' && leg.reference_id != null;
}

/** Opposite signed amount on the other transfer leg. */
export function oppositeTransferAmount(amount: number): number {
  return roundMoney(-amount);
}

/**
 * Resolve the matching opposite leg for a legacy transfer that predates
 * reference_id linking. Throws when zero or multiple candidates match.
 */
export function pickLegacyTransferPair(
  leg: TransferLegLike,
  candidates: TransferLegLike[]
): TransferLegLike {
  const targetAmount = oppositeTransferAmount(leg.amount);
  const matched = candidates.filter(
    (candidate) =>
      candidate.id !== leg.id &&
      candidate.type === 'transfer' &&
      !isLinkedTransferLeg(candidate) &&
      candidate.date === leg.date &&
      roundMoney(candidate.amount) === targetAmount &&
      candidate.account_id !== leg.account_id
  );

  if (matched.length === 0) {
    throw new Error('Could not find the matching transfer leg to delete together.');
  }
  if (matched.length > 1) {
    throw new Error(
      'Several transfers match this entry on the same date and amount. Delete the transfer from Banking or contact support.'
    );
  }
  return matched[0];
}
