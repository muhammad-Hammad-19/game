import { useEffect, useRef, useState } from 'react'
import { TEAM_LIST, teamById, teamByName, kitColor } from '../data/teams.js'
import { PITCHES, pitchById } from '../data/pitches.js'
import { BATS, LOOKS } from '../data/shop.js'
import { ACHIEVEMENTS } from '../data/achievements.js'
import { levelInfo } from '../data/profile.js'
import { cupRoundName, describeFixture, nextFixture, standings } from '../data/competitions.js'
import { playSound } from '../game/sounds.js'

export function Choices({ label, values, selected, onChoose, names }) {
  return <fieldset className="choices"><legend>{label}</legend><div>
    {values.map(value => <button key={value} type="button" aria-pressed={selected === value} onClick={() => onChoose(value)}>{names?.[value] ?? value}</button>)}
  </div></fieldset>
}

export function TeamBadge({ team, small }) {
  return <span className={'team-badge' + (small ? ' small' : '')} style={{ '--kit': kitColor(team) }}><i aria-hidden="true" />{small ? team.short : team.name}</span>
}

function TeamSelect({ label, value, onChange, exclude, allowRandom }) {
  return <label className="team-field">{label}<select value={value} onChange={event => onChange(event.target.value)}>
    {allowRandom && <option value="Random">Random opponent</option>}
    {TEAM_LIST.filter(team => team.name !== exclude).map(team => <option key={team.id} value={team.name}>{team.name} · BAT {team.batting} · BOWL {team.bowling}</option>)}
  </select></label>
}

export function LevelChip({ profile }) {
  const info = levelInfo(profile.xp)
  return <div className="level-chip" title={`${info.into} / ${info.span} XP`}>
    <b>Lv {info.level}</b><i><i style={{ width: Math.round(info.progress * 100) + '%' }} /></i>
    <span className="coins"><i aria-hidden="true" />{profile.coins}</span>
  </div>
}

export function Home({ settings, profile, go, ready }) {
  const cup = profile.cup && !profile.cup.done
  const league = profile.league && !profile.league.done
  return <>
    <section className="home-body">
      <h1>Boundary<br /><span>Bash</span><i className="title-stripes" aria-hidden="true" /></h1>
      <p>Bat, bowl and chase with the {settings.team}. Full matches, a knockout cup, a league career and online duels.</p>
      <div className="mode-grid">
        <button className="primary play-match" onClick={() => go('setup')}><i className="play-icon" aria-hidden="true" />Quick match</button>
        <button className="mode" onClick={() => go('cup')}><b>Champions Cup</b><small>{cup ? `Resume · ${cupRoundName(profile.cup.round)}` : '8 teams, knockout'}</small></button>
        <button className="mode" onClick={() => go('league')}><b>Career league</b><small>{league ? `Resume · Season ${profile.league.season}` : 'Full season + final'}</small></button>
        <button className="mode" onClick={() => go('online')}><b>Online duel</b><small>Play a friend with a room code</small></button>
      </div>
    </section>
    <footer className="club-footer">
      <div><span>Record</span><b>{profile.stats.wins}<small> W</small> {profile.stats.losses}<small> L</small></b></div>
      <div><span>High score</span><b>{profile.stats.highScore}</b></div>
      <div><span>Best total</span><b>{profile.stats.bestTotal}</b></div>
      <div><span>{ready ? 'Opponent' : 'Loading'}</span><b>{ready ? settings.difficulty : '…'}</b></div>
    </footer>
  </>
}

const PITCH_NAMES = { Random: 'Random', flat: 'Flat', green: 'Green', dusty: 'Dusty' }

