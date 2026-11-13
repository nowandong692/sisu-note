import { useEffect, useRef } from 'react';
import type { Settings } from '../domain/types';
import { today } from '../domain/util';
import { toWeather } from '../domain/weather';
import { currentPosition, fetchCurrentWeather } from '../platform/weather';
import { useStore } from './store';

/** 날씨를 자동으로 새로 불러오는 간격 */
export const WEATHER_REFRESH_MS = 30 * 60 * 1000;

/** 활터 위치(없으면 휴대폰 위치)의 지금 날씨를 불러와 오늘 날씨로 저장한다. */
export async function loadWeather(settings: Settings, updateSettings: (p: Partial<Settings>) => Promise<void>): Promise<void> {
  const pos = settings.rangePlace ?? await currentPosition();
  const got = await fetchCurrentWeather(pos.lat, pos.lon);
  const next = toWeather(got, settings.rangeBearing);
  await updateSettings({ weather: { ...next, date: today(), fetchedAt: Date.now(), source: got.source, manual: false } });
}

/** 자동으로 새로 불러올 때인가: 오늘 날씨가 없거나, 직접 고치지 않았고 30분이 지났을 때 */
export function weatherDue(s: Settings, now = Date.now()): boolean {
  const w = s.weather;
  if (!w || w.date !== today()) return true;
  if (w.manual) return false;
  return now - (w.fetchedAt ?? 0) >= WEATHER_REFRESH_MS;
}

/**
 * 앱을 열 때, 앱으로 돌아올 때, 그리고 켜 둔 동안 1분마다 확인해서 때가 되면 날씨를 불러온다.
 * 실패하면 조용히 넘어가고 30분 뒤에 다시 해 본다 (위치 권한을 거절했으면 계속 묻지 않도록).
 */
export function useAutoWeather() {
  const { loaded, settings, updateSettings } = useStore();
  const ref = useRef({ settings, updateSettings });
  ref.current = { settings, updateSettings };
  const busy = useRef(false);
  const lastFail = useRef(0);

  useEffect(() => {
    if (!loaded) return;
    const tick = async () => {
      const { settings: s, updateSettings: up } = ref.current;
      if (busy.current || document.visibilityState === 'hidden' || !weatherDue(s)) return;
      if (Date.now() - lastFail.current < WEATHER_REFRESH_MS) return;
      busy.current = true;
      try {
        await loadWeather(s, up);
      } catch {
        lastFail.current = Date.now();
      } finally {
        busy.current = false;
      }
    };
    tick();
    const id = setInterval(tick, 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [loaded]);
}
