/**
 * Content-shaped loading placeholder (#301) — for list rows/cards that are
 * still fetching, instead of an empty screen until data lands. `aria-hidden`
 * since it carries no information itself; pair it with a `role="status"`
 * announcement (or Spinner) elsewhere for screen readers.
 */
export function Skeleton({
  width = '100%',
  height = '1em',
  className,
}: {
  width?: string
  height?: string
  className?: string
}) {
  return (
    <span
      className={['skeleton', className].filter(Boolean).join(' ')}
      style={{ display: 'block', width, height }}
      aria-hidden="true"
    />
  )
}
