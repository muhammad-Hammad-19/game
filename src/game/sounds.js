import hitUrl from './assets/bat-hit.wav'
import wicketUrl from './assets/wicket.wav'
import crowdUrl from './assets/crowd.wav'

const buffers = new Map()
let context
let loading
let master
let crowd

// Decode on load even when browser policy keeps playback suspended.
export function prepareAudio() {
  if (loading) return loading
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext
  if (!Offline) return Promise.resolve()
  loading = (async () => {
    const decoder = new Offline(1, 1, 22050)
    await Promise.all(Object.entries({ hit: hitUrl, wicket: wicketUrl, crowd: crowdUrl }).map(async ([name, url]) => {
      const response = await fetch(url)
      if (!response.ok) return
      const buffer = await decoder.decodeAudioData(await response.arrayBuffer())
      buffers.set(name, buffer)
    }))
  })().catch(() => {})
  return loading
}

// Call during the trusted gesture so Safari can unlock the output immediately.
export function unlockAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext
  if (!Audio || context?.state === 'running') return
  try {
    context ||= new Audio()
    void context.resume().catch(() => {})
    const source = context.createBufferSource()
    source.buffer = context.createBuffer(1, 1, context.sampleRate)
    source.connect(context.destination)
    source.start()
  } catch {}
}

function output() {
  if (!master) {
    master = context.createGain()
    master.gain.value = 0.9
    master.connect(context.destination)
  }
  return master
}

const running = () => context?.state === 'running'

function noiseBuffer(seconds) {
  const key = 'noise' + seconds
  if (!buffers.has(key)) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i++) {
      // Lightly smoothed noise sits closer to a crowd murmur than raw hiss.
      last = last * 0.82 + (Math.random() * 2 - 1) * 0.18
      data[i] = last * 3
    }
    buffers.set(key, buffer)
  }
  return buffers.get(key)
}

function tone(frequency, duration, { type = 'sine', volume = 0.2, slide = 0, delay = 0 } = {}) {
  const start = context.currentTime + delay
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain).connect(output())
  oscillator.start(start)
  oscillator.stop(start + duration + 0.03)
}

function burst(duration, { frequency = 1200, q = 0.8, volume = 0.3, attack = 0.05 } = {}) {
  const now = context.currentTime
  const source = context.createBufferSource()
  source.buffer = noiseBuffer(2)
  source.loop = true
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = frequency
  filter.Q.value = q
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(volume, now + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  source.connect(filter).connect(gain).connect(output())
  source.start(now, Math.random())
  source.stop(now + duration + 0.05)
}

const SYNTH = {
  click: () => tone(660, 0.05, { type: 'triangle', volume: 0.12 }),
  coin: () => { tone(988, 0.09, { type: 'square', volume: 0.07 }); tone(1319, 0.2, { type: 'square', volume: 0.07, delay: 0.08 }) },
  toss: () => { for (let i = 0; i < 6; i++) tone(1500 + i * 90, 0.05, { type: 'triangle', volume: 0.06, delay: i * 0.11 }) },
  bounce: () => tone(170, 0.07, { type: 'sine', volume: 0.2, slide: -80 }),
  whoosh: () => burst(0.22, { frequency: 2400, q: 1.6, volume: 0.07, attack: 0.08 }),
  ooh: () => burst(0.9, { frequency: 520, q: 1.2, volume: 0.22, attack: 0.12 }),
  cheer: () => { burst(2.6, { frequency: 1500, q: 0.5, volume: 0.34, attack: 0.25 }); burst(2.2, { frequency: 2800, q: 0.7, volume: 0.12, attack: 0.4 }) },
  applause: () => burst(1.8, { frequency: 2100, q: 0.5, volume: 0.2, attack: 0.2 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.32, { type: 'triangle', volume: 0.14, delay: i * 0.13 })),
  lose: () => [392, 349, 294].forEach((f, i) => tone(f, 0.4, { type: 'triangle', volume: 0.12, delay: i * 0.18 })),
  unlock: () => [784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { type: 'sine', volume: 0.13, delay: i * 0.09 })),
}

export function playSound(name, { volume = 1, rate = 1 } = {}) {
  if (!running()) return
  try {
    if (SYNTH[name]) { SYNTH[name](); return }
    const buffer = buffers.get(name)
    if (!buffer) return
    const voice = context.createBufferSource()
    voice.buffer = buffer
    voice.playbackRate.value = rate
    const gain = context.createGain()
    gain.gain.value = volume
    voice.connect(gain).connect(output())
    voice.start()
  } catch {}
}

// A looping stadium murmur that rises with the action.
export function startCrowd() {
  if (!running() || crowd) return
  try {
    const source = context.createBufferSource()
    source.buffer = noiseBuffer(2)
    source.loop = true
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 760
    filter.Q.value = 0.45
    const gain = context.createGain()
    gain.gain.value = 0.0001
    gain.gain.exponentialRampToValueAtTime(0.085, context.currentTime + 1.2)
    source.connect(filter).connect(gain).connect(output())
    source.start()
    crowd = { source, gain, filter }
  } catch {}
}

export function stopCrowd() {
  if (!crowd) return
  const { source, gain } = crowd
  crowd = null
  try {
    gain.gain.cancelScheduledValues(context.currentTime)
    gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.2)
    source.stop(context.currentTime + 0.9)
  } catch {}
}

export function crowdSwell(level = 1) {
  if (!crowd || !running()) return
  try {
    const now = context.currentTime
    crowd.gain.gain.cancelScheduledValues(now)
    crowd.gain.gain.setTargetAtTime(0.085 + 0.2 * level, now, 0.12)
    crowd.gain.gain.setTargetAtTime(0.085, now + 0.9 + level, 0.9)
    crowd.filter.frequency.setTargetAtTime(760 + 700 * level, now, 0.15)
    crowd.filter.frequency.setTargetAtTime(760, now + 1 + level, 0.8)
  } catch {}
}

export function suspendAudio(paused) {
  if (!context) return
  try { void (paused ? context.suspend() : context.resume()).catch(() => {}) } catch {}
}
