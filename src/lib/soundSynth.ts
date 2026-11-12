// The interface's sounds, made from oscillators and noise (no files): each a
// few voices, scheduled into any audio context -- the page's (lib/sounds), or
// an offline one to measure them. Free of the app's imports for that.
//
// Serious, a little ominous, and soft -- the user's, 2026-11-11, after a first
// set that was too playful: "a NieR: Automata flare", and "don't make them have
// a lot of twinkles / high pitched sounds". So: D minor (Aeolian), built on
// fifths, fourths and minor thirds, a minor second for a refusal; glass rather
// than bells (a sine with faint overtones, a few cents apart), mostly below
// 1.5 kHz; a dark room they ring in (a reverb, not a bouncing echo); and for
// the reward a low drone swelling under a slow minor arpeggio, an impact under
// it -- an item acquired, not a jackpot. Pitch still says direction: what adds
// or opens rises, what takes away or closes falls.
//
// Levels are set by measuring (scratchpad soundcheck): each sound's loudness
// while it sounds sits in its role's band -- the tool's tick and close under
// the rest, save and reward over them -- and nothing clips.

// D minor, from the low drone up.
const N = {
  D2: 73.42, D3: 146.83, Gs3: 207.65, A3: 220, D4: 293.66, Ds4: 311.13, E4: 329.63, F4: 349.23, A4: 440,
  D5: 587.33, E5: 659.25, F5: 698.46, A5: 880, D6: 1174.66, F6: 1396.91, A6: 1760,
}

export type Voice =
  // A tone: `freq`, gliding to `to` by its end. `fixed`: deaf to `pitch`.
  | { kind: 'tone'; at?: number; long: number; freq: number; to?: number; wave?: OscillatorType; gain?: number; attack?: number; space?: number; fixed?: boolean }
  // Glass: a sine with its octave faint over it, a few cents off, dying first.
  | { kind: 'glass'; at?: number; long: number; freq: number; gain?: number; attack?: number; space?: number }
  // Air: noise through a band that sweeps from `from` to `to` (Hz).
  | { kind: 'air'; at?: number; long: number; from: number; to: number; q?: number; gain?: number; attack?: number; space?: number }
  // A drone: a note and its fifth, each two saws a little apart, dark and slow to swell.
  | { kind: 'drone'; at?: number; long: number; freq: number; gain?: number; attack?: number; space?: number }

