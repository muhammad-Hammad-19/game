// Fictional clubs. Ratings run 0-99. `st` is the bowling style, when a player bowls.
const BAT_TEMPLATE = [84, 82, 87, 81, 77, 73, 68, 47, 40, 33, 27]
const BOWL_TEMPLATE = [18, 22, 26, 38, 8, 71, 75, 80, 85, 82, 78]
const ROLE_TEMPLATE = ['BAT', 'BAT', 'BAT', 'BAT', 'WK', 'AR', 'AR', 'BWL', 'BWL', 'BWL', 'BWL']
const STYLE_TEMPLATE = [null, null, null, 'spin', null, 'spin', 'pace', 'spin', 'pace', 'pace', 'spin']

function squad(names, strength, seed) {
  return names.map((n, index) => {
    // A fixed wobble keeps every squad a little different without random drift between sessions.
    const wobble = ((seed * 31 + index * 17) % 9) - 4
    const bat = Math.max(15, Math.min(96, BAT_TEMPLATE[index] + strength + wobble))
    const bowl = Math.max(5, Math.min(96, BOWL_TEMPLATE[index] + strength - wobble))
    return { n, role: ROLE_TEMPLATE[index], bat, bowl, st: STYLE_TEMPLATE[index] }
  })
}

function team(id, name, short, kit, strength, names) {
  const players = squad(names, strength, id.length * 7 + name.length)
  const batting = Math.round(players.slice(0, 7).reduce((sum, p) => sum + p.bat, 0) / 7)
  const bowlers = players.filter(p => p.st && p.bowl > 60)
  const bowling = Math.round(bowlers.reduce((sum, p) => sum + p.bowl, 0) / bowlers.length)
  return { id, name, short, kit, players, batting, bowling, overall: Math.round((batting + bowling) / 2) }
}

export const TEAM_LIST = [
  team('hawks', 'Harbor Hawks', 'HAW', { shirt: 0x1b4cb0, shadow: 0x11264e, highlight: 0x4a80dc, trim: 0x76c9fc }, 1,
    ['A. Malik', 'T. Silva', 'J. Reed', 'R. Khan', 'M. Ali', 'D. Cole', 'S. Roy', 'K. Fox', 'I. Noor', 'Z. Mir', 'O. Blake']),
  team('foxes', 'Desert Foxes', 'FOX', { shirt: 0xd9731c, shadow: 0x7a3a10, highlight: 0xf2a155, trim: 0x2b1a0e }, 0,
    ['H. Qureshi', 'B. Santos', 'L. Mensah', 'P. Varga', 'E. Okoro', 'C. Dane', 'F. Aziz', 'G. Ibarra', 'W. Tanaka', 'Y. Haddad', 'V. Ross']),
  team('kings', 'Metro Kings', 'KNG', { shirt: 0xdddfe3, shadow: 0x868f9f, highlight: 0xf9f8ef, trim: 0x384653 }, 2,
    ['N. Sharma', 'O. Bennett', 'K. Adeyemi', 'R. Castell', 'T. Whitlock', 'S. Gill', 'J. Moreau', 'A. Petrov', 'D. Nakamura', 'M. Osei', 'L. Farrow']),
  team('sharks', 'Coastal Sharks', 'SHK', { shirt: 0x159a8c, shadow: 0x0b4f49, highlight: 0x4fd0c0, trim: 0xf5e663 }, -1,
    ['C. Rivera', 'U. Farooq', 'B. Lindqvist', 'M. Thorne', 'S. Pillai', 'E. Vance', 'Q. Abbas', 'R. Kowal', 'J. Ferreira', 'T. Iqbal', 'N. Drummond']),
  team('stags', 'Highland Stags', 'STG', { shirt: 0x237a3c, shadow: 0x103d1f, highlight: 0x55b86d, trim: 0xf2c94c }, -2,
    ['F. MacRae', 'H. Sodhi', 'P. Lennox', 'A. Rahimi', 'G. Burrows', 'I. Chowdhury', 'W. Craig', 'D. Mbeki', 'S. Hartley', 'K. Zaman', 'R. Ellery']),
  team('rhinos', 'River Rhinos', 'RHI', { shirt: 0x6b3fb0, shadow: 0x36205e, highlight: 0x9a73dc, trim: 0xffd166 }, 3,
    ['Z. Hussain', 'M. Okafor', 'T. Brandt', 'V. Menon', 'L. Pereira', 'J. Sato', 'B. Yusuf', 'C. Novak', 'E. Rana', 'A. Kessler', 'O. Dlamini']),
  team('comets', 'Capital Comets', 'COM', { shirt: 0xe3b81f, shadow: 0x7d6410, highlight: 0xf6d95f, trim: 0x1d3a8a }, 0,
    ['R. Anand', 'S. Whitmore', 'K. Bashir', 'D. Laurent', 'N. Perera', 'H. Strand', 'M. Vohra', 'P. Akhtar', 'G. Sinclair', 'F. Mahlangu', 'T. Ortega']),
  team('storm', 'Island Storm', 'STM', { shirt: 0x8e1f3a, shadow: 0x4a0f1f, highlight: 0xc2506a, trim: 0xf4d7a1 }, -1,
    ['J. Baptiste', 'A. Latif', 'C. Reyes', 'W. Samuels', 'K. Naidoo', 'D. Fonseka', 'R. Marlow', 'S. Bhatti', 'L. Garner', 'M. Thapa', 'E. Solis']),
]

export const TEAMS = TEAM_LIST.map(entry => entry.name)
const byId = new Map(TEAM_LIST.map(entry => [entry.id, entry]))
const byName = new Map(TEAM_LIST.map(entry => [entry.name, entry]))

export const teamById = id => byId.get(id) || TEAM_LIST[0]
export const teamByName = name => byName.get(name) || TEAM_LIST[0]
export const kitColor = entry => '#' + entry.kit.shirt.toString(16).padStart(6, '0')
export const UMPIRE_KIT = { shirt: 0xc03843, shadow: 0x60242c, highlight: 0xe47578, trim: 0xf6e1ce }
