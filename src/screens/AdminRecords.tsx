import { useCallback, useEffect, useState } from 'react';
import { Sheet, toast } from '../components/ui';
import { scopeLabel, type DeleteScope } from '../domain/adminScope';
import { formatDate, today } from '../domain/util';
import { rpc } from '../platform/online';

/** 관리자: 특정 궁사의 기록을 찾아보고 순, 일, 주, 월, 전체로 지운다. 지우기 전에 반드시 한 번 더 확인한다. */

interface Found { nickname: string; range_name: string | null; hidden: boolean; ends: number; first_day: string | null; last_day: string | null }
interface Day { day: string; ends: number; hits: number }
interface DayEnd { id: number; recorded_at: string; hits: boolean[] }
interface Pending { scope: DeleteScope; date?: string; endId?: number; endNo?: number; count: number }

const errText = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류가 났습니다.');
const hm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function ConfirmDelete({ nickname, p, onCancel, onDone }: { nickname: string; p: Pending; onCancel: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const needType = p.scope === 'all' || p.count >= 30;
  const ok = !needType || typed.trim().toLowerCase() === nickname.toLowerCase();
  return (
    <Sheet title="기록 삭제 확인" onClose={onCancel} backCloses={!busy}>
      <div className="small"><b>{nickname}</b>의 <b>{scopeLabel(p.scope, p.date, p.endNo)}</b> 기록 <b>{p.count}순</b>을 서버에서 지웁니다.</div>
      <div className="small err-text">지우면 되돌릴 수 없습니다. 랭킹에서도 바로 빠집니다. 궁사 기기에 남은 기록은 지워지지 않습니다.</div>
      {needType && (
        <div className="field">
          <label htmlFor="del-confirm">확인을 위해 닉네임 <b>{nickname}</b>을(를) 그대로 적어 주세요</label>
          <input id="del-confirm" type="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}
      <button className="btn danger" disabled={!ok || busy} onClick={async () => { setBusy(true); try { await onDone(); } finally { setBusy(false); } }}>{busy ? '지우는 중…' : `${p.count}순 삭제`}</button>
      <button className="btn ghost" disabled={busy} onClick={onCancel}>취소</button>
    </Sheet>
  );
}

export function AdminRecords({ code, focus, onChanged }: { code: string; focus?: { nickname: string; day?: string } | null; onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [who, setWho] = useState<Found | null>(null);
  const [days, setDays] = useState<Day[] | null>(null);
  const [date, setDate] = useState(today());
  const [dayEnds, setDayEnds] = useState<DayEnd[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const search = useCallback(async (query: string, pick?: string) => {
    try {
      const list = await rpc<Found[]>('admin_find_archers', { p_admin: code, p_query: query });
      setFound(list);
      const hit = pick ? list.find((x) => x.nickname.toLowerCase() === pick.toLowerCase()) : null;
      if (hit) setWho(hit);
      else if (pick) setWho(null);
    } catch (e) { toast(errText(e)); }
  }, [code]);

  // 신고·의심 기록에서 "기록 관리"를 누르면 그 궁사를 바로 연다
  useEffect(() => {
    if (!focus) return;
    setQ(focus.nickname);
    if (focus.day) setDate(focus.day);
    void search(focus.nickname, focus.nickname);
  }, [focus, search]);

  const loadDays = useCallback(async () => {
    if (!who) { setDays(null); return; }
    try { setDays(await rpc<Day[]>('admin_archer_days', { p_admin: code, p_nickname: who.nickname })); } catch (e) { toast(errText(e)); }
  }, [code, who]);
  const loadDay = useCallback(async () => {
    if (!who || !date) { setDayEnds(null); return; }
    try { setDayEnds(await rpc<DayEnd[]>('admin_archer_day_ends', { p_admin: code, p_nickname: who.nickname, p_day: date })); } catch (e) { toast(errText(e)); }
  }, [code, who, date]);
  useEffect(() => { void loadDays(); }, [loadDays]);
  useEffect(() => { void loadDay(); }, [loadDay]);

  /** 먼저 몇 순이 지워지는지 서버에 물어보고(지우지 않음) 확인 창을 연다 */
  const ask = async (scope: DeleteScope, extra: { endId?: number; endNo?: number } = {}) => {
    if (!who) return;
    try {
      const count = await rpc<number>('admin_delete_ends', { p_admin: code, p_nickname: who.nickname, p_scope: scope, p_date: scope === 'all' || scope === 'end' ? null : date, p_end_id: extra.endId ?? null, p_dry: true });
      if (!count) { toast('지울 기록이 없습니다'); return; }
      setPending({ scope, date, count, ...extra });
    } catch (e) { toast(errText(e)); }
  };
  const run = async () => {
    if (!who || !pending) return;
    try {
      const n = await rpc<number>('admin_delete_ends', { p_admin: code, p_nickname: who.nickname, p_scope: pending.scope, p_date: pending.scope === 'all' || pending.scope === 'end' ? null : pending.date, p_end_id: pending.endId ?? null, p_dry: false });
      toast(`${who.nickname}의 기록 ${n}순을 지웠습니다`);
      setPending(null);
      await Promise.all([loadDays(), loadDay(), search(q || who.nickname, who.nickname)]);
      onChanged();
    } catch (e) { toast(errText(e)); }
  };

  const dayRow = days?.find((d) => d.day === date);
  return (
    <section className="admin-sec" id="admin-records">
      <h4>궁사 기록 관리</h4>
      <form className="admin-search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) void search(q.trim()); }}>
        <input type="text" placeholder="닉네임 (일부만 적어도 됩니다)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn small" type="submit" disabled={!q.trim()}>찾기</button>
      </form>
      {found && !who && (
        found.length === 0 ? <div className="small muted">찾는 궁사가 없습니다.</div> : (
          <ul className="admin-list">
            {found.map((f) => (
              <li key={f.nickname}>
                <button className="admin-pick" onClick={() => setWho(f)}>
                  <b>{f.nickname}</b>{f.hidden && <span className="pill">숨김</span>} <span className="small muted">{f.range_name ?? ''} · {f.ends}순{f.last_day ? ` · 마지막 ${f.last_day}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
      {who && (
        <>
          <div className="row between">
            <div><b>{who.nickname}</b>{who.hidden && <span className="pill">숨김</span>} <span className="small muted">{who.range_name ?? ''} · 모두 {who.ends}순{who.first_day ? ` · ${who.first_day} ~ ${who.last_day}` : ''}</span></div>
            <button className="btn ghost small" onClick={() => { setWho(null); setDays(null); setDayEnds(null); }}>다른 궁사</button>
          </div>
          <div className="field">
            <label htmlFor="admin-date">날짜</label>
            <input id="admin-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </div>
          {days && days.length > 0 && (
            <div className="chips admin-days">
              {days.slice(0, 30).map((d) => (
                <button key={d.day} className={`chip ${d.day === date ? 'on' : ''}`} onClick={() => setDate(d.day)}>{d.day.slice(5).replace('-', '.')} · {d.ends}순</button>
              ))}
            </div>
          )}
          <div className="small">{formatDate(date)}: {dayRow ? `${dayRow.ends}순 ${dayRow.hits}중` : '기록 없음'}</div>
          {dayEnds && dayEnds.length > 0 && (
            <ul className="admin-list">
              {dayEnds.map((e, i) => (
                <li key={e.id} className="admin-end">
                  <span className="small">{i + 1}순 · {hm(e.recorded_at)} · {e.hits.map((h) => (h ? '●' : '○')).join('')} {e.hits.filter(Boolean).length}중</span>
                  <button className="btn ghost small" onClick={() => ask('end', { endId: e.id, endNo: i + 1 })}>이 순 삭제</button>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            <button className="btn ghost small" onClick={() => ask('day')}>그날 삭제</button>
            <button className="btn ghost small" onClick={() => ask('week')}>그 주 삭제</button>
            <button className="btn ghost small" onClick={() => ask('month')}>그 달 삭제</button>
            <button className="btn ghost small danger-text" onClick={() => ask('all')}>전체 삭제</button>
          </div>
          <div className="small muted">주는 고른 날짜가 속한 월요일~일요일, 달은 그 달 1일~말일입니다. 누르면 지울 순 수를 먼저 보여 주고, 한 번 더 확인한 뒤에 지웁니다.</div>
        </>
      )}
      {pending && who && <ConfirmDelete nickname={who.nickname} p={pending} onCancel={() => setPending(null)} onDone={run} />}
    </section>
  );
}
