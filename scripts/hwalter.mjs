/**
 * 대한궁도협회 활터현황(kungdo.or.kr/?mcd=4030)에서 활터 이름·지역·주소만 읽어 JSON으로 낸다.
 * 사두 이름과 연락처는 옮기지 않는다. 연락처는 앱에서 협회 활터현황 페이지로 연결한다.
 *
 *   node scripts/hwalter.mjs > dist/hwalter.json
 */
export const SOURCE = 'http://kungdo.or.kr/?mcd=4030';

/** 협회 지역 선택값 (area=1부터 차례로) */
export const AREAS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

const PREFIX = [
  [/^서울/, '서울'], [/^부산/, '부산'], [/^대구/, '대구'], [/^인천/, '인천'], [/^광주/, '광주'], [/^대전/, '대전'],
  [/^울산/, '울산'], [/^세종/, '세종'], [/^경기/, '경기'], [/^강원/, '강원'], [/^충(청)?북/, '충북'], [/^충(청)?남/, '충남'],
  [/^전(라)?북|^전북/, '전북'], [/^전(라)?남/, '전남'], [/^경(상)?북/, '경북'], [/^경(상)?남/, '경남'], [/^제주/, '제주'],
];

/** 주소 앞머리로 시도를 정한다 (지역을 모를 때만) */
export function regionOf(address) {
  const a = address.replace(/^\s+/, '');
  for (const [re, r] of PREFIX) if (re.test(a)) return r;
  return '';
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function text(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 활터현황 표에서 고유번호·사정명·주소만 뽑는다 (4·5번째 칸인 사두·연락처는 버린다) */
export function parseHwalter(html, region) {
  const out = [];
  const body = html.slice(html.indexOf('table-striped'));
  for (const row of body.split(/<tr[\s>]/i).slice(1)) {
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => text(m[1]));
    if (tds.length < 3 || !/^\d+$/.test(tds[0]) || !tds[1]) continue;
    const address = tds[2];
    out.push({ id: tds[0], name: tds[1], region: region ?? regionOf(address), address });
  }
  return out;
}

async function main() {
  // 주소만으로는 시도를 모를 때가 있어 협회 지역별로 하나씩 받는다
  const seen = new Map();
  for (const [i, region] of AREAS.entries()) {
    const res = await fetch(`${SOURCE}&area=${i + 1}`, { headers: { 'User-Agent': 'gukgungrok (github.com/nowandong692/sisu-note)' }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${region}`);
    for (const h of parseHwalter(await res.text(), region)) if (!seen.has(h.id)) seen.set(h.id, h);
  }
  const items = [...seen.values()];
  if (items.length < 100) throw new Error(`only ${items.length} ranges parsed (page layout changed?)`);
  process.stdout.write(JSON.stringify({ source: SOURCE, fetchedAt: new Date().toISOString(), items }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