export function Setup({ mode, settings, setOption, ready, failed, onStart, busy }) {
  const competition = mode !== 'quick'
  const title = mode === 'cup' ? 'Champions Cup' : mode === 'league' ? 'Career league' : 'Match setup'
  const overs = competition ? [2, 5, 10] : [1, 2, 5, 10, 20]
  const chosenOvers = overs.includes(settings.overs) ? settings.overs : overs[0]
  useEffect(() => { if (chosenOvers !== settings.overs) setOption('overs', chosenOvers) }, [chosenOvers, settings.overs, setOption])
  const team = teamByName(settings.team)
  return <section className="menu-card setup">
    <h2>{title}</h2>
    {competition && <p className="hint tight">{mode === 'cup' ? 'Win three knockout matches to lift the cup.' : 'Seven league matches, then the top two meet in the final.'}</p>}
    <div className="setup-grid">
      <Choices label="Overs" values={overs} selected={chosenOvers} onChoose={value => setOption('overs', value)} />
      <Choices label="Opponent skill" values={['Easy', 'Medium', 'Hard']} selected={settings.difficulty} onChoose={value => setOption('difficulty', value)} />
      <TeamSelect label="Your team" value={settings.team} onChange={value => setOption('team', value)} />
      {competition
        ? <div className="team-rating"><TeamBadge team={team} /><span>BAT <b>{team.batting}</b></span><span>BOWL <b>{team.bowling}</b></span></div>
        : <TeamSelect label="Opponent" value={settings.opponent === settings.team ? 'Random' : settings.opponent} onChange={value => setOption('opponent', value)} exclude={settings.team} allowRandom />}
      {!competition && <Choices label="Pitch" values={['Random', 'flat', 'green', 'dusty']} names={PITCH_NAMES} selected={settings.pitchType || 'Random'} onChoose={value => setOption('pitchType', value)} />}
      <Choices label="When you bowl" values={['Play', 'Auto']} names={{ Play: 'I bowl', Auto: 'Simulate' }} selected={settings.bowling || 'Play'} onChoose={value => setOption('bowling', value)} />
      {failed ? <button className="primary wide" onClick={() => window.location.reload()}>Retry loading</button>
        : <button className="primary wide" onClick={onStart} disabled={!ready || busy}>{!ready ? 'Loading field…' : competition ? 'Start competition' : 'Go to the toss'}</button>}
    </div>
    {failed && <p className="hint" role="alert">The field could not load. Check your connection and retry.</p>}
  </section>
}

export function Toss({ user, opp, pitch, fixed, title, onDone }) {
  // fixed: { userWon, userBats } when the toss was decided elsewhere (online).
  const [step, setStep] = useState(fixed ? 'flip' : 'call')
  const [outcome, setOutcome] = useState(fixed ? { face: 'heads', userWon: fixed.userWon, userBats: fixed.userBats } : null)
  const timer = useRef()
  const surface = pitchById(pitch)
  useEffect(() => {
    if (fixed) {
      playSound('toss')
      timer.current = setTimeout(() => setStep('done'), 1700)
    }
    return () => clearTimeout(timer.current)
  }, [fixed])

  function call(face) {
    playSound('toss')
    const landed = Math.random() < 0.5 ? 'heads' : 'tails'
    const userWon = landed === face
    let userBats = null
    if (!userWon) {
      // The computer leans on the surface: bowl first on a green top, bat first on a dry one.
      const batFirst = Math.random() < (surface.id === 'green' ? 0.35 : surface.id === 'dusty' ? 0.65 : 0.5)
      userBats = !batFirst
    }
    setOutcome({ face: landed, userWon, userBats })
    setStep('flip')
    timer.current = setTimeout(() => setStep(userWon ? 'choose' : 'done'), 1700)
  }

  return <section className="menu-card toss">
    <p className="kicker">{title || 'The toss'}</p>
    <h2><TeamBadge team={user} small /> <em>v</em> <TeamBadge team={opp} small /></h2>
    <p className="pitch-report"><b>{surface.name}</b> {surface.blurb}</p>
    <div className={'coin ' + step + (outcome ? ' ' + outcome.face : '')} aria-hidden="true"><i>H</i><i>T</i></div>
    {step === 'call' && <div className="toss-actions"><p>Call it in the air</p>
      <button className="primary" onClick={() => call('heads')}>Heads</button>
      <button className="primary" onClick={() => call('tails')}>Tails</button></div>}
    {step === 'flip' && <p className="toss-status" role="status">The coin is up…</p>}
    {step === 'choose' && <div className="toss-actions"><p role="status">It's {outcome.face}. You won the toss!</p>
      <button className="primary" onClick={() => onDone(true)}>Bat first</button>
      <button className="primary" onClick={() => onDone(false)}>Bowl first</button></div>}
    {step === 'done' && <div className="toss-actions"><p role="status">
      {outcome.userWon ? `You won the toss and will ${outcome.userBats ? 'bat' : 'bowl'} first.` : `${opp.name} won the toss and chose to ${outcome.userBats ? 'bowl' : 'bat'} first.`}</p>
      <button className="primary" onClick={() => onDone(outcome.userBats)} autoFocus>Start match</button></div>}
  </section>
}

