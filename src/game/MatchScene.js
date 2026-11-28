import { makeRope } from './groundMarkings.js'
import { playSound, crowdSwell } from './sounds.js'
import { CricketActor } from './CricketActor.js'
import { BOUNDARY_CENTER_Y, ropeY, FIELD_PLANS, boundaryPoint, selectFieldPlan, toRadarPoint } from './fieldPlans.js'
import { Innings } from './innings.js'
import { makeRng, clamp } from './rng.js'
import { aggression, ballThreat, rollOutcome } from './sim.js'
import { commentate, speak } from '../data/commentary.js'
import { pitchById } from '../data/pitches.js'
import { UMPIRE_KIT } from '../data/teams.js'
import { mapPoint, mapY, unmapPoint } from './viewMap.js'

const BASE_WINDOW = { Easy: 0.17, Medium: 0.12, Hard: 0.075 }
const INTERCEPTION_REACH = { Easy: 26, Medium: 37, Hard: 48 }
// Positive values help the bowler when the computer bats.
const AI_BAT_BIAS = { Easy: -0.02, Medium: -0.15, Hard: -0.25 }
const AI_PACE_SHIFT = { Easy: 70, Medium: 0, Hard: -55 }
const PLAN_MODS = {
  balanced: { wicket: 1, boundary: 1 },
  attack: { wicket: 1.28, boundary: 1.22 },
  boundary: { wicket: 0.82, boundary: 0.66 },
  off: { wicket: 1, boundary: 1.1, side: 'off' },
  leg: { wicket: 1, boundary: 1.1, side: 'leg' },
  straight: { wicket: 1, boundary: 1.1, side: 'straight' },
}
export const FIELD_ORDER = ['balanced', 'attack', 'off', 'leg', 'straight', 'boundary']

// `pace` stretches the time of flight, `window` shrinks the batter's timing window.
export const DELIVERIES = {
  pace: [
    { id: 'fast', label: 'Fast', swing: 0, turn: 0, pace: 0.9, window: 1, variety: 0.15 },
    { id: 'outswing', label: 'Out-swing', swing: 1, turn: 0, pace: 1, window: 0.93, variety: 0.3 },
    { id: 'inswing', label: 'In-swing', swing: -1, turn: 0, pace: 1, window: 0.93, variety: 0.3 },
    { id: 'slower', label: 'Slower', swing: 0, turn: 0, pace: 1.32, window: 0.9, variety: 0.5 },
  ],
  spin: [
    { id: 'offbreak', label: 'Off-break', swing: 0, turn: -1, pace: 1.3, window: 0.95, variety: 0.25 },
    { id: 'legbreak', label: 'Leg-break', swing: 0, turn: 1, pace: 1.3, window: 0.95, variety: 0.3 },
    { id: 'armball', label: 'Arm ball', swing: 0, turn: 0, pace: 1.12, window: 0.92, variety: 0.45 },
    { id: 'flighted', label: 'Flighted', swing: 0, turn: 0.6, pace: 1.5, window: 0.96, variety: 0.35 },
  ],
}
const deliveryDef = (style, id) => (DELIVERIES[style] || DELIVERIES.pace).find(entry => entry.id === id) || (DELIVERIES[style] || DELIVERIES.pace)[0]

const SWING_TIME = 270
const CONTACT_DELAY = SWING_TIME * 0.4
const RUN_UP = 760
const RELEASE = 250
const RUN_TO_CREASE = 1350
const GROUND_BAT = 230
const TURN_FOR_NEXT_RUN = 240
const RUN_LEG = RUN_TO_CREASE + GROUND_BAT + TURN_FOR_NEXT_RUN
const DIVE_DURATION = 450
const STRIKER = [0.516, 0.738]
const NON_STRIKER = [0.564, 0.432]
const STRIKER_GROUND = [0.516, 0.758]
const PARTNER_GROUND = [0.564, 0.417]
const KEEPER = [0.477, 0.87]
const BOWLER_START = [0.448, 0.382]
const BOWLER_CREASE = [0.482, 0.425]
const STUMPS_TOP = [0.482, 0.676]
const TARGET_X = 0.497
// Where the middle stump sits on the delivery's line scale, and how far either side is a wide.
const STUMP_LINE = -4
const WIDE_LIMIT = 36
// Balls pitching further than this from the stumps favour a shot to that side.
const LINE_BAND = 9
const METER_SWEET = 0.82
const METER_NO_BALL = 0.955
const progress = (elapsed, duration) => clamp(elapsed / duration, 0, 1)
const lerp = (a, b, t) => a + (b - a) * t
const squaredDistance = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2
const distanceBetween = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)
const smooth = t => t * t * (3 - 2 * t)
const cycle = (elapsed, period) => (elapsed % period) / period
const noop = () => {}

export function lengthName(bounceAt) {
  if (bounceAt >= 0.955) return 'Full toss'
  if (bounceAt >= 0.89) return 'Yorker'
  if (bounceAt >= 0.79) return 'Full'
  if (bounceAt >= 0.63) return 'Good length'
  if (bounceAt >= 0.5) return 'Short'
  return 'Bouncer'
}

function lengthScore(bounceAt) {
  if (bounceAt >= 0.955) return 0.2
  if (bounceAt >= 0.89) return 0.93
  if (bounceAt >= 0.79) return 0.46
  if (bounceAt >= 0.63) return 0.8
  if (bounceAt >= 0.5) return 0.5
  return 0.6
}

export function lineName(offset) {
  const distance = Math.abs(offset)
  if (distance > WIDE_LIMIT) return 'Wide'
  if (distance <= 8) return 'On the stumps'
  if (distance <= 22) return offset > 0 ? 'Outside off' : 'On the pads'
  return offset > 0 ? 'Wide of off' : 'Down leg'
}

export default class MatchScene {
  init(data) {
    this.onUpdate = data.onUpdate || noop
    this.onEvent = data.onEvent || noop
    this.timingElement = data.timingElement
    this.fieldDisplay = data.fieldDisplay
    this.settings = data.settings || {}
    const match = data.match
    this.match = match
    this.difficulty = this.settings.difficulty || 'Medium'
    this.pitch = pitchById(match.pitch)
    this.bat = match.bat || 'user'
    this.bowl = match.bowl || 'ai'
    this.net = data.net || null
    this.rng = makeRng(match.seed)
    this.batPerk = match.batPerk || { timing: 0, power: 0 }
    this.sheets = match.sheets
    this.innings = new Innings({
      batting: match.batting, bowling: match.bowling, maxBalls: match.maxBalls,
      maxWickets: match.maxWickets ?? 10, target: match.target ?? null, label: match.label,
    })
    this.fieldNames = match.bowling.players.map(player => player.n)
    this.elapsed = 0
    this.paused = false
    this.finished = false
    this.done = false
    this.selectedShot = 'drive'
    this.footwork = null
    this.lastLabel = ''
    this.lastDetail = ''
    this.lastWicket = false
    this.milestone = null
    this.ballCount = 0
    this.cam = { x: 480, y: 270, zoom: 1 }
    this.zoom = 1
    this.radarPoint = [0, 0]
    this.delivery = null
    this.play = null
    this.fieldPlan = FIELD_PLANS.balanced
    this.fieldChanging = false
    this.recentDeliveries = []
    this.recentTypes = []
    this.radarPositions = new Map()
    this.nextRadarUpdate = 0
    this.wheel = []
    this.tracked = []
    this.tape = []
    this.replay = null
    this.walkIn = false
    this.overBreak = false
    this.askedBowler = false
    this.aim = { line: STUMP_LINE + 6, length: 0.72, type: null }
    this.aimText = ''
    this.fx = { flashAt: -1e4, dustAt: -1e4, bailsAt: -1e4 }
    this.remote = {}
  }

  create() {
    this.w = this.scale.width
    this.h = this.scale.height
    makeRope(this.textures)
    const layer = key => this.add.image(this.w / 2, this.h / 2, key).setDisplaySize(this.w, this.h).setFixed()
    layer('match-ground')
    if (this.textures.has('pitch-' + this.pitch.id)) layer('pitch-' + this.pitch.id).setDepth(0.5)
    layer('boundary-rope').setDepth(1)
    this.flash = layer('rope-flash').setDepth(2).setVisible(false)
    this.bounceMarker = this.add.ellipse(0, 0, 9, 4, 0xffcf59, .75).setDepth(5).setVisible(false)
    this.dust = this.track(this.add.ellipse(0, 0, 14, 5, 0xd9c7a0, .5).setDepth(6).setVisible(false))
    this.aimMarker = this.add.image(0, 0, 'aim-marker').setDepth(7).setVisible(false)

    this.bowlerStart = this.toScreen(BOWLER_START)
    this.bowlerCrease = this.toScreen(BOWLER_CREASE)
    this.keeperSpot = this.toScreen(KEEPER)
    this.strikerSpot = this.toScreen(STRIKER)
    this.partnerSpot = this.toScreen(NON_STRIKER)
    this.stumpsTop = this.toScreen(STUMPS_TOP)
    this.releasePoint = [this.bowlerCrease[0] + 12 * this.playerScale(this.bowlerCrease[1]), this.bowlerCrease[1]]
    this.createPlayers()
    this.applyFieldPlan(this.fieldPlan, false)

    this.bails = [0, 1].map(() => this.track(this.add.image(0, 0, 'bail').setDepth(28).setVisible(false)))
    this.ballShadow = this.track(this.add.ellipse(0, 0, 10, 4, 0x0c1609, 0.42).setDepth(10).setVisible(false))
    this.ball = this.track(this.add.image(0, 0, 'cricket-ball').setVisible(false).setDepth(30))
    this.trail = this.add.particles(0, 0, 'cricket-ball', {
      speed: 0,
      scale: { start: 0.31, end: 0 },
      alpha: { start: 0.6, end: 0 },
      lifespan: 150,
      frequency: 24,
      emitting: false,
    }).setDepth(29)
    this.trail.startFollow(this.ball)
    this.onUpdate(this.snapshot())
    this.beginReady(850)
    this.updateFieldRadar()
  }

  track(object) {
    this.tracked.push(object)
    return object
  }

