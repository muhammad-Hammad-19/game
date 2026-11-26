const FRAME_WIDTH = 104
const FRAME_HEIGHT = 88
const GROUND_Y = 79
const FRAME_COUNT = 12
const TAU = Math.PI * 2

const KITS = {
  blue: { shirt: 0x1b4cb0, shadow: 0x11264e, highlight: 0x4a80dc, trim: 0x76c9fc },
  fielding: { shirt: 0x237bc2, shadow: 0x123766, highlight: 0x59a4df, trim: 0xffac42 },
  red: { shirt: 0xc03843, shadow: 0x60242c, highlight: 0xe47578, trim: 0xf6e1ce },
  white: { shirt: 0xdddfe3, shadow: 0x868f9f, highlight: 0xf9f8ef, trim: 0x384653 }
}

const DARK_FABRIC = ['#151e25', '#2d3941', '#495660']
const SKIN = ['#75452d', '#aa6d48', '#ce966a']
const GLOVE = ['#838d95', '#d8dfe3', '#fcfbed']
const BAT = ['#8d603b', '#d9b682', '#f2d6a4']

// Coordinates are projected into a side-on view. Body holds hip center,
// shoulder center, shoulder width and tilt. Limbs hold two successive joints.
function pose(body, farArm, nearArm, farLeg, nearLeg, bat = 76) {
  return { body, farArm, nearArm, farLeg, nearLeg, bat: [bat] }
}

