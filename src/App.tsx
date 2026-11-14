import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ConfirmButton, Sheet, ToastHost, toast } from './components/ui';
import { formatDate, today } from './domain/util';
import { GearScreen } from './screens/GearScreen';
import { LogScreen } from './screens/LogScreen';
import { RankingScreen } from './screens/RankingScreen';
import { ShootScreen } from './screens/ShootScreen';
import { StatsScreen } from './screens/StatsScreen';
import { useStore } from './state/store';
import { useAutoWeather } from './state/weatherSync';

type Tab = 'shoot' | 'log' | 'stats' | 'rank' | 'gear';
const TABS: [Tab, string, string][] = [
  ['shoot', '습사', '오늘 습사'],
  ['log', '기록', '기록'],
  ['stats', '통계', '통계'],
  ['rank', '랭킹', '랭킹'],
  ['gear', '장비', '내 장비'],
];

const ICONS: Record<Tab, React.ReactNode> = {
  shoot: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="3" width="14" height="18" rx="1" /><rect x="8" y="5.5" width="8" height="2.5" /><circle cx="12" cy="15" r="3" /></svg>,
  log: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>,
  stats: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  rank: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4" /></svg>,
  gear: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3c6 4 6 14 0 18M6 3v18" /><path d="M6 12h14M17 9l3 3-3 3" /></svg>,
};

/** 탭은 주소 끝(#log 같은)에 남겨서 새로 고쳐도, 앱 뒤로가기를 눌러도 자연스럽게 움직이게 한다. */
function readTab(): Tab {
  const h = location.hash.slice(1);
  return (TABS.some(([t]) => t === h) ? h : 'shoot') as Tab;
}

