// The interface's own sounds: a short, soft one as something is placed,
// deleted, connected, undone, redone, saved by hand, or a colour is picked.
// Off at first on the web, on in the desktop app (gameStore uiSounds; User
// Preferences > Sound) -- the user's, 2026-11-10.
//
// Made here, not played from files: a note or two each from the browser's
// own oscillators, so there is nothing to download and nothing to licence.
// Only for what this person did by hand: never for what arrives from someone
// else, nor for a save the app makes by itself.

import { useGameStore } from '../store/gameStore'

type Note = {
  // Seconds after the sound starts, and how long it rings.
  at?: number
  long: number
  // Hertz; `to`: where it glides to by its end.
  freq: number
  to?: number
  // Its share of the whole sound's loudness.
  gain?: number
  type?: OscillatorType
}

const SOUNDS = {
  place: [{ freq: 660, to: 880, long: 0.09 }],
  remove: [{ freq: 330, to: 175, long: 0.14, type: 'triangle' }],
  connect: [{ freq: 523, long: 0.08 }, { at: 0.07, freq: 784, long: 0.13 }],
  undo: [{ freq: 520, to: 392, long: 0.08 }],
  redo: [{ freq: 392, to: 520, long: 0.08 }],
  save: [{ freq: 587, long: 0.1 }, { at: 0.09, freq: 880, long: 0.24 }],
  pick: [{ freq: 1175, long: 0.12, gain: 0.7 }],
} satisfies Record<string, Note[]>
export type Sound = keyof typeof SOUNDS

// Quiet: under whatever else is playing.
const LOUDNESS = 0.11
// The same sound again within this is one sound (a batch placed, a key held).
const AGAIN_MS = 60

let context: AudioContext | null = null
const last = new Map<Sound, number>()

/** `sound`, if this person has the interface's sounds on. `anyway`: as the switch is turned on, to hear what it is. */
export function play(sound: Sound, anyway = false) {
  if (!anyway && !useGameStore.getState().uiSounds) return
  const now = performance.now()
  if (now - (last.get(sound) ?? -Infinity) < AGAIN_MS) return
  last.set(sound, now)
  try {
    context ??= new AudioContext()
    // Made before anything was pressed, a browser holds it till something is.
    if (context.state === 'suspended') void context.resume()
    const start = context.currentTime + 0.005
    for (const note of SOUNDS[sound] as Note[]) {
      const from = start + (note.at ?? 0)
      const oscillator = context.createOscillator()
      const level = context.createGain()
      oscillator.type = note.type ?? 'sine'
      oscillator.frequency.setValueAtTime(note.freq, from)
      if (note.to) oscillator.frequency.exponentialRampToValueAtTime(note.to, from + note.long)
      // In at once, without a click; out to nothing by its end.
      level.gain.setValueAtTime(0.0001, from)
      level.gain.exponentialRampToValueAtTime(LOUDNESS * (note.gain ?? 1), from + 0.006)
      level.gain.exponentialRampToValueAtTime(0.0001, from + note.long)
      oscillator.connect(level).connect(context.destination)
      oscillator.start(from)
      oscillator.stop(from + note.long + 0.02)
    }
  } catch {
    // No sound here (no audio device, or not allowed): the action goes on without.
  }
}