const STANDING = pose(
  [0, -25, 0, -44, 15, 0],
  [-10, -29, -9, -19], [10, -29, 9, -19],
  [-5, -12, -6, 0], [5, -12, 6, 0]
)
const BAT_READY = pose(
  [0, -24, -2, -42, 13, 1],
  [-7, -30, 5, -24], [9, -31, 7, -25],
  [-6, -12, -8, 0], [6, -12, 8, 0]
)
const BAT_BACKLIFT = pose(
  [-2, -25, -6, -45, 13, -2],
  [-8, -34, 1, -31], [5, -37, 2, -32],
  [-7, -13, -8, 0], [5, -13, 8, 0], 128
)
const BAT_TAP = pose(
  [1, -22, 2, -39, 13, 2],
  [-5, -27, 7, -22], [12, -28, 8, -23],
  [-7, -11, -8, 0], [8, -11, 8, 0], 82
)
const BAT_WATCH = pose(
  [0, -26, 1, -45, 14, 0],
  [-9, -31, -12, -23], [12, -32, 15, -23],
  [-5, -13, -7, 0], [5, -13, 7, 0], 82
)
const BAT_WATCH_SHIFT = pose(
  [2, -24, 4, -42, 14, 1],
  [-4, -31, -6, -23], [14, -29, 17, -24],
  [-3, -13, -7, 0], [8, -12, 7, 0], 70
)
const BAT_REACH = pose(
  [3, -23, 9, -40, 13, 3],
  [-4, -29, -10, -21], [16, -28, 18, -17],
  [-11, -14, -12, 0], [11, -12, 13, 0], 44
)
const BAT_GROUNDED = pose(
  [3, -19, 15, -32, 13, 4],
  [4, -19, -3, -16], [21, -20, 24, -8],
  [-6, -11, -12, 0], [13, -9, 13, 0], 18
)
const BAT_GROUND_HOLD = pose(
  [3, -23, 8, -39, 13, 2],
  [0, -26, -6, -19], [15, -26, 20, -13],
  [-7, -13, -12, 0], [12, -11, 13, 0], 34
)
const BAT_PIVOT = pose(
  [1, -21, 1, -38, 8, 0],
  [-4, -25, -6, -19], [8, -24, 14, -14],
  [-8, -11, -10, 0], [9, -10, 10, 0], 46
)
const BAT_PUSH_OFF = pose(
  [2, -23, 9, -40, 13, 2],
  [-2, -27, 5, -21], [17, -30, 13, -23],
  [-6, -12, -12, -3], [7, -12, 9, 0], 143
)
const KEEPER_READY = pose(
  [0, -16, 3, -32, 16, 0],
  [-9, -23, -3, -14], [13, -22, 6, -14],
  [-10, -11, -11, 0], [10, -11, 11, 0]
)
const FIELD_READY = pose(
  [0, -23, 2, -40, 16, 0],
  [-9, -27, -6, -18], [12, -27, 8, -18],
  [-7, -12, -9, 0], [8, -12, 9, 0]
)
const COLLECT = pose(
  [0, -17, 13, -27, 13, 4],
  [4, -17, 11, -7], [20, -15, 17, -3],
  [-8, -10, -13, 0], [9, -10, 9, 0]
)
const DIVE_PUSH = pose(
  [0, -23, 10, -37, 14, 4],
  [10, -27, 20, -19], [21, -30, 30, -24],
  [-9, -12, -21, 0], [6, -12, 4, -5]
)
const DIVE_REACH = pose(
  [-9, -8, 11, -12, 13, 1],
  [17, -9, 29, -5], [25, -6, 38, -3],
  [-23, -8, -36, -6], [-19, -4, -32, -1]
)
const DIVE_BRACE = pose(
  [-6, -9, 12, -15, 13, 2],
  [14, -6, 19, -2], [25, -10, 33, -5],
  [-12, -4, -25, 0], [3, -4, -14, -1]
)
const APPEAL = pose(
  [0, -26, 0, -46, 16, 0],
  [-14, -51, -17, -64], [14, -51, 17, -65],
  [-6, -13, -8, 0], [6, -13, 8, 0]
)
const SIGNAL = pose(
  [0, -25, 0, -44, 15, 0],
  [-10, -29, -9, -19], [10, -56, 10, -68],
  [-5, -12, -6, 0], [5, -12, 6, 0]
)
const WAVE_LEFT = pose(
  [0, -25, 0, -44, 15, 0],
  [-10, -29, -9, -19], [17, -43, 30, -44],
  [-5, -12, -6, 0], [5, -12, 6, 0]
)
const WAVE_ACROSS = pose(
  [0, -25, 0, -44, 15, 0],
  [-10, -29, -9, -19], [7, -42, -10, -45],
  [-5, -12, -6, 0], [5, -12, 6, 0]
)
const WINDUP = pose(
  [-1, -27, -3, -45, 15, -4],
  [-14, -54, -11, -65], [9, -36, 4, -30],
  [-7, -14, -10, 0], [9, -20, 5, -26]
)
const RELEASE = pose(
  [1, -27, 4, -46, 15, -2],
  [-9, -34, -10, -25], [10, -58, 12, -72],
  [-8, -13, -14, -4], [8, -12, 11, 0]
)
const FOLLOW_THROUGH = pose(
  [2, -23, 10, -40, 14, 3],
  [6, -29, 1, -20], [9, -27, 0, -19],
  [-2, -13, -12, -7], [10, -12, 12, 0]
)
const BACKSWING = pose(
  [-2, -25, -6, -43, 14, -2],
  [-12, -38, -9, -33], [5, -31, -8, -34],
  [-8, -12, -10, 0], [7, -13, 8, 0], -110
)
const CONTACT = pose(
  [3, -24, 9, -42, 16, 1],
  [10, -33, 23, -31], [20, -35, 25, -31],
  [-5, -11, -9, 0], [12, -12, 15, 0], 12
)
const FINISH_SWING = pose(
  [4, -25, 9, -44, 15, -3],
  [12, -43, 18, -50], [23, -39, 19, -49],
  [0, -13, -7, -3], [12, -12, 15, 0], -65
)
const THROW_START = pose(
  [0, -25, -3, -43, 16, 3],
  [-13, -44, -19, -48], [11, -39, 5, -42],
  [-9, -13, -12, 0], [6, -12, 8, 0]
)
const THROW_RELEASE = pose(
  [2, -25, 7, -43, 16, 3],
  [12, -35, 6, -26], [20, -46, 29, -48],
  [-6, -12, -10, 0], [11, -12, 13, 0]
)