export function Scorecard({ innings }) {
  const batted = innings.batters.filter(batter => batter.batted)
  const yetToBat = innings.batters.filter(batter => !batter.batted)
  const bowlers = innings.bowlers.filter(bowler => bowler.balls > 0 || bowler.runs > 0)
  return <div className="scorecard">
    <div className="card-head"><b>{innings.battingName}</b><span>{innings.label}</span><strong>{innings.score}-{innings.wickets} <small>({innings.oversText} ov)</small></strong></div>
    <table>
      <thead><tr><th>Batter</th><th></th><th>R</th><th>B</th><th>4s</th><th>6s</th></tr></thead>
      <tbody>
        {batted.map((batter, index) => <tr key={index}>
          <td>{batter.name}</td><td className="how">{batter.out || 'not out'}</td>
          <td><b>{batter.runs}</b></td><td>{batter.balls}</td><td>{batter.fours}</td><td>{batter.sixes}</td></tr>)}
        <tr className="extras-row"><td>Extras</td><td className="how">{innings.wides} wd, {innings.noBalls} nb</td><td><b>{innings.extras}</b></td><td colSpan="3" /></tr>
      </tbody>
    </table>
    {yetToBat.length > 0 && <p className="yet">Did not bat: {yetToBat.map(batter => batter.name).join(', ')}</p>}
    <table>
      <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th></tr></thead>
      <tbody>{bowlers.map((bowler, index) => <tr key={index}>
        <td>{bowler.name}</td><td>{Math.floor(bowler.balls / 6)}.{bowler.balls % 6}</td><td>{bowler.maidens}</td><td>{bowler.runs}</td><td><b>{bowler.wickets}</b></td></tr>)}</tbody>
    </table>
  </div>
}

function CardTabs({ list }) {
  const [tab, setTab] = useState(list.length - 1)
  const index = Math.min(tab, list.length - 1)
  return <div className="card-tabs">
    {list.length > 1 && <div className="tabs" role="tablist">{list.map((innings, i) =>
      <button key={i} role="tab" aria-selected={index === i} onClick={() => setTab(i)}>{innings.battingShort} {innings.label.replace(' innings', '')}</button>)}</div>}
    <Scorecard innings={list[index]} />
  </div>
}

export function InningsBreak({ view, onContinue, busy }) {
  return <section className="menu-card break">
    <div className="break-side">
      <p className="kicker">{view.kicker}</p>
      <h2>{view.title}</h2>
      <p className="break-text">{view.text}</p>
      {view.target != null && <p className="target-chip">Target <b>{view.target}</b><small> from {view.overs} over{view.overs === 1 ? '' : 's'}</small></p>}
      <button className="primary" onClick={onContinue} disabled={busy} autoFocus>{busy ? 'Preparing…' : view.button}</button>
    </div>
    {view.innings.length > 0 && <CardTabs list={view.innings} />}
  </section>
}

export function Result({ view, onAgain, onHome, onContinue }) {
  return <section className={'menu-card results ' + view.result}>
    <div className="result-side">
      <p className="kicker">{view.kicker}</p>
      <h2>{view.headline}</h2>
      <p className="break-text">{view.summary}</p>
      <ul className="rewards">
        {view.rewards.lines.map((line, index) => <li key={index}><span>{line.label}</span><b>+{line.xp} XP</b><i className="coins"><i aria-hidden="true" />{line.coins}</i></li>)}
        <li className="total"><span>Total</span><b>+{view.rewards.xp} XP</b><i className="coins"><i aria-hidden="true" />{view.rewards.coins}</i></li>
      </ul>
      {view.levelUp && <p className="level-up">Level up! You are now level {view.levelUp}.</p>}
      {view.achievements.length > 0 && <ul className="unlocked">{view.achievements.map(item =>
        <li key={item.id}><b>{item.title}</b><span>{item.text}</span><i className="coins"><i aria-hidden="true" />{item.coins}</i></li>)}</ul>}
      <div className="result-actions">
        {onContinue ? <button className="primary" onClick={onContinue} autoFocus>{view.continueLabel || 'Continue'}</button>
          : <button className="primary" onClick={onAgain} autoFocus>Play again</button>}
        <button className="secondary" onClick={onHome}>Main menu</button>
      </div>
    </div>
    <CardTabs list={view.innings} />
  </section>
}

