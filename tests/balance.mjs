// Not a test: prints scoring rates so difficulty can be tuned.  node --import ./tests/register.mjs tests/balance.mjs
import { makeScene, run } from './headless.mjs'
import { batterBot, bowlerBot } from './scene.test.mjs'
import { TEAM_LIST } from '../src/data/teams.js'
import { makeRng } from '../src/game/rng.js'

const [hawks, foxes] = TEAM_LIST
const N = Number(process.argv[2]) || 40
function sample(label, match, settings, bot) {
  let runs = 0, wickets = 0, balls = 0, sixes = 0, fours = 0
  for (let seed = 1; seed <= N; seed++) {
    const innings = run(makeScene({ batting: hawks, bowling: foxes, maxBalls: 30, pitch: 'flat', label: 'x', seed, fast: 1, ...match }, { settings }), bot(seed))
    runs += innings.score; wickets += innings.wickets; balls += innings.balls; sixes += innings.sixes; fours += innings.fours
  }
  console.log(`${label.padEnd(34)} rpo ${(runs * 6 / balls).toFixed(2).padStart(5)}  avg ${(runs / N).toFixed(1).padStart(5)}/${(wickets / N).toFixed(1)} in ${(balls / N / 6).toFixed(1)} ov  4s ${(fours / N).toFixed(1)} 6s ${(sixes / N).toFixed(1)}`)
}
for (const difficulty of ['Easy', 'Medium', 'Hard']) {
  for (const [skill, reading] of [[0.5, 0.2], [0.65, 0.5], [0.8, 0.9]]) sample(`user BAT  ${difficulty} time ${skill} read ${reading}`, { bat: 'user', bowl: 'ai' }, { difficulty }, seed => batterBot(skill, makeRng(seed * 7), 0.3, reading))
}
for (const difficulty of ['Easy', 'Medium', 'Hard']) {
  for (const skill of [0.4, 0.75, 0.95]) sample(`user BOWL ${difficulty} skill ${skill}`, { bat: 'ai', bowl: 'user' }, { difficulty }, seed => bowlerBot(skill, makeRng(seed * 11)))
}
