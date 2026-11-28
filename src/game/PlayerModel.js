// 3D players: one rigged model (assets/player.glb, built by tools/build-player-model.mjs)
// cloned per player, dressed per role and team, and posed from its animation clips.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import modelUrl from './assets/player.glb?url'
import { ACTOR_POSES, LOOPS } from './CricketActor.js'

const FRAME_COUNT = 12
// The broadcast camera looks down the pitch from above; players are turned a little so both sides show.
const TILT = 0.34
const YAW = 0.58
const GEAR = {
  batter: ['gear_helmet', 'gear_padL', 'gear_padR', 'gear_gloveL', 'gear_gloveR', 'gear_bat'],
  keeper: ['gear_helmet', 'gear_padL', 'gear_padR', 'gear_gloveL', 'gear_gloveR'],
  bowler: ['gear_cap'], fielder: ['gear_cap'], umpire: ['gear_hat'],
}
let template = null
const wardrobe = new Map()
const shadowGeometry = new THREE.CircleGeometry(1, 20)
const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x06140c, transparent: true, opacity: 0.3, depthWrite: false })

export async function loadPlayerModel() {
  if (template) return true
  try {
    const gltf = await new GLTFLoader().loadAsync(modelUrl)
    const clips = new Map(gltf.animations.map(clip => [clip.name, clip]))
    template = { scene: gltf.scene, clips }
    return true
  } catch {
    return false
  }
}

export const playerModelReady = () => Boolean(template)

// Colour slots, in the order the model's `_palette` attribute numbers them.
const PALETTE = ['kit', 'trousers', 'headgear', 'skin', 'white', 'dark', 'wood', 'grey', 'trim', 'hair']
// One material for every player: colours live on the vertices. Marked transparent so
// players sort with the painted layers; they still write depth.
const material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true })

// Returns coloured copies of the model's meshes for one role in one team's kit.
function dress(role, kit, wood) {
  const key = `${role}|${kit.shirt}|${kit.shadow}|${kit.trim}|${wood?.[1] ?? ''}`
  if (wardrobe.has(key)) return wardrobe.get(key)
  const shirt = new THREE.Color(kit.shirt)
  const named = {
    kit: shirt, trousers: role === 'umpire' ? new THREE.Color(0x20282e) : shirt.clone().multiplyScalar(0.84),
    headgear: new THREE.Color(kit.shadow), skin: new THREE.Color(0xb9805a), white: new THREE.Color(0xeceee8),
    dark: new THREE.Color(0x1b2227), wood: new THREE.Color(wood?.[1] ?? '#d9b682'), grey: new THREE.Color(0xa9b6bf),
    trim: new THREE.Color(kit.trim), hair: new THREE.Color(0x2a1c14),
  }
  const colors = PALETTE.map(name => named[name])
  const skin = PALETTE.indexOf('skin')
  const geometries = new Map()
  template.scene.traverse(object => {
    if (!object.isMesh) return
    const geometry = object.geometry.clone()
    const slots = geometry.getAttribute('_palette')
    // The umpire wears a long coat, so his arms take the coat colour.
    const sleeves = role === 'umpire' && /^(forearm|elbow)/.test(object.name)
    const paint = new Float32Array(slots.count * 3)
    for (let i = 0; i < slots.count; i++) {
      const slot = Math.round(slots.getX(i))
      const color = colors[sleeves && slot === skin ? 0 : slot] || colors[0]
      paint[i * 3] = color.r
      paint[i * 3 + 1] = color.g
      paint[i * 3 + 2] = color.b
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(paint, 3))
    geometry.deleteAttribute('_palette')
    geometry.deleteAttribute('uv')
    geometries.set(object.name, geometry)
  })
  wardrobe.set(key, geometries)
  return geometries
}