const UMPIRE_POSES = ['idle', 'signal', 'four', 'six']
const ACTOR_POSES = {
  batter: ['idle', 'ready', 'run', 'swing', 'ground', 'turn'],
  fielder: ['idle', 'ready', 'run', 'collect', 'throw', 'appeal', 'dive'],
  bowler: ['idle', 'run', 'bowl'],
  keeper: ['idle', 'ready', 'keeper', 'run', 'collect', 'appeal'],
  umpire: UMPIRE_POSES,
}
const LOOPS = new Set(['idle', 'ready', 'run', 'keeper'])
const BAT_STANCE_CYCLE = [[0, BAT_READY], [.22, BAT_BACKLIFT], [.48, BAT_TAP], [.66, BAT_TAP], [1, BAT_READY]]
const BAT_GROUND_SEQUENCE = [[0, BAT_REACH], [.38, BAT_GROUNDED], [.64, BAT_GROUNDED], [1, BAT_GROUND_HOLD]]
const BAT_TURN_SEQUENCE = [[0, BAT_GROUND_HOLD], [.39, BAT_PIVOT], [.57, BAT_PIVOT], [1, BAT_PUSH_OFF]]
const DIVE_SEQUENCE = [[0, FIELD_READY], [.24, DIVE_PUSH], [.42, DIVE_REACH], [.63, DIVE_REACH], [.76, DIVE_BRACE], [1, COLLECT]]

function blendPose(from, to, progress) {
  const result = {}
  for (const part of Object.keys(from)) {
    result[part] = from[part].map((value, index) => value + (to[part][index] - value) * progress)
  }
  return result
}

function samplePose(frames, progress) {
  for (let index = 1; index < frames.length; index++) {
    const [end, target] = frames[index]
    if (progress > end) continue
    const [start, initial] = frames[index - 1]
    return blendPose(initial, target, (progress - start) / (end - start))
  }
  return frames.at(-1)[1]
}

function runningPose(progress, role) {
  const stride = Math.sin(progress * TAU)
  const rise = Math.abs(Math.cos(progress * TAU))
  const travel = role === 'bowler' ? 5 : 10
  return pose(
    [stride * 1.7, -23 - rise * 3, 4 + stride * 1.7, -41 - rise * 3, 15, stride * 2],
    [-9 - stride * 5, -30, -4 - stride * 8, -23 - stride * 5],
    [11 + stride * 5, -30, 8 + stride * 8, -23 + stride * 5],
    [-4 + stride * travel * .6, -12, -4 + stride * travel, -Math.max(0, stride) * 10],
    [4 - stride * travel * .6, -12, 4 - stride * travel, -Math.max(0, -stride) * 10]
  )
}

function runningBatterPose(progress) {
  const angle = progress * TAU
  const reach = Math.cos(angle)
  const lift = Math.sin(angle)
  const bounce = Math.abs(lift) * 3
  return pose(
    [reach * 2, -22 - bounce, 8 + reach * 2, -40 - bounce, 14, reach * 2],
    [1 - reach * 6, -29, 7 - reach * 12, -24 - reach * 4],
    [15 + reach * 3, -31, 12 + reach * 5, -23 - bounce],
    [-4 + reach * 9, -12 - Math.max(0, lift) * 5, -4 + reach * 13, -Math.max(0, lift) * 11],
    [4 - reach * 9, -12 - Math.max(0, -lift) * 5, 4 - reach * 13, -Math.max(0, -lift) * 11],
    149 + reach * 14
  )
}