export const SOUNDS = {
  // A tool taken up: a tick, there and gone (the first set's tap, kept by the user).
  tool: [
    { kind: 'tone', long: 0.035, freq: N.A6, to: N.F6, gain: 0.7, attack: 0.002 },
    { kind: 'air', long: 0.016, from: 3200, to: 2600, q: 2, gain: 0.4, attack: 0.001 },
  ],
  // A switch on, a switch off: a fourth, up or down, in glass.
  on: [
    { kind: 'glass', long: 0.1, freq: N.A4, gain: 0.38 },
    { kind: 'glass', at: 0.065, long: 0.2, freq: N.D5, gain: 0.38, space: 0.25 },
  ],
  off: [
    { kind: 'glass', long: 0.1, freq: N.D5, gain: 0.38 },
    { kind: 'glass', at: 0.065, long: 0.2, freq: N.A4, gain: 0.36, space: 0.25 },
  ],
  // A menu or panel opening, closing: a soft, low pluck, rising a fourth or
  // falling one -- no air. The first ones, swelling noise, read as a whoosh on
  // every panel (the user, 2026-11-12: "a lot softer and less of a whoosh");
  // kept below, unused, as openSwell and closeSwell.
  open: [{ kind: 'tone', long: 0.075, freq: N.A3, to: N.D4, gain: 0.35, attack: 0.008, space: 0.12 }],
  close: [{ kind: 'tone', long: 0.07, freq: N.D4, to: N.A3, gain: 0.32, attack: 0.008, space: 0.12 }],
  openSwell: [{ kind: 'air', long: 0.26, from: 320, to: 1400, q: 0.7, gain: 0.9, attack: 0.1, space: 0.3 }],
  closeSwell: [{ kind: 'air', long: 0.24, from: 1300, to: 360, q: 0.7, gain: 0.8, attack: 0.05, space: 0.3 }],
  // A trace placed: a low knock, glass softly over it.
  place: [
    { kind: 'tone', long: 0.06, freq: N.A3, to: N.D3, gain: 0.9, attack: 0.002 },
    { kind: 'glass', at: 0.005, long: 0.14, freq: N.D5, gain: 0.39, space: 0.3 },
  ],
  // Taken away: it dissolves -- a breath of air sinking, a tone gliding down a
  // fourth with its octave under it, both left to fade in the room. Smooth and
  // wet like the rest (the user, 2026-11-11: grains of noise, however fine,
  // were dry and sharp, and chirped like an 8-bit game).
  remove: [
    { kind: 'air', long: 0.34, from: 1000, to: 240, q: 0.7, gain: 0.55, attack: 0.04, space: 0.5 },
    // The note in it kept faint, fading in, far back in the room: the breath leads (the user, 2026-11-11).
    { kind: 'tone', long: 0.34, freq: N.D5, to: N.A4, gain: 0.13, attack: 0.05, space: 0.75 },
    { kind: 'tone', long: 0.34, freq: N.D4, to: N.A3, gain: 0.09, attack: 0.05, space: 0.5 },
  ],
  undo: [{ kind: 'tone', long: 0.1, freq: N.A4, to: N.F4, gain: 0.6, space: 0.15 }],
  redo: [{ kind: 'tone', long: 0.1, freq: N.F4, to: N.A4, gain: 0.6, space: 0.15 }],
  // Saved: the fifth, struck in turn (the user's pick, 2026-11-11).
  save: [
    { kind: 'tone', long: 0.08, freq: N.D5, gain: 0.48 },
    { kind: 'tone', at: 0.07, long: 0.14, freq: N.A5, gain: 0.48 },
  ],
  // Refused: a step down, twice, low and soft (the first set's, kept by the user).
  nope: [
    { kind: 'tone', long: 0.08, freq: N.E4, to: N.Ds4, wave: 'triangle', gain: 0.39 },
    { kind: 'tone', at: 0.1, long: 0.13, freq: N.E4, to: N.D4, wave: 'triangle', gain: 0.39 },
  ],
  // Grouped: drawn together with a soft snap; ungrouped: the same, apart.
  group: [
    { kind: 'air', long: 0.03, from: 1400, to: 800, q: 2, gain: 0.6, attack: 0.001 },
    { kind: 'tone', at: 0.008, long: 0.08, freq: N.D4, to: N.A3, gain: 0.6, attack: 0.002 },
    { kind: 'glass', at: 0.015, long: 0.16, freq: N.A4, gain: 0.27, space: 0.2 },
  ],
  ungroup: [
    { kind: 'air', long: 0.035, from: 800, to: 1400, q: 2, gain: 0.55, attack: 0.001 },
    { kind: 'tone', at: 0.008, long: 0.08, freq: N.A3, to: N.D4, gain: 0.55, attack: 0.002 },
  ],
  // An export ready: up through the chord to its root, and still.
  exported: [
    { kind: 'glass', long: 0.25, freq: N.F4, gain: 0.26 },
    { kind: 'glass', at: 0.08, long: 0.3, freq: N.A4, gain: 0.26 },
    { kind: 'glass', at: 0.16, long: 0.8, freq: N.D5, gain: 0.3, space: 0.5 },
  ],
  // Into an atrium, as the entering film gives way to it: the room waking -- air,
  // a drone under it, a fourth rising to the root.
  arrive: [
    { kind: 'air', long: 0.6, from: 200, to: 900, q: 0.6, gain: 0.4, attack: 0.35, space: 0.4 },
    { kind: 'drone', at: 0.1, long: 1.4, freq: N.D3, gain: 0.16, attack: 0.5, space: 0.4 },
    { kind: 'glass', at: 0.35, long: 1.2, freq: N.A4, gain: 0.22, space: 0.6 },
    { kind: 'glass', at: 0.5, long: 1.4, freq: N.D5, gain: 0.22, space: 0.6 },
  ],
  // Someone come into the room: two soft knocks, as on a door.
  join: [
    { kind: 'tone', long: 0.06, freq: 190, to: 150, gain: 0.47, attack: 0.002 },
    { kind: 'air', long: 0.02, from: 900, to: 600, q: 1.5, gain: 0.21, attack: 0.001 },
    { kind: 'tone', at: 0.14, long: 0.07, freq: 175, to: 140, gain: 0.42, attack: 0.002, space: 0.25 },
    { kind: 'air', at: 0.14, long: 0.02, from: 850, to: 560, q: 1.5, gain: 0.19, attack: 0.001 },
  ],
  // A template's reveal (TemplateReveal): the pieces gathering over a drone,
  // then each one landing -- a thud and glass, a step higher every time
  // (played with `pitch`), so the pull builds to the reward.
  charge: [
    { kind: 'air', long: 0.95, from: 180, to: 1200, q: 0.9, gain: 0.4, attack: 0.7, space: 0.4 },
    { kind: 'drone', long: 1.0, freq: N.D3, gain: 0.18, attack: 0.7 },
  ],
  land: [
    { kind: 'tone', long: 0.12, freq: N.D3, to: N.D2, gain: 0.85, attack: 0.002, fixed: true },
    { kind: 'air', long: 0.04, from: 1800, to: 2400, q: 4, gain: 0.35, attack: 0.001 },
    { kind: 'glass', at: 0.01, long: 0.18, freq: N.D4, gain: 0.3, space: 0.35 },
  ],
  // An achievement awarded (AchievementPopup, as each is shown): a seal, not a
  // climb -- air drawn in, an impact, the minor chord struck at once in glass
  // over the drone, and the root answering above it.
  achievement: [
    { kind: 'air', long: 0.5, from: 200, to: 1400, q: 0.7, gain: 0.5, attack: 0.35, space: 0.4 },
    { kind: 'tone', at: 0.38, long: 0.7, freq: N.D2, to: 55, gain: 0.8, attack: 0.005, fixed: true },
    { kind: 'drone', at: 0.35, long: 1.8, freq: N.D3, gain: 0.26, attack: 0.2, space: 0.5 },
    { kind: 'glass', at: 0.4, long: 1.8, freq: N.D4, gain: 0.26, space: 0.6 },
    { kind: 'glass', at: 0.4, long: 1.8, freq: N.F4, gain: 0.24, space: 0.6 },
    { kind: 'glass', at: 0.4, long: 1.8, freq: N.A4, gain: 0.24, space: 0.6 },
    { kind: 'glass', at: 0.62, long: 2.0, freq: N.D5, gain: 0.3, space: 0.7 },
  ],
  // Something acquired: a template made. Air drawn in,
  // an impact low under everything, a drone swelling, and over it the minor
  // chord climbing slowly in glass, coming home to its root, left to ring.
  reward: [
    { kind: 'air', long: 0.42, from: 220, to: 1800, q: 0.7, gain: 0.6, attack: 0.32, space: 0.4 },
    { kind: 'tone', at: 0.32, long: 0.9, freq: N.D2, to: 55, gain: 0.9, attack: 0.005, fixed: true },
    { kind: 'air', at: 0.32, long: 0.3, from: 700, to: 160, q: 0.6, gain: 0.5, attack: 0.002 },
    { kind: 'drone', at: 0.28, long: 2.2, freq: N.D3, gain: 0.32, attack: 0.3, space: 0.5 },
    { kind: 'glass', at: 0.36, long: 1.3, freq: N.A4, gain: 0.32, space: 0.6 },
    { kind: 'glass', at: 0.48, long: 1.3, freq: N.D5, gain: 0.32, space: 0.6 },
    { kind: 'glass', at: 0.6, long: 1.4, freq: N.F5, gain: 0.32, space: 0.6 },
    { kind: 'glass', at: 0.72, long: 1.0, freq: N.A5, gain: 0.3, space: 0.65 },
    // The end a statement, not a question (the user, 2026-11-11: it ended on the
    // ninth, below the note before it, and asked): down a fifth to the root.
    { kind: 'glass', at: 0.9, long: 2.2, freq: N.D5, gain: 0.34, space: 0.7 },
    { kind: 'glass', at: 0.9, long: 2.2, freq: N.D4, gain: 0.26, space: 0.6 },
  ],
} satisfies Record<string, Voice[]>
export type Sound = keyof typeof SOUNDS
export const SOUND_NAMES = Object.keys(SOUNDS) as Sound[]

