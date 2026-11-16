/** 지난 날짜에 순을 더 넣을 때 쓰는 값 (저장 시각, 장비, 활터, 날씨) */
import type { End } from './types';

export type PastBase = Pick<End, 'recordedAt' | 'bowId' | 'ringId' | 'arrowId' | 'stringId' | 'rangeId' | 'weather'>;

/** 그날 기록이 없을 때 쓰는 저장 시각: 그날 낮 12시 */
export function noonOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

/**
 * 지난 날짜에 새 순을 넣을 때의 기본값.
 * 그날 기록이 있으면 마지막 순 바로 뒤(1ms)에 붙이고 그 순의 장비·활터·날씨를 따른다.
 * 그래서 같은 날 순서는 맨 뒤가 되고, 습사 시간(처음~마지막 순)은 사실상 늘지 않는다.
 * 그날 기록이 없으면 낮 12시로 두고 지금 고른 장비·활터를 쓰며 날씨는 비운다.
 */
export function pastBase(ends: End[], date: string, fallback: Omit<PastBase, 'recordedAt' | 'weather'>): PastBase {
  const day = ends.filter((e) => e.date === date);
  if (!day.length) return { ...fallback, recordedAt: noonOf(date), weather: null };
  const last = day.reduce((a, e) => (e.recordedAt > a.recordedAt ? e : a));
  return {
    recordedAt: last.recordedAt + 1,
    bowId: last.bowId, ringId: last.ringId, arrowId: last.arrowId, stringId: last.stringId ?? null,
    rangeId: last.rangeId ?? null, weather: last.weather ?? null,
  };
}
