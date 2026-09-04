import { createElement, type ReactElement } from 'react'

/** Legacy raster action art used by untargeted battle/city consumers. */
export const UI_ICON: Partial<
  Record<'attack' | 'endTurn' | 'build' | 'recruit' | 'load' | 'unload' | 'upgradeShip', string>
> = {
  attack: '/art/ui/attack.png',
  endTurn: '/art/ui/end_turn.png',
  build: '/art/ui/build.png',
  recruit: '/art/ui/recruit.png',
  load: '/art/ui/load.png',
  unload: '/art/ui/unload.png',
  upgradeShip: '/art/ui/upgrade.png',
}

/**
 * Match-outcome status icons (#89 item 4 follow-up audit): `GameOverScreen` was the one
 * remaining spot still rendering raw platform emoji (🏆/💀/⚔️) instead of generated art —
 * inconsistent across devices/OSes and the single most visible "status" moment in a match.
 * Same optional-lookup, text-fallback convention as `UI_ICON` above.
 *
 * Only `victory` shipped: `defeat` and `draw` both came back wrapped in an unwanted circular
 * badge frame on the first sd-v1.5 generation (same failure class D-016 documented for
 * DreamShaper, reproduced here for these two subjects specifically), and a second attempt
 * with a strengthened anti-circle negative prompt produced a malformed cutout (defeat) and
 * an unreadable "crossed swords" composition (draw). Per the one-retry-budget precedent
 * (see D-016), these two keep the emoji fallback rather than burning a third attempt.
 */
export const GAME_OVER_ICON: Partial<Record<'victory' | 'defeat' | 'draw', string>> = {
  victory: '/art/ui/victory.png',
}

export type UiIconName =
  | 'attack'
  | 'back'
  | 'city'
  | 'close'
  | 'constructed'
  | 'decrease'
  | 'endTurn'
  | 'fit'
  | 'idle'
  | 'increase'
  | 'more'
  | 'next'
  | 'previous'
  | 'recenterFleet'
  | 'route'
  | 'selected'
  | 'ship'
  | 'zoomIn'
  | 'zoomOut'

type ShapeName = 'circle' | 'line' | 'path' | 'polyline' | 'rect'
type Shape = readonly [ShapeName, Readonly<Record<string, string | number>>]

