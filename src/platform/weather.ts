import type { Place } from '../domain/types';
import { parseMetNo, parseWttr, type CurrentWeather } from '../domain/weather';

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

/**
 * 지금 날씨를 가져온다. 어느 한 서비스가 그 망에서 막혀 있어도 되도록
 * Open-Meteo → MET Norway → wttr.in 순서로 시도하고, 처음 성공한 것을 쓴다.
 * 위치는 소수 둘째 자리(약 1km)까지만 보낸다. 셋 다 키가 필요 없다.
 */
export async function fetchCurrentWeather(lat: number, lon: number): Promise<CurrentWeather & { source: string }> {
  const la = lat.toFixed(2), lo = lon.toFixed(2);
  const om = new URLSearchParams({
    latitude: la, longitude: lo,
    current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms', timezone: 'auto',
  });
  const providers: [string, string, (j: unknown) => CurrentWeather][] = [
    ['Open-Meteo', `https://api.open-meteo.com/v1/forecast?${om}`, (j) => {
      const c = (j as { current: Record<string, number> }).current;
      return { temperature: c.temperature_2m, code: c.weather_code, windSpeed: c.wind_speed_10m, windFrom: c.wind_direction_10m };
    }],
    ['MET Norway', `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${la}&lon=${lo}`, parseMetNo],
    ['wttr.in', `https://wttr.in/${la},${lo}?format=j1`, parseWttr],
  ];
  const fails: string[] = [];
  for (const [name, url, parse] of providers) {
    try {
      const res = await getWithTimeout(url, 7000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const w = parse(await res.json());
      if (![w.temperature, w.windSpeed].every(Number.isFinite)) throw new Error('응답 형식이 다릅니다');
      return { ...w, source: name };
    } catch (e) {
      fails.push(`${name}: ${e instanceof Error ? e.message : '실패'}`);
    }
  }
  throw new Error(`날씨 서비스에 연결하지 못했습니다 (${fails.join(', ')}). 잠시 뒤 다시 해 보거나 직접 입력해 주세요.`);
}

async function getWithTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { cache: 'no-store', signal: ctl.signal });
  } catch (e) {
    throw new Error(ctl.signal.aborted ? '시간 초과' : e instanceof Error ? e.message : '연결 실패');
  } finally {
    clearTimeout(t);
  }
}

/** 지명으로 위치 찾기. Open-Meteo 지오코딩이 막히면 OpenStreetMap(Nominatim)으로 찾는다. 예: "종로구", "전주" */
export async function searchPlaces(name: string): Promise<Place[]> {
  const fails: string[] = [];
  try {
    const q = new URLSearchParams({ name: name.trim(), count: '6', language: 'ko', format: 'json' });
    const res = await getWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?${q}`, 7000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list: { name: string; latitude: number; longitude: number; admin1?: string; admin2?: string }[] = (await res.json()).results ?? [];
    if (list.length) {
      return list.map((r) => ({
        name: [r.admin1, r.admin2, r.name].filter((x, i, a) => x && a.indexOf(x) === i).join(' ') || r.name,
        lat: r.latitude, lon: r.longitude,
      }));
    }
  } catch (e) {
    fails.push(`Open-Meteo: ${e instanceof Error ? e.message : '실패'}`);
  }
  try {
    const q = new URLSearchParams({ q: name.trim(), format: 'json', limit: '6', 'accept-language': 'ko', countrycodes: 'kr' });
    const res = await getWithTimeout(`https://nominatim.openstreetmap.org/search?${q}`, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list: { display_name: string; lat: string; lon: string }[] = await res.json();
    return list.map((r) => ({
      name: r.display_name.split(',').map((x) => x.trim()).filter((x) => x !== '대한민국' && !/^\d{5}$/.test(x)).slice(0, 3).reverse().join(' '),
      lat: Number(r.lat), lon: Number(r.lon),
    }));
  } catch (e) {
    fails.push(`OpenStreetMap: ${e instanceof Error ? e.message : '실패'}`);
  }
  throw new Error(`위치 검색 서비스에 연결하지 못했습니다 (${fails.join(', ')}). 활터에 있을 때 "지금 이 자리를 활터로" 를 눌러 정할 수도 있습니다.`);
}

/**
 * 근처 활터 이름 찾기 (OpenStreetMap에 sport=archery로 올라간 곳). 새 활터를 등록할 때 이름 후보로만 쓴다.
 * 못 찾거나 막혀 있으면 빈 목록.
 */
export async function nearbyArcheryRanges(lat: number, lon: number): Promise<Place[]> {
  const q = `[out:json][timeout:8];nwr["sport"="archery"](around:1500,${lat.toFixed(4)},${lon.toFixed(4)});out center 8;`;
  try {
    const res = await getWithTimeout(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, 9000);
    if (!res.ok) return [];
    const els: { tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }[] = (await res.json()).elements ?? [];
    return els.flatMap((e) => {
      const name = e.tags?.['name:ko'] ?? e.tags?.name;
      const c = e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null);
      return name && c ? [{ name, lat: c.lat, lon: c.lon }] : [];
    });
  } catch {
    return [];
  }
}
