import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSettings } from '../data/defaults.js'
import { TEAM_LIST, teamById, teamByName } from '../data/teams.js'
import { PITCH_IDS, pitchById } from '../data/pitches.js'
import { batById, lookById } from '../data/shop.js'
import { addMatchStats, EMPTY_MATCH_STATS, levelInfo, loadProfile, matchRewards, saveProfile } from '../data/profile.js'
import { newlyEarned } from '../data/achievements.js'
import { createCup, createLeague, describeFixture, nextFixture, reportUserMatch } from '../data/competitions.js'
import { setVoice } from '../data/commentary.js'
import { decide, simulateInnings } from '../game/sim.js'
import { makeRng } from '../game/rng.js'
import { playSound, startCrowd, stopCrowd, suspendAudio, unlockAudio } from '../game/sounds.js'
import MatchHud from './MatchHud.jsx'
import Online from './Online.jsx'
import { CompetitionScreen, Home, InningsBreak, LevelChip, ProfileScreen, Result, SettingsScreen, Setup, Shop, Toss } from './screens.jsx'

const initialScore = { score: 0, wickets: 0, balls: 0, ballId: 0, overs: '0.0', maxOvers: '0', totalBalls: 6, extras: 0, over: [] }
const portraitQuery = '(orientation: portrait)'
// Positive values help the bowling side when the computer's innings is simulated.
const SIM_BIAS = { Easy: 0.08, Medium: 0, Hard: -0.06 }
const testFast = Number(new URLSearchParams(window.location.search).get('fast')) || 0

function buzz() {
  navigator.vibrate?.(12)
}

function save(key, value) {
  try { localStorage.setItem(key, value) } catch { /* Storage can be unavailable in private mode. */ }
}

async function enterLandscape() {
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }) } catch {}
  try { await window.screen.orientation?.lock?.('landscape') } catch {}
}

function Brand() {
  return <div className="brand"><i className="brand-crest" aria-hidden="true"><i /></i><span>BOUNDARY BASH <small>CRICKET</small></span></div>
}

const boundaries = list => list.reduce((sum, innings) => sum + innings.fours + innings.sixes, 0)