export default function App() {
  const store = useStore();
  useAutoWeather();
  const [tab, setTab] = useState<Tab>(readTab);
  const tabRef = useRef(tab);
  const editingRef = useRef(!!store.editId);
  editingRef.current = !!store.editId;
  /** 탭마다 마지막 스크롤 위치. 돌아오면 그 자리에서 보여 준다. */
  const scrolls = useRef<Partial<Record<Tab, number>>>({});
  /** 고치는 중에 떠나려는 곳: 탭, 또는 뒤로 가기 */
  const [leaving, setLeaving] = useState<Tab | 'back' | null>(null);
  const skipGuardBack = useRef(false);

  const show = (t: Tab) => {
    if (t === tabRef.current) return;
    scrolls.current[tabRef.current] = window.scrollY;
    tabRef.current = t;
    setTab(t);
  };

  // 화면은 모두 떠 있고 숨겨 둘 뿐이라, 스크롤 위치만 돌려놓으면 떠날 때 모습 그대로 보인다.
  // 다른 탭에서 순 고치기를 눌러 습사 탭으로 왔을 때는 맨 위(입력 칸)에서 시작한다.
  useLayoutEffect(() => {
    window.scrollTo(0, tab === 'shoot' && editingRef.current ? 0 : scrolls.current[tab] ?? 0);
  }, [tab]);

  useEffect(() => {
    const onHash = () => {
      const t = readTab();
      if (t === tabRef.current) return;
      if (tabRef.current === 'shoot' && editingRef.current) {
        // 고치는 중이면 습사 탭에 머물게 되돌리고 물어본다
        history.pushState(null, '', location.pathname + location.search);
        setLeaving(t);
        return;
      }
      show(t);
    };
    const onPop = () => {
      // 고치기를 시작할 때 넣어 둔 기록 한 칸 덕분에, 뒤로 가기를 누르면 앱을 떠나기 전에 여기서 먼저 잡힌다
      if (editingRef.current && tabRef.current === 'shoot' && readTab() === 'shoot' && !history.state?.editGuard) {
        history.pushState({ editGuard: true }, '');
        setLeaving('back');
      }
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onPop); };
  }, []);

  // 고치기를 시작하면 뒤로 가기를 한 번 받아 낼 기록을 넣고, 끝나면 그 기록을 치운다
  useEffect(() => {
    if (store.editId && readTab() === 'shoot' && !history.state?.editGuard) history.pushState({ editGuard: true }, '');
    if (!store.editId && history.state?.editGuard && !skipGuardBack.current && readTab() === 'shoot') history.back();
    skipGuardBack.current = false;
  }, [store.editId]);

  // 고치는 중에 창을 닫거나 새로 고치면 브라우저가 한 번 확인한다
  useEffect(() => {
    if (!store.editId) return;
    const on = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', on);
    return () => window.removeEventListener('beforeunload', on);
  }, [store.editId]);

  const go = (t: Tab) => {
    if (t === tab) return;
    if (tab === 'shoot' && store.editId) { setLeaving(t); return; }
    location.hash = t === 'shoot' ? '' : t;
    show(t);
  };

  const leave = async (saveFirst: boolean) => {
    const target = leaving;
    setLeaving(null);
    if (!target) return;
    if (saveFirst) await store.editSaver.current?.save();
    skipGuardBack.current = true;
    store.setEditId(null);
    editingRef.current = false;
    if (target === 'back') { history.go(-2); return; }
    location.hash = target === 'shoot' ? '' : target;
    show(target);
  };
  const editingEnd = store.editId ? store.ends.find((e) => e.id === store.editId) ?? null : null;
  const editingNo = editingEnd ? store.ends.filter((e) => e.date === editingEnd.date && e.recordedAt <= editingEnd.recordedAt).length : 0;
  const canSave = !!store.editSaver.current?.canSave;

  const firstRun = store.loaded && !store.ends.length && !store.gear.length;

  return (
    <>
      <div className="app">
        {/* 습사 화면은 과녁이 한 화면에 들어오도록 제목 줄을 빼고, 날짜는 순 제목 옆에 둔다 */}
        {tab !== 'shoot' && (
          <header className="top">
            <h1>{TABS.find(([t]) => t === tab)![2]}</h1>
            <span className="date">{formatDate(today())}</span>
          </header>
        )}
        {store.error && <div className="error" role="alert">{store.error}</div>}
        {store.loaded && store.rangeOffer && (
          <div className="banner range-offer" role="status">
            <span>근처에 <b>{'range' in store.rangeOffer ? store.rangeOffer.range.name : store.rangeOffer.place.name}</b>이(가) 있습니다. 지금 활터{store.currentRange ? `(${store.currentRange.name})` : ''}를 바꿀까요?{'place' in store.rangeOffer && <span className="muted"> (새로 등록됩니다)</span>}</span>
            <span className="row nowrap">
              <button onClick={() => store.acceptOffer().then(() => toast('활터를 바꿨습니다'))}>바꾸기</button>
              <button className="quiet" onClick={store.dismissOffer}>그대로</button>
            </span>
          </div>
        )}
        {!store.loaded ? <div className="loading">불러오는 중…</div> : (
          <>
            {/* 탭을 옮겨도 화면을 지우지 않고 숨겨 둔다. 펼친 날짜, 검색어, 스크롤 위치가 그대로 남는다. */}
            <div className="screen" hidden={tab !== 'shoot'}><ShootScreen /></div>
            <div className="screen" hidden={tab !== 'log'}><LogScreen /></div>
            <div className="screen" hidden={tab !== 'stats'}><StatsScreen /></div>
            <div className="screen" hidden={tab !== 'rank'}><RankingScreen active={tab === 'rank'} /></div>
            <div className="screen" hidden={tab !== 'gear'}><GearScreen /></div>
            {firstRun && tab !== 'gear' && tab !== 'rank' && (
              <section className="card setup">
                <h2>처음 오셨나요?</h2>
                <div className="small muted">장비 탭에서 활·깍지·화살·현을 별명으로 등록하면 장비별로 시수를 비교할 수 있습니다. 먼저 둘러보려면 두 달치 예시 기록을 넣어 보세요. 나중에 장비 탭에서 지울 수 있습니다.</div>
                <div className="row">
                  <button className="btn ghost small" onClick={() => go('gear')}>장비 등록하기</button>
                  <ConfirmButton className="btn ghost small" label="예시 기록 넣기" confirmLabel="예시 기록 넣기 (확인)" onConfirm={() => store.loadSample().then(() => toast('예시 기록을 불러왔습니다'))} />
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <nav className="tabs" aria-label="화면 이동">
        <div className="in">
          {TABS.map(([t, label]) => (
            <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => go(t)}>
              {ICONS[t]}{label}
            </button>
          ))}
        </div>
      </nav>
      {leaving && editingEnd && (
        <Sheet title="고치는 중입니다" onClose={() => setLeaving(null)}>
          <div className="small"><b>{formatDate(editingEnd.date)} {editingNo}순</b>을 고치고 있습니다. 고친 내용을 저장하고 이동할까요?</div>
          <button className="btn" disabled={!canSave} onClick={() => leave(true)}>저장하고 이동</button>
          {!canSave && <div className="small muted">5시를 모두 입력해야 저장할 수 있습니다.</div>}
          <button className="btn ghost" onClick={() => leave(false)}>저장하지 않고 이동</button>
          <button className="btn ghost small" onClick={() => setLeaving(null)}>계속 고치기</button>
        </Sheet>
      )}
      <ToastHost />
    </>
  );
}
