// Runs the real MatchScene without a browser: display objects are plain records.
import MatchScene from '../src/game/MatchScene.js'

class Obj {
  constructor() { this.x = 0; this.y = 0; this.scale = 1; this.alpha = 1; this.visible = true; this.depth = 0; this.flip = false; this.emitting = false; this.lift = 0 }
  setPosition(x, y) { this.x = x; this.y = y; return this }
  setDepth(depth) { this.depth = depth; return this }
  setVisible(visible) { this.visible = visible; return this }
  setAlpha(alpha) { this.alpha = alpha; return this }
  setScale(scale) { this.scale = scale; return this }
  setRotation() { return this }
  setLift(lift) { this.lift = lift; return this }
  setFixed() { return this }
  setTint() { return this }
  setFrame(id) { this.frameId = id; return this }
  setDisplaySize() { return this }
  setOrigin() { return this }
  setFlipX(value) { this.flip = value; return this }
  startFollow() { return this }
  start() { this.emitting = true; return this }
  stop() { this.emitting = false; return this }
  pause() {}
  resume() {}
}

export function makeScene(match, { settings = {}, net = null, onEvent = () => {}, onUpdate = () => {} } = {}) {
  const scene = new MatchScene()
  scene.scale = { width: 960, height: 540 }
  scene.add = { image: () => new Obj(), ellipse: () => new Obj(), graphics: () => new Obj(), particles: () => new Obj() }
  scene.textures = { has: () => true }
  const events = []
  scene.init({
    settings: { difficulty: 'Medium', sound: false, ...settings }, net,
    match: { maxWickets: 10, sheets: { batter: 'b', bowler: 'w', keeper: 'k', fielder: 'f', umpire: 'u' }, ...match },
    onEvent: (type, payload) => { events.push([type, payload]); onEvent(type, payload, scene) },
    onUpdate,
  })
  scene.create()
  scene.events = events
  return scene
}

const finite = value => Number.isFinite(value)

// Steps the scene until the innings ends. `control(scene)` is called every frame.
export function run(scene, control = () => {}, { step = 16.67, limit = 4e6 } = {}) {
  let frames = 0
  let lastProgress = 0
  let lastBalls = -1
  while (!scene.done) {
    control(scene)
    scene.update(0, step)
    frames++
    if (frames > limit) throw new Error(`innings did not finish: phase=${scene.phase} balls=${scene.innings.balls}`)
    if (scene.ballCount !== lastBalls) { lastBalls = scene.ballCount; lastProgress = frames }
    if (frames - lastProgress > 3000) throw new Error(`stuck for 50s of game time in phase=${scene.phase} at ball ${scene.ballCount}`)
    if (frames % 7 === 0) {
      for (const actor of scene.actors) if (!finite(actor.x) || !finite(actor.y)) throw new Error('actor position is not a number in ' + scene.phase)
      if (!finite(scene.cam.x) || !finite(scene.cam.zoom)) throw new Error('camera is not a number')
    }
  }
  return scene.innings
}