export class Figure {
  constructor(owner, x, y, { role, kit, wood }) {
    this.owner = owner
    this.role = role
    this.poses = ACTOR_POSES[role]
    this.depth = 0
    this.alpha = 1
    this.visible = true
    this.scale = 1
    this.flip = false
    this.meshes = []
    const geometries = dress(role, kit, wood)
    const model = template.scene.clone(true)
    const gear = GEAR[role]
    model.traverse(object => {
      if (!object.isMesh && object.name.startsWith('gear_')) object.visible = gear.includes(object.name)
      if (!object.isMesh) return
      object.geometry = geometries.get(object.name)
      object.material = material
      // The mesh never moves within its part.
      object.matrixAutoUpdate = false
      this.meshes.push(object)
    })
    if (role === 'keeper') for (const side of ['L', 'R']) model.getObjectByName('gear_glove' + side)?.scale.setScalar(1.3)
    const yaw = new THREE.Group()
    yaw.rotation.y = YAW
    this.yaw = yaw
    this.yawAngle = YAW
    yaw.add(model)
    const tilt = new THREE.Group()
    tilt.rotation.x = TILT
    tilt.add(yaw)
    this.shadow = new THREE.Mesh(shadowGeometry, shadowMaterial)
    this.shadow.scale.set(11.5, 3.3, 1)
    this.shadow.position.set(1.5, 0.4, -14)
    this.group = new THREE.Group()
    this.group.add(this.shadow, tilt)
    this.mixer = new THREE.AnimationMixer(model)
    this.actions = new Map()
    for (const pose of this.poses) {
      const clip = template.clips.get(`${role}.${pose}`)
      if (clip) this.actions.set(pose, this.mixer.clipAction(clip))
    }
    owner.scene.add(this.group)
    owner.objects.push(this)
    this.setPosition(x, y)
    this.setPhase('idle', 0)
  }
  setPosition(x, y) {
    this.x = x
    this.y = y
    const [px, py] = this.owner.project(x, y)
    this.group.position.x = px
    this.group.position.y = -py
    return this
  }
  // Turns the player about the vertical: positive shows the back, negative the chest.
  setYaw(angle) {
    this.yawAngle += (angle - this.yawAngle) * 0.25
    this.yaw.rotation.y = this.yawAngle
    return this
  }
  setDepth(depth) {
    if (depth === this.depth) return this
    this.depth = depth
    // Nearer players sit closer to the camera and are drawn later.
    this.group.position.z = (depth - 20) * 600
    for (const mesh of this.meshes) mesh.renderOrder = depth
    this.shadow.renderOrder = depth - 0.0005
    return this
  }
  setVisible(visible) { this.visible = visible; this.group.visible = visible; return this }
  setAlpha(alpha) { this.alpha = alpha; return this }
  setScale(scale) { this.scale = scale; this.group.scale.set(this.flip ? -scale : scale, scale, scale); return this }
  setFlipX(value) { if (value !== this.flip) { this.flip = value; this.setScale(this.scale) } return this }
  setOrigin() { return this }
  setFrame(id) {
    this.frameId = id
    const name = this.poses[Math.floor(id / FRAME_COUNT)] || 'idle'
    return this.setPhase(name, (id % FRAME_COUNT) / (LOOPS.has(name) ? FRAME_COUNT : FRAME_COUNT - 1))
  }
  // phase runs 0..1 through the pose's clip.
  setPhase(name, phase) {
    const action = this.actions.get(name) || this.actions.get('idle')
    if (!action) return this
    if (action !== this.action) {
      this.action?.stop()
      action.play()
      this.action = action
    }
    // Re-pose only when the animation has moved on by a visible amount.
    const step = Math.round(Math.min(0.9995, Math.max(0, phase)) * 48)
    if (action === this.posedAction && step === this.posedStep) return this
    this.posedAction = action
    this.posedStep = step
    action.time = Math.min(0.9995, step / 48)
    this.mixer.update(0)
    return this
  }
  dispose() {
    this.mixer.stopAllAction()
    this.owner.scene.remove(this.group)
  }
}