  createPlayers() {
    const { batting, bowling, wood } = this.match
    const createActor = (role, point, sheet, facing = 1) => {
      const [x, y] = this.toScreen(point)
      const kit = role === 'umpire' ? UMPIRE_KIT : role === 'batter' ? batting.kit : bowling.kit
      const actor = new CricketActor(this, { x, y, scale: this.playerScale(y), role, sheet, facing, kit, wood: role === 'batter' ? wood?.colors : null })
      this.track(actor.sprite)
      return actor
    }

    this.batter = createActor('batter', STRIKER, this.sheets.batter, -1)
    this.partner = createActor('batter', NON_STRIKER, this.sheets.batter, -1)
    this.bowler = createActor('bowler', BOWLER_START, this.sheets.bowler)
    this.keeper = createActor('keeper', KEEPER, this.sheets.keeper)
    this.umpire = createActor('umpire', [0.52, 0.391], this.sheets.umpire)
    for (let i = 0; i < 12; i++) this.umpire.sprite.setYaw?.(1.3)
    this.fielders = this.fieldPlan.positions.map(point =>
      createActor('fielder', point, this.sheets.fielder, point[0] < 0.5 ? 1 : -1),
    )
    this.actors = [this.batter, this.partner, this.bowler, this.keeper, this.umpire, ...this.fielders]
  }

  // Size on screen: players nearer the camera (lower on screen) are drawn larger.
  playerScale(y) {
    return 0.78 + (mapY(y / this.h) - 0.43) * 1.72
  }

  // Where a point of the match layout appears on screen.
  screenY(y) {
    return mapY(y / this.h) * this.h
  }

  framePoint(x, y) {
    const [px, py] = mapPoint(x / this.w, y / this.h)
    return [px * this.w, py * this.h]
  }

  toScreen([x, y]) {
    return [x * this.w, y * this.h]
  }

  place(actor, x, y, pose, phase, facing = actor.facing) {
    if (this.fielders.includes(actor)) y = Math.max(y, ropeY(x / this.w) * this.h + 3)
    if (actor.sprite.setYaw) this.turn(actor, x, y, pose)
    actor.setPosition(x, y).setScale(this.playerScale(y)).setPose(pose, phase, facing)
  }

  // 3D players: runners turn the way they are going; everyone else faces the play.
  turn(actor, x, y, pose) {
    const [sx, sy] = this.framePoint(x, y)
    let angle
    if (pose === 'run' && actor.screenAt) {
      const dx = sx - actor.screenAt[0]
      const dy = sy - actor.screenAt[1]
      const length = Math.hypot(dx, dy)
      angle = length > 0.05 ? -1.25 * dy / length : actor.heading ?? 0
    } else if (actor.role === 'batter') angle = sy < this.h * 0.58 ? -0.95 : 1
    else if (actor.role === 'bowler') angle = 1.2
    else if (actor.role === 'keeper') angle = -1.1
    else angle = sy > this.screenY(this.strikerSpot[1]) + 15 ? 0.9 : -0.9
    actor.heading = angle
    actor.screenAt = [sx, sy]
    actor.sprite.setYaw(angle)
  }

  setStage(stage, grade) {
    const changed = this.phase !== stage
    this.phase = stage
    if (this.timingElement) {
      this.timingElement.dataset.phase = stage
      if (grade) this.timingElement.dataset.grade = grade
      else delete this.timingElement.dataset.grade
      if (stage === 'ready' || stage === 'aim') this.timingElement.style.setProperty('--timing', '0%')
    }
    if (changed) this.onEvent('stage', stage)
  }

  // ---- Field ----

  applyFieldPlan(plan, changing) {
    this.fieldPlan = plan
    this.fieldChanging = changing
    this.fieldSpots = plan.positions.map(point => {
      const [x, y] = this.toScreen(point)
      const [mapX, mapY] = toRadarPoint(...point)
      const deep = Math.hypot(mapX - 50, mapY - 50) > 39
      return { x, y, deep, facing: x < this.w * STRIKER[0] ? 1 : -1 }
    })
    if (this.fieldDisplay) {
      this.fieldDisplay.label.textContent = plan.label
      this.fieldDisplay.dots.forEach((dot, index) => { dot.title = plan.names[index] })
      this.setFieldStatus(changing ? 'Changing the field' : '')
    }
  }

  setFieldPlan(id, fromNet = false) {
    const plan = FIELD_PLANS[id]
    if (!plan || plan === this.fieldPlan || this.paused) return false
    if (!['ready', 'aim', 'waiting'].includes(this.phase)) return false
    if (!fromNet && this.bowl !== 'user') return false
    this.applyFieldPlan(plan, true)
    this.aimMarker.setVisible(false)
    this.setStage('ready')
    this.nextDeliveryAt = this.elapsed + 150
    if (!fromNet) this.send({ t: 'field', id })
    this.onUpdate(this.snapshot())
    return true
  }

  cycleField() {
    const index = FIELD_ORDER.indexOf(this.fieldPlan.id)
    return this.setFieldPlan(FIELD_ORDER[(index + 1) % FIELD_ORDER.length])
  }

  setFieldStatus(message) {
    if (!this.fieldDisplay) return
    this.fieldDisplay.status.textContent = message
    this.fieldDisplay.status.dataset.active = String(Boolean(message))
  }

  updateFieldRadar() {
    if (!this.fieldDisplay || this.elapsed < this.nextRadarUpdate) return
    this.nextRadarUpdate = this.elapsed + 42
    for (let i = 0; i < this.fielders.length; i++) this.updateRadarMarker(this.fieldDisplay.dots[i], this.fielders[i])

    const ballDot = this.fieldDisplay.ball
    if (!ballDot) return
    if (this.ball.visible) {
      this.updateRadarMarker(ballDot, this.ballShadow)
    } else if (this.radarPositions.delete(ballDot)) {
      ballDot.removeAttribute('style')
    }
  }

  updateRadarMarker(dot, object) {
    if (!dot) return
    const [mapX, mapY] = toRadarPoint(object.x / this.w, object.y / this.h, this.radarPoint)
    const x = Math.round(mapX)
    const y = Math.round(mapY)
    const position = x * 101 + y
    if (this.radarPositions.get(dot) === position) return
    dot.style.setProperty('--field-x', `${x}%`)
    dot.style.setProperty('--field-y', `${y}%`)
    this.radarPositions.set(dot, position)
  }

  // ---- Between balls ----

  get powerplayBalls() {
    return 6 * Math.max(1, Math.round(this.innings.maxBalls / 6 * .3))
  }

  beginReady(delay) {
    this.delivery = null
    this.play = null
    const innings = this.innings
    if (this.bowl === 'ai') {
      const nextPlan = selectFieldPlan({
        currentPlan: this.fieldPlan,
        deliveries: this.recentDeliveries,
        balls: innings.balls,
        totalBalls: innings.maxBalls,
        wickets: innings.wickets,
        difficulty: this.difficulty,
      })
      if (nextPlan !== this.fieldPlan || (innings.balls === this.powerplayBalls && innings.over.length === 0)) this.applyFieldPlan(nextPlan, true)
    }
    if (this.newBatter) {
      this.newBatter = false
      this.walkIn = true
      this.batter.setPosition(this.w * 0.9, this.h * 0.985).setScale(this.playerScale(this.h * 0.985))
    }
    this.overBreak = false
    this.setStage('ready')
    this.nextDeliveryAt = this.elapsed + delay
  }

  requestBowler() {
    const innings = this.innings
    if (innings.bowler != null) return true
    if (this.bowl === 'ai') {
      innings.autoBowler(this.rng)
      this.onUpdate(this.snapshot())
      return true
    }
    if (this.bowl === 'user' && !this.askedBowler) {
      this.askedBowler = true
      const options = innings.bowlingOptions().slice(0, 5).map(index => {
        const bowler = innings.bowlers[index]
        return { index, name: bowler.name, style: bowler.style, rating: bowler.rating, overs: `${Math.floor(bowler.balls / 6)}.${bowler.balls % 6}`, runs: bowler.runs, wickets: bowler.wickets }
      })
      this.onEvent('needBowler', options)
    }
    return false
  }

  chooseBowler(index, fromNet = false) {
    const innings = this.innings
    if (innings.bowler != null || !innings.bowlers[index]) return
    innings.setBowler(index)
    this.askedBowler = false
    this.aim.type = null
    if (!fromNet) this.send({ t: 'bowler', index })
    this.onUpdate(this.snapshot())
  }

  get bowlerStyle() {
    const innings = this.innings
    return innings.bowlers[innings.bowler ?? innings.lastBowler ?? 0]?.style || 'pace'
  }

  update(_time, delta) {
    if (this.paused || this.done) return
    const play = this.play
    const highlight = play && !play.scored && (play.boundary || play.outcome.wicket)
    this.frameDelta = Math.min(delta, 50) * (highlight ? 0.76 : 1)
    if (this.phase === 'replay') {
      this.updateReplay()
      this.updateCamera()
      return
    }
    this.elapsed += this.frameDelta

    if (this.phase === 'ready') this.updateReady()
    else if (this.phase === 'aim' || this.phase === 'waiting') this.updateAim()
    else if (this.phase === 'runup') this.updateRunUp()
    else if (this.phase === 'hold') this.updateHold()
    else if (this.phase === 'flight') this.updateFlight()
    else if (this.phase === 'result') this.updatePlay()

    const call = this.play
    if (call?.scored && (call.final.wicket || call.boundary)) {
      const sinceCall = this.elapsed - call.scoredAt
      const signal = call.final.wicket ? 'signal' : call.final.runs === 6 ? 'six' : 'four'
      this.umpire.setPose(signal, progress(sinceCall, 880))
    } else {
      this.umpire.setPose('idle', cycle(this.elapsed, 2500))
    }
    this.updateFx()
    if ((this.phase === 'flight' || this.phase === 'result') && !this.play?.scored) this.captureFrame()
    this.updateCamera()
    this.updateFieldRadar()
  }

  updateIdlePlayers() {
    const [x, y] = this.bowlerStart
    this.moveHome(this.bowler, x, y, 'idle', 10)
    this.moveHome(this.keeper, this.keeperSpot[0], this.keeperSpot[1], 'keeper', 4)
    this.updateBatters()
    let fieldSet = true
    for (let index = 0; index < this.fielders.length; index++) {
      const fielder = this.fielders[index]
      const spot = this.fieldSpots[index]
      const speed = 4.4 + (spot.y / this.h) * 1.8
      if (!this.moveHome(fielder, spot.x, spot.y, 'ready', speed, index, spot.facing)) fieldSet = false
    }
    return fieldSet
  }

  updateReady() {
    if (!this.updateIdlePlayers() || this.walkIn) return

    if (this.fieldChanging) {
      this.fieldChanging = false
      this.setFieldStatus('')
      this.nextDeliveryAt = Math.max(this.nextDeliveryAt, this.elapsed + 300)
    }
    if (this.elapsed < this.nextDeliveryAt || !this.requestBowler()) return
    if (this.bowl === 'ai') this.startDelivery(this.aiDelivery())
    else if (this.bowl === 'user') this.enterAim()
    else this.setStage('waiting')
  }

