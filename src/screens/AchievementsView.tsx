import { useEffect, useMemo, useRef, useState } from 'react';
import { HelpButton, Sheet, toast } from '../components/ui';
import { GradeMark } from '../components/GradeMark';
import { GRADES, GRADE_HOLD_DAYS, GRADE_WINDOW, gradeTitle, hitsToNext } from '../domain/grade';
import { MOLGI_STREAK_MAX, DAY_RUN_STEPS, MONTH_DAYS_GOAL, TOTAL_ENDS_STEPS, TOTAL_MOLGI_STEPS, achievements, myRankResult, rankPeriodsToFetch, type Achievement, type RankHistory } from '../domain/achievements';
import type { ArcherTotal } from '../domain/ranking';
import { onlineAvailable, rpc } from '../platform/online';
import { formatDate, today } from '../domain/util';
import { useStore } from '../state/store';
import { focusLogEnd } from './LogScreen';

const fullDate = (s: string) => `${s.slice(0, 4)}년 ${formatDate(s)}`;

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
  const when = !a.date ? ''
    : !a.label ? `${short} · ${a.endNo}순`
    : `${a.label.endsWith('월') ? `${short.slice(0, 2)}년 ${Number(short.slice(3, 5))}월` : a.label.endsWith('주') ? `${short} 주` : short}${a.times && a.times > 1 ? ` · ${a.times}회` : ''}`;
  return (
    <li className={`ach-row ${a.date ? 'on' : ''} ${a.special ? 'sp' : ''}`}>
      <button disabled={!a.date || !a.endId} onClick={() => openEnd(a, toLog)} title={a.label}
        aria-label={`${a.name}, ${a.desc}, ${a.date ? `달성 ${when}` : '미달성'}`}>
        <span className="ach-check" aria-hidden>{a.date ? '✓' : ''}</span>
        <span className="ach-text">
          <b>{a.name}{a.special && <span className="pill best">특기</span>}</b>
          <span className="ach-req">{a.desc}</span>
        </span>
        <span className="ach-when">{a.date ? <>달성<br />{when}</> : '미달성'}</span>
      </button>
    </li>
  );
}

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');

/** 대표 칭호 고르기: 이룬 업적 가운데 하나. 특기할 것부터 */
function TitleSheet({ list, current, onPick, onClose }: { list: Achievement[]; current: string | null; onPick: (id: string | null) => void; onClose: () => void }) {
  const done = list.filter((a) => a.date);
  const sorted = [...done.filter((a) => a.special), ...done.filter((a) => !a.special).reverse()];
  return (
    <Sheet title="대표 칭호 고르기" onClose={onClose}>
      <div className="small muted">이룬 업적 하나를 칭호로 답니다. 랭킹에서 닉네임 옆에 보입니다.</div>
      {sorted.length
        ? <ul className="title-list">{sorted.map((a) => (
          <li key={a.id}>
            <button className={a.id === current ? 'on' : ''} aria-pressed={a.id === current} onClick={() => onPick(a.id)}>
              <b>{a.name}{a.special && <span className="pill best">특기</span>}</b>
              <span className="small muted">{a.desc}</span>
            </button>
          </li>
        ))}</ul>
        : <div className="small muted">아직 이룬 업적이 없습니다. 첫 순을 저장하면 집궁부터 달 수 있습니다.</div>}
      {current && <button className="btn ghost" onClick={() => onPick(null)}>칭호 떼기</button>}
      <button className="btn ghost" onClick={onClose}>닫기</button>
    </Sheet>
  );
}

