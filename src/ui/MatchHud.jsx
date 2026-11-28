import { useEffect, useRef, useState } from 'react'

const fielders = Array.from({ length: 9 }, (_, index) => index)
const keyShots = { Space: 'straight', ArrowLeft: 'leg', ArrowRight: 'off' }
const vibrate = () => navigator.vibrate?.(12)
const styleName = { pace: 'Fast', spin: 'Spin' }

function ThumbButton({ action, children, ...props }) {
  function activate() { vibrate(); action() }
  return <button type="button" {...props} onPointerDown={event => {
    if (event.button === 0) activate()
  }} onClick={event => { if (event.detail === 0) activate() }}>{children}</button>
}

function Footwork({ match }) {
  const [selected, setSelected] = useState(null)
  function choose(value) {
    match.current?.setFootwork(value)
    setSelected(match.current?.footwork)
  }
  return <div className="foot-controls" role="group" aria-label="Footwork">
    <ThumbButton aria-pressed={selected === 'advance'} action={() => choose('advance')}>Advance</ThumbButton>
    <ThumbButton aria-pressed={selected === 'back'} action={() => choose('back')}>Back foot</ThumbButton>
    <ThumbButton action={() => match.current?.leave()}>Leave</ThumbButton>
  </div>
}

function ballClass(symbol) {
  if (symbol.includes('W')) return 'wicket'
  if (symbol.includes('wd') || symbol.includes('nb')) return 'extra'
  if (symbol === '4') return 'four'
  if (symbol === '6') return 'six'
  return ''
}

