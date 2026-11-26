import * as THREE from 'three'

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
    const source = makeCanvas(width, height)
    const texture = { source, frames: new Map(), getContext: () => source.getContext('2d'), addFrame(id, x, y, w, h) { this.frames.set(id, { x, y, w, h }) } }
    this.set(key, texture)
    return texture
  }
  async prepareSprites(signal) {
    if (typeof createImageBitmap !== 'function') return
    for (const texture of this.values()) {
      if (!texture.frames?.size) continue
      signal.throwIfAborted()
      const canvas = texture.source
      let bitmap
      try { bitmap = await createImageBitmap(canvas, { imageOrientation: 'flipY' }) } catch { continue }
      if (signal.aborted) { bitmap.close(); signal.throwIfAborted() }
      texture.source = bitmap
      canvas.width = canvas.height = 1
    }
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
    owner.scene.add(mesh)
    owner.objects.push(this)
  }
  setPosition(x, y) { this.x = x; this.y = y; this.sync(); return this }
  setDepth(depth) { this.depth = depth; this.sync(); return this }
  setVisible(visible) { this.visible = visible; this.mesh.visible = visible; return this }
  setAlpha(alpha) { this.alpha = alpha; this.mesh.material.opacity = alpha; return this }
  setScale(scale) { this.scale = scale; this.sync(); return this }
  sync() {
    this.mesh.position.x = (this.x ?? 0) + (this.width || 0) * this.scale * (0.5 - (this.originX ?? 0.5))
    this.mesh.position.y = -((this.y ?? 0) + (this.height || 0) * this.scale * (0.5 - (this.originY ?? 0.5)))
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
    this.frame = this.texture.frames?.get(id)
    this.width = this.frame?.w ?? this.source.width
    this.height = this.frame?.h ?? this.source.height
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
  sync() {
    this.mesh.position.set(this.x ?? 0, -(this.y ?? 0), this.depth * 0.001)
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
        this.geometry.attributes.position.setXYZ(this.head, this.ball.x, -this.ball.y, 1)
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
    this.camera = new THREE.OrthographicCamera(-WIDTH / 2, WIDTH / 2, HEIGHT / 2, -HEIGHT / 2, 0.1, 100)
    this.camera.position.set(WIDTH / 2, -HEIGHT / 2, 50)
    this.renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;pointer-events:none'
    mount.append(this.renderer.domElement)
    this.objects = []
    this.textureFor = texture => {
      let map = this.textureMaps.get(texture)
      if (!map) {
        map = new THREE.Texture(texture.source)
        map.colorSpace = THREE.SRGBColorSpace
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
    }
    this.resize()
  }
  reset() {
    for (const object of this.objects) object.dispose()
    this.objects.length = 0; this.trail = null; this.scene.clear()
    this.scene.background = new THREE.Color('#0e2422')
  }
  resize() {
    const width = Math.min(this.mount.clientWidth, this.mount.clientHeight * WIDTH / HEIGHT)
    if (width < 1) return
    const height = width * HEIGHT / WIDTH
    this.renderer.setSize(width, height, false)
    this.renderer.domElement.style.width = width + 'px'
    this.renderer.domElement.style.height = height + 'px'
  }
  draw(zoom = 1) {
    this.camera.zoom = zoom
    const centerY = HEIGHT / 2 + (1 - zoom) * 290
    this.camera.position.y = -centerY
    this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
  }
  bake() { this.draw() }
  destroy() {
    this.reset(); this.textures.clear(); this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
