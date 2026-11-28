import stadiumUrl from './assets/cricket-stadium.webp'
import matchGroundUrl from './assets/match-ground.webp'
import { bakeKits } from './CricketActor.js'
import { prepareAudio } from './sounds.js'
import { loadPlayerModel } from './PlayerModel.js'
import { UMPIRE_KIT } from '../data/teams.js'
import { PITCHES } from '../data/pitches.js'

async function loadImage(textures, key, url, signal) {
  const image = new Image()
  image.src = url
  await image.decode()
  signal.throwIfAborted()
  textures.set(key, { source: image })
}

function makeBall(textures) {
  const ctx = textures.createCanvas('cricket-ball', 40, 40).getContext()
  ctx.scale(2, 2)
  const fill = ctx.createRadialGradient(7, 6, 1, 10, 10, 10)
  fill.addColorStop(0, '#ffb5bb')
  fill.addColorStop(.64, '#c21b31')
  fill.addColorStop(1, '#71091c')
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(10, 10, 9.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ffedd1'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(5, 17)
  ctx.quadraticCurveTo(12, 13, 14, 3)
  ctx.stroke()
  textures.get('cricket-ball').resolution = 2
}

// Corners of the pitch strip in the ground photograph, as fractions of the frame.
const PITCH_CORNERS = [[0.438, 0.414], [0.556, 0.414], [0.634, 0.784], [0.365, 0.784]]

function makePitchTint(textures, pitch) {
  if (!pitch.tint) return
  const width = 960, height = 540
  const ctx = textures.createCanvas('pitch-' + pitch.id, width, height).getContext()
  const [r, g, b, alpha] = pitch.tint
  const outline = () => {
    ctx.beginPath()
    PITCH_CORNERS.forEach(([x, y], index) => ctx[index ? 'lineTo' : 'moveTo'](x * width, y * height))
    ctx.closePath()
  }
  ctx.save()
  ctx.filter = 'blur(3px)'
  outline()
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
  ctx.fill()
  ctx.restore()
  outline()
  ctx.clip()
  // Fixed pseudo-random marks: grass patches on a green top, cracks on a dry one.
  let seed = pitch.id.length * 9973
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 90; i++) {
    const y = (0.42 + random() * 0.36) * height
    const spread = 0.06 + (y / height - 0.414) * 0.2
    const x = (0.5 + (random() - 0.5) * 2 * spread) * width
    if (pitch.id === 'green') {
      ctx.fillStyle = `rgba(40,${110 + Math.floor(random() * 50)},48,${0.1 + random() * 0.14})`
      ctx.beginPath()
      ctx.ellipse(x, y, 3 + random() * 9, 1 + random() * 2.4, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.strokeStyle = `rgba(74,48,24,${0.08 + random() * 0.12})`
      ctx.lineWidth = 0.5 + random() * 0.4
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (random() - 0.5) * 9, y + random() * 4)
      ctx.lineTo(x + (random() - 0.5) * 13, y + 2 + random() * 5)
      ctx.stroke()
    }
  }
}

function makeProps(textures) {
  const bail = textures.createCanvas('bail', 16, 6).getContext()
  bail.fillStyle = '#f4e3b3'
  bail.beginPath()
  bail.roundRect(0, 1, 16, 4, 2)
  bail.fill()
  bail.fillStyle = '#b89a5c'
  bail.fillRect(0, 4, 16, 1)
  textures.get('bail').resolution = 2

  const marker = textures.createCanvas('aim-marker', 128, 64)
  marker.resolution = 2
  const ctx = marker.getContext()
  ctx.scale(2, 2)
  const ring = (rx, ry, color, width) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.ellipse(32, 16, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255, 86, 60, .3)'
  ctx.beginPath()
  ctx.ellipse(32, 16, 22, 10, 0, 0, Math.PI * 2)
  ctx.fill()
  ring(22, 10, '#ffffff', 2.4)
  ring(12, 5.4, '#ff5a3c', 2)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(32, 16, 2.6, 1.4, 0, 0, Math.PI * 2)
  ctx.fill()

  const stump = textures.createCanvas('stump', 4, 18).getContext()
  stump.fillStyle = '#f1dba1'
  stump.fillRect(0, 0, 4, 18)
  textures.get('stump').resolution = 2
}

export async function preloadGame(textures, onProgress, showStadium, signal) {
  let imageCount = 0
  const loaded = () => {
    signal.throwIfAborted()
    onProgress(++imageCount * .1)
  }
  await Promise.all([
    loadImage(textures, 'stadium', stadiumUrl, signal).then(() => { showStadium(); loaded() }),
    loadImage(textures, 'match-ground', matchGroundUrl, signal).then(loaded),
    prepareAudio().then(loaded),
    loadPlayerModel(),
  ])
  makeBall(textures)
  makeProps(textures)
  for (const pitch of Object.values(PITCHES)) makePitchTint(textures, pitch)
  await bakeKits(textures, [{ key: 'umpire', role: 'umpire', kit: UMPIRE_KIT }], 'High', fraction => onProgress(.3 + .65 * fraction), signal)
  onProgress(1)
}