function getPose(name, progress, role) {
  const ready = role === 'batter' ? BAT_READY : role === 'keeper' ? KEEPER_READY : FIELD_READY
  if (role === 'batter') {
    switch (name) {
      case 'idle':
        return blendPose(BAT_WATCH, BAT_WATCH_SHIFT, (1 - Math.cos(progress * TAU)) / 2)
      case 'ready':
        return samplePose(BAT_STANCE_CYCLE, progress)
      case 'run':
        return runningBatterPose(progress)
      case 'ground':
        return samplePose(BAT_GROUND_SEQUENCE, progress)
      case 'turn':
        return samplePose(BAT_TURN_SEQUENCE, progress)
    }
  }

  switch (name) {
    case 'run':
      return runningPose(progress, role)
    case 'dive':
      return samplePose(DIVE_SEQUENCE, progress)
    case 'bowl':
      return samplePose([[0, STANDING], [.26, WINDUP], [.58, RELEASE], [.83, FOLLOW_THROUGH], [1, STANDING]], progress)
    case 'swing':
      return samplePose([[0, BAT_READY], [.20, BACKSWING], [.40, CONTACT], [.72, FINISH_SWING], [1, BAT_READY]], progress)
    case 'throw':
      return samplePose([[0, COLLECT], [.34, THROW_START], [.58, THROW_RELEASE], [.81, FOLLOW_THROUGH], [1, FIELD_READY]], progress)
    case 'collect':
      return blendPose(ready, COLLECT, Math.sin(progress * Math.PI / 2))
    case 'appeal':
      return blendPose(ready, APPEAL, Math.sin(progress * Math.PI))
    case 'four':
      return blendPose(WAVE_LEFT, WAVE_ACROSS, (1 - Math.cos(progress * TAU * 2)) / 2)
    case 'six':
      return blendPose(STANDING, APPEAL, Math.min(1, progress * 6, (1 - progress) * 6))
    case 'signal':
      return blendPose(STANDING, SIGNAL, Math.min(1, progress * 5, (1 - progress) * 5))
    default: {
      const base = name === 'idle' && role !== 'keeper' ? STANDING : ready
      const breath = (1 - Math.cos(progress * TAU)) * .8
      const [hipX, hipY, shoulderX, shoulderY, width, tilt] = base.body
      return { ...base, body: [hipX, hipY - breath * .35, shoulderX, shoulderY - breath, width, tilt] }
    }
  }
}

const asHex = value => `#${value.toString(16).padStart(6, '0')}`

function gradient(ctx, startX, startY, endX, endY, [shade, color, highlight]) {
  const fill = ctx.createLinearGradient(startX, startY, endX, endY)
  fill.addColorStop(0, shade)
  fill.addColorStop(.58, color)
  fill.addColorStop(1, highlight)
  return fill
}

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU)
  ctx.fill()
}

function roundBox(ctx, x, y, width, height, radius, fill) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.fill()
}

function line(ctx, start, end, width, fill) {
  ctx.strokeStyle = fill
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(...start)
  ctx.lineTo(...end)
  ctx.stroke()
}

function segment(ctx, start, end, topWidth, bottomWidth, colors) {
  const [x, y] = start
  const dx = end[0] - x
  const dy = end[1] - y
  const length = Math.hypot(dx, dy)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2)
  ctx.fillStyle = gradient(ctx, -topWidth, 0, topWidth, 0, colors)
  ctx.beginPath()
  ctx.moveTo(-topWidth, 0)
  ctx.quadraticCurveTo(0, -topWidth, topWidth, 0)
  ctx.lineTo(bottomWidth, length)
  ctx.quadraticCurveTo(0, length + bottomWidth, -bottomWidth, length)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawLeg(ctx, hip, limb, pad, colors, trim) {
  const [kneeX, kneeY, bootX, bootY] = limb
  const knee = [kneeX, kneeY]
  const boot = [bootX, bootY - 2]
  segment(ctx, hip, knee, 4.6, 3.4, colors)
  segment(ctx, knee, boot, 3.6, 2.55, colors)
  if (pad) {
    segment(ctx, [kneeX, kneeY - 2], [bootX, bootY - 3], 3.95, 3.0, GLOVE)
    line(ctx, [kneeX - 1.25, kneeY], [bootX - 1.0, bootY - 3.4], .8, '#acb9c3')
    line(ctx, [kneeX + .95, kneeY], [bootX + .6, bootY - 3.6], .7, '#f8fcff')
  } else if (trim) {
    line(ctx, [kneeX + 2.3, kneeY - 1.5], [bootX + 1.85, bootY - 3.5], .85, trim)
  }
  ellipse(ctx, bootX + 1.4, bootY - .35, 4.15, 1.4, '#162022')
  ellipse(ctx, bootX + 1.2, bootY - 1.36, 4.05, 1.8, '#e6ebea')
  line(ctx, [bootX - 1, bootY - 2.05], [bootX + 1, bootY - 2.05], .55, '#818e90')
}

