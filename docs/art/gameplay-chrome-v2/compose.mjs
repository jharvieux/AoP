/**
 * Deterministic design-checkpoint compositor for issue #610.
 *
 * It embeds approved Direction B review sources as non-runtime backdrops, then draws every
 * chrome primitive and icon below as authored SVG geometry.  It never emits production UI
 * assets and it intentionally uses no generated raster art.
 *
 * Usage: node compose.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const out = join(here, 'mockups')
const art = join(root, 'commercial-visual-v2', 'sources')
mkdirSync(out, { recursive: true })

const C = {
  ink: '#21150d',
  wood: '#2d1b10',
  wood2: '#3a2416',
  brass: '#c8962c',
  brassHi: '#f0cb66',
  parchment: '#f3e5c2',
  parchment2: '#cbb17a',
  muted: '#b9a47b',
  sea: '#1b4a6b',
  rust: '#7a2e1a',
  danger: '#a6402f',
  success: '#477447',
  disabled: '#796f61',
  focus: '#f6db83',
}

function b64(name) {
  return `data:image/webp;base64,${readFileSync(join(art, name)).toString('base64')}`
}
const map = b64('b-gilded-harbor-diorama-map-r1.webp')
const city = b64('b-gilded-harbor-diorama-full-r3.webp')

function esc(v) {
  return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
}
function text(x, y, value, size = 14, opts = {}) {
  const {
    fill = C.parchment,
    weight = 600,
    anchor = 'start',
    family = 'Cabin, Trebuchet MS, sans-serif',
    caps = false,
    opacity = 1,
    tabular = false,
  } = opts
  return `<text x="${x}" y="${y}" fill="${fill}" opacity="${opacity}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}"${tabular ? ' style="font-variant-numeric:tabular-nums"' : ''}${caps ? ' letter-spacing=".8"' : ''}>${esc(value)}</text>`
}
function title(x, y, value, size = 28, anchor = 'start') {
  return text(x, y, value, size, {
    family: 'Pirata One, Georgia, serif',
    weight: 700,
    anchor,
    fill: C.parchment,
  })
}
function panel(x, y, w, h, opts = {}) {
  const {
    fill = C.wood,
    opacity = 0.94,
    radius = 10,
    stroke = C.brass,
    strokeOpacity = 0.86,
    inset = true,
  } = opts
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-width="1.5"/>${inset ? `<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="${Math.max(3, radius - 4)}" fill="none" stroke="#f3e5c2" stroke-opacity=".13"/>` : ''}`
}
function grain(x, y, w, h, opacity = 0.08) {
  return `<path d="M ${x + 12} ${y + 12} C ${x + w * 0.26} ${y + 8}, ${x + w * 0.55} ${y + 17}, ${x + w - 12} ${y + 10} M ${x + 12} ${y + h - 12} C ${x + w * 0.3} ${y + h - 18}, ${x + w * 0.7} ${y + h - 7}, ${x + w - 12} ${y + h - 14}" fill="none" stroke="#f3e5c2" stroke-opacity="${opacity}" stroke-width="1"/>`
}
function icon(name, x, y, size = 20, color = C.parchment) {
  const s = size / 20
  const wrap = (body) =>
    `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g>`
  if (name === 'ship')
    return wrap(
      '<path d="M3 13h14l-3 4H6z" fill="currentColor" stroke="none"/><path d="M10 3v10M10 4l4 5H10"/>',
    )
  if (name === 'city')
    return wrap(
      '<path d="M3 17h14v-7l-3-3-2 2-3-4-6 5z" fill="currentColor" stroke="none"/><path d="M7 17v-4h2v4M12 17v-5h2v5" stroke="#2d1b10"/>',
    )
  if (name === 'route') return wrap('<path d="M3 16c4-7 7 1 14-11"/><path d="M14 5h3v3"/>')
  if (name === 'zoomIn')
    return wrap('<circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4M9 6v6M6 9h6"/>')
  if (name === 'zoomOut') return wrap('<circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4M6 9h6"/>')
  if (name === 'fit') return wrap('<path d="M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4"/>')
  if (name === 'close') return wrap('<path d="M5 5l10 10M15 5L5 15"/>')
  if (name === 'check') return wrap('<path d="M4 10l4 4 8-9"/>')
  if (name === 'back') return wrap('<path d="M12 4L5 10l7 6M6 10h10"/>')
  if (name === 'next') return wrap('<path d="M8 4l7 6-7 6M14 10H4"/>')
  if (name === 'gold')
    return wrap(
      '<circle cx="10" cy="10" r="7" fill="currentColor" stroke="none"/><path d="M10 5v10M7 8h5a2 2 0 0 1 0 4H8" stroke="#2d1b10"/>',
    )
  return wrap('<circle cx="10" cy="10" r="7"/>')
}
function button(x, y, w, label, iconName, state = 'default') {
  const style = {
    default: { fill: C.wood2, stroke: C.brass, fg: C.parchment },
    hover: { fill: '#51331d', stroke: C.brassHi, fg: '#fff1ca' },
    pressed: { fill: '#21150d', stroke: C.brassHi, fg: C.parchment },
    selected: { fill: '#51331d', stroke: C.brassHi, fg: C.parchment },
    disabled: { fill: '#33291f', stroke: C.disabled, fg: '#b4aa9a' },
    focus: { fill: C.wood2, stroke: C.focus, fg: C.parchment },
  }[state]
  const outer =
    state === 'selected'
      ? `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="50" rx="11" fill="none" stroke="${C.brassHi}" stroke-opacity=".38" stroke-width="1.5"/>`
      : ''
  const focus =
    state === 'focus'
      ? `<rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="52" rx="12" fill="none" stroke="${C.focus}" stroke-width="2"/>`
      : ''
  const disabledMark =
    state === 'disabled'
      ? `<path d="M${x + 10} ${y + 10}l${w - 20} 24" stroke="#b4aa9a" stroke-opacity=".65" stroke-width="2" stroke-linecap="round"/>`
      : ''
  return `${outer}${focus}<rect x="${x}" y="${y}" width="${w}" height="44" rx="8" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.5"/>${icon(iconName, x + 12, y + 12, 20, style.fg)}${text(x + 40, y + 28, label, 13, { fill: style.fg, weight: 700 })}${disabledMark}`
}
function svg(w, h, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Age of Plunder gameplay chrome design checkpoint">\n<style>text { dominant-baseline: alphabetic; } .label { font-variant-numeric: tabular-nums; }</style>${body}</svg>\n`
}

function phone() {
  const W = 375,
    H = 812
  const backdrop = `<image href="${map}" x="0" y="0" width="375" height="812" preserveAspectRatio="xMidYMid slice"/>`
  const top = `${panel(8, 10, 359, 79, { radius: 12 })}${grain(8, 10, 359, 79)}${title(21, 38, 'Age of Plunder', 22)}${text(22, 59, 'ROUND 12 · YOUR TURN', 10, { fill: C.brassHi, caps: true, weight: 700 })}`
  const resources = [
    ['gold', '2,480'],
    ['city', '46'],
    ['ship', '22'],
  ]
    .map(
      (r, i) =>
        `${icon(r[0], 218 + i * 50, 23, 18, i === 0 ? C.brassHi : C.parchment2)}${text(242 + i * 50, 38, r[1], 12, { tabular: true, weight: 700 })}`,
    )
    .join('')
  const course = `${panel(22, 104, 331, 42, { fill: '#172939', opacity: 0.92, stroke: C.brass, radius: 21 })}${icon('route', 36, 115, 18, C.brassHi)}${text(61, 130, 'Course ready · Tap to sail', 13, { weight: 700 })}`
  const fleet = `<circle cx="190" cy="415" r="30" fill="none" stroke="${C.brassHi}" stroke-width="2"/><circle cx="190" cy="415" r="37" fill="none" stroke="${C.brass}" stroke-opacity=".5" stroke-width="1.5"/>${icon('ship', 180, 405, 20, C.brassHi)}${panel(130, 452, 121, 30, { fill: C.ink, opacity: 0.92, radius: 15 })}${text(190, 472, 'Venture · 5 / 8', 12, { anchor: 'middle', tabular: true })}`
  const nav = `${panel(316, 162, 46, 148, { radius: 12 })}${button(317, 164, 44, '', 'zoomIn')}${button(317, 215, 44, '', 'zoomOut')}${button(317, 266, 44, '', 'fit')}`
  const mini = `${panel(248, 560, 111, 102, { radius: 12 })}<rect x="260" y="574" width="86" height="74" rx="4" fill="#1b4a6b" stroke="#cbb17a" stroke-opacity=".45"/><path d="M267 622l23-31 31 9 17 31-44 8z" fill="#4a7c3f" stroke="#f3e5c2" stroke-opacity=".7"/><rect x="283" y="603" width="42" height="26" fill="none" stroke="${C.parchment}" stroke-width="1.5"/>${text(303, 681, 'MINIMAP', 9, { anchor: 'middle', caps: true, fill: C.muted })}`
  const dock = `${panel(8, 704, 359, 98, { radius: 12 })}${button(17, 724, 78, 'Fleet', 'ship', 'selected')}${button(103, 724, 78, 'City', 'city')}${button(189, 724, 82, 'Course', 'route')}${button(279, 724, 79, 'End turn', 'check')}${text(188, 788, 'Safe area + 12 px', 9, { anchor: 'middle', fill: C.muted })}`
  const safe = `<path d="M12 5h351" stroke="${C.focus}" stroke-opacity=".35" stroke-width="1" stroke-dasharray="4 4"/><path d="M12 807h351" stroke="${C.focus}" stroke-opacity=".35" stroke-width="1" stroke-dasharray="4 4"/>`
  return svg(
    W,
    H,
    `<rect width="375" height="812" fill="#0b1a26"/>${backdrop}<rect width="375" height="812" fill="#07121a" fill-opacity=".07"/>${safe}${top}${resources}${course}${fleet}${nav}${mini}${dock}`,
  )
}

function desktopCity() {
  const W = 1440,
    H = 900
  const backdrop = `<image href="${city}" x="0" y="0" width="1054" height="900" preserveAspectRatio="xMidYMid slice"/>`
  const top = `${panel(16, 14, 1408, 68, { radius: 12 })}${title(38, 51, 'Port Providence', 31)}${text(39, 69, 'PIRATE FREE PORT · PROSPEROUS', 11, { fill: C.brassHi, caps: true, weight: 700 })}${text(1264, 53, 'Round 12 · Your turn', 14, { fill: C.parchment2, anchor: 'end', tabular: true })}${button(1284, 26, 117, 'End turn', 'check')}`
  const frame = `<rect x="22" y="96" width="1012" height="662" rx="10" fill="none" stroke="${C.brass}" stroke-width="2"/><rect x="28" y="102" width="1000" height="650" rx="7" fill="none" stroke="#f3e5c2" stroke-opacity=".24"/>`
  const select = `<ellipse cx="373" cy="496" rx="74" ry="28" fill="none" stroke="${C.brassHi}" stroke-width="3"/><ellipse cx="373" cy="496" rx="83" ry="34" fill="none" stroke="${C.brass}" stroke-opacity=".55" stroke-width="2"/>${panel(306, 529, 137, 30, { fill: C.ink, opacity: 0.94, radius: 15 })}${icon('city', 316, 534, 19, C.brassHi)}${text(343, 549, 'SHIPWRIGHT', 11, { weight: 700, caps: true })}`
  const inspector = `${panel(1055, 96, 369, 662, { radius: 12 })}${grain(1055, 96, 369, 662, 0.1)}${text(1081, 129, 'SELECTED BUILDING', 11, { fill: C.brassHi, caps: true, weight: 700 })}${title(1081, 170, "Shipwright's Yard", 30)}${text(1081, 198, 'Shipyard · Fleet', 13, { fill: C.muted, caps: true, weight: 700 })}<path d="M1081 220h316" stroke="${C.parchment2}" stroke-opacity=".38"/>${text(1081, 250, 'Refit vessels and commission', 16, { weight: 400 })}${text(1081, 274, 'a seaworthy hull for the next passage.', 16, { weight: 400 })}${text(1081, 320, 'VESSELS IN BERTH', 11, { fill: C.brassHi, caps: true, weight: 700 })}${icon('ship', 1083, 338, 28, C.brassHi)}${text(1124, 357, 'Swift Gull', 17, { weight: 700 })}${text(1124, 378, 'Sloop · Ready', 13, { fill: C.muted })}${panel(1080, 411, 318, 96, { fill: '#21150d', opacity: 0.72, stroke: '#725838' })}${text(1100, 442, 'Commission a sloop', 15, { weight: 700 })}${icon('gold', 1300, 428, 20, C.brassHi)}${text(1380, 443, '1,200', 16, { anchor: 'end', fill: C.brassHi, weight: 700, tabular: true })}${text(1380, 465, 'gold', 12, { anchor: 'end', fill: C.muted })}${button(1080, 650, 318, 'Commission', 'check', 'selected')}${text(1081, 724, '44 px target · selected two-ring · focus is external', 10, { fill: C.muted })}`
  const bottom = `${panel(22, 778, 1402, 105, { radius: 12 })}${button(43, 805, 118, 'Previous', 'back')}${text(208, 830, '14 buildings', 14, { weight: 700, tabular: true })}${text(380, 830, '2 ships in port', 14, { weight: 700, tabular: true })}${text(565, 830, 'Garrison: Anne Vane', 14, { weight: 700 })}${button(1212, 805, 170, 'Next city', 'next')}${text(723, 862, 'Parchment accent = gameplay gold · art stays visually dominant', 11, { anchor: 'middle', fill: C.muted })}`
  return svg(
    W,
    H,
    `<rect width="1440" height="900" fill="#0b1a26"/>${backdrop}<rect width="1034" height="900" fill="#0b1a26" fill-opacity=".08"/>${top}${frame}${select}${inspector}${bottom}`,
  )
}

function sheet() {
  const W = 1440,
    H = 960
  const tokens = [
    ['Canvas', C.ink],
    ['Panel', C.wood],
    ['Raised', C.wood2],
    ['Inset', '#21150d'],
    ['Parchment', C.parchment],
    ['Gameplay gold', C.brass],
    ['Focus', C.focus],
    ['Danger', C.danger],
    ['Success', C.success],
  ]
    .map((t, i) => {
      const x = 38 + (i % 3) * 174,
        y = 157 + Math.floor(i / 3) * 86
      return `<rect x="${x}" y="${y}" width="148" height="56" rx="8" fill="${t[1]}" stroke="#f3e5c2" stroke-opacity=".25"/>${text(x, y + 75, t[0], 12, { fill: C.muted })}`
    })
    .join('')
  const types = `${title(607, 180, 'Harbor Authority', 30)}${text(607, 212, 'Pirata One · display / city / section title', 13, { fill: C.muted })}${text(607, 259, 'Resource labels, instructions and actions', 16, { weight: 400 })}${text(607, 283, 'Cabin · body / label / button', 13, { fill: C.muted })}${text(607, 331, '2,480   14 / 20   01:43', 23, { weight: 700, tabular: true, fill: C.brassHi })}${text(607, 355, 'Cabin tabular numerals · resources / movement / timers', 13, { fill: C.muted })}`
  const icons = [
    'ship',
    'city',
    'route',
    'zoomIn',
    'zoomOut',
    'fit',
    'back',
    'next',
    'close',
    'check',
  ]
    .map((n, i) => {
      const x = 50 + i * 55
      return `<rect x="${x}" y="474" width="44" height="44" rx="8" fill="${C.wood2}" stroke="${C.brass}"/>${icon(n, x + 12, 486, 20, C.parchment)}${text(x + 22, 544, n, 10, { anchor: 'middle', fill: C.muted })}`
    })
    .join('')
  const stateNames = ['default', 'hover', 'pressed', 'selected', 'disabled', 'focus']
  const states = stateNames
    .map(
      (s, i) =>
        `${button(598 + i * 132, 470, 120, 'Course', 'route', s)}${text(658 + i * 132, 544, s, 11, { anchor: 'middle', fill: C.muted, caps: true })}`,
    )
    .join('')
  const rules = [
    [
      'Surface',
      'Parchment is the warm readable surface. Wood is the quiet frame. No gold panel fields.',
    ],
    [
      'Action',
      'One token: --color-action = #c8962c. Brass is selected/focus punctuation, never a second action color.',
    ],
    [
      'Targets',
      'Every direct manipulation target is at least 44 × 44 CSS px. Safe-area padding attaches to HUD, dock and sheets.',
    ],
    [
      'States',
      'Hover brightens; pressed deepens; selected gets two rings; focus is an external 2 px outline; disabled adds slash + lower contrast.',
    ],
    [
      'Parity',
      'GameScreen and MatchScreen share tokens, icon buttons, HUD order, notices, dock hierarchy and accessible labels; actions remain unchanged.',
    ],
  ]
    .map((r, i) => {
      const y = 620 + i * 59
      return `${text(48, y, r[0], 14, { fill: C.brassHi, weight: 700 })}${text(202, y, r[1], 14, { fill: C.parchment, weight: 400 })}<path d="M48 ${y + 17}h1342" stroke="#cbb17a" stroke-opacity=".2"/>`
    })
    .join('')
  return svg(
    W,
    H,
    `<rect width="1440" height="960" fill="#17100a"/><rect x="18" y="18" width="1404" height="924" rx="16" fill="#2d1b10" stroke="${C.brass}" stroke-width="2"/>${grain(18, 18, 1404, 924, 0.08)}${title(48, 79, 'Gameplay chrome v2', 38)}${text(50, 106, 'ISSUE #610 · OPERATOR DESIGN CHECKPOINT · DIRECTION B COMPANION', 13, { fill: C.brassHi, caps: true, weight: 700 })}<path d="M48 126h1342" stroke="#cbb17a" stroke-opacity=".35"/>${text(48, 140, 'Semantic color vocabulary', 14, { fill: C.parchment2, weight: 700 })}${tokens}${text(607, 136, 'Type hierarchy & numerical rhythm', 14, { fill: C.parchment2, weight: 700 })}${types}${text(48, 445, 'Authored vector icon family · 20 px optical box', 14, { fill: C.parchment2, weight: 700 })}${icons}${text(598, 445, 'Interaction states · every button is 44 px tall', 14, { fill: C.parchment2, weight: 700 })}${states}${rules}`,
  )
}

writeFileSync(join(out, 'phone-world-map-375x812.svg'), phone())
writeFileSync(join(out, 'city-inspector-desktop-1440x900.svg'), desktopCity())
writeFileSync(join(out, 'token-type-icon-sheet-1440x960.svg'), sheet())
console.log('wrote deterministic SVG mockups')
