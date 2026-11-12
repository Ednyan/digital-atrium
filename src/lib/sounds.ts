// The interface's sounds, all over the site: Home, Profile, the atrium.
// Off at first on the web, on in the desktop app (gameStore uiSounds) -- one
// setting, switched in the Profile page's settings or the atrium's User
// Preferences > Sound -- the user's, 2026-11-10/11. What they are, and why
// they sound as they do: lib/soundSynth.
//
// Some come by themselves (installInterfaceSounds): a switch's own on and off,
// a menu or panel opening and closing, and a faint click as the pointer comes
// onto something pressable. A plain button's press is silent: a sound for
// every press grows tiresome (the user, 2026-11-11). The rest are played where
// the thing happens -- placed, removed, undone, redone, saved by hand, a tool
// taken up, a template made, an achievement shown (AchievementPopup), a refusal. Only for what this person did -- never for
// what arrives from someone else, nor for a save the app makes by itself -- with one exception: a
// knock when someone comes into the room (hooks/usePresence).

import { useGameStore } from '../store/gameStore'
import { outputOf, schedule, type Sound } from './soundSynth'

export type { Sound } from './soundSynth'

// Quiet: under whatever else is playing.
const LOUDNESS = 0.16
// The same sound again within this is one sound (a batch placed, a key held).
const AGAIN_MS = 60

let context: AudioContext | null = null
let out: AudioNode | null = null
const last = new Map<string, number>()
// When the last sound was played: a tap waits to see whether its press played one of its own.
let lastPlayedAt = -Infinity

/** `sound`, if this person has the interface's sounds on. `anyway`: as the switch is
 *  turned on, to hear what it is. `pitch`: every note times it (soundSynth stepUp). */
export function play(sound: Sound, { anyway = false, pitch = 1 }: { anyway?: boolean; pitch?: number } = {}) {
  if (!anyway && !useGameStore.getState().uiSounds) return
  const now = performance.now()
  const key = `${sound} ${pitch}`
  if (now - (last.get(key) ?? -Infinity) < AGAIN_MS) return
  last.set(key, now)
  lastPlayedAt = now
  try {
    context ??= new AudioContext()
    out ??= outputOf(context, LOUDNESS)
    // Made before anything was pressed, a browser holds it till something is.
    if (context.state === 'suspended') void context.resume()
    schedule(context, out, sound, context.currentTime + 0.005, pitch)
  } catch {
    // No sound here (no audio device, or not allowed): the action goes on without.
  }
}

// What a press may be: a button, a link, a tab, a switch, a menu's item.
const PRESSABLE = 'button, [role="button"], [role="menuitem"], [role="switch"], [role="tab"], [role="option"], a[href], input[type="checkbox"], summary'
const isOn = (el: Element) => (el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true')

let installed = false
/** The sounds that come by themselves, everywhere: once, as this is first loaded (below). */
function installInterfaceSounds() {
  if (installed || typeof window === 'undefined') return
  installed = true
  // After the press has done what it does (a moment later, its handlers run and
  // React has drawn what changed): a switch says on or off, what opened or
  // closed says so -- unless it played a sound of its own. Anything else, nothing.
  window.addEventListener('click', event => {
    const el = (event.target as Element | null)?.closest?.(PRESSABLE)
    if (!el || el.closest('[data-sound="none"]') || (el as HTMLButtonElement).disabled) return
    const pressedAt = performance.now()
    const expanded = el.getAttribute('aria-expanded')
    window.setTimeout(() => {
      if (lastPlayedAt >= pressedAt) return
      if (el.matches('[role="switch"], input[type="checkbox"]')) return play(isOn(el) ? 'on' : 'off')
      const now = el.getAttribute('aria-expanded')
      if (now !== null && now !== expanded) play(now === 'true' ? 'open' : 'close')
    }, 0)
  }, true)
  // Pointing at something that can be pressed: a click, barely there, so it
  // feels pressable (the user, 2026-11-12). Once as the pointer comes onto it,
  // not again till it has left; a mouse's only (a finger points by pressing),
  // never while a button is held (a drag passing over).
  let pointedAt: Element | null = null
  window.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || event.buttons) return
    const el = (event.target as Element | null)?.closest?.(PRESSABLE) ?? null
    if (el === pointedAt) return
    // Something else passing under the pointer -- a label sliding out of the
    // button -- isn't leaving it: only going outside it is.
    if (!el && pointedAt) {
      const box = pointedAt.getBoundingClientRect()
      if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) return
    }
    pointedAt = el
    if (!el || el.closest('[data-sound="none"]') || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return
    play('hover')
  }, true)
  // A right-click that opened a menu.
  window.addEventListener('contextmenu', () => {
    const pressedAt = performance.now()
    window.setTimeout(() => { if (lastPlayedAt < pressedAt && document.querySelector('.ctx-menu')) play('open') }, 40)
  }, true)
}

// Every screen that makes a sound loads this, Home and Profile among them: from then on, everywhere.
installInterfaceSounds()
