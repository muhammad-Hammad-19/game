import { Innings } from './innings.js'
import { clamp } from './rng.js'

// 0 = a gift for the batter, 1 = close to unplayable.
export function ballThreat({ bowlRating, batRating, accuracy = 0.6, lengthScore = 0.65, lineScore = 0.75, movement = 0.3, bias = 0 }) {
  return clamp(0.34 * lengthScore + 0.24 * lineScore + 0.24 * accuracy + 0.18 * movement + (bowlRating - batRating) / 260 + bias, 0.02, 0.98)
}

// How hard the batting side is pushing, from 0 (blocking) to 1 (swinging at everything).
export function aggression(innings) {
  const progress = innings.balls / innings.maxBalls
  const wicketsInHand = innings.maxWickets - innings.wickets
  let value = 0.3 + 0.45 * progress
  if (innings.maxBalls <= 12) value += 0.3
  else if (innings.maxBalls <= 30) value += 0.16
  if (innings.target != null && innings.ballsLeft > 0) {
    const required = innings.need * 6 / innings.ballsLeft
    value = 0.4 + (required - 7.5) / 11
    if (innings.need <= wicketsInHand * 2 && required < 6) value = 0.22
  }
  if (wicketsInHand <= 2 && innings.maxWickets > 2) value -= 0.14
  return clamp(value, 0.1, 1)
}

// mods: { wicket, boundary } multipliers from field settings and pitch.
export function rollOutcome(threat, push, rng, mods = {}) {
  const ease = 1 - threat
  const wicketChance = clamp((0.008 + 0.105 * threat ** 2.2 + 0.035 * push * (0.4 + threat)) * (mods.wicket ?? 1), 0, 0.4)
  const boundaryChance = clamp((0.035 + 0.3 * ease * ease + 0.15 * push * ease) * (mods.boundary ?? 1), 0, 0.62)
  const dotChance = clamp(0.2 + 0.42 * threat - 0.16 * push, 0.07, 0.8)
  const roll = rng()
  if (roll < wicketChance) return { runs: 0, wicket: true, boundary: false, loft: push > 0.55 && rng() < 0.6 }
  if (roll < wicketChance + boundaryChance) {
    const six = rng() < 0.18 + 0.26 * push
    return { runs: six ? 6 : 4, wicket: false, boundary: true, loft: six }
  }
  if (roll < wicketChance + boundaryChance + dotChance) return { runs: 0, wicket: false, boundary: false, loft: false }
  const runs = rng.weighted([[1, 0.7], [2, 0.24], [3, 0.06]])
  return { runs, wicket: false, boundary: false, loft: false }
}

function pitchMovement(pitch, style) {
  if (!pitch) return 0.3
  return clamp(0.3 * (style === 'spin' ? pitch.turn : pitch.swing), 0.1, 0.6)
}

// Plays an innings instantly. `bias` > 0 helps the bowling side.
export function simulateInnings({ batting, bowling, maxBalls, maxWickets = 10, target = null, pitch = null, rng, bias = 0, label }) {
  const innings = new Innings({ batting, bowling, maxBalls, maxWickets, target, label })
  let guard = maxBalls * 3 + 60
  while (!innings.finished && guard-- > 0) {
    if (innings.bowler == null) innings.autoBowler(rng)
    const bowler = innings.bowlers[innings.bowler]
    const batter = innings.batters[innings.striker]
    const extraRoll = rng()
    if (extraRoll < 0.022) { innings.record({ extra: 'wide' }); continue }
    const threat = ballThreat({
      bowlRating: bowler.rating, batRating: batter.rating, accuracy: rng.float(0.35, 0.9),
      lengthScore: rng.float(0.4, 0.9), lineScore: rng.float(0.5, 1), movement: pitchMovement(pitch, bowler.style), bias,
    })
    const outcome = rollOutcome(threat, aggression(innings), rng, { boundary: pitch?.boundary ?? 1, wicket: pitch?.edge ? 0.6 + 0.4 * pitch.edge : 1 })
    if (extraRoll < 0.03) {
      innings.record({ runs: outcome.runs, extra: 'noball', boundary: outcome.boundary })
      continue
    }
    const kind = outcome.wicket ? rng.weighted([['caught', 0.56], ['bowled', 0.22], ['lbw', 0.14], ['runout', 0.08]]) : null
    innings.record({ runs: outcome.runs, boundary: outcome.boundary, wicket: kind ? { kind } : null })
  }
  return innings
}

// Decides a finished two-innings contest. Returns { winner: 'first' | 'second' | 'tie', margin }.
export function decide(first, second) {
  if (second.score > first.score) {
    const wicketsLeft = second.maxWickets - second.wickets
    return { winner: 'second', margin: `${wicketsLeft} wicket${wicketsLeft === 1 ? '' : 's'}`, ballsLeft: second.ballsLeft }
  }
  if (second.score < first.score) {
    const runs = first.score - second.score
    return { winner: 'first', margin: `${runs} run${runs === 1 ? '' : 's'}` }
  }
  return { winner: 'tie', margin: '' }
}

// A whole match between two computer sides, super over included.
export function simulateMatch({ home, away, overs, pitch, rng }) {
  const homeFirst = rng() < 0.5
  const first = homeFirst ? home : away
  const second = homeFirst ? away : home
  // A small push towards the bat keeps computer scores in line with matches the player takes part in.
  const bias = -0.04
  const one = simulateInnings({ batting: first, bowling: second, maxBalls: overs * 6, pitch, rng, bias })
  const two = simulateInnings({ batting: second, bowling: first, maxBalls: overs * 6, target: one.score + 1, pitch, rng, bias })
  let result = decide(one, two)
  let superOver = false
  let rounds = 0
  while (result.winner === 'tie' && rounds++ < 3) {
    superOver = true
    const a = simulateInnings({ batting: second, bowling: first, maxBalls: 6, maxWickets: 2, pitch, rng })
    const b = simulateInnings({ batting: first, bowling: second, maxBalls: 6, maxWickets: 2, target: a.score + 1, pitch, rng })
    const so = decide(a, b)
    if (so.winner !== 'tie') result = { winner: so.winner === 'first' ? 'second' : 'first', margin: 'the super over' }
  }
  if (result.winner === 'tie') result = { winner: rng() < 0.5 ? 'first' : 'second', margin: 'a boundary count-back' }
  const winner = result.winner === 'first' ? first : second
  return {
    winner, loser: winner === first ? second : first, margin: result.margin, superOver,
    first: { team: first, score: one.score, wickets: one.wickets, balls: one.balls, text: one.scoreline() },
    second: { team: second, score: two.score, wickets: two.wickets, balls: two.balls, text: two.scoreline() },
  }
}
