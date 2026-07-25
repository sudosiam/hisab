/** FlatList tuning for smooth scrolling with large datasets. */
export const FLATLIST_PERF = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 10,
  windowSize: 7,
  removeClippedSubviews: true,
} as const;

/** Approximate compact card height for list rows (padding + 2 lines). */
export const LIST_CARD_HEIGHT = 64;
