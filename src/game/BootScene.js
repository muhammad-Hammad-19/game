import stadiumUrl from './assets/cricket-stadium.webp'
import matchGroundUrl from './assets/match-ground.webp'
import { preloadActors } from './CricketActor.js'
import { prepareAudio } from './sounds.js'

async function loadImage(textures, key, url, signal) {
  const image = new Image()
  image.src = url
  await image.decode()
  signal.throwIfAborted()
  textures.set(key, { source: image })
}

function makeBall(textures) {
  const ctx = textures.createCanvas('cricket-ball', 20, 20).getContext()
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
  ])
  const stump=textures.createCanvas('stump',2,9).getContext()
  stump.fillStyle='#f1dba1'; stump.fillRect(0,0,2,9)
  makeBall(textures)
  await preloadActors(textures, fraction => onProgress(.3 + .65 * fraction), signal)
  await textures.prepareSprites(signal)
  onProgress(1)
}