  moveHome(actor, x, y, pose, speed, offset = 0, facing = actor.facing) {
    const distance = distanceBetween(actor.x, actor.y, x, y)
    if (distance < 2) {
      this.place(actor, x, y, pose, cycle(this.elapsed + offset * 160, 1640), facing)
      return true
    }

    const step = Math.min(1, speed * this.frameDelta / (16.67 * distance))
    this.place(actor, lerp(actor.x, x, step), lerp(actor.y, y, step), 'run', cycle(this.elapsed, 420), Math.sign(x - actor.x) || 1)
    return false
  }

  // ---- The user's bowling ----

  enterAim() {
    const options = DELIVERIES[this.bowlerStyle]
    if (!options.some(option => option.id === this.aim.type)) this.aim.type = options[0].id
    this.setStage('aim')
    this.reportAim()
    this.onUpdate(this.snapshot())
  }

  aimPoint(line = this.aim.line, length = this.aim.length) {
    const [fromX, fromY] = this.releasePoint
    return [lerp(fromX, this.w * TARGET_X + line, length), lerp(fromY, this.strikerSpot[1], length)]
  }

  // nx, ny are fractions of the visible frame.
  aimAt(nx, ny) {
    if (this.phase !== 'aim' || this.paused) return
    // Screen point under the finger, then back to the match layout.
    const halfW = this.w / 2 / this.cam.zoom
    const halfH = this.h / 2 / this.cam.zoom
    const [camX, camY] = this.framePoint(this.cam.x, this.cam.y)
    const screenX = clamp(camX, halfW, this.w - halfW) + (nx - 0.5) * this.w / this.cam.zoom
    const screenY = clamp(camY, halfH, this.h - halfH) + (ny - 0.5) * this.h / this.cam.zoom
    const [layoutX, layoutY] = unmapPoint(screenX / this.w, screenY / this.h)
    const worldX = layoutX * this.w
    const worldY = layoutY * this.h
    const [fromX, fromY] = this.releasePoint
    const length = clamp((worldY - fromY) / (this.strikerSpot[1] - fromY), 0.36, 0.985)
    const line = clamp((worldX - fromX) / length + fromX - this.w * TARGET_X, -62, 62)
    this.aim.length = length
    this.aim.line = line
    this.reportAim()
  }

  nudgeAim(dx, dy) {
    if (this.phase !== 'aim' || this.paused) return
    this.aim.line = clamp(this.aim.line + dx * 4, -62, 62)
    this.aim.length = clamp(this.aim.length + dy * 0.03, 0.36, 0.985)
    this.reportAim()
  }

  reportAim() {
    const text = `${lengthName(this.aim.length)} · ${lineName(this.aim.line - STUMP_LINE)}`
    if (text === this.aimText) return
    this.aimText = text
    this.onEvent('aim', text)
  }

  setDeliveryType(id) {
    if (!['aim', 'ready'].includes(this.phase)) return
    if (DELIVERIES[this.bowlerStyle].some(option => option.id === id)) this.aim.type = id
  }

  // One button: start the run-up, then press again to set the release.
  bowlPress() {
    if (this.paused || this.bowl !== 'user') return
    if (this.phase === 'aim') {
      this.send({ t: 'runup', n: this.ballCount })
      this.startDelivery({ user: true })
    } else if (this.phase === 'runup' && this.delivery.meter == null) {
      this.lockMeter()
    }
  }

  lockMeter() {
    const delivery = this.delivery
    delivery.meter = progress(this.elapsed - delivery.startedAt, RUN_UP + RELEASE)
    this.timingElement?.style.setProperty('--timing', Math.round(delivery.meter * 100) + '%')
    this.settleUserSpec()
  }

  settleUserSpec() {
    const delivery = this.delivery
    if (delivery.spec.settled) return
    const meter = delivery.meter
    const accuracy = meter == null ? 0.32 : clamp(1 - Math.abs(meter - METER_SWEET) / 0.3, 0.05, 1)
    const noBall = meter != null && meter > METER_NO_BALL
    const miss = 1 - accuracy
    const bowler = this.innings.bowlers[this.innings.bowler]
    const def = deliveryDef(bowler.style, this.aim.type)
    const basePace = (bowler.style === 'spin' ? 900 : 905 - (bowler.rating - 60) * 3.2) * def.pace * (1.07 - 0.1 * accuracy)
    delivery.spec = {
      settled: true, type: def.id, accuracy, noBall,
      aimLine: clamp(this.aim.line + this.rng.float(-1, 1) * miss * 17, -66, 66),
      bounceAt: clamp(this.aim.length + this.rng.float(-1, 1) * miss * 0.09, 0.34, 0.99),
      pace: Math.round(basePace),
    }
    this.onEvent('meter', noBall ? 'No ball!' : accuracy > 0.75 ? 'Perfect release' : accuracy > 0.4 ? 'Good release' : 'Loose release')
    this.send({ t: 'bowl', n: this.ballCount, spec: delivery.spec })
  }

  aiDelivery() {
    const innings = this.innings
    const bowler = innings.bowlers[innings.bowler]
    const style = bowler.style || 'pace'
    const rng = this.rng
    const def = rng.weighted(DELIVERIES[style].map((option, index) => [option, index === 0 ? 1.6 : 1]))
    const pace = (rng.int(770, 1010) - (bowler.rating - 75) * 3 + (AI_PACE_SHIFT[this.difficulty] ?? 0)) * def.pace
    const wide = rng() < 0.024
    const built = this.movement(def, bowler)
    const line = STUMP_LINE + (wide ? (rng() < 0.5 ? -1 : 1) * rng.float(WIDE_LIMIT + 5, WIDE_LIMIT + 11) : rng.float(-26, 26))
    return {
      settled: true, type: def.id, accuracy: rng.float(0.5, 0.95), noBall: rng() < 0.012,
      aimLine: line - built.dev, bounceAt: rng.float(0.54, 0.76), pace: Math.round(pace),
    }
  }

  movement(def, bowler) {
    const skill = 0.6 + bowler.rating / 200
    const swingPx = def.swing * 15 * this.pitch.swing * skill
    const turnPx = def.turn * 13 * this.pitch.turn * skill
    return { swingPx, dev: swingPx * 0.45 + turnPx }
  }

  startDelivery(spec) {
    this.play = null
    const innings = this.innings
    this.delivery = {
      startedAt: this.elapsed, spec, intent: null, meter: null, n: this.ballCount,
      style: innings.bowlers[innings.bowler].style || 'pace',
    }
    this.tape.length = 0
    this.setStage('runup')
  }

  updateAim() {
    this.updateIdlePlayers()
    if (this.phase === 'aim') {
      const [x, y] = this.aimPoint()
      const pulse = 1 + 0.08 * Math.sin(this.elapsed / 140)
      this.aimMarker.setPosition(x, y).setScale(this.playerScale(y) * 0.62 * pulse).setVisible(true)
    } else if (this.remote.runup) {
      this.remote.runup = false
      this.startDelivery({ remote: true })
    }
  }

  updateRunUp() {
    const delivery = this.delivery
    const runTime = this.elapsed - delivery.startedAt
    const p = progress(runTime, RUN_UP)
    const [startX, startY] = this.bowlerStart
    const [creaseX, creaseY] = this.bowlerCrease

    if (this.bowl === 'user') {
      const meter = delivery.meter ?? progress(runTime, RUN_UP + RELEASE)
      const marker = Math.round(meter * 100)
      if (marker !== this.lastMarker) {
        this.timingElement?.style.setProperty('--timing', marker + '%')
        this.lastMarker = marker
      }
    }

    if (runTime < RUN_UP) {
      const stride = p * (0.43 + 0.57 * p)
      this.place(this.bowler, lerp(startX, creaseX - 10, stride), lerp(startY, creaseY - 15, stride), 'run', cycle(runTime, 300), 1)
    } else {
      const pRelease = progress(runTime - RUN_UP, RELEASE)
      this.place(this.bowler, creaseX - 10 + pRelease * 10, creaseY - (1 - pRelease) * 15, 'bowl', pRelease * 0.58, 1)
      if (pRelease === 1) this.tryRelease()
    }

    this.keeper.setPose('keeper', cycle(this.elapsed, 1140))
    this.updateFieldReady()
    this.updateBatters()
  }

  // Online play: each side waits here for the other's half of the delivery.
  tryRelease() {
    const delivery = this.delivery
    if (this.bowl === 'user') this.settleUserSpec()
    if (this.bowl === 'remote') {
      if (!this.remote.spec) { this.setStage('hold'); return }
      delivery.spec = this.remote.spec
    }
    if (this.net?.role === 'mirror') {
      if (this.remote.releasedAt == null || this.elapsed < this.remote.releasedAt + 90) { this.setStage('hold'); return }
    }
    this.releaseBall()
  }

  updateHold() {
    const [creaseX, creaseY] = this.bowlerCrease
    this.place(this.bowler, creaseX, creaseY, 'bowl', 0.58, 1)
    this.keeper.setPose('keeper', cycle(this.elapsed, 1140))
    this.updateBatters()
    this.tryRelease()
  }

  releaseBall() {
    const delivery = this.delivery
    const innings = this.innings
    const bowler = innings.bowlers[innings.bowler]
    const spec = delivery.spec
    const def = deliveryDef(delivery.style, spec.type)
    const { swingPx, dev } = this.movement(def, bowler)
    Object.assign(delivery, {
      def, type: def.id, accuracy: spec.accuracy, noBall: Boolean(spec.noBall), pace: spec.pace,
      aimLine: spec.aimLine, bounceAt: spec.bounceAt, swingPx, dev, line: spec.aimLine + dev,
    })
    delivery.wide = Math.abs(delivery.line - STUMP_LINE) > WIDE_LIMIT
    delivery.window = this.perfectWindow(def)
    delivery.releasedAt = this.elapsed
    delivery.impactAt = this.elapsed + delivery.pace
    const scale = this.playerScale(this.bowler.y)
    delivery.fromX = this.bowler.x + 12 * scale
    delivery.fromY = this.bowler.y
    delivery.releaseHeight = 72 * scale
    delivery.bounced = false
    this.aimMarker.setVisible(false)
    this.setStage('flight')
    this.drawBall(delivery.fromX, delivery.fromY, delivery.releaseHeight, 0.35)
    this.trail.start()
    this.soundEffect('whoosh')
    if (this.net?.role === 'auth') this.send({ t: 'released', n: this.ballCount })
    if (this.bat === 'ai') this.planAiShot()
  }

