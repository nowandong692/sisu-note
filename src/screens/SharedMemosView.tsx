import { useEffect, useState } from 'react';
import { danShort } from '../domain/dan';
import { agoLabel, type SharedMemo } from '../domain/sharedMemo';
import { formatDate } from '../domain/util';
import { onlineAvailable, rpc } from '../platform/online';
import { useStore } from '../state/store';

type Filter = 'all' | 'club' | 'mine';
const PAGE = 30;

function MemoCard({ m }: { m: SharedMemo }) {
  const n = m.hits.filter(Boolean).length;
  return (
    <li className={`shared-memo ${m.mine ? 'me' : ''}`}>
      <div className="sm-who">
        <b>{m.nickname}</b>{m.dan ? <span className="pill dan">{danShort(m.dan)}</span> : null}{m.mine && <span className="pill best">나</span>}
        {m.range_name && <span className="small muted"> · {m.range_name}</span>}
        <span className="sm-ago small muted">{agoLabel(m.created_at)}</span>
      </div>
      <div className="sm-end">
        <span className="small">{formatDate(m.day)}{m.end_no ? ` · ${m.end_no}순` : ''}</span>
        <span className="mini-dots" aria-label={m.hits.map((x, k) => `${k + 1}시 ${x ? '관중' : '불'}`).join(', ')}>
          {m.hits.map((x, k) => <i key={k} className={x ? 'hit' : ''} />)}
        </span>
        <span className="small">{n}중{n === 5 && <span className="pill best">몰기</span>}</span>
        {m.scope === 'club' && <span className="pill scope">같은 활터만</span>}
      </div>
      {m.memo && <div className="sm-text">{m.memo}</div>}
      {m.tags.length > 0 && <div className="sm-tags">{m.tags.map((t) => <span key={t} className="pill tag">#{t}</span>)}</div>}
    </li>
  );
}

/** 궁사들이 공개한 순 메모. 최근에 공개한 것부터 보고, 더 보기로 이어서 불러온다. */
export function SharedMemosView({ active }: { active: boolean }) {
  const store = useStore();
  const o = store.online;
  const [filter, setFilter] = useState<Filter>('all');
  const [list, setList] = useState<SharedMemo[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const load = async (before: number | null) => {
    setLoading(true);
    setErr('');
    try {
      const rows = await rpc<SharedMemo[]>('shared_memo_list', { p_key: o?.key ?? null, p_filter: filter, p_before: before, p_limit: PAGE });
      setList((p) => (before && p ? [...p, ...rows] : rows));
      setMore(rows.length === PAGE);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      if (!before) setList(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active || !onlineAvailable()) return;
    void load(null);
  }, [active, filter, o?.key, tick, store.memoPending === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!onlineAvailable()) {
    return <section className="card"><h2>공개 메모</h2><div className="empty">서버를 준비하고 있습니다. 곧 열립니다.</div></section>;
  }

  const filters: [Filter, string][] = o ? [['all', '전체'], ['club', '우리 활터'], ['mine', '내 메모']] : [['all', '전체']];
  const emptyText = filter === 'mine'
    ? '아직 공개한 메모가 없습니다. 습사 탭에서 순을 저장할 때 "메모 공개"를 고르면 여기에 올라갑니다.'
    : filter === 'club' && !o?.rangeName
      ? '설정에서 소속 활터를 정하면 같은 활터 궁사의 메모를 모아 볼 수 있습니다.'
      : '아직 공개된 메모가 없습니다.';

  return (
    <section className="card shared-memos">
      <div className="small muted">궁사들이 공개한 순 메모입니다. 시수와 함께 보고 서로의 습사를 참고하세요.</div>
      <div className="row between">
        <div className="seg" role="group" aria-label="공개 메모 거르기">
          {filters.map(([f, l]) => <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</button>)}
        </div>
        <button className="act-btn" aria-label="새로 고침" onClick={() => setTick((t) => t + 1)} disabled={loading}>↻</button>
      </div>
      {!o && <div className="small muted">겨루기 탭의 랭킹에서 닉네임을 정하면 내 메모도 공개하고, 같은 활터 메모도 볼 수 있습니다.</div>}
      {o && store.memoPending > 0 && <div className="small muted">아직 서버에 알리지 못한 메모 {store.memoPending}개가 있습니다. 인터넷에 연결되면 올라갑니다.</div>}
      {err && <div className="small err-text" role="alert">{err}</div>}
      {loading && !list && <div className="empty small">불러오는 중…</div>}
      {list && list.length === 0 && <div className="empty small">{emptyText}</div>}
      {list && list.length > 0 && <ol className="shared-list">{list.map((m) => <MemoCard key={m.id} m={m} />)}</ol>}
      {list && more && <button className="btn ghost small" disabled={loading} onClick={() => void load(list[list.length - 1].id)}>{loading ? '불러오는 중…' : '더 보기'}</button>}
    </section>
  );
}
