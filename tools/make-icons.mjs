// Draws the app icons without any image library: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = bytes => {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, tail])
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 3x3 supersampling keeps edges smooth.
      let r = 0, g = 0, b = 0
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        const [pr, pg, pb] = pixel((x + (sx + 0.5) / 3) / size, (y + (sy + 0.5) / 3) / size)
        r += pr; g += pg; b += pb
      }
      const at = y * (size * 4 + 1) + 1 + x * 4
      raw[at] = r / 9; raw[at + 1] = g / 9; raw[at + 2] = b / 9; raw[at + 3] = 255
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4)
  header[8] = 8; header[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * Math.max(0, Math.min(1, t)))
function segment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - ax - dx * t, py - ay - dy * t)
}

function icon(x, y) {
  let color = mix([33, 74, 58], [7, 21, 18], Math.hypot(x - 0.42, y - 0.36) / 0.85)
  // Mown stripes.
  if (Math.floor((x + y) * 7) % 2 === 0) color = mix(color, [50, 96, 70], 0.16)
  // Bat: handle, then blade with a darker spine.
  if (segment(x, y, 0.60, 0.33, 0.75, 0.13) < 0.026) color = [238, 236, 220]
  const blade = segment(x, y, 0.24, 0.80, 0.60, 0.33)
  if (blade < 0.074) color = mix([226, 250, 126], [166, 200, 70], blade / 0.074)
  if (segment(x, y, 0.27, 0.76, 0.56, 0.38) < 0.008) color = [130, 164, 52]
  // Ball with a stitched seam.
  const ballDistance = Math.hypot(x - 0.70, y - 0.69)
  if (ballDistance < 0.158) color = [7, 21, 18]
  if (ballDistance < 0.14) {
    color = mix([255, 150, 150], [150, 16, 36], Math.hypot(x - 0.655, y - 0.64) / 0.2)
    const seam = Math.abs(Math.hypot(x - 0.86, y - 0.53) - 0.2)
    if (seam < 0.009) color = [255, 240, 214]
  }
  return color
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL('../static/icons/' + name, import.meta.url), png(size, icon))
  console.log('wrote', name)
}
