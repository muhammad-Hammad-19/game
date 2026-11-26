import { preloadGame } from './BootScene.js'
import { showStadium } from './MenuScene.js'
import { FieldCanvas } from './FieldCanvas.js'
import MatchScene from './MatchScene.js'

export function createGame(mount, { onProgress = () => {} } = {}) {
  const field = new FieldCanvas(mount)
  const controller = new AbortController()
  const { signal } = controller
  let scene
  let frame = 0
  let previousTime = 0
  let resizeTimer = 0

  function tick(time) {
    frame = 0
    if (!scene || signal.aborted || document.hidden) return
    const delta = previousTime ? Math.min(50, time - previousTime) : 0
    previousTime = time
    if (!scene.paused) {
      scene.update(time, delta)
      field.trail?.step(scene.frameDelta)
      field.draw(scene.zoom)
    }
    // A match-complete scene stays painted for its result overlay.
    if (scene && !(scene.finished && scene.play?.reportAt === null)) frame = requestAnimationFrame(tick)
  }

  function stopLoop() {
    cancelAnimationFrame(frame)
    frame = 0
    previousTime = 0
  }

  function toggleLoop() {
    stopLoop()
    if (scene && !scene.paused && !document.hidden) frame = requestAnimationFrame(tick)
  }

  function resize() {
    field.resize()
    field.draw(scene?.zoom)
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
    startMatch(data) {
      stopLoop()
      field.reset()
      scene = new MatchScene()
      scene.scale = field.scale
      scene.add = field.add
      scene.textures = field.textures
      scene.zoom = 1
      scene.init(data)
      scene.onPauseChange = toggleLoop
      scene.create()
      field.bake()
      field.draw()
      toggleLoop()
      return scene
    },
    showMenu() {
      stopLoop()
      scene = null
      showStadium(field)
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
