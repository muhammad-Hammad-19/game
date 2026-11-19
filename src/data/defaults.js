export const DEFAULT_SETTINGS = { overs: 1, difficulty: 'Medium', team: 'Harbor Hawks', sound: true }
export const TEAMS = ['Harbor Hawks', 'Desert Foxes', 'Metro Kings']

export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('boundary-bash-settings') || '{}') } }
  catch { return DEFAULT_SETTINGS }
}
