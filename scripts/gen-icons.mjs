// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * gen-icons.mjs — generate PWA + apple-touch icons from Emberwake's own identity
 * (an ember over a dark chasm). No external assets; renders PNGs with a tiny
 * hand-rolled encoder via the canvas in node? — node has no canvas, so we draw an
 * SVG and rasterise with sharp if available, else write SVG-derived PNGs.
 *
 * To stay dependency-free we emit the icons as PNGs built from a solid raster we
 * compose by hand. Simpler + robust: write an SVG and use the `resvg`… — not
 * available. So: draw directly into an RGBA buffer and encode a PNG ourselves.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

mkdirSync('public', { recursive: true });

// ── minimal PNG encoder (truecolour + alpha) ─────────────────────────────────
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function draw(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size * 0.46;
  const emberR = size * (maskable ? 0.26 : 0.32);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // dark indigo background, darker toward the bottom (the chasm)
      const vy = y / size;
      let r = lerp(18, 4, vy);
      let g = lerp(9, 2, vy);
      let b = lerp(30, 10, vy);

      // magenta chasm band low-down
      const band = Math.exp(-Math.pow((vy - 0.8) * 6, 2));
      r += band * 120;
      g += band * 12;
      b += band * 70;

      // the ember
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < emberR * 1.9) {
        const glow = Math.max(0, 1 - d / (emberR * 1.9));
        r += glow * glow * 230;
        g += glow * glow * 120;
        b += glow * glow * 30;
      }
      if (d < emberR) {
        const core = 1 - d / emberR;
        r = lerp(r, 255, Math.min(1, core * 1.3));
        g = lerp(g, 230, Math.min(1, core * 1.2));
        b = lerp(b, 150, Math.min(1, core));
      }
      rgba[i] = Math.min(255, r);
      rgba[i + 1] = Math.min(255, g);
      rgba[i + 2] = Math.min(255, b);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

const icons = [
  ['public/icon-192.png', 192, false],
  ['public/icon-512.png', 512, false],
  ['public/icon-512-maskable.png', 512, true],
  ['public/icon-180.png', 180, false], // apple-touch, opaque (no transparency)
];
for (const [path, size, maskable] of icons) {
  writeFileSync(path, draw(size, maskable));
  process.stdout.write(`wrote ${path} (${size})\n`);
}
