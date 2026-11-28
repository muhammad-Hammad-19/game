import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeScene, run } from './headless.mjs'
import { TEAM_LIST } from '../src/data/teams.js'
import { makeRng } from '../src/game/rng.js'

const [hawks, foxes] = TEAM_LIST
const base = { batting: hawks, bowling: foxes, maxBalls: 30, pitch: 'flat', label: '1st innings' }

function check(innings) {
  assert.ok(innings.finished)
  assert.equal(innings.batters.reduce((s, p) => s + p.runs, 0) + innings.extras, innings.score, 'batter runs + extras = total')
  assert.equal(innings.bowlers.reduce((s, p) => s + p.runs, 0), innings.score, 'bowler runs = total')
  assert.equal(innings.bowlers.reduce((s, p) => s + p.balls, 0), innings.balls)
  assert.ok(innings.balls <= innings.maxBalls)
  assert.ok(innings.wickets <= innings.maxWickets)
}

// A stand-in for a human batter: swings near the right moment with some timing error.
export function batterBot(skill, rng, loftRate = 0.35, reading = 0) {
  let planned = null
  return scene => {
    if (scene.phase !== 'flight') { planned = null; return }
    const d = scene.delivery
    if (planned === null) {
      const error = (rng() + rng() + rng() - 1.5) * (1 - skill) * 0.6
      const read = ['leg', 'straight', 'off'].find(dir => scene.shotFit(dir) === 'natural')
      planned = { at: d.impactAt - 108 + error * d.pace, dir: rng() < reading ? read : rng.pick(['leg', 'straight', 'off']), loft: rng() < loftRate, leave: d.wide && rng() < 0.7 }
    }
    if (planned.leave) { scene.leave(); return }
    if (scene.canPlayBall() && scene.elapsed >= planned.at) scene.swing(planned.dir, planned.loft)
  }
}

// A stand-in for a human bowler: aims, starts the run-up and stops the meter with some error.
export function bowlerBot(skill, rng) {
  let lockAt = null
  return scene => {
    if (scene.phase === 'ready' && scene.innings.bowler == null && scene.askedBowler) {
      scene.chooseBowler(scene.innings.bowlingOptions()[0])
    } else if (scene.phase === 'aim') {
      const type = rng.pick(scene.snapshot().deliveries).id
      scene.setDeliveryType(type)
      scene.aimAt(0.497 + rng.float(-0.02, 0.02), rng.pick([0.6, 0.64, 0.66, 0.7, 0.72]))
      if (rng() < 0.05) scene.cycleField()
      else { scene.bowlPress(); lockAt = scene.elapsed + 1010 * (0.82 + (rng() - 0.5) * (1 - skill) * 0.7) }
    } else if (scene.phase === 'runup' && scene.delivery.meter == null && lockAt != null && scene.elapsed >= lockAt) {
      scene.bowlPress()
    }
  }
}

test('computer v computer innings finish cleanly on every pitch', () => {
  for (const pitch of ['flat', 'green', 'dusty']) {
    for (let seed = 1; seed <= 6; seed++) {
      const scene = makeScene({ ...base, pitch, seed, bat: 'ai', bowl: 'ai', fast: 1 })
      check(run(scene))
    }
  }
})

test('replays play back and hand control on', () => {
  let replays = 0
  for (let seed = 1; seed <= 8; seed++) {
    const scene = makeScene({ ...base, seed, bat: 'ai', bowl: 'ai', maxBalls: 60 }, { settings: { replays: true }, onEvent: (type, on) => { if (type === 'replay' && on) replays++ } })
    check(run(scene, s => { if (s.phase === 'replay' && seed % 2 && s.replay.time > s.replay.end - 400) s.skipReplay() }))
  }
  assert.ok(replays > 5, 'wickets and sixes were replayed: ' + replays)
})

