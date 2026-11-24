import { useEffect, useRef, useState } from 'react'
import { loadSettings, TEAMS } from '../data/defaults.js'

const blankScore = { score:0, wickets:0, balls:0, overs:'0.0', totalBalls:6, extras:0 }
const fieldDotIndices = Array.from({ length: 9 }, (_, index) => index)

export default function App() {
  const mountRef = useRef(null)
  const gameRef = useRef(null)
  const matchRef = useRef(null)
  const timingRef = useRef(null)
  const fieldRadarRef = useRef(null)
  const fieldBallRef = useRef(null)
  const fieldLabelRef = useRef(null)
  const fieldStatusRef = useRef(null)
  const [screen,setScreen] = useState('home')
  const [gameReady, setGameReady] = useState(false)
  const [fieldLoadFailed, setFieldLoadFailed] = useState(false)
  const [settings,setSettings] = useState(loadSettings)
  const [score,setScore] = useState(blankScore)
  const [best,setBest] = useState(Number(localStorage.getItem('boundary-bash-best') || 0))
  const [shotType,setShotType] = useState('drive')

  useEffect(() => {
    let cancelled = false
    let game
    async function loadField() {
      try {
        const { createGame } = await import('../game/createGame.js')
        if (cancelled) return
        game = createGame(mountRef.current)
        gameRef.current = game
        function markGameReady() {
          if (cancelled) return
          if (game.textures.exists('stadium') && game.textures.exists('match-ground')) setGameReady(true)
          else setFieldLoadFailed(true)
        }
        function waitForStadium() {
          const menu = game.scene.getScene('MenuScene')
          if (menu.sys.isActive()) markGameReady()
          else menu.sys.events.once('create', markGameReady)
        }
        if (game.scene.isBooted) waitForStadium()
        else game.events.once('ready', waitForStadium)
      } catch {
        if (!cancelled) setFieldLoadFailed(true)
      }
    }
    loadField()
    return () => {
      cancelled = true
      game?.destroy(true)
      gameRef.current = null
      matchRef.current = null
    }
  },[])

  useEffect(() => { localStorage.setItem('boundary-bash-settings',JSON.stringify(settings)) },[settings])

  function startMatch() {
    const game = gameRef.current
    if (!gameReady || !game) return
    timingRef.current.dataset.phase = 'ready'
    delete timingRef.current.dataset.grade
    timingRef.current.style.setProperty('--timing', '0%')
    const fieldDisplay = {
      dots: Array.from(fieldRadarRef.current.querySelectorAll('[data-field-dot]')),
      ball: fieldBallRef.current,
      label: fieldLabelRef.current,
      status: fieldStatusRef.current,
    }
    fieldDisplay.label.textContent = ''
    fieldDisplay.status.dataset.active = 'false'
    fieldDisplay.status.textContent = ''
    fieldDisplay.ball.removeAttribute('style')
    fieldDisplay.dots.forEach(dot => {
      dot.removeAttribute('style')
      dot.removeAttribute('title')
    })
    setScore({...blankScore,totalBalls:settings.overs*6}); setShotType('drive'); setScreen('game')
    if (game.scene.isActive('MenuScene')) game.scene.stop('MenuScene')
    if (game.scene.isActive('MatchScene')) game.scene.stop('MatchScene')
    game.scene.start('MatchScene', {
      settings: { ...settings },
      timingElement: timingRef.current,
      fieldDisplay,
      onUpdate: update => {
        setScore(update)
        if (update.finished) {
          const nextBest = Math.max(best, update.score)
          setBest(nextBest)
          localStorage.setItem('boundary-bash-best', String(nextBest))
          setScreen('result')
        }
      },
    })
    matchRef.current=game.scene.getScene('MatchScene')
  }

  function returnHome() {
    const game=gameRef.current
    game?.scene.stop('MatchScene')
    matchRef.current = null
    if (game && !game.scene.isActive('MenuScene')) game.scene.start('MenuScene')
    setScreen('home')
  }
  function pause() {
    if (!matchRef.current) return
    const paused = screen === 'game'
    matchRef.current.setPaused(paused)
    setScreen(paused ? 'pause' : 'game')
  }

  function swing() {
    matchRef.current?.swing('straight', shotType === 'loft')
  }

  function chooseShot(type) {
    if (matchRef.current) matchRef.current.selectedShot = type
    setShotType(type)
  }

  const inMatch = screen === 'game' || screen === 'pause'
  const paused = screen === 'pause'
  const runRate=score.balls ? (score.score/(score.balls/6)).toFixed(1) : '0.0'
  const oversLeft=Math.max(0,score.totalBalls-score.balls)

  return <main className={inMatch ? 'app-shell is-playing' : 'app-shell'}>
    <div className={inMatch ? 'game-frame is-match' : 'game-frame'}>
      <div ref={mountRef} className="phaser-mount" aria-label="Cricket game canvas" />
      {!inMatch && <div className="shade" />}

      <header className="match-topline" hidden={!inMatch}>
        <div className="brand-mark"><span className="brand-ball" aria-hidden="true">●</span><span>BOUNDARY <b>BASH</b></span></div>
        <div className="timing-panel" role="img" aria-label="Shot timing. Swing when the pointer reaches the center.">
          <span>SHOT TIMING</span>
          <div className="timing-track">
            <i ref={timingRef} className="timing-marker" data-phase="ready" />
          </div>
          <small>EARLY <strong>PERFECT</strong> LATE</small>
        </div>
        <button className="pause-button" onClick={pause} aria-label="Pause game" disabled={paused}>Ⅱ</button>
      </header>

      <aside ref={fieldRadarRef} className="field-radar" aria-label="Bowling field" hidden={!inMatch}>
        <div className="radar-ground" aria-hidden="true">
          {fieldDotIndices.map(index => <i key={index} className="radar-dot" data-field-dot="" />)}
          <i ref={fieldBallRef} className="radar-dot radar-ball" />
        </div>
        <div className="radar-caption">
          <span className="radar-label">Field</span>
          <strong ref={fieldLabelRef} className="radar-formation" />
        </div>
        <p ref={fieldStatusRef} className="radar-status" role="status" aria-atomic="true" />
      </aside>

      {screen==='home' && <section className="panel home-panel">
        <p className="eyebrow">A pocket sized cricket showdown</p><h1>BOUNDARY<br/><span>BASH</span></h1>
        <p className="tagline">One over. One big innings.</p>
        <button className="primary font-extrabold" onClick={()=>setScreen('setup')}>PLAY MATCH <b>→</b></button>
        <button className="text-button" onClick={()=>setScreen('settings')}>⚙ Settings</button>
        <div className="best-pill">BEST INNINGS <strong>{best}</strong></div>
      </section>}

      {screen==='setup' && <section className="panel setup-panel">
        <button className="back" onClick={returnHome}>← Menu</button><p className="eyebrow">Quick match</p><h2>Set the scene</h2>
        <label>OVERS</label><div className="choice-row">{[1,2,5,10].map(n=><button key={n} onClick={()=>setSettings(s=>({...s,overs:n}))} className={settings.overs===n?'choice selected':'choice'}>{n}</button>)}</div>
        <label>OPPONENT</label><div className="choice-row">{['Easy','Medium','Hard'].map(d=><button key={d} onClick={()=>setSettings(s=>({...s,difficulty:d}))} className={settings.difficulty===d?'choice selected':'choice'}>{d}</button>)}</div>
        <label>YOUR TEAM</label><select value={settings.team} onChange={e=>setSettings(s=>({...s,team:e.target.value}))}>{TEAMS.map(t=><option key={t}>{t}</option>)}</select>
        {fieldLoadFailed
          ? <><p className="hint" role="alert">The field could not load. Check your connection and try again.</p><button className="primary" onClick={() => window.location.reload()}>RETRY</button></>
          : <button className="primary" onClick={startMatch} disabled={!gameReady}>{gameReady ? 'BAT FIRST' : 'LOADING FIELD…'} <b>→</b></button>}
      </section>}

      {screen==='settings' && <section className="panel settings-panel">
        <button className="back" onClick={returnHome}>← Menu</button><p className="eyebrow">Your preferences</p><h2>Settings</h2>
        <button className="setting-row" onClick={()=>setSettings(s=>({...s,sound:!s.sound}))}><span>Sound effects</span><b>{settings.sound?'ON':'OFF'}</b></button>
        <p className="hint">Tip: turn your phone sideways for a wider view.</p>
        <button className="primary" onClick={returnHome}>DONE</button>
      </section>}

      {inMatch && <>
        <div className="match-tip text-center">SWIPE THE FIELD TO AIM</div>
        <div className="bat-controls" aria-label="Batting controls">
          <div className="foot-controls">
            <button onClick={() => matchRef.current?.setFootwork('back')} disabled={paused}>BACK FOOT</button>
            <button onClick={() => matchRef.current?.setFootwork('advance')} disabled={paused}>ADVANCE</button>
            <button onClick={() => matchRef.current?.leave()} disabled={paused}>LEAVE</button>
          </div>
          <div className="shot-controls">
            <button aria-pressed={shotType === 'drive'} onClick={() => chooseShot('drive')} disabled={paused}>DRIVE</button>
            <button className="loft" aria-pressed={shotType === 'loft'} onClick={() => chooseShot('loft')} disabled={paused}>LOFT</button>
            <button
              className="shot-hit"
              onPointerDown={event => {
                if (event.isPrimary && event.button === 0) swing()
              }}
              onClick={event => { if (event.detail === 0) swing() }}
              aria-label="Hit the ball"
              disabled={paused}
            >HIT</button>
          </div>
        </div>
        <footer className="score-strip">
          <div className="innings-score"><span>{settings.team.toUpperCase()}</span><strong>{score.score}<i> / {score.wickets}</i></strong></div>
          <div><span>OVERS</span><b>{score.overs}<small> / {settings.overs}.0</small></b></div>
          <div><span>RUN RATE</span><b>{runRate}</b></div>
          <div className="player-stat"><span>STRIKER</span><b>YOU <i>{score.score} ({score.balls})</i></b></div>
          <div className="player-stat"><span>BOWLER</span><b>PACE <i>{score.balls} balls</i></b></div>
          <div><span>EXTRAS</span><b>{score.extras}</b></div>
        </footer>
        <p className="orientation-hint">Rotate your phone for a wider view.</p>
      </>}

      {paused && <>
        <div className="pause-shade" />
        <section className="panel modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><h2 id="pause-title">Match paused</h2><button className="primary" onClick={pause} autoFocus>RESUME</button><button className="text-button" onClick={returnHome}>End innings</button></section>
      </>}

      {screen==='result' && <section className="panel result-panel"><p className="eyebrow">Innings complete</p><h2>{score.score>=20?'BIG HITTER!':'NICE INNINGS!'}</h2><div className="result-score">{score.score}<span> / {score.wickets}</span></div><div className="result-grid"><div><span>OVERS</span><b>{score.overs}</b></div><div><span>RUN RATE</span><b>{runRate}</b></div><div><span>EXTRAS</span><b>{score.extras}</b></div></div><p className="hint">{oversLeft===0?'You faced your full allocation.':'All wickets are down.'} Best: {best} runs.</p><button className="primary" onClick={startMatch}>PLAY AGAIN <b>↻</b></button><button className="text-button" onClick={returnHome}>Main menu</button></section>}
    </div>
  </main>
}
