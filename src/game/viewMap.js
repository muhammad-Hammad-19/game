// The match is choreographed with the striker at the near end. This module turns that
// layout around for the broadcast angle from behind the bowler: the bowler runs in from
// the bottom of the screen and the striker stands at the far end, facing the camera.
// All coordinates are fractions of the frame.
const DEPTH = [[0.30, 0.90], [0.355, 0.835], [0.425, 0.745], [0.585, 0.56], [0.738, 0.425], [0.87, 0.365], [1.05, 0.32]]
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (n, min, max) => Math.max(min, Math.min(n, max))

function along(value, from, to) {
  // Piecewise-linear lookup that keeps going in a straight line past either end.
  let i = 1
  while (i < DEPTH.length - 1 && (DEPTH[i][from] - value) * (DEPTH[i][from] - DEPTH[0][from]) < 0) i++
  const a = DEPTH[i - 1]
  const b = DEPTH[i]
  return lerp(a[to], b[to], (value - a[from]) / (b[from] - a[from]))
}

export const mapY = y => along(y, 0, 1)
export const unmapY = y => along(y, 1, 0)
// The pitch's centre line in the ground photograph, and how wide things appear at a given height.
const centre = y => lerp(0.498, 0.482, (y - 0.40) / 0.345)
const width = y => Math.max(0.05, y - 0.127)

export function mapPoint(x, y) {
  const screenY = mapY(y)
  const offset = x - centre(y)
  // Players near the pitch keep true perspective; the outfield keeps its place on screen.
  const blend = clamp((Math.abs(offset) - 0.08) / 0.15, 0, 1)
  return [centre(screenY) + offset * lerp(width(screenY) / width(y), 1, blend), screenY]
}

// Inverse for points on or near the pitch (used for aiming a delivery).
export function unmapPoint(screenX, screenY) {
  const y = unmapY(screenY)
  return [centre(y) + (screenX - centre(screenY)) * width(y) / width(screenY), y]
}
