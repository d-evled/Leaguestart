#!/usr/bin/env node
/**
 * Generates the app icons (a simple "splits" glyph — three timing bars on a
 * dark tile) without any image dependencies: hand-rolled PNG encoder plus a
 * PNG-based .ico wrapper. Original artwork; no game assets.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, draw) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// The glyph: dark rounded tile, three "split" bars of differing width.
const BG = [0x17, 0x1b, 0x26];
const BARS = [
  { y0: 0.26, y1: 0.36, w: 0.62, c: [0xe8, 0xa3, 0x3d] }, // amber
  { y0: 0.45, y1: 0.55, w: 0.44, c: [0x5e, 0xea, 0xd4] }, // teal
  { y0: 0.64, y1: 0.74, w: 0.7, c: [0x8b, 0x95, 0xb3] }, // slate
];
function draw(x, y, size) {
  const u = x / size;
  const v = y / size;
  // Rounded-corner tile mask.
  const r = 0.18;
  const cx = Math.min(u, 1 - u);
  const cy = Math.min(v, 1 - v);
  if (cx < r && cy < r) {
    const dx = r - cx;
    const dy = r - cy;
    if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
  }
  for (const bar of BARS) {
    if (v >= bar.y0 && v < bar.y1 && u >= 0.17 && u < 0.17 + bar.w) {
      return [...bar.c, 255];
    }
  }
  return [...BG, 255];
}

function ico(pngBuf, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12); // data offset
  return Buffer.concat([header, entry, pngBuf]);
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "src-tauri", "icons");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "32x32.png"), png(32, draw));
writeFileSync(join(out, "128x128.png"), png(128, draw));
writeFileSync(join(out, "128x128@2x.png"), png(256, draw));
writeFileSync(join(out, "icon.png"), png(512, draw));
writeFileSync(join(out, "icon.ico"), ico(png(256, draw), 256));
console.log(`wrote icons to ${out}`);