/** 내 등급(과녁 테두리)과 대표 칭호 */
function GradeCard({ list }: { list: Achievement[] }) {
  const { grade: r, title, settings, setTitle, online } = useStore();
  const [picking, setPicking] = useState(false);
  const g = r.grade;
  const more = hitsToNext(r);
  const pct = !g ? Math.round((r.counted / GRADE_WINDOW) * 100)
    : !r.next || r.per15 == null ? 100
    : Math.max(0, Math.min(100, Math.round(((r.per15 - g.min) / (r.next.min - g.min)) * 100)));
  const pick = (id: string | null) => {
    void setTitle(id).then(() => toast(id ? `대표 칭호를 ${list.find((a) => a.id === id)?.name}(으)로 달았습니다` : '대표 칭호를 뗐습니다'));
    setPicking(false);
  };
  return (
    <section className="card grade-card">
      <div className="row between">
        <h2>내 등급</h2>
        <HelpButton title="등급은 이렇게 매깁니다">
          <p>직접 쏜 <b>최근 {GRADE_WINDOW}순</b>을 15시(3순) 기준 평균으로 봅니다. 예시 기록은 넣지 않습니다.</p>
          <ul className="grade-steps">{GRADES.map((x, i) => (
            <li key={x.id}><GradeMark grade={x} size={22} /> <b>{gradeTitle(x)}</b> <span className="muted">{i === 0 ? `${GRADES[1].min}중 미만` : GRADES[i + 1] ? `${x.min}~${GRADES[i + 1].min}중` : `${x.min}중 이상`}</span></li>
          ))}</ul>
          <p>10중은 관중 랭킹에 드는 기준이자 대회 입상권(15시 10중)이라 백은 과녁의 경계로 두었습니다.</p>
          <p><b>올라가는 것은 바로</b> 됩니다. <b>내려가는 것은 {GRADE_HOLD_DAYS}일 기다립니다.</b> 지난 {GRADE_HOLD_DAYS}일 안에 이룬 가장 높은 등급을 보여 줍니다. 습사를 쉬는 동안에는 내려가지 않습니다.</p>
          <p>등급은 앱 안의 기록으로 매기는 것이라 협회의 단과는 다릅니다. 지난 순을 고치거나 지우면 다시 계산합니다.</p>
        </HelpButton>
      </div>
      <div className="grade-main">
        <GradeMark grade={g} size={72} />
        <div className="grade-text">
          <b className="grade-name">{g ? gradeTitle(g) : '등급 매기기 전'}</b>
          {g && r.per15 != null
            ? <span className="small muted">최근 {GRADE_WINDOW}순 15시 평균 <b className="ink">{fmt1(r.per15)}중</b></span>
            : <span className="small muted">{GRADE_WINDOW}순을 쏘면 등급이 매겨집니다 · 지금 {r.counted}순</span>}
          {title && <span className="pill title big">{title}</span>}
        </div>
      </div>
      <div className="ach-prog">
        <div className="row between small">
          <span className="muted">{!g ? `${r.need}순 남음` : r.next ? `${gradeTitle(r.next)}까지` : '가장 높은 등급입니다'}</span>
          {g && r.next && more != null && <span className="muted">최근 {GRADE_WINDOW}순에서 {more}중 더</span>}
        </div>
        <div className="ach-track" aria-hidden><div className={`fill ${g ? g.id : ''}`} style={{ width: `${pct}%` }} /></div>
      </div>
      {g && r.now && r.holdUntil && (
        <div className="small muted">지금 최근 {GRADE_WINDOW}순은 {gradeTitle(r.now)}입니다. {formatDate(r.holdUntil)}까지 다시 {g.min}중을 넘기면 {gradeTitle(g)}을 이어 갑니다.</div>
      )}
      <div className="row between title-row">
        <span className="small">대표 칭호 <b>{title ?? '없음'}</b></span>
        <button className="btn ghost small" onClick={() => setPicking(true)}>{settings.title && title ? '바꾸기' : '고르기'}</button>
      </div>
      {!online && <div className="small muted">겨루기 탭에서 랭킹에 참여하면 등급과 칭호가 닉네임 옆에 보입니다.</div>}
      {picking && <TitleSheet list={list} current={title ? settings.title ?? null : null} onPick={pick} onClose={() => setPicking(false)} />}
    </section>
  );
}

type Filter = 'all' | 'done' | 'todo';

