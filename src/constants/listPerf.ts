/** FlatList tuning for smooth scrolling with large datasets. */
export const FLATLIST_PERF = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 10,
  windowSize: 7,
  removeClippedSubviews: true,
} as const;

/** Approximate card height for list rows (padding + content). */
export const LIST_CARD_HEIGHT = 96;
