import type { ResourcePool } from '@aop/shared'

const RESOURCE_LABELS: Record<keyof ResourcePool, string> = {
  gold: 'Gold',
  timber: 'Timber',
  iron: 'Iron',
  rum: 'Rum',
}

/** Compact per-resource readout for the top HUD bar. */
export function ResourceHud({ resources }: { resources: ResourcePool }) {
  return (
    <div className="resource-hud">
      {(Object.keys(RESOURCE_LABELS) as (keyof ResourcePool)[]).map((key) => (
        <span key={key} className="resource-hud__item">
          <span className="resource-hud__label">{RESOURCE_LABELS[key]}</span>
          {resources[key]}
        </span>
      ))}
    </div>
  )
}
