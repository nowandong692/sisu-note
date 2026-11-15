import { useEffect, useMemo, useRef, useState } from 'react';
import { HelpButton } from '../components/ui';
import { MOLGI_STREAK_MAX, STREAK_MAX, DAY_RUN_STEPS, MONTH_DAYS_GOAL, TOTAL_ENDS_STEPS, TOTAL_MOLGI_STEPS, achievements, myRankResult, rankPeriodsToFetch, type Achievement, type RankHistory } from '../domain/achievements';
import type { ArcherTotal } from '../domain/ranking';
import { onlineAvailable, rpc } from '../platform/online';
import { formatDate, today } from '../domain/util';
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
  const short = a.date ? a.date.slice(2).replace(/-/g, '.') : '';
  const label = !a.date ? '아직'
    : !a.label ? `${short} · ${a.endNo}순`
    : `${a.label.endsWith('월') ? `${short.slice(0, 2)}년 ${Number(short.slice(3, 5))}월` : a.label.endsWith('주') ? `${short} 주` : short}${a.times && a.times > 1 ? ` · ${a.times}회` : ''}`;
  return (
    <li className={`ach-row ${a.date ? 'on' : ''}`}>
      <button disabled={!a.date || !a.endId} onClick={() => openEnd(a, toLog)} title={a.label}>
        <span className="ach-dot" aria-hidden />
        <span className="ach-name">{a.name}<span className="small muted"> {a.desc}</span></span>
        <span className="ach-when">{label}</span>
      </button>
    </li>
  );
}

