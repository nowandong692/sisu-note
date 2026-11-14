import { useEffect, useState } from 'react';
import { dLabel, isMyRange, periodText, splitTournaments, type Tournament, type TournamentFile } from '../domain/tournaments';
import { today } from '../domain/util';
import { useStore } from '../state/store';

const CACHE = 'gukgungrok-tournaments';
const SOURCE = 'http://kungdo.or.kr/bbs/board.php?bo_table=game_news';

function readCache(): TournamentFile | null {
  try { return JSON.parse(localStorage.getItem(CACHE) ?? 'null'); } catch { return null; }
}

/** 배포 때 받아 둔 tournaments.json을 읽는다. 못 읽으면 이 기기에 마지막으로 받아 둔 목록을 쓴다. */
async function loadTournaments(): Promise<{ file: TournamentFile; cached: boolean }> {
  const embedded = (window as unknown as { __TOURNAMENTS__?: TournamentFile }).__TOURNAMENTS__;
  if (embedded) return { file: embedded, cached: false };
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}tournaments.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const file = (await res.json()) as TournamentFile;
    if (!file.items?.length) throw new Error('empty');
    try { localStorage.setItem(CACHE, JSON.stringify(file)); } catch { /* 저장 못 해도 보여 준다 */ }
    return { file, cached: false };
  } catch (e) {
    const c = readCache();
    if (c) return { file: c, cached: true };
    throw e;
  }
}

function Item({ t, now, mine }: { t: Tournament; now: string; mine: boolean }) {
  const d = dLabel(t, now);
  return (
    <li className={`tour-row ${mine ? 'mine' : ''}`}>
      <a href={t.url} target="_blank" rel="noopener noreferrer">
        <span className={`dday ${d === '진행 중' ? 'live' : ''}`}>{d}</span>
        <span className="tour-main">
          <b>{t.name}</b>
          <span className="small muted">{periodText(t)} · {t.place}{mine && <span className="pill best">내 활터</span>}</span>
        </span>
        <span className="chev" aria-hidden="true">›</span>
      </a>
    </li>
  );
}

export function TournamentsView({ active }: { active: boolean }) {
  const { ranges } = useStore();
  const [file, setFile] = useState<TournamentFile | null>(null);
  const [cached, setCached] = useState(false);
  const [err, setErr] = useState(false);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    if (!active || file) return;
    loadTournaments().then((r) => { setFile(r.file); setCached(r.cached); }, () => setErr(true));
  }, [active, file]);

  const now = today();
  const names = ranges.map((r) => r.name);

  if (err) {
    return (
      <section className="card">
        <h2>대회 일정</h2>
        <div className="empty small">대회 일정을 불러오지 못했습니다. 인터넷 연결을 확인하거나 <a href={SOURCE} target="_blank" rel="noopener noreferrer">대한궁도협회 대회일정</a>에서 직접 보세요.</div>
      </section>
    );
  }
  if (!file) return <section className="card"><h2>대회 일정</h2><div className="empty small">불러오는 중…</div></section>;

  const { upcoming, past } = splitTournaments(file.items, now);
  const months = new Map<string, Tournament[]>();
  for (const t of upcoming) {
    const k = t.start < now ? now.slice(0, 7) : t.start.slice(0, 7);
    months.set(k, [...(months.get(k) ?? []), t]);
  }
  const updated = file.fetchedAt ? new Date(file.fetchedAt) : null;

  return (
    <>
      <section className="card">
        <div className="row between"><h2>다가오는 대회</h2><span className="small muted">{upcoming.length}개</span></div>
        {upcoming.length === 0 && <div className="empty small">올라온 다가오는 대회가 없습니다.</div>}
        {[...months].map(([m, list]) => (
          <div key={m} className="tour-month">
            <div className="tour-month-head">{Number(m.slice(5, 7))}월</div>
            <ol className="tour-list">{list.map((t) => <Item key={t.id} t={t} now={now} mine={isMyRange(t.place, names)} />)}</ol>
          </div>
        ))}
        <button className="btn ghost small" style={{ alignSelf: 'center' }} onClick={() => setShowPast(!showPast)}>{showPast ? '지난 대회 숨기기' : '지난 대회 보기'}</button>
        {showPast && <ol className="tour-list">{past.slice(0, 20).map((t) => <Item key={t.id} t={t} now={now} mine={isMyRange(t.place, names)} />)}</ol>}
      </section>
      <div className="small muted tour-note">
        출처: <a href={file.source ?? SOURCE} target="_blank" rel="noopener noreferrer">대한궁도협회 대회일정</a>. 대회를 누르면 요강이 있는 협회 글이 열립니다.
        {updated && ` ${updated.getMonth() + 1}월 ${updated.getDate()}일에 받아 온 목록입니다.`}
        {cached && ' 지금은 연결이 안 되어 이 기기에 저장해 둔 목록을 보여 줍니다.'}
        {' '}일정은 바뀔 수 있으니 참가 전에 원문을 꼭 확인하세요.
      </div>
    </>
  );
}