const outline = { fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const
const round = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/**
 * Project-owned gameplay chrome icons. Each mark shares a 20 px optical box,
 * a 2 px structural stroke, rounded joins, and `currentColor` paint. The
 * geometry is deterministic and contains no text or platform glyphs.
 */
export const UI_ICON_SHAPES: Readonly<Record<UiIconName, readonly Shape[]>> = {
  attack: [
    ['path', { d: 'M4 3l5.5 5.5-2 2L2 5V3h2z', fill: 'currentColor' }],
    ['path', { d: 'M16 3l-5.5 5.5 2 2L18 5V3h-2z', fill: 'currentColor' }],
    ['path', { d: 'M7 10l-3.5 5.5M13 10l3.5 5.5', ...outline, ...round }],
  ],
  back: [['polyline', { points: '12.5 4 6.5 10 12.5 16', ...outline, ...round }]],
  city: [
    ['path', { d: 'M3 17V8l3-2 2 2 2-4 2 4 2-2 3 2v9H3z', fill: 'currentColor' }],
    ['path', { d: 'M10 13v4', ...outline, ...round }],
  ],
  close: [
    ['line', { x1: 5, y1: 5, x2: 15, y2: 15, ...outline, ...round }],
    ['line', { x1: 15, y1: 5, x2: 5, y2: 15, ...outline, ...round }],
  ],
  constructed: [
    ['rect', { x: 3, y: 3, width: 14, height: 14, rx: 3, ...outline }],
    ['polyline', { points: '6.5 10.5 9 13 14 7.5', ...outline, ...round }],
  ],
  decrease: [['line', { x1: 5, y1: 10, x2: 15, y2: 10, ...outline, ...round }]],
  endTurn: [
    ['path', { d: 'M5 5.5A7 7 0 1 1 4 13', ...outline, ...round }],
    ['polyline', { points: '3 4 6.5 5.5 4.5 9', ...outline, ...round }],
  ],
  fit: [['path', { d: 'M8 4H4v4M12 4h4v4M16 12v4h-4M8 16H4v-4', ...outline, ...round }]],
  idle: [
    ['circle', { cx: 10, cy: 10, r: 7, ...outline }],
    ['path', { d: 'M10 6v4l3 2', ...outline, ...round }],
  ],
  increase: [
    ['line', { x1: 10, y1: 5, x2: 10, y2: 15, ...outline, ...round }],
    ['line', { x1: 5, y1: 10, x2: 15, y2: 10, ...outline, ...round }],
  ],
  more: [
    ['circle', { cx: 4, cy: 10, r: 1.5, fill: 'currentColor' }],
    ['circle', { cx: 10, cy: 10, r: 1.5, fill: 'currentColor' }],
    ['circle', { cx: 16, cy: 10, r: 1.5, fill: 'currentColor' }],
  ],
  next: [['polyline', { points: '7.5 4 13.5 10 7.5 16', ...outline, ...round }]],
  previous: [['polyline', { points: '12.5 4 6.5 10 12.5 16', ...outline, ...round }]],
  recenterFleet: [
    ['path', { d: 'M10 2v3M10 15v3M2 10h3M15 10h3', ...outline, ...round }],
    ['path', { d: 'M6 12.5h8l-1.5 2.5h-5L6 12.5z', fill: 'currentColor' }],
    ['path', { d: 'M10 6l3 5H7l3-5z', fill: 'currentColor' }],
  ],
  route: [
    ['circle', { cx: 4, cy: 15, r: 2, ...outline }],
    ['circle', { cx: 16, cy: 5, r: 2, ...outline }],
    ['path', { d: 'M6 14c4 0 3-7 8-8', ...outline, ...round }],
  ],
  selected: [
    ['circle', { cx: 10, cy: 10, r: 7, ...outline }],
    ['circle', { cx: 10, cy: 10, r: 4, ...outline }],
    ['polyline', { points: '7.5 10 9.5 12 13 8', ...outline, ...round }],
  ],
  ship: [
    ['path', { d: 'M3 12l2 5h10l2-5-7 2-7-2z', fill: 'currentColor' }],
    ['path', { d: 'M10 3v10M10 4l5 6h-5M9 5L5 10h4', ...outline, ...round }],
  ],
  zoomIn: [
    ['circle', { cx: 9, cy: 9, r: 5.5, ...outline }],
    ['line', { x1: 13, y1: 13, x2: 17, y2: 17, ...outline, ...round }],
    ['line', { x1: 9, y1: 6.5, x2: 9, y2: 11.5, ...outline, ...round }],
    ['line', { x1: 6.5, y1: 9, x2: 11.5, y2: 9, ...outline, ...round }],
  ],
  zoomOut: [
    ['circle', { cx: 9, cy: 9, r: 5.5, ...outline }],
    ['line', { x1: 13, y1: 13, x2: 17, y2: 17, ...outline, ...round }],
    ['line', { x1: 6.5, y1: 9, x2: 11.5, y2: 9, ...outline, ...round }],
  ],
}

interface UiIconProps {
  name: UiIconName
  size?: number
  className?: string
}

/** Decorative icon only; the containing button supplies the accessible name. */
export function UiIcon({ name, size = 20, className = 'ui-icon' }: UiIconProps): ReactElement {
  return createElement(
    'svg',
    {
      'aria-hidden': true,
      className,
      focusable: 'false',
      height: size,
      viewBox: '0 0 20 20',
      width: size,
      xmlns: 'http://www.w3.org/2000/svg',
    },
    ...UI_ICON_SHAPES[name].map(([element, attributes], index) =>
      createElement(element, { ...attributes, key: index }),
    ),
  )
}
