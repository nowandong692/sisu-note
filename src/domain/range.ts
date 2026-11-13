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

/** GPS 위치로 지금 활터를 정한다. 등록 활터 근처면 그곳, 아니면 직접 고른 활터만 남기고 비운다. */
export function detectRange(s: Settings, pos: LatLon): Pick<Settings, 'currentRange' | 'currentRangeManual'> {
  const near = nearestRange(s.ranges ?? [], pos);
  if (near) return { currentRange: near.id, currentRangeManual: false };
  if (s.currentRangeManual) return { currentRange: s.currentRange ?? null, currentRangeManual: true };
  return { currentRange: null, currentRangeManual: false };
}

/** 예전 버전에서 하나만 정해 두던 활터 위치·사대 방향을 활터 목록으로 옮긴다 */
export function migrateRanges(s: Settings): Settings {
  if (s.ranges || !s.rangePlace) return s;
  const r: Range = { id: 'range-1', name: s.rangePlace.name, lat: s.rangePlace.lat, lon: s.rangePlace.lon, bearing: s.rangeBearing ?? null };
  return { ...s, ranges: [r], currentRange: r.id, currentRangeManual: true, rangePlace: null, rangeBearing: null };
}
