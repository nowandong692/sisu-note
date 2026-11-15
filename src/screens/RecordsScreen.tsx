import { useEffect, useState } from 'react';
import { LogScreen } from './LogScreen';
import { StatsScreen } from './StatsScreen';
import { AchievementsView } from './AchievementsView';

type View = 'log' | 'stats' | 'achieve';
const viewOfHash = (): View => (location.hash === '#stats' ? 'stats' : location.hash === '#achieve' ? 'achieve' : 'log');
const SHOW_LOG = 'gukgungrok:show-log';

/** 다른 화면에서 기록 보기(통계 말고)로 보내고 싶을 때 */
// eslint-disable-next-line react-refresh/only-export-components
export function showLogView() { window.dispatchEvent(new Event(SHOW_LOG)); }

/** 기록 탭: 날짜별 기록, 통계, 업적을 맨 위 전환으로 오간다. 주소 끝은 #log / #stats / #achieve */
export function RecordsScreen() {
  const [view, setView] = useState<View>(viewOfHash);
  useEffect(() => {
    // 습사 탭에서 지난 순 고치기를 마치면 기록 쪽을 보여 준다. 탭만 옮길 때는 보던 쪽을 그대로 둔다
    const on = () => setView('log');
    window.addEventListener(SHOW_LOG, on);
    return () => window.removeEventListener(SHOW_LOG, on);
  }, []);
  const pick = (v: View) => {
    if (v === view) return;
    history.replaceState(history.state, '', `${location.pathname}${location.search}#${v}`);
    setView(v);
    window.scrollTo(0, 0);
  };
  return (
    <>
      <div className="seg view-switch" role="group" aria-label="보기">
        <button className={view === 'log' ? 'on' : ''} aria-pressed={view === 'log'} onClick={() => pick('log')}>기록</button>
        <button className={view === 'stats' ? 'on' : ''} aria-pressed={view === 'stats'} onClick={() => pick('stats')}>통계</button>
        <button className={view === 'achieve' ? 'on' : ''} aria-pressed={view === 'achieve'} onClick={() => pick('achieve')}>업적</button>
      </div>
      <div className="screen" hidden={view !== 'log'}><LogScreen /></div>
      <div className="screen" hidden={view !== 'stats'}><StatsScreen /></div>
      <div className="screen" hidden={view !== 'achieve'}><AchievementsView toLog={() => pick('log')} active={view === 'achieve'} /></div>
    </>
  );
}
