export const BOUNDARY_CENTER_Y = 0.584
const BOUNDARY_DEPTH = 0.253

// Normalized screen coordinates on the original stadium photograph.
export function ropeY(x) {
  return 0.355 - 0.056 * (x - 0.5) ** 2
}

export function boundaryPoint(direction) {
  const x = { leg: 0.09, off: 0.91, straight: 0.54 }[direction] ?? 0.54
  return [x, ropeY(x)]
}

export function toRadarPoint(x, y) {
  const depth = (y - BOUNDARY_CENTER_Y) / BOUNDARY_DEPTH
  const width = 0.423 + 0.05 * Math.max(-1, Math.min(1, depth))
  const lateral = (x - 0.5) / width
  const radius = Math.max(1, Math.hypot(lateral, depth))
  return [50 + 45 * lateral / radius, 50 + 45 * depth / radius]
}

function deep(angle) {
  return { angle }
}

function plan(id, label, spots) {
  return {
    id,
    label,
    // The original plans face the opposite end. Reflect close positions
    // around mid-pitch and leave the deep positions along the far rope.
    positions: spots.map(([, spot]) => {
      if (Array.isArray(spot)) return [spot[0], 2 * BOUNDARY_CENTER_Y - spot[1]]
      const x = 0.5 + 0.445 * Math.cos(spot.angle * Math.PI / 180)
      return [x, ropeY(x) + 0.018]
    }),
    names: spots.map(([name]) => name),
  }
}

// Keeper and bowler are separate. The first two slots stay in catching
// positions near the striker, while the other seven retain their side or zone.
export const FIELD_PLANS = {
  balanced: plan('balanced', 'Balanced field', [
    ['Leg slip', [0.436, 0.402]],
    ['Slip', [0.573, 0.397]],
    ['Square leg', [0.285, 0.522]],
    ['Cover', [0.704, 0.515]],
    ['Fine leg', deep(226)],
    ['Deep cover', deep(12)],
    ['Mid-on', [0.367, 0.649]],
    ['Mid-off', [0.647, 0.651]],
    ['Third man', deep(312)],
  ]),
  attack: plan('attack', 'Attacking field', [
    ['Leg slip', [0.449, 0.398]],
    ['Slip', [0.565, 0.389]],
    ['Short leg', [0.376, 0.472]],
    ['Point', [0.660, 0.450]],
    ['Fine leg', deep(226)],
    ['Deep point', deep(335)],
    ['Mid-on', [0.389, 0.587]],
    ['Mid-off', [0.617, 0.576]],
    ['Gully', [0.660, 0.389]],
  ]),
  off: plan('off', 'Off-side protection', [
    ['Short fine leg', [0.426, 0.415]],
    ['Slip', [0.585, 0.391]],
    ['Square leg', [0.332, 0.558]],
    ['Point', [0.766, 0.447]],
    ['Deep square leg', deep(184)],
    ['Sweeper cover', deep(12)],
    ['Mid-on', [0.414, 0.630]],
    ['Long-off', deep(59)],
    ['Third man', deep(313)],
  ]),
  leg: plan('leg', 'Leg-side protection', [
    ['Leg slip', [0.422, 0.399]],
    ['Slip', [0.568, 0.414]],
    ['Deep square leg', deep(184)],
    ['Cover', [0.659, 0.503]],
    ['Fine leg', deep(227)],
    ['Deep cover', deep(12)],
    ['Deep midwicket', deep(144)],
    ['Mid-off', [0.627, 0.648]],
    ['Third man', deep(309)],
  ]),
  straight: plan('straight', 'Straight boundary cover', [
    ['Leg slip', [0.437, 0.401]],
    ['Slip', [0.571, 0.407]],
    ['Square leg', [0.304, 0.529]],
    ['Cover', [0.694, 0.527]],
    ['Deep square leg', deep(191)],
    ['Sweeper cover', deep(13)],
    ['Long-on', deep(112)],
    ['Long-off', deep(66)],
    ['Short third', [0.701, 0.411]],
  ]),
  boundary: plan('boundary', 'Boundary protection', [
    ['Short fine leg', [0.417, 0.414]],
    ['Slip', [0.588, 0.400]],
    ['Deep square leg', deep(177)],
    ['Cover', [0.698, 0.538]],
    ['Fine leg', deep(227)],
    ['Sweeper cover', deep(9)],
    ['Long-on', deep(112)],
    ['Long-off', deep(66)],
    ['Point', [0.697, 0.439]],
  ]),
}

const SECTORS = ['leg', 'straight', 'off']
const ADAPTATION_THRESHOLD = { Easy: 3.25, Medium: 2, Hard: 1.75 }

function threatenedSide(deliveries, difficulty) {
  const last = deliveries.at(-1)
  if (!last?.runs || !SECTORS.includes(last.direction)) return null

  const pressure = { leg: 0, straight: 0, off: 0 }
  for (const { direction, runs, wicket } of deliveries) {
    if (wicket || !runs || !SECTORS.includes(direction)) continue
    pressure[direction] += runs >= 4 ? 2.5 : runs === 3 ? 1.25 : 1
  }

  const side = last.direction
  const threshold = ADAPTATION_THRESHOLD[difficulty] ?? ADAPTATION_THRESHOLD.Medium
  const otherPressure = Math.max(...SECTORS.filter(sector => sector !== side).map(sector => pressure[sector]))
  if (pressure[side] < threshold || pressure[side] - otherPressure < 0.75) return null
  return side
}

export function selectFieldPlan({
  currentPlan = FIELD_PLANS.balanced, deliveries = [], balls = 0,
  totalBalls = 6, wickets = 0, difficulty = 'Medium',
} = {}) {
  if (balls === 0 || balls >= totalBalls || wickets >= 10) return currentPlan

  const previous = deliveries.slice(-4)
  const last = previous.at(-1)
  const closingWindow = Math.min(6, Math.max(2, Math.round(totalBalls / 5)))
  const closing = balls >= totalBalls - closingWindow
  if (last?.wicket && wickets > 0 && !closing) return FIELD_PLANS.attack

  const side = threatenedSide(previous, difficulty)
  if (side) return FIELD_PLANS[side]

  // Keep the current positions between tactical triggers, including isolated
  // singles. Finishing overs default to deep protection without a clear target.
  const overComplete = balls % 6 === 0
  if (closing && (balls === totalBalls - closingWindow || overComplete || currentPlan.id === 'attack')) {
    return FIELD_PLANS.boundary
  }

  if (!closing) {
    const dotsToAttack = difficulty === 'Easy' ? 3 : 2
    const recentDots = previous.slice(-dotsToAttack)
    if (recentDots.length === dotsToAttack && recentDots.every(ball => !ball.runs)) {
      return FIELD_PLANS.attack
    }
    if (overComplete) return FIELD_PLANS.balanced
  }

  return currentPlan
}
