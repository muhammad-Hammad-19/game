import { useEffect, useRef, useState } from 'react'
import { TEAM_LIST, teamByName } from '../data/teams.js'
import { PITCH_IDS } from '../data/pitches.js'
import { cleanCode, makeCode, openLink } from '../net/transport.js'
import { Choices, TeamBadge } from './screens.jsx'

// Lobby for a two-player match. Calls onStart(link, config) once both players are in
// and the host has started; the link is then owned by the caller.
export default function Online({ settings, onStart, onBack }) {
  const [mode, setMode] = useState('menu')
  const [code, setCode] = useState('')
  const [entry, setEntry] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [peerTeam, setPeerTeam] = useState(null)
  const [overs, setOvers] = useState([1, 2, 5].includes(settings.overs) ? settings.overs : 2)
  const link = useRef(null)
  const handed = useRef(false)
  const myTeam = teamByName(settings.team)

  useEffect(() => () => { if (!handed.current) link.current?.close() }, [])

  function reset(message = '') {
    link.current?.close()
    link.current = null
    setPeerTeam(null)
    setStatus('')
    setError(message)
    setMode('menu')
  }

  function wire(connection, host) {
    link.current = connection
    connection.on('open', () => {
      setStatus(host ? 'Opponent connected.' : 'Connected. Waiting for the host to start.')
      connection.send({ t: 'hello', team: myTeam.id })
    })
    connection.on('close', failure => reset(failure?.message || 'The other player left the room.'))
    connection.on('message', message => {
      if (message.t === 'hello') setPeerTeam(message.team)
      else if (message.t === 'start' && !host) {
        handed.current = true
        onStart(connection, { ...message.config, host: false })
      }
    })
  }

  async function create() {
    setError('')
    setMode('host')
    setStatus('Opening a room…')
    const roomCode = makeCode()
    try {
      const connection = await openLink(roomCode, true)
      setCode(roomCode)
      setStatus('Share this code with your friend.')
      wire(connection, true)
    } catch (failure) {
      reset(failure.message)
    }
  }

  async function join() {
    const roomCode = cleanCode(entry)
    if (roomCode.length < 5) { setError('Enter the 5-character room code.'); return }
    setError('')
    setMode('guest')
    setCode(roomCode)
    setStatus('Joining the room…')
    try {
      wire(await openLink(roomCode, false), false)
    } catch (failure) {
      reset(failure.message)
    }
  }

  function start() {
    // If both picked the same club, the guest is moved to the next one in the list.
    const guestTeam = shifted ? shifted.id : peerTeam
    const config = {
      overs, hostTeam: myTeam.id, guestTeam, hostBatsFirst: Math.random() < 0.5, hostWonToss: Math.random() < 0.5,
      pitch: PITCH_IDS[Math.floor(Math.random() * PITCH_IDS.length)], seed: (Math.random() * 2 ** 32) >>> 0,
    }
    link.current.send({ t: 'start', config })
    handed.current = true
    onStart(link.current, { ...config, host: true })
  }

  // Two players on the same club: the guest is shown, and plays as, the next club along.
  const hostTeamId = mode === 'host' ? myTeam.id : peerTeam
  const guestTeamId = mode === 'host' ? peerTeam : myTeam.id
  const shifted = hostTeamId && hostTeamId === guestTeamId ? TEAM_LIST[(TEAM_LIST.findIndex(team => team.id === guestTeamId) + 1) % TEAM_LIST.length] : null
  const mine = mode === 'guest' && shifted ? shifted : myTeam
  const opponent = mode === 'host' && shifted ? shifted : peerTeam && TEAM_LIST.find(team => team.id === peerTeam)
  return <section className="menu-card online">
    <h2>Online duel</h2>
    {mode === 'menu' && <>
      <p className="hint tight">One of you creates a room and shares the code. One bats while the other bowls, then you swap for the chase. You play as the <b>{myTeam.name}</b>.</p>
      <div className="online-actions">
        <button className="primary" onClick={create}>Create a room</button>
        <div className="join-row">
          <input value={entry} onChange={event => setEntry(cleanCode(event.target.value))} placeholder="ROOM CODE" aria-label="Room code" maxLength={5} autoCapitalize="characters" autoComplete="off" spellCheck="false"
            onKeyDown={event => { if (event.key === 'Enter') join() }} />
          <button className="primary" onClick={join}>Join</button>
        </div>
      </div>
    </>}
    {mode !== 'menu' && <>
      <p className="room-code" aria-label="Room code">{code || '· · · · ·'}</p>
      <p className="toss-status" role="status">{status}</p>
      {opponent && <p className="break-text"><TeamBadge team={mine} small /> <em>v</em> <TeamBadge team={opponent} small /></p>}
      {mode === 'host' && <Choices label="Overs" values={[1, 2, 5]} selected={overs} onChoose={setOvers} />}
      {mode === 'host' && <button className="primary wide" onClick={start} disabled={!opponent}>{opponent ? 'Start match' : 'Waiting for opponent…'}</button>}
    </>}
    {error && <p className="hint" role="alert">{error}</p>}
    <button className="secondary wide" onClick={() => { link.current?.close(); link.current = null; onBack() }}>Back</button>
  </section>
}
