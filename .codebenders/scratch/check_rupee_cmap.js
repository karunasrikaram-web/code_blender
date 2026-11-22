const fs = require('fs');
const path = require('path');
const buf = fs.readFileSync(path.resolve(process.cwd(), 'src/assets/fonts/NotoSans-Regular.ttf'));
const u16 = (o) => buf.readUInt16BE(o);
const u32 = (o) => buf.readUInt32BE(o);
const CP = 0x20B9;
const numTables = u16(4);
let cmapOff = -1;
for (let i = 0; i < numTables; i++) {
  const rec = 12 + i * 16;
  if (buf.toString('ascii', rec, rec + 4) === 'cmap') cmapOff = u32(rec + 8);
}
if (cmapOff < 0) { console.log('no cmap table'); process.exit(2); }
const numSub = u16(cmapOff + 2);
const found = [];
function lookupFormat4(off) {
  const segCount = u16(off + 6) / 2;
  const endOff = off + 14;
  const startOff = endOff + 2 * segCount + 2;
  const deltaOff = startOff + 2 * segCount;
  const rangeOff = deltaOff + 2 * segCount;
  for (let i = 0; i < segCount; i++) {
    const end = u16(endOff + 2 * i), start = u16(startOff + 2 * i);
    if (CP < start || CP > end) continue;
    const delta = u16(deltaOff + 2 * i), ro = u16(rangeOff + 2 * i);
    if (ro === 0) return (CP + delta) & 0xFFFF;
    const g = u16(rangeOff + 2 * i + ro + 2 * (CP - start));
    return g === 0 ? 0 : (g + delta) & 0xFFFF;
  }
  return 0;
}
function lookupFormat12(off) {
  const n = u32(off + 12);
  for (let i = 0; i < n; i++) {
    const g = off + 16 + i * 12;
    const s = u32(g), e = u32(g + 4), sg = u32(g + 8);
    if (CP >= s && CP <= e) return sg + (CP - s);
  }
  return 0;
}
for (let i = 0; i < numSub; i++) {
  const rec = cmapOff + 4 + i * 8;
  const pid = u16(rec), eid = u16(rec + 2), off = cmapOff + u32(rec + 4);
  const format = u16(off);
  let gid = null;
  if (format === 4) gid = lookupFormat4(off);
  else if (format === 12) gid = lookupFormat12(off);
  else continue;
  found.push({ platform: pid, encoding: eid, format, glyphId: gid });
}
console.log('cmap subtables checked:', JSON.stringify(found));
const hit = found.some(f => f.glyphId > 0);
console.log('U+20B9 (RUPEE SIGN) mapped to glyph:', hit ? 'YES' : 'NO');
process.exit(hit ? 0 : 1);
