import { useCallback, useEffect, useState } from 'react';
import { splitTournaments, type TournamentFile, type VideoFile } from '../domain/tournaments';
import type { HwalterFile } from '../domain/hwalter';
import { today } from '../domain/util';
import { loadHwalter } from '../platform/hwalterData';
import { rpc } from '../platform/online';
import { loadTournaments, loadVideos } from '../platform/tourData';
import { ConfirmButton, Sheet, toast } from './ui';

/** 관리자 코드는 이 탭을 닫을 때까지만 기억한다 (기기에 오래 남기지 않는다) */
const CODE = 'gukgungrok-admin';
const readCode = () => { try { return sessionStorage.getItem(CODE) ?? ''; } catch { return ''; } };
const saveCode = (c: string | null) => { try { if (c) sessionStorage.setItem(CODE, c); else sessionStorage.removeItem(CODE); } catch { /* 무시 */ } };
const errText = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류가 났습니다.');

interface Overview { archers: number; hidden: number; ends_today: number; ends_week: number; active_week: number; reports: number }
interface Report { id: number; nickname: string; range_name: string | null; hidden: boolean; reason: string; created_at: string; total: number }
interface Suspect { nickname: string; range_name: string | null; hidden: boolean; day: string; ends: number; hits: number; minutes: number }

const when = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ago = (iso?: string) => (iso ? when(iso) : '모름');

function Login({ onOk }: { onOk: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr('');
    try { await rpc('admin_check', { p_admin: code.trim() }); saveCode(code.trim()); onOk(code.trim()); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <form className="field" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void go(); }}>
      <label htmlFor="adminCode">관리자 코드</label>
      <input id="adminCode" type="password" autoComplete="off" autoFocus value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} />
      {err && <div className="small err-text" role="alert">{err}</div>}
      <button className="btn" type="submit" disabled={busy || !code.trim()}>{busy ? '확인하는 중…' : '들어가기'}</button>
      <div className="small muted">관리자 코드는 Supabase에 해시로만 등록되어 있습니다. 코드는 이 화면을 닫을 때까지만 기억합니다.</div>
    </form>
  );
}

/** 대회·활터·영상 목록을 마지막으로 받은 때와 개수 */
function Collection() {
  const [t, setT] = useState<TournamentFile | null | 'err'>(null);
  const [h, setH] = useState<HwalterFile | null | 'err'>(null);
  const [v, setV] = useState<VideoFile | null | 'err'>(null);
  useEffect(() => {
    loadTournaments().then((r) => setT(r.file), () => setT('err'));
    loadHwalter().then(setH, () => setH('err'));
    loadVideos().then(setV, () => setV('err'));
  }, []);
  const now = today();
  const up = t && t !== 'err' ? splitTournaments(t.items, now).upcoming : [];
  const noReg = up.filter((x) => !x.reg);
  return (
    <section className="admin-sec">
      <h4>자동 수집</h4>
      <ul className="admin-kv">
        <li><span>대회 일정</span><b>{t === 'err' ? '못 읽음' : t ? `${t.items.length}개 · 다가오는 ${up.length}개 · ${ago(t.fetchedAt)}` : '…'}</b></li>
        <li><span>요강 접수 정보</span><b>{t && t !== 'err' ? `${up.length - noReg.length}/${up.length} 읽음` : '…'}</b></li>
        <li><span>활터 목록</span><b>{h === 'err' ? '못 읽음' : h ? `${h.items.length}곳 · ${ago(h.fetchedAt)}` : '…'}</b></li>
        <li><span>중계 영상</span><b>{v === 'err' ? '못 읽음' : v ? `${v.items.length}개 · ${ago(v.fetchedAt)}` : '…'}</b></li>
      </ul>
      {noReg.length > 0 && (
        <div className="small muted">
          접수 정보를 못 읽은 다가오는 대회: {noReg.map((x, i) => <span key={x.id}>{i > 0 && ', '}<a href={x.url} target="_blank" rel="noopener noreferrer">{x.name}</a>{x.doc ? '' : ' (첨부 없음)'}</span>)}
        </div>
      )}
      <div className="small muted">배포 때와 하루 일곱 번(06시, 08~18시 두 시간마다) 새로 받습니다. 시각이 오래됐으면 GitHub Actions의 배포 기록을 확인하세요.</div>
    </section>
  );
}

