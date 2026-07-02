import { FACTIONS, SHIP_CLASSES, THEME_AUDIO_SLOTS } from '@aop/content'
import { FACTION_IDS, type FactionId } from '@aop/shared'
import { useRef } from 'react'
import { assetKey, type ThemeAsset, type ThemeAssetKind, type ThemePack } from '../theme/types'

interface AssetUploadControlProps {
  kind: ThemeAssetKind
  asset: ThemeAsset | undefined
  onUpload: (file: File) => void
  onClear: () => void
}

function AssetUploadControl({ kind, asset, onUpload, onClear }: AssetUploadControlProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="garrison-row__actions theme-asset-row">
      {asset && kind === 'sprite' && (
        <img src={asset.dataUrl} alt="" className="theme-asset-preview" />
      )}
      {asset && kind === 'audio' && <span className="garrison-row__counts">{asset.fileName}</span>}
      <button onClick={() => inputRef.current?.click()}>
        {asset ? `Replace ${kind}` : `Upload ${kind}`}
      </button>
      {asset && <button onClick={onClear}>Clear</button>}
      <input
        ref={inputRef}
        type="file"
        accept={
          kind === 'sprite' ? 'image/png,image/jpeg,image/webp' : 'audio/mpeg,audio/wav,audio/ogg'
        }
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onUpload(file)
        }}
      />
    </div>
  )
}

interface ThemePackEditorProps {
  pack: ThemePack
  onRename: (name: string) => void
  onFactionName: (id: FactionId, value: string) => void
  onUnitName: (id: string, value: string) => void
  onShipName: (id: string, value: string) => void
  onAssetUpload: (kind: ThemeAssetKind, contentId: string, file: File) => void
  onAssetClear: (kind: ThemeAssetKind, contentId: string) => void
}

/**
 * The rename + sprite/audio-upload form for one theme pack (#64). Every
 * field here is keyed by an @aop/content id and falls back to that content's
 * default name/art when blank — see resolve.ts. Nothing here is sent to
 * @aop/engine.
 */
export function ThemePackEditor({
  pack,
  onRename,
  onFactionName,
  onUnitName,
  onShipName,
  onAssetUpload,
  onAssetClear,
}: ThemePackEditorProps) {
  return (
    <div className="setup-section theme-editor">
      <label className="section-label">Editing: {pack.name}</label>
      <input
        className="text-input"
        value={pack.name}
        onChange={(e) => onRename(e.target.value)}
        placeholder="Pack name"
      />

      <h3>Factions</h3>
      <ul className="building-list">
        {FACTION_IDS.map((id) => (
          <li key={id} className="garrison-row">
            <span className="garrison-row__name">{FACTIONS[id].name}</span>
            <input
              className="text-input"
              placeholder={FACTIONS[id].name}
              value={pack.factionNames[id] ?? ''}
              onChange={(e) => onFactionName(id, e.target.value)}
            />
            <AssetUploadControl
              kind="sprite"
              asset={pack.assets[assetKey('sprite', id)]}
              onUpload={(file) => onAssetUpload('sprite', id, file)}
              onClear={() => onAssetClear('sprite', id)}
            />
          </li>
        ))}
      </ul>

      <h3>Troop Types</h3>
      {FACTION_IDS.map((factionId) => (
        <div key={factionId}>
          <label className="section-label">{FACTIONS[factionId].name}</label>
          <ul className="building-list">
            {FACTIONS[factionId].units.map((unit) => (
              <li key={unit.id} className="garrison-row">
                <span className="garrison-row__name">{unit.name}</span>
                <input
                  className="text-input"
                  placeholder={unit.name}
                  value={pack.unitNames[unit.id] ?? ''}
                  onChange={(e) => onUnitName(unit.id, e.target.value)}
                />
                <AssetUploadControl
                  kind="sprite"
                  asset={pack.assets[assetKey('sprite', unit.id)]}
                  onUpload={(file) => onAssetUpload('sprite', unit.id, file)}
                  onClear={() => onAssetClear('sprite', unit.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h3>Ships</h3>
      <ul className="building-list">
        {SHIP_CLASSES.map((ship) => (
          <li key={ship.id} className="garrison-row">
            <span className="garrison-row__name">{ship.name}</span>
            <input
              className="text-input"
              placeholder={ship.name}
              value={pack.shipNames[ship.id] ?? ''}
              onChange={(e) => onShipName(ship.id, e.target.value)}
            />
            <AssetUploadControl
              kind="sprite"
              asset={pack.assets[assetKey('sprite', ship.id)]}
              onUpload={(file) => onAssetUpload('sprite', ship.id, file)}
              onClear={() => onAssetClear('sprite', ship.id)}
            />
          </li>
        ))}
      </ul>

      <h3>Audio</h3>
      <p className="building-option__hint">
        No in-game audio system exists yet — these slots are stored now so packs authored today keep
        working once playback lands.
      </p>
      <ul className="building-list">
        {THEME_AUDIO_SLOTS.map((slot) => (
          <li key={slot} className="garrison-row">
            <span className="garrison-row__name">{slot}</span>
            <AssetUploadControl
              kind="audio"
              asset={pack.assets[assetKey('audio', slot)]}
              onUpload={(file) => onAssetUpload('audio', slot, file)}
              onClear={() => onAssetClear('audio', slot)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