  perfectWindow(def) {
    const innings = this.innings
    const batter = innings.batters[innings.striker]
    const style = this.bowlerStyle
    const surface = this.pitch.window * (style === 'spin' ? this.pitch.spinWindow : this.pitch.paceWindow)
    return (BASE_WINDOW[this.difficulty] ?? BASE_WINDOW.Medium) * (0.86 + batter.rating / 350) * surface * (def?.window ?? 1) * (1 + this.batPerk.timing)
  }

  ballPoint(delivery, t) {
    const targetX = this.w * TARGET_X
    const targetY = delivery.targetY ?? this.batter.y
    let x = lerp(delivery.fromX, targetX + delivery.aimLine, t)
    if (t < delivery.bounceAt) x -= delivery.swingPx * 0.55 * Math.sin(Math.PI * t / delivery.bounceAt)
    else x += delivery.dev * (t - delivery.bounceAt) / (1 - delivery.bounceAt)
    return [x, lerp(delivery.fromY, targetY, t)]
  }

  updateFlight() {
    const delivery = this.delivery
    const flightTime = this.elapsed - delivery.releasedAt
    const t = flightTime / delivery.pace
    const travel = clamp(t, 0, 1.17)
    this.updateBatters()
    delivery.targetY = this.batter.y
    const [x, y] = this.ballPoint(delivery, travel)
    if (this.bat === 'user') {
      const [bounceX, bounceY] = this.ballPoint(delivery, delivery.bounceAt)
      if (!delivery.hinted) {
        delivery.hinted = true
        // The hint is coloured by the side the ball favours: leg, straight or off.
        const side = this.shotFit('leg') === 'natural' ? 0xff8a5c : this.shotFit('off') === 'natural' ? 0x6fd3ff : 0xffcf59
        this.bounceMarker.setTint(this.settings.pitchHint !== false ? side : 0xffcf59)
      }
      this.bounceMarker.setPosition(bounceX, bounceY)
        .setVisible(t < delivery.bounceAt + .12 && (this.settings.pitchHint !== false || Math.abs(t - delivery.bounceAt) < .12))
    }
    const bouncePeak = (12 + 60 * clamp(0.92 - delivery.bounceAt, 0, 0.5)) * (delivery.style === 'spin' ? 0.82 : 1)
    let height = delivery.releaseHeight * (1 - progress(t, delivery.bounceAt)) ** 1.2
    if (t > delivery.bounceAt) {
      const bounce = (t - delivery.bounceAt) / (1.24 - delivery.bounceAt)
      height = bouncePeak * (1 - (2 * bounce - 1) ** 2)
      if (!delivery.bounced) {
        delivery.bounced = true
        this.fx.dustAt = this.elapsed
        const [dustX, dustY] = this.ballPoint(delivery, delivery.bounceAt)
        this.dust.setPosition(dustX, dustY)
        this.soundEffect('bounce')
      }
    }

    this.drawBall(x, y, Math.max(0, height), lerp(0.35, 0.66, Math.min(t, 1)))
    this.updateBowlerFollowThrough(flightTime)
    this.updateFieldReady()
    const [keeperX, keeperY] = this.keeperSpot
    this.place(this.keeper, keeperX + delivery.line * Math.max(0, t - 0.35), keeperY, 'keeper', cycle(flightTime, 880))

    if (this.bat === 'user') {
      const centerAt = delivery.impactAt - CONTACT_DELAY
      const position = 50 + 100 * (this.elapsed - centerAt) / (delivery.pace * 0.94)
      const lockedPosition = delivery.intent?.timing
      const marker = Math.round(clamp(lockedPosition ?? position, 0, 100))
      if (marker !== this.lastMarker) {
        this.timingElement?.style.setProperty('--timing', marker + '%')
        this.lastMarker = marker
      }
    } else if (this.bat === 'ai' && this.aiPlan && !delivery.intent && this.elapsed >= this.aiPlan.at) {
      this.applyAiPlan()
    }

    const intent = delivery.intent
    const waitingOnOpponent = this.bat === 'remote'
    if (intent?.hit && this.elapsed >= intent.contactAt) {
      if (waitingOnOpponent && !this.remote.shot) this.elapsed -= this.frameDelta
      else this.beginShot(intent, this.remote.shot)
    } else if (this.elapsed >= delivery.impactAt + 100) {
      if (waitingOnOpponent && !this.remote.miss) {
        // The batter's device is the referee: wait if its verdict has not arrived yet.
        if (this.remote.shot) this.beginShot({ ...this.remote.shot.intent, hit: true, startedAt: this.elapsed - SWING_TIME, contactAt: this.elapsed }, this.remote.shot)
        else this.elapsed -= this.frameDelta
      } else {
        this.beginMiss(this.remote.miss)
      }
    }
  }

  updateBowlerFollowThrough(flightTime) {
    const [x, y] = this.bowlerCrease
    const stride = smooth(progress(flightTime, 390))
    this.place(this.bowler, x + stride * 16, y + stride * 29, 'bowl', 0.58 + 0.42 * progress(flightTime, 370), 1)
  }

  updateFieldReady() {
    const p = this.phase === 'runup' ? progress(this.elapsed - this.delivery.startedAt, RUN_UP) : 1
    for (let index = 0; index < this.fielders.length; index++) {
      const fielder = this.fielders[index]
      const spot = this.fieldSpots[index]
      const step = spot.deep ? 0 : p * 0.026
      const x = lerp(spot.x, this.w * STRIKER[0], step)
      const y = lerp(spot.y, this.h * STRIKER[1], step)
      this.place(fielder, x, y, 'ready', cycle(this.elapsed + index * 170, 1670), spot.facing)
    }
  }

  // ---- Batters ----

  updateBatters() {
    this.updateStriker()
    this.updateNonStriker()
  }

  updateStriker() {
    const [x, y] = this.strikerSpot
    if (this.walkIn) {
      if (this.moveHome(this.batter, x, y, 'ready', 8.5, 0, -1)) this.walkIn = false
      return
    }
    const offset = this.footwork === 'advance' ? -14 : this.footwork === 'back' ? 7 : 0
    const targetY = y + offset
    const maxStep = this.frameDelta * 0.16
    const batterY = this.batter.y + clamp(targetY - this.batter.y, -maxStep, maxStep)
    const intent = this.delivery?.intent

    if (intent?.grade === 'leave') {
      this.place(this.batter, lerp(this.batter.x, x + 10, 1 - Math.exp(-this.frameDelta / 75)), batterY, 'ready', 0.84, -1)
    } else if (intent && this.elapsed - intent.startedAt <= SWING_TIME) {
      this.batter.setPose('swing', progress(this.elapsed - intent.startedAt, SWING_TIME), -1)
    } else {
      const readyTime = this.elapsed - (this.delivery?.startedAt ?? 0)
      this.place(this.batter, lerp(this.batter.x, x, 1 - Math.exp(-this.frameDelta / 75)), batterY, 'ready', cycle(readyTime, 1190), -1)
    }
  }

  updateNonStriker() {
    const [homeX, homeY] = this.partnerSpot
    const liveDelivery = this.phase === 'flight'
    if (liveDelivery) {
      // Back up only after release, with a few steps towards the far end.
      const sinceRelease = this.elapsed - this.delivery.releasedAt - 30
      const step = smooth(progress(sinceRelease, 430))
      const pose = step > 0 && step < 1 ? 'run' : 'idle'
      this.place(this.partner, homeX - step * 11, homeY + step * 34, pose, cycle(Math.max(0, sinceRelease), 465), -1)
      return
    }

    // On a leave, dot, or boundary the partner can walk back into their ground.
    const distance = distanceBetween(this.partner.x, this.partner.y, homeX, homeY)
    const step = Math.min(1, this.frameDelta * 0.10 / Math.max(1, distance))
    const pose = distance > 2 ? 'run' : 'idle'
    const facing = distance > 2 && this.partner.y < homeY ? 1 : -1
    this.place(this.partner, lerp(this.partner.x, homeX, step), lerp(this.partner.y, homeY, step), pose, cycle(this.elapsed, 570), facing)
  }

  setFootwork(footwork) {
    if (this.paused || this.finished || this.bat !== 'user' || this.phase === 'result' || this.phase === 'replay' || this.delivery?.intent) return
    this.footwork = this.footwork === footwork ? null : footwork
  }

  canPlayBall() {
    return this.bat === 'user' && this.phase === 'flight' && !this.delivery.intent && !this.paused
  }

  leave() {
    if (!this.canPlayBall()) return
    this.delivery.intent = { grade: 'leave', hit: false, timing: 100 }
    this.send({ t: 'leave', n: this.ballCount })
  }

  // How well a shot direction suits the ball: with the line, across it, or neither.
  shotFit(direction, delivery = this.delivery) {
    const offset = delivery.line - STUMP_LINE
    const natural = offset < -LINE_BAND ? 'leg' : offset > LINE_BAND ? 'off' : 'straight'
    if (direction === natural) return 'natural'
    return natural === 'straight' || direction === 'straight' ? 'neutral' : 'against'
  }

  // 0 to 1: how well the rope in that direction is patrolled.
  boundaryCover(direction) {
    const [x, y] = this.toScreen(boundaryPoint(direction))
    let nearest = Infinity
    for (let index = 0; index < this.fieldSpots.length; index++) {
      const spot = this.fieldSpots[index]
      if (spot.deep) nearest = Math.min(nearest, distanceBetween(spot.x, spot.y, x, y))
    }
    return clamp(1 - nearest / 170, 0, 1)
  }

