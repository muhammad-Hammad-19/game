import hitUrl from './assets/bat-hit.wav'
import wicketUrl from './assets/wicket.wav'
import crowdUrl from './assets/crowd.wav'

const buffers = new Map()
let context
let loading

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

export function playSound(name) {
  const buffer = buffers.get(name)
  if (!buffer || context?.state !== 'running') return
  const voice = context.createBufferSource()
  voice.buffer = buffer
  voice.connect(context.destination)
  voice.start()
}