function drawArm(ctx, shoulder, arm, kitColors, role) {
  const [elbowX, elbowY, handX, handY] = arm
  const shortSleeve = role !== 'umpire'
  const glove = role === 'batter' || role === 'keeper'
  const elbow = [elbowX, elbowY]
  const hand = [handX, handY]
  const sleeveEnd = [shoulder[0] + (elbowX - shoulder[0]) * .63, shoulder[1] + (elbowY - shoulder[1]) * .63]
  segment(ctx, shoulder, elbow, 3.35, 2.35, shortSleeve ? SKIN : kitColors)
  segment(ctx, elbow, hand, 2.35, 1.55, shortSleeve ? SKIN : kitColors)
  if (shortSleeve) segment(ctx, shoulder, sleeveEnd, 3.8, 3.05, kitColors)
  if (glove) {
    const gloveSize = role === 'keeper' ? 3.25 : 2.55
    ellipse(ctx, handX, handY, gloveSize, gloveSize * 1.1, '#a9b6bc')
    ellipse(ctx, handX + .65, handY - .55, gloveSize * .74, gloveSize * .72, '#e9eae1')
    line(ctx, [handX + .3, handY - 1.4], [handX + 1.5, handY - .1], .7, '#70878f')
  } else {
    ellipse(ctx, handX, handY, 1.7, 2, '#b87b54')
  }
}

function drawTorso(ctx, body, farShoulder, nearShoulder, kit, colors, backView, role) {
  const [x, y, shoulderX, shoulderY, shoulderWidth] = body
  ctx.fillStyle = gradient(ctx, farShoulder[0], shoulderY, nearShoulder[0], shoulderY + 4, colors)
  ctx.beginPath()
  ctx.moveTo(farShoulder[0] - 2, farShoulder[1] + 1)
  ctx.quadraticCurveTo(shoulderX, shoulderY - 4, nearShoulder[0] + 2, nearShoulder[1] + 1)
  ctx.quadraticCurveTo(x + 5.1, y - 3, x + 5.9, y + 1)
  ctx.quadraticCurveTo(x + 1, y + 3, x - 6.4, y + 1)
  ctx.quadraticCurveTo(x - 5, y - 5, farShoulder[0] - 2, farShoulder[1] + 1)
  ctx.fill()
  if (role !== 'umpire') {
    line(ctx, [nearShoulder[0] - .65, nearShoulder[1] + .6], [x + 4.7, y - .1], .95, asHex(kit.trim))
    line(ctx, [farShoulder[0] + 1, farShoulder[1] + 1], [x - 5.3, y], .7, colors[0])
  }
  line(ctx, [shoulderX - 2.8, shoulderY - .25], [shoulderX + 2.3, shoulderY + .5], 1, colors[0])
  if (backView) {
    ctx.font = 'bold 6px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#e7ebdb'
    ctx.fillText(role === 'bowler' ? '17' : '8', shoulderX + shoulderWidth * .04, shoulderY + 10)
  } else {
    roundBox(ctx, shoulderX + 1.9, shoulderY + 4.5, 2.9, 2, .55, asHex(kit.trim))
  }
}

