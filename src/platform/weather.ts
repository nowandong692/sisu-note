import type { Place } from '../domain/types';
import type { CurrentWeather } from '../domain/weather';

/**
 * 현재 위치를 얻는다. 웹은 브라우저 위치 권한을 쓰고,
 * Capacitor 앱에서는 Geolocation 플러그인으로 바꿔 끼운다.
 */
export function currentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('이 기기에서는 위치를 알 수 없습니다.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(
        e.code === e.PERMISSION_DENIED ? '위치 권한이 꺼져 있습니다. 휴대폰 설정에서 브라우저의 위치 접근을 허용하거나, 아래에서 활터 위치를 직접 정해 주세요.'
          : e.code === e.TIMEOUT ? '위치를 찾는 데 시간이 너무 걸렸습니다. 다시 해 보거나 활터 위치를 직접 정해 주세요.'
          : '위치를 찾지 못했습니다. 휴대폰의 위치 서비스가 켜져 있는지 확인하거나 활터 위치를 직접 정해 주세요.')),
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

/** Open-Meteo(무료, 키 없음)에서 지금 날씨를 가져온다. 위치는 소수 둘째 자리(약 1km)까지만 보낸다. */
export async function fetchCurrentWeather(lat: number, lon: number): Promise<CurrentWeather> {
  const q = new URLSearchParams({
    latitude: lat.toFixed(2), longitude: lon.toFixed(2),
    current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms', timezone: 'auto',
  });
  const res = await getWithRetry(`https://api.open-meteo.com/v1/forecast?${q}`, '날씨 서비스');
  if (!res.ok) throw new Error('날씨를 불러오지 못했습니다. 잠시 뒤 다시 해 보세요.');
  const c = (await res.json()).current;
  return { temperature: c.temperature_2m, code: c.weather_code, windSpeed: c.wind_speed_10m, windFrom: c.wind_direction_10m };
}

/** 지명으로 위치 찾기 (Open-Meteo 지오코딩). 예: "황학정", "종로구", "전주" */
export async function searchPlaces(name: string): Promise<Place[]> {
  const q = new URLSearchParams({ name: name.trim(), count: '6', language: 'ko', format: 'json' });
  const res = await getWithRetry(`https://geocoding-api.open-meteo.com/v1/search?${q}`, '위치 검색 서비스');
  if (!res.ok) throw new Error('위치를 찾지 못했습니다. 잠시 뒤 다시 해 보세요.');
  const list: { name: string; latitude: number; longitude: number; admin1?: string; admin2?: string; country?: string }[] = (await res.json()).results ?? [];
  return list.map((r) => ({
    name: [r.admin1, r.admin2, r.name].filter((x, i, a) => x && a.indexOf(x) === i).join(' ') || r.name,
    lat: r.latitude, lon: r.longitude,
  }));
}

/** 한 번 실패하면 잠깐 쉬고 다시 시도한다. 그래도 안 되면 브라우저가 알려 준 원인을 함께 보여 준다. */
async function getWithRetry(url: string, what: string): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      return await fetch(url, { cache: 'no-store' });
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  const why = last instanceof Error && last.message ? ` (${last.message})` : '';
  throw new Error(`${what}에 연결하지 못했습니다${why}. 광고·콘텐츠 차단 앱이 켜져 있으면 끄고 다시 해 보세요.`);
}