/** 한 묶음의 업적 목록. 보기 거르기(전체·달성·미달성)를 따른다 */
function Group({ title, items, filter, toLog, extra, side }: { title: string; items: Achievement[]; filter: Filter; toLog: () => void; extra?: React.ReactNode; side?: React.ReactNode }) {
  const shown = items.filter((a) => (filter === 'all' ? true : filter === 'done' ? !!a.date : !a.date));
  const n = items.filter((a) => a.date).length;
  return (
    <section className="card">
      <div className="row between">
        <h2>{title} <span className="muted small">{n} / {items.length}</span></h2>
        {side}
      </div>
      {extra}
      {shown.length
        ? <ul className="ach-list">{shown.map((a) => <Row key={a.id} a={a} toLog={toLog} />)}</ul>
        : <div className="small muted">{filter === 'done' ? '아직 달성한 업적이 없습니다.' : '모두 달성했습니다.'}</div>}
    </section>
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
  const bestHit = Math.max(0, firsts.filter((a) => a.date).length - 1);
  const molgiHint = r.bestMolgi ? `아직 · 가장 긴 연몰 ${r.bestMolgi}순` : '아직';

  const [filter, setFilter] = useState<Filter>('all');
  const g = { filter, toLog };

  return (
    <>
      <GradeCard list={r.list} />
      <section className="card">
        <div className="row between">
          <h2>업적 <span className="muted small">{done} / {r.list.length} 달성</span></h2>
          <HelpButton title="업적은 이렇게 셉니다">
            <p>저장한 순을 날짜와 저장한 차례대로 보고 계산합니다. 예시 기록은 넣지 않습니다.</p>
            <p><b>첫 1중~4중</b>은 한 순에서 그 시수 이상을 처음 낸 순입니다. 처음부터 3중을 내면 1중·2중·3중을 함께 이룹니다.</p>
            <p><b>연중·연몰</b>은 같은 날 안에서만 이어 셉니다. 순이 바뀌어도 이어지고, 날이 바뀌면 처음부터 셉니다. 20연몰(100시 100중)은 <b>백발백중</b>입니다.</p>
            <p><b>랭킹</b>은 겨루기에 참여한 뒤 끝난 기간(어제까지의 일간, 지난주, 지난달)만 셉니다. 기간이 끝나야 순위가 정해지기 때문입니다.</p>
            <p><b>꾸준함</b>은 순을 하나라도 저장한 날을 습사한 날로 칩니다. 연속 습사는 오늘이나 어제까지 이어져 있어야 지금 이어지는 것으로 봅니다.</p>
            <p><b>15시 10중</b>은 같은 날 잇따라 쏜 3순을 합쳐 10중 이상이면 이룹니다. <b>강풍·우중·각궁 몰기</b>와 <b>활터</b>는 날씨·활·활터를 남긴 순에서만 셉니다.</p>
            <p>달성한 업적을 누르면 그 순을 기록에서 펼쳐 보여 줍니다. 지난 순을 고치거나 지우면 업적도 다시 계산합니다.</p>
          </HelpButton>
        </div>
        {!r.counted && (
          <div className="small muted">
            {ends.length ? '예시 기록은 업적에 들어가지 않습니다. 직접 쏜 순을 저장하면 집궁부터 달성됩니다.' : '첫 순을 저장하면 집궁부터 달성됩니다.'}
          </div>
        )}
        <div className="feats">
          <Feature a={chomolgi} toLog={toLog} sub="첫 5시 5중" hint={bestHit ? `아직 · 한 순 최고 ${bestHit}중` : '아직'} />
          <Feature a={sam} toLog={toLog} sub="15시 15중" hint={molgiHint} />
          <Feature a={baekbal} toLog={toLog} sub="20연몰 · 100시 100중" hint={molgiHint} />
        </div>
      </section>

      <div className="seg view-switch" role="group" aria-label="업적 거르기">
        {([['all', '전체'], ['done', '달성'], ['todo', '미달성']] as [Filter, string][]).map(([f, label]) => (
          <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
        ))}
      </div>

      <Group title="첫 기록" items={[...firsts, chomolgi]} {...g} />
      <Group title="연중" items={streaks} {...g} side={<span className="small muted">가장 긴 연중 <b className="ink">{r.bestStreak}시</b></span>} />
      <Group title="연몰기" items={molgis} {...g} side={<span className="small muted">가장 긴 연몰 <b className="ink">{r.bestMolgi}순</b></span>} />
      <Group title="누적" items={totals} {...g} extra={<>
        <Progress label="습사량" value={r.totalEnds} unit="순" steps={TOTAL_ENDS_STEPS} names={totals.filter((a) => a.id.startsWith('ends'))} />
        <Progress label="몰기" value={r.totalMolgi} unit="회" steps={TOTAL_MOLGI_STEPS} names={totals.filter((a) => a.id.startsWith('molgicount'))} />
      </>} />
      <Group title="꾸준함" items={steady} {...g} side={<span className="small muted">가장 긴 연속 <b className="ink">{r.bestDayRun}일</b></span>} extra={<>
        <Progress label="지금 연속" value={r.dayRun} unit="일" steps={DAY_RUN_STEPS} names={steady.filter((a) => a.id.startsWith('dayrun'))} />
        <Progress label="이번 달" value={r.monthDays} unit="일" steps={[MONTH_DAYS_GOAL]} names={steady.filter((a) => a.id === 'month20')} />
      </>} />
      <Group title="도전" items={challenges} {...g} extra={<div className="small muted">날씨·활·활터 업적은 그것을 남긴 순에서만 셉니다.</div>} />
      <Group title="랭킹" items={ranks} {...g}
        side={syncing ? <span className="small muted">랭킹 결과 받는 중…</span> : undefined}
        extra={!joined ? <div className="small muted">겨루기 탭에서 온라인 랭킹에 참여하면, 참여한 뒤의 순위로 업적을 받습니다.</div> : undefined} />
    </>
  );
}
