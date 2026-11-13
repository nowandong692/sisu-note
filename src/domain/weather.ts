import type { Weather } from './types';

export const SKIES = ['맑음', '구름', '흐림', '비', '눈'] as const;
export const WIND_LEVELS = ['없음', '약함', '보통', '강함'] as const;
/** 사대에서 과녁을 바라볼 때 바람이 불어오는 쪽 */
export const WIND_DIRS = ['맞바람', '뒷바람', '왼쪽에서', '오른쪽에서'] as const;

export const EMPTY_WEATHER: Weather = { sky: null, temp: null, wind: null, windDir: null };

export function hasWeather(w: Weather | null | undefined): w is Weather {
  return !!w && (w.sky != null || w.temp != null || w.wind != null);
}

/** 예: "맑음 · 12° · 바람 약함(맞바람)" */
export function weatherLabel(w: Weather | null | undefined): string {
  if (!hasWeather(w)) return '';
  const parts: string[] = [];
  if (w.sky) parts.push(w.sky);
  if (w.temp != null) parts.push(`${w.temp}°`);
  if (w.wind) parts.push(w.wind === '없음' ? '바람 없음' : `바람 ${w.wind}${w.windDir ? `(${w.windDir})` : ''}`);
  return parts.join(' · ');
}