export function CompetitionScreen({ competition, onPlay, onAbandon, onNew, busy }) {
  const fixture = nextFixture(competition)
  const user = teamById(competition.userTeam)
  const champion = competition.champion && teamById(competition.champion)
  const opponent = fixture && teamById(fixture.a === competition.userTeam ? fixture.b : fixture.a)
  const won = competition.done && competition.champion === competition.userTeam
  return <section className="menu-card competition">
    <div className="break-side">
      <p className="kicker">{competition.type === 'cup' ? 'Champions Cup' : `Career · Season ${competition.season}`} · {competition.overs} overs · {competition.difficulty}</p>
      {competition.done
        ? <><h2>{won ? 'Champions!' : `${champion.name} win it`}</h2>
          <p className="break-text">{won ? `The ${user.name} lift the trophy.` : competition.type === 'cup' ? 'Your cup run is over. Go again?' : 'The season is complete.'}</p>
          <button className="primary" onClick={onNew} autoFocus>{competition.type === 'cup' ? 'New cup' : 'Next season'}</button></>
        : fixture
          ? <><h2>{describeFixture(competition)}</h2>
            <p className="break-text"><TeamBadge team={user} small /> <em>v</em> <TeamBadge team={opponent} small /><br />{PITCHES[fixture.pitch].name}: {PITCHES[fixture.pitch].blurb}</p>
            <button className="primary" onClick={onPlay} disabled={busy} autoFocus>Play match</button></>
          : <><h2>Knocked out</h2><p className="break-text">The cup carries on without you.</p></>}
      <button className="secondary" onClick={onAbandon}>{competition.done ? 'Main menu' : 'Abandon competition'}</button>
    </div>
    {competition.type === 'cup'
      ? <div className="bracket">{competition.rounds.map((round, index) => <div key={index}>
        <h3>{cupRoundName(index)}</h3>
        {round.map((match, i) => <div key={i} className={'tie' + (match.a === competition.userTeam || match.b === competition.userTeam ? ' mine' : '')}>
          {[match.a, match.b].map(id => <p key={id} className={match.winner === id ? 'won' : match.winner ? 'lost' : ''}><TeamBadge team={teamById(id)} small /></p>)}
          {match.text && <small>{match.text}</small>}
        </div>)}
      </div>)}</div>
      : <div className="league-table"><table>
        <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>NRR</th><th>Pts</th></tr></thead>
        <tbody>{standings(competition).map((row, index) => <tr key={row.id} className={row.id === competition.userTeam ? 'mine' : ''}>
          <td>{index + 1}</td><td><TeamBadge team={teamById(row.id)} small /></td><td>{row.played}</td><td>{row.won}</td><td>{row.lost}</td>
          <td>{row.nrr >= 0 ? '+' : ''}{row.nrr.toFixed(2)}</td><td><b>{row.points}</b></td></tr>)}</tbody>
      </table>
      {competition.final && <p className="yet">Final: {teamById(competition.final.a).name} v {teamById(competition.final.b).name}{competition.final.text ? ` · ${competition.final.text}` : ''}</p>}
      </div>}
  </section>
}

export function Shop({ profile, buy, equip, onDone }) {
  const level = levelInfo(profile.xp).level
  function Item({ kind, item, equipped }) {
    const key = `${kind}:${item.id}`
    const owned = profile.owned.includes(key)
    const locked = level < item.level
    return <li className={equipped ? 'equipped' : ''}>
      {kind === 'bat'
        ? <i className="swatch bat" style={{ background: `linear-gradient(90deg, ${item.colors[0]}, ${item.colors[1]} 55%, ${item.colors[2]})` }} aria-hidden="true" />
        : <i className="swatch look" style={{ filter: item.filter }} aria-hidden="true" />}
      <div><b>{item.name}</b><span>{item.blurb}{kind === 'bat' && (item.timing || item.power) ? ` Timing +${Math.round(item.timing * 100)}%, power +${Math.round(item.power * 100)}%.` : ''}</span></div>
      {equipped ? <em>Equipped</em>
        : owned ? <button className="secondary" onClick={() => equip(kind, item.id)}>Equip</button>
          : locked ? <em>Level {item.level}</em>
            : <button className="primary" onClick={() => buy(kind, item)} disabled={profile.coins < item.price}><i className="coins"><i aria-hidden="true" />{item.price}</i></button>}
    </li>
  }
  return <section className="menu-card shop">
    <h2>Kit room</h2>
    <div className="shop-columns">
      <div><h3>Bats</h3><ul>{BATS.map(item => <Item key={item.id} kind="bat" item={item} equipped={profile.bat === item.id} />)}</ul></div>
      <div><h3>Broadcast look</h3><ul>{LOOKS.map(item => <Item key={item.id} kind="look" item={item} equipped={profile.look === item.id} />)}</ul></div>
    </div>
    <button className="primary" onClick={onDone}>Done</button>
  </section>
}

