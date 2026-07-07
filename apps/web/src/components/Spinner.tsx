/**
 * Small inline loading indicator (#301) — the shared replacement for the
 * bare "Loading…" text that several screens (match browser, leaderboard,
 * spectate, watch-replay) show with nothing else to signal progress.
 * `currentColor`-based (see .spinner in styles.css) so it inherits whatever
 * text/button color it's dropped into without its own palette entry.
 */
export function Spinner({
  label = 'Loading',
  size = '1em',
}: {
  /** Screen-reader text; visually the spinner has no label of its own. */
  label?: string
  size?: string
}) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role="status"
      aria-label={label}
    />
  )
}