/** 연중·연몰처럼 이어지는 단계: 숫자 칸으로 보이고, 누르면 이룬 날짜가 아래에 나온다 */
function StepGrid({ items, unit, max, toLog }: { items: Achievement[]; unit: string; max: number; toLog: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const picked = items.find((a) => a.id === pick && a.date);
  const next = items.find((a) => !a.date);
  return (
    <>
      <div className="streak-grid" role="list" aria-label={`2${unit}부터 ${max}${unit}까지`}>
        {items.map((a) => (
          <button key={a.id} role="listitem" className={`${a.date ? 'on' : ''} ${a.special ? 'sp' : ''} ${pick === a.id ? 'sel' : ''}`}
            aria-label={`${a.name} ${a.date ? when(a) : '아직'}`} onClick={() => setPick(pick === a.id ? null : a.id)}>
            {a.id.replace(/\D/g, '')}
          </button>
        ))}
      </div>
      <div className="small muted streak-note">
        {picked
          ? <><b className="ink">{picked.name}</b> {when(picked)} <button className="link" onClick={() => openEnd(picked, toLog)}>그 순 보기</button></>
          : next ? <>다음 목표 <b className="ink">{next.name}</b> · {next.desc}. 이룬 칸을 누르면 날짜가 보입니다.</> : <>{max}{unit}까지 모두 이뤘습니다.</>}
      </div>
    </>
  );
}

interface ServerRow { nickname: string; range_name: string | null; ends: number; hits: number; seq: boolean[] | null; me: boolean }

/**
 * 업적 보기를 열 때 끝난 랭킹 기간의 내 결과를 받아 이 기기에 모아 둔다.
 * 한 번에 너무 많이 부르지 않게 열 때마다 최대 MAX_FETCH 기간까지만 받는다 (나머지는 다음에).
 */
const MAX_FETCH = 30;

/** 누적 단계까지 얼마나 왔는지 막대로 */
function Progress({ label, value, unit, steps, names }: { label: string; value: number; unit: string; steps: number[]; names: Achievement[] }) {
  const i = steps.findIndex((n) => value < n);
  const goal = i < 0 ? steps[steps.length - 1] : steps[i];
  const from = i <= 0 ? 0 : steps[i - 1];
  const pct = i < 0 ? 100 : Math.round(((value - from) / (goal - from)) * 100);
  return (
    <div className="ach-prog">
      <div className="row between small">
        <span>{label} <b>{value.toLocaleString()}{unit}</b></span>
        <span className="muted">{i < 0 ? '모두 이뤘습니다' : `${names[i].name}까지 ${(goal - value).toLocaleString()}${unit}`}</span>
      </div>
      <div className="ach-track" aria-hidden><div className="fill" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
function useRankHistory(active: boolean): { history: RankHistory; joined: boolean; syncing: boolean } {
  const { ends, online, onlinePending, settings, updateSettings } = useStore();
  const history = useMemo(() => settings.rankHistory ?? {}, [settings.rankHistory]);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    // 아직 서버에 올리지 못한 순이 있으면 기다린다. 그 전에 받으면 빠진 결과가 그대로 굳는다
    if (!active || !online || onlinePending > 0 || !onlineAvailable() || busy.current) return;
    const todo = rankPeriodsToFetch(ends, online.joinedAt, today(), history).slice(0, MAX_FETCH);
    if (!todo.length) return;
    busy.current = true;
    setSyncing(true);
    (async () => {
      const got: RankHistory = {};
      for (const { period, start } of todo) {
        try {
          const rows = await rpc<ServerRow[]>('period_totals', { p_period: period, p_date: start, p_key: online.key });
          const totals: ArcherTotal[] = rows.map((x) => ({ name: x.nickname, range: x.range_name, ends: x.ends, hits: x.hits, seq: x.seq ?? [], me: x.me }));
          got[`${period}:${start}`] = myRankResult(totals, period);
        } catch { break; /* 인터넷이 없으면 다음에 */ }
      }
      if (Object.keys(got).length) await updateSettings({ rankHistory: { ...history, ...got } });
    })().finally(() => { busy.current = false; setSyncing(false); });
  }, [active, online, onlinePending, ends, history, updateSettings]);
  return { history, joined: !!online && onlineAvailable(), syncing };
}

export function AchievementsView({ toLog, active }: { toLog: () => void; active: boolean }) {
  const { ends, gear } = useStore();
  const { history, joined, syncing } = useRankHistory(active);
  const r = useMemo(() => achievements(ends, history, today(), gear), [ends, history, gear]);
  const firsts = r.list.filter((a) => a.group === 'first' && !a.special);
  const streaks = r.list.filter((a) => a.group === 'streak');
  const molgis = r.list.filter((a) => a.group === 'molgi');
  const ranks = r.list.filter((a) => a.group === 'rank');
  const totals = r.list.filter((a) => a.group === 'total');
  const steady = r.list.filter((a) => a.group === 'steady');
  const challenges = r.list.filter((a) => a.group === 'challenge');
  const chomolgi = r.list.find((a) => a.id === 'chomolgi')!;
  const sam = r.list.find((a) => a.id === 'molgi3')!;
  const baekbal = r.list.find((a) => a.id === `molgi${MOLGI_STREAK_MAX}`)!;
  const done = r.list.filter((a) => a.date).length;
  const bestHit = firsts.filter((a) => a.date).length - 1;
  const molgiHint = r.bestMolgi ? `아직 · 가장 긴 연몰 ${r.bestMolgi}순` : '아직';

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
            <p><b>연중·연몰</b>은 같은 날 안에서만 이어 셉니다. 순이 바뀌어도 이어지고, 날이 바뀌면 처음부터 셉니다. 20연몰(100시 100중)은 <b>백발백중</b>입니다.</p>
            <p><b>랭킹</b>은 겨루기에 참여한 뒤 끝난 기간(어제까지의 일간, 지난주, 지난달)만 셉니다. 기간이 끝나야 순위가 정해지기 때문입니다.</p>
            <p><b>꾸준함</b>은 순을 하나라도 저장한 날을 습사한 날로 칩니다. 연속 습사는 오늘이나 어제까지 이어져 있어야 지금 이어지는 것으로 봅니다.</p>
            <p><b>15시 10중</b>은 같은 날 잇따라 쏜 3순을 합쳐 10중 이상이면 이룹니다. <b>강풍·우중·각궁 몰기</b>와 <b>활터</b>는 날씨·활·활터를 남긴 순에서만 셉니다.</p>
            <p>지난 순을 고치거나 지우면 업적도 다시 계산합니다.</p>
          </HelpButton>
        </div>
        <div className="feats">
          <Feature a={chomolgi} toLog={toLog} sub="첫 5시 5중" hint={bestHit ? `아직 · 한 순 최고 ${bestHit}중` : '아직'} />
          <Feature a={sam} toLog={toLog} sub="15시 15중" hint={molgiHint} />
          <Feature a={baekbal} toLog={toLog} sub="20연몰 · 100시 100중" hint={molgiHint} />
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
        <StepGrid items={streaks} unit="연중" max={STREAK_MAX} toLog={toLog} />
      </section>

      <section className="card">
        <div className="row between">
          <h2>연몰기</h2>
          <span className="small muted">가장 긴 연몰 <b className="ink">{r.bestMolgi}순</b></span>
        </div>
        <StepGrid items={molgis} unit="연몰" max={MOLGI_STREAK_MAX} toLog={toLog} />
      </section>

      <section className="card">
        <h2>누적</h2>
        <Progress label="습사량" value={r.totalEnds} unit="순" steps={TOTAL_ENDS_STEPS} names={totals.filter((a) => a.id.startsWith('ends'))} />
        <Progress label="몰기" value={r.totalMolgi} unit="회" steps={TOTAL_MOLGI_STEPS} names={totals.filter((a) => a.id.startsWith('molgicount'))} />
        <ul className="ach-list">{totals.map((a) => <Row key={a.id} a={a} toLog={toLog} />)}</ul>
      </section>

      <section className="card">
        <div className="row between">
          <h2>꾸준함</h2>
          <span className="small muted">가장 긴 연속 <b className="ink">{r.bestDayRun}일</b></span>
        </div>
        <Progress label="지금 연속" value={r.dayRun} unit="일" steps={DAY_RUN_STEPS} names={steady.filter((a) => a.id.startsWith('dayrun'))} />
        <Progress label="이번 달" value={r.monthDays} unit="일" steps={[MONTH_DAYS_GOAL]} names={steady.filter((a) => a.id === 'month20')} />
        <ul className="ach-list">{steady.map((a) => <Row key={a.id} a={a} toLog={toLog} />)}</ul>
      </section>

      <section className="card">
        <h2>도전</h2>
        <ul className="ach-list">{challenges.map((a) => <Row key={a.id} a={a} toLog={toLog} />)}</ul>
        <div className="small muted">날씨·활·활터 업적은 그것을 남긴 순에서만 셉니다.</div>
      </section>

      <section className="card">
        <div className="row between">
          <h2>랭킹</h2>
          {syncing && <span className="small muted">랭킹 결과 받는 중…</span>}
        </div>
        {!joined && <div className="small muted">겨루기 탭에서 온라인 랭킹에 참여하면, 참여한 뒤의 순위로 업적을 받습니다.</div>}
        <ul className="ach-list">{ranks.map((a) => <Row key={a.id} a={a} toLog={toLog} />)}</ul>
      </section>
    </>
  );
}
