import { useEffect, useRef } from 'react';
import { nearestRange, type LatLon } from '../domain/range';
import type { Settings } from '../domain/types';
import { today } from '../domain/util';
import { toWeather } from '../domain/weather';
import { currentPosition, fetchCurrentWeather } from '../platform/weather';
import { useStore } from './store';

/** 날씨를 자동으로 새로 불러오는 간격 */
export const WEATHER_REFRESH_MS = 30 * 60 * 1000;

/**
 * 휴대폰 위치의 날씨를 불러와 저장한다. 지금 활터는 바꾸지 않고, 위치는 onHere로 알려 준다
 * (근처에 다른 국궁장이 있으면 바꿀지 묻는 데 쓴다). 위치를 못 얻으면 지금 활터의 위치로 날씨만 불러온다.
 */
export async function loadWeather(s: Settings, updateSettings: (p: Partial<Settings>) => Promise<void>, onHere?: (p: LatLon) => void): Promise<void> {
  let pos: LatLon | null = null;
  let posErr: unknown = null;
  try { pos = await currentPosition(); } catch (e) { posErr = e; }

  const patch: Partial<Settings> = {};
  const ranges = s.ranges ?? [];
  let range = ranges.find((r) => r.id === s.currentRange) ?? null;
  if (pos) {
    onHere?.(pos);
    range = nearestRange(ranges, pos); // 등록 활터 근처가 아니면 그 활터의 사대 방향은 쓰지 않는다
  }
  const at = pos ?? range;
  if (!at) throw posErr instanceof Error ? posErr : new Error('위치를 알 수 없습니다.');
  const got = await fetchCurrentWeather(at.lat, at.lon);
  patch.weather = { ...toWeather(got, range?.bearing), date: today(), fetchedAt: Date.now(), source: got.source, manual: false };
  await updateSettings(patch);
}

/** 활터를 다시 확인하는 간격 (앱을 열거나 돌아올 때) */
const DETECT_MS = 5 * 60 * 1000;

/** 자동으로 새로 불러올 때인가: 오늘 날씨가 없거나, 직접 고치지 않았고 30분이 지났을 때 */
export function weatherDue(s: Settings, now = Date.now()): boolean {
  const w = s.weather;
  if (!w || w.date !== today()) return true;
  if (w.manual) return false;
  return now - (w.fetchedAt ?? 0) >= WEATHER_REFRESH_MS;
}

/**
 * 앱을 열 때, 앱으로 돌아올 때, 그리고 켜 둔 동안 1분마다 확인해서 때가 되면 날씨를 새로 불러오고,
 * 위치를 확인해 근처에 다른 국궁장이 있으면 활터를 바꿀지 묻는다. 활터는 마지막에 쓰던 곳으로 시작한다.
 * 실패하면 조용히 넘어가고 30분 뒤에 다시 해 본다 (위치 권한을 거절했으면 계속 묻지 않도록).
 */
export function useAutoWeather() {
  const { loaded, settings, updateSettings, noticePosition } = useStore();
  const ref = useRef({ settings, updateSettings, noticePosition });
  ref.current = { settings, updateSettings, noticePosition };
  const busy = useRef(false);
  const lastFail = useRef(0);
  const lastDetect = useRef(0);

  useEffect(() => {
    if (!loaded) return;
    const tick = async () => {
      const { settings: s, updateSettings: up, noticePosition: here } = ref.current;
      if (busy.current || document.visibilityState === 'hidden') return;
      if (Date.now() - lastFail.current < WEATHER_REFRESH_MS) return;
      const due = weatherDue(s);
      // 날씨를 새로 불러올 때가 아니어도, 활터는 앱을 열거나 돌아올 때마다(5분 간격) 다시 확인한다
      if (!due && Date.now() - lastDetect.current < DETECT_MS) return;
      busy.current = true;
      try {
        if (due) await loadWeather(s, up, here);
        else here(await currentPosition());
        lastDetect.current = Date.now();
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
