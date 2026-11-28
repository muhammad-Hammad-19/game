// How each surface changes the contest. `window` scales the batter's perfect-timing
// window; `swing` and `turn` scale how far the ball moves; `edge` scales mistimed catches.
export const PITCHES = {
  flat: {
    id: 'flat', name: 'Flat deck', blurb: 'True bounce. A batting paradise.',
    window: 1.08, paceWindow: 1, spinWindow: 1, swing: 0.6, turn: 0.6, edge: 0.85, boundary: 1.1, tint: null,
  },
  green: {
    id: 'green', name: 'Green top', blurb: 'Grass on the surface. Swing and seam for the quicks.',
    window: 0.97, paceWindow: 0.88, spinWindow: 1, swing: 1.5, turn: 0.55, edge: 1.25, boundary: 0.96, tint: [58, 142, 62, 0.24],
  },
  dusty: {
    id: 'dusty', name: 'Dust bowl', blurb: 'Dry and cracked. It grips and turns for spinners.',
    window: 0.97, paceWindow: 1, spinWindow: 0.86, swing: 0.8, turn: 1.6, edge: 1.15, boundary: 0.93, tint: [150, 104, 52, 0.26],
  },
}

export const PITCH_IDS = Object.keys(PITCHES)
export const pitchById = id => PITCHES[id] || PITCHES.flat
