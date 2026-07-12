/** Renders an unknown catch value as a user-facing message (#237). */
export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
