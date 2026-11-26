import { useEffect, useRef, useState } from 'react'

const fielders = Array.from({ length: 9 }, (_, index) => index)
const keyShots = { Space: 'straight', ArrowLeft: 'leg', ArrowRight: 'off' }
const perfectWindows = { Easy: 0.17, Medium: 0.12, Hard: 0.075 }
const vibrate = () => navigator.vibrate?.(12)

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

export default function MatchHud({ root, match, visible, active, team, difficulty, overs, score, runRate, shot, chooseShot, pause }) {
  const gesture = useRef(null)
  const [expanded,setExpanded]=useState(false)
  const [labels,setLabels]=useState(false)
  const [direction,setDirection]=useState(null)
  const hold=useRef()
  useEffect(()=>{if(!active){clearTimeout(hold.current);setLabels(false);setDirection(null);setExpanded(false)}},[active])

  useEffect(() => {
    if (!active) return
    function onKey(event) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || document.hidden) return
      const direction = keyShots[event.code]
      if (direction) {
        event.preventDefault()
        match.current?.swing(direction)
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
  }, [active, match])
  function begin(event) {
    if (!active || gesture.current || event.button !== 0) return
    hold.current=setTimeout(()=>{setLabels(true); if(gesture.current)gesture.current.used=true},380)
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { id: event.pointerId, startX: event.clientX, direction: 'straight', used: false, ball: match.current?.balls }
  }
  function aim(event) {
    const drag = gesture.current
    if (!drag || drag.id !== event.pointerId) return
    const delta = event.clientX - drag.startX
    if(Math.abs(delta)>12){clearTimeout(hold.current);setDirection(delta<0?'leg':'off')}
    drag.direction = delta < -24 ? 'leg' : delta > 24 ? 'off' : 'straight'
  }
  function release(event) {
    const drag = gesture.current
    if (!drag || drag.id !== event.pointerId) return
    aim(event)
    if (active && !drag.used && drag.ball === match.current?.balls) match.current?.swing(drag.direction)
    clearTimeout(hold.current);setLabels(false);setDirection(null)
    gesture.current = null
  }
  function cancel(event) {
    if (event.pointerId === gesture.current?.id){gesture.current=null;clearTimeout(hold.current);setLabels(false);setDirection(null)}
  }
  function hit() {
    const drag = gesture.current
    if (drag) drag.used = true
    match.current?.swing(drag?.direction ?? 'straight')
  }
  const perfect = (perfectWindows[difficulty] || perfectWindows.Medium) * 100 / .94
  return <div ref={root} className="hud" hidden={!visible} inert={active ? undefined : ''}>
    <div className="pitch-input" aria-label="Batting pitch" onPointerDown={begin} onPointerMove={aim} onPointerUp={release}
      onPointerCancel={cancel} onLostPointerCapture={cancel} />
    {labels && <div className="field-labels">{match.current?.fielders.map((f,i)=><span key={i} style={{left:f.x/9.6+'%',top:f.y/5.4+'%'}}>{match.current.fieldPlan.names[i]}</span>)}</div>}
    {direction && <div className={'aim-zone '+direction}>{direction==='leg'?'↖':'↗'}</div>}
    <header className="score-header">
      <div className="scoreline">
        <div className="team-score"><span>{team}</span><b>{score.score}<small> / {score.wickets}</small></b></div>
        <div><span>Overs</span><b>{score.overs}<small> / {overs}</small></b></div>
        <div><span>Run rate</span><b>{runRate}</b></div>
        <div className="extra-stat"><span>Extras</span><b>{score.extras}</b></div>
      </div>
      <div className="player-names">
        <div><span>Striker</span><b>{score.striker}</b></div>
        <div><span>Bowler</span><b>{score.bowler}</b></div>
      </div>
      <button className="pause" aria-label="Pause game" onClick={pause}><i aria-hidden="true"/></button>
    </header>
    <aside className="field-radar" aria-label="Bowling field">
      <button type="button" className={'radar-ground'+(expanded?' enlarged':'')} aria-label="Expand field map" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><svg viewBox="0 0 100 100" preserveAspectRatio="none">{score.wheel?.map(({end,runs},i)=><line key={i} x1="50" y1="57" x2={end[0]} y2={end[1]} stroke={runs>=4?'#ffd75a':'#e6f6dc'} strokeWidth="1.3"/>)}</svg>{fielders.map(index => <i className="radar-dot" data-field-dot="" key={index} />)}<i className="radar-dot radar-ball" /></button>
      {score.powerplay && <small className="powerplay">Powerplay: max 2 fielders outside the circle</small>}
      <strong className="radar-formation" /><small className="radar-status" role="status" />
    </aside>
    {score.lastLabel && <div key={score.balls} className={'outcome' + (score.lastWicket ? ' wicket cheer' : ['FOUR!','SIX!'].includes(score.lastLabel)?' cheer':'')} role="status">{score.lastLabel}<small>{score.milestone ? score.milestone+" runs for the team!" : score.lastWicket ? "The fielders celebrate!" : score.lastLabel==="SIX!" ? "Over the rope on the full!" : score.lastLabel==="FOUR!" ? "Finds the boundary!" : ""}</small></div>}
    <footer className="thumb-deck">
      <Footwork key={visible ? score.balls : 'closed'} match={match} />
      <div className="timing-panel" style={{ '--perfect-low': (50 - perfect) + '%', '--perfect-high': (50 + perfect) + '%' }} role="img" aria-label="Shot timing. Swing in the green centre for perfect contact.">
        <strong>Shot timing</strong>
        <div className="timing-track"><i className="timing-marker" data-phase="ready"/></div>
        <div className="timing-labels"><span>Early</span><span>Good</span><b>Perfect</b><span>Good</span><span>Late</span></div>
      </div>
      <div className="shot-controls" role="group" aria-label="Batting controls">
        <div className="shot-switch">{['drive', 'loft'].map(type => <ThumbButton key={type} aria-pressed={shot === type} action={() => chooseShot(type)}>{type}</ThumbButton>)}</div>
        <ThumbButton className="hit" aria-label="Hit the ball" action={hit}>Hit</ThumbButton>
      </div>
    </footer>
  </div>
}
