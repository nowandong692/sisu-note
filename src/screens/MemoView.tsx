import { useState } from 'react';
import { ShotIcon } from '../components/ShotIcon';
import { searchMemos, splitByTerms } from '../domain/memo';
import { hitsOf } from '../domain/stats';
import { MEMO_TAGS } from '../domain/types';
import { formatDate } from '../domain/util';
import { weatherLabel } from '../domain/weather';
import { useStore } from '../state/store';

function Marked({ text, query }: { text: string; query: string }) {
  return <>{splitByTerms(text, query).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

/** 메모와 태그를 남긴 순을 한곳에 모아 보고 찾는다. 누르면 그날 기록으로 간다. */
export function MemoView({ onJump }: { onJump: (date: string, id: string) => void }) {
  const { ends, gearName, rangeName } = useStore();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const tags = [...new Set([...MEMO_TAGS, ...ends.flatMap((e) => e.tags)])].filter((t) => ends.some((e) => e.tags.includes(t)));
  const hits = searchMemos(ends, q, tag, gearName, rangeName);
  const total = searchMemos(ends, '', null, gearName, rangeName).length;

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
      <div className="small muted">{q || tag ? `${total}개 중 ${hits.length}개` : `메모·태그를 남긴 순 ${total}개`}</div>
      {total === 0 && <div className="empty">아직 메모가 없습니다. 습사 탭에서 순을 저장할 때 메모나 태그를 남겨 보세요.</div>}
      {total > 0 && hits.length === 0 && <div className="empty">맞는 메모가 없습니다.</div>}
      <div className="memo-list">
        {hits.map(({ end: e, index }) => {
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
