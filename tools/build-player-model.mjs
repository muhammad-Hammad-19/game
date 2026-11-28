// Builds src/game/assets/player.glb: one articulated cricketer with every role's gear
// and an animation clip for each pose.  Run: node tools/build-player-model.mjs
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { writeFileSync } from 'node:fs'
import { ACTOR_POSES, getPose } from '../src/game/CricketActor.js'

// GLTFExporter only needs this much of the browser's FileReader.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.() }) }
}

const SAMPLES = 13
const SHOULDER = 6.9
const HIP = 3.3
const V = (x, y, z) => new THREE.Vector3(x, y, z)
const UP = V(0, 1, 0)

// Every vertex carries the index of its colour slot; the game fills in team colours.
// Keep this list in step with PALETTE in src/game/PlayerModel.js.
const PALETTE = ['kit', 'trousers', 'headgear', 'skin', 'white', 'dark', 'wood', 'grey', 'trim', 'hair']
const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
material.name = 'player'

const root = new THREE.Group()
root.name = 'player'
const nodes = {}
function node(name, parent = root) {
  const group = new THREE.Group()
  group.name = name
  parent.add(group)
  nodes[name] = group
  return group
}
const pending = new Map()
function mesh(parent, geometry, slot) {
  const index = PALETTE.indexOf(slot)
  if (index < 0) throw new Error('unknown colour slot ' + slot)
  geometry.setAttribute('_palette', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(index), 1))
  if (!pending.has(parent)) pending.set(parent, [])
  pending.get(parent).push(geometry)
}
// One mesh per moving part keeps the number of draw calls low.
function finishMeshes() {
  for (const [parent, geometries] of pending) {
    const part = new THREE.Mesh(mergeGeometries(geometries), material)
    part.name = parent.name + 'Mesh'
    parent.add(part)
  }
}
// A tapered limb running from y = 0 (radius a) to y = 1 (radius b); the node's scale sets its length.
const limb = (a, b) => new THREE.CylinderGeometry(b, a, 1, 12).translate(0, 0.5, 0)
const ball = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h)

// Body
mesh(node('pelvis'), ball(1).scale(3.9, 3.5, 5.3), 'trousers', 'pelvisMesh')
const torso = node('torso')
mesh(torso, new THREE.CylinderGeometry(1.16, 0.88, 1, 16).translate(0, 0.5, 0).scale(4.1, 1, 6.7), 'kit', 'torsoMesh')
// Collar and a stripe down each flank in the team's second colour.
mesh(torso, new THREE.CylinderGeometry(1, 1, 0.07, 14).translate(0, 0.985, 0).scale(2.5, 1, 3.1), 'trim', 'collar')
for (const [index, z] of [-1, 1].entries()) mesh(torso, new THREE.BoxGeometry(1.5, 0.82, 0.5).translate(0, 0.45, z * 6.05), 'trim', 'flank' + index)
const head = node('head')
mesh(head, ball(4.1, 18, 14), 'skin', 'skull')
mesh(head, new THREE.SphereGeometry(4.2, 16, 10).scale(0.72, 0.86, 0.99).translate(-1.75, 0.55, 0), 'hair', 'hairMesh')
mesh(head, new THREE.CylinderGeometry(1.7, 2, 4, 10).translate(-0.4, -4.6, 0), 'skin', 'neck')
// A face: brow line, eyes and nose, so heads read as heads when the camera moves in.
for (const z of [-1.45, 1.45]) {
  mesh(head, ball(0.5, 8, 6).translate(3.75, 0.1, z), 'dark', 'eye')
  mesh(head, new THREE.BoxGeometry(0.5, 0.35, 1.5).translate(3.75, 0.95, z), 'hair', 'brow')
}
mesh(head, ball(0.7, 8, 6).scale(1.2, 1, 0.8).translate(4.1, -0.9, 0), 'skin', 'nose')
mesh(head, ball(0.95, 8, 6).scale(0.6, 1.2, 0.5).translate(-0.3, -0.2, 4.0), 'skin', 'earR')
mesh(head, ball(0.95, 8, 6).scale(0.6, 1.2, 0.5).translate(-0.3, -0.2, -4.0), 'skin', 'earL')
// Headgear, one set per role; the game shows the right one.
const cap = node('gear_cap', head)
mesh(cap, new THREE.SphereGeometry(4.35, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52).translate(0, 0.5, 0), 'headgear', 'capCrown')
mesh(cap, new THREE.CylinderGeometry(3.3, 3.3, 0.5, 14).scale(1.15, 1, 1).translate(3.7, 0.9, 0), 'headgear', 'capPeak')
const helmet = node('gear_helmet', head)
mesh(helmet, new THREE.SphereGeometry(4.9, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62).translate(-0.2, 0.3, 0), 'headgear', 'helmetShell')
mesh(helmet, new THREE.CylinderGeometry(3.4, 3.4, 0.55, 14).scale(1.1, 1, 1.15).translate(3.4, 1.5, 0), 'headgear', 'helmetPeak')
for (const [index, y] of [-0.2, -1.5, -2.8].entries()) {
  mesh(helmet, new THREE.TorusGeometry(4.6, 0.2, 5, 14, Math.PI * 0.9).rotateX(Math.PI / 2).rotateY(Math.PI * 0.45).translate(0.6, y, 0), 'grey', 'grille' + index)
}
const hat = node('gear_hat', head)
mesh(hat, new THREE.CylinderGeometry(7.2, 7.2, 0.5, 20).translate(0, 2.4, 0), 'dark', 'hatBrim')
mesh(hat, new THREE.CylinderGeometry(3.9, 4.3, 3.2, 16).translate(0, 4, 0), 'dark', 'hatCrown')

