import type { ResourcePool } from '@aop/shared'
import type { ReactNode } from 'react'

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
    <div className="resource-hud" role="group" aria-label="Resources">
      {(Object.keys(RESOURCE_LABELS) as (keyof ResourcePool)[]).map((key) => (
        <span
          key={key}
          className="resource-hud__item"
          aria-label={`${RESOURCE_LABELS[key]}: ${resources[key]}`}
        >
          <img className="resource-hud__icon" src={RESOURCE_ICON[key]} alt="" aria-hidden />
          <span className="resource-hud__label">{RESOURCE_LABELS[key]}</span>
          <span className="resource-hud__value">{resources[key]}</span>
        </span>
      ))}
    </div>
  )
}

interface GameplayHudProps {
  status: ReactNode
  resources?: ResourcePool | undefined
}

/** The shared header contract for local and multiplayer gameplay. */
export function GameplayHud({ status, resources }: GameplayHudProps) {
  return (
    <header className="hud gameplay-hud" data-gameplay-chrome="hud">
      <h1>Age of Plunder</h1>
      <span className="turn-info">{status}</span>
      {resources && <ResourceHud resources={resources} />}
    </header>
  )
}