test('user batting: chase stops at the target, super over stops at two wickets', () => {
  const rng = makeRng(3)
  for (let seed = 1; seed <= 10; seed++) {
    const scene = makeScene({ ...base, seed, bat: 'user', bowl: 'ai', target: 25, maxBalls: 30 })
    const innings = run(scene, batterBot(0.8, rng))
    check(innings)
    assert.ok(innings.score >= 25 || innings.balls === 30 || innings.wickets === 10)
    if (innings.score >= 25) assert.ok(innings.score <= 30, 'no balls bowled after the target fell')
  }
  for (let seed = 1; seed <= 10; seed++) {
    const innings = run(makeScene({ ...base, seed, bat: 'user', bowl: 'ai', maxBalls: 6, maxWickets: 2, label: 'Super over' }), batterBot(0.2, rng, 0.9))
    check(innings)
    assert.ok(innings.wickets <= 2 && innings.balls <= 6)
  }
})

test('user bowling: picker, aim, meter, field changes and extras', () => {
  const rng = makeRng(8)
  let asked = 0, wides = 0, noBalls = 0
  for (let seed = 1; seed <= 10; seed++) {
    const scene = makeScene({ ...base, seed, bat: 'ai', bowl: 'user', maxBalls: 30 }, { onEvent: type => { if (type === 'needBowler') asked++ } })
    const innings = run(scene, bowlerBot(seed < 6 ? 0.9 : 0.1, rng))
    check(innings)
    wides += innings.wides
    noBalls += innings.noBalls
    assert.ok(innings.overs.every((over, index) => index === 0 || over.bowler !== innings.overs[index - 1].bowler), 'no bowler bowls consecutive overs')
  }
  assert.ok(asked >= 40, 'bowler asked for at each over: ' + asked)
  console.log(`user bowling extras over 10 innings: ${wides} wides, ${noBalls} no-balls`)
})

test('leaving every ball still ends the innings', () => {
  const innings = run(makeScene({ ...base, seed: 4, bat: 'user', bowl: 'ai', maxBalls: 24 }), scene => { if (scene.canPlayBall()) scene.leave() })
  check(innings)
  assert.equal(innings.batters.reduce((s, p) => s + p.runs, 0), 0)
})

test('online pair stays in step over a lossless but slow link', () => {
  for (const latency of [0, 60, 180, 400]) {
    const rng = makeRng(latency + 5)
    const queue = []
    let clock = 0
    const link = to => ({ send: message => queue.push({ at: clock + latency + rng() * latency * 0.4, to, message: JSON.parse(JSON.stringify(message)) }) })
    const scenes = {}
    scenes.auth = makeScene({ ...base, seed: 21, bat: 'user', bowl: 'remote', maxBalls: 18 }, { net: { role: 'auth', ...link('mirror') } })
    scenes.mirror = makeScene({ ...base, seed: 99, bat: 'remote', bowl: 'user', maxBalls: 18 }, { net: { role: 'mirror', ...link('auth') } })
    const bat = batterBot(0.7, rng)
    const bowl = bowlerBot(0.7, rng)
    let frames = 0
    while (!(scenes.auth.done && scenes.mirror.done)) {
      clock += 16.67
      queue.sort((a, b) => a.at - b.at)
      while (queue.length && queue[0].at <= clock) { const { to, message } = queue.shift(); scenes[to].receive(message) }
      if (!scenes.auth.done) { bat(scenes.auth); scenes.auth.update(0, 16.67) }
      if (!scenes.mirror.done) { bowl(scenes.mirror); scenes.mirror.update(0, 16.67) }
      if (++frames > 400000) throw new Error(`online pair stalled at latency ${latency}: auth=${scenes.auth.phase}/${scenes.auth.ballCount} mirror=${scenes.mirror.phase}/${scenes.mirror.ballCount}`)
    }
    check(scenes.auth.innings)
    assert.deepEqual(JSON.parse(JSON.stringify(scenes.mirror.innings)), JSON.parse(JSON.stringify(scenes.auth.innings)), 'both devices hold the same scorebook')
  }
})