function drawHead(ctx, x, y, colors, role, backView) {
  ellipse(ctx, x, y + 4, 2.8, 4.5, '#b57854')
  if (role === 'umpire') {
    ellipse(ctx, x, y - .5, 4.2, 5, '#b77f59')
    ellipse(ctx, x, y - 3.0, 7.9, 2.35, '#151f25')
    ellipse(ctx, x, y - 5.5, 4.8, 3.4, '#2d3a40')
    return
  }
  ellipse(ctx, x, y - 1, 4.55, 5.6, backView ? '#342923' : '#bc8361')
  ellipse(ctx, x - 3.5, y + .2, 1.2, 1.65, '#a56d4a')
  const helmet = role === 'batter' || role === 'keeper'
  if (!backView) {
    line(ctx, [x + 1.75, y - 1], [x + 3.5, y - .8], .6, '#48362d')
    line(ctx, [x + 2, y + 2.45], [x + 3.6, y + 2], .7, '#6f4736')
  }
  const headwear = gradient(ctx, x - 4.9, y - 5, x + 4.8, y, colors)
  if (helmet) {
    ellipse(ctx, x - .55, y - 3.6, 5.8, 4.75, headwear)
    ellipse(ctx, x - 2.95, y - .95, 2.1, 2.8, colors[0])
    line(ctx, [x, y - 3.6], [x + 7.15, y - 3.1], 1.65, colors[0])
    line(ctx, [x + 6.9, y - 2.6], [x + 5.9, y + 4.6], .9, '#b1c2cd')
    line(ctx, [x, y + 3.2], [x + 6.1, y + 3.6], .8, '#d4d6c8')
    line(ctx, [x, y + 1.1], [x + 6.4, y + 1.65], .65, '#b1c2cd')
  } else {
    ellipse(ctx, x - .4, y - 4.5, 4.8, 3.1, headwear)
    line(ctx, [x + .1, y - 3.5], [x + (backView ? 4.6 : 7), y - 2.75], 1.4, colors[0])
  }
}

function drawBat(ctx, handX, handY, degrees) {
  ctx.save()
  ctx.translate(handX, handY)
  ctx.rotate(degrees * Math.PI / 180)
  roundBox(ctx, -4.2, -1.05, 9.3, 2.1, 1, '#27383e')
  roundBox(ctx, 3, -2.45, 19.8, 4.9, 1.4, gradient(ctx, 9, -2.5, 9, 2.5, BAT))
  line(ctx, [6, -.8], [21.25, -.8], .5, '#f0cc90')
  line(ctx, [8.5, 1.2], [20.75, 1.2], .5, '#a6794e')
  ctx.restore()
}

function paintFrame(ctx, x, y, rig, kit, role, name) {
  const { body, farArm, nearArm, farLeg, nearLeg, bat } = rig
  const [hipX, hipY, sx, sy, sw, tilt] = body
  const reach = name === 'dive' ? Math.min(1, Math.max(0, (sx - hipX - 10) / 10)) : 0
  const halfShoulderWidth = sw * (.5 - .26 * reach)
  const halfShoulderTilt = tilt * .5 + reach * 2
  const farShoulder = [sx - halfShoulderWidth, sy - halfShoulderTilt]
  const nearShoulder = [sx + halfShoulderWidth, sy + halfShoulderTilt]
  const backView = role === 'batter' || role === 'keeper'
  const pads = role === 'batter' || role === 'keeper'
  const colors = [asHex(kit.shadow), asHex(kit.shirt), asHex(kit.highlight)]
  const trousers = role === 'umpire' ? DARK_FABRIC : colors

  ctx.save()
  ctx.translate(x + FRAME_WIDTH / 2, y + GROUND_Y)
  ellipse(ctx, 4, .5, 15.5 + 20 * reach, 3.9, '#0b1c241c')
  ellipse(ctx, .7, -.15, 11.9 + 14 * reach, 2.5, '#071e2340')
  drawLeg(ctx, [hipX - 3.5, hipY], farLeg, pads, trousers)
  drawLeg(ctx, [hipX + 3.5, hipY], nearLeg, pads, trousers, asHex(kit.trim))
  drawArm(ctx, farShoulder, farArm, colors, role)
  drawTorso(ctx, body, farShoulder, nearShoulder, kit, colors, backView, role)
  drawHead(ctx, sx + (backView ? .15 : 1.25) + 7 * reach, sy - 6 + reach * 4, colors, role, backView)
  if (role === 'batter') drawBat(ctx, nearArm[2], nearArm[3], bat[0])
  drawArm(ctx, nearShoulder, nearArm, colors, role)
  ctx.restore()
}

