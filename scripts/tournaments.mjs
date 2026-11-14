/**
 * 대한궁도협회 대회일정 게시판(kungdo.or.kr)에서 대회명·기간·장소만 읽어 JSON으로 낸다.
 * 배포할 때 GitHub Actions가 돌려 dist/tournaments.json을 만든다. 앱은 이 파일만 읽는다.
 * 요강 원문은 옮기지 않고 각 대회의 협회 글 주소를 남긴다. 다가오는 대회는 요강(hwp)에서
 * 접수기간·접수처·선착순·참가비만 뽑아 reg로 붙인다 (scripts/yogang.mjs).
 *
 *   node scripts/tournaments.mjs > dist/tournaments.json
 */
import { hwpText, parseYogang } from './yogang.mjs';

export const SOURCE = 'http://kungdo.or.kr/bbs/board.php?bo_table=game_news';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·' };
function text(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** 게시판 목록 한 쪽에서 대회들을 뽑는다 */
export function parseKungdoList(html) {
  const out = [];
  for (const row of html.split(/<tr[\s>]/i).slice(1)) {
    // 쪽 번호를 붙여 읽으면 글 주소 뒤에 &page=2 같은 것이 붙는다
    const link = row.match(/href="[^"]*bo_table=game_news(?:&amp;|&)wr_id=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const period = row.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})\s*~\s*(?:(\d{4})[./-])?(\d{1,2})[./-](\d{1,2})/);
    if (!link || !period) continue;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => text(m[1]));
    const pad = (n) => String(n).padStart(2, '0');
    const start = `${period[1]}-${pad(period[2])}-${pad(period[3])}`;
    const end = `${period[4] ?? period[1]}-${pad(period[5])}-${pad(period[6])}`;
    const name = text(link[2]);
    if (!name) continue;
    out.push({ id: link[1], name, start, end, place: tds[tds.length - 1] ?? '', url: `${SOURCE}&wr_id=${link[1]}` });
  }
  return out;
}

const UA = { 'User-Agent': 'gukgungrok (github.com/nowandong692/sisu-note)' };

/** 협회 글에 붙은 첫 번째 첨부파일 주소와 이름 */
export function findAttachment(html) {
  const m = html.match(/href="([^"]*download\.php[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
  if (!m) return null;
  const name = text(m[2]).replace(/\s*\([\d.,]+\s*[KMG]?B?\)\s*$/i, '');
  return { url: m[1].replace(/&amp;/g, '&'), name };
}

/** 대회 하나의 요강을 받아 접수 정보를 붙인다. 못 읽으면 그대로 둔다 */
async function addReg(t) {
  try {
    const page = await fetch(t.url, { headers: UA, signal: AbortSignal.timeout(20000) });
    const cookie = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    const att = findAttachment(await page.text());
    if (!att) return t;
    const out = { ...t, doc: att.name };
    if (!/\.hwp$/i.test(att.name)) return out;
    const file = await fetch(att.url, { headers: { ...UA, Referer: t.url, ...(cookie ? { Cookie: cookie } : {}) }, signal: AbortSignal.timeout(30000) });
    if (!file.ok) return out;
    const reg = parseYogang(hwpText(Buffer.from(await file.arrayBuffer())), Number(t.start.slice(0, 4)));
    return reg ? { ...out, reg } : out;
  } catch (e) {
    console.error(`요강 못 읽음 ${t.id}: ${e.message}`);
    return t;
  }
}

async function main() {
  const pages = Number(process.env.PAGES ?? 3);
  const seen = new Map();
  for (let p = 1; p <= pages; p++) {
    const res = await fetch(`${SOURCE}&page=${p}`, { headers: UA, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} on page ${p}`);
    for (const t of parseKungdoList(await res.text())) if (!seen.has(t.id)) seen.set(t.id, t);
  }
  let items = [...seen.values()].sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  if (!items.length) throw new Error('no tournaments parsed (page layout changed?)');
  // 앞으로 석 달 안에 끝나지 않은 대회만 요강을 읽는다 (협회 서버에 부담을 덜 주게 하나씩)
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const until = new Date(Date.now() + 100 * 86400000).toISOString().slice(0, 10);
  const out = [];
  for (const t of items) out.push(t.end >= today && t.start <= until ? await addReg(t) : t);
  items = out;
  process.stdout.write(JSON.stringify({ source: SOURCE, fetchedAt: new Date().toISOString(), items }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
