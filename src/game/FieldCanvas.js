import * as THREE from 'three'
import { Figure, playerModelReady } from './PlayerModel.js'
import { mapPoint } from './viewMap.js'

const WIDTH = 960
const HEIGHT = 540
const makeCanvas = (width, height) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export class TextureStore extends Map {
  createCanvas(key, width, height) {
    this.onReplace?.(this.get(key))
    const source = makeCanvas(width, height)
    const texture = { source, resolution: 1, frames: new Map(), getContext: () => source.getContext('2d'), addFrame(id, x, y, w, h) { this.frames.set(id, { x, y, w, h }) } }
    this.set(key, texture)
    return texture
  }
  remove(key) {
    this.onReplace?.(this.get(key))
    this.delete(key)
  }
  clear() {
    for (const texture of this.values()) texture.source.close?.()
    super.clear()
  }
}

class DisplayObject {
  constructor(owner, mesh) {
    this.owner = owner
    this.mesh = mesh
    this.depth = 0
    this.alpha = 1
    this.visible = true
    this.scale = 1
    this.rotation = 0
    // `lift` raises an object straight up the screen (a ball in the air); `fixed` objects
    // are full-frame layers that ignore the camera-angle mapping.
    this.lift = 0
    this.fixed = false
    owner.scene.add(mesh)
    owner.objects.push(this)
  }
  setPosition(x, y) { this.x = x; this.y = y; this.sync(); return this }
  setDepth(depth) { this.depth = depth; this.sync(); return this }
  setVisible(visible) { this.visible = visible; this.mesh.visible = visible; return this }
  setAlpha(alpha) { this.alpha = alpha; this.mesh.material.opacity = alpha; return this }
  setTint(color) { this.mesh.material.color.set(color); return this }
  setScale(scale) { this.scale = scale; this.sync(); return this }
  setRotation(angle) { this.rotation = angle; this.mesh.rotation.z = -angle; return this }
  setLift(lift) { this.lift = lift; this.sync(); return this }
  setFixed() { this.fixed = true; this.sync(); return this }
  sync() {
    const [x, y] = this.fixed ? [this.x ?? 0, this.y ?? 0] : this.owner.project(this.x ?? 0, this.y ?? 0)
    this.mesh.position.x = x + (this.width || 0) * this.scale * (0.5 - (this.originX ?? 0.5))
    this.mesh.position.y = -(y - this.lift + (this.height || 0) * this.scale * (0.5 - (this.originY ?? 0.5)))
    this.mesh.renderOrder = this.depth
    this.mesh.position.z = this.depth * 0.001
    this.mesh.scale.set(this.width * this.scale || 1, this.height * this.scale || 1, 1)
  }
  dispose() { this.owner.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose() }
}

class Sprite extends DisplayObject {
  constructor(owner, x, y, texture, frame) {
    const map = owner.textureFor(texture)
    super(owner, new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false })))
    this.texture = texture
    this.map = map
    this.source = texture.source
    this.originX = 0.5
    this.originY = 0.5
    this.flip = false
    this.setFrame(frame)
    this.setPosition(x, y)
  }
  setFrame(id) {
    this.frameId = id
    this.frame = this.texture.frames?.get(id)
    const resolution = this.texture.resolution || 1
    this.width = (this.frame?.w ?? this.source.width) / resolution
    this.height = (this.frame?.h ?? this.source.height) / resolution
    if (this.frame) {
      const left = this.frame.x / this.source.width
      const right = (this.frame.x + this.frame.w) / this.source.width
      const top = 1 - this.frame.y / this.source.height
      const bottom = top - this.frame.h / this.source.height
      const uv = this.mesh.geometry.attributes.uv
      uv.setXY(0, left, top)
      uv.setXY(1, right, top)
      uv.setXY(2, left, bottom)
      uv.setXY(3, right, bottom)
      uv.needsUpdate = true
    }
    this.sync()
    return this
  }
  setDisplaySize(w, h) {
    this.width = w; this.height = h
    this.sync(); return this
  }
  setOrigin(x, y) { this.originX = x; this.originY = y; this.sync(); return this }
  setFlipX(value) { this.flip = value; this.mesh.scale.x = Math.abs(this.mesh.scale.x) * (value ? -1 : 1); return this }
  sync() {
    super.sync()
    if (this.width) this.mesh.scale.set(this.width * this.scale * (this.flip ? -1 : 1), this.height * this.scale, 1)
  }
}