export default function MatchHud({ root, match, visible, active, score, stage, shot, chooseShot, pause, bowlerOptions, chooseBowler, aimText, meterText, replay, waiting }) {
  const gesture = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [labels, setLabels] = useState(false)
  const [direction, setDirection] = useState(null)
  const [delivery, setDelivery] = useState(null)
  const hold = useRef()
  const bowling = Boolean(score.userBowls)
  const batting = Boolean(score.userBats)
  useEffect(() => { if (!active) { clearTimeout(hold.current); setLabels(false); setDirection(null); setExpanded(false) } }, [active])
  useEffect(() => { setDelivery(score.deliveryType || null) }, [score.deliveryType, score.style])

  function pickDelivery(id) {
    match.current?.setDeliveryType(id)
    setDelivery(id)
  }

  useEffect(() => {
    if (!active) return
    function onKey(event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || document.hidden) return
      const scene = match.current
      if (!scene) return
      if (scene.phase === 'replay') {
        if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); scene.skipReplay() }
        return
      }
      if (scene.bowl === 'user') {
        const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.code]
        if (nudge) { event.preventDefault(); scene.nudgeAim(...nudge); return }
        if (event.repeat) return
        if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); scene.bowlPress(); return }
        if (event.code === 'KeyF') { scene.cycleField(); return }
        const digit = /^(?:Digit|Numpad)([1-4])$/.exec(event.code)
        const option = digit && scene.snapshot().deliveries[Number(digit[1]) - 1]
        if (option) pickDelivery(option.id)
        return
      }
      if (event.repeat) return
      const aimed = keyShots[event.code]
      if (aimed) {
        event.preventDefault()
        scene.swing(aimed)
      } else if (event.code === 'ArrowUp') {
        event.preventDefault()
        chooseShot(scene.selectedShot === 'loft' ? 'drive' : 'loft')
      } else if (event.code === 'ArrowDown') {
        event.preventDefault()
        scene.leave()
      }
    }
    function clear() { gesture.current = null }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      clear()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [active, match, chooseShot])

  function aimFromPointer(event) {
    const box = event.currentTarget.getBoundingClientRect()
    match.current?.aimAt((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height)
  }
  function begin(event) {
    if (!active || gesture.current || event.button !== 0) return
    const scene = match.current
    if (scene?.phase === 'replay') { scene.skipReplay(); return }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (bowling) {
      gesture.current = { id: event.pointerId, aiming: true }
      aimFromPointer(event)
      return
    }
    hold.current = setTimeout(() => { setLabels(true); if (gesture.current) gesture.current.used = true }, 380)
    gesture.current = { id: event.pointerId, startX: event.clientX, direction: 'straight', used: false, ball: scene?.ballCount }
  }
  function aim(event) {
    const drag = gesture.current
    if (!drag || drag.id !== event.pointerId) return
    if (drag.aiming) { aimFromPointer(event); return }
    const delta = event.clientX - drag.startX
    if (Math.abs(delta) > 12) { clearTimeout(hold.current); setDirection(delta < 0 ? 'leg' : 'off') }
    drag.direction = delta < -24 ? 'leg' : delta > 24 ? 'off' : 'straight'
  }
  function release(event) {
    const drag = gesture.current
    if (!drag || drag.id !== event.pointerId) return
    aim(event)
    if (!drag.aiming && active && !drag.used && drag.ball === match.current?.ballCount) match.current?.swing(drag.direction)
    clearTimeout(hold.current); setLabels(false); setDirection(null)
    gesture.current = null
  }
  function cancel(event) {
    if (event.pointerId === gesture.current?.id) { gesture.current = null; clearTimeout(hold.current); setLabels(false); setDirection(null) }
  }
  function hit() {
    const drag = gesture.current
    if (drag) drag.used = true
    match.current?.swing(drag?.direction ?? 'straight')
  }

  const perfect = (score.perfect || 0.12) * 100 / .94
  const chasing = score.target != null
  const showPicker = bowling && bowlerOptions?.length > 0
  const rate = value => (value == null ? '–' : value.toFixed(2))
  const bowlLabel = stage === 'runup' ? 'Release' : 'Bowl'
  const bowlDisabled = !(stage === 'aim' || stage === 'runup')
  const hint = replay ? '' : waiting || (bowling
    ? (stage === 'aim' ? `${aimText || 'Drag on the pitch to aim'}` : stage === 'runup' ? 'Tap RELEASE in the green zone' : meterText || '')
    : batting && score.ballId < 3 && stage !== 'result' ? 'Pitch mark: orange = play to leg · yellow = straight · blue = off' : '')

  return <div ref={root} className={'hud' + (bowling ? ' bowling' : '')} hidden={!visible} inert={active ? undefined : ''}>
    <div className="pitch-input" aria-label={bowling ? 'Pitch. Drag to aim the delivery.' : 'Batting pitch'} onPointerDown={begin} onPointerMove={aim} onPointerUp={release}
      onPointerCancel={cancel} onLostPointerCapture={cancel} />
    {labels && <div className="field-labels">{match.current?.fielders.map((f, i) => { const [x, y] = match.current.framePoint(f.x, f.y); return <span key={i} style={{ left: x / 9.6 + '%', top: y / 5.4 + '%' }}>{match.current.fieldPlan.names[i]}</span> })}</div>}
    {direction && <div className={'aim-zone ' + direction}>{direction === 'leg' ? '↖' : '↗'}</div>}
    <header className="score-header">
      <div className="scoreboard">
        <div className="scoreline">
          <div className="team-score"><span>{score.battingShort} <em>v {score.bowlingShort}</em></span><b>{score.score}<small>-{score.wickets}</small></b></div>
          <div><span>Overs</span><b>{score.overs}<small> / {score.maxOvers}</small></b></div>
          <div className="rate-stat"><span>{chasing ? 'Req. rate' : 'Run rate'}</span><b>{rate(chasing ? score.requiredRate : score.runRate)}</b></div>
          <div className="extra-stat"><span>Extras</span><b>{score.extras}</b></div>
        </div>
        <div className="chase-line">
          {chasing
            ? <b>Need {score.need} from {score.ballsLeft} ball{score.ballsLeft === 1 ? '' : 's'}</b>
            : <b>{score.label}</b>}
          <span className="over-balls" aria-label="This over">{score.over?.map((symbol, index) => <i key={index} className={ballClass(symbol)}>{symbol}</i>)}</span>
        </div>
      </div>
      <div className="player-names">
        <div className="batters">
          <p className="on-strike"><span>{score.striker?.name}</span><b>{score.striker?.runs}<small> ({score.striker?.balls})</small></b></p>
          <p><span>{score.partner?.name}</span><b>{score.partner?.runs}<small> ({score.partner?.balls})</small></b></p>
        </div>
        <div className="bowler-box"><span>{score.bowler ? `${score.bowler.name} · ${styleName[score.bowler.style] || ''}` : 'Bowler'}</span>
          <b>{score.bowler ? `${score.bowler.wickets}-${score.bowler.runs}` : '–'}<small>{score.bowler ? ` (${score.bowler.overs})` : ''}</small></b></div>
      </div>
      <button className="pause" aria-label="Pause game" onClick={pause}><i aria-hidden="true" /></button>
    </header>
    <aside className="field-radar" aria-label="Bowling field">
      <button type="button" className={'radar-ground' + (expanded ? ' enlarged' : '')} aria-label="Expand field map" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><svg viewBox="0 0 100 100" preserveAspectRatio="none">{score.wheel?.map(({ end, runs }, i) => <line key={i} x1="50" y1="57" x2={end[0]} y2={end[1]} stroke={runs >= 4 ? '#ffd75a' : '#e6f6dc'} strokeWidth="1.3" />)}</svg>{fielders.map(index => <i className="radar-dot" data-field-dot="" key={index} />)}<i className="radar-dot radar-ball" /></button>
      {score.powerplay && batting && <small className="powerplay">Powerplay: max 2 fielders outside the circle</small>}
      <strong className="radar-formation" /><small className="radar-status" role="status" />
    </aside>
    {replay && <div className="replay-badge" role="status"><i aria-hidden="true" />Replay<small>Tap to skip</small></div>}
    {score.lastLabel && !replay && <div key={score.ballId} className={'outcome' + (score.lastWicket ? ' wicket cheer' : ['FOUR!', 'SIX!'].includes(score.lastLabel) ? ' cheer' : '')} role="status">{score.lastLabel}<small>{score.milestone || score.lastDetail}</small></div>}
    {hint && <div className="coach-hint" role="status">{hint}</div>}

    {showPicker && <div className="bowler-picker" role="dialog" aria-label="Choose the bowler">
      <h3>Choose your bowler</h3>
      <div>{bowlerOptions.map(option => <button key={option.index} type="button" onClick={() => chooseBowler(option.index)}>
        <b>{option.name}</b><span className={'style-tag ' + option.style}>{styleName[option.style]}</span>
        <small>Skill {option.rating} · {option.wickets}-{option.runs} ({option.overs})</small>
      </button>)}</div>
    </div>}

    <footer className="thumb-deck">
      {bowling
        ? <div className="foot-controls" role="group" aria-label="Field setting">
          <ThumbButton className="field-button" action={() => match.current?.cycleField()} disabled={stage !== 'aim'}><small>Field</small>{score.planLabel}</ThumbButton>
        </div>
        : batting ? <Footwork key={visible ? score.ballId : 'closed'} match={match} /> : <div />}
      <div className={'timing-panel' + (bowling ? ' release' : '')} style={{ '--perfect-low': (50 - perfect) + '%', '--perfect-high': (50 + perfect) + '%' }} role="img"
        aria-label={bowling ? 'Release meter. Stop the marker in the green zone.' : 'Shot timing. Swing in the green centre for perfect contact.'}>
        <strong>{bowling ? 'Release meter' : batting ? 'Shot timing' : 'Watching'}</strong>
        <div className="timing-track"><i className="timing-marker" data-phase="ready" /></div>
        {bowling
          ? <div className="timing-labels"><span>Loose</span><span>Good</span><b>Perfect</b><span>No ball</span></div>
          : <div className="timing-labels"><span>Early</span><span>Good</span><b>Perfect</b><span>Good</span><span>Late</span></div>}
      </div>
      {bowling
        ? <div className="shot-controls bowl-controls" role="group" aria-label="Bowling controls">
          <div className="delivery-grid">{score.deliveries?.map((option, index) =>
            <ThumbButton key={option.id} aria-pressed={delivery === option.id} action={() => pickDelivery(option.id)} disabled={stage !== 'aim'}><kbd>{index + 1}</kbd>{option.label}</ThumbButton>)}</div>
          <ThumbButton className="hit" aria-label={bowlLabel} action={() => match.current?.bowlPress()} disabled={bowlDisabled}>{bowlLabel}</ThumbButton>
        </div>
        : batting ? <div className="shot-controls" role="group" aria-label="Batting controls">
          <div className="shot-switch">{['drive', 'loft'].map(type => <ThumbButton key={type} aria-pressed={shot === type} action={() => chooseShot(type)}>{type}</ThumbButton>)}</div>
          <ThumbButton className="hit" aria-label="Hit the ball" action={hit}>Hit</ThumbButton>
        </div> : <div />}
    </footer>
  </div>
}