  swing(direction = 'straight', loft = this.selectedShot === 'loft') {
    if (!this.canPlayBall()) return
    const delivery = this.delivery
    const { impactAt, pace, window } = delivery
    const rng = this.rng

    // Score the swing at the instant the bat will pass the ball, rather than on tap.
    const contactAt = this.elapsed + CONTACT_DELAY
    const timingError = (contactAt - impactAt) / pace
    const accuracy = Math.abs(timingError)
    const power = this.batPerk.power + (this.innings.batters[this.innings.striker].rating - 70) / 500
    const surface = this.pitch.boundary
    const fit = this.shotFit(direction)
    const yorker = delivery.bounceAt >= 0.88
    let grade = timingError < 0 ? 'early' : 'late'
    let runs = 0
    let caught = false
    let catchDeep = false
    let hit = false
    let saved = false
    const pick = table => rng.weighted(table)
    if (accuracy <= window) {
      grade = 'perfect'
      hit = true
      let result
      if (loft && !yorker) {
        result = fit === 'natural' ? pick([[6, (0.3 + power) * surface], [4, 0.2], [2, 0.2], [1, 0.18], ['deep', 0.12]])
          : fit === 'neutral' ? pick([[6, (0.16 + power) * surface], [4, 0.18], [2, 0.24], [1, 0.26], ['deep', 0.16]])
            : pick([[6, 0.05], [4, 0.08], [2, 0.15], [1, 0.37], ['deep', 0.35]])
      } else {
        result = fit === 'natural' ? pick([[6, yorker ? 0 : 0.03 + power], [4, 0.34 * surface], [3, 0.12], [2, 0.27], [1, 0.24]])
          : fit === 'neutral' ? pick([[4, 0.16 * surface], [3, 0.1], [2, 0.32], [1, 0.42]])
            : pick([[4, 0.04], [2, 0.2], [1, 0.56], ['edge', 0.08 * this.pitch.edge], ['miss', 0.12]])
      }
      // Deep fielders on that side cut off fours and get under lofted hits.
      const cover = this.boundaryCover(direction)
      if (result === 4 && !loft && rng() < cover * 0.7) { result = 2; saved = true }
      else if (result === 6 && rng() < cover * 0.22) result = 'deep'
      else if (result === 6 && rng() < cover * 0.2) result = 4
      if (result === 'deep') { caught = true; catchDeep = true }
      else if (result === 'edge') caught = true
      else if (result === 'miss') hit = false
      else runs = result
    } else if (accuracy <= 0.27) {
      grade = 'good'
      hit = true
      const result = loft && !yorker ? pick([['deep', 0.22 * this.pitch.edge], [4, 0.14], [2, 0.26], [1, 0.38]])
        : fit === 'against' ? pick([['edge', 0.1 * this.pitch.edge], ['miss', 0.2], [1, 0.5], [2, 0.2]])
          : pick([[1, 0.5], [2, 0.33], [3, 0.12], ['miss', 0.05]])
      if (result === 'deep') { caught = true; catchDeep = true }
      else if (result === 'edge') caught = true
      else if (result === 'miss') hit = false
      else runs = result
    } else if (accuracy <= 0.41 && rng() < 0.38 * this.pitch.edge) {
      caught = true
      hit = true
    }

    const intent = {
      direction, loft, grade, runs, caught, catchDeep, saved, fit, hit,
      timing: 50 + 100 * timingError / 0.94,
      contactAt: Math.min(contactAt, impactAt + 96),
      startedAt: this.elapsed,
    }
    delivery.intent = intent
    this.send({ t: 'swing', n: this.ballCount, direction, loft, grade, hit, offset: intent.contactAt - impactAt })
  }

  // ---- The computer's batting ----

  planAiShot() {
    const delivery = this.delivery
    const innings = this.innings
    const rng = this.rng
    const batter = innings.batters[innings.striker]
    const bowler = innings.bowlers[innings.bowler]
    const offset = delivery.line - STUMP_LINE
    const distance = Math.abs(offset)
    const swingAt = delivery.impactAt - CONTACT_DELAY
    if (delivery.wide) {
      this.aiPlan = { at: delivery.releasedAt + 120, action: 'leave' }
      return
    }

    const repeats = this.recentTypes.filter(entry => entry.type === delivery.type && Math.abs(entry.length - delivery.bounceAt) < 0.08).length
    const threat = ballThreat({
      bowlRating: bowler.rating, batRating: batter.rating, accuracy: delivery.accuracy,
      lengthScore: lengthScore(delivery.bounceAt), lineScore: distance <= 8 ? 0.95 : distance <= 22 ? 0.8 : 0.45,
      movement: clamp(Math.abs(delivery.dev) / 14, 0, 1) * 0.7 + delivery.def.variety * 0.5,
      bias: (AI_BAT_BIAS[this.difficulty] ?? 0) - repeats * 0.07,
    })
    const push = aggression(innings)
    const direction = rng.weighted(offset < -6 ? [['leg', 0.6], ['straight', 0.25], ['off', 0.15]]
      : offset > 10 ? [['off', 0.6], ['straight', 0.25], ['leg', 0.15]]
        : [['leg', 0.3], ['straight', 0.4], ['off', 0.3]])
    const plan = PLAN_MODS[this.fieldPlan.id] || PLAN_MODS.balanced
    const boundary = plan.boundary * (plan.side ? (plan.side === direction ? 0.55 : 1) : 1) * this.pitch.boundary
    const outcome = rollOutcome(threat, push, rng, { wicket: plan.wicket * (0.6 + 0.4 * this.pitch.edge), boundary })

    const next = { direction, loft: outcome.loft, runs: outcome.runs, caught: false, catchDeep: false }
    if (outcome.wicket && delivery.noBall) outcome.wicket = false
    if (outcome.wicket) {
      const straight = distance <= 8 && delivery.bounceAt >= 0.62
      const kind = straight ? rng.weighted([['bowled', 0.5], ['lbw', 0.25], ['caught', 0.25]]) : 'caught'
      if (kind === 'caught') {
        next.action = 'hit'
        next.caught = true
        next.catchDeep = outcome.loft
        next.grade = rng() < 0.5 ? 'early' : 'late'
      } else {
        next.action = 'miss'
        next.kind = kind
        next.grade = rng() < 0.5 ? 'early' : 'late'
      }
    } else if (outcome.runs > 0) {
      next.action = 'hit'
      next.grade = outcome.runs >= 4 ? 'perfect' : 'good'
    } else if (distance > 20 && rng() < 0.6) {
      next.action = 'leave'
    } else if (rng() < 0.5) {
      // A defensive push straight to a fielder.
      next.action = 'hit'
      next.grade = 'good'
      next.direction = 'straight'
    } else {
      next.action = 'miss'
      next.kind = 'gather'
      next.grade = rng() < 0.5 ? 'early' : 'late'
    }
    const slip = next.grade === 'perfect' ? 0 : next.grade === 'good' ? rng.float(-40, 40) : next.grade === 'early' ? -rng.float(90, 150) : rng.float(60, 95)
    next.at = next.action === 'leave' ? delivery.releasedAt + 160 : swingAt + slip
    this.aiPlan = next
  }

  applyAiPlan() {
    const plan = this.aiPlan
    const delivery = this.delivery
    this.aiPlan = null
    if (plan.action === 'leave') {
      delivery.intent = { grade: 'leave', hit: false, timing: 100 }
      return
    }
    delivery.forcedMiss = plan.action === 'miss' ? { kind: plan.kind } : null
    delivery.intent = {
      direction: plan.direction, loft: plan.loft, grade: plan.grade, runs: plan.runs, caught: plan.caught, catchDeep: plan.catchDeep,
      hit: plan.action === 'hit', timing: 50,
      contactAt: Math.min(this.elapsed + CONTACT_DELAY, delivery.impactAt + 96),
      startedAt: this.elapsed,
    }
  }

  // ---- Shots ----

  beginShot(attempt, resolved = null) {
    this.soundEffect('hit', attempt.grade === 'perfect' ? 1 : 0.7)
    this.vibrate(attempt.grade === 'perfect' ? 25 : 12)
    const fromX = this.ball.x
    const fromY = this.ballShadow.y
    const side = attempt.direction === 'leg' ? -1 : attempt.direction === 'off' ? 1 : 0
    const boundary = attempt.runs >= 4
    let intent
    let fielder
    let destinationX
    let destinationY
    let intercepted = false
    if (resolved) {
      intent = { ...attempt, ...resolved.intent }
      fielder = this.fielders[resolved.fielder] || this.fielders[0]
      ;[destinationX, destinationY] = this.toScreen(resolved.dest)
      intercepted = resolved.intercepted
    } else {
      ;[destinationX, destinationY] = this.shotDestination(attempt, side)
      const interception = this.findInterception(attempt, fromX, fromY, destinationX, destinationY)
      intent = interception ? { ...attempt, runs: attempt.runs - 1 } : { ...attempt }
      let runOut = false
      if (interception && intent.runs >= 2) {
        // A fielder cutting off the ball early makes a second run a real gamble.
        const earlyGather = clamp((0.76 - interception.fraction) / 0.28, 0, 1)
        const risk = clamp(0.2 + earlyGather * 0.22 + (intent.runs === 3 ? 0.28 : 0), 0, 0.72) * (this.bat === 'ai' ? 0.45 : 1)
        runOut = this.rng() < risk
        if (runOut) intent.runs--
      }
      intent.runOut = runOut
      fielder = interception?.fielder ?? this.closestFielder(destinationX, destinationY)
      if (attempt.saved && !interception) {
        // Hauled in by the man on the rope.
        const [ropeX, ropeTop] = this.toScreen(boundaryPoint(intent.direction))
        fielder = this.closestFielder(ropeX, ropeTop)
        destinationX = lerp(this.w * 0.5, ropeX, 0.88)
        destinationY = lerp(this.h * BOUNDARY_CENTER_Y, ropeTop, 0.88)
      }

      if (intent.caught && intent.catchDeep) {
        // A skied ball comes down near the man in the deep on that side.
        const [ropeX, ropeTop] = this.toScreen(boundaryPoint(intent.direction))
        fielder = this.closestFielder(ropeX, ropeTop)
        destinationX = lerp(fielder.x, this.w * STRIKER[0], 0.1)
        destinationY = lerp(fielder.y, this.h * STRIKER[1], 0.1)
      } else if (intent.caught) {
        fielder = this.fielders[side === 1 ? 1 : 0]
        destinationX = fielder.x + (side === 1 ? -8 : 8)
        destinationY = fielder.y - 1
      } else if (interception) {
        intercepted = true
        destinationX = interception.x
        destinationY = interception.y
      }
      if (this.net?.role === 'auth') {
        this.send({
          t: 'shot', n: this.ballCount, fielder: this.fielders.indexOf(fielder), intercepted,
          dest: [destinationX / this.w, destinationY / this.h],
          intent: { direction: intent.direction, loft: intent.loft, grade: intent.grade, runs: intent.runs, caught: intent.caught, catchDeep: intent.catchDeep, runOut: intent.runOut },
        })
      }
    }
    const runOut = Boolean(intent.runOut)
    const deepCatch = intent.caught && intent.catchDeep

    const running = this.planRunning(intent)
    const flight = running ? Math.round(running.duration * 0.55) : deepCatch ? 1050 : intent.caught ? 590 : intent.runs === 6 ? 960 : 780
    // Allow time for the runners to make their ground as the throw comes back.
    const throwTime = running ? Math.max(270, running.duration - flight - 275) : 270
    const fieldingTime = boundary ? 0 : intent.caught ? 430 : 255 + throwTime
    let fieldGoalX = destinationX - Math.sign(destinationX - fielder.x) * 9
    let fieldGoalY = destinationY + 2
    let diveAt = null
    if (boundary) {
      const [ropeX, ropeTop] = this.toScreen(boundaryPoint(intent.direction))
      fieldGoalX = lerp(ropeX, this.w * 0.5, 0.065)
      fieldGoalY = lerp(ropeTop, this.h * BOUNDARY_CENTER_Y, 0.065)
      const chaseDistance = distanceBetween(fielder.x, fielder.y, fieldGoalX, fieldGoalY)
      const reach = Math.min(1, (flight - 60) * 0.31 / Math.max(1, chaseDistance))
      fieldGoalX = lerp(fielder.x, fieldGoalX, reach)
      fieldGoalY = lerp(fielder.y, fieldGoalY, reach)
      if (intent.runs === 4 && chaseDistance <= (flight - 260) * 0.31) diveAt = flight - 240
    }
    const diveEnd = diveAt === null ? 0 : diveAt + DIVE_DURATION
    const duration = Math.max(running?.duration ?? 0, flight + fieldingTime, diveEnd, 690)
    const backingUp = this.fielders.filter(actor => actor !== fielder).map(actor => {
      const distance = distanceBetween(actor.x, actor.y, destinationX, destinationY)
      const step = Math.min(0.18, 22 / Math.max(1, distance))
      return {
        actor, fromX: actor.x, fromY: actor.y,
        toX: lerp(actor.x, destinationX, step), toY: lerp(actor.y, destinationY, step),
      }
    })
    const label = intent.caught ? 'OUT! CAUGHT' : runOut ? 'OUT! RUN OUT' : boundary ? intent.runs === 6 ? 'SIX!' : 'FOUR!'
      : intent.runs === 0 ? 'DOT BALL' : `${intent.runs} RUN${intent.runs === 1 ? '' : 'S'}`
    const play = {
      kind: 'shot', fromX, fromY, fromHeight: this.ballHeight,
      destinationX, destinationY, fielder, fielderX: fielder.x, fielderY: fielder.y,
      fieldGoalX, fieldGoalY, diveAt, deepCatch,
      flight, duration, running, intent, boundary, backingUp, throwTime,
      keeperX: this.keeper.x, label,
      wicketKind: intent.caught ? 'caught' : runOut ? 'runout' : null,
      outcome: { runs: intent.runs, wicket: intent.caught || runOut },
    }
    this.startPlay(play, intent.grade)
  }

