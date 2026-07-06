#!/usr/bin/env node
// Post-processing step for MusicGen output (#253): re-encodes each WAV master under
// public/audio/music/ to OGG (Opus — Chrome/Firefox/Edge) and M4A (AAC — Safari, which
// has no native Ogg/Opus decoder) at a fraction of the size. The loader
// (apps/web/src/audio/musicClips.ts) picks between them at playback time via
// HTMLAudioElement.canPlayType. Run this after generate_game_music.py and before
// committing — see docs/runbooks/music-sfx-generation.md.
//
// Requires ffmpeg on PATH (`brew install ffmpeg`). Not an npm dependency: this is a
// one-off authoring-time tool, not code that ships or runs in CI.

import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MUSIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'music')
const TRACKS = ['menu_theme', 'exploration_ambient', 'battle_theme']

function assertFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  } catch {
    throw new Error('ffmpeg not found on PATH. Install it first: brew install ffmpeg')
  }
}

function encodeOne(name) {
  const wav = join(MUSIC_DIR, `${name}.wav`)
  if (!existsSync(wav)) {
    console.warn(`skip ${name}: ${wav} not found`)
    return
  }
  const ogg = join(MUSIC_DIR, `${name}.ogg`)
  const m4a = join(MUSIC_DIR, `${name}.m4a`)

  execFileSync('ffmpeg', ['-y', '-i', wav, '-c:a', 'libopus', '-b:a', '64k', ogg], {
    stdio: 'inherit',
  })
  execFileSync(
    'ffmpeg',
    ['-y', '-i', wav, '-c:a', 'aac', '-b:a', '72k', '-movflags', '+faststart', m4a],
    { stdio: 'inherit' },
  )

  const wavKb = (statSync(wav).size / 1024).toFixed(0)
  const oggKb = (statSync(ogg).size / 1024).toFixed(0)
  const m4aKb = (statSync(m4a).size / 1024).toFixed(0)
  console.log(`${name}: wav ${wavKb} KB -> ogg ${oggKb} KB, m4a ${m4aKb} KB`)
}

assertFfmpeg()
for (const track of TRACKS) encodeOne(track)