/** The minor pentatonic's `n`th step up (0, 3, 5, 7, 10, 12... semitones), as a ratio: for `pitch`.
 *  A climb goes from 0 to CLIMB_STEPS at most -- one octave: past it, it grows shrill. */
export const CLIMB_STEPS = 5
export const stepUp = (n: number) => 2 ** ([0, 3, 5, 7, 10][n % 5] / 12 + Math.floor(n / 5))

// One second of noise for each context, made once -- the same noise every time, and when measured.
const noises = new WeakMap<BaseAudioContext, AudioBuffer>()
function noiseOf(context: BaseAudioContext) {
  let buffer = noises.get(context)
  if (!buffer) {
    buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const data = buffer.getChannelData(0)
    let seed = 7
    for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = (seed / 2147483647) * 2 - 1 }
    noises.set(context, buffer)
  }
  return buffer
}

/** The way out every sound goes: a little headroom, the top taken off (soft, never
 *  shrill), and a compressor so a sound over another can't clip. */
export function outputOf(context: BaseAudioContext, loudness: number): AudioNode {
  const level = context.createGain()
  level.gain.value = loudness
  const soft = context.createBiquadFilter()
  soft.type = 'lowpass'
  soft.frequency.value = 6000
  soft.Q.value = 0.5
  const limit = context.createDynamicsCompressor()
  limit.threshold.value = -10
  limit.knee.value = 6
  limit.ratio.value = 8
  limit.attack.value = 0.002
  limit.release.value = 0.12
  level.connect(soft).connect(limit).connect(context.destination)
  return level
}