class Shadow extends DisplayObject {
  constructor(owner, x, y, width, height, color, alpha) {
    super(owner, new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, depthTest: false })))
    this.radiusX = width / 2; this.radiusY = height / 2
    this.setPosition(x, y)
  }
  setSize(width, height) { this.radiusX = width / 2; this.radiusY = height / 2; this.sync(); return this }
  sync() {
    const [x, y] = this.owner.project(this.x ?? 0, this.y ?? 0)
    this.mesh.position.set(x, -y, this.depth * 0.001)
    this.mesh.renderOrder = this.depth
    this.mesh.scale.set(this.radiusX * this.scale, this.radiusY * this.scale, 1)
  }
}

class Rope extends DisplayObject {
  constructor(owner) {
    super(owner, new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false })))
    this.strokes = []
  }
  lineStyle(width, color, alpha) { this.style = { width, color, alpha }; return this }
  strokePoints(points, closed) { this.strokes.push({ points, closed, ...this.style }); this.draw(); return this }
  draw() {
    for (const stroke of this.strokes) {
      const vertices = stroke.points.map(p => new THREE.Vector3(p.x, -p.y, 0))
      if (stroke.closed) vertices.push(vertices[0])
      this.mesh.geometry.dispose()
      this.mesh.geometry = new THREE.BufferGeometry().setFromPoints(vertices)
      this.mesh.material.color.set(stroke.color)
      this.mesh.material.opacity = stroke.alpha
      this.mesh.material.transparent = stroke.alpha < 1
      this.mesh.material.needsUpdate = true
    }
  }
}

class BallTrail extends DisplayObject {
  constructor(owner, options) {
    const count = Math.ceil(options.lifespan / options.frequency) + 2
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(count), 1))
    geometry.setDrawRange(0, 0)
    const material = new THREE.PointsMaterial({ color: '#fff8cd', size: 5, transparent: true, depthTest: false, sizeAttenuation: false })
    super(owner, new THREE.Points(geometry, material))
    this.mesh.frustumCulled = false
    this.geometry = geometry; this.life = options.lifespan; this.interval = options.frequency
    this.count = count; this.ages = new Float32Array(count).fill(this.life)
    this.head = 0; this.remainder = 0; this.emitting = false
  }
  startFollow(ball) { this.ball = ball; return this }
  start() { this.emitting = true; this.remainder = 0; return this }
  stop() { this.emitting = false; this.ages.fill(this.life); this.geometry.setDrawRange(0, 0); return this }
  pause() { this.paused = true }
  resume() { this.paused = false }
  step(delta) {
    if (this.paused) return
    for (let i = 0; i < this.count; i++) this.ages[i] += delta
    if (this.emitting && this.ball.visible) {
      this.remainder += delta
      if (this.remainder >= this.interval) {
        this.remainder %= this.interval
        this.geometry.attributes.position.setXYZ(this.head, this.ball.mesh.position.x, this.ball.mesh.position.y, 1)
        this.ages[this.head] = 0
        this.head = (this.head + 1) % this.count
      }
    }
    let active = 0
    for (let i = 0; i < this.count; i++) {
      if (this.ages[i] < this.life) this.geometry.index.setX(active++, i)
    }
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.index.needsUpdate = true
    this.geometry.setDrawRange(0, active)
  }
}

