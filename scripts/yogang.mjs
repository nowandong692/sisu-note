/**
 * 대회 요강(한글 hwp 파일)에서 접수 정보만 뽑는다.
 * 접수기간, 접수처(어느 앱으로 받는지), 선착순 인원, 참가비 정도만 옮기고
 * 문의처 전화번호나 계좌번호 같은 개인 정보는 옮기지 않는다.
 */
import CFB from 'cfb';
import { inflateRawSync } from 'node:zlib';

const PARA_TEXT = 67;
/** 글자 사이에 끼어 있는 조판 부호. 이 값들은 뒤따르는 7글자와 함께 8글자 자리를 차지한다 */
const WIDE = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);

function paraText(buf) {
  let s = '';
  for (let i = 0; i + 1 < buf.length;) {
    const c = buf.readUInt16LE(i);
    if (WIDE.has(c)) { i += 16; continue; }
    i += 2;
    if (c === 9) s += ' ';
    else if (c >= 32) s += String.fromCharCode(c);
  }
  return s;
}

/** hwp(5.x) 파일 본문을 문단마다 한 줄로 */
export function hwpText(data) {
  const cfb = CFB.read(Buffer.from(data), { type: 'buffer' });
  const header = CFB.find(cfb, 'FileHeader');
  if (!header) throw new Error('not a hwp file');
  const compressed = (Buffer.from(header.content).readUInt32LE(36) & 1) === 1;
  const sections = cfb.FullPaths
    .map((p, i) => ({ p, e: cfb.FileIndex[i] }))
    .filter(({ p }) => /\/BodyText\/Section\d+$/.test(p))
    .sort((a, b) => Number(a.p.match(/\d+$/)[0]) - Number(b.p.match(/\d+$/)[0]));
  const lines = [];
  for (const { e } of sections) {
    let d = Buffer.from(e.content);
    if (compressed) d = inflateRawSync(d);
    for (let i = 0; i + 4 <= d.length;) {
      const h = d.readUInt32LE(i);
      i += 4;
      let size = h >>> 20;
      if (size === 0xfff) { size = d.readUInt32LE(i); i += 4; }
      if ((h & 0x3ff) === PARA_TEXT) {
        const t = paraText(d.subarray(i, i + size)).trim();
        if (t) lines.push(t);
      }
      i += size;
    }
  }
  return lines.join('\n');
}

const pad = (n) => String(n).padStart(2, '0');

/** "2026년 11월 10일 (화) 13:00" "2026. 11. 11.(수) 13:00" "10월27일(화) 13:00" 같은 한쪽 끝 */
function point(s) {
  const d = s.match(/(?:(\d{4})\s*[년.]\s*)?(\d{1,2})\s*[월.]\s*(\d{1,2})\s*[일.]?/);
  if (!d) return null;
  const t = s.slice(d.index + d[0].length).match(/(\d{1,2})\s*:\s*(\d{2})/);
  return { y: d[1] ? Number(d[1]) : null, m: Number(d[2]), d: Number(d[3]), time: t ? `${pad(t[1])}:${t[2]}` : null };
}

/** 개인 정보가 될 만한 것(계좌번호, 전화번호, 전자우편)을 지운다 */
function scrub(s) {
  return s
    .replace(/\([^)]*\d{2,}-\d{2,}[^)]*\)/g, '')
    .replace(/[\w.-]+@[\w.-]+/g, '')
    .replace(/\d{2,4}\)?\s*-?\d{3,4}-\d{4}/g, '')
    .replace(/\d{2,}-\d{2,}-\d{2,}(-\d+)?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "가." "⦁" "○" 같은 앞머리를 떼고 짧게 */
function clean(line, max = 70) {
  const s = scrub(line.replace(/^[\s{※▶○⦁•·*-]*(?:[가-하]\.|\d+\.)?\s*/, '').replace(/[{}]/g, ''));
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * 요강 글에서 접수 정보를 뽑는다. year는 대회가 열리는 해(요강에 해가 빠져 있을 때 쓴다).
 * 접수기간을 못 찾으면 null.
 */
export function parseYogang(text, year) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const periodLine = lines.find((l) => /접\s*수\s*기\s*간/.test(l));
  if (!periodLine) return null;
  const body = periodLine.replace(/^.*?접\s*수\s*기\s*간\s*[:：]?/, '');
  const [a, b] = body.split(/~|∼|부터/).filter((x) => /\d/.test(x));
  const p = a && point(a);
  if (!p) return null;
  let q = b ? point(b) : null;
  if (!q && b) {
    // "~ 15일 17:00"처럼 날만 적은 경우
    const dd = b.match(/(\d{1,2})\s*일/);
    const t = b.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (dd) q = { y: null, m: p.m, d: Number(dd[1]), time: t ? `${pad(t[1])}:${t[2]}` : null };
  }
  const y1 = p.y ?? year;
  const reg = { open: `${y1}-${pad(p.m)}-${pad(p.d)}T${p.time ?? '00:00'}` };
  if (q) {
    const y2 = q.y ?? (q.m < p.m ? y1 + 1 : y1);
    reg.close = `${y2}-${pad(q.m)}-${pad(q.d)}T${q.time ?? '23:59'}`;
  }

  const viaLine = lines.find((l) => /접\s*수\s*(방\s*법|처)/.test(l) && /앱|어플|온라인|이메일|팩스|우편|현장/.test(l));
  if (viaLine) {
    const app = viaLine.match(/([0-9A-Za-z가-힣]+(?:\s?[0-9A-Za-z가-힣]+)?)\s*(?:앱|어플)/);
    reg.via = app ? `${app[1].replace(/\s/g, '')} 앱` : clean(viaLine.replace(/^.*?접\s*수\s*(방\s*법|처)\s*[:：]?/, ''), 40);
  }
  const limits = lines.filter((l) => /선착순/.test(l)).map((l) => clean(l)).filter(Boolean);
  if (limits.length) reg.limit = limits.slice(0, 2);
  const fees = lines.filter((l) => /참가(비|금)/.test(l) && /\d/.test(l)).map((l) => clean(l)).filter(Boolean);
  if (fees.length) reg.fee = fees.slice(0, 2);
  return reg;
}
