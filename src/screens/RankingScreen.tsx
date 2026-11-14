import { useEffect, useState } from 'react';
import { ConfirmButton, Sheet, toast } from '../components/ui';
import {
  MIN_ENDS, MIN_PER_15, VOLUME_TOP, eligibility, per15Of, periodStart, rankPeriod, rankVolume, shiftPeriod,
  type ArcherTotal, type RankPeriod, type RankRow,
} from '../domain/ranking';
import { formatDate, today } from '../domain/util';
import { OnlineError, onlineAvailable, rpc } from '../platform/online';
import { useStore } from '../state/store';
import { formatDuration, spanLabel, spanOf, totalMinutes } from '../domain/session';

type Kind = 'hits' | 'volume';
const PERIODS: [RankPeriod, string][] = [['day', '일간'], ['week', '주간'], ['month', '월간']];
const PLACE_LABEL = ['장려', '1위', '2위', '3위'];

interface ServerEnd { day: string; recorded_at: string; hits: boolean[] }
interface ServerRow { nickname: string; range_name: string | null; ends: number; hits: number; seq: boolean[] | null; me: boolean }

function periodLabel(date: string, p: RankPeriod): string {
  const s = periodStart(date, p);
  if (p === 'day') return formatDate(s);
  if (p === 'month') return `${s.slice(0, 4)}년 ${Number(s.slice(5, 7))}월`;
  const e = shiftPeriod(s, 'day', 6);
  const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
  return `${md(s)} ~ ${md(e)}`;
}

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function errText(e: unknown) {
  return e instanceof Error ? e.message : '알 수 없는 오류가 났습니다.';
}

