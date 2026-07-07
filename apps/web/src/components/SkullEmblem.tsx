/**
 * Skull-and-crossbones emblem for the title screen, illustrated as a vector asset
 * per the design handoff (docs/design_handoff_start_screen). Palette from the
 * Weathered Parchment tokens (--skull-bone / --skull-socket) with handoff hex values
 * as fallbacks. Composition: roughly square, crossbones behind/below, skull occupying
 * the upper two thirds, with shading/depth cues for an illustrated appearance.
 */
export function SkullEmblem({ className }: { className?: string }) {
  const bone = 'var(--skull-bone, #ece0c0)'
  const socket = 'var(--skull-socket, #1a1006)'
  const boneShade = '#d4c89c' // Darker bone for shading/depth
  const socketLight = '#4a3d2c' // Lighter socket for inner detail

  return (
    <svg className={className} viewBox="0 0 140 136" aria-hidden="true" focusable="false">
      <defs>
        <filter id="skull-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
          <feOffset dx="1" dy="2" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.3" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Crossbones: two rotated rectangular shapes with rounded knuckle ends, behind/below skull */}
      <g opacity="0.9">
        <g transform="rotate(45 70 80)">
          <rect x="10" y="72" width="120" height="16" rx="8" fill={boneShade} />
          <circle cx="12" cy="80" r="9" fill={boneShade} />
          <circle cx="128" cy="80" r="9" fill={boneShade} />
          {/* Highlight on upper knuckles */}
          <ellipse cx="12" cy="76" rx="5" ry="3" fill={bone} opacity="0.6" />
          <ellipse cx="128" cy="76" rx="5" ry="3" fill={bone} opacity="0.6" />
        </g>
        <g transform="rotate(-45 70 80)">
          <rect x="10" y="72" width="120" height="16" rx="8" fill={boneShade} />
          <circle cx="12" cy="80" r="9" fill={boneShade} />
          <circle cx="128" cy="80" r="9" fill={boneShade} />
          {/* Highlight on upper knuckles */}
          <ellipse cx="12" cy="76" rx="5" ry="3" fill={bone} opacity="0.6" />
          <ellipse cx="128" cy="76" rx="5" ry="3" fill={bone} opacity="0.6" />
        </g>
      </g>

      {/* Cranium: rounded dome with shading */}
      <g filter="url(#skull-shadow)">
        <path
          d="M 70 8 C 38 8 18 30 18 56 C 18 72 26 82 38 86 L 38 94 C 38 100 44 104 48 104 L 92 104 C 96 104 102 100 102 94 L 102 86 C 114 82 122 72 122 56 C 122 30 102 8 70 8 Z"
          fill={bone}
        />
        {/* Cranium shading for depth */}
        <path
          d="M 70 8 C 102 8 122 30 122 56 C 122 72 114 82 102 86 C 110 80 116 70 116 56 C 116 34 100 16 70 16 Z"
          fill={boneShade}
          opacity="0.4"
        />
      </g>

      {/* Eye sockets: large, hollow, angled inward */}
      <g fill={socket}>
        {/* Left eye socket */}
        <ellipse cx="52" cy="56" rx="13" ry="16" transform="rotate(12 52 56)" />
        <ellipse
          cx="52"
          cy="56"
          rx="8"
          ry="10"
          transform="rotate(12 52 56)"
          fill={socketLight}
          opacity="0.5"
        />

        {/* Right eye socket */}
        <ellipse cx="88" cy="56" rx="13" ry="16" transform="rotate(-12 88 56)" />
        <ellipse
          cx="88"
          cy="56"
          rx="8"
          ry="10"
          transform="rotate(-12 88 56)"
          fill={socketLight}
          opacity="0.5"
        />
      </g>

      {/* Nasal cavity: triangular opening */}
      <path d="M 70 70 L 65 78 L 75 78 Z" fill={socket} />

      {/* Jaw: separate element with texture lines for teeth definition */}
      <g>
        <path
          d="M 48 104 L 92 104 L 92 118 C 92 126 84 132 70 132 C 56 132 48 126 48 118 Z"
          fill={bone}
        />
        {/* Jaw shading */}
        <path
          d="M 92 104 L 92 118 C 92 126 84 132 70 132 C 84 132 92 126 92 118 Z"
          fill={boneShade}
          opacity="0.3"
        />
        {/* Teeth notches (vertical lines for separation) */}
        <line x1="58" y1="104" x2="58" y2="114" stroke={socket} strokeWidth="1.5" opacity="0.4" />
        <line x1="66" y1="104" x2="66" y2="116" stroke={socket} strokeWidth="1.5" opacity="0.4" />
        <line x1="74" y1="104" x2="74" y2="116" stroke={socket} strokeWidth="1.5" opacity="0.4" />
        <line x1="82" y1="104" x2="82" y2="114" stroke={socket} strokeWidth="1.5" opacity="0.4" />
      </g>

      {/* Subtle highlight on cranium for dimension */}
      <ellipse cx="70" cy="26" rx="18" ry="12" fill={bone} opacity="0.3" />
    </svg>
  )
}
