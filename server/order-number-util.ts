/**
 * Shared order number generator used by the checkout routes.
 * Extracted here so tests can import and exercise the real implementation.
 */
export function generateOrderNumber(): string {
  return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}
