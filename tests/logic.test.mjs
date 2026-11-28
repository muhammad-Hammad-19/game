import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeRng } from '../src/game/rng.js'
import { Innings } from '../src/game/innings.js'
import { simulateInnings, simulateMatch, decide } from '../src/game/sim.js'
import { TEAM_LIST } from '../src/data/teams.js'
import { PITCHES } from '../src/data/pitches.js'

const [a, b] = TEAM_LIST

test('rng is reproducible', () => {
  const x = makeRng(42), y = makeRng(42)
  for (let i = 0; i < 50; i++) assert.equal(x(), y())
})

test('teams have full squads with bowlers', () => {
  for (const team of TEAM_LIST) {
    assert.equal(team.players.length, 11)
    assert.ok(team.players.filter(p => p.st && p.bowl >= 55).length >= 5, team.name)
  }
})

test('strike rotates on odd runs and at over end', () => {
  const inn = new Innings({ batting: a, bowling: b, maxBalls: 12 })
  inn.setBowler(8)
  inn.record({ runs: 1 })
  assert.equal(inn.striker, 1)
  inn.record({ runs: 2 })
  assert.equal(inn.striker, 1)
  for (let i = 0; i < 4; i++) inn.record({ runs: 0 })
  assert.equal(inn.balls, 6)
  assert.equal(inn.striker, 0)
  assert.equal(inn.bowler, null)
  assert.equal(inn.lastBowler, 8)
  assert.ok(!inn.bowlingOptions().includes(8))
})

test('extras do not use up a ball', () => {
  const inn = new Innings({ batting: a, bowling: b, maxBalls: 6 })
  inn.setBowler(9)
  inn.record({ extra: 'wide' })
  inn.record({ extra: 'noball', runs: 4, boundary: true })
  assert.equal(inn.balls, 0)
  assert.equal(inn.score, 6)
  assert.equal(inn.extras, 2)
  assert.equal(inn.batters[0].runs, 4)
  assert.equal(inn.bowlers[9].runs, 6)
})

test('wickets bring in the next batter and end the innings', () => {
  const inn = new Innings({ batting: a, bowling: b, maxBalls: 120, maxWickets: 2 })
  inn.setBowler(9)
  inn.record({ wicket: { kind: 'bowled' } })
  assert.equal(inn.striker, 2)
  assert.equal(inn.batters[0].out, 'b ' + b.players[9].n)
  inn.record({ wicket: { kind: 'runout' }, runs: 1 })
  assert.equal(inn.wickets, 2)
  assert.equal(inn.bowlers[9].wickets, 1)
  assert.ok(inn.finished)
})

test('chase ends when the target is reached', () => {
  const inn = new Innings({ batting: a, bowling: b, maxBalls: 12, target: 5 })
  inn.setBowler(9)
  inn.record({ runs: 4, boundary: true })
  assert.ok(!inn.finished)
  inn.record({ runs: 1 })
  assert.ok(inn.finished)
  assert.equal(inn.need, 0)
})

test('maiden and quota', () => {
  const inn = new Innings({ batting: a, bowling: b, maxBalls: 60 })
  assert.equal(inn.bowlerQuota, 2)
  inn.setBowler(8)
  for (let i = 0; i < 6; i++) inn.record({})
  assert.equal(inn.bowlers[8].maidens, 1)
})

test('revive keeps behaviour', () => {
  const inn = new Innings({ batting: a, bowling: b, maxBalls: 12 })
  inn.setBowler(8); inn.record({ runs: 3 })
  const copy = Innings.revive(inn)
  assert.equal(copy.scoreline(), inn.scoreline())
  copy.record({ runs: 1 })
  assert.equal(copy.score, 4)
})

test('simulated innings stay sane across formats', () => {
  const rng = makeRng(7)
  for (const overs of [1, 2, 5, 10, 20]) {
    let total = 0, wickets = 0
    const n = 300
    for (let i = 0; i < n; i++) {
      const inn = simulateInnings({ batting: a, bowling: b, maxBalls: overs * 6, pitch: PITCHES.flat, rng })
      assert.ok(inn.finished)
      assert.ok(inn.balls <= overs * 6)
      assert.equal(inn.batters.reduce((s, p) => s + p.runs, 0) + inn.extras, inn.score)
      assert.equal(inn.bowlers.reduce((s, p) => s + p.balls, 0), inn.balls)
      total += inn.score; wickets += inn.wickets
    }
    console.log(`${overs} overs: avg ${(total / n).toFixed(1)} runs, ${(wickets / n).toFixed(1)} wkts, rpo ${(total / n / overs).toFixed(2)}`)
  }
})

