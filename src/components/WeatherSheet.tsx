import { useState } from 'react';
import type { Weather } from '../domain/types';
import { BEARINGS, EMPTY_WEATHER, SKIES, WIND_DIRS, WIND_LEVELS, relativeWindDir, toWeather, weatherLabel } from '../domain/weather';
import { currentPosition, fetchCurrentWeather } from '../platform/weather';
import { today } from '../domain/util';
import { useStore } from '../state/store';
import { Sheet } from './ui';

/** 오늘 날씨 입력. 모두 선택 사항이고, 고른 값은 다음에 저장하는 순부터 들어간다. */
export function WeatherSheet({ onClose }: { onClose: () => void }) {
  const { todayWeather, updateSettings, settings } = useStore();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const bearing = settings.rangeBearing ?? null;
  const w = todayWeather ?? EMPTY_WEATHER;
  const [tempText, setTempText] = useState(w.temp == null ? '' : String(w.temp));

  const set = (patch: Partial<Weather>) => updateSettings({ weather: { ...w, ...patch, date: today() } });
  const setTemp = (t: number | null) => { setTempText(t == null ? '' : String(t)); set({ temp: t }); };
  const onTempText = (v: string) => {
    const clean = v.replace(/[^\d.-]/g, '');
    setTempText(clean);
    const n = Number(clean);
    if (clean === '') set({ temp: null });
    else if (clean !== '-' && Number.isFinite(n) && n >= -40 && n <= 50) set({ temp: Math.round(n) });
  };
  const load = async () => {
    setLoading(true); setErr('');
    try {
      const pos = await currentPosition();
      const next = toWeather(await fetchCurrentWeather(pos.lat, pos.lon), bearing);
      setTempText(next.temp == null ? '' : String(next.temp));
      await updateSettings({ weather: { ...next, date: today() } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '날씨를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };
  const setBearing = (b: number | null) => {
    const patch: Partial<typeof settings> = { rangeBearing: b };
    // 불러온 바람이면 새 사대 방향으로 바람 방향을 다시 계산한다
    if (todayWeather?.windFrom != null && todayWeather.wind && todayWeather.wind !== '없음') {
      patch.weather = { ...todayWeather, windDir: b == null ? null : relativeWindDir(todayWeather.windFrom, b), date: today() };
    }
    updateSettings(patch);
  };
  const toggle = <K extends keyof Weather>(k: K, v: Weather[K]) => set({ [k]: w[k] === v ? null : v } as Partial<Weather>);

  return (
    <Sheet title="오늘 날씨" onClose={onClose}>
      <div className="small muted">모두 선택 사항입니다. 다음에 저장하는 순부터 들어가고, 날짜가 바뀌면 비워집니다.</div>
      <div className="fetch-weather">
        <button className="btn ghost" disabled={loading} onClick={load}>{loading ? '불러오는 중…' : '지금 위치의 날씨 불러오기'}</button>
        {err ? <div className="small err-text" role="alert">{err}</div>
          : todayWeather?.windSpeed != null ? <div className="small muted">불러온 날씨: {weatherLabel(todayWeather)}. 아래에서 고칠 수 있습니다.</div>
          : <div className="small muted">위치 권한을 허용하면 Open-Meteo에서 지금 기온·날씨·바람을 가져옵니다.</div>}
      </div>
      <div className="field">
        <label>날씨</label>
        <div className="chips">
          {SKIES.map((s) => <button key={s} className={`chip ${w.sky === s ? 'on' : ''}`} aria-pressed={w.sky === s} onClick={() => toggle('sky', s)}>{s}</button>)}
        </div>
      </div>
      <div className="field">
        <label htmlFor="temp">기온</label>
        <div className="row temp-row">
          <button className="btn ghost small" aria-label="1도 내리기" onClick={() => setTemp((w.temp ?? 16) - 1)}>−</button>
          <span className="temp-input"><input id="temp" type="text" inputMode="numeric" placeholder="—" value={tempText} onChange={(e) => onTempText(e.target.value)} /><span>°C</span></span>
          <button className="btn ghost small" aria-label="1도 올리기" onClick={() => setTemp((w.temp ?? 14) + 1)}>+</button>
          {w.temp != null && <button className="btn ghost small" onClick={() => setTemp(null)}>지우기</button>}
        </div>
      </div>
      <div className="field">
        <label>바람</label>
        <div className="chips">
          {WIND_LEVELS.map((s) => (
            <button key={s} className={`chip ${w.wind === s ? 'on' : ''}`} aria-pressed={w.wind === s}
              onClick={() => set({ wind: w.wind === s ? null : s, windDir: s === '없음' || w.wind === s ? null : w.windDir, windSpeed: null, windFrom: null })}>{s}</button>
          ))}
        </div>
      </div>
      {w.wind && w.wind !== '없음' && (
        <div className="field">
          <label>바람 방향 <span className="muted">(사대에서 과녁을 볼 때 불어오는 쪽)</span></label>
          <div className="chips">
            {WIND_DIRS.map((s) => <button key={s} className={`chip ${w.windDir === s ? 'on' : ''}`} aria-pressed={w.windDir === s} onClick={() => toggle('windDir', s)}>{s}</button>)}
          </div>
        </div>
      )}
      <div className="field">
        <label>사대 방향 <span className="muted">(사대에서 과녁이 있는 쪽, 한 번만 정하면 됩니다)</span></label>
        <div className="chips">
          {BEARINGS.map(([b, name]) => <button key={b} className={`chip ${bearing === b ? 'on' : ''}`} aria-pressed={bearing === b} onClick={() => setBearing(bearing === b ? null : b)}>{name}</button>)}
        </div>
        {bearing == null && <div className="small muted">정해 두면 불러온 바람을 맞바람·뒷바람·왼쪽·오른쪽으로 바꿔 줍니다.</div>}
      </div>
      <div className="row between">
        <button className="btn ghost small" disabled={!todayWeather} onClick={() => { setTempText(''); updateSettings({ weather: null }); }}>모두 비우기</button>
        <button className="btn small" onClick={onClose}>완료</button>
      </div>
    </Sheet>
  );
}
