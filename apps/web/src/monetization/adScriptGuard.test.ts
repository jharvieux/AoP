import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimScriptInjection,
  hasScriptFailed,
  markScriptFailed,
  resetAdScriptGuard,
} from './adScriptGuard'

const SCRIPT_URL = 'https://ads.example.com/loader.js'
const OTHER_SCRIPT_URL = 'https://ads.example.com/other.js'

beforeEach(() => {
  resetAdScriptGuard()
})

describe('claimScriptInjection', () => {
  it('#246: claims a script url once, then refuses every later remount', () => {
    expect(claimScriptInjection(SCRIPT_URL)).toBe(true)
    // Simulates GameScreen mounting/unmounting <AdSlot/> once per AI turn.
    expect(claimScriptInjection(SCRIPT_URL)).toBe(false)
    expect(claimScriptInjection(SCRIPT_URL)).toBe(false)
  })

  it('tracks each script url independently', () => {
    expect(claimScriptInjection(SCRIPT_URL)).toBe(true)
    expect(claimScriptInjection(OTHER_SCRIPT_URL)).toBe(true)
  })
})

describe('failed script tracking', () => {
  it('is not failed until markScriptFailed is called', () => {
    expect(hasScriptFailed(SCRIPT_URL)).toBe(false)
  })

  it('stays failed across every later mount, so no remount retries it', () => {
    markScriptFailed(SCRIPT_URL)
    expect(hasScriptFailed(SCRIPT_URL)).toBe(true)
    expect(hasScriptFailed(SCRIPT_URL)).toBe(true)
  })
})
