import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { tapFeedback } from '../audio/feedback'

/** Drag this far down (px) before a swipe counts as a dismiss. */
const DISMISS_DISTANCE = 120
/** Or drag any distance at this speed (px/ms) — a quick flick dismisses too. */
const DISMISS_VELOCITY = 0.5

/** Pure so the dismiss threshold is unit-testable without touching the DOM. */
export function shouldDismissSheet(dragDistance: number, velocityPxPerMs: number): boolean {
  return dragDistance > DISMISS_DISTANCE || (dragDistance > 0 && velocityPxPerMs > DISMISS_VELOCITY)
}

export interface BottomSheetProps {
  title: ReactNode
  onClose: () => void
  children: ReactNode
}

/**
 * Shared bottom-sheet chrome (#27) for the city, save/load, attack-confirm
 * and encounter panels: backdrop, header/close button, and a drag-down
 * gesture on the grab handle to dismiss with a swipe, mirroring native
 * iOS/Android sheet behavior. Centralizing this also means the safe-area
 * padding and touch-target sizing only need to be right in one place.
 */
export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const [dragY, setDragY] = useState(0)
  const dragState = useRef<{ startY: number; startTime: number } | null>(null)

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // Never start the drag gesture from the close button: capturing the pointer
    // retargets the eventual click to this header (the capture element), so the
    // button's onClick would never fire on desktop Chrome (#388).
    if ((e.target as Element).closest('.sheet__close')) return
    dragState.current = { startY: e.clientY, startTime: e.timeStamp }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return
    setDragY(Math.max(0, e.clientY - dragState.current.startY))
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const state = dragState.current
    dragState.current = null
    if (!state) return
    const delta = Math.max(0, e.clientY - state.startY)
    const elapsed = Math.max(1, e.timeStamp - state.startTime)
    setDragY(0)
    if (shouldDismissSheet(delta, delta / elapsed)) {
      tapFeedback()
      onClose()
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sheet__header sheet__drag-handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="sheet__grip" aria-hidden="true" />
          <h2>{title}</h2>
          <button className="sheet__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
