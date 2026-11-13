import type { Sky, Weather, WindDir, WindLevel } from './types';

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
  if (w.wind) {
    const speed = w.windSpeed != null && w.wind !== '없음' ? ` ${w.windSpeed}m/s` : '';
    parts.push(w.wind === '없음' ? '바람 없음' : `바람 ${w.wind}${speed}${w.windDir ? `(${w.windDir})` : ''}`);
  }
  return parts.join(' · ');
}

/** 사대 방향을 고를 때 쓰는 8방위 */
export const BEARINGS: [number, string][] = [[0, '북'], [45, '북동'], [90, '동'], [135, '남동'], [180, '남'], [225, '남서'], [270, '서'], [315, '북서']];

/** WMO 날씨 코드 → 맑음·구름·흐림·비·눈 */
export function skyFromCode(code: number): Sky {
  if (code <= 1) return '맑음';
  if (code === 2) return '구름';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '눈';
  if (code >= 51) return '비';
  return '흐림';
}

/** 풍속(m/s) → 세기. 화살이 눈에 띄게 밀리기 시작하는 4m/s, 8m/s를 경계로 둔다. */
export function windLevelFromSpeed(ms: number): WindLevel {
  if (ms < 1) return '없음';
  if (ms < 4) return '약함';
  if (ms < 8) return '보통';
  return '강함';
}

/**
 * 바람이 불어오는 방위(기상 표기, 0 = 북풍)와 사대→과녁 방위로 사수 기준 방향을 정한다.
 * 과녁 쪽에서 불어오면 맞바람, 오른쪽에서 불어오면 오른쪽에서.
 */
export function relativeWindDir(windFrom: number, rangeBearing: number): WindDir {
  const a = (((windFrom - rangeBearing) % 360) + 360) % 360;
  if (a < 45 || a >= 315) return '맞바람';
  if (a < 135) return '오른쪽에서';
  if (a < 225) return '뒷바람';
  return '왼쪽에서';
}

export interface CurrentWeather {
  temperature: number;
  code: number;
  windSpeed: number; // m/s
  windFrom: number; // 도
}

/** 불러온 현재 날씨를 앱의 날씨 입력으로 바꾼다. 사대 방향을 모르면 바람 방향은 비워 둔다. */
export function toWeather(c: CurrentWeather, rangeBearing: number | null | undefined): Weather {
  const wind = windLevelFromSpeed(c.windSpeed);
  return {
    sky: skyFromCode(c.code),
    temp: Math.round(c.temperature),
    wind,
    windDir: wind === '없음' || rangeBearing == null ? null : relativeWindDir(c.windFrom, rangeBearing),
    windSpeed: Math.round(c.windSpeed * 10) / 10,
    windFrom: c.windFrom,
  };
}

/** MET Norway(노르웨이 기상청) 응답 → 현재 날씨 */
export function parseMetNo(json: unknown): CurrentWeather {
  type T = { properties: { timeseries: { data: { instant: { details: Record<string, number> }; next_1_hours?: { summary: { symbol_code: string } }; next_6_hours?: { summary: { symbol_code: string } } } }[] } };
  const t = (json as T).properties.timeseries[0].data;
  const d = t.instant.details;
  const sym = (t.next_1_hours ?? t.next_6_hours)?.summary.symbol_code ?? '';
  return { temperature: d.air_temperature, windSpeed: d.wind_speed, windFrom: d.wind_from_direction, code: codeFromSymbol(sym) };
}

/** MET Norway 날씨 기호 → WMO 코드 (skyFromCode에 넘기기 위한 대표값) */
function codeFromSymbol(sym: string): number {
  const s = sym.replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('snow')) return 73;
  if (s.includes('rain') || s.includes('sleet') || s.includes('thunder')) return 61;
  if (s === 'clearsky' || s === 'fair') return 0;
  if (s === 'partlycloudy') return 2;
  return 3;
}

const WWO_SNOW = new Set([179, 227, 230, 323, 326, 329, 332, 335, 338, 350, 368, 371, 374, 377, 392, 395]);
/** wttr.in(j1) 응답 → 현재 날씨 */
export function parseWttr(json: unknown): CurrentWeather {
  const c = (json as { current_condition: Record<string, string>[] }).current_condition[0];
  const w = Number(c.weatherCode);
  const code = w === 113 ? 0 : w === 116 ? 2 : [119, 122, 143, 248, 260].includes(w) ? 3 : WWO_SNOW.has(w) ? 73 : 61;
  return { temperature: Number(c.temp_C), windSpeed: Number(c.windspeedKmph) / 3.6, windFrom: Number(c.winddirDegree), code };
}
