import { THEME_ASSET_LIMITS } from '@aop/content'
import type { ThemeAsset, ThemeAssetKind } from './types'

export class ThemeAssetError extends Error {}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new ThemeAssetError('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new ThemeAssetError('Could not decode image'))
    img.src = dataUrl
  })
}

/** Downscale to fit within `maxDimension` (aspect-preserving); a no-op if already smaller. */
async function downscaleImage(
  dataUrl: string,
  mimeType: string,
  maxDimension: number,
): Promise<string> {
  const img = await loadImage(dataUrl)
  if (img.width <= maxDimension && img.height <= maxDimension) return dataUrl

  const scale = maxDimension / Math.max(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ThemeAssetError('Canvas 2D context unavailable')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL(mimeType)
}

function readAudioDurationSec(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => resolve(audio.duration)
    audio.onerror = () => reject(new ThemeAssetError('Could not read audio metadata'))
    audio.src = dataUrl
  })
}

/** Rough byte size of a data URL's base64 payload. */
function dataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.floor((base64.length * 3) / 4)
}

/**
 * Validate and process an uploaded file into a storable {@link ThemeAsset},
 * enforcing @aop/content's THEME_ASSET_LIMITS. Oversized images are
 * downscaled rather than rejected outright; audio is rejected if it's too
 * long or too large (re-encoding audio client-side isn't worth the
 * complexity for a Tier-1 local-only feature). Throws {@link ThemeAssetError}
 * on any cap violation.
 */
export async function processThemeAsset(file: File, kind: ThemeAssetKind): Promise<ThemeAsset> {
  const limits = THEME_ASSET_LIMITS

  if (kind === 'sprite') {
    if (!limits.allowedImageTypes.includes(file.type)) {
      throw new ThemeAssetError(
        `Unsupported image type "${file.type}". Allowed: ${limits.allowedImageTypes.join(', ')}`,
      )
    }
    const raw = await readFileAsDataUrl(file)
    const dataUrl = await downscaleImage(raw, file.type, limits.maxImageDimension)
    if (dataUrlByteLength(dataUrl) > limits.maxImageBytes) {
      throw new ThemeAssetError(
        `Image is still ${dataUrlByteLength(dataUrl)} bytes after downscaling, over the ${limits.maxImageBytes}-byte limit`,
      )
    }
    return { kind, dataUrl, mimeType: file.type, fileName: file.name }
  }

  if (!limits.allowedAudioTypes.includes(file.type)) {
    throw new ThemeAssetError(
      `Unsupported audio type "${file.type}". Allowed: ${limits.allowedAudioTypes.join(', ')}`,
    )
  }
  if (file.size > limits.maxAudioBytes) {
    throw new ThemeAssetError(
      `Audio file is ${file.size} bytes, over the ${limits.maxAudioBytes}-byte limit`,
    )
  }
  const dataUrl = await readFileAsDataUrl(file)
  const duration = await readAudioDurationSec(dataUrl)
  if (duration > limits.maxAudioDurationSec) {
    throw new ThemeAssetError(
      `Audio is ${duration.toFixed(1)}s, over the ${limits.maxAudioDurationSec}s limit`,
    )
  }
  return { kind, dataUrl, mimeType: file.type, fileName: file.name }
}
