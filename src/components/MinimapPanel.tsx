// The minimap's ways, under its button in the view bar (as OverlayPanel is under
// the overlay's): on or off; always shown, or while the view moves; brought up
// by pointing at its corner; a click on it taking the view there, or nothing.

import { useTranslation } from '../lib/i18n'
import { useGamePick } from '../store/gameStore'
import { Switch } from './Customization'

export default function MinimapPanel() {
  const { t } = useTranslation()
  const { showMinimap, setShowMinimap, minimapPrefs, setMinimapPrefs } = useGamePick('showMinimap', 'setShowMinimap', 'minimapPrefs', 'setMinimapPrefs')
  return (
    <div
      data-minimap-panel=""
      data-hud="true"
      className="panel-in w-72 p-3 space-y-3 border border-nier-border/40 font-mono pointer-events-auto"
      style={{ backgroundColor: 'rgb(var(--c-ground) / 0.97)' }}
    >
      <Switch testId="minimap-show" label={t('atrium.minimap.show')} hint={t('atrium.minimap.showHint')} on={showMinimap} onChange={setShowMinimap} />
      <div className={`space-y-3 pl-3 border-l border-nier-border/40 transition-opacity ${showMinimap ? '' : 'opacity-50'}`}>
        <Switch testId="minimap-always" label={t('atrium.minimap.always')} hint={t('atrium.minimap.alwaysHint')} on={minimapPrefs.always} onChange={always => setMinimapPrefs({ always })} />
        <Switch testId="minimap-peek" label={t('atrium.minimap.peek')} hint={t('atrium.minimap.peekHint')} on={minimapPrefs.peek} onChange={peek => setMinimapPrefs({ peek })} />
        <Switch testId="minimap-interactive" label={t('atrium.minimap.interactive')} hint={t('atrium.minimap.interactiveHint')} on={minimapPrefs.interactive} onChange={interactive => setMinimapPrefs({ interactive })} />
      </div>
    </div>
  )
}
