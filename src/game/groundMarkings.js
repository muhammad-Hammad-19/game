import { ropeY } from './fieldPlans.js'

export function makeRope(textures) {
  if (textures.has('boundary-rope')) return
  const width = 1440, height = 810
  for (const [key, color] of [['boundary-rope', '#fffdf4'], ['rope-flash', '#ffdf5e']]) {
    const ctx = textures.createCanvas(key, width, height).getContext()
    ctx.beginPath()
    ctx.moveTo(0, ropeY(0) * height)
    ctx.quadraticCurveTo(width / 2, (2 * ropeY(0.5) - ropeY(0)) * height, width, ropeY(1) * height)
    ctx.strokeStyle = color
    ctx.lineWidth = 3.5
    ctx.shadowColor = 'rgba(26, 46, 24, 0.55)'
    ctx.shadowBlur = 2.5
    ctx.shadowOffsetY = 2
    ctx.stroke()
  }
}
