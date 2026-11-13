import { useState } from 'react';
import type { Weather } from '../domain/types';
import { EMPTY_WEATHER, SKIES, WIND_DIRS, WIND_LEVELS, weatherLabel } from '../domain/weather';
import { loadWeather } from '../state/weatherSync';
import { today } from '../domain/util';
import { useStore } from '../state/store';
import { Sheet } from './ui';

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 전`;
}

/** 오늘 날씨 입력. 모두 선택 사항이고, 고른 값은 다음에 저장하는 순부터 들어간다. */
export function WeatherSheet({ onClose }: { onClose: () => void }) {
  const { todayWeather, updateSettings, settings } = useStore();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const { currentRange, setUnknownSpot } = useStore();
  const w = todayWeather ?? EMPTY_WEATHER;
  const meta = settings.weather?.date === today() ? settings.weather : null;
  const [tempText, setTempText] = useState(w.temp == null ? '' : String(w.temp));
  // 자동으로 새로 불러와 기온이 바뀌면 입력 칸도 맞춘다
  const [tempSeen, setTempSeen] = useState(w.temp);
  if (w.temp !== tempSeen) { setTempSeen(w.temp); setTempText(w.temp == null ? '' : String(w.temp)); }

  /** 직접 고친 값은 자동으로 덮어쓰지 않도록 표시해 둔다 */
  const set = (patch: Partial<Weather>) => updateSettings({ weather: { ...w, ...patch, date: today(), fetchedAt: meta?.fetchedAt ?? null, source: meta?.source ?? null, manual: true } });
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
      await loadWeather(settings, updateSettings, setUnknownSpot);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '날씨를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };
  const toggle = <K extends keyof Weather>(k: K, v: Weather[K]) => set({ [k]: w[k] === v ? null : v } as Partial<Weather>);

  return (
    <Sheet title="오늘 날씨" onClose={onClose}>
      <div className="small muted">모두 선택 사항입니다. 다음에 저장하는 순부터 들어가고, 날짜가 바뀌면 비워집니다.</div>
      <div className="fetch-weather">
        <button className="btn ghost" disabled={loading} onClick={load}>{loading ? '불러오는 중…' : meta?.fetchedAt ? '지금 다시 불러오기' : '지금 날씨 불러오기'}</button>
        {err ? <div className="small err-text" role="alert">{err}</div>
          : meta?.fetchedAt ? (
            <div className="small muted">
              {ago(meta.fetchedAt)} 불러옴{meta.source && ` (${meta.source})`}: {weatherLabel(todayWeather)}.{' '}
              {meta.manual ? '직접 고친 값이 있어 자동으로 바꾸지 않습니다. 다시 불러오면 자동 갱신이 다시 켜집니다.' : '앱을 켜 두면 30분마다 새로 불러옵니다.'}
            </div>
          )
          : <div className="small muted">앱을 열 때와 30분마다 휴대폰 위치(못 찾으면 지금 활터)의 기온·날씨·바람을 자동으로 불러옵니다. 직접 고친 값은 덮어쓰지 않습니다.</div>}
        {err && !currentRange && <div className="small muted">휴대폰 위치를 쓸 수 없으면 "활터" 줄에서 활터를 지명으로 등록해 두세요. 그 위치의 날씨를 불러옵니다.</div>}
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
      {w.wind && w.wind !== '없음' && w.windFrom != null && !currentRange?.bearing && currentRange?.bearing !== 0 && (
        <div className="small muted">활터의 사대 방향을 정해 두면 불러온 바람을 맞바람·뒷바람·왼쪽·오른쪽으로 바꿔 줍니다 ("활터" 줄에서).</div>
      )}
      <div className="row between">
        <button className="btn ghost small" disabled={!todayWeather} onClick={() => { setTempText(''); updateSettings({ weather: { ...EMPTY_WEATHER, date: today(), manual: true } }); }}>모두 비우기</button>
        <button className="btn small" onClick={onClose}>완료</button>
      </div>
    </Sheet>
  );
}