for (const side of ['L', 'R']) {
  mesh(node('shoulder' + side), ball(2.95), 'kit', 'shoulderMesh' + side)
  const upperArm = node('upperArm' + side)
  mesh(upperArm, limb(2.6, 2.1), 'kit', 'upperArmMesh' + side)
  mesh(upperArm, new THREE.CylinderGeometry(2.3, 2.35, 0.1, 12).translate(0, 0.95, 0), 'trim', 'cuff' + side)
  mesh(node('elbow' + side), ball(1.95), 'skin', 'elbowMesh' + side)
  mesh(node('forearm' + side), limb(1.9, 1.5), 'skin', 'forearmMesh' + side)
  const hand = node('hand' + side)
  mesh(hand, ball(1.75), 'skin', 'handMesh' + side)
  mesh(node('gear_glove' + side, hand), ball(2.5).scale(1, 1.15, 0.95), 'white', 'gloveMesh' + side)
  mesh(node('thigh' + side), limb(3.3, 2.65), 'trousers', 'thighMesh' + side)
  mesh(node('knee' + side), ball(2.7), 'trousers', 'kneeMesh' + side)
  const shin = node('shin' + side)
  mesh(shin, limb(2.55, 1.9), 'trousers', 'shinMesh' + side)
  const pad = node('gear_pad' + side, shin)
  mesh(pad, new THREE.CylinderGeometry(2.7, 3.3, 1, 12).translate(0, 0.5, 0).scale(1.1, 1, 0.95).translate(0.7, 0.02, 0), 'white', 'padMesh' + side)
  mesh(pad, ball(3.2).scale(1, 0.09, 0.95).translate(1.1, -0.03, 0), 'white', 'padRoll' + side)
  const foot = node('foot' + side)
  mesh(foot, new THREE.BoxGeometry(6.6, 2.4, 3.1).translate(1.5, 1.2, 0), 'white', 'shoeMesh' + side)
  mesh(foot, new THREE.BoxGeometry(6.8, 0.6, 3.3).translate(1.5, 0.3, 0), 'dark', 'soleMesh' + side)
}
const bat = node('gear_bat')
mesh(bat, new THREE.CylinderGeometry(0.75, 0.75, 9.2, 8).rotateZ(Math.PI / 2).translate(0.4, 0, 0), 'dark', 'batHandle')
mesh(bat, new THREE.BoxGeometry(19.8, 4.5, 1.5).translate(12.9, 0, 0), 'wood', 'batBlade')
mesh(bat, new THREE.BoxGeometry(17, 1.6, 0.9).translate(13.8, 0, -1), 'wood', 'batSpine')

finishMeshes()

