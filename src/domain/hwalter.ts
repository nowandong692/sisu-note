/** 대한궁도협회 활터현황 (배포 때 scripts/hwalter.mjs가 만든 hwalter.json) */
export interface Hwalter { id: string; name: string; region: string; address: string }
export interface HwalterFile { source?: string; fetchedAt?: string; items: Hwalter[]; error?: boolean }

export const HWALTER_SOURCE = 'http://kungdo.or.kr/?mcd=4030';
export const AREAS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

const squash = (s: string) => s.replace(/\s/g, '').toLowerCase();

/** 이름이나 주소에 검색어가 들어 있는 활터. 띄어쓰기는 무시하고, 여러 낱말이면 모두 들어 있어야 한다 */
export function searchHwalter(items: Hwalter[], query: string, region: string | null): Hwalter[] {
  const words = query.trim().split(/\s+/).filter(Boolean).map(squash);
  return sortHwalter(items.filter((h) => {
    if (region && h.region !== region) return false;
    const hay = squash(`${h.name} ${h.address}`);
    return words.every((w) => hay.includes(w));
  }));
}

/** 지역(협회 순서) 안에서 이름 가나다순 */
export function sortHwalter(items: Hwalter[]): Hwalter[] {
  const r = (h: Hwalter) => (AREAS.indexOf(h.region) + 1 || 99);
  return [...items].sort((a, b) => r(a) - r(b) || a.name.localeCompare(b.name, 'ko'));
}

/** 연락처는 옮기지 않고 협회 활터현황의 그 지역 쪽으로 연결한다 */
export function contactUrl(h: Pick<Hwalter, 'region'>): string {
  const i = AREAS.indexOf(h.region);
  return i >= 0 ? `${HWALTER_SOURCE}&area=${i + 1}` : HWALTER_SOURCE;
}

/** 주소에서 괄호 설명(우편물 주소 등)을 떼어 지도 검색에 쓴다 */
export function mapQuery(h: Pick<Hwalter, 'address'>): string {
  return h.address.replace(/\(.*$/, '').replace(/,.*$/, '').trim();
}

export function mapLinks(h: Pick<Hwalter, 'address'>) {
  const q = encodeURIComponent(mapQuery(h));
  return { naver: `https://map.naver.com/p/search/${q}`, kakao: `https://map.kakao.com/link/search/${q}` };
}
