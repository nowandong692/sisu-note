import { useEffect, useState } from 'react';
import { dLabel, isMyRange, monthGrid, onDay, periodText, shiftMonth, splitTournaments, videosFor, type Tournament, type TournamentFile, type Video, type VideoFile } from '../domain/tournaments';
import { today } from '../domain/util';
import { useStore } from '../state/store';

const CACHE = 'gukgungrok-tournaments';
const SOURCE = 'http://kungdo.or.kr/bbs/board.php?bo_table=game_news';
const CHANNEL = 'https://www.youtube.com/channel/UCAmMjZ44ugH9GmgYq0du5PQ';
const VCACHE = 'gukgungrok-videos';

/** 중계 영상 목록. 못 읽으면 저장해 둔 것, 그것도 없으면 빈 목록 (대회 일정은 그대로 보인다) */
async function loadVideos(): Promise<VideoFile> {
  const embedded = (window as unknown as { __VIDEOS__?: VideoFile }).__VIDEOS__;
  if (embedded) return embedded;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}videos.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const file = (await res.json()) as VideoFile;
    try { localStorage.setItem(VCACHE, JSON.stringify(file)); } catch { /* 무시 */ }
    return file;
  } catch {
    try { return JSON.parse(localStorage.getItem(VCACHE) ?? 'null') ?? { items: [] }; } catch { return { items: [] }; }
  }
}

const PLAY = <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>;

