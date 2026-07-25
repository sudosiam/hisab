/** FlatList tuning for 60fps scrolling with large datasets. */
export const FLATLIST_PERF = {
  initialNumToRender: 10,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 50,
  windowSize: 5,
  removeClippedSubviews: true,
} as const;

/** Approximate compact card height for list rows (padding + 2 lines). */
export const LIST_CARD_HEIGHT = 64;