function Panel({ code, onOut }: { code: string; onOut: () => void }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [suspects, setSuspects] = useState<Suspect[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    try {
      const [o, r, s] = await Promise.all([
        rpc<Overview[]>('admin_overview', { p_admin: code }),
        rpc<Report[]>('admin_reports', { p_admin: code }),
        rpc<Suspect[]>('admin_suspects', { p_admin: code, p_days: 14 }),
      ]);
      setOv(o[0] ?? null); setReports(r); setSuspects(s);
    } catch (e) { setErr(errText(e)); }
  }, [code]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: string, args: Record<string, unknown>, msg: string) => {
    try { await rpc(fn, { p_admin: code, ...args }); toast(msg); await load(); } catch (e) { toast(errText(e)); }
  };
  const hideBtn = (nickname: string, hidden: boolean) => (
    <button className="btn ghost small" onClick={() => act('admin_set_hidden', { p_nickname: nickname, p_hidden: !hidden }, hidden ? `${nickname}을(를) 다시 보이게 했습니다` : `${nickname}을(를) 랭킹에서 숨겼습니다`)}>{hidden ? '다시 보이기' : '랭킹에서 숨기기'}</button>
  );

  return (
    <>
      {err && <div className="small err-text" role="alert">{err}</div>}
      <section className="admin-sec">
        <h4>현황</h4>
        {ov ? (
          <div className="tiles">
            <div className="tile"><b>{ov.archers}</b><span>참여자</span></div>
            <div className="tile"><b>{ov.active_week}</b><span>이번 주 활동</span></div>
            <div className="tile"><b>{ov.ends_today}</b><span>오늘 순</span></div>
            <div className="tile"><b>{ov.ends_week}</b><span>7일 순</span></div>
          </div>
        ) : <div className="small muted">불러오는 중…</div>}
        {ov && <div className="small muted">숨긴 궁사 {ov.hidden}명 · 남은 신고 {ov.reports}건</div>}
      </section>

      <section className="admin-sec">
        <h4>신고 {reports ? `${reports.length}건` : ''}</h4>
        {reports?.length === 0 && <div className="small muted">들어온 신고가 없습니다.</div>}
        <ul className="admin-list">
          {reports?.map((r) => (
            <li key={r.id}>
              <div><b>{r.nickname}</b>{r.hidden && <span className="pill">숨김</span>}{r.total > 1 && <span className="pill">신고 {r.total}건</span>} <span className="small muted">{r.range_name ?? ''} · {when(r.created_at)}</span></div>
              <div className="small">{r.reason || '(사유 없음)'}</div>
              <div className="row">
                {hideBtn(r.nickname, r.hidden)}
                <ConfirmButton className="btn ghost small" label="닉네임 초기화" confirmLabel="초기화 확인" onConfirm={() => act('admin_reset_nickname', { p_nickname: r.nickname }, '닉네임을 초기화했습니다')} />
                <button className="btn ghost small" onClick={() => act('admin_dismiss_report', { p_id: r.id }, '신고를 처리했습니다')}>처리 완료</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-sec">
        <h4>의심 기록 (최근 14일)</h4>
        <div className="small muted">하루 30순 이상이거나, 순 사이가 평균 1분도 안 되는 날입니다. 기기 시계나 한꺼번에 올린 경우일 수도 있으니 확인 뒤 처리하세요.</div>
        {suspects?.length === 0 && <div className="small muted">의심 기록이 없습니다.</div>}
        <ul className="admin-list">
          {suspects?.map((s) => (
            <li key={`${s.nickname}-${s.day}`}>
              <div><b>{s.nickname}</b>{s.hidden && <span className="pill">숨김</span>} <span className="small muted">{s.range_name ?? ''} · {s.day}</span></div>
              <div className="small">{s.ends}순 {s.hits}중 · {s.minutes}분 동안</div>
              <div className="row">
                {hideBtn(s.nickname, s.hidden)}
                <ConfirmButton className="btn ghost small" label="그날 기록 삭제" confirmLabel={`${s.day} ${s.ends}순 삭제 확인`} onConfirm={() => act('admin_delete_day', { p_nickname: s.nickname, p_day: s.day }, '그날 기록을 지웠습니다')} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Collection />

      <div className="row">
        <button className="btn ghost small" onClick={() => void load()}>새로 고침</button>
        <button className="btn ghost small" onClick={() => { saveCode(null); onOut(); }}>관리자 나가기</button>
      </div>
    </>
  );
}

/** 설정 탭 맨 아래 "관리자"에서 연다 */
export function AdminSheet({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState(readCode);
  return (
    <Sheet title="관리자" onClose={onClose}>
      {code ? <Panel code={code} onOut={() => setCode('')} /> : <Login onOk={setCode} />}
    </Sheet>
  );
}
