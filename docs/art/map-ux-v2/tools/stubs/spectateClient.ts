import { multiplayerCollisionView } from '../fixtureData'

export class SpectateError extends Error {
  code?: string
}

export class SpectateClient {
  async getPlayerView() {
    return {
      seq: 7,
      seat: 0,
      role: 'player' as const,
      view: multiplayerCollisionView(),
      turnDeadline: null,
    }
  }
}