  shotDestination(intent, side) {
    if (intent.runs >= 4) {
      const [x, y] = boundaryPoint(intent.direction)
      const carry = 1.04
      return this.toScreen([lerp(0.5, x, carry), lerp(BOUNDARY_CENTER_Y, y, carry)])
    }

    const distance = 0.20 + intent.runs * 0.067
    return this.toScreen([0.5 + distance * (side || 0.32), side ? 0.578 : 0.578 - intent.runs * 0.055])
  }

  findInterception(intent, fromX, fromY, targetX, targetY) {
    if (intent.runs < 2 || intent.runs > 3 || intent.loft) return null
    const reach = INTERCEPTION_REACH[this.difficulty] ?? INTERCEPTION_REACH.Medium

    // A ground stroke through a covered channel is gathered early enough to save a run.
    for (const fraction of [0.48, 0.62, 0.76]) {
      const x = lerp(fromX, targetX, fraction)
      const y = lerp(fromY, targetY, fraction)
      const fielder = this.closestFielder(x, y)
      if (squaredDistance(fielder.x, fielder.y, x, y) <= reach ** 2) return { fielder, x, y, fraction }
    }
    return null
  }

  beginMiss(forced = null) {
    const delivery = this.delivery
    const { intent, line } = delivery
    const grade = intent?.grade || 'missed'
    forced ||= delivery.forcedMiss
    let kind = 'gather'
    if (forced) {
      kind = forced.kind
    } else if (delivery.wide) {
      kind = 'wide'
    } else {
      // Only deliveries near the wicket can hit it or trap the striker in front.
      const onStumps = Math.abs(line + 2) < 7.5
      const padLine = Math.abs(line - 7) < 8 && grade !== 'leave'
      if (onStumps && this.rng() < 0.7) kind = 'bowled'
      else if (padLine && this.rng() < 0.23) kind = 'lbw'
      if (delivery.noBall) kind = 'gather'
    }
    if (this.net?.role === 'auth') this.send({ t: 'miss', n: this.ballCount, kind })
    const wide = kind === 'wide'
    if (wide) kind = 'gather'
    const label = wide ? 'WIDE' : { gather: 'DOT BALL', bowled: 'OUT! BOWLED', lbw: 'OUT! LBW' }[kind]
    if (kind === 'bowled') this.fx.bailsAt = this.elapsed
    this.startPlay({
      kind, wide, intent, label, wicketKind: kind === 'gather' ? null : kind,
      outcome: { runs: 0, wicket: kind !== 'gather' },
      fromX: this.ball.x, fromY: this.ballShadow.y, fromHeight: this.ballHeight,
      keeperX: this.keeper.x, duration: 560,
    }, grade)
  }

  startPlay(play, grade) {
    this.bounceMarker.setVisible(false)
    this.play = { ...play, startedAt: this.elapsed, scored: false }
    this.setStage('result', grade)
  }

  closestFielder(x, y) {
    let closest = this.fielders[0]
    let bestDistance = Infinity
    for (const fielder of this.fielders) {
      const distance = squaredDistance(x, y, fielder.x, fielder.y)
      if (distance < bestDistance) {
        closest = fielder
        bestDistance = distance
      }
    }
    return closest
  }

  updatePlay() {
    const play = this.play
    const time = this.elapsed - play.startedAt

    if (play.scored) {
      this.updateCelebration(play, this.elapsed - play.scoredAt)
      if (this.elapsed < play.reportAt) return
      if (this.wantsReplay(play)) this.startReplay()
      else this.afterBall()
      return
    }

    this.updateBowlerFollowThrough(this.elapsed - this.delivery.releasedAt)
    if (play.kind === 'shot') this.updateShot(play, time)
    else this.updateMiss(play, time)

    if (time >= play.duration) {
      // Online: the bowler's screen takes the batter's scorebook as the truth.
      if (this.net?.role === 'mirror' && !this.remote.ball) this.elapsed -= this.frameDelta
      else this.recordPlay(play)
    }
  }

  updateCelebration(play, since) {
    if (play.final.wicket) {
      const phase = progress(since, 900)
      for (const fielder of this.fielders) fielder.setPose('cheer', phase)
      this.bowler.setPose('cheer', phase)
      this.keeper.setPose('appeal', progress(since, 500))
    } else if (play.milestone) {
      this.batter.setPose('raise', progress(since, 1300), -1)
    }
  }

  afterBall() {
    if (this.finished) {
      this.done = true
      this.onUpdate({ ...this.snapshot(), finished: true })
    } else {
      this.beginReady(this.overBreak ? 1150 : 590)
    }
  }

  updateShot(play, elapsed) {
    const t = progress(elapsed, play.flight)
    const groundShot = !play.intent.caught && play.intent.runs !== 6 && (!play.intent.loft || play.intent.runs === 4)
    const travel = groundShot ? 1 - (1 - t) ** 1.6 : t
    const firstLanding = groundShot ? 330 : play.flight
    const air = progress(elapsed, firstLanding)
    const x = lerp(play.fromX, play.destinationX, travel)
    const y = lerp(play.fromY, play.destinationY, travel)
    const loftHeight = play.deepCatch ? 124 : play.intent.caught ? 58 : play.intent.runs === 6 ? 134 : play.intent.loft ? 66 : 29
    const height = Math.max(0, play.fromHeight * (1 - air)) + Math.sin(air * Math.PI) * loftHeight
    if (play.boundary && !play.crossed && y / this.h <= ropeY(x / this.w)) {
      // Compare the landing point with the rope even if a frame spans both events.
      const landingTravel = groundShot ? 1 - (1 - progress(firstLanding, play.flight)) ** 1.6 : 1
      const landingX = lerp(play.fromX, play.destinationX, landingTravel) / this.w
      const landingY = lerp(play.fromY, play.destinationY, landingTravel) / this.h
      const bouncedInside = landingY > ropeY(landingX)
      play.crossed = true
      play.outcome.runs = bouncedInside ? 4 : 6
      play.label = bouncedInside ? 'FOUR!' : 'SIX!'
      this.fx.flashAt = this.elapsed
      this.onEvent('shake')
    }
    const facing = Math.sign(play.fieldGoalX - play.fielderX) || 1

    if (elapsed < play.flight) {
      const landingHeight = play.intent.caught ? t * 31 : 0
      this.drawBall(x, y, height + landingHeight, lerp(0.62, 0.33, t))
      if (play.diveAt === null || elapsed < play.diveAt) {
        const chase = progress(elapsed - 45, play.diveAt === null ? play.flight - 65 : play.diveAt - 45)
        const chaseX = lerp(play.fielderX, play.fieldGoalX, chase)
        const chaseY = lerp(play.fielderY, play.fieldGoalY, chase)
        this.place(play.fielder, chaseX, chaseY, 'run', cycle(elapsed, 360), facing)
      }
    } else {
      this.updatePickup(play, elapsed - play.flight, facing)
    }

    if (play.diveAt !== null && elapsed >= play.diveAt) {
      const reach = progress(elapsed - play.diveAt, DIVE_DURATION)
      const diveFacing = Math.sign(play.destinationX - play.fieldGoalX) || facing
      this.place(play.fielder, play.fieldGoalX, play.fieldGoalY, 'dive', reach, diveFacing)
    }

    if (play.running) this.updateRunningBatters(play, elapsed)
    else this.updateBatters()

    for (let index = 0; index < play.backingUp.length; index++) {
      const { actor, fromX, fromY, toX, toY } = play.backingUp[index]
      const moveAt = 85 + index * 28
      const step = smooth(progress(elapsed - moveAt, 340))
      const pose = step > 0 && step < 1 ? 'run' : 'ready'
      const backingFacing = Math.sign(toX - fromX) || actor.facing
      this.place(actor, lerp(fromX, toX, step), lerp(fromY, toY, step), pose, cycle(elapsed + moveAt, 410), backingFacing)
    }

    const [keeperX, keeperY] = this.keeperSpot
    const keeperStep = smooth(progress(elapsed, 460))
    const returning = !play.boundary && !play.intent.caught && elapsed > play.flight + 255
    if (returning) {
      const receive = smooth(progress(elapsed - play.flight - 255, play.throwTime))
      this.place(this.keeper, lerp(this.returnKeeperX(play, keeperX), keeperX, receive), keeperY - 2 * (1 - receive), 'collect', receive)
    } else {
      this.place(this.keeper, lerp(play.keeperX, this.returnKeeperX(play, keeperX), keeperStep), keeperY - keeperStep * 2, 'ready', cycle(elapsed, 790))
    }
  }

