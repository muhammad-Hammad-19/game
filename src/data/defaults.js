import { TEAMS } from './teams.js'

export { TEAMS }
export const DEFAULT_SETTINGS = {
  overs: 2, difficulty: 'Medium', team: 'Harbor Hawks', opponent: 'Random', pitchType: 'Random', bowling: 'Play',
  sound: true, crowd: true, voice: false, commentary: true, replays: true, camera: 'Dynamic', quality: 'High', pitchHint: true,
}

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('boundary-bash-settings') || '{}')
    const settings = { ...DEFAULT_SETTINGS, ...saved }
    // Phones with little memory start on the lighter player sprites.
    if (!saved.quality && navigator.deviceMemory && navigator.deviceMemory <= 2) settings.quality = 'Low'
    if (!TEAMS.includes(settings.team)) settings.team = DEFAULT_SETTINGS.team
    return settings
  } catch { return { ...DEFAULT_SETTINGS } }
}
