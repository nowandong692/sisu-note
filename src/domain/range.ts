import type { Range, Settings } from './types';

/** 이 거리 안에 있으면 그 활터에 있는 것으로 본다 (GPS 오차와 활터 넓이를 감안) */
export const RANGE_RADIUS_M = 300;

export interface LatLon { lat: number; lon: number }

/** 두 지점 사이 거리 (미터) */
export function distanceM(a: LatLon, b: LatLon): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 반경 안에서 가장 가까운 활터 */
export function nearestRange(ranges: Range[], pos: LatLon, radius = RANGE_RADIUS_M): Range | null {
  let best: Range | null = null, bestD = Infinity;
  for (const r of ranges) {
    const d = distanceM(r, pos);
    if (d <= radius && d < bestD) { best = r; bestD = d; }
  }
  return best;
}

/** 지금 활터를 바꾸자고 물어볼 곳: 등록한 활터이거나, 아직 등록하지 않은 국궁장 */
export type RangeOffer = { range: Range } | { place: LatLon & { name: string } };

/**
 * GPS 위치 근처(300m)에 지금 활터와 다른 국궁장이 있으면 그곳을 돌려준다.
 * 등록한 활터를 먼저 보고, 없으면 지도에서 찾은 국궁장(found) 중 가장 가까운 곳.
 * 찾은 국궁장이 이미 등록한 활터와 같은 곳(150m 안)이면 등록한 활터로 본다.
 */
export function pickOffer(ranges: Range[], currentId: string | null | undefined, pos: LatLon, found: (LatLon & { name: string })[] = []): RangeOffer | null {
  const near = nearestRange(ranges, pos);
  if (near) return near.id === currentId ? null : { range: near };
  const f = found
    .map((x) => ({ x, d: distanceM(x, pos) }))
    .filter(({ d }) => d <= RANGE_RADIUS_M)
    .sort((a, b) => a.d - b.d)[0]?.x;
  if (!f) return null;
  const reg = nearestRange(ranges, f, 150);
  if (reg) return reg.id === currentId ? null : { range: reg };
  return { place: { name: f.name, lat: f.lat, lon: f.lon } };
}

/** 예전 버전에서 하나만 정해 두던 활터 위치·사대 방향을 활터 목록으로 옮긴다 */
export function migrateRanges(s: Settings): Settings {
  if (s.ranges || !s.rangePlace) return s;
  const r: Range = { id: 'range-1', name: s.rangePlace.name, lat: s.rangePlace.lat, lon: s.rangePlace.lon, bearing: s.rangeBearing ?? null };
  return { ...s, ranges: [r], currentRange: r.id, currentRangeManual: true, rangePlace: null, rangeBearing: null };
}