  returnKeeperX(play, keeperX) {
    return keeperX + (play.destinationX > this.w / 2 ? 12 : -12)
  }

  updatePickup(play, elapsed, facing) {
    if (play.boundary) {
      this.hideBall()
      return
    }

    const { fielder, fieldGoalX, fieldGoalY } = play
    if (play.intent.caught) {
      this.hideBall()
      this.place(fielder, fieldGoalX, fieldGoalY, 'appeal', progress(elapsed, 220), facing)
      return
    }

    if (elapsed < 110) {
      this.drawBall(play.destinationX, play.destinationY, 0, 0.26)
      this.place(fielder, fieldGoalX, fieldGoalY, 'collect', progress(elapsed, 110), facing)
    } else if (elapsed < 255) {
      this.hideBall()
      this.place(fielder, fieldGoalX, fieldGoalY, 'throw', progress(elapsed - 110, 145) * 0.58, -facing)
    } else {
      const t = progress(elapsed - 255, play.throwTime)
      const [x, y] = this.keeperSpot
      const scale = this.playerScale(fieldGoalY)
      this.place(fielder, fieldGoalX, fieldGoalY, 'throw', 0.58 + progress(elapsed - 255, 172) * 0.42, -facing)
      if (t < 1) this.drawBall(lerp(fieldGoalX - 29 * scale * facing, x, t), lerp(fieldGoalY, y, t), lerp(48 * scale, 12, t) + 17 * Math.sin(Math.PI * t), 0.27)
      else this.hideBall()
    }
  }

  planRunning(intent) {
    if (intent.runs < 1 || intent.runs > 3) return null

    const strikerStart = Math.max(0, SWING_TIME - (this.elapsed - intent.startedAt))
    const partnerStart = 60
    return {
      count: intent.runs,
      duration: Math.max(strikerStart, partnerStart) + intent.runs * RUN_LEG - TURN_FOR_NEXT_RUN,
      striker: {
        actor: this.batter, towardsNear: false, startAt: strikerStart, strideOffset: 50,
        from: [this.batter.x, this.batter.y],
      },
      partner: {
        actor: this.partner, towardsNear: true, startAt: partnerStart, strideOffset: 130,
        from: [this.partner.x, this.partner.y],
      },
      far: this.toScreen(PARTNER_GROUND),
      near: this.toScreen(STRIKER_GROUND),
    }
  }

  updateRunningBatters(play, elapsed) {
    const { striker, partner, count, far, near } = play.running
    if (elapsed < striker.startAt) this.updateStriker()
    else this.runBetweenWickets(striker, count, far, near, elapsed)
    if (elapsed >= partner.startAt) this.runBetweenWickets(partner, count, far, near, elapsed)
  }

  runBetweenWickets(runner, count, far, near, elapsed) {
    const sinceStart = elapsed - runner.startAt
    const leg = Math.min(count - 1, Math.floor(sinceStart / RUN_LEG))
    const legTime = sinceStart - leg * RUN_LEG
    const movingNear = leg % 2 === 0 ? runner.towardsNear : !runner.towardsNear
    const to = movingNear ? near : far
    const facing = movingNear ? 1 : -1

    if (legTime < RUN_TO_CREASE) {
      // The runners take opposite lanes, then converge on the crease at each end.
      const [fromX, fromY] = leg === 0 ? runner.from : movingNear ? far : near
      const p = legTime / RUN_TO_CREASE
      const stride = lerp(p, smooth(p), 0.44)
      const lane = Math.sin(Math.PI * stride) * 35 * -facing
      const x = lerp(fromX, to[0], stride) + lane
      const y = lerp(fromY, to[1], stride)
      this.place(runner.actor, x, y, 'run', cycle(legTime + runner.strideOffset, 365), facing)
      return
    }

    const sinceArrival = legTime - RUN_TO_CREASE
    if (sinceArrival < GROUND_BAT) {
      this.place(runner.actor, ...to, 'ground', progress(sinceArrival, GROUND_BAT), facing)
    } else if (leg < count - 1) {
      const turn = progress(sinceArrival - GROUND_BAT, TURN_FOR_NEXT_RUN)
      this.place(runner.actor, ...to, 'turn', turn, turn < 0.5 ? facing : -facing)
    } else {
      this.place(runner.actor, ...to, 'idle', cycle(sinceArrival - GROUND_BAT, 1200), facing)
    }
  }

  updateMiss(play, elapsed) {
    this.updateBatters()
    const [keeperX, keeperY] = this.keeperSpot
    const t = progress(elapsed, 235)
    const takeX = keeperX + clamp(this.delivery.line, -40, 40) * 0.8
    const keeperPose = play.outcome.wicket && t > 0.9 ? 'appeal' : 'collect'
    const keeperPhase = keeperPose === 'appeal' ? progress(elapsed - 195, 200) : t
    this.place(this.keeper, lerp(play.keeperX, takeX, t), keeperY + 6 * Math.sin(t * Math.PI), keeperPose, keeperPhase)
    for (let index = 0; index < this.fielders.length; index++) {
      const fielder = this.fielders[index]
      const appealing = play.outcome.wicket && index < 2
      const pose = appealing ? 'appeal' : 'ready'
      const phase = appealing ? progress(elapsed - 65, 670) : cycle(elapsed + index * 167, 1630)
      fielder.setPose(pose, phase)
    }
    if (play.kind === 'lbw') this.bowler.setPose('appeal', progress(elapsed - 40, 520))

    if (play.kind === 'bowled') {
      // The deflection is kept near the far stumps, then the keeper steps in.
      const rebound = progress(elapsed, 200)
      if (rebound < 1) this.drawBall(lerp(play.fromX, this.w * 0.47, rebound), lerp(play.fromY, this.h * 0.756, rebound), Math.sin(rebound * Math.PI) * 24, 0.27)
      else this.hideBall()
    } else if (play.kind === 'lbw') {
      this.hideBall()
    } else if (t < 1) {
      this.drawBall(lerp(play.fromX, takeX, t), lerp(play.fromY, keeperY, t), lerp(play.fromHeight, 16, t), 0.26)
    } else {
      this.hideBall()
    }
  }

  drawBall(x, y, height, scale) {
    // Heights are drawn in screen space, scaled to how far away the ball is.
    const perspective = this.playerScale(y) / (0.78 + (y / this.h - 0.43) * 1.72)
    this.ballHeight = height
    this.ball.setPosition(x, y).setLift(height * perspective).setScale(scale * Math.max(0.75, Math.min(1.5, perspective))).setVisible(true)
    this.ballShadow.setPosition(x, y).setAlpha(clamp(0.52 - height * 0.004, 0.08, 0.52)).setVisible(true)
  }

  hideBall() {
    this.ball.setVisible(false)
    this.ballShadow.setVisible(false)
    if (this.trail.emitting) this.trail.stop()
  }

  // ---- Small effects ----

  updateFx() {
    const flashAge = this.elapsed - this.fx.flashAt
    this.flash.setVisible(flashAge < 400).setAlpha(Math.max(0, 1 - flashAge / 400))

    const dustAge = this.elapsed - this.fx.dustAt
    if (dustAge < 300) {
      const grow = dustAge / 300
      this.dust.setVisible(true).setScale(0.6 + grow * 1.5).setAlpha(0.5 * (1 - grow))
    } else if (this.dust.visible) {
      this.dust.setVisible(false)
    }

    const bailAge = this.elapsed - this.fx.bailsAt
    if (bailAge < 720) {
      const seconds = bailAge / 1000
      const [x, y] = this.stumpsTop
      this.bails.forEach((bail, index) => {
        const direction = index ? 1 : -1
        bail.setPosition(x + direction * (3 + 70 * seconds), y).setLift(90 * seconds - 200 * seconds * seconds)
          .setRotation(direction * seconds * 16).setAlpha(1 - bailAge / 720).setVisible(true)
      })
    } else if (this.bails[0].visible) {
      for (const bail of this.bails) bail.setVisible(false)
    }
  }

  updateCamera() {
    let x = this.w / 2
    let y = this.h / 2
    let zoom = 1
    if (this.settings.camera !== 'Static') {
      const play = this.play
      if (this.phase === 'runup' || this.phase === 'hold') {
        zoom = 1.06
        y = this.h * 0.56
      } else if (this.phase === 'flight') {
        zoom = 1.12
        y = this.h * 0.6
      } else if (this.phase === 'replay') {
        zoom = 1.3
        x = this.ball.visible ? this.ball.x : this.replay.focusX
        y = this.ball.visible ? this.ballShadow.y - 14 : this.replay.focusY
      } else if (this.phase === 'result' && play) {
        if (play.kind !== 'shot') {
          zoom = play.outcome.wicket ? 1.3 : 1.1
          x = this.w * 0.49
          y = this.h * 0.7
        } else if (this.ball.visible) {
          zoom = 1.07
          x = lerp(this.w / 2, this.ball.x, 0.5)
          y = lerp(this.h * 0.56, this.ballShadow.y, 0.45)
        } else if (play.scored && play.final.wicket) {
          zoom = 1.28
          x = play.fielder.x
          y = play.fielder.y - 16
        } else {
          zoom = 1.03
        }
      }
    }
    const ease = 1 - Math.exp(-this.frameDelta / (this.phase === 'replay' ? 200 : 300))
    this.cam.x += (x - this.cam.x) * ease
    this.cam.y += (y - this.cam.y) * ease
    this.cam.zoom += (zoom - this.cam.zoom) * ease
  }

  // ---- Replays ----

  captureFrame() {
    if (this.tape.length > 720) return
    const frame = new Float32Array(1 + this.tracked.length * 8)
    frame[0] = this.elapsed
    for (let i = 0; i < this.tracked.length; i++) {
      const object = this.tracked[i]
      const at = 1 + i * 8
      frame[at] = object.x ?? 0
      frame[at + 1] = object.y ?? 0
      frame[at + 2] = object.scale
      frame[at + 3] = object.visible ? object.alpha : -1
      frame[at + 4] = object.frameId ?? -1
      frame[at + 5] = object.flip ? 1 : 0
      frame[at + 6] = object.depth
      frame[at + 7] = object.lift ?? 0
    }
    this.tape.push(frame)
  }