export function ProfileScreen({ profile, onDone }) {
  const info = levelInfo(profile.xp)
  const stats = profile.stats
  const average = stats.matches ? (stats.runs / stats.matches).toFixed(1) : '0.0'
  const strike = stats.ballsFaced ? (stats.runs * 100 / stats.ballsFaced).toFixed(0) : '0'
  const economy = stats.ballsBowled ? (stats.runsConceded * 6 / stats.ballsBowled).toFixed(2) : '–'
  const rows = [
    ['Matches', stats.matches], ['Won', stats.wins], ['Lost', stats.losses], ['Tied', stats.ties],
    ['Runs', stats.runs], ['Runs per match', average], ['Strike rate', strike], ['High score', stats.highScore],
    ['Fours', stats.fours], ['Sixes', stats.sixes], ['Fifties', stats.fifties], ['Hundreds', stats.hundreds],
    ['Wickets', stats.wickets], ['Economy', economy], ['Best bowling', stats.bestWickets ? `${stats.bestWickets}-${stats.bestWicketsRuns}` : '–'], ['Hat-tricks', stats.hatTricks],
    ['Cups won', stats.cups], ['League titles', stats.leagues], ['Super overs won', stats.superOverWins], ['Online wins', stats.onlineWins],
  ]
  const earned = ACHIEVEMENTS.filter(item => profile.achievements[item.id]).length
  return <section className="menu-card profile">
    <div className="profile-head"><h2>Career</h2>
      <p>Level {info.level} · {info.into} / {info.span} XP · {earned} of {ACHIEVEMENTS.length} achievements</p></div>
    <div className="shop-columns">
      <dl className="stat-grid">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <ul className="achievement-list">{ACHIEVEMENTS.map(item => <li key={item.id} className={profile.achievements[item.id] ? 'earned' : ''}>
        <i aria-hidden="true" /><div><b>{item.title}</b><span>{item.text}</span></div><em className="coins"><i aria-hidden="true" />{item.coins}</em></li>)}</ul>
    </div>
    <button className="primary" onClick={onDone}>Done</button>
  </section>
}

export function SettingsScreen({ settings, setOption, onDone, canInstall, install, fullscreen }) {
  const toggle = (name, label, fallback = true) => {
    const on = settings[name] ?? fallback
    return <button className="setting-row" aria-pressed={on} onClick={() => setOption(name, !on)}>{label} <b>{on ? 'On' : 'Off'}</b></button>
  }
  return <section className="menu-card settings">
    <h2>Settings</h2>
    <div className="settings-grid">
      {toggle('sound', 'Sound effects')}
      {toggle('crowd', 'Crowd ambience')}
      {toggle('commentary', 'Commentary text')}
      {toggle('voice', 'Spoken commentary', false)}
      {toggle('replays', 'Action replays')}
      {toggle('pitchHint', 'Pitch map hint')}
      <Choices label="Camera" values={['Dynamic', 'Static']} selected={settings.camera || 'Dynamic'} onChoose={value => setOption('camera', value)} />
      <Choices label="Graphics" values={['High', 'Low']} selected={settings.quality || 'High'} onChoose={value => setOption('quality', value)} />
      <Choices label="Players" values={['3D', 'Sprites']} names={{ '3D': '3D models' }} selected={settings.quality === 'Low' ? 'Sprites' : settings.players || '3D'} onChoose={value => setOption('players', value)} />
    </div>
    <p className="hint">Batting: swipe or use ← → to place the shot, Space to play straight, ↑ to switch drive and loft. Bowling: drag on the pitch to aim, pick a delivery, tap Bowl, then tap again in the green zone.</p>
    <div className="settings-extra">
      {document.fullscreenEnabled && <button className="secondary" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : fullscreen())}>Toggle full screen</button>}
      {canInstall && <button className="secondary" onClick={install}>Install the game</button>}
    </div>
    <button className="primary" onClick={onDone}>Done</button>
  </section>
}
