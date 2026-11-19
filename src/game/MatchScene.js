import Phaser from 'phaser'
import { CricketActor } from './CricketActor.js'
import { BOUNDARY_CENTER_Y, BOUNDARY_ROPE, FIELD_PLANS, boundaryPoint, selectFieldPlan, toRadarPoint } from './fieldPlans.js'

const PERFECT_WINDOW = { Easy: 0.17, Medium: 0.12, Hard: 0.075 }
const INTERCEPTION_REACH = { Easy: 26, Medium: 37, Hard: 48 }
const BATTING_KITS = { 'Harbor Hawks': 'blue', 'Desert Foxes': 'red', 'Metro Kings': 'white' }
const SWING_TIME = 270
const CONTACT_DELAY = SWING_TIME * 0.4
const RUN_UP = 760
const RELEASE = 250
const RUN_TO_CREASE = 1000
const GROUND_BAT = 200
const TURN_FOR_NEXT_RUN = 175
const RUN_LEG = RUN_TO_CREASE + GROUND_BAT + TURN_FOR_NEXT_RUN
const DIVE_DURATION = 450
const STRIKER = [0.526, 0.434]
const NON_STRIKER = [0.589, 0.728]
const FAR_GROUND = [0.526, 0.420]
const NEAR_GROUND = [0.589, 0.740]
const KEEPER = [0.498, 0.382]
const BOWLER_START = [0.388, 0.809]
const BOWLER_CREASE = [0.449, 0.714]
const progress = (elapsed, duration) => Phaser.Math.Clamp(elapsed / duration, 0, 1)
const lerp = Phaser.Math.Linear
const smooth = t => t * t * (3 - 2 * t)
const cycle = (elapsed, period) => (elapsed % period) / period

export default class MatchScene extends Phaser.Scene {
  constructor() {
    super('MatchScene')
  }

  init(data) {
    this.onUpdate = data.onUpdate || (() => {})
    this.timingElement = data.timingElement
    this.fieldDisplay = data.fieldDisplay
    this.settings = data.settings || { overs: 1, difficulty: 'Medium' }
    this.totalBalls = this.settings.overs * 6
    this.score = 0
    this.wickets = 0
    this.balls = 0
    this.extras = 0
    this.elapsed = 0
    this.paused = false
    this.finished = false
    this.selectedShot = 'drive'
    this.footwork = null
    this.pointerStart = null
    this.delivery = null
    this.play = null
    this.fieldPlan = FIELD_PLANS.balanced
    this.fieldChanging = false
    this.recentDeliveries = []
    this.radarPositions = new Map()
    this.nextRadarUpdate = 0
  }

  create() {
    this.w = this.scale.width
    this.h = this.scale.height
    this.add.image(this.w / 2, this.h / 2, 'match-ground').setDisplaySize(this.w, this.h)
    this.drawBoundaryRope()
    this.createPlayers()
    this.applyFieldPlan(this.fieldPlan, false)

    this.ballShadow = this.add.ellipse(0, 0, 10, 4, 0x0c1609, 0.42).setDepth(10).setVisible(false)
    this.ball = this.add.image(0, 0, 'cricket-ball').setVisible(false).setDepth(30)
    this.trail = this.add.particles(0, 0, 'cricket-ball', {
      speed: 0,
      scale: { start: 0.23, end: 0 },
      alpha: { start: 0.36, end: 0 },
      lifespan: 150,
      frequency: 24,
      emitting: false,
    }).setDepth(29)
    this.trail.startFollow(this.ball)
    this.popup = this.add.text(this.w / 2, this.h * 0.23, '', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '38px',
      color: '#ffe37b',
      stroke: '#10251f',
      strokeThickness: 7,
    }).setOrigin(0.5).setDepth(40).setAlpha(0)

