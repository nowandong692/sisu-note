/**
 * 카카오맵 JavaScript SDK의 장소 검색으로 활터(궁도장)를 찾는다.
 * 키는 카카오 개발자 콘솔에 등록한 도메인에서만 동작하므로 앱에 넣어도 된다.
 * 키가 없거나 SDK를 못 불러오면 null/빈 목록을 돌려주고, 호출하는 쪽이 다른 방법을 쓴다.
 */

export interface FoundRange {
  name: string;
  lat: number;
  lon: number;
  address: string;
  /** 기준 위치에서의 거리 (미터, 위치를 주고 찾았을 때만) */
  distance?: number;
}

interface KakaoPlace { id: string; place_name: string; x: string; y: string; road_address_name: string; address_name: string; category_name: string; distance?: string }
interface KakaoPlacesSvc { keywordSearch(q: string, cb: (data: KakaoPlace[], status: string) => void, opts?: Record<string, unknown>): void }
interface KakaoNs { maps: { load(cb: () => void): void; LatLng: new (lat: number, lon: number) => unknown; services: { Places: new () => KakaoPlacesSvc; Status: { OK: string }; SortBy: { DISTANCE: string } } } }
declare global { interface Window { kakao?: KakaoNs } }

const KEY = import.meta.env.VITE_KAKAO_JS_KEY;
let sdk: Promise<KakaoNs | null> | null = null;

export const kakaoAvailable = () => !!KEY;

function loadSdk(): Promise<KakaoNs | null> {
  if (!KEY) return Promise.resolve(null);
  sdk ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KEY)}&libraries=services&autoload=false`;
    s.onload = () => (window.kakao ? window.kakao.maps.load(() => resolve(window.kakao!)) : resolve(null));
    s.onerror = () => { sdk = null; resolve(null); };
    document.head.appendChild(s);
    setTimeout(() => resolve(null), 10000);
  });
  return sdk;
}

/** 활터로 볼 장소인가: 카테고리나 이름에 궁도·활터·국궁이 들어간 곳 */
export function looksLikeRange(p: Pick<KakaoPlace, 'place_name' | 'category_name'>): boolean {
  return /궁도|활터|국궁|사정/.test(p.category_name) || /궁도|활터|국궁/.test(p.place_name);
}

function toFound(p: KakaoPlace): FoundRange {
  return { name: p.place_name, lat: Number(p.y), lon: Number(p.x), address: p.road_address_name || p.address_name, distance: p.distance ? Number(p.distance) : undefined };
}

function search(k: KakaoNs, q: string, opts?: Record<string, unknown>): Promise<KakaoPlace[]> {
  return new Promise((resolve) => {
    new k.maps.services.Places().keywordSearch(q, (data, status) => resolve(status === k.maps.services.Status.OK ? data : []), opts);
  });
}

/** 여러 검색어 결과를 합치고 같은 곳은 하나로 */
async function searchAll(k: KakaoNs, queries: string[], opts?: Record<string, unknown>): Promise<FoundRange[]> {
  const lists = await Promise.all(queries.map((q) => search(k, q, opts)));
  const seen = new Set<string>();
  return lists.flat().filter((p) => looksLikeRange(p) && !seen.has(p.id) && seen.add(p.id)).map(toFound);
}

/** 이 위치 반경 3km 안의 활터, 가까운 순. 키가 없으면 null. */
export async function kakaoNearbyRanges(lat: number, lon: number): Promise<FoundRange[] | null> {
  const k = await loadSdk();
  if (!k) return null;
  const r = await searchAll(k, ['궁도장', '활터', '국궁장'], { location: new k.maps.LatLng(lat, lon), radius: 3000, sort: k.maps.services.SortBy.DISTANCE });
  return r.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}

/** 이름이나 지역으로 활터 찾기 (예: "황학정", "전주 활터"). 키가 없으면 null. */
export async function kakaoSearchRanges(q: string): Promise<FoundRange[] | null> {
  const k = await loadSdk();
  if (!k) return null;
  const t = q.trim();
  return searchAll(k, [t, `${t} 궁도장`, `${t} 활터`]);
}