  showFrame(a, b, mix) {
    for (let i = 0; i < this.tracked.length; i++) {
      const object = this.tracked[i]
      const at = 1 + i * 8
      const visible = a[at + 3] >= 0
      object.setVisible(visible)
      if (!visible) continue
      const steady = b[at + 3] >= 0 ? mix : 0
      object.setPosition(lerp(a[at], b[at], steady), lerp(a[at + 1], b[at + 1], steady))
      object.setScale(lerp(a[at + 2], b[at + 2], steady)).setDepth(a[at + 6]).setAlpha(a[at + 3])
      if (a[at + 4] >= 0 && object.frameId !== a[at + 4]) object.setFrame(a[at + 4])
      object.setFlipX?.(a[at + 5] === 1)
      object.setLift?.(lerp(a[at + 7], b[at + 7], steady))
    }
  }

  wantsReplay(play) {
    if (play.replayed || this.settings.replays === false || this.net || this.match.fast) return false
    return this.tape.length > 12 && (play.final.wicket || play.final.runs === 6)
  }

  startReplay() {
    const play = this.play
    play.replayed = true
    const end = this.tape[this.tape.length - 1][0]
    const start = Math.max(this.tape[0][0], end - 3400)
    this.replay = { time: start, end, index: 0, focusX: this.batter.x, focusY: this.batter.y - 20 }
    this.phase = 'replay'
    this.trail.start()
    this.onEvent('replay', true)
  }

  updateReplay() {
    const replay = this.replay
    replay.time += this.frameDelta * 0.42
    const tape = this.tape
    while (replay.index < tape.length - 2 && tape[replay.index + 1][0] <= replay.time) replay.index++
    const a = tape[replay.index]
    const b = tape[Math.min(tape.length - 1, replay.index + 1)]
    const span = b[0] - a[0]
    this.showFrame(a, b, span > 0 ? clamp((replay.time - a[0]) / span, 0, 1) : 0)
    if (replay.time >= replay.end + 260) this.endReplay()
  }

  skipReplay() {
    if (this.phase === 'replay') this.endReplay()
  }

  endReplay() {
    const last = this.tape[this.tape.length - 1]
    this.showFrame(last, last, 0)
    for (const actor of this.actors) actor.frameId = undefined
    this.hideBall()
    this.replay = null
    this.phase = 'result'
    this.onEvent('replay', false)
    this.afterBall()
  }

  // ---- Scoring ----

  recordPlay(play) {
    const innings = this.innings
    const delivery = this.delivery
    const rng = this.rng
    this.hideBall()
    this.footwork = null
    this.ballCount++

    const synced = this.net?.role === 'mirror' ? this.remote.ball : null
    let { runs, wicket } = play.outcome
    let kind = play.wicketKind
    let extra = play.wide ? 'wide' : delivery.noBall ? 'noball' : null
    let label = play.label
    if (extra === 'noball' && wicket && kind !== 'runout') { wicket = false; runs = 0 }
    if (extra === 'noball') label = runs ? `NO BALL +${runs}` : 'NO BALL'
    const boundary = Boolean(play.boundary) && runs >= 4
    const strikerBefore = innings.batters[innings.striker]
    const bowlerBefore = innings.bowlers[innings.bowler]
    const runsBefore = strikerBefore.runs
    const names = { batter: strikerBefore.name, bowler: bowlerBefore?.name }
    let result
    if (synced) {
      this.innings = Innings.revive(synced.innings)
      result = synced.result
    } else {
      const fielder = kind === 'caught' ? rng.pick(this.fieldNames.filter(name => name !== bowlerBefore?.name)) : undefined
      result = innings.record({ runs, extra, boundary, wicket: wicket ? { kind, fielder, keeper: kind === 'caught' && !play.deepCatch && rng() < 0.3 } : null })
      if (this.net?.role === 'auth') this.send({ t: 'ball', n: this.ballCount, innings: this.innings, result })
    }
    // Anything still stored belonged to the ball just finished.
    this.remote = {}
    const book = this.innings

    if (!wicket && runs > 0 && runs < 4 && runs % 2 === 1) {
      const previousStriker = this.batter
      this.batter = this.partner
      this.partner = previousStriker
    }
    this.recentDeliveries.push({ runs, wicket, direction: play.intent?.direction })
    if (this.recentDeliveries.length > 4) this.recentDeliveries.shift()
    this.recentTypes.push({ type: delivery.type, length: delivery.bounceAt })
    if (this.recentTypes.length > 2) this.recentTypes.shift()

    let milestone = null
    if (!wicket && extra !== 'wide') {
      const now = strikerBefore.runs
      if (runsBefore < 100 && now >= 100) milestone = 'hundred'
      else if (runsBefore < 50 && now >= 50) milestone = 'fifty'
    }
    play.milestone = milestone
    this.milestone = milestone ? `${milestone === 'hundred' ? 'Century' : 'Fifty'} for ${strikerBefore.name}!` : null

    let key = extra === 'wide' ? 'wide' : extra === 'noball' ? 'noball' : wicket ? kind : runs || (play.intent?.grade === 'leave' ? 'leave' : 'dot')
    if (milestone) key = milestone
    let detail = commentate(key, rng, names)
    const maiden = result.overEnded && bowlerBefore && bowlerBefore.overRuns === 0
    if (maiden) detail = commentate('maiden', rng, names)
    const tight = book.target != null && !book.finished && book.ballsLeft <= 6 && book.need <= 12 && book.need > 0
    if (tight && !wicket && runs < 4 && rng() < 0.5) detail = `${book.need} needed from ${book.ballsLeft}. ${commentate('tight', rng)}`
    const shot = play.intent
    if (this.bat === 'user' && shot?.fit === 'against' && shot.grade === 'perfect' && runs < 4 && !milestone) detail = wicket ? 'Out playing across the line!' : 'Well timed, but against the line.'
    else if (this.bat === 'user' && shot?.saved && runs < 4) detail = 'Cut off by the fielder on the rope!'

    if (wicket) {
      this.soundEffect('wicket')
      this.soundEffect(this.bat === 'user' ? 'ooh' : 'cheer')
      this.vibrate([35, 35, 60])
      if (book.wickets < book.maxWickets) this.newBatter = true
    } else if (runs >= 4) {
      this.soundEffect('crowd')
      this.soundEffect('cheer')
      if (this.settings.sound !== false && this.settings.crowd !== false) crowdSwell(runs === 6 ? 1 : 0.6)
    } else if (milestone) {
      this.soundEffect('applause')
    }

    this.wheel.push({ end: toRadarPoint((play.destinationX ?? play.fromX) / this.w, (play.destinationY ?? play.fromY) / this.h), runs })
    this.lastLabel = label
    this.lastDetail = this.settings.commentary === false ? '' : detail
    this.lastWicket = wicket
    speak(detail)

    play.scored = true
    play.scoredAt = this.elapsed
    play.final = { runs, wicket, kind, extra }
    this.overBreak = result.overEnded
    this.finished = book.finished
    play.reportAt = this.elapsed + (milestone ? 1500 : wicket ? 1250 : 940)
    this.onEvent('ball', {
      runs, wicket, kind, extra, boundary, legal: !extra, overEnded: result.overEnded, maiden,
      userBats: this.bat === 'user', userBowls: this.bowl === 'user', milestone,
      batterRuns: strikerBefore.runs, finished: this.finished, lastBall: book.balls >= book.maxBalls,
    })
    this.onUpdate(this.snapshot())
  }

  snapshot() {
    const innings = this.innings
    const striker = innings.batters[innings.striker]
    const partner = innings.batters[innings.nonStriker]
    const style = this.bowlerStyle
    const lastOver = innings.overs[innings.overs.length - 1]
    return {
      label: innings.label, battingShort: innings.battingShort, bowlingShort: innings.bowlingShort, battingName: innings.battingName,
      score: innings.score, wickets: innings.wickets, balls: innings.balls, ballId: this.ballCount,
      overs: innings.oversText, maxOvers: innings.maxOversText, totalBalls: innings.maxBalls, extras: innings.extras,
      runRate: innings.runRate, requiredRate: innings.requiredRate, target: innings.target, need: innings.need, ballsLeft: innings.ballsLeft,
      striker: { name: striker.name, runs: striker.runs, balls: striker.balls },
      partner: { name: partner.name, runs: partner.runs, balls: partner.balls },
      bowler: innings.bowlerFigures(),
      over: innings.over.length || !lastOver ? [...innings.over] : [...lastOver.balls],
      overDone: !innings.over.length && Boolean(lastOver),
      wheel: [...this.wheel], milestone: this.milestone, powerplay: innings.balls < this.powerplayBalls,
      lastLabel: this.lastLabel, lastDetail: this.lastDetail, lastWicket: this.lastWicket,
      userBats: this.bat === 'user', userBowls: this.bowl === 'user',
      perfect: this.perfectWindow(null), style, deliveries: DELIVERIES[style], deliveryType: this.aim.type,
      plan: this.fieldPlan.id, planLabel: this.fieldPlan.label,
    }
  }

  // ---- Online ----

  send(message) {
    this.net?.send(message)
  }

  receive(message) {
    if (message.n != null && message.t !== 'ball' && message.n !== this.ballCount) return
    switch (message.t) {
      case 'bowler': this.chooseBowler(message.index, true); break
      case 'field': this.setFieldPlan(message.id, true); break
      case 'runup': this.remote.runup = true; break
      case 'bowl': this.remote.spec = message.spec; break
      case 'released': this.remote.releasedAt = this.elapsed; break
      case 'leave':
        if (this.delivery) this.delivery.intent = { grade: 'leave', hit: false, timing: 100 }
        break
      case 'swing': {
        const delivery = this.delivery
        if (!delivery?.impactAt) break
        delivery.intent = {
          direction: message.direction, loft: message.loft, grade: message.grade, hit: message.hit, timing: 50,
          startedAt: this.elapsed, contactAt: Math.max(this.elapsed + 30, delivery.impactAt + message.offset),
        }
        break
      }
      case 'shot': this.remote.shot = message; break
      case 'miss': this.remote.miss = { kind: message.kind }; break
      case 'ball': this.remote.ball = message; break
    }
  }

  soundEffect(kind, volume = 1) {
    if (this.settings.sound !== false && !this.match.fast) playSound(kind, { volume })
  }

  vibrate(pattern) {
    if (!this.match.fast) navigator.vibrate?.(pattern)
  }

  setPaused(value) {
    if (this.paused === value) return
    this.paused = value
    if (value) this.trail?.pause()
    else this.trail?.resume()
    this.onPauseChange?.()
  }
}
