import { toggleFullscreen, useFullscreen } from '../lib/fullscreen'
import { useTranslation } from '../lib/i18n'
import { MENU_ICONS, MenuIcon } from './AtriumMenu'

// The atrium's own icon, its state the app's (lib/fullscreen).
export default function FullscreenButton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  const { t } = useTranslation()
  const full = useFullscreen()
  const label = full ? t('browser.exitFullscreen') : t('atrium.fullscreen')
  return (
    <button type="button" data-fullscreen="" onClick={() => void toggleFullscreen()} title={label} aria-label={label} className={className} style={style}>
      <MenuIcon d={full ? MENU_ICONS.minimize : MENU_ICONS.maximize} size={16} />
    </button>
  )
}
