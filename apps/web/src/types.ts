import type { GameConfig } from '@aop/engine'

export interface GameSetupConfig extends Omit<GameConfig, 'seed'> {
  seed: number
}
