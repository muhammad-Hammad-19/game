// Small seeded generator so a ball can be reproduced on another device.
export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  next.float = (min, max) => min + (max - min) * next()
  next.int = (min, max) => min + Math.floor(next() * (max - min + 1))
  next.chance = probability => next() < probability
  next.pick = list => list[Math.floor(next() * list.length)]
  next.weighted = entries => {
    let total = 0
    for (const [, weight] of entries) total += Math.max(0, weight)
    let roll = next() * total
    for (const [value, weight] of entries) {
      roll -= Math.max(0, weight)
      if (roll < 0) return value
    }
    return entries[entries.length - 1][0]
  }
  next.shuffle = list => {
    const copy = [...list]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }
  return next
}

export const clamp = (n, min, max) => Math.max(min, Math.min(n, max))
