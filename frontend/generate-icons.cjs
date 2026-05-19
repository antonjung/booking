const zlib = require('zlib')
const fs = require('fs')

function int32be(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

function crc32(data) {
  let crc = 0xFFFFFFFF
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const c = crc32(Buffer.concat([t, data]))
  return Buffer.concat([int32be(data.length), t, data, int32be(c)])
}

function generatePNG(size) {
  const px = new Uint8Array(size * size * 3)
  const BG = [30, 64, 175]   // #1e40af
  const FG = [255, 255, 255]

  function set(x, y, c) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 3
    px[i] = c[0]; px[i+1] = c[1]; px[i+2] = c[2]
  }

  function rect(x1, y1, x2, y2, c) {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++) set(x, y, c)
  }

  const s = size / 192
  const r = n => Math.round(n * s)

  // Background
  rect(0, 0, size - 1, size - 1, BG)

  // Roof (triangle)
  const roofTop = r(42), roofBot = r(96), cx = r(96)
  for (let y = roofTop; y <= roofBot; y++) {
    const half = Math.round(((y - roofTop) / (roofBot - roofTop)) * r(72))
    rect(cx - half, y, cx + half, y, FG)
  }

  // Chimney
  rect(r(122), r(28), r(143), r(68), FG)

  // House body
  rect(r(38), r(96), r(154), r(168), FG)

  // Door (blue cutout)
  rect(r(76), r(128), r(116), r(168), BG)

  const lines = []
  for (let y = 0; y < size; y++) {
    lines.push(0)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3
      lines.push(px[i], px[i+1], px[i+2])
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = chunk('IHDR', Buffer.concat([int32be(size), int32be(size), Buffer.from([8, 2, 0, 0, 0])]))
  const idat = chunk('IDAT', zlib.deflateSync(Buffer.from(lines)))
  const iend = chunk('IEND', Buffer.alloc(0))
  return Buffer.concat([sig, ihdr, idat, iend])
}

fs.writeFileSync('public/pwa-192x192.png', generatePNG(192))
fs.writeFileSync('public/pwa-512x512.png', generatePNG(512))
console.log('Icons generated.')
