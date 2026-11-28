// Scorebook for one innings. Pure data and rules, shared by the live scene,
// the quick simulator and the online mirror.
const DISMISSALS = { bowled: 'b', lbw: 'lbw b', caught: 'c & b', runout: 'run out', stumped: 'st' }

export class Innings {
  constructor({ batting, bowling, maxBalls, maxWickets = 10, target = null, label = '1st innings' }) {
    this.label = label
    this.battingId = batting.id
    this.bowlingId = bowling.id
    this.battingName = batting.name
    this.bowlingName = bowling.name
    this.battingShort = batting.short
    this.bowlingShort = bowling.short
    this.maxBalls = maxBalls
    this.maxWickets = Math.min(maxWickets, batting.players.length - 1)
    this.target = target
    this.bowlerQuota = Math.max(1, Math.ceil(maxBalls / 30))
    this.batters = batting.players.map(p => ({ name: p.n, rating: p.bat, runs: 0, balls: 0, fours: 0, sixes: 0, out: null, batted: false }))
    this.bowlers = bowling.players.map(p => ({ name: p.n, rating: p.bowl, style: p.st, balls: 0, runs: 0, wickets: 0, overRuns: 0, maidens: 0 }))
    this.striker = 0
    this.nonStriker = 1
    this.next = 2
    this.batters[0].batted = this.batters[1].batted = true
    this.score = 0
    this.wickets = 0
    this.balls = 0
    this.wides = 0
    this.noBalls = 0
    this.fours = 0
    this.sixes = 0
    this.bowler = null
    this.lastBowler = null
    this.over = []
    this.overs = []
    this.fow = []
    this.partnership = { runs: 0, balls: 0 }
  }

  static revive(data) {
    return Object.assign(Object.create(Innings.prototype), JSON.parse(JSON.stringify(data)))
  }

  get extras() { return this.wides + this.noBalls }
  get ballsLeft() { return Math.max(0, this.maxBalls - this.balls) }
  get oversText() { return `${Math.floor(this.balls / 6)}.${this.balls % 6}` }
  get maxOversText() { return this.maxBalls % 6 ? `${Math.floor(this.maxBalls / 6)}.${this.maxBalls % 6}` : String(this.maxBalls / 6) }
  get runRate() { return this.balls ? this.score * 6 / this.balls : 0 }
  get need() { return this.target == null ? null : Math.max(0, this.target - this.score) }
  get requiredRate() { return this.target == null || !this.ballsLeft ? null : this.need * 6 / this.ballsLeft }
  get finished() {
    return this.balls >= this.maxBalls || this.wickets >= this.maxWickets || (this.target != null && this.score >= this.target)
  }

  bowlingOptions() {
    const fit = (minimum, allowLast) => this.bowlers
      .map((bowler, index) => ({ bowler, index }))
      .filter(({ bowler, index }) => bowler.style && bowler.rating >= minimum && (allowLast || index !== this.lastBowler)
        && Math.ceil(bowler.balls / 6) < this.bowlerQuota)
      .sort((a, b) => b.bowler.rating - a.bowler.rating)
      .map(({ index }) => index)
    let options = fit(55, false)
    if (!options.length) options = fit(0, false)
    if (!options.length) options = this.bowlers.map((_, index) => index).filter(index => index !== this.lastBowler && this.bowlers[index].style)
    if (!options.length) options = [this.lastBowler ?? 10]
    return options
  }

  setBowler(index) {
    this.bowler = index
    this.bowlers[index].overRuns = 0
  }

  autoBowler(rng) {
    const options = this.bowlingOptions()
    // Prefer the better bowlers while still rotating the attack.
    const choice = options[Math.min(options.length - 1, Math.floor(rng() * Math.min(3, options.length)))]
    this.setBowler(choice)
    return choice
  }

  // event: { runs, extra: null | 'wide' | 'noball', wicket: null | { kind }, boundary }
  record({ runs = 0, extra = null, wicket = null, boundary = false }) {
    const striker = this.batters[this.striker]
    const bowler = this.bowlers[this.bowler]
    const legal = extra !== 'wide' && extra !== 'noball'
    let symbol
    let total = runs
    if (extra === 'wide') {
      this.wides += 1 + runs
      total = 1 + runs
      symbol = runs ? `${runs}wd` : 'wd'
    } else {
      if (extra === 'noball') {
        this.noBalls += 1
        total = runs + 1
      }
      striker.balls += extra === 'noball' ? 0 : 1
      striker.runs += runs
      if (boundary && runs === 4) { striker.fours++; this.fours++ }
      if (boundary && runs === 6) { striker.sixes++; this.sixes++ }
      symbol = extra === 'noball' ? (runs ? `nb${runs}` : 'nb') : String(runs || '•')
    }
    this.score += total
    this.partnership.runs += total
    if (bowler) {
      bowler.runs += total
      bowler.overRuns += total
    }
    if (legal) {
      this.balls++
      this.partnership.balls++
      if (bowler) bowler.balls++
    }

    if (wicket) {
      const runOut = wicket.kind === 'runout'
      striker.out = runOut ? 'run out' : `${DISMISSALS[wicket.kind] || wicket.kind} ${bowler?.name ?? ''}`.trim()
      if (wicket.kind === 'caught') striker.out = wicket.keeper ? `c †keeper b ${bowler?.name}` : `c ${wicket.fielder || 'fielder'} b ${bowler?.name}`
      this.wickets++
      if (bowler && !runOut) bowler.wickets++
      this.fow.push({ score: this.score, wicket: this.wickets, batter: striker.name, over: this.oversText })
      this.partnership = { runs: 0, balls: 0 }
      symbol = runs ? `${runs}W` : 'W'
      if (this.next < this.batters.length && this.wickets < this.maxWickets) {
        this.striker = this.next++
        this.batters[this.striker].batted = true
      }
    }

    this.over.push(symbol)
    if (runs % 2 === 1) this.swapStrike()
    let overEnded = false
    if (legal && this.balls % 6 === 0) {
      overEnded = true
      if (bowler && bowler.overRuns === 0) bowler.maidens++
      this.overs.push({ bowler: this.bowler, balls: this.over, runs: bowler?.overRuns ?? 0 })
      this.over = []
      this.lastBowler = this.bowler
      this.bowler = null
      if (!this.finished) this.swapStrike()
    }
    return { symbol, overEnded, total }
  }

  swapStrike() {
    const previous = this.striker
    this.striker = this.nonStriker
    this.nonStriker = previous
  }

  bowlerFigures(index = this.bowler ?? this.lastBowler) {
    const bowler = this.bowlers[index]
    if (!bowler) return null
    return { name: bowler.name, style: bowler.style, wickets: bowler.wickets, runs: bowler.runs, overs: `${Math.floor(bowler.balls / 6)}.${bowler.balls % 6}` }
  }

  topScorer() {
    return this.batters.reduce((best, batter) => (batter.runs > best.runs ? batter : best), this.batters[0])
  }

  bestBowler() {
    const used = this.bowlers.filter(bowler => bowler.balls > 0)
    if (!used.length) return null
    return used.reduce((best, bowler) =>
      (bowler.wickets > best.wickets || (bowler.wickets === best.wickets && bowler.runs < best.runs) ? bowler : best), used[0])
  }

  scoreline() {
    return `${this.score}/${this.wickets} (${this.oversText})`
  }
}
