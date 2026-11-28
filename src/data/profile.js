// The player's saved career: XP, coins, unlocks, achievements and running stats.
const KEY = 'boundary-bash-profile'

export const EMPTY_STATS = {
  matches: 0, wins: 0, losses: 0, ties: 0, runs: 0, ballsFaced: 0, fours: 0, sixes: 0, highScore: 0, bestTotal: 0,
  fifties: 0, hundreds: 0, wickets: 0, ballsBowled: 0, runsConceded: 0, bestWickets: 0, bestWicketsRuns: 0,
  hatTricks: 0, maidens: 0, superOverWins: 0, cups: 0, leagues: 0, onlineWins: 0, chasesWon: 0, defencesWon: 0,
}

export const DEFAULT_PROFILE = {
  version: 1, xp: 0, coins: 0, earned: 0, owned: ['bat:classic', 'look:dusk'], bat: 'classic', look: 'dusk',
  achievements: {}, stats: EMPTY_STATS, cup: null, league: null,
}

export function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    const profile = { ...DEFAULT_PROFILE, ...saved, stats: { ...EMPTY_STATS, ...saved.stats }, achievements: { ...saved.achievements } }
    if (!Array.isArray(profile.owned)) profile.owned = [...DEFAULT_PROFILE.owned]
    for (const item of DEFAULT_PROFILE.owned) if (!profile.owned.includes(item)) profile.owned.push(item)
    // Carry over the best innings from versions that only stored that one number.
    if (!saved.stats) profile.stats.bestTotal = Number(localStorage.getItem('boundary-bash-best')) || 0
    return profile
  } catch {
    return { ...DEFAULT_PROFILE, stats: { ...EMPTY_STATS }, achievements: {}, owned: [...DEFAULT_PROFILE.owned] }
  }
}

export function saveProfile(profile) {
  try { localStorage.setItem(KEY, JSON.stringify(profile)) } catch { /* Storage can be unavailable in private mode. */ }
}

const LEVEL_STEP = 120

export function levelInfo(xp) {
  const level = Math.floor(Math.sqrt(xp / LEVEL_STEP)) + 1
  const floor = LEVEL_STEP * (level - 1) ** 2
  const ceiling = LEVEL_STEP * level ** 2
  return { level, into: xp - floor, span: ceiling - floor, progress: (xp - floor) / (ceiling - floor) }
}

const FORMAT_WEIGHT = { 1: 0.5, 2: 0.7, 5: 1, 10: 1.5, 20: 2.4 }
const DIFFICULTY_WEIGHT = { Easy: 0.8, Medium: 1, Hard: 1.35 }

// What one finished match pays out.
export function matchRewards({ result, overs, difficulty, stats, simulatedBowling = false }) {
  const weight = (FORMAT_WEIGHT[overs] ?? 1) * (DIFFICULTY_WEIGHT[difficulty] ?? 1)
  const lines = []
  const add = (label, xp, coins) => { if (xp || coins) lines.push({ label, xp: Math.round(xp), coins: Math.round(coins) }) }
  if (result === 'win') add('Victory', 150 * weight, 120 * weight)
  else if (result === 'tie') add('Tied match', 70 * weight, 50 * weight)
  else add('Match played', 45 * weight, 25 * weight)
  add(`${stats.runs} run${stats.runs === 1 ? '' : 's'}`, stats.runs * 1.6, stats.runs * 0.5)
  const count = (n, word, plural) => `${n} ${n === 1 ? word : plural}`
  add(`${count(stats.fours, 'four', 'fours')}, ${count(stats.sixes, 'six', 'sixes')}`, stats.fours * 2 + stats.sixes * 5, stats.fours + stats.sixes * 3)
  if (!simulatedBowling) add(`${stats.wickets} wicket${stats.wickets === 1 ? '' : 's'}`, stats.wickets * 22, stats.wickets * 12)
  if (stats.hatTricks) add('Hat-trick', 120, 150)
  return { lines, xp: lines.reduce((sum, line) => sum + line.xp, 0), coins: lines.reduce((sum, line) => sum + line.coins, 0) }
}

// Folds one match into the lifetime numbers. Returns a new stats object.
export function addMatchStats(stats, { result, match, online, wonSuperOver, chased }) {
  const next = { ...stats }
  next.matches++
  if (result === 'win') next.wins++
  else if (result === 'loss') next.losses++
  else next.ties++
  for (const key of ['runs', 'ballsFaced', 'fours', 'sixes', 'wickets', 'ballsBowled', 'runsConceded', 'hatTricks', 'maidens', 'fifties', 'hundreds']) {
    next[key] += match[key] || 0
  }
  next.highScore = Math.max(next.highScore, match.best || 0)
  next.bestTotal = Math.max(next.bestTotal, match.total || 0)
  if (match.bestWickets > next.bestWickets || (match.bestWickets === next.bestWickets && match.bestWickets > 0 && match.bestWicketsRuns < next.bestWicketsRuns)) {
    next.bestWickets = match.bestWickets
    next.bestWicketsRuns = match.bestWicketsRuns
  }
  if (result === 'win') {
    if (online) next.onlineWins++
    if (wonSuperOver) next.superOverWins++
    if (chased) next.chasesWon++
    else next.defencesWon++
  }
  return next
}

export const EMPTY_MATCH_STATS = () => ({
  runs: 0, ballsFaced: 0, fours: 0, sixes: 0, best: 0, total: 0, fifties: 0, hundreds: 0,
  wickets: 0, ballsBowled: 0, runsConceded: 0, hatTricks: 0, maidens: 0, bestWickets: 0, bestWicketsRuns: 0,
  wicketStreak: 0, sixStreak: 0, bestSixStreak: 0,
})
