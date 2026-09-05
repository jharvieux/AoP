import { useId, useState } from 'react'

export interface MapAlertItem {
  id: string
  name: string
  message: string
  onResume: () => void
  onCancel: () => void
}

interface MapAlertRegionProps {
  orders: readonly MapAlertItem[]
}

/**
 * Presents every interrupted map order in one bounded card. When several
 * orders halt together, a native selector keeps each order and its actions
 * reachable without growing the overlay into the route-hint region.
 */
export function MapAlertRegion({ orders }: MapAlertRegionProps) {
  const pickerId = useId()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = orders.find((order) => order.id === selectedId) ?? orders[0]

  if (!selected) return null

  const multiple = orders.length > 1
  const regionLabel = `${orders.length} halted ${orders.length === 1 ? 'order' : 'orders'}`

  return (
    <div
      className="map-alert-region map-overlay-region map-overlay-region--alerts"
      data-map-overlay-region="alerts"
      role="region"
      aria-label={regionLabel}
    >
      <div className="sail-interrupt-banner" role="group" aria-label={`${selected.name} actions`}>
        {multiple ? (
          <div className="map-alert-picker">
            <label className="map-alert-count" htmlFor={pickerId}>
              {orders.length} halted
            </label>
            <select
              id={pickerId}
              aria-label="Choose halted order"
              value={selected.id}
              onChange={(event) => setSelectedId(event.currentTarget.value)}
            >
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.message}
                </option>
              ))}
            </select>
            <span className="sr-only" role="status" aria-live="polite">
              {selected.message}
            </span>
          </div>
        ) : (
          <span role="status">{selected.message}</span>
        )}
        <div className="button-group">
          <button
            type="button"
            className="secondary"
            aria-label={`Resume ${selected.name}`}
            onClick={selected.onResume}
          >
            Resume
          </button>
          <button
            type="button"
            className="secondary"
            aria-label={`Cancel ${selected.name}`}
            onClick={selected.onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
