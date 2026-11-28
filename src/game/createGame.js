import { preloadGame } from './BootScene.js'
import { showStadium } from './MenuScene.js'
import { FieldCanvas } from './FieldCanvas.js'
import { bakeKits } from './CricketActor.js'
import MatchScene from './MatchScene.js'
import { UMPIRE_KIT } from '../data/teams.js'
import { playerModelReady } from './PlayerModel.js'

export function createGame(mount, { onProgress = () => {} } = {}) {
  const field = new FieldCanvas(mount)
  const controller = new AbortController()
  const { signal } = controller
  let scene
  let frame = 0
  let previousTime = 0
  let resizeTimer = 0
  let starting = 0

  function tick(time) {
    frame = 0
    const current = scene
    if (!current || signal.aborted || document.hidden) return
    const delta = previousTime ? Math.min(50, time - previousTime) : 0
    previousTime = time
    if (!current.paused) {
      // Test runs can step the simulation several times per painted frame.
      const steps = current.match.fast || 1
      for (let step = 0; step < steps && !current.done; step++) current.update(time, steps > 1 ? 16.67 : delta)
      // Finishing an innings can swap the scene out from inside update().
      if (scene === current) {
        field.trail?.step(current.frameDelta || 0)
        field.draw(current.cam)
      }
    }
    // A match-complete scene stays painted for its result overlay.
    if (scene === current && !current.done) frame = requestAnimationFrame(tick)
  }

  function stopLoop() {
    cancelAnimationFrame(frame)
    frame = 0
    previousTime = 0
  }

  function toggleLoop() {
    stopLoop()
    if (scene && !scene.paused && !scene.done && !document.hidden) frame = requestAnimationFrame(tick)
  }

  function resize() {
    field.resize()
    field.draw(scene?.cam)
  }
  function scheduleResize() {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(resize, 80)
  }

  resize()
  const observer = new ResizeObserver(scheduleResize)
  observer.observe(mount)
  window.addEventListener('resize', scheduleResize, { signal })
  window.addEventListener('orientationchange', scheduleResize, { signal })
  document.addEventListener('visibilitychange', toggleLoop, { signal })
  return {
    ready: preloadGame(field.textures, onProgress, () => showStadium(field), signal),
    // data.match: { batting, bowling, bat, bowl, maxBalls, maxWickets, target, label, pitch, seed, wood }
    async startMatch(data) {
      const token = ++starting
      stopLoop()
      scene = null
      const { batting, bowling, wood } = data.match
      const quality = data.settings?.quality === 'Low' ? 'Low' : 'High'
      if (field.quality !== quality) field.setQuality(quality)
      const sheets = {
        batter: `batter-${batting.id}-${wood?.id ?? 'classic'}`,
        bowler: `bowler-${bowling.id}`, keeper: `keeper-${bowling.id}`, fielder: `fielder-${bowling.id}`, umpire: 'umpire',
      }
      // Keep only the kits this innings needs; sheets are large.
      for (const key of [...field.textures.keys()]) {
        if (/^(batter|bowler|keeper|fielder)-/.test(key) && !Object.values(sheets).includes(key)) field.textures.remove(key)
      }
      // 3D players on capable devices; painted sprites on the light setting or if the model failed to load.
      field.useModels = quality === 'High' && data.settings?.players !== 'Sprites' && playerModelReady()
      if (!field.useModels) await bakeKits(field.textures, [
        { key: sheets.batter, role: 'batter', kit: batting.kit, wood: wood?.colors },
        { key: sheets.bowler, role: 'bowler', kit: bowling.kit, number: '17' },
        { key: sheets.keeper, role: 'keeper', kit: bowling.kit, number: '1' },
        { key: sheets.fielder, role: 'fielder', kit: bowling.kit },
        { key: sheets.umpire, role: 'umpire', kit: UMPIRE_KIT },
      ], quality, undefined, signal)
      if (token !== starting || signal.aborted) return null
      field.reset()
      scene = new MatchScene()
      scene.scale = field.scale
      scene.add = field.add
      scene.textures = field.textures
      scene.init({ ...data, match: { ...data.match, sheets } })
      scene.onPauseChange = toggleLoop
      scene.create()
      field.bake()
      field.draw(scene.cam)
      toggleLoop()
      return scene
    },
    showMenu() {
      starting++
      stopLoop()
      scene = null
      showStadium(field)
    },
    setQuality(quality) {
      field.setQuality(quality)
      field.draw(scene?.cam)
    },
    destroy() {
      controller.abort()
      stopLoop()
      clearTimeout(resizeTimer)
      observer.disconnect()
      scene = null
      field.destroy()
    },
  }
}
