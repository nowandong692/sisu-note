/**
 * 대한궁도협회 대회일정 게시판(kungdo.or.kr)에서 대회명·기간·장소만 읽어 JSON으로 낸다.
 * 배포할 때 GitHub Actions가 돌려 dist/tournaments.json을 만든다. 앱은 이 파일만 읽는다.
 * 요강 같은 원문은 옮기지 않고, 각 대회의 협회 글 주소를 함께 남긴다.
 *
 *   node scripts/tournaments.mjs > dist/tournaments.json
 */
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
    const link = row.match(/href="([^"]*bo_table=game_news(?:&amp;|&)wr_id=(\d+))"[^>]*>([\s\S]*?)<\/a>/i);
    const period = row.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})\s*~\s*(?:(\d{4})[./-])?(\d{1,2})[./-](\d{1,2})/);
    if (!link || !period) continue;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => text(m[1]));
    const pad = (n) => String(n).padStart(2, '0');
    const start = `${period[1]}-${pad(period[2])}-${pad(period[3])}`;
    const end = `${period[4] ?? period[1]}-${pad(period[5])}-${pad(period[6])}`;
    const name = text(link[3]);
    if (!name) continue;
    out.push({ id: link[2], name, start, end, place: tds[tds.length - 1] ?? '', url: link[1].replace(/&amp;/g, '&') });
  }
  return out;
}

async function main() {
  const pages = Number(process.env.PAGES ?? 3);
  const seen = new Map();
  for (let p = 1; p <= pages; p++) {
    const res = await fetch(`${SOURCE}&page=${p}`, { headers: { 'User-Agent': 'gukgungrok (github.com/nowandong692/sisu-note)' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} on page ${p}`);
    for (const t of parseKungdoList(await res.text())) if (!seen.has(t.id)) seen.set(t.id, t);
  }
  const items = [...seen.values()].sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  if (!items.length) throw new Error('no tournaments parsed (page layout changed?)');
  process.stdout.write(JSON.stringify({ source: SOURCE, fetchedAt: new Date().toISOString(), items }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
