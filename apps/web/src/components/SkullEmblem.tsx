/**
 * Skull-and-crossbones emblem for the title screen, as a real vector asset per
 * the design handoff (docs/design_handoff_start_screen) — the prototype's
 * layered-div construction was explicitly a stand-in. Palette comes from the
 * Weathered Parchment tokens (--skull-bone / --skull-socket) with the
 * handoff's hex values as fallbacks. Composition per handoff: roughly square,
 * crossbones behind/below, skull occupying the upper two thirds.
 */
export function SkullEmblem({ className }: { className?: string }) {
  const bone = 'var(--skull-bone, #ece0c0)'
  const socket = 'var(--skull-socket, #1a1006)'
  return (
    <svg className={className} viewBox="0 0 120 118" aria-hidden="true" focusable="false">
      <g transform="rotate(45 60 68)">
        <rect x="8" y="61" width="104" height="14" rx="7" fill={bone} />
        <circle cx="10" cy="59" r="8" fill={bone} />
        <circle cx="10" cy="77" r="8" fill={bone} />
        <circle cx="110" cy="59" r="8" fill={bone} />
        <circle cx="110" cy="77" r="8" fill={bone} />
      </g>
      <g transform="rotate(-45 60 68)">
        <rect x="8" y="61" width="104" height="14" rx="7" fill={bone} />
        <circle cx="10" cy="59" r="8" fill={bone} />
        <circle cx="10" cy="77" r="8" fill={bone} />
        <circle cx="110" cy="59" r="8" fill={bone} />
        <circle cx="110" cy="77" r="8" fill={bone} />
      </g>
      {/* Cranium: full-round dome flattening into cheekbones. */}
      <path
        d="M60 4
           C 34 4 18 22 18 44
           C 18 56 24 64 32 68
           L 32 74 C 32 78 36 80 40 80
           L 80 80 C 84 80 88 78 88 74
           L 88 68
           C 96 64 102 56 102 44
           C 102 22 86 4 60 4 Z"
        fill={bone}
      />
      {/* Jaw with teeth notches. */}
      <path d="M40 80 L 80 80 L 80 92 C 80 98 74 102 60 102 C 46 102 40 98 40 92 Z" fill={bone} />
      <g fill={socket}>
        <ellipse cx="45" cy="49" rx="10" ry="12" transform="rotate(8 45 49)" />
        <ellipse cx="75" cy="49" rx="10" ry="12" transform="rotate(-8 75 49)" />
        <path d="M60 60 L 53 73 L 67 73 Z" />
        <rect x="48" y="84" width="2.5" height="14" rx="1.2" />
        <rect x="55" y="85" width="2.5" height="16" rx="1.2" />
        <rect x="62" y="85" width="2.5" height="16" rx="1.2" />
        <rect x="69" y="84" width="2.5" height="14" rx="1.2" />
      </g>
    </svg>
  )
}
