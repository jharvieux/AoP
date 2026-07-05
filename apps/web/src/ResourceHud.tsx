import type { ResourcePool } from '@aop/shared'

const RESOURCE_LABELS: Record<keyof ResourcePool, string> = {
  gold: 'Gold',
  timber: 'Timber',
  iron: 'Iron',
  rum: 'Rum',
}

// Generated art (issue #26/#113); the text label stays for accessibility and
// as a fallback if an icon fails to load.
const RESOURCE_ICON: Record<keyof ResourcePool, string> = {
  gold: '/art/resources/gold.png',
  timber: '/art/resources/timber.png',
  iron: '/art/resources/iron.png',
  rum: '/art/resources/rum.png',
}

/** Compact per-resource readout for the top HUD bar. */
export function ResourceHud({ resources }: { resources: ResourcePool }) {
  return (
    <div className="resource-hud">
      {(Object.keys(RESOURCE_LABELS) as (keyof ResourcePool)[]).map((key) => (
        <span key={key} className="resource-hud__item">
          <img className="resource-hud__icon" src={RESOURCE_ICON[key]} alt="" aria-hidden />
          <span className="resource-hud__label">{RESOURCE_LABELS[key]}</span>
          {resources[key]}
        </span>
      ))}
    </div>
  )
}
