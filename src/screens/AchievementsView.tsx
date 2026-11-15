import { useMemo, useState } from 'react';
import { HelpButton } from '../components/ui';
import { MOLGI_STREAK_MAX, STREAK_MAX, achievements, type Achievement } from '../domain/achievements';
import { formatDate } from '../domain/util';
import { useStore } from '../state/store';
import { focusLogEnd } from './LogScreen';

const fullDate = (s: string) => `${s.slice(0, 4)}년 ${formatDate(s)}`;
const when = (a: Achievement) => (a.date ? `${fullDate(a.date)} · ${a.endNo}순` : '');

/** 업적을 이룬 순을 기록 보기에서 펼쳐 보여 준다 */
function openEnd(a: Achievement, toLog: () => void) {
  if (!a.date || !a.endId) return;
  focusLogEnd(a.date, a.endId);
  toLog();
}

/** 초몰기·3연몰: 크게, 이룬 날짜와 함께 */
function Feature({ a, hint, sub, toLog }: { a: Achievement; hint: string; sub?: string; toLog: () => void }) {
  return (
    <button className={`feat ${a.date ? 'on' : ''}`} disabled={!a.date} onClick={() => openEnd(a, toLog)}>
      <span className="feat-badge" aria-hidden>{a.date ? '中' : '·'}</span>
      <b className="feat-name">{a.name}</b>
      {sub && <span className="feat-sub">{sub}</span>}
      {a.date
        ? <span className="feat-when">{fullDate(a.date)}<br />{a.endNo}순째</span>
        : <span className="feat-when">{hint}</span>}
    </button>
  );
}

function Row({ a, toLog }: { a: Achievement; toLog: () => void }) {
  return (
    <li className={`ach-row ${a.date ? 'on' : ''}`}>
      <button disabled={!a.date} onClick={() => openEnd(a, toLog)}>
        <span className="ach-dot" aria-hidden />
        <span className="ach-name">{a.name}<span className="small muted"> {a.desc}</span></span>
        <span className="ach-when">{a.date ? `${a.date.slice(2).replace(/-/g, '.')} · ${a.endNo}순` : '아직'}</span>
      </button>
    </li>
  );
}

export function AchievementsView({ toLog }: { toLog: () => void }) {
  const { ends } = useStore();
  const r = useMemo(() => achievements(ends), [ends]);
  const [pick, setPick] = useState<string | null>(null);
  const firsts = r.list.filter((a) => a.group === 'first' && !a.special);
  const streaks = r.list.filter((a) => a.group === 'streak');
  const molgis = r.list.filter((a) => a.group === 'molgi');
  const chomolgi = r.list.find((a) => a.id === 'chomolgi')!;
  const sam = r.list.find((a) => a.id === 'molgi3')!;
  const done = r.list.filter((a) => a.date).length;
  const picked = streaks.find((a) => a.id === pick && a.date);
  const nextStreak = streaks.find((a) => !a.date);
  const bestHit = firsts.filter((a) => a.date).length - 1;

  if (!r.counted) {
    return (
      <section className="card">
        <h2>업적</h2>
        <div className="empty small">
          {ends.length ? '예시 기록은 업적에 들어가지 않습니다. 직접 쏜 순을 저장하면 집궁부터 시작합니다.' : '첫 순을 저장하면 집궁 업적부터 시작합니다.'}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <div className="row between">
          <h2>업적 <span className="muted small">{done} / {r.list.length}</span></h2>
          <HelpButton title="업적은 이렇게 셉니다">
            <p>저장한 순을 날짜와 저장한 차례대로 보고 계산합니다. 예시 기록은 넣지 않습니다.</p>
            <p><b>첫 1중~4중</b>은 한 순에서 그 시수 이상을 처음 낸 순입니다. 처음부터 3중을 내면 1중·2중·3중을 함께 이룹니다.</p>
            <p><b>연중·연몰</b>은 같은 날 안에서만 이어 셉니다. 순이 바뀌어도 이어지고, 날이 바뀌면 처음부터 셉니다.</p>
            <p>지난 순을 고치거나 지우면 업적도 다시 계산합니다.</p>
          </HelpButton>
        </div>
        <div className="feats">
          <Feature a={chomolgi} toLog={toLog} sub="첫 5시 5중" hint={bestHit ? `아직 · 한 순 최고 ${bestHit}중` : '아직'} />
          <Feature a={sam} toLog={toLog} sub="15시 15중" hint={r.bestMolgi ? `아직 · 가장 긴 연몰 ${r.bestMolgi}순` : '아직'} />
        </div>
      </section>

      <section className="card">
        <h2>첫 기록</h2>
        <ul className="ach-list">{firsts.map((a) => <Row key={a.id} a={a} toLog={toLog} />)}</ul>
      </section>

      <section className="card">
        <div className="row between">
          <h2>연중</h2>
          <span className="small muted">가장 긴 연중 <b className="ink">{r.bestStreak}시</b></span>
        </div>
        <div className="streak-grid" role="list" aria-label={`2연중부터 ${STREAK_MAX}연중까지`}>
          {streaks.map((a) => (
            <button key={a.id} role="listitem" className={`${a.date ? 'on' : ''} ${pick === a.id ? 'sel' : ''}`}
              aria-label={`${a.name} ${a.date ? when(a) : '아직'}`} onClick={() => setPick(pick === a.id ? null : a.id)}>
              {a.name.replace('연중', '')}
            </button>
          ))}
        </div>
        <div className="small muted streak-note">
          {picked
            ? <><b className="ink">{picked.name}</b> {when(picked)} <button className="link" onClick={() => openEnd(picked, toLog)}>그 순 보기</button></>
            : nextStreak ? <>다음 목표 <b className="ink">{nextStreak.name}</b>. 이룬 칸을 누르면 날짜가 보입니다.</> : <>{STREAK_MAX}연중까지 모두 이뤘습니다.</>}
        </div>
      </section>

      <section className="card">
        <div className="row between">
          <h2>연몰기</h2>
          <span className="small muted">가장 긴 연몰 <b className="ink">{r.bestMolgi}순</b></span>
        </div>
        <ul className="ach-list">{molgis.map((a) => <Row key={a.id} a={a} toLog={toLog} />)}</ul>
        <div className="small muted">{MOLGI_STREAK_MAX}연몰(50시 50중)까지 있습니다.</div>
      </section>
    </>
  );
}