export default function App() {
  const mount = useRef(null)
  const hud = useRef(null)
  const game = useRef(null)
  const match = useRef(null)
  const flow = useRef(null)
  const link = useRef(null)
  const inbox = useRef([])
  const gates = useRef({})
  const manualPause = useRef(false)
  const [portrait, setPortrait] = useState(() => window.matchMedia(portraitQuery).matches)
  const [screen, setScreen] = useState('home')
  const [setupMode, setSetupMode] = useState('quick')
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState(loadSettings)
  const [profile, setProfile] = useState(loadProfile)
  const [score, setScore] = useState(initialScore)
  const [stage, setStage] = useState('ready')
  const [shot, setShot] = useState('drive')
  const [view, setView] = useState(null)
  const [tossInfo, setTossInfo] = useState(null)
  const [bowlerOptions, setBowlerOptions] = useState(null)
  const [aimText, setAimText] = useState('')
  const [meterText, setMeterText] = useState('')
  const [replay, setReplay] = useState(false)
  const [waiting, setWaiting] = useState('')
  const [notice, setNotice] = useState('')
  const [installPrompt, setInstallPrompt] = useState(null)
  const settingsRef = useRef(settings)
  const profileRef = useRef(profile)
  settingsRef.current = settings
  profileRef.current = profile
  const inMatch = screen === 'match' || screen === 'pause'
  // Handles for manual testing in the dev server; stripped from production builds.
  if (import.meta.env.DEV) window.__bb = { match, flow, game, profileRef }

  useEffect(() => {
    let disposed = false
    let runtime
    async function load() {
      try {
        const { createGame } = await import('../game/createGame.js')
        if (disposed) return
        runtime = createGame(mount.current, { onProgress: value => {
          if (!disposed) setProgress(Math.round(value * 100))
        } })
        game.current = runtime
        await runtime.ready
        if (!disposed) setReady(true)
      } catch {
        if (!disposed) setFailed(true)
      }
    }
    load()
    return () => {
      disposed = true
      runtime?.destroy()
      game.current = null
      match.current = null
      link.current?.close()
    }
  }, [])

  useEffect(() => {
    const orientation = window.matchMedia(portraitQuery)
    function sync() {
      const paused = manualPause.current || orientation.matches || document.hidden
      match.current?.setPaused(paused)
      suspendAudio(document.hidden)
      setPortrait(orientation.matches)
    }
    function firstTap() {
      unlockAudio()
      if (window.matchMedia('(pointer: coarse)').matches) enterLandscape()
    }
    function onKey(event) {
      if (!event.isComposing) unlockAudio()
    }
    function onInstall(event) {
      event.preventDefault()
      setInstallPrompt(event)
    }
    orientation.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    document.addEventListener('pointerup', firstTap, { once: true, capture: true })
    document.addEventListener('keydown', onKey, { once: true, capture: true })
    window.addEventListener('beforeinstallprompt', onInstall)
    return () => {
      orientation.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
      document.removeEventListener('pointerup', firstTap, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('beforeinstallprompt', onInstall)
    }
  }, [])

  useEffect(() => { save('boundary-bash-settings', JSON.stringify(settings)) }, [settings])
  useEffect(() => { setVoice(settings.voice) }, [settings.voice])
  useEffect(() => { game.current?.setQuality?.(settings.quality === 'Low' ? 'Low' : 'High') }, [settings.quality, ready])

  // Keep the phone awake while a match is on screen.
  useEffect(() => {
    if (!inMatch || !navigator.wakeLock) return
    let lock
    let cancelled = false
    const acquire = () => navigator.wakeLock.request('screen').then(value => { if (cancelled) value.release(); else lock = value }).catch(() => {})
    const onVisible = () => { if (!document.hidden) acquire() }
    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [inMatch])

  const setOption = useCallback((name, value) => setSettings(previous => ({ ...previous, [name]: value })), [])

  function commitProfile(next) {
    profileRef.current = next
    saveProfile(next)
    setProfile(next)
  }

  // ---- Starting a match ----

  function beginMatch({ mode, user, opp, overs, difficulty, pitch, online = null }) {
    flow.current = {
      mode, user, opp, overs, difficulty, pitch, online,
      userBatsFirst: true, stage: 'main1', main: [], supers: [], all: [],
      stats: EMPTY_MATCH_STATS(), rng: makeRng(online?.seed), simulatedBowling: false, lastBall: false,
      autoBowl: !online && settingsRef.current.bowling === 'Auto',
    }
    gates.current = {}
    inbox.current = []
    setView(null)
    setScore(initialScore)
    setTossInfo({
      user, opp, pitch, id: Date.now(),
      title: mode === 'cup' || mode === 'league' ? describeFixture(profileRef.current[mode]) : mode === 'online' ? 'Online duel' : 'The toss',
      fixed: online ? { userWon: online.host === online.hostWonToss, userBats: online.host === online.hostBatsFirst } : null,
    })
    setScreen('toss')
  }

  function startQuick() {
    if (!ready) return
    buzz()
    const current = settingsRef.current
    const user = teamByName(current.team)
    const others = TEAM_LIST.filter(team => team.id !== user.id)
    const named = current.opponent && current.opponent !== 'Random' ? teamByName(current.opponent) : null
    const opp = named && named.id !== user.id ? named : others[Math.floor(Math.random() * others.length)]
    const pitch = PITCH_IDS.includes(current.pitchType) ? current.pitchType : PITCH_IDS[Math.floor(Math.random() * PITCH_IDS.length)]
    beginMatch({ mode: 'quick', user, opp, overs: current.overs, difficulty: current.difficulty, pitch })
  }

  function startCompetition(mode) {
    const current = settingsRef.current
    const user = teamByName(current.team)
    const rng = makeRng()
    const previous = profileRef.current.league
    const competition = mode === 'cup'
      ? createCup({ userTeam: user.id, overs: current.overs, difficulty: current.difficulty, rng })
      : createLeague({ userTeam: user.id, overs: current.overs, difficulty: current.difficulty, season: previous?.done ? previous.season + 1 : 1, rng })
    commitProfile({ ...profileRef.current, [mode]: competition })
    setScreen(mode)
  }

  function playFixture(mode) {
    const competition = profileRef.current[mode]
    const fixture = competition && nextFixture(competition)
    if (!fixture || !ready) return
    buzz()
    const user = teamById(competition.userTeam)
    const opp = teamById(fixture.a === user.id ? fixture.b : fixture.a)
    beginMatch({ mode, user, opp, overs: competition.overs, difficulty: competition.difficulty, pitch: fixture.pitch })
  }

  function openMode(mode) {
    buzz()
    if (mode === 'cup' || mode === 'league') {
      const competition = profileRef.current[mode]
      if (competition && (!competition.done || mode === 'league')) { setScreen(mode); return }
      setSetupMode(mode)
      setScreen('setup')
    } else if (mode === 'setup') {
      setSetupMode('quick')
      setScreen('setup')
    } else {
      setScreen(mode)
    }
  }

  // ---- Online plumbing ----

  function attachLink(connection, config) {
    link.current = connection
    connection.on('message', message => {
      if (message.t === 'gate') {
        gates.current[message.key] = { ...gates.current[message.key], theirs: true }
        runGate(message.key)
      } else if (message.t === 'g') {
        if (message.at !== inningsKey()) return
        if (match.current) match.current.receive(message.m)
        else inbox.current.push(message.m)
      }
    })
    connection.on('close', () => {
      if (!flow.current?.online || flow.current.finished) return
      leaveMatch()
      setNotice('The other player left the match.')
    })
    const user = teamById(config.host ? config.hostTeam : config.guestTeam)
    const opp = teamById(config.host ? config.guestTeam : config.hostTeam)
    beginMatch({ mode: 'online', user, opp, overs: config.overs, difficulty: 'Medium', pitch: config.pitch, online: config })
  }

  const inningsKey = () => (flow.current ? `${flow.current.stage}-${flow.current.supers.length}` : '')

  // Both players must press continue before the next innings begins.
  function gate(key, action) {
    if (!flow.current?.online) { action(); return }
    gates.current[key] = { ...gates.current[key], mine: true, action }
    link.current?.send({ t: 'gate', key })
    setWaiting('Waiting for the other player…')
    runGate(key)
  }

  function runGate(key) {
    const entry = gates.current[key]
    if (!entry?.mine || !entry.theirs || entry.done) return
    entry.done = true
    setWaiting('')
    entry.action()
  }

  // ---- Innings ----

  function inningsPlan() {
    const f = flow.current
    const first = f.userBatsFirst ? [f.user, f.opp] : [f.opp, f.user]
    let batting, bowling, target = null, label, maxBalls = f.overs * 6, maxWickets = 10
    if (f.stage === 'main1') { [batting, bowling] = first; label = '1st innings' }
    else if (f.stage === 'main2') { [bowling, batting] = first; target = f.main[0].score + 1; label = '2nd innings' }
    else {
      // The side that batted second goes first in the super over, then they alternate.
      const round = f.supers.length - 1
      const order = round % 2 === 0 ? [first[1], first[0]] : first
      maxBalls = 6
      maxWickets = 2
      label = 'Super over'
      if (f.stage === 'so1') [batting, bowling] = order
      else { [bowling, batting] = order; target = f.supers[round][0].score + 1 }
    }
    return { batting, bowling, target, label, maxBalls, maxWickets, userBats: batting.id === f.user.id }
  }

  async function startInnings() {
    const f = flow.current
    if (!f || !game.current) return
    const plan = inningsPlan()
    if (!plan.userBats && f.autoBowl) {
      f.simulatedBowling = true
      const innings = simulateInnings({ ...plan, pitch: pitchById(f.pitch), rng: f.rng, bias: SIM_BIAS[f.difficulty] ?? 0 })
      inningsDone(innings, true)
      return
    }

    manualPause.current = false
    setBusy(true)
    const root = hud.current
    const dots = Array.from(root.querySelectorAll('[data-field-dot]'))
    const ball = root.querySelector('.radar-ball')
    const timingElement = root.querySelector('.timing-marker')
    for (const dot of [...dots, ball]) dot.removeAttribute('style')
    timingElement.removeAttribute('style')
    delete timingElement.dataset.grade
    setShot('drive')
    setBowlerOptions(null)
    setAimText('')
    setMeterText('')
    setReplay(false)
    setStage('ready')
    const bat = batById(profileRef.current.bat)
    const online = f.online
    const key = inningsKey()
    let scene
    try {
      scene = await game.current.startMatch({
        settings: { ...settingsRef.current, difficulty: f.difficulty },
        match: {
          batting: plan.batting, bowling: plan.bowling, maxBalls: plan.maxBalls, maxWickets: plan.maxWickets, target: plan.target, label: plan.label,
          pitch: f.pitch, seed: f.rng.int(1, 2 ** 31), fast: testFast,
          bat: testFast > 1 ? 'ai' : plan.userBats ? 'user' : online ? 'remote' : 'ai',
          bowl: testFast > 1 ? 'ai' : plan.userBats ? (online ? 'remote' : 'ai') : 'user',
          wood: plan.userBats ? bat : null, batPerk: plan.userBats ? { timing: bat.timing, power: bat.power } : null,
        },
        net: online ? { role: plan.userBats ? 'auth' : 'mirror', send: m => link.current?.send({ t: 'g', at: key, m }) } : null,
        timingElement,
        fieldDisplay: { dots, ball, label: root.querySelector('.radar-formation'), status: root.querySelector('.radar-status') },
        onUpdate(update) {
          setScore(update)
          if (update.finished && match.current) {
            const finished = match.current
            match.current = null
            inningsDone(finished.innings, false)
          }
        },
        onEvent,
      })
    } catch {
      scene = null
    }
    setBusy(false)
    if (!scene || flow.current !== f) {
      // The player left while the teams were being prepared.
      if (scene && flow.current !== f) game.current?.showMenu()
      return
    }
    match.current = scene
    for (const message of inbox.current.splice(0)) scene.receive(message)
    scene.setPaused(window.matchMedia(portraitQuery).matches || document.hidden)
    setScreen('match')
    if (settingsRef.current.sound !== false && settingsRef.current.crowd !== false) startCrowd()
  }

  function onEvent(type, payload) {
    if (type === 'stage') {
      setStage(payload)
      if (payload !== 'ready') setBowlerOptions(null)
    } else if (type === 'needBowler') setBowlerOptions(payload)
    else if (type === 'aim') setAimText(payload)
    else if (type === 'meter') setMeterText(payload)
    else if (type === 'replay') setReplay(payload)
    else if (type === 'shake') hud.current?.closest('.game-frame')?.animate([{ transform: 'translateX(2px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], 180)
    else if (type === 'ball') onBall(payload)
  }

  function onBall(ball) {
    const stats = flow.current?.stats
    if (!stats) return
    if (ball.userBats && ball.extra !== 'wide') {
      stats.runs += ball.runs
      if (ball.legal) stats.ballsFaced++
      if (ball.boundary && ball.runs === 6) {
        stats.sixes++
        stats.sixStreak++
        stats.bestSixStreak = Math.max(stats.bestSixStreak, stats.sixStreak)
      } else {
        if (ball.boundary) stats.fours++
        stats.sixStreak = 0
      }
      if (ball.milestone === 'fifty') stats.fifties++
      if (ball.milestone === 'hundred') { stats.hundreds++; stats.fifties = Math.max(0, stats.fifties - 1) }
    }
    if (ball.userBowls) {
      if (ball.legal) stats.ballsBowled++
      stats.runsConceded += ball.runs + (ball.extra ? 1 : 0)
      if (ball.wicket && ball.kind !== 'runout') {
        stats.wickets++
        if (++stats.wicketStreak === 3) stats.hatTricks++
      } else if (ball.legal || ball.wicket) {
        stats.wicketStreak = 0
      }
      if (ball.maiden) stats.maidens++
    }
    if (ball.finished) flow.current.lastBall = ball.lastBall
  }

  function inningsDone(innings, simulated) {
    const f = flow.current
    if (!f) return
    stopCrowd()
    f.all.push(innings)
    const userBatted = innings.battingId === f.user.id
    if (userBatted) {
      f.stats.best = Math.max(f.stats.best, innings.topScorer().runs)
      if (f.stage.startsWith('main')) f.stats.total = Math.max(f.stats.total, innings.score)
    } else if (!simulated) {
      const best = innings.bestBowler()
      if (best && (best.wickets > f.stats.bestWickets || (best.wickets === f.stats.bestWickets && best.runs < f.stats.bestWicketsRuns))) {
        f.stats.bestWickets = best.wickets
        f.stats.bestWicketsRuns = best.runs
      }
    }
    const nextBatting = userBatted ? f.opp : f.user
    const kicker = simulated ? 'Simulated innings' : 'Innings break'
    const scoreText = `${innings.battingName} ${innings.score}-${innings.wickets}`

    if (f.stage === 'main1') {
      f.main[0] = innings
      f.stage = 'main2'
      const rate = ((innings.score + 1) / f.overs).toFixed(2)
      showBreak({
        kicker, title: scoreText, target: innings.score + 1, overs: f.overs,
        text: `${nextBatting.name} need ${innings.score + 1} to win at ${rate} an over.`,
        button: userBatted ? (f.autoBowl ? 'Simulate the chase' : 'Defend the total') : 'Start the chase', innings: [...f.main],
      })
      return
    }
    if (f.stage === 'main2') {
      f.main[1] = innings
      const outcome = decide(f.main[0], f.main[1])
      if (outcome.winner !== 'tie') {
        const winner = teamById(outcome.winner === 'first' ? f.main[0].battingId : f.main[1].battingId)
        finish(winner, `${winner.name} won by ${outcome.margin}`)
        return
      }
      startSuperOver('Scores level', 'The match is tied. One over each, two wickets in hand.')
      return
    }
    const round = f.supers[f.supers.length - 1]
    if (f.stage === 'so1') {
      round[0] = innings
      f.stage = 'so2'
      showBreak({
        kicker: 'Super over', title: scoreText, target: innings.score + 1, overs: 1,
        text: `${nextBatting.name} need ${innings.score + 1} from six balls.`,
        button: userBatted ? (f.autoBowl ? 'Simulate the reply' : 'Bowl the super over') : 'Start the reply', innings: [...f.all],
      })
      return
    }
    round[1] = innings
    const outcome = decide(round[0], round[1])
    if (outcome.winner !== 'tie') {
      const winner = teamById(outcome.winner === 'first' ? round[0].battingId : round[1].battingId)
      finish(winner, `${winner.name} won the super over`)
    } else if (f.supers.length < 2) {
      startSuperOver('Still level!', 'Another super over will decide it.')
    } else {
      // Count-back: most boundaries, then fewest wickets lost.
      const mine = f.all.filter(entry => entry.battingId === f.user.id)
      const theirs = f.all.filter(entry => entry.battingId !== f.user.id)
      const wicketsLost = list => list.reduce((sum, entry) => sum + entry.wickets, 0)
      const edge = boundaries(mine) - boundaries(theirs) || wicketsLost(theirs) - wicketsLost(mine)
      if (edge !== 0) {
        const winner = edge > 0 ? f.user : f.opp
        finish(winner, `${winner.name} won on boundary count-back`)
      } else if (f.mode === 'cup' || f.mode === 'league') {
        const winner = teamById(f.main[0].battingId)
        finish(winner, `${winner.name} go through on count-back`)
      } else {
        finish(null, 'Match tied')
      }
    }
  }

  function startSuperOver(kicker, text) {
    const f = flow.current
    f.supers.push([])
    f.stage = 'so1'
    const userFirst = inningsPlan().userBats
    showBreak({
      kicker, title: 'Super over!', text, target: null, overs: 1,
      button: userFirst ? 'Bat the super over' : f.autoBowl ? 'Simulate their over' : 'Bowl the super over', innings: [...f.all],
    })
  }

  function showBreak(next) {
    game.current?.showMenu()
    match.current = null
    setView(next)
    setScreen('break')
  }

  function finish(winner, summary) {
    const f = flow.current
    f.finished = true
    game.current?.showMenu()
    const before = profileRef.current
    const result = !winner ? 'tie' : winner.id === f.user.id ? 'win' : 'loss'
    const stats = f.stats
    const rewards = matchRewards({ result, overs: f.overs, difficulty: f.difficulty, stats, simulatedBowling: f.simulatedBowling })
    const userBattedSecond = f.main[1]?.battingId === f.user.id
    // A last-ball win: chased down on the final delivery, or defended by a whisker.
    const reply = f.main[1]
    const closeFinish = Boolean(reply) && f.supers.length === 0 && reply.balls >= reply.maxBalls
      && (userBattedSecond ? result === 'win' : f.main[0].score - reply.score <= 3)
    const nextStats = addMatchStats(before.stats, {
      result, match: stats, online: f.mode === 'online', wonSuperOver: f.supers.length > 0, chased: userBattedSecond,
    })
    const next = { ...before, stats: nextStats }
    let continueLabel
    if ((f.mode === 'cup' || f.mode === 'league') && before[f.mode]) {
      const competition = structuredClone(before[f.mode])
      const mine = f.main.find(entry => entry.battingId === f.user.id)
      const theirs = f.main.find(entry => entry.battingId !== f.user.id)
      const allOut = entry => (entry.wickets >= entry.maxWickets ? entry.maxBalls : entry.balls)
      reportUserMatch(competition, {
        won: result === 'win', text: `${f.main[0].battingShort} ${f.main[0].scoreline()} · ${f.main[1].battingShort} ${f.main[1].scoreline()}`,
        userRuns: mine.score, userBalls: allOut(mine), oppRuns: theirs.score, oppBalls: allOut(theirs),
      }, makeRng())
      next[f.mode] = competition
      if (competition.done && competition.champion === f.user.id) {
        if (f.mode === 'cup') nextStats.cups++
        else nextStats.leagues++
        const bonus = f.mode === 'cup' ? 500 : 800
        rewards.lines.push({ label: f.mode === 'cup' ? 'Cup winners' : 'League champions', xp: bonus, coins: bonus })
        rewards.xp += bonus
        rewards.coins += bonus
      }
      continueLabel = competition.done ? 'See the final standings' : 'Back to the competition'
    }
    next.xp = before.xp + rewards.xp
    const level = levelInfo(next.xp).level
    const achievements = newlyEarned(before.achievements, {
      stats: nextStats, match: stats, result, level, flags: { lastBall: closeFinish, difficulty: f.difficulty },
    })
    const bonusCoins = achievements.reduce((sum, item) => sum + item.coins, 0)
    next.coins = before.coins + rewards.coins + bonusCoins
    next.earned = (before.earned || 0) + rewards.coins + bonusCoins
    next.achievements = { ...before.achievements }
    for (const item of achievements) next.achievements[item.id] = Date.now()
    commitProfile(next)
    save('boundary-bash-best', String(nextStats.bestTotal))

    const settingsNow = settingsRef.current
    if (settingsNow.sound !== false) playSound(result === 'loss' ? 'lose' : 'win')
    if (achievements.length && settingsNow.sound !== false) setTimeout(() => playSound('unlock'), 700)
    match.current = null
    setView({
      result, kicker: f.mode === 'online' ? 'Online duel' : f.mode === 'quick' || !before[f.mode] ? 'Match result' : describeFixture(before[f.mode]),
      headline: result === 'win' ? 'You win!' : result === 'loss' ? 'Defeat' : 'Match tied',
      summary, rewards, achievements, innings: [...f.all], continueLabel,
      levelUp: level > levelInfo(before.xp).level ? level : null,
    })
    setScreen('result')
  }

  function leaveMatch() {
    match.current = null
    manualPause.current = false
    stopCrowd()
    link.current?.close()
    link.current = null
    flow.current = null
    setWaiting('')
    game.current?.showMenu()
    setScreen('home')
  }

  function home() {
    buzz()
    leaveMatch()
  }

  function afterResult() {
    const f = flow.current
    if (f?.mode === 'cup' || f?.mode === 'league') {
      const mode = f.mode
      flow.current = null
      setScreen(mode)
    } else {
      home()
    }
  }

  function again() {
    const f = flow.current
    if (f?.mode === 'quick') startQuick()
    else home()
  }

  function togglePause() {
    if (!match.current || portrait || document.hidden) return
    buzz()
    manualPause.current = !manualPause.current
    match.current.setPaused(manualPause.current)
    setScreen(manualPause.current ? 'pause' : 'match')
  }

  const chooseShot = useCallback(value => {
    if (!match.current) return
    match.current.selectedShot = value
    setShot(value)
  }, [])

  function buy(kind, item) {
    const current = profileRef.current
    const key = `${kind}:${item.id}`
    if (current.coins < item.price || current.owned.includes(key)) return
    playSound('coin')
    commitProfile({ ...current, coins: current.coins - item.price, owned: [...current.owned, key], [kind]: item.id })
  }

  function equip(kind, id) {
    playSound('click')
    commitProfile({ ...profileRef.current, [kind]: id })
  }

  async function install() {
    if (!installPrompt) return
    installPrompt.prompt()
    try { await installPrompt.userChoice } catch {}
    setInstallPrompt(null)
  }

  const menuScreen = !inMatch
  const backHome = screen !== 'home' && screen !== 'toss' && screen !== 'break' && screen !== 'result'
  const look = lookById(profile.look)

  return <main className="app-shell">
    <div className={inMatch ? 'game-frame playing' : 'game-frame'} inert={portrait ? '' : undefined}>
      <div ref={mount} className="canvas-mount" aria-label="Cricket ground" style={{ filter: look.filter }} />
      {menuScreen && <div className="menu-shade" />}
      {menuScreen && <header className="menu-header"><Brand />
        <div className="header-tools">
          <LevelChip profile={profile} />
          {screen === 'home' ? <>
            <button className="header-action" onClick={() => openMode('shop')}>Kit room</button>
            <button className="header-action" onClick={() => openMode('profile')}>Career</button>
            <button className="header-action" onClick={() => openMode('settings')} aria-label="Settings"><span className="gear" aria-hidden="true">⚙</span></button>
          </> : backHome ? <button className="header-action" onClick={home}>Main menu</button>
            : screen !== 'result' && <button className="header-action" onClick={home}>Quit match</button>}
        </div>
      </header>}

      {screen === 'home' && <Home settings={settings} profile={profile} go={openMode} ready={ready} />}
      {screen === 'home' && notice && <div className="notice" role="alert">{notice}<button className="secondary" onClick={() => setNotice('')}>OK</button></div>}

      {screen === 'setup' && <Setup mode={setupMode} settings={settings} setOption={setOption} ready={ready} failed={failed} busy={busy}
        onStart={() => (setupMode === 'quick' ? startQuick() : startCompetition(setupMode))} />}

      {(screen === 'cup' || screen === 'league') && profile[screen] && <CompetitionScreen competition={profile[screen]} busy={!ready}
        onPlay={() => playFixture(screen)}
        onAbandon={() => { if (!profile[screen].done) commitProfile({ ...profileRef.current, [screen]: null }); home() }}
        onNew={() => { setSetupMode(screen); setScreen('setup') }} />}

      {screen === 'toss' && tossInfo && <Toss key={tossInfo.id} user={tossInfo.user} opp={tossInfo.opp} pitch={tossInfo.pitch} title={tossInfo.title} fixed={tossInfo.fixed} onDone={userBats => {
        if (busy || waiting) return
        flow.current.userBatsFirst = userBats
        gate('toss', startInnings)
      }} />}

      {screen === 'online' && <Online settings={settings} onStart={attachLink} onBack={home} />}

      {!ready && !failed && <div className="loading" role="status"><span>Preparing the field</span><b>{progress}%</b>
        <progress max="100" value={progress} aria-label="Loading field and players" /></div>}
      {(busy || (waiting && !inMatch)) && <div className="loading" role="status"><span>{waiting || 'Getting the teams ready…'}</span></div>}

      {screen === 'settings' && <SettingsScreen settings={settings} setOption={setOption} onDone={home} canInstall={Boolean(installPrompt)} install={install} fullscreen={enterLandscape} />}
      {screen === 'shop' && <Shop profile={profile} buy={buy} equip={equip} onDone={home} />}
      {screen === 'profile' && <ProfileScreen profile={profile} onDone={home} />}

      <MatchHud root={hud} match={match} visible={inMatch} active={screen === 'match' && !portrait}
        score={score} stage={stage} shot={shot} chooseShot={chooseShot} pause={togglePause}
        bowlerOptions={bowlerOptions} chooseBowler={index => { buzz(); match.current?.chooseBowler(index); setBowlerOptions(null) }}
        aimText={aimText} meterText={meterText} replay={replay}
        waiting={flow.current?.online && stage === 'waiting' ? 'Opponent is setting up the delivery…' : ''} />

      {screen === 'pause' && <div className="modal-backdrop"><section className="menu-card modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <h2 id="pause-title">Match paused</h2>
        <button className="primary" onClick={togglePause} autoFocus>Resume</button>
        <button className="secondary" onClick={home}>Abandon match</button>
      </section></div>}

      {screen === 'break' && view && <InningsBreak view={view} busy={busy || Boolean(waiting)} onContinue={() => { buzz(); gate(inningsKey(), startInnings) }} />}

      {screen === 'result' && view && <Result view={view} onHome={home} onAgain={again}
        onContinue={view.continueLabel ? afterResult : null} />}
    </div>
    <section className="rotate-overlay" role="status" aria-hidden={!portrait}><div className="rotating-phone" aria-hidden="true" /><h2>Phone ko rotate karo</h2><p>Landscape mein kheliye.</p></section>
  </main>
}