// Turns one 2D rig into node transforms. The drawings spread the far and near limbs
// sideways to show both; here that spread becomes real depth.
function solve(rig, role) {
  const [hipX, hipY, shoulderX, shoulderY, shoulderWidth, tilt] = rig.body
  const half = shoulderWidth / 2
  const out = {}
  const pelvis = V(hipX, -hipY, 0)
  const chest = V(shoulderX, -shoulderY, 0)
  const spine = chest.clone().sub(pelvis)
  out.pelvis = { position: pelvis }
  out.torso = { from: pelvis.clone().addScaledVector(spine.clone().normalize(), -1.5), to: chest.clone().addScaledVector(spine.clone().normalize(), 1.2) }
  out.head = { position: chest.clone().addScaledVector(spine.clone().normalize(), 7.4).add(V(1, 0, 0)) }
  for (const [side, sign, arm, leg] of [['L', -1, rig.farArm, rig.farLeg], ['R', 1, rig.nearArm, rig.nearLeg]]) {
    const pull = -sign * half * 0.78
    const shoulder = V(shoulderX + sign * half * 0.22, -shoulderY - sign * tilt / 2, sign * SHOULDER)
    const elbow = V(arm[0] + pull * (role === 'batter' ? 0.55 : 1), -arm[1], sign * (SHOULDER + 0.9))
    const hand = role === 'batter' ? V(arm[2], -arm[3], sign * 1.3) : V(arm[2] + pull, -arm[3], sign * SHOULDER * 0.85)
    out['shoulder' + side] = { position: shoulder }
    out['upperArm' + side] = { from: shoulder, to: elbow }
    out['elbow' + side] = { position: elbow }
    out['forearm' + side] = { from: elbow, to: hand }
    out['hand' + side] = { position: hand }
    const legPull = -sign * 2.9
    const hip = V(hipX, -hipY - 0.5, sign * HIP)
    const knee = V(leg[0] + legPull, -leg[1], sign * (HIP + 0.3))
    const ankle = V(leg[2] + legPull, -leg[3] + 2.2, sign * (HIP + 0.5))
    out['thigh' + side] = { from: hip, to: knee }
    out['knee' + side] = { position: knee }
    out['shin' + side] = { from: knee, to: ankle }
    out['foot' + side] = { position: V(ankle.x, -leg[3], ankle.z) }
    if (sign === 1) out.gear_bat = { position: hand.clone(), quaternion: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -rig.bat[0] * Math.PI / 180) }
  }
  return out
}

function apply(pose) {
  for (const [name, value] of Object.entries(pose)) {
    const target = nodes[name]
    if (value.from) {
      const span = value.to.clone().sub(value.from)
      const length = Math.max(0.01, span.length())
      target.position.copy(value.from)
      target.quaternion.setFromUnitVectors(UP, span.divideScalar(length))
      target.scale.set(1, length, 1)
    } else {
      target.position.copy(value.position)
      if (value.quaternion) target.quaternion.copy(value.quaternion)
    }
  }
}

const clips = []
for (const [role, poses] of Object.entries(ACTOR_POSES)) {
  for (const poseName of poses) {
    const times = []
    const channels = {}
    for (let i = 0; i < SAMPLES; i++) {
      const phase = i / (SAMPLES - 1)
      times.push(phase)
      const pose = solve(getPose(poseName, phase, role), role)
      apply(pose)
      for (const [name, value] of Object.entries(pose)) {
        const target = nodes[name]
        ;(channels[name + '.position'] ||= []).push(...target.position.toArray())
        if (value.from || value.quaternion) (channels[name + '.quaternion'] ||= []).push(...target.quaternion.toArray())
        if (value.from) (channels[name + '.scale'] ||= []).push(...target.scale.toArray())
      }
    }
    const tracks = Object.entries(channels).map(([path, values]) =>
      path.endsWith('.quaternion') ? new THREE.QuaternionKeyframeTrack(path, times, values) : new THREE.VectorKeyframeTrack(path, times, values))
    clips.push(new THREE.AnimationClip(`${role}.${poseName}`, 1, tracks))
  }
}

// Leave the model standing in the fielder's ready stance.
apply(solve(getPose('idle', 0, 'fielder'), 'fielder'))
const scene = new THREE.Scene()
scene.add(root)
new GLTFExporter().parse(scene, result => {
  const file = new URL('../src/game/assets/player.glb', import.meta.url)
  writeFileSync(file, Buffer.from(result))
  console.log(`wrote player.glb: ${(result.byteLength / 1024).toFixed(0)} KB, ${clips.length} clips, ${Object.keys(nodes).length} nodes`)
}, error => { console.error(error); process.exit(1) }, { binary: true, animations: clips })
