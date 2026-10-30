export function getAvailableProductQuantity(product: {
  inStock?: boolean | null;
  stockQuantity?: number | null;
}): number {
  if (product.inStock === false) return 0;
  return Math.max(0, product.stockQuantity ?? 0);
}

export function getQuantityAfterAdd(
  existingQuantity: number,
  requestedQuantity: number,
  availableQuantity: number,
): number {
  return Math.min(
    Math.max(0, availableQuantity),
    Math.max(0, existingQuantity) + Math.max(0, requestedQuantity),
  );
}