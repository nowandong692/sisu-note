import { useEffect, useState } from 'react';
import { ConfirmButton, ToastHost, toast } from './components/ui';
import { formatDate, today } from './domain/util';
import { GearScreen } from './screens/GearScreen';
import { LogScreen } from './screens/LogScreen';
import { ShootScreen } from './screens/ShootScreen';
import { StatsScreen } from './screens/StatsScreen';
import { useStore } from './state/store';
import { useAutoWeather } from './state/weatherSync';

type Tab = 'shoot' | 'log' | 'stats' | 'gear';
const TABS: [Tab, string, string][] = [
  ['shoot', '습사', '오늘 습사'],
  ['log', '기록', '기록'],
  ['stats', '통계', '통계'],
  ['gear', '장비', '내 장비'],
];

const ICONS: Record<Tab, React.ReactNode> = {
  shoot: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="3" width="14" height="18" rx="1" /><rect x="8" y="5.5" width="8" height="2.5" /><circle cx="12" cy="15" r="3" /></svg>,
  log: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>,
  stats: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
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

  useEffect(() => {
    const on = () => setTab(readTab());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (t: Tab) => {
    if (t === tab) return;
    location.hash = t === 'shoot' ? '' : t;
    setTab(t);
    window.scrollTo(0, 0);
  };

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
        {!store.loaded ? <div className="loading">불러오는 중…</div> : (
          <>
            {tab === 'shoot' && <ShootScreen />}
            {tab === 'log' && <LogScreen />}
            {tab === 'stats' && <StatsScreen />}
            {tab === 'gear' && <GearScreen />}
            {firstRun && tab !== 'gear' && (
              <section className="card setup">
                <h2>처음 오셨나요?</h2>
                <div className="small muted">장비 탭에서 활·깍지·화살을 별명으로 등록하면 장비별로 시수를 비교할 수 있습니다. 먼저 둘러보려면 두 달치 예시 기록을 넣어 보세요. 나중에 장비 탭에서 지울 수 있습니다.</div>
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
      <ToastHost />
    </>
  );
}
