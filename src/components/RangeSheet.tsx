import { useState } from 'react';
import { RANGE_RADIUS_M } from '../domain/range';
import type { Place, Range } from '../domain/types';
import { today } from '../domain/util';
import { BEARINGS, relativeWindDir } from '../domain/weather';
import { currentPosition, nearbyArcheryRanges, searchPlaces } from '../platform/weather';
import { kakaoNearbyRanges, kakaoSearchRanges, type FoundRange } from '../platform/kakaoPlaces';
import { distanceM } from '../domain/range';
import { useStore } from '../state/store';
import { ConfirmButton, Sheet, toast } from './ui';

/** 지금 활터 고르기, 새 활터 등록(현재 위치나 지명으로), 사대 방향·이름 고치기, 삭제 */
export function RangeSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { ranges, currentRange, settings, unknownSpot, todayWeather, updateSettings } = store;
  const [cand, setCand] = useState<Place | null>(null);
  const [name, setName] = useState('');
  const [hints, setHints] = useState<FoundRange[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundRange[] | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  const startHere = async () => {
    setErr(''); setBusy(true); setFound(null);
    try {
      const p = unknownSpot ?? await currentPosition();
      setCand({ name: '', lat: p.lat, lon: p.lon });
      // 카카오맵에서 근처 궁도장을 찾고, 키가 없으면 OpenStreetMap에서 찾는다
      const near = (await kakaoNearbyRanges(p.lat, p.lon))
        ?? (await nearbyArcheryRanges(p.lat, p.lon)).map((x) => ({ ...x, address: '', distance: distanceM(p, x) }));
      near.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
      setHints(near.slice(0, 6));
      // 바로 옆(300m 안)에 있는 곳이면 그 이름과 위치를 미리 채운다
      if (near[0] && (near[0].distance ?? Infinity) <= RANGE_RADIUS_M) {
        setName(near[0].name);
        setCand({ name: near[0].name, lat: near[0].lat, lon: near[0].lon });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '위치를 찾지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };
  const find = async () => {
    if (!q.trim()) return;
    setErr(''); setFound(null);
    try {
      // 지금 위치(못 얻으면 지금 활터)를 기준으로 가까운 곳을 먼저 보여 준다
      const here = unknownSpot ?? await currentPosition().catch(() => null) ?? currentRange;
      const r = (await kakaoSearchRanges(q, here)) ?? (await searchPlaces(q)).map((x) => ({ ...x, address: '' }));
      setFound(r);
      if (!r.length) setErr('찾은 곳이 없습니다. 활터 이름이나 시·군·구 이름으로 찾아보세요 (예: 황학정, 전주).');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '위치를 찾지 못했습니다.');
    }
  };
  const add = async () => {
    if (!cand || !name.trim()) { setErr('활터 이름을 입력하세요.'); return; }
    await store.addRange({ name: name.trim(), lat: cand.lat, lon: cand.lon, bearing: null });
    toast(`${name.trim()} 등록했습니다`);
    setCand(null); setName(''); setHints([]); setFound(null); setQ('');
  };
  const setBearing = (r: Range, b: number | null) => {
    const next = { ...r, bearing: b };
    const patch: Parameters<typeof updateSettings>[0] = { ranges: ranges.map((x) => (x.id === r.id ? next : x)) };
    // 불러온 바람이면 새 사대 방향으로 바람 방향을 다시 계산한다
    const w = settings.weather;
    if (w && w.date === today() && todayWeather?.windFrom != null && todayWeather.wind && todayWeather.wind !== '없음') {
      patch.weather = { ...w, windDir: b == null ? null : relativeWindDir(todayWeather.windFrom, b) };
    }
    updateSettings(patch);
  };

  return (
    <Sheet title="활터" onClose={onClose}>
      <div className="small muted">등록한 활터 {RANGE_RADIUS_M}m 안에서 앱을 열면 그 활터를 자동으로 고르고, 저장하는 순마다 활터가 남습니다.</div>

      {ranges.length > 0 && (
        <div className="field">
          <label>지금 활터</label>
          <div className="chips">
            {ranges.map((r) => (
              <button key={r.id} className={`chip ${currentRange?.id === r.id ? 'on' : ''}`} aria-pressed={currentRange?.id === r.id} onClick={() => store.chooseRange(r.id)}>{r.name}</button>
            ))}
            <button className={`chip ${!currentRange ? 'on' : ''}`} onClick={() => store.chooseRange(null)}>활터 없이</button>
          </div>
        </div>
      )}

      {currentRange && (
        <div className="range-cur">
          <div className="field">
            <label>사대 방향 <span className="muted">(사대에서 과녁이 있는 쪽)</span></label>
            <div className="chips">
              {BEARINGS.map(([b, n]) => (
                <button key={b} className={`chip ${currentRange.bearing === b ? 'on' : ''}`} aria-pressed={currentRange.bearing === b}
                  onClick={() => setBearing(currentRange, currentRange.bearing === b ? null : b)}>{n}</button>
              ))}
            </div>
            {currentRange.bearing == null && <div className="small muted">정해 두면 불러온 바람을 맞바람·뒷바람·왼쪽·오른쪽으로 바꿔 줍니다.</div>}
          </div>
          {renaming ? (
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) store.updateRange({ ...currentRange, name: newName.trim() }).then(() => setRenaming(false)); }}>
              <input type="text" maxLength={20} value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="활터 이름" />
              <button className="btn small" type="submit">저장</button>
            </form>
          ) : (
            <div className="row">
              <button className="del edit" onClick={() => { setNewName(currentRange.name); setRenaming(true); }}>이름 고치기</button>
              <ConfirmButton label="이 활터 삭제" confirmLabel="삭제 확인 (기록은 남음)" onConfirm={() => store.deleteRange(currentRange.id).then(() => toast('활터를 지웠습니다'))} />
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label>새 활터 등록</label>
        {unknownSpot && !cand && <div className="small">지금 있는 곳은 등록된 활터가 아닙니다. 활터라면 등록해 두세요.</div>}
        {!cand ? (
          <>
            <button className="btn ghost" disabled={busy} onClick={startHere}>{busy ? '위치 찾는 중…' : '지금 있는 곳을 활터로 등록'}</button>
            <form className="row" onSubmit={(e) => { e.preventDefault(); find(); }}>
              <input type="text" placeholder="또는 이름·지역으로 찾기 (예: 황학정, 전주)" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn ghost small" type="submit">찾기</button>
            </form>
            {found && found.length > 0 && (
              <div className="found-list">{found.map((p) => (
                <button key={`${p.lat},${p.lon}`} className="found" onClick={() => { setCand({ name: p.name, lat: p.lat, lon: p.lon }); setName(p.name); setFound(null); }}>
                  <b>{p.name}</b>
                  <span>{[p.address, p.distance != null ? (p.distance < 1000 ? `${Math.round(p.distance)}m` : `${(p.distance / 1000).toFixed(p.distance < 10000 ? 1 : 0)}km`) : ''].filter(Boolean).join(' · ')}</span>
                </button>
              ))}</div>
            )}
          </>
        ) : (
          <div className="place-pick">
            <div className="small muted">{cand.name ? `${cand.name} 위치로` : '지금 위치로'} 등록합니다.</div>
            {hints.length > 0 && (
              <>
                <div className="small muted">근처 활터</div>
                <div className="chips">{hints.map((h) => (
                  <button key={`${h.lat},${h.lon}`} className={`chip ${name === h.name ? 'on' : ''}`} onClick={() => { setName(h.name); setCand({ name: h.name, lat: h.lat, lon: h.lon }); }}>
                    {h.name}{h.distance != null && <span className="muted"> · {h.distance < 1000 ? `${Math.round(h.distance)}m` : `${(h.distance / 1000).toFixed(1)}km`}</span>}
                  </button>
                ))}</div>
              </>
            )}
            <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
              <input type="text" autoFocus maxLength={20} placeholder="활터 이름 (예: 황학정)" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} />
              <button className="btn small" type="submit">등록</button>
            </form>
            <button className="linkish small" onClick={() => { setCand(null); setHints([]); setName(''); }}>취소</button>
          </div>
        )}
        {err && <div className="small err-text" role="alert">{err}</div>}
      </div>
      <button className="btn small" onClick={onClose}>완료</button>
    </Sheet>
  );
}
