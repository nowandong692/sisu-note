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
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? '위치 권한이 꺼져 있습니다. 브라우저 설정에서 위치를 허용해 주세요.' : '위치를 찾지 못했습니다. 잠시 뒤 다시 해 보세요.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
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
  let res: Response;
  try {
    res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  } catch {
    throw new Error('날씨 서비스에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
  }
  if (!res.ok) throw new Error('날씨를 불러오지 못했습니다. 잠시 뒤 다시 해 보세요.');
  const c = (await res.json()).current;
  return { temperature: c.temperature_2m, code: c.weather_code, windSpeed: c.wind_speed_10m, windFrom: c.wind_direction_10m };
}
