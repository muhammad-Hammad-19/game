// Short broadcast lines. {b} is the batter, {w} the bowler.
const LINES = {
  dot: ['Good ball, no run.', 'Straight to the fielder.', '{w} keeps it tight.', 'Defended back down the pitch.', 'Beaten! That one fizzed past the edge.', 'Dot ball. Pressure building.'],
  leave: ['Left alone outside off.', 'Good judgement from {b}.', '{b} shoulders arms.'],
  1: ['Pushed away for a single.', 'Quick single, well run.', 'Worked into the gap for one.', 'Rotates the strike.'],
  2: ['They come back for two.', 'Good running, two more.', 'Placed in the gap, two runs.'],
  3: ['Hauled in just inside the rope. Three.', 'Great running, they get three!'],
  4: ['FOUR! Races away to the fence.', 'Cracking shot from {b}! Four.', 'Pierces the gap. Four runs.', 'No need to run for those!', 'Timed to perfection, four.'],
  6: ['SIX! That is massive from {b}!', 'Into the crowd! Six runs.', 'High, handsome and out of here!', 'Clean as a whistle. Maximum!', '{b} has sent that into orbit!'],
  bowled: ['BOWLED HIM! The stumps are a mess!', 'Through the gate! {b} has to go.', 'Timber! What a ball from {w}!'],
  lbw: ['Huge appeal... and given! LBW.', 'Trapped in front. The finger goes up.', 'Plumb! {b} is gone, leg before.'],
  caught: ['In the air... and taken! {b} is out.', 'Caught! {w} gets the breakthrough.', 'Straight down the fielder\'s throat.', 'Edged and taken!'],
  runout: ['Direct hit! Run out!', 'Mix-up in the middle and {b} is run out!', 'Short of the crease. That is out.'],
  wide: ['Wide ball. Too far for the umpire.', 'Wayward from {w}. Wide called.'],
  noball: ['No ball! {w} has overstepped.', 'Overstepped. That will cost a run.'],
  fifty: ['FIFTY for {b}! A terrific knock.', 'Half-century! {b} raises the bat.'],
  hundred: ['A magnificent HUNDRED for {b}!', 'CENTURY! {b}, take a bow!'],
  over: ['End of the over.', 'That is the over.', 'Change of ends.'],
  maiden: ['A maiden over from {w}. Superb.'],
  hattrick: ['HAT-TRICK! {w} has three in three!'],
  tight: ['This is going down to the wire!', 'What a finish we have here!', 'Nerves jangling all around the ground.'],
  won: ['And that is the match!', 'Victory sealed!'],
}

export function commentate(key, rng, { batter = 'the batter', bowler = 'the bowler' } = {}) {
  const pool = LINES[key]
  if (!pool) return ''
  return pool[Math.floor(rng() * pool.length)].replaceAll('{b}', batter).replaceAll('{w}', bowler)
}

let voice
let enabled = false

export function setVoice(on) {
  enabled = Boolean(on) && typeof window !== 'undefined' && 'speechSynthesis' in window
  if (!enabled && typeof window !== 'undefined') window.speechSynthesis?.cancel()
}

export function speak(text) {
  if (!enabled || !text) return
  try {
    const synth = window.speechSynthesis
    voice ||= synth.getVoices().find(v => /en[-_](GB|AU|IN)/i.test(v.lang)) || synth.getVoices().find(v => /^en/i.test(v.lang))
    synth.cancel()
    const line = new SpeechSynthesisUtterance(text)
    if (voice) line.voice = voice
    line.rate = 1.12
    line.pitch = 1.02
    line.volume = 0.9
    synth.speak(line)
  } catch { /* Speech is optional. */ }
}