test('simulated matches always produce a winner', () => {
  const rng = makeRng(99)
  let supers = 0
  for (let i = 0; i < 400; i++) {
    const m = simulateMatch({ home: a, away: b, overs: 2, pitch: PITCHES.green, rng })
    assert.ok(m.winner === a || m.winner === b)
    if (m.superOver) supers++
  }
  console.log('super overs in 400 two-over matches:', supers)
})

test('decide', () => {
  const one = { score: 20 }, two = { score: 21, maxWickets: 10, wickets: 3, ballsLeft: 2 }
  assert.equal(decide(one, two).winner, 'second')
  assert.equal(decide(one, two).margin, '7 wickets')
  assert.equal(decide({ score: 20 }, { score: 20 }).winner, 'tie')
})

import { createCup, createLeague, nextFixture, reportUserMatch, standings } from '../src/data/competitions.js'
import { levelInfo, matchRewards, addMatchStats, EMPTY_STATS, EMPTY_MATCH_STATS } from '../src/data/profile.js'
import { ACHIEVEMENTS, newlyEarned } from '../src/data/achievements.js'
import { commentate } from '../src/data/commentary.js'

test('cup runs to a champion whether the user wins or loses', () => {
  for (const wins of [true, false]) {
    const rng = makeRng(5)
    const cup = createCup({ userTeam: 'hawks', overs: 2, difficulty: 'Medium', rng })
    let played = 0
    while (nextFixture(cup)) {
      reportUserMatch(cup, { won: wins, text: 'x', userRuns: 20, userBalls: 12, oppRuns: 10, oppBalls: 12 }, rng)
      played++
      assert.ok(played < 5)
    }
    assert.ok(cup.done && cup.champion)
    assert.equal(played, wins ? 3 : 1)
    assert.equal(cup.champion === 'hawks', wins)
  }
})

test('league season completes with a final', () => {
  const rng = makeRng(11)
  const league = createLeague({ userTeam: 'kings', overs: 2, difficulty: 'Medium', rng })
  assert.equal(league.rounds.length, 7)
  for (const round of league.rounds) assert.equal(new Set(round.flatMap(m => [m.a, m.b])).size, 8)
  let played = 0
  while (nextFixture(league)) {
    reportUserMatch(league, { won: true, text: 'x', userRuns: 30, userBalls: 12, oppRuns: 12, oppBalls: 12 }, rng)
    played++
    assert.ok(played < 10)
  }
  assert.equal(played, 8)
  assert.ok(league.done)
  assert.equal(league.champion, 'kings')
  const table = standings(league)
  assert.equal(table[0].id, 'kings')
  assert.equal(table.reduce((s, r) => s + r.played, 0), 56)
})

test('levels, rewards and achievements', () => {
  assert.equal(levelInfo(0).level, 1)
  assert.equal(levelInfo(120).level, 2)
  assert.equal(levelInfo(479).level, 2)
  assert.equal(levelInfo(480).level, 3)
  const match = { ...EMPTY_MATCH_STATS(), runs: 60, fours: 4, sixes: 3, wickets: 3, best: 52, fifties: 1, bestSixStreak: 3 }
  const reward = matchRewards({ result: 'win', overs: 5, difficulty: 'Medium', stats: match })
  assert.ok(reward.xp > 200 && reward.coins > 100)
  const stats = addMatchStats(EMPTY_STATS, { result: 'win', match, chased: true })
  assert.equal(stats.wins, 1); assert.equal(stats.chasesWon, 1); assert.equal(stats.highScore, 52)
  const got = newlyEarned({}, { stats, match, result: 'win', level: 2, flags: {} }).map(a => a.id)
  for (const id of ['first_win', 'first_six', 'six_streak', 'fifty', 'three_for', 'chase']) assert.ok(got.includes(id), id)
  assert.ok(!got.includes('century'))
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length)
  assert.match(commentate(6, makeRng(1), { batter: 'A. Malik' }), /\w/)
})