function ago(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/** 중계 보기 버튼과 최근 경기 영상 */
function VideosCard({ file }: { file: VideoFile }) {
  const [all, setAll] = useState(false);
  const list = all ? file.items : file.items.slice(0, 3);
  return (
    <section className="card">
      <div className="row between">
        <h2>경기 중계</h2>
        <a className="btn small live-btn" href={file.liveUrl ?? `${CHANNEL}/live`} target="_blank" rel="noopener noreferrer">{PLAY} 지금 중계 보기</a>
      </div>
      <div className="small muted">{file.channel ?? '15시15중'} 유튜브 채널에서 대회를 중계합니다. 생방송이 없으면 채널의 최근 영상이 열립니다.</div>
      {list.length > 0 && (
        <ol className="video-list">
          {list.map((v) => (
            <li key={v.id}>
              <a href={v.url} target="_blank" rel="noopener noreferrer">
                <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" width={96} height={54} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                <span className="v-main"><b>{v.title}</b><span className="small muted">{ago(v.published)}</span></span>
              </a>
            </li>
          ))}
        </ol>
      )}
      {file.items.length > 3 && <button className="btn ghost small" style={{ alignSelf: 'center' }} onClick={() => setAll(!all)}>{all ? '접기' : `영상 ${file.items.length}개 모두 보기`}</button>}
    </section>
  );
}

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

function Item({ t, now, mine, videos = [] }: { t: Tournament; now: string; mine: boolean; videos?: Video[] }) {
  const d = dLabel(t, now);
  const vs = videosFor(t, videos);
  return (
    <li className={`tour-row ${mine ? 'mine' : ''}`}>
      <a className="tour-link" href={t.url} target="_blank" rel="noopener noreferrer">
        <span className={`dday ${d === '진행 중' ? 'live' : ''}`}>{d}</span>
        <span className="tour-main">
          <b>{t.name}</b>
          <span className="small muted">{periodText(t)} · {t.place}{mine && <span className="pill best">내 활터</span>}</span>
        </span>
        <span className="chev" aria-hidden="true">›</span>
      </a>
      {vs.length > 0 && (
        <span className="tour-videos">
          {vs.map((v, i) => (
            <a key={v.id} className="pill vid" href={v.url} target="_blank" rel="noopener noreferrer">{PLAY} {vs.length > 1 ? `${i + 1}일차 영상` : '중계 영상'}</a>
          ))}
        </span>
      )}
    </li>
  );
}

/** 달력 보기: 대회가 있는 날에 점, 날을 누르면 그날 대회 */
function CalendarCard({ items, now, names, videos }: { items: Tournament[]; now: string; names: string[]; videos: Video[] }) {
  const [ym, setYm] = useState(now.slice(0, 7));
  const [day, setDay] = useState<string | null>(now);
  const weeks = monthGrid(ym);
  const picked = day && day.startsWith(ym) ? onDay(items, day) : [];
  return (
    <section className="card">
      <div className="period-nav">
        <button className="act-btn" aria-label="이전 달" onClick={() => setYm(shiftMonth(ym, -1))}>‹</button>
        <b>{ym.slice(0, 4)}년 {Number(ym.slice(5, 7))}월</b>
        <button className="act-btn" aria-label="다음 달" onClick={() => setYm(shiftMonth(ym, 1))}>›</button>
      </div>
      <table className="tour-cal">
        <thead><tr>{'일월화수목금토'.split('').map((w, i) => <th key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</th>)}</tr></thead>
        <tbody>
          {weeks.map((w, i) => (
            <tr key={i}>
              {w.map((d, j) => {
                if (!d) return <td key={j} />;
                const list = onDay(items, d);
                const mine = list.some((t) => isMyRange(t.place, names));
                return (
                  <td key={j}>
                    <button className={`cal-day ${d === now ? 'today' : ''} ${d === day ? 'on' : ''} ${d < now ? 'past' : ''} ${j === 0 ? 'sun' : j === 6 ? 'sat' : ''}`}
                      aria-label={`${Number(d.slice(8))}일${list.length ? `, 대회 ${list.length}개` : ''}`} aria-pressed={d === day} onClick={() => setDay(d)}>
                      <span className="n">{Number(d.slice(8))}</span>
                      <span className="marks">{list.slice(0, 3).map((t) => <i key={t.id} className={isMyRange(t.place, names) ? 'mine' : ''} />)}{list.length > 3 && <em>+</em>}</span>
                      {mine && <span className="sr-only">내 활터</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {day && day.startsWith(ym) && (
        <div className="cal-picked">
          <div className="tour-month-head">{Number(day.slice(5, 7))}월 {Number(day.slice(8))}일 대회 {picked.length}개</div>
          {picked.length === 0
            ? <div className="small muted">이날 열리는 대회가 없습니다.</div>
            : <ol className="tour-list">{picked.map((t) => <Item key={t.id} t={t} now={now} mine={isMyRange(t.place, names)} videos={videos} />)}</ol>}
        </div>
      )}
    </section>
  );
}

export function TournamentsView({ active }: { active: boolean }) {
  const { ranges } = useStore();
  const [file, setFile] = useState<TournamentFile | null>(null);
  const [cached, setCached] = useState(false);
  const [err, setErr] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [mode, setMode] = useState<'list' | 'cal'>('list');
  const [vfile, setVfile] = useState<VideoFile | null>(null);
  useEffect(() => {
    if (!active || vfile) return;
    void loadVideos().then(setVfile);
  }, [active, vfile]);
  const videos = vfile?.items ?? [];

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

  const modeSwitch = (
    <div className="seg view-switch" role="group" aria-label="대회 보기 방식">
      <button className={mode === 'list' ? 'on' : ''} aria-pressed={mode === 'list'} onClick={() => setMode('list')}>목록</button>
      <button className={mode === 'cal' ? 'on' : ''} aria-pressed={mode === 'cal'} onClick={() => setMode('cal')}>달력</button>
    </div>
  );

  return (
    <>
      <VideosCard file={vfile ?? { items: [] }} />
      {modeSwitch}
      {mode === 'cal' && <CalendarCard items={file.items} now={now} names={names} videos={videos} />}
      {mode === 'list' && <section className="card">
        <div className="row between"><h2>다가오는 대회</h2><span className="small muted">{upcoming.length}개</span></div>
        {upcoming.length === 0 && <div className="empty small">올라온 다가오는 대회가 없습니다.</div>}
        {[...months].map(([m, list]) => (
          <div key={m} className="tour-month">
            <div className="tour-month-head">{Number(m.slice(5, 7))}월</div>
            <ol className="tour-list">{list.map((t) => <Item key={t.id} t={t} now={now} mine={isMyRange(t.place, names)} videos={videos} />)}</ol>
          </div>
        ))}
        <button className="btn ghost small" style={{ alignSelf: 'center' }} onClick={() => setShowPast(!showPast)}>{showPast ? '지난 대회 숨기기' : '지난 대회 보기'}</button>
        {showPast && <ol className="tour-list">{past.slice(0, 20).map((t) => <Item key={t.id} t={t} now={now} mine={isMyRange(t.place, names)} videos={videos} />)}</ol>}
      </section>}
      <div className="small muted tour-note">
        출처: <a href={file.source ?? SOURCE} target="_blank" rel="noopener noreferrer">대한궁도협회 대회일정</a>. 대회를 누르면 요강이 있는 협회 글이 열립니다.
        {updated && ` ${updated.getMonth() + 1}월 ${updated.getDate()}일에 받아 온 목록입니다.`}
        {cached && ' 지금은 연결이 안 되어 이 기기에 저장해 둔 목록을 보여 줍니다.'}
        {' '}일정은 바뀔 수 있으니 참가 전에 원문을 꼭 확인하세요.
      </div>
    </>
  );
}
