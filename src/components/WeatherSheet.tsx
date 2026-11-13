import { useState } from 'react';
import type { Weather } from '../domain/types';
import { EMPTY_WEATHER, SKIES, WIND_DIRS, WIND_LEVELS } from '../domain/weather';
import { today } from '../domain/util';
import { useStore } from '../state/store';
import { Sheet } from './ui';

/** 오늘 날씨 입력. 모두 선택 사항이고, 고른 값은 다음에 저장하는 순부터 들어간다. */
export function WeatherSheet({ onClose }: { onClose: () => void }) {
  const { todayWeather, updateSettings } = useStore();
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
  const toggle = <K extends keyof Weather>(k: K, v: Weather[K]) => set({ [k]: w[k] === v ? null : v } as Partial<Weather>);

  return (
    <Sheet title="오늘 날씨" onClose={onClose}>
      <div className="small muted">모두 선택 사항입니다. 다음에 저장하는 순부터 들어가고, 날짜가 바뀌면 비워집니다.</div>
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
              onClick={() => set({ wind: w.wind === s ? null : s, windDir: s === '없음' || w.wind === s ? null : w.windDir })}>{s}</button>
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
      <div className="row between">
        <button className="btn ghost small" disabled={!todayWeather} onClick={() => { setTempText(''); updateSettings({ weather: null }); }}>모두 비우기</button>
        <button className="btn small" onClick={onClose}>완료</button>
      </div>
    </Sheet>
  );
}