// The dark room the sounds ring in: a reverb from a made impulse -- noise dying
// away over two seconds, its highs going first -- one for each way out.
const rooms = new WeakMap<AudioNode, ConvolverNode>()
function roomOf(context: BaseAudioContext, out: AudioNode): ConvolverNode {
  let room = rooms.get(out)
  if (!room) {
    const long = Math.round(context.sampleRate * 2.2)
    const impulse = context.createBuffer(2, long, context.sampleRate)
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel)
      let seed = 11 + channel * 6007, held = 0
      for (let i = 0; i < long; i++) {
        seed = (seed * 16807) % 2147483647
        const t = i / context.sampleRate
        // Smoothed more as it dies: the tail darker than the start.
        const smooth = Math.min(0.94, 0.35 + t * 0.4)
        held = held * smooth + ((seed / 2147483647) * 2 - 1) * (1 - smooth)
        data[i] = held * Math.exp(-t * 2.6)
      }
    }
    room = context.createConvolver()
    room.buffer = impulse
    room.connect(out)
    rooms.set(out, room)
  }
  return room
}

// An envelope: in over `attack`, out to nothing by `long`.
function shape(param: AudioParam, from: number, attack: number, long: number, peak: number) {
  param.setValueAtTime(0.0001, from)
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), from + Math.min(attack, long * 0.6))
  param.exponentialRampToValueAtTime(0.0001, from + long)
}

function oscillator(context: BaseAudioContext, type: OscillatorType, freq: number, from: number, until: number, into: AudioNode, cents = 0) {
  const osc = context.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, from)
  osc.detune.value = cents
  osc.connect(into)
  osc.start(from)
  osc.stop(until)
  return osc
}

/** `sound`, scheduled to start at `start` (the context's time) into `out`, every pitch times `pitch`. Its length, in seconds. */
export function schedule(context: BaseAudioContext, out: AudioNode, sound: Sound, start: number, pitch = 1): number {
  const voices = SOUNDS[sound] as Voice[]
  const end = Math.max(...voices.map(v => (v.at ?? 0) + v.long))
  const room = voices.some(v => v.space) ? roomOf(context, out) : null
  for (const voice of voices) {
    const from = start + (voice.at ?? 0)
    const until = from + voice.long + 0.03
    const level = context.createGain()
    level.connect(out)
    if (voice.space && room) {
      const send = context.createGain()
      send.gain.value = voice.space
      level.connect(send).connect(room)
    }
    if (voice.kind === 'air') {
      const noise = context.createBufferSource()
      noise.buffer = noiseOf(context)
      const band = context.createBiquadFilter()
      band.type = 'bandpass'
      band.Q.value = voice.q ?? 1
      band.frequency.setValueAtTime(voice.from * pitch, from)
      band.frequency.exponentialRampToValueAtTime(voice.to * pitch, from + voice.long)
      shape(level.gain, from, voice.attack ?? 0.005, voice.long, voice.gain ?? 0.5)
      noise.connect(band).connect(level)
      noise.start(from)
      noise.stop(until)
      continue
    }
    if (voice.kind === 'drone') {
      // Dark: through a low lowpass, opening a little as it swells.
      const dark = context.createBiquadFilter()
      dark.type = 'lowpass'
      dark.Q.value = 0.6
      dark.frequency.setValueAtTime(300, from)
      dark.frequency.linearRampToValueAtTime(800, from + Math.min(voice.long * 0.6, (voice.attack ?? 0.5) + 0.3))
      dark.connect(level)
      for (const [ratio, cents] of [[1, -7], [1, 7], [1.5, -5], [1.5, 5], [0.5, 0]] as const) oscillator(context, 'sawtooth', voice.freq * pitch * ratio, from, until, dark, cents)
      shape(level.gain, from, voice.attack ?? 0.5, voice.long, voice.gain ?? 0.3)
      continue
    }
    if (voice.kind === 'glass') {
      const freq = voice.freq * pitch
      // The octave over it, faint, a few cents off, and gone first.
      const octave = context.createGain()
      shape(octave.gain, from, 0.004, voice.long * 0.5, 0.22)
      octave.connect(level)
      oscillator(context, 'sine', freq, from, until, level)
      oscillator(context, 'sine', freq * 2, from, until, octave, 4)
      shape(level.gain, from, voice.attack ?? 0.006, voice.long, voice.gain ?? 0.4)
      continue
    }
    const turn = voice.fixed ? 1 : pitch
    const tone = oscillator(context, voice.wave ?? 'sine', voice.freq * turn, from, until, level)
    if (voice.to) tone.frequency.exponentialRampToValueAtTime(voice.to * turn, from + voice.long)
    shape(level.gain, from, voice.attack ?? 0.006, voice.long, voice.gain ?? 0.5)
  }
  return end + (room ? 2.2 : 0)
}