/** 참여 전: 닉네임 정하기, 또는 복구 코드로 이어 하기 */
function JoinCard({ onJoined }: { onJoined: () => void }) {
  const store = useStore();
  const [nickname, setNickname] = useState('');
  const [rangeName, setRangeName] = useState<string>(store.currentRange?.name ?? '');
  const [restoring, setRestoring] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const join = async () => {
    if (!nickname.trim()) { setErr('닉네임을 정해 주세요.'); return; }
    setBusy(true); setErr('');
    try { await store.joinOnline(nickname, rangeName || null); onJoined(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const restore = async () => {
    setBusy(true); setErr('');
    try { await store.restoreOnline(code); toast('이어 하기를 마쳤습니다'); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  return (
    <section className="card join-card">
      <h2>랭킹에 참여하기</h2>
      <div className="small muted">
        닉네임과 순마다 관중 여부, 저장 시각만 서버에 올라가고, 랭킹에서 닉네임을 누르면 다른 궁사도 볼 수 있습니다. 메모, 장비, 위치, 날씨는 올리지 않습니다.
        로그인 없이 이 기기에 저장되는 <b>복구 코드</b>로만 구분하고, 참여한 뒤 오늘 저장한 순부터 올라갑니다.
      </div>
      {!restoring ? (
        <>
          <div className="field">
            <label htmlFor="nick">닉네임 (실명이 아니어도 됩니다)</label>
            <input id="nick" type="text" maxLength={12} placeholder="예: 바람타는활" value={nickname} onChange={(e) => { setNickname(e.target.value); setErr(''); }} />
          </div>
          <div className="field">
            <label htmlFor="rangeShow">랭킹에 함께 보일 활터</label>
            <select id="rangeShow" value={rangeName} onChange={(e) => setRangeName(e.target.value)}>
              <option value="">보이지 않기</option>
              {store.ranges.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
            </select>
          </div>
          {err && <div className="small err-text" role="alert">{err}</div>}
          <button className="btn" disabled={busy} onClick={join}>{busy ? '참여하는 중…' : '참여하기'}</button>
          <button className="btn ghost small" onClick={() => { setRestoring(true); setErr(''); }}>다른 기기에서 쓰던 복구 코드가 있어요</button>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="code">복구 코드</label>
            <input id="code" type="text" autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} />
          </div>
          {err && <div className="small err-text" role="alert">{err}</div>}
          <button className="btn" disabled={busy || code.replace(/[^0-9a-z]/gi, '').length < 20} onClick={restore}>{busy ? '확인하는 중…' : '이어 하기'}</button>
          <button className="btn ghost small" onClick={() => setRestoring(false)}>처음 참여하기로 돌아가기</button>
        </>
      )}
    </section>
  );
}

function CodeSheet({ code, first, onClose }: { code: string; first?: boolean; onClose: () => void }) {
  const copy = () => navigator.clipboard?.writeText(code).then(() => toast('복구 코드를 복사했습니다'), () => toast('복사하지 못했습니다. 직접 적어 두세요'));
  return (
    <Sheet title={first ? '참여했습니다. 복구 코드를 적어 두세요' : '복구 코드'} onClose={onClose}>
      <div className="recovery-code" aria-label="복구 코드">{code}</div>
      <div className="small">휴대폰을 바꾸거나 앱 데이터를 지웠을 때 이 코드로 랭킹 기록을 이어 갑니다. <b>잃어버리면 되찾을 수 없고</b>, 다른 사람이 알면 내 이름으로 기록할 수 있으니 혼자만 보관하세요.</div>
      <button className="btn" onClick={copy}>복사하기</button>
      <button className="btn ghost small" onClick={onClose}>닫기</button>
    </Sheet>
  );
}

function ProfileSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const o = store.online!;
  const [nickname, setNickname] = useState(o.nickname);
  const [rangeName, setRangeName] = useState(o.rangeName ?? '');
  const [err, setErr] = useState('');
  const names = [...new Set([...(o.rangeName ? [o.rangeName] : []), ...store.ranges.map((r) => r.name)])];
  const save = async () => {
    if (!nickname.trim()) { setErr('닉네임을 정해 주세요.'); return; }
    try { await store.setOnlineProfile(nickname, rangeName || null); toast('고쳤습니다'); onClose(); } catch (e) { setErr(errText(e)); }
  };
  return (
    <Sheet title="랭킹 프로필" onClose={onClose}>
      <div className="field">
        <label htmlFor="nick2">닉네임</label>
        <input id="nick2" type="text" maxLength={12} value={nickname} onChange={(e) => { setNickname(e.target.value); setErr(''); }} />
      </div>
      <div className="field">
        <label htmlFor="range2">함께 보일 활터</label>
        <select id="range2" value={rangeName} onChange={(e) => setRangeName(e.target.value)}>
          <option value="">보이지 않기</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {err && <div className="small err-text" role="alert">{err}</div>}
      <button className="btn" onClick={save}>저장</button>
      <ConfirmButton className="btn ghost danger-text" label="랭킹 참여 그만두기" confirmLabel="서버의 내 랭킹 기록을 모두 지우고 그만두기"
        onConfirm={() => store.leaveOnline().then(() => { toast('참여를 그만두었습니다. 서버의 기록을 지웠습니다'); onClose(); }, (e) => setErr(errText(e)))} />
      <div className="small muted">그만두어도 이 기기의 내 기록은 그대로 남습니다.</div>
    </Sheet>
  );
}

/** 랭킹에서 궁사를 누르면: 그 기간에 올린 순을 날짜별로 */
function ArcherSheet({ r, period, start, onClose }: { r: RankRow; period: RankPeriod; start: string; onClose: () => void }) {
  const [list, setList] = useState<ServerEnd[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    rpc<ServerEnd[]>('archer_ends', { p_nickname: r.name, p_period: period, p_date: start })
      .then((x) => { if (alive) setList(x); }, (e) => { if (alive) setErr(errText(e)); });
    return () => { alive = false; };
  }, [r.name, period, start]);
  const items = (list ?? []).map((e) => ({ date: e.day, recordedAt: Date.parse(e.recorded_at), hits: e.hits }));
  const days = [...new Set(items.map((e) => e.date))].sort().reverse();
  const t = totalMinutes(items);
  return (
    <Sheet title={r.name} onClose={onClose}>
      <div className="small muted">{[r.range, periodLabel(start, period)].filter(Boolean).join(' · ')}</div>
      <div className="tiles archer-tiles">
        <div className="tile"><b>{r.ends}</b><span>순</span></div>
        <div className="tile"><b>{r.hits}</b><span>관중</span></div>
        <div className="tile"><b>{fmt1(r.per15)}</b><span>15시 평균</span></div>
        <div className="tile"><b>{list ? (t.minutes ? formatDuration(t.minutes) : '-') : '…'}</b><span>습사 시간</span></div>
      </div>
      {err && <div className="small err-text" role="alert">{err}</div>}
      {!list && !err && <div className="empty small">불러오는 중…</div>}
      <div className="archer-days">
        {days.map((d) => {
          const es = items.filter((e) => e.date === d);
          const h = es.reduce((a, e) => a + e.hits.filter(Boolean).length, 0);
          return (
            <div key={d} className="archer-day">
              <div className="row between"><b>{formatDate(d)}</b><span className="small">{es.length}순 {h}중</span></div>
              <div className="small muted">습사 시간 {spanLabel(spanOf(es.map((e) => e.recordedAt))!)}</div>
              <ol className="mini-ends">
                {es.map((e, i) => {
                  const n = e.hits.filter(Boolean).length;
                  return (
                    <li key={i}>
                      <span className="idx">{i + 1}순</span>
                      <span className="mini-dots" aria-label={e.hits.map((x, k) => `${k + 1}시 ${x ? '관중' : '불'}`).join(', ')}>
                        {e.hits.map((x, k) => <i key={k} className={x ? 'hit' : ''} />)}
                      </span>
                      <span className="cnt">{n}중{n === 5 && <span className="pill best">몰기</span>}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
      <button className="btn ghost small" onClick={onClose}>닫기</button>
    </Sheet>
  );
}

function Row({ r, kind, canReport, onOpen }: { r: RankRow; kind: Kind; canReport: boolean; onOpen: () => void }) {
  const report = () => rpc('report', { p_nickname: r.name, p_reason: '기록이 사실과 다른 것 같음' })
    .then(() => toast('신고를 받았습니다'), (e) => toast(errText(e)));
  return (
    <li className={`rank-row ${r.me ? 'me' : ''}`}>
      {kind === 'hits'
        ? <span className={`place p${r.place}`}>{PLACE_LABEL[r.place]}</span>
        : <span className="place num">{r.order}</span>}
      <button className="who-btn" onClick={onOpen} aria-label={`${r.name} 기록 보기`}>
        <span className="who">
          <b>{r.name}</b>{r.me && <span className="pill best">나</span>}
          {r.range && <span className="small muted"> · {r.range}</span>}
        </span>
        <span className="score">
          {kind === 'hits'
            ? <><b>{fmt1(r.per15)}중</b><span className="small muted"> · {r.ends}순</span></>
            : <><b>{r.ends}순</b><span className="small muted"> · 관중 {r.hits}</span></>}
        </span>
        <span className="chev" aria-hidden="true">›</span>
      </button>
      {canReport && !r.me && <ConfirmButton className="del" label="신고" confirmLabel="신고하기" onConfirm={report} />}
    </li>
  );
}

export function RankingScreen({ active }: { active: boolean }) {
  const store = useStore();
  const o = store.online;
  const [kind, setKind] = useState<Kind>('hits');
  const [period, setPeriod] = useState<RankPeriod>('day');
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<ArcherTotal[] | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCode, setShowCode] = useState<'first' | 'again' | null>(null);
  const [editing, setEditing] = useState(false);
  const [tick, setTick] = useState(0);
  const [viewing, setViewing] = useState<RankRow | null>(null);

  const start = periodStart(date, period);
  const isCurrent = start === periodStart(today(), period);

  useEffect(() => {
    if (!active || !onlineAvailable()) return;
    let alive = true;
    setLoading(true); setErr('');
    rpc<ServerRow[]>('period_totals', { p_period: period, p_date: start, p_key: o?.key ?? null })
      .then((list) => { if (alive) setRows(list.map((x) => ({ name: x.nickname, range: x.range_name, ends: x.ends, hits: x.hits, seq: x.seq ?? [], me: x.me }))); })
      .catch((e) => { if (alive) { setRows(null); setErr(e instanceof OnlineError ? e.message : errText(e)); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [active, period, start, o?.key, tick, store.onlinePending === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!onlineAvailable()) {
    return <section className="card"><h2>온라인 랭킹</h2><div className="empty">랭킹 서버를 준비하고 있습니다. 곧 열립니다.</div></section>;
  }

  const ranked = rows ? (kind === 'hits' ? rankPeriod(rows, period) : rankVolume(rows)) : [];
  const mine = rows?.find((r) => r.me);
  const mineShown = ranked.some((r) => r.me);
  const myLine = (() => {
    if (!o) return null;
    if (!mine) return `이 기간에 올린 순이 없습니다.${isCurrent ? ' 오늘 순을 저장하면 올라갑니다.' : ''}`;
    if (mineShown) return null;
    if (kind === 'volume') return `내 기록: ${mine.ends}순 · TOP ${VOLUME_TOP} 밖입니다.`;
    const why = eligibility(mine, period);
    const base = `내 기록: ${mine.ends}순 · 15시 평균 ${fmt1(per15Of(mine))}중`;
    return why === 'ends' ? `${base} · ${MIN_ENDS[period]}순부터 순위에 듭니다.` : `${base} · 평균 ${MIN_PER_15}중부터 순위에 듭니다.`;
  })();

  return (
    <>
      {!o && <JoinCard onJoined={() => setShowCode('first')} />}
      {o && (
        <section className="card me-card">
          <div className="row between">
            <span><b>{o.nickname}</b>{o.rangeName && <span className="small muted"> · {o.rangeName}</span>}</span>
            <span className="row">
              <button className="act-btn" onClick={() => setShowCode('again')}>복구 코드</button>
              <button className="act-btn" onClick={() => setEditing(true)}>프로필</button>
            </span>
          </div>
          {store.onlinePending > 0 && <div className="small muted">아직 올리지 못한 순 {store.onlinePending}개가 있습니다. 인터넷에 연결되면 올라갑니다.</div>}
        </section>
      )}
      <section className="card rank-card">
        <div className="seg rank-kind" role="group" aria-label="랭킹 종류">
          <button className={kind === 'hits' ? 'on' : ''} aria-pressed={kind === 'hits'} onClick={() => setKind('hits')}>관중 랭킹</button>
          <button className={kind === 'volume' ? 'on' : ''} aria-pressed={kind === 'volume'} onClick={() => setKind('volume')}>습사량 TOP {VOLUME_TOP}</button>
        </div>
        <div className="row between">
          <div className="seg" role="group" aria-label="기간">
            {PERIODS.map(([p, l]) => <button key={p} className={period === p ? 'on' : ''} aria-pressed={period === p} onClick={() => setPeriod(p)}>{l}</button>)}
          </div>
          <button className="act-btn" aria-label="새로 고침" onClick={() => setTick((t) => t + 1)} disabled={loading}>↻</button>
        </div>
        <div className="period-nav">
          <button className="act-btn" aria-label="이전 기간" onClick={() => setDate(shiftPeriod(date, period, -1))}>‹</button>
          <b>{periodLabel(date, period)}</b>
          <button className="act-btn" aria-label="다음 기간" disabled={isCurrent} onClick={() => setDate(shiftPeriod(date, period, 1))}>›</button>
        </div>
        {err && <div className="small err-text" role="alert">{err}</div>}
        {loading && !rows && <div className="empty small">불러오는 중…</div>}
        {rows && ranked.length === 0 && (
          <div className="empty small">
            {kind === 'hits'
              ? `아직 순위에 든 궁사가 없습니다. ${MIN_ENDS[period]}순 이상, 15시 평균 ${MIN_PER_15}중 이상이면 순위에 듭니다.`
              : '이 기간에 올라온 순이 없습니다.'}
          </div>
        )}
        {ranked.length > 0 && <ol className="rank-list">{ranked.map((r) => <Row key={r.name} r={r} kind={kind} canReport={!!o} onOpen={() => setViewing(r)} />)}</ol>}
        {myLine && <div className="small my-line">{myLine}</div>}
        <div className="small muted">
          {kind === 'hits'
            ? `점수는 15시(3순) 기준 평균 중 수입니다. ${PERIODS.find(([p]) => p === period)![1]} ${MIN_ENDS[period]}순 이상, 15시 기준 평균 ${MIN_PER_15}중 이상인 궁사. 1위 1명, 2위 2명, 3위 3명, 나머지는 장려상입니다. 평균이 같으면 순이 많은 궁사, 그다음은 선다시수로 정합니다.`
            : '이 기간에 순을 가장 많이 쏜 궁사 10명입니다. 순이 같으면 관중이 많은 궁사가 앞섭니다.'}
          {' '}궁사를 누르면 그 기간의 순별 기록과 습사 시간을 볼 수 있습니다. 모두 본인이 입력한 기록입니다.
        </div>
      </section>
      {showCode && o && <CodeSheet code={o.key} first={showCode === 'first'} onClose={() => setShowCode(null)} />}
      {editing && o && <ProfileSheet onClose={() => setEditing(false)} />}
      {viewing && <ArcherSheet r={viewing} period={period} start={start} onClose={() => setViewing(null)} />}
    </>
  );
}