    this.input.on('pointerdown', this.onPointerDown, this)
    this.input.on('pointerup', this.onPointerUp, this)
    this.input.on('pointerupoutside', this.clearPointer, this)
    this.input.keyboard?.on('keydown', this.onKeyDown, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this)
    this.onUpdate(this.snapshot())
    this.beginReady(850)
    this.updateFieldRadar()
  }

  drawBoundaryRope() {
    const rope = this.add.graphics().setDepth(1)
    const points = BOUNDARY_ROPE.map(point => {
      const [x, y] = this.toScreen(point)
      return { x, y }
    })
    rope.lineStyle(4, 0x243e2f, 0.55).strokePoints(points.map(({ x, y }) => ({ x, y: y + 1.5 })), true)
    rope.lineStyle(2.2, 0xfff8de, 0.88).strokePoints(points, true)
  }

  createPlayers() {
    const battingKit = BATTING_KITS[this.settings.team] || 'blue'
    const createActor = (role, point, kit, facing = 1) => {
      const [x, y] = this.toScreen(point)
      return new CricketActor(this, { x, y, scale: this.playerScale(y), role, kit, facing })
    }

    this.batter = createActor('batter', STRIKER, battingKit, -1)
    this.partner = createActor('batter', NON_STRIKER, battingKit, -1)
    this.bowler = createActor('bowler', BOWLER_START, 'green')
    this.keeper = createActor('keeper', KEEPER, 'green')
    this.umpire = createActor('umpire', [0.484, 0.807], 'red')
    this.fielders = this.fieldPlan.positions.map(point =>
      createActor('fielder', point, 'green', point[0] < 0.5 ? 1 : -1),
    )
  }

  playerScale(y) {
    return 0.78 + (y / this.h - 0.43) * 1.72
  }

  toScreen([x, y]) {
    return [x * this.w, y * this.h]
  }

  place(actor, x, y, pose, phase, facing = actor.facing) {
    actor.setPosition(x, y).setScale(this.playerScale(y)).setPose(pose, phase, facing)
  }

  setStage(stage, grade) {
    this.phase = stage
    if (!this.timingElement) return
    this.timingElement.dataset.phase = stage
    if (grade) this.timingElement.dataset.grade = grade
    else delete this.timingElement.dataset.grade
    if (stage === 'ready') this.timingElement.style.setProperty('--timing', '0%')
  }

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

  setFieldStatus(message) {
    if (!this.fieldDisplay) return
    this.fieldDisplay.status.textContent = message
    this.fieldDisplay.status.dataset.active = String(Boolean(message))
  }

  updateFieldRadar() {
    if (!this.fieldDisplay || this.elapsed < this.nextRadarUpdate) return
    this.nextRadarUpdate = this.elapsed + 42
    this.fieldDisplay.dots.forEach((dot, index) => this.updateRadarMarker(dot, this.fielders[index]))

    const ballDot = this.fieldDisplay.ball
    if (!ballDot) return
    if (this.ball.visible) {
      this.updateRadarMarker(ballDot, this.ballShadow)
    } else if (this.radarPositions.delete(ballDot)) {
      ballDot.removeAttribute('style')
    }
  }

  updateRadarMarker(dot, object) {
    const [mapX, mapY] = toRadarPoint(object.x / this.w, object.y / this.h)
    const x = Math.round(mapX)
    const y = Math.round(mapY)
    const previous = this.radarPositions.get(dot)
    if (previous?.x === x && previous.y === y) return
    dot.style.setProperty('--field-x', `${x}%`)
    dot.style.setProperty('--field-y', `${y}%`)
    this.radarPositions.set(dot, { x, y })
  }

  beginReady(delay) {
    this.delivery = null
    this.play = null
    const nextPlan = selectFieldPlan({
      currentPlan: this.fieldPlan,
      deliveries: this.recentDeliveries,
      balls: this.balls,
      totalBalls: this.totalBalls,
      wickets: this.wickets,
      difficulty: this.settings.difficulty,
    })
    if (nextPlan !== this.fieldPlan) this.applyFieldPlan(nextPlan, true)
    this.setStage('ready')
    this.nextDeliveryAt = this.elapsed + delay
  }

  startDelivery() {
    this.play = null
    this.delivery = {
      startedAt: this.elapsed,
      pace: Phaser.Math.Between(720, 1030),
      line: Phaser.Math.FloatBetween(-16, 16),
      bounceAt: Phaser.Math.FloatBetween(0.54, 0.76),
      intent: null,
    }
    this.setStage('runup')
    this.clearPointer()
  }

  update(_time, delta) {
    if (this.paused || (this.finished && this.play?.reportAt === null)) return
    this.frameDelta = Math.min(delta, 50)
    this.elapsed += this.frameDelta

    if (this.phase === 'ready') {
      this.updateReady()
    } else if (this.phase === 'runup') {
      this.updateRunUp()
    } else if (this.phase === 'flight') {
      this.updateFlight()
    } else if (this.phase === 'result') {
      this.updatePlay()
    }

    const wicket = this.play?.scored && this.play.outcome.wicket
    if (wicket) {
      const sinceCall = this.elapsed - this.play.reportAt + 940
      this.umpire.setPose('signal', progress(sinceCall, 880))
    } else {
      this.umpire.setPose('idle', cycle(this.elapsed, 2500))
    }
    this.updateFieldRadar()
  }

  updateReady() {
    const [x, y] = this.toScreen(BOWLER_START)
    this.moveHome(this.bowler, x, y, 'idle', 10)
    this.moveHome(this.keeper, ...this.toScreen(KEEPER), 'keeper', 4)
    this.updateBatters()
    let fieldSet = true
    this.fielders.forEach((fielder, index) => {
      const spot = this.fieldSpots[index]
      const speed = 4.4 + (spot.y / this.h) * 1.8
      if (!this.moveHome(fielder, spot.x, spot.y, 'ready', speed, index, spot.facing)) fieldSet = false
    })
    if (!fieldSet) return

    if (this.fieldChanging) {
      this.fieldChanging = false
      this.setFieldStatus('')
      this.nextDeliveryAt = Math.max(this.nextDeliveryAt, this.elapsed + 300)
    }
    if (this.elapsed >= this.nextDeliveryAt) this.startDelivery()
  }

  moveHome(actor, x, y, pose, speed, offset = 0, facing = actor.facing) {
    const distance = Phaser.Math.Distance.Between(actor.x, actor.y, x, y)
    if (distance < 2) {
      this.place(actor, x, y, pose, cycle(this.elapsed + offset * 160, 1640), facing)
      return true
    }

    const step = Math.min(1, speed * this.frameDelta / (16.67 * distance))
    this.place(actor, lerp(actor.x, x, step), lerp(actor.y, y, step), 'run', cycle(this.elapsed, 420), Math.sign(x - actor.x) || 1)
    return false
  }

  updateRunUp() {
    const runTime = this.elapsed - this.delivery.startedAt
    const p = progress(runTime, RUN_UP)
    const [startX, startY] = this.toScreen(BOWLER_START)
    const [creaseX, creaseY] = this.toScreen(BOWLER_CREASE)

    if (runTime < RUN_UP) {
      const stride = p * (0.43 + 0.57 * p)
      this.place(this.bowler, lerp(startX, creaseX - 10, stride), lerp(startY, creaseY + 15, stride), 'run', cycle(runTime, 300), 1)
    } else {
      const pRelease = progress(runTime - RUN_UP, RELEASE)
      this.place(this.bowler, creaseX - 10 + pRelease * 10, creaseY + (1 - pRelease) * 15, 'bowl', pRelease * 0.58, 1)
      if (pRelease === 1) this.releaseBall()
    }

    this.keeper.setPose('keeper', cycle(this.elapsed, 1140))
    this.updateFieldReady()
    this.updateBatters()
  }

  releaseBall() {
    const delivery = this.delivery
    delivery.releasedAt = this.elapsed
    delivery.impactAt = this.elapsed + delivery.pace
    const scale = this.playerScale(this.bowler.y)
    delivery.fromX = this.bowler.x + 12 * scale
    delivery.fromY = this.bowler.y
    delivery.releaseHeight = 72 * scale
    this.setStage('flight')
    this.drawBall(delivery.fromX, delivery.fromY, delivery.releaseHeight, 0.51)
    this.trail.start()
  }

  updateFlight() {
    const delivery = this.delivery
    const flightTime = this.elapsed - delivery.releasedAt
    const t = flightTime / delivery.pace
    const travel = Phaser.Math.Clamp(t, 0, 1.17)
    this.updateBatters()
    const [targetX, targetY] = this.contactPoint()
    const x = lerp(delivery.fromX, targetX + delivery.line, travel)
    const y = lerp(delivery.fromY, targetY, travel)
    let height = delivery.releaseHeight * (1 - progress(t, delivery.bounceAt)) ** 1.2
    if (t > delivery.bounceAt) {
      const bounce = (t - delivery.bounceAt) / (1.24 - delivery.bounceAt)
      height = 33 * (1 - (2 * bounce - 1) ** 2)
    }

    this.drawBall(x, y, height, lerp(0.51, 0.27, Math.min(t, 1)))
    this.updateBowlerFollowThrough(flightTime)
    this.updateFieldReady()
    const [keeperX, keeperY] = this.toScreen(KEEPER)
    this.place(this.keeper, keeperX + delivery.line * Math.max(0, t - 0.35), keeperY, 'keeper', cycle(flightTime, 880))

    const centerAt = delivery.impactAt - CONTACT_DELAY
    const position = 50 + 100 * (this.elapsed - centerAt) / (delivery.pace * 0.94)
    const lockedPosition = delivery.intent?.timing
    this.timingElement?.style.setProperty('--timing', `${Math.round(Phaser.Math.Clamp(lockedPosition ?? position, 0, 100))}%`)

    const intent = delivery.intent
    if (intent?.hit && this.elapsed >= intent.contactAt) {
      this.beginShot(intent)
    } else if (this.elapsed >= delivery.impactAt + 100) {
      this.beginMiss()
    }
  }

  updateBowlerFollowThrough(flightTime) {
    const [x, y] = this.toScreen(BOWLER_CREASE)
    const stride = smooth(progress(flightTime, 390))
    this.place(this.bowler, x + stride * 16, y - stride * 38, 'bowl', 0.58 + 0.42 * progress(flightTime, 370), 1)
  }

  updateFieldReady() {
    const p = this.phase === 'flight' ? 1 : progress(this.elapsed - this.delivery.startedAt, RUN_UP)
    this.fielders.forEach((fielder, index) => {
      const spot = this.fieldSpots[index]
      const step = spot.deep ? 0 : p * 0.026
      const x = lerp(spot.x, this.w * STRIKER[0], step)
      const y = lerp(spot.y, this.h * STRIKER[1], step)
      this.place(fielder, x, y, 'ready', cycle(this.elapsed + index * 170, 1670), spot.facing)
    })
  }

  updateBatters() {
    this.updateStriker()
    this.updateNonStriker()
  }

  updateStriker() {
    const [x, y] = this.toScreen(STRIKER)
    const offset = this.footwork === 'advance' ? 14 : this.footwork === 'back' ? -7 : 0
    const targetY = y + offset
    const maxStep = this.frameDelta * 0.16
    const batterY = this.batter.y + Phaser.Math.Clamp(targetY - this.batter.y, -maxStep, maxStep)
    const intent = this.delivery?.intent

    if (intent?.grade === 'leave') {
      this.place(this.batter, lerp(this.batter.x, x + 10, 0.2), batterY, 'ready', 0.84, -1)
    } else if (intent && this.elapsed - intent.startedAt <= SWING_TIME) {
      this.batter.setPose('swing', progress(this.elapsed - intent.startedAt, SWING_TIME), -1)
    } else {
      const readyTime = this.elapsed - (this.delivery?.startedAt ?? 0)
      this.place(this.batter, lerp(this.batter.x, x, 0.2), batterY, 'ready', cycle(readyTime, 1190), -1)
    }
  }

  updateNonStriker() {
    const [homeX, homeY] = this.toScreen(NON_STRIKER)
    const liveDelivery = this.phase === 'flight'
    if (liveDelivery) {
      // Back up only after release, with a few steps towards the far end.
      const sinceRelease = this.elapsed - this.delivery.releasedAt - 30
      const step = smooth(progress(sinceRelease, 430))
      const pose = step > 0 && step < 1 ? 'run' : 'idle'
      this.place(this.partner, homeX - step * 11, homeY - step * 34, pose, cycle(Math.max(0, sinceRelease), 465), -1)
      return
    }

    // On a leave, dot, or boundary the partner can walk back into their ground.
    const distance = Phaser.Math.Distance.Between(this.partner.x, this.partner.y, homeX, homeY)
    const step = Math.min(1, this.frameDelta * 0.10 / Math.max(1, distance))
    const pose = distance > 2 ? 'run' : 'idle'
    const facing = distance > 2 && this.partner.y < homeY ? 1 : -1
    this.place(this.partner, lerp(this.partner.x, homeX, step), lerp(this.partner.y, homeY, step), pose, cycle(this.elapsed, 570), facing)
  }

  contactPoint() {
    return [this.w * 0.501, this.batter.y]
  }

  onPointerDown(pointer) {
    if (!this.paused) this.pointerStart = { x: pointer.x, id: pointer.id }
  }

  onPointerUp(pointer) {
    if (!this.pointerStart || this.pointerStart.id !== pointer.id) return
    const deltaX = pointer.x - this.pointerStart.x
    this.clearPointer()
    const direction = deltaX < -28 ? 'leg' : deltaX > 28 ? 'off' : 'straight'
    this.swing(direction)
  }

  clearPointer() {
    this.pointerStart = null
  }

  onKeyDown(event) {
    if (event.repeat || event.target?.closest?.('button, input, select, textarea, [contenteditable]')) return
    const direction = { Space: 'straight', ArrowLeft: 'leg', ArrowRight: 'off' }[event.code]
    if (!direction) return
    event.preventDefault()
    this.swing(direction)
  }

  setFootwork(footwork) {
    if (this.paused || this.finished || this.phase === 'result' || this.delivery?.intent) return
    this.footwork = this.footwork === footwork ? null : footwork
  }

  canPlayBall() {
    return this.phase === 'flight' && !this.delivery.intent && !this.paused
  }

  leave() {
    if (!this.canPlayBall()) return
    this.delivery.intent = { grade: 'leave', hit: false, timing: 100 }
  }

  swing(direction = 'straight', loft = this.selectedShot === 'loft') {
    if (!this.canPlayBall()) return
    const { impactAt, pace } = this.delivery

    // Score the swing at the instant the bat will pass the ball, rather than on tap.
    const contactAt = this.elapsed + CONTACT_DELAY
    const timingError = (contactAt - impactAt) / pace
    const perfectWindow = PERFECT_WINDOW[this.settings.difficulty] ?? PERFECT_WINDOW.Medium
    const accuracy = Math.abs(timingError)
    let grade = timingError < 0 ? 'early' : 'late'
    let runs = 0
    let caught = false
    if (accuracy <= perfectWindow) {
      grade = 'perfect'
      runs = loft || Math.random() < 0.34 ? 6 : 4
    } else if (accuracy <= 0.27) {
      grade = 'good'
      runs = Phaser.Math.Between(1, 3)
    } else if (accuracy <= 0.41 && Math.random() < 0.38) {
      caught = true
    }

    this.delivery.intent = {
      direction, loft, grade, runs, caught, hit: runs > 0 || caught,
      timing: 50 + 100 * timingError / 0.94,
      contactAt: Math.min(contactAt, impactAt + 96),
      startedAt: this.elapsed,
    }
  }

  beginShot(attempt) {
    this.soundEffect('hit')
    this.vibrate(attempt.grade === 'perfect' ? 25 : 12)
    const fromX = this.ball.x
    const fromY = this.ballShadow.y
    const side = attempt.direction === 'leg' ? -1 : attempt.direction === 'off' ? 1 : 0
    const boundary = attempt.runs >= 4
    let [destinationX, destinationY] = this.shotDestination(attempt, side)
    const interception = this.findInterception(attempt, fromX, fromY, destinationX, destinationY)
    const intent = interception ? { ...attempt, runs: attempt.runs - 1 } : attempt
    let fielder = interception?.fielder ?? this.closestFielder(destinationX, destinationY)

    if (intent.caught) {
      fielder = this.fielders[side === 1 ? 1 : 0]
      destinationX = fielder.x + (side === 1 ? -8 : 8)
      destinationY = fielder.y - 1
    } else if (interception) {
      destinationX = interception.x
      destinationY = interception.y
    }

    const running = this.planRunning(intent)
    const flight = running ? Math.round(running.duration * 0.55) : intent.caught ? 590 : intent.runs === 6 ? 960 : 780
    // Allow time for the runners to make their ground as the throw comes back.
    const throwTime = running ? Math.max(270, running.duration - flight - 275) : 270
    const fieldingTime = boundary ? 0 : intent.caught ? 430 : 255 + throwTime
    let fieldGoalX = destinationX - Math.sign(destinationX - fielder.x) * 9
    let fieldGoalY = destinationY + 2
    let diveAt = null
    if (boundary) {
      const [ropeX, ropeY] = this.toScreen(boundaryPoint(intent.direction))
      fieldGoalX = lerp(ropeX, this.w * 0.5, 0.065)
      fieldGoalY = lerp(ropeY, this.h * BOUNDARY_CENTER_Y, 0.065)
      const chaseDistance = Phaser.Math.Distance.Between(fielder.x, fielder.y, fieldGoalX, fieldGoalY)
      const reach = Math.min(1, (flight - 60) * 0.31 / Math.max(1, chaseDistance))
      fieldGoalX = lerp(fielder.x, fieldGoalX, reach)
      fieldGoalY = lerp(fielder.y, fieldGoalY, reach)
      if (intent.runs === 4 && chaseDistance <= (flight - 260) * 0.31) diveAt = flight - 240
    }
    const diveEnd = diveAt === null ? 0 : diveAt + DIVE_DURATION
    const duration = Math.max(running?.duration ?? 0, flight + fieldingTime, diveEnd, 690)
    const backingUp = this.fielders.filter(actor => actor !== fielder).map(actor => {
      const distance = Phaser.Math.Distance.Between(actor.x, actor.y, destinationX, destinationY)
      const step = Math.min(0.18, 22 / Math.max(1, distance))
      return {
        actor, fromX: actor.x, fromY: actor.y,
        toX: lerp(actor.x, destinationX, step), toY: lerp(actor.y, destinationY, step),
      }
    })
    const play = {
      kind: 'shot', fromX, fromY, fromHeight: this.ballShadow.y - this.ball.y,
      destinationX, destinationY, fielder, fielderX: fielder.x, fielderY: fielder.y,
      fieldGoalX, fieldGoalY, diveAt,
      flight, duration, running, intent, boundary, backingUp, throwTime,
      keeperX: this.keeper.x,
      label: intent.caught ? 'OUT! CAUGHT' : boundary ? intent.runs === 6 ? 'SIX!' : 'FOUR!' : `${intent.runs} RUN${intent.runs === 1 ? '' : 'S'}`,
      outcome: { runs: intent.runs, wicket: intent.caught },
    }
    this.startPlay(play, intent.grade)
  }

  shotDestination(intent, side) {
    if (intent.runs >= 4) {
      const [x, y] = boundaryPoint(intent.direction)
      const carry = intent.runs === 6 ? 1.08 : 1
      return this.toScreen([lerp(0.5, x, carry), lerp(BOUNDARY_CENTER_Y, y, carry)])
    }

    const distance = 0.20 + intent.runs * 0.067
    return this.toScreen([0.5 + distance * (side || 0.32), side ? 0.59 : 0.59 + intent.runs * 0.055])
  }

  findInterception(intent, fromX, fromY, targetX, targetY) {
    if (intent.runs < 2 || intent.runs > 3 || intent.loft) return null
    const reach = INTERCEPTION_REACH[this.settings.difficulty] ?? INTERCEPTION_REACH.Medium

    // A ground stroke through a covered channel is gathered early enough to save a run.
    for (const fraction of [0.48, 0.62, 0.76]) {
      const x = lerp(fromX, targetX, fraction)
      const y = lerp(fromY, targetY, fraction)
      const fielder = this.closestFielder(x, y)
      if (Phaser.Math.Distance.Squared(fielder.x, fielder.y, x, y) <= reach ** 2) return { fielder, x, y }
    }
    return null
  }

  beginMiss() {
    const { intent, line } = this.delivery
    const grade = intent?.grade || 'missed'
    // Only deliveries near the wicket can hit it or trap the striker in front.
    const onStumps = Math.abs(line + 2) < 7.5
    const padLine = Math.abs(line - 7) < 8 && grade !== 'leave'
    let kind = 'gather'
    if (onStumps && Math.random() < 0.7) kind = 'bowled'
    else if (padLine && Math.random() < 0.23) kind = 'lbw'
    const label = { gather: 'DOT BALL', bowled: 'OUT! BOWLED', lbw: 'OUT! LBW' }[kind]
    this.startPlay({
      kind, intent, label, outcome: { runs: 0, wicket: kind !== 'gather' },
      fromX: this.ball.x, fromY: this.ballShadow.y, fromHeight: this.ballShadow.y - this.ball.y,
      keeperX: this.keeper.x, duration: 560,
    }, grade)
  }

  startPlay(play, grade) {
    this.play = { ...play, startedAt: this.elapsed, scored: false }
    this.setStage('result', grade)
  }

  closestFielder(x, y) {
    let closest = this.fielders[0]
    let bestDistance = Infinity
    for (const fielder of this.fielders) {
      const distance = Phaser.Math.Distance.Squared(x, y, fielder.x, fielder.y)
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
      if (this.elapsed < play.reportAt) return
      play.reportAt = null
      if (this.finished) this.onUpdate({ ...this.snapshot(), finished: true })
      else this.beginReady(590)
      return
    }

    this.updateBowlerFollowThrough(this.elapsed - this.delivery.releasedAt)
    if (play.kind === 'shot') this.updateShot(play, time)
    else this.updateMiss(play, time)

    if (time >= play.duration) this.recordPlay(play)
  }

  updateShot(play, elapsed) {
    const t = progress(elapsed, play.flight)
    const groundShot = !play.intent.caught && play.intent.runs !== 6 && !play.intent.loft
    const travel = groundShot ? 1 - (1 - t) ** 1.6 : t
    const air = groundShot ? progress(elapsed, 330) : t
    const x = lerp(play.fromX, play.destinationX, travel)
    const y = lerp(play.fromY, play.destinationY, travel)
    const loftHeight = play.intent.caught ? 58 : play.intent.runs === 6 ? 134 : play.intent.loft ? 66 : 29
    const height = Math.max(0, play.fromHeight * (1 - air)) + Math.sin(air * Math.PI) * loftHeight
    const facing = Math.sign(play.fieldGoalX - play.fielderX) || 1

    if (elapsed < play.flight) {
      const landingHeight = play.intent.caught ? t * 31 : 0
      this.drawBall(x, y, height + landingHeight, lerp(0.32, 0.25, t))
      if (play.diveAt === null || elapsed < play.diveAt) {
        const chase = progress(elapsed - 45, play.diveAt === null ? play.flight - 65 : play.diveAt - 45)
        const x = lerp(play.fielderX, play.fieldGoalX, chase)
        const y = lerp(play.fielderY, play.fieldGoalY, chase)
        this.place(play.fielder, x, y, 'run', cycle(elapsed, 360), facing)
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

    play.backingUp.forEach(({ actor, fromX, fromY, toX, toY }, index) => {
      const moveAt = 85 + index * 28
      const step = smooth(progress(elapsed - moveAt, 340))
      const pose = step > 0 && step < 1 ? 'run' : 'ready'
      const facing = Math.sign(toX - fromX) || actor.facing
      this.place(actor, lerp(fromX, toX, step), lerp(fromY, toY, step), pose, cycle(elapsed + moveAt, 410), facing)
    })

    const [keeperX, keeperY] = this.toScreen(KEEPER)
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
      const [x, y] = this.toScreen(KEEPER)
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
        actor: this.batter, towardsNear: true, startAt: strikerStart, strideOffset: 50,
        from: [this.batter.x, this.batter.y],
      },
      partner: {
        actor: this.partner, towardsNear: false, startAt: partnerStart, strideOffset: 130,
        from: [this.partner.x, this.partner.y],
      },
      far: this.toScreen(FAR_GROUND),
      near: this.toScreen(NEAR_GROUND),
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
    const [keeperX, keeperY] = this.toScreen(KEEPER)
    const t = progress(elapsed, 235)
    const takeX = keeperX + this.delivery.line * 0.8
    const keeperPose = play.outcome.wicket && t > 0.9 ? 'appeal' : 'collect'
    const keeperPhase = keeperPose === 'appeal' ? progress(elapsed - 195, 200) : t
    this.place(this.keeper, lerp(play.keeperX, takeX, t), keeperY + 6 * Math.sin(t * Math.PI), keeperPose, keeperPhase)
    this.fielders.forEach((fielder, index) => {
      const appealing = play.outcome.wicket && index < 2
      const pose = appealing ? 'appeal' : 'ready'
      const phase = appealing ? progress(elapsed - 65, 670) : cycle(elapsed + index * 167, 1630)
      fielder.setPose(pose, phase)
    })

    if (play.kind === 'bowled') {
      // The deflection is kept near the far stumps, then the keeper steps in.
      const rebound = progress(elapsed, 200)
      if (rebound < 1) this.drawBall(lerp(play.fromX, this.w * 0.47, rebound), lerp(play.fromY, this.h * 0.426, rebound), Math.sin(rebound * Math.PI) * 24, 0.27)
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
    this.ball.setPosition(x, y - height).setScale(scale).setVisible(true)
    this.ballShadow.setPosition(x, y).setAlpha(Phaser.Math.Clamp(0.52 - height * 0.004, 0.08, 0.52)).setVisible(true)
  }

  hideBall() {
    this.ball.setVisible(false)
    this.ballShadow.setVisible(false)
    if (this.trail.emitting) this.trail.stop()
  }

  recordPlay(play) {
    const { label, outcome } = play
    play.scored = true
    this.hideBall()
    if (outcome.runs > 0 && outcome.runs < 4 && outcome.runs % 2 === 1) {
      const previousStriker = this.batter
      this.batter = this.partner
      this.partner = previousStriker
    }
    this.footwork = null
    this.balls++
    this.score += outcome.runs
    this.recentDeliveries.push({ ...outcome, direction: play.intent?.direction })
    if (this.recentDeliveries.length > 4) this.recentDeliveries.shift()
    if (outcome.wicket) {
      this.wickets++
      this.soundEffect('wicket')
      this.vibrate([35, 35, 60])
    } else if (outcome.runs >= 4) {
      this.soundEffect('crowd')
    }

    this.popup.setText(label).setColor(outcome.wicket ? '#ff8d79' : '#ffe37b').setAlpha(1).setScale(0.64)
    this.tweens.add({ targets: this.popup, scale: 1, duration: 160, ease: 'Back.easeOut' })
    this.tweens.add({ targets: this.popup, alpha: 0, delay: 680, duration: 230 })

    this.finished = this.balls >= this.totalBalls || this.wickets >= 10
    play.reportAt = this.elapsed + 940
    this.onUpdate(this.snapshot())
  }

  snapshot() {
    return {
      score: this.score, wickets: this.wickets, balls: this.balls,
      overs: `${Math.floor(this.balls / 6)}.${this.balls % 6}`,
      totalBalls: this.totalBalls, extras: this.extras,
    }
  }

  soundEffect(kind) {
    if (this.settings.sound === false) return
    try {
      const Audio = window.AudioContext || window.webkitAudioContext
      if (!Audio) return
      this.audio ||= new Audio()
      if (this.audio.state === 'suspended') this.audio.resume().catch(() => {})
      const osc = this.audio.createOscillator()
      const gain = this.audio.createGain()
      osc.connect(gain)
      gain.connect(this.audio.destination)
      osc.frequency.value = { wicket: 180, crowd: 540, hit: 330 }[kind]
      const now = this.audio.currentTime
      gain.gain.setValueAtTime(0.045, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16)
      osc.start()
      osc.stop(now + 0.16)
    } catch {}
  }

  vibrate(pattern) {
    navigator.vibrate?.(pattern)
  }

  setPaused(value) {
    this.paused = value
    this.clearPointer()
    if (value) {
      this.tweens.pauseAll()
      this.trail?.pause()
    } else {
      this.tweens.resumeAll()
      this.trail?.resume()
    }
  }

  onShutdown() {
    this.input.off('pointerdown', this.onPointerDown, this)
    this.input.off('pointerup', this.onPointerUp, this)
    this.input.off('pointerupoutside', this.clearPointer, this)
    this.input.keyboard?.off('keydown', this.onKeyDown, this)
    this.audio?.close().catch(() => {})
    this.audio = null
  }
}