const uniforms = [
  ['batter', 'blue'], ['batter', 'red'], ['batter', 'white'],
  ['bowler', 'fielding'], ['keeper', 'fielding'], ['fielder', 'fielding'], ['umpire', 'red'],
]

function* bakeFrames(textures) {
  for (const [role, kit] of uniforms) {
    const poses = ACTOR_POSES[role]
    const texture = textures.createCanvas(role + '-' + kit, FRAME_COUNT * FRAME_WIDTH, poses.length * FRAME_HEIGHT)
    const context = texture.getContext()
    for (let row = 0; row < poses.length; row++) {
      const name = poses[row]
      for (let frame = 0; frame < FRAME_COUNT; frame++) {
        const x = frame * FRAME_WIDTH
        const y = row * FRAME_HEIGHT
        const phase = frame / (LOOPS.has(name) ? FRAME_COUNT : FRAME_COUNT - 1)
        paintFrame(context, x, y, getPose(name, phase, role), KITS[kit], role, name)
        texture.addFrame(row * FRAME_COUNT + frame, x, y, FRAME_WIDTH, FRAME_HEIGHT)
        yield
      }
    }
  }
}

export async function preloadActors(textures, onProgress, signal) {
  const total = uniforms.reduce((n, [role]) => n + ACTOR_POSES[role].length * FRAME_COUNT, 0)
  let painted = 0
  let start = performance.now()
  for (const _ of bakeFrames(textures)) {
    painted++
    if (performance.now() - start < 6) continue
    onProgress(painted / total)
    await new Promise(resolve => setTimeout(resolve, 0))
    signal.throwIfAborted()
    start = performance.now()
  }
  onProgress(1)
}

export class CricketActor {
  constructor(scene, { x, y, scale = 1, kit = 'blue', role = 'batter', facing = 1 }) {
    this.poses = ACTOR_POSES[role]
    const texture = role + '-' + kit
    this.sprite = scene.add.image(x, y, texture, 0)
      .setOrigin(.5, GROUND_Y / FRAME_HEIGHT)
      .setScale(scale)
    this.setPosition(x, y).setPose('idle', 0, facing)
  }

  get x() { return this.sprite.x }
  get y() { return this.sprite.y }

  setPosition(x, y) {
    this.sprite.setPosition(x, y).setDepth(20 + y / 1000)
    return this
  }

  setScale(scale) {
    this.sprite.setScale(scale)
    return this
  }

  setVisible(visible) {
    this.sprite.setVisible(visible)
    return this
  }

  setPose(name, phase = 0, facing = this.facing) {
    const row = Math.max(0, this.poses.indexOf(name))
    const frame = LOOPS.has(name)
      ? Math.floor((phase - Math.floor(phase)) * FRAME_COUNT)
      : Math.round(Math.max(0, Math.min(1, phase)) * (FRAME_COUNT - 1))
    const frameId = row * FRAME_COUNT + frame
    if (this.frameId !== frameId) {
      this.sprite.setFrame(frameId)
      this.frameId = frameId
    }
    this.facing = facing < 0 ? -1 : 1
    this.sprite.setFlipX(this.facing < 0)
    return this
  }
}
