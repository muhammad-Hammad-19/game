import { ropeY } from './fieldPlans.js'
import { mapY } from './viewMap.js'

export function makeRope(textures) {
  if (textures.has('boundary-rope')) return
  const width = 1440, height = 810
  for (const [key, color] of [['boundary-rope', '#fffdf4'], ['rope-flash', '#ffdf5e']]) {
    const ctx = textures.createCanvas(key, width, height).getContext()
    // The rope the batter hits towards, drawn where it appears from behind the bowler.
    ctx.beginPath()
    for (let step = 0; step <= 48; step++) {
      const x = step / 48
      ctx[step ? 'lineTo' : 'moveTo'](x * width, mapY(ropeY(x)) * height)
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 3.5
    ctx.shadowColor = 'rgba(26, 46, 24, 0.55)'
    ctx.shadowBlur = 2.5
    ctx.shadowOffsetY = 2
    ctx.stroke()
  }
}
