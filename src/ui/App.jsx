import { useEffect, useRef, useState } from 'react'
import { loadSettings, TEAMS } from '../data/defaults.js'
import { unlockAudio } from '../game/sounds.js'
import MatchHud from './MatchHud.jsx'

const initialScore = { score: 0, wickets: 0, balls: 0, overs: '0.0', totalBalls: 6, extras: 0 }
const portraitQuery = '(orientation: portrait)'

function buzz() {
  navigator.vibrate?.(12)
}

function readBest() {
  try { return Number(localStorage.getItem('boundary-bash-best')) || 0 }
  catch { return 0 }
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

function Choices({ label, values, selected, onChoose }) {
  return <fieldset className="choices"><legend>{label}</legend><div>
    {values.map(value => <button key={value} type="button" aria-pressed={selected === value} onClick={() => onChoose(value)}>{value}</button>)}
  </div></fieldset>
}

export default function App() {
  const mount = useRef(null)
  const hud = useRef(null)
  const game = useRef(null)
  const match = useRef(null)
  const manualPause = useRef(false)
  const [portrait, setPortrait] = useState(() => window.matchMedia(portraitQuery).matches)
  const [screen, setScreen] = useState('home')
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [settings, setSettings] = useState(loadSettings)
  const [score, setScore] = useState(initialScore)
  const [best, setBest] = useState(readBest)
  const [shot, setShot] = useState('drive')
  const inMatch = screen === 'match' || screen === 'pause'

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
    }
  }, [])

  useEffect(() => {
    const orientation = window.matchMedia(portraitQuery)
    function sync() {
      const paused = manualPause.current || orientation.matches || document.hidden
      match.current?.setPaused(paused)
      setPortrait(orientation.matches)
    }
    function firstTap() {
      unlockAudio()
      enterLandscape()
    }
    function onKey(event) {
      if (!event.isComposing) unlockAudio()
    }
    orientation.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    document.addEventListener('pointerup', firstTap, { once: true, capture: true })
    document.addEventListener('keydown', onKey, { once: true, capture: true })
    return () => {
      orientation.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
      document.removeEventListener('pointerup', firstTap, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [])

  useEffect(() => { save('boundary-bash-settings', JSON.stringify(settings)) }, [settings])

  function startMatch() {
    if (!ready || portrait || document.hidden) return
    buzz()
    manualPause.current = false
    const root = hud.current
    const dots = Array.from(root.querySelectorAll('[data-field-dot]'))
    const ball = root.querySelector('.radar-ball')
    const timingElement = root.querySelector('.timing-marker')
    for (const dot of [...dots, ball]) dot.removeAttribute('style')
    timingElement.removeAttribute('style')
    delete timingElement.dataset.grade
    setShot('drive')
    setScreen('match')
    match.current = game.current.startMatch({
      settings: { ...settings },
      timingElement,
      fieldDisplay: { dots, ball, label: root.querySelector('.radar-formation'), status: root.querySelector('.radar-status') },
      onUpdate(update) {
        setScore(update)
        if (update.finished) {
          const nextBest = Math.max(best, update.score)
          setBest(nextBest)
          save('boundary-bash-best', String(nextBest))
          setScreen('result')
          match.current = null
        }
      }
    })
  }

  function home() {
    match.current = null
    manualPause.current = false
    game.current?.showMenu()
    setScreen('home')
  }
  function togglePause() {
    if (!match.current || portrait || document.hidden) return
    buzz()
    manualPause.current = !manualPause.current
    match.current.setPaused(manualPause.current)
    setScreen(manualPause.current ? 'pause' : 'match')
  }
  function chooseShot(value) {
    if (!match.current) return
    match.current.selectedShot = value
    setShot(value)
  }
  function setOption(name, value) { setSettings(previous => ({ ...previous, [name]: value })) }

  const runRate = score.balls ? (score.score * 6 / score.balls).toFixed(1) : '0.0'

  return <main className="app-shell">
    <div className={inMatch ? 'game-frame playing' : 'game-frame'} inert={portrait ? '' : undefined}>
      <div ref={mount} className="canvas-mount" aria-label="Cricket ground" />
      {!inMatch && <div className="menu-shade" />}
      {!inMatch && <header className="menu-header"><Brand />
        {screen === 'home' ? <button className="header-action" onClick={() => setScreen('settings')}><span className="gear" aria-hidden="true">⚙</span>Settings</button>
          : <button className="header-action" onClick={home}>Main menu</button>}
      </header>}

      {screen === 'home' && <section className="home-body">
        <h1>Boundary<br/><span>Bash</span><i className="title-stripes" aria-hidden="true" /></h1>
        <p>Bat for the {settings.team} in a {settings.overs}-over match.</p>
        <button className="primary play-match" onClick={() => setScreen('setup')}><i className="play-icon" aria-hidden="true"/>Play match</button>
      </section>}

      {screen === 'home' && <footer className="club-footer">
        <div><span>Best innings</span><b>{best} <small>runs</small></b></div>
        <div><span>Opponent</span><b>{settings.difficulty}</b></div>
      </footer>}

      {screen === 'setup' && <section className="menu-card setup">
        <h2>Match setup</h2>
        <div className="setup-grid">
          <Choices label="Overs" values={[1, 2, 5, 10]} selected={settings.overs} onChoose={value => setOption('overs', value)}/>
          <Choices label="Opponent" values={['Easy', 'Medium', 'Hard']} selected={settings.difficulty} onChoose={value => setOption('difficulty', value)}/>
          <label className="team-field">Your team<select value={settings.team} onChange={event => setOption('team', event.target.value)}>
            {TEAMS.map(team => <option key={team}>{team}</option>)}
          </select></label>
          {failed ? <button className="primary" onClick={() => window.location.reload()}>Retry loading</button>
            : <button className="primary" onClick={startMatch} disabled={!ready}>{ready ? 'Bat first' : 'Loading field…'}</button>}
        </div>
        {failed && <p className="hint" role="alert">The field could not load. Check your connection and retry.</p>}
      </section>}

      {!ready && !failed && <div className="loading" role="status"><span>Preparing the field</span><b>{progress}%</b>
        <progress max="100" value={progress} aria-label="Loading field and players"/></div>}

      {screen === 'settings' && <section className="menu-card settings">
        <h2>Settings</h2>
        <button className="setting-row" aria-pressed={settings.sound} onClick={() => setOption('sound', !settings.sound)}>
          Sound effects <b>{settings.sound ? 'On' : 'Off'}</b>
        </button>
        <button className="setting-row" onClick={()=>setOption('pitchHint',settings.pitchHint===false)}>Pitch map hint <b>{settings.pitchHint===false?'Off':'On'}</b></button>
        <Choices label="Pitch" values={['green','dusty','flat']} selected={settings.pitchType || 'flat'} onChoose={value=>setOption('pitchType',value)}/>
        <p className="hint">Swipe left or right to direct a shot. Tap the pitch to play straight. On a keyboard, use ←, → or Space.</p>
        <button className="primary" onClick={home}>Done</button>
      </section>}

      <MatchHud root={hud} match={match} visible={inMatch} active={screen === 'match' && !portrait}
        team={settings.team} difficulty={settings.difficulty} overs={settings.overs} score={score} runRate={runRate}
        shot={shot} chooseShot={chooseShot} pause={togglePause} />

      {screen === 'pause' && <div className="modal-backdrop"><section className="menu-card modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <h2 id="pause-title">Match paused</h2>
        <button className="primary" onClick={togglePause} autoFocus>Resume</button>
        <button className="secondary" onClick={home}>End innings</button>
      </section></div>}

      {screen === 'result' && <section className="menu-card results">
        <div><p className="kicker">Innings complete</p><h2>{settings.team}</h2><p className="final-score">{score.score}<small> / {score.wickets}</small></p></div>
        <div><dl>{[['Overs', score.overs], ['Run rate', runRate], ['Extras', score.extras], ['Best innings', best]].map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <button className="primary" onClick={startMatch}>Play again</button></div>
      </section>}
    </div>
    <section className="rotate-overlay" role="status" aria-hidden={!portrait}><div className="rotating-phone" aria-hidden="true"/><h2>Phone ko rotate karo</h2><p>Landscape mein kheliye.</p></section>
  </main>
}