export class FieldCanvas {
  constructor(mount) {
    this.mount = mount
    this.textures = new TextureStore()
    this.textureMaps = new WeakMap()
    this.scale = { width: WIDTH, height: HEIGHT }
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#0e2422')
    // Deep enough for the 3D players, which stand at different distances from the lens.
    this.camera = new THREE.OrthographicCamera(-WIDTH / 2, WIDTH / 2, HEIGHT / 2, -HEIGHT / 2, 1, 4000)
    this.camera.position.set(WIDTH / 2, -HEIGHT / 2, 2000)
    this.useModels = false
    this.addLights()
    this.renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, powerPreference: 'high-performance' })
    this.quality = 'High'
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;pointer-events:none'
    mount.append(this.renderer.domElement)
    this.objects = []
    this.textures.onReplace = texture => {
      const map = texture && this.textureMaps.get(texture)
      if (map) { map.dispose(); this.textureMaps.delete(texture) }
    }
    this.textureFor = texture => {
      let map = this.textureMaps.get(texture)
      if (!map) {
        map = new THREE.Texture(texture.source)
        map.colorSpace = THREE.SRGBColorSpace
        map.anisotropy = 4
        map.needsUpdate = true
        this.textureMaps.set(texture, map)
      }
      return map
    }
    this.add = {
      image: (x, y, key, frame) => new Sprite(this, x, y, this.textures.get(key), frame),
      ellipse: (...args) => new Shadow(this, ...args),
      graphics: () => new Rope(this),
      particles: (_x, _y, _key, options) => this.trail = new BallTrail(this, options),
      // Returns nothing when 3D players are off, and the caller falls back to sprites.
      figure: (x, y, options) => (this.useModels && playerModelReady() ? new Figure(this, x, y, options) : null),
    }
    this.resize()
  }
  reset() {
    for (const object of this.objects) object.dispose()
    this.objects.length = 0; this.trail = null; this.scene.clear()
    this.scene.background = new THREE.Color('#0e2422')
    this.addLights()
  }
  resize() {
    const width = Math.min(this.mount.clientWidth, this.mount.clientHeight * WIDTH / HEIGHT)
    if (width < 1) return
    const height = width * HEIGHT / WIDTH
    this.renderer.setSize(width, height, false)
    this.renderer.domElement.style.width = width + 'px'
    this.renderer.domElement.style.height = height + 'px'
  }
  // Evening floodlights: a soft fill plus a key light from high on the left.
  addLights() {
    const key = new THREE.DirectionalLight(0xfff1dc, 2.1)
    key.position.set(-0.55, 0.9, 1)
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.7)
    rim.position.set(0.8, 0.5, -0.4)
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.15), key, rim)
  }
  setQuality(quality) {
    this.quality = quality
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'Low' ? 1 : 2))
    this.resize()
  }
  // Match-layout pixels to screen pixels for the behind-the-bowler angle.
  project(x, y) {
    const [px, py] = mapPoint(x / WIDTH, y / HEIGHT)
    return [px * WIDTH, py * HEIGHT]
  }
  // view: { x, y, zoom } in match-layout pixels. The view is kept inside the picture.
  draw(view) {
    if (view) {
      const [vx, vy] = this.project(view.x, view.y)
      view = { x: vx, y: vy, zoom: view.zoom }
    }
    const zoom = Math.max(1, view?.zoom ?? 1)
    const halfWidth = WIDTH / 2 / zoom
    const halfHeight = HEIGHT / 2 / zoom
    const x = Math.max(halfWidth, Math.min(WIDTH - halfWidth, view?.x ?? WIDTH / 2))
    const y = Math.max(halfHeight, Math.min(HEIGHT - halfHeight, view?.y ?? HEIGHT / 2))
    this.camera.zoom = zoom
    this.camera.position.x = x
    this.camera.position.y = -y
    this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
  }
  bake() { this.draw() }
  destroy() {
    this.reset(); this.textures.clear(); this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
