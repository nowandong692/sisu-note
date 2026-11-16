import { useState } from 'react';
import { ShotIcon } from '../components/ShotIcon';
import { searchDayMemos, searchMemos, splitByTerms } from '../domain/memo';
import { DayShareBadge, ShareBadge } from '../components/ShareBadge';
import { shareStateOf } from '../domain/sharedMemo';
import { hitsOf } from '../domain/stats';
import { myTags } from '../domain/tags';
import { formatDate } from '../domain/util';
import { weatherLabel } from '../domain/weather';
import { useStore } from '../state/store';

function Marked({ text, query }: { text: string; query: string }) {
  return <>{splitByTerms(text, query).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

/** 메모와 태그를 남긴 순, 하루 메모를 한곳에 모아 보고 찾는다. 누르면 그날 기록으로 간다. */
export function MemoView({ onJump, onJumpDay }: { onJump: (date: string, id: string) => void; onJumpDay: (date: string) => void }) {
  const { ends, days, gearName, rangeName, settings, online } = useStore();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [vis, setVis] = useState<'any' | 'shared' | 'private'>('any');
  const tags = [...new Set([...myTags(settings), ...ends.flatMap((e) => e.tags)])].filter((t) => ends.some((e) => e.tags.includes(t)));
  const visOk = (e: (typeof ends)[number]) => vis === 'any' || (vis === 'private' ? shareStateOf(e) === 'private' : !!e.share);
  const hits = searchMemos(ends, q, tag, gearName, rangeName).filter((h) => !online || visOk(h.end));
  const anyShared = ends.some((e) => e.share && shareStateOf(e)) || days.some((d) => d.share);
  // 하루 메모는 태그가 없다
  const dayHits = tag ? [] : searchDayMemos(days, q).filter((d) => !online || vis === 'any' || (vis === 'shared') === !!d.share);
  const endTotal = searchMemos(ends, '', null, gearName, rangeName).length;
  const dayTotal = searchDayMemos(days, '').length;
  const total = endTotal + dayTotal;
  const shown = hits.length + dayHits.length;
  // 날짜 최근 것부터, 같은 날이면 하루 메모를 먼저
  type Item = { kind: 'day'; date: string; memo: string } | { kind: 'end'; hit: (typeof hits)[number] };
  const items: Item[] = [...dayHits.map((d): Item => ({ kind: 'day', date: d.date, memo: d.memo })), ...hits.map((h): Item => ({ kind: 'end', hit: h }))];
  const dateOf = (it: Item) => (it.kind === 'day' ? it.date : it.hit.end.date);
  const order = new Map(items.map((it, i) => [it, i]));
  items.sort((a, b) => (dateOf(a) === dateOf(b) ? (a.kind === b.kind ? order.get(a)! - order.get(b)! : a.kind === 'day' ? -1 : 1) : dateOf(a) < dateOf(b) ? 1 : -1));

  return (
    <section className="card memo-view">
      <div className="field">
        <label htmlFor="memoSearch" className="sr-only">메모 검색</label>
        <input id="memoSearch" type="search" placeholder="메모 검색 (예: 만작, 바람, 활 별명, 활터)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {tags.length > 0 && (
        <div className="chips" role="group" aria-label="태그로 거르기">
          <button className={`chip ${tag == null ? 'on' : ''}`} onClick={() => setTag(null)}>모든 태그</button>
          {tags.map((t) => <button key={t} className={`chip ${tag === t ? 'on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>)}
        </div>
      )}
      {online && (anyShared || vis !== 'any') && (
        <div className="seg" role="group" aria-label="공개 여부로 거르기">
          {([['any', '모두'], ['shared', '공개'], ['private', '나만 보기']] as const).map(([v, l]) => (
            <button key={v} className={vis === v ? 'on' : ''} aria-pressed={vis === v} onClick={() => setVis(v)}>{l}</button>
          ))}
        </div>
      )}
      <div className="small muted">{q || tag || vis !== 'any' ? `${total}개 중 ${shown}개` : `메모·태그를 남긴 순 ${endTotal}개${dayTotal ? ` · 하루 메모 ${dayTotal}개` : ''}`}</div>
      {total === 0 && <div className="empty">아직 메모가 없습니다. 습사 탭에서 순을 저장할 때 메모나 태그를 남기거나, 오늘 메모를 써 보세요.</div>}
      {total > 0 && shown === 0 && <div className="empty">맞는 메모가 없습니다.</div>}
      <div className="memo-list">
        {items.map((it) => {
          if (it.kind === 'day') return (
            <button key={`day-${it.date}`} className="memo-item day" onClick={() => onJumpDay(it.date)}>
              <div className="mi-head"><b>{formatDate(it.date)}</b><span className="pill day">하루 메모</span></div>
              <div className="mi-text"><Marked text={it.memo} query={q} /></div>
              {online && <div className="mi-meta"><DayShareBadge date={it.date} /></div>}
            </button>
          );
          const { end: e, index } = it.hit;
          const h = hitsOf(e);
          const w = weatherLabel(e.weather);
          return (
            <button key={e.id} className="memo-item" onClick={() => onJump(e.date, e.id)}>
              <div className="mi-head">
                <b>{formatDate(e.date)} · {index}순</b>
                <span className="dots">{e.shots.map((s, i) => <ShotIcon key={i} shot={s} index={i} />)}</span>
                <span className="cnt">{h}중</span>
              </div>
              {e.memo && <div className="mi-text"><Marked text={e.memo} query={q} /></div>}
              <div className="mi-meta">
                <ShareBadge end={e} />
                {e.tags.map((t) => <span key={t} className="pill">#{t}</span>)}
                <span>{e.rangeId ? `${rangeName(e.rangeId)} · ` : ''}{gearName(e.bowId)} · {gearName(e.ringId)}{w && ` · ${w}`}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
