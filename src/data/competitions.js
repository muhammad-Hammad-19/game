import { TEAM_LIST, teamById } from './teams.js'
import { PITCH_IDS, pitchById } from './pitches.js'
import { simulateMatch } from '../game/sim.js'

const fixture = (a, b, rng) => ({ a, b, pitch: rng.pick(PITCH_IDS), winner: null, text: '' })

function playComputerFixture(match, overs, rng) {
  const result = simulateMatch({ home: teamById(match.a), away: teamById(match.b), overs, pitch: pitchById(match.pitch), rng })
  match.winner = result.winner.id
  match.text = `${result.first.team.short} ${result.first.text} · ${result.second.team.short} ${result.second.text}`
  match.scores = {
    [result.first.team.id]: { runs: result.first.score, balls: result.first.wickets >= 10 ? overs * 6 : result.first.balls },
    [result.second.team.id]: { runs: result.second.score, balls: result.second.wickets >= 10 ? overs * 6 : result.second.balls },
  }
  return match
}

// ---- Champions Cup: eight teams, straight knockout ----
const CUP_ROUNDS = ['Quarter-final', 'Semi-final', 'Final']

export function createCup({ userTeam, overs, difficulty, rng }) {
  const others = rng.shuffle(TEAM_LIST.filter(team => team.id !== userTeam).map(team => team.id))
  const order = [userTeam, ...others]
  const first = []
  for (let i = 0; i < 8; i += 2) first.push(fixture(order[i], order[i + 1], rng))
  return { type: 'cup', userTeam, overs, difficulty, round: 0, rounds: [first], alive: true, done: false, champion: null }
}

export const cupRoundName = round => CUP_ROUNDS[round] || 'Final'

export function nextFixture(competition) {
  if (competition.done) return null
  if (competition.type === 'cup') {
    if (!competition.alive) return null
    return competition.rounds[competition.round].find(match => !match.winner && (match.a === competition.userTeam || match.b === competition.userTeam)) || null
  }
  if (competition.stage === 'final') {
    const final = competition.final
    return final && !final.winner && (final.a === competition.userTeam || final.b === competition.userTeam) ? final : null
  }
  return competition.rounds[competition.round]?.find(match => !match.winner && (match.a === competition.userTeam || match.b === competition.userTeam)) || null
}

function advanceCup(cup, rng) {
  // Finish this round, then keep going while the user has no part to play.
  for (;;) {
    const round = cup.rounds[cup.round]
    for (const match of round) if (!match.winner) playComputerFixture(match, cup.overs, rng)
    if (round.length === 1) {
      cup.done = true
      cup.champion = round[0].winner
      return
    }
    const winners = round.map(match => match.winner)
    const next = []
    for (let i = 0; i < winners.length; i += 2) next.push(fixture(winners[i], winners[i + 1], rng))
    cup.rounds.push(next)
    cup.round++
    if (cup.alive) return
  }
}

// ---- Career league: round robin, then a final between the top two ----
function roundRobin(ids) {
  const list = [...ids]
  const rounds = []
  for (let round = 0; round < list.length - 1; round++) {
    const pairs = []
    for (let i = 0; i < list.length / 2; i++) pairs.push([list[i], list[list.length - 1 - i]])
    rounds.push(pairs)
    list.splice(1, 0, list.pop())
  }
  return rounds
}

export function createLeague({ userTeam, overs, difficulty, season = 1, rng }) {
  const ids = rng.shuffle(TEAM_LIST.map(team => team.id))
  const table = {}
  for (const id of ids) table[id] = { played: 0, won: 0, lost: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0 }
  return {
    type: 'league', userTeam, overs, difficulty, season, round: 0, stage: 'league', final: null, done: false, champion: null,
    rounds: roundRobin(ids).map(pairs => pairs.map(([a, b]) => fixture(a, b, rng))), table,
  }
}

function applyToTable(table, match) {
  const [a, b] = [match.a, match.b]
  for (const [me, other] of [[a, b], [b, a]]) {
    const row = table[me]
    row.played++
    if (match.winner === me) { row.won++; row.points += 2 } else row.lost++
    row.runsFor += match.scores[me].runs
    row.ballsFor += match.scores[me].balls
    row.runsAgainst += match.scores[other].runs
    row.ballsAgainst += match.scores[other].balls
  }
}

export function netRunRate(row) {
  if (!row.ballsFor || !row.ballsAgainst) return 0
  return row.runsFor * 6 / row.ballsFor - row.runsAgainst * 6 / row.ballsAgainst
}

export function standings(league) {
  return Object.entries(league.table)
    .map(([id, row]) => ({ id, ...row, nrr: netRunRate(row) }))
    .sort((x, y) => y.points - x.points || y.nrr - x.nrr || x.id.localeCompare(y.id))
}

function advanceLeague(league, rng) {
  if (league.stage === 'league') {
    for (const match of league.rounds[league.round]) {
      if (!match.winner) playComputerFixture(match, league.overs, rng)
      if (!match.counted) { applyToTable(league.table, match); match.counted = true }
    }
    league.round++
    if (league.round < league.rounds.length) return
    const [first, second] = standings(league)
    league.stage = 'final'
    league.final = fixture(first.id, second.id, rng)
    if (league.final.a === league.userTeam || league.final.b === league.userTeam) return
  }
  if (league.stage === 'final') {
    if (!league.final.winner) playComputerFixture(league.final, league.overs, rng)
    league.stage = 'done'
    league.done = true
    league.champion = league.final.winner
  }
}

// Records the user's own result, then plays out everything that does not involve them.
// outcome: { won, text, userRuns, userBalls, oppRuns, oppBalls }
export function reportUserMatch(competition, outcome, rng) {
  const match = nextFixture(competition)
  if (!match) return competition
  const opponent = match.a === competition.userTeam ? match.b : match.a
  match.winner = outcome.won ? competition.userTeam : opponent
  match.text = outcome.text
  match.scores = {
    [competition.userTeam]: { runs: outcome.userRuns, balls: Math.max(1, outcome.userBalls) },
    [opponent]: { runs: outcome.oppRuns, balls: Math.max(1, outcome.oppBalls) },
  }
  if (competition.type === 'cup') {
    if (!outcome.won) competition.alive = false
    advanceCup(competition, rng)
  } else {
    advanceLeague(competition, rng)
  }
  return competition
}

export function describeFixture(competition) {
  if (competition.type === 'cup') return cupRoundName(competition.round)
  return competition.stage === 'final' ? `Season ${competition.season} final` : `Season ${competition.season} · Match ${competition.round + 1} of ${competition.rounds.length}`
}
