import { useEffect, useRef, useState } from 'react';
import { danShort } from '../domain/dan';
import { GradeMark } from '../components/GradeMark';
import { gradeByLevel } from '../domain/grade';
import { AutoTextarea, ConfirmButton, toast } from '../components/ui';
import { ReactionBar, ReactionPicker, useHoldToReact, useReactionToggle } from '../components/Reactions';
import { agoLabel, cleanComment, COMMENT_MAX, COMMENT_PAGE, hasNewComment, lastReactionOf, myReactionsOf, newReactionKinds, newsText, olderCommentCount, shouldReplacePage, REPORT_REASONS, type MemoComment, type SharedMemo } from '../domain/sharedMemo';
import { formatDate } from '../domain/util';
import { onlineAvailable, rpc } from '../platform/online';
import { useStore } from '../state/store';

type Filter = 'all' | 'club' | 'mine';
const PAGE = 30;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 남의 메모나 댓글 신고. 누르면 사유를 고르고, 고르면 바로 보낸다 */
function ReportButton({ memoId, commentId, who }: { memoId?: number; commentId?: number; who: string }) {
  const { online } = useStore();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (!online) return null;
  if (done) return <span className="small muted report-done">신고함</span>;
  const send = async (reason: string) => {
    try {
      await rpc('report_content', { p_key: online.key, p_memo_id: memoId ?? null, p_comment_id: commentId ?? null, p_reason: reason });
      setDone(true);
      toast('신고를 받았습니다. 관리자가 확인합니다');
    } catch (e) {
      toast(errText(e));
    } finally {
      setOpen(false);
    }
  };
  if (!open) return <button className="report-btn" aria-label={`${who}님 ${commentId ? '댓글' : '메모'} 신고`} onClick={() => setOpen(true)}>신고</button>;
  return (
    <div className="report-pick" role="group" aria-label="신고 사유">
      {REPORT_REASONS.map((r) => <button key={r} className="chip" onClick={() => void send(r)}>{r}</button>)}
      <button className="chip quiet" onClick={() => setOpen(false)}>취소</button>
    </div>
  );
}

/** 댓글 하나. 남의 댓글은 길게 눌러 반응을 고르고, 보이는 반응을 눌러 더하거나 취소한다 */
function CommentItem({ c, memoOwner, onRemove }: { c: MemoComment; memoOwner: string; onRemove: () => void }) {
  const { online } = useStore();
  const r = useReactionToggle(c.reactions, c.my_reactions ?? [], 'react_comment', { p_comment_id: c.id });
  const canReact = !!online && !c.mine && c.reactions !== undefined;
  const [picking, setPicking] = useState(false);
  const hold = useHoldToReact(() => setPicking(true), canReact);
  return (
    <li className={`${c.mine ? 'me' : ''} ${canReact ? 'holdable' : ''}`} {...hold}>
      <div className="c-head">
        {gradeByLevel(c.grade) && <GradeMark grade={gradeByLevel(c.grade)} size={18} className="who-grade" />}
        <b>{c.nickname}</b>{c.dan ? <span className="pill dan">{danShort(c.dan)}</span> : null}
        {c.nickname === memoOwner && <span className="pill best">글쓴이</span>}
        {c.range_name && <span className="small muted"> · {c.range_name}</span>}
        <span className="small muted c-ago">{agoLabel(c.created_at)}</span>
        {!c.mine && !c.can_delete && <ReportButton commentId={c.id} who={c.nickname} />}
        {c.can_delete && <ConfirmButton className="act-btn danger small-del" label="지우기" confirmLabel="지우기 확인" ariaLabel={`${c.nickname}님 댓글 지우기`} onConfirm={onRemove} />}
      </div>
      <div className="c-body">{c.body}</div>
      {c.report_hidden && <div className="small err-text">신고가 많아 다른 사람에게는 보이지 않습니다.</div>}
      <ReactionBar counts={r.counts} mine={r.mine} canReact={canReact} onToggle={(k) => void r.toggle(k)} />
      {picking && <ReactionPicker mine={r.mine} onPick={(k) => void r.toggle(k)} onClose={() => setPicking(false)} />}
    </li>
  );
}

/** 한 메모의 댓글: 보기, 달기, 지우기 (내가 쓴 댓글과 내 메모에 달린 댓글) */
function Comments({ m, onCount }: { m: SharedMemo; onCount: (n: number) => void }) {
  const { online } = useStore();
  const [list, setList] = useState<MemoComment[] | null>(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [older, setOlder] = useState(false);
  /** before가 없으면 최근 댓글부터 새로, 있으면 그 앞의 댓글을 위에 이어 붙인다 */
  const load = async (before?: number) => {
    try {
      const rows = await rpc<MemoComment[]>('memo_comment_list', { p_key: online?.key ?? null, p_memo_id: m.id, ...(before ? { p_before: before } : {}) });
      setList((p) => (before && p ? [...rows, ...p] : rows));
      setErr('');
      const t = rows[0]?.total;
      setTotal(t);
      if (!before) onCount(t ?? rows.length);
    } catch (e) {
      setErr(errText(e));
    }
  };
  const loadOlder = async () => {
    if (!list?.length) return;
    setOlder(true);
    await load(list[0].id);
    setOlder(false);
  };
  const hidden = list ? olderCommentCount(list.length, total) : 0;
  useEffect(() => { void load(); }, [m.id, online?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!online) return;
    const { body, problem } = cleanComment(text);
    if (problem) { setErr(problem); return; }
    setBusy(true);
    try {
      await rpc('add_comment', { p_key: online.key, p_memo_id: m.id, p_body: body });
      setText('');
      await load();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: MemoComment) => {
    if (!online) return;
    try {
      await rpc('delete_comment', { p_key: online.key, p_comment_id: c.id });
      toast('댓글을 지웠습니다');
      await load();
    } catch (e) {
      toast(errText(e));
    }
  };
  const left = COMMENT_MAX - [...text.trim()].length;

  return (
    <div className="sm-comments">
      {!list && !err && <div className="small muted">댓글을 불러오는 중…</div>}
      {list && list.length === 0 && <div className="small muted">아직 댓글이 없습니다.{online && !m.mine ? ' 첫 댓글을 남겨 보세요.' : ''}</div>}
      {hidden > 0 && (
        <button className="comment-older" disabled={older} onClick={() => void loadOlder()}>
          {older ? '불러오는 중…' : `이전 댓글 ${Math.min(hidden, COMMENT_PAGE)}개 더 보기${hidden > COMMENT_PAGE ? ` (남은 ${hidden}개)` : ''}`}
        </button>
      )}
      {list && list.length > 0 && (
        <ol className="comment-list">
          {list.map((c) => <CommentItem key={c.id} c={c} memoOwner={m.nickname} onRemove={() => void remove(c)} />)}
        </ol>
      )}
      {err && <div className="small err-text" role="alert">{err}</div>}
      {online ? (
        <div className="comment-form">
          <label htmlFor={`cm-${m.id}`} className="sr-only">{m.nickname}님 메모에 댓글</label>
          <AutoTextarea id={`cm-${m.id}`} rows={1} placeholder={m.mine ? '답글 달기' : '조언이나 응원을 남겨 보세요'} value={text} maxLength={COMMENT_MAX + 20}
            onChange={(e) => { setText(e.target.value); if (err) setErr(''); }} />
          <div className="row between">
            <span className={`small ${left < 0 ? 'err-text' : 'muted'}`}>{left < 30 ? `${left}자 남음` : ''}</span>
            <button className="btn small" disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? '올리는 중…' : '댓글 달기'}</button>
          </div>
        </div>
      ) : (
        <div className="small muted">겨루기 탭의 랭킹에서 닉네임을 정하면 댓글을 달 수 있습니다.</div>
      )}
    </div>
  );
}

function MemoCard({ m, seen, seenReaction }: { m: SharedMemo; seen: number; seenReaction: number }) {
  const { online } = useStore();
  const fresh = newReactionKinds(m, seenReaction);
  const r = useReactionToggle(m.reactions, myReactionsOf(m), 'react_memo', { p_memo_id: m.id });
  const canReact = !!online && !m.mine && m.reactions !== undefined; // 서버에 017이 없으면 반응을 쓰지 않는다
  const [picking, setPicking] = useState(false);
  const hold = useHoldToReact(() => setPicking(true), canReact);
  const n = m.hits.filter(Boolean).length;
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(m.comments ?? 0);
  return (
    <li className={`shared-memo ${m.mine ? 'me' : ''}`}>
      <div className={`sm-main ${canReact ? 'holdable' : ''}`} {...hold}>
      <div className="sm-who">
        {gradeByLevel(m.grade) && <GradeMark grade={gradeByLevel(m.grade)} size={20} className="who-grade" />}
        <b>{m.nickname}</b>{m.dan ? <span className="pill dan">{danShort(m.dan)}</span> : null}{m.mine && <span className="pill best">나</span>}
        {m.range_name && <span className="small muted"> · {m.range_name}</span>}
        <span className="sm-ago small muted">{agoLabel(m.created_at)}</span>
      </div>
      <div className="sm-end">
        {m.kind === 'day' ? <>
          <span className="small">{formatDate(m.day)}</span>
          <span className="pill day">하루 메모</span>
          {!!m.ends && <span className="small">{m.ends}순 {m.hit_count ?? 0}중</span>}
        </> : <>
        <span className="small">{formatDate(m.day)}{m.end_no ? ` · ${m.end_no}순` : ''}</span>
        <span className="mini-dots" aria-label={m.hits.map((x, k) => `${k + 1}시 ${x ? '관중' : '불'}`).join(', ')}>
          {m.hits.map((x, k) => <i key={k} className={x ? 'hit' : ''} />)}
        </span>
        <span className="small">{n}중{n === 5 && <span className="pill best">몰기</span>}</span>
        </>}
        {m.scope === 'club' && <span className="pill scope">같은 활터만</span>}
        {hasNewComment(m, seen) && <span className="pill best">새 댓글</span>}
        {fresh.length > 0 && <span className="pill best">새 반응</span>}
      </div>
      {m.report_hidden && <div className="small err-text">신고가 많아 다른 사람에게는 보이지 않습니다. 관리자가 확인합니다.</div>}
      {m.memo && <div className="sm-text">{m.memo}</div>}
      {m.tags.length > 0 && <div className="sm-tags">{m.tags.map((t) => <span key={t} className="pill tag">#{t}</span>)}</div>}
      </div>
      <ReactionBar counts={r.counts} mine={r.mine} canReact={canReact} fresh={fresh} onToggle={(k) => void r.toggle(k)} />
      {picking && <ReactionPicker mine={r.mine} onPick={(k) => void r.toggle(k)} onClose={() => setPicking(false)} />}
      <div className="row between sm-actions">
        <div className="row sm-acts-left">
          <button className="comment-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? '댓글 접기' : count > 0 ? `댓글 ${count}개` : '댓글 달기'}
          </button>
          {canReact && <button className="comment-toggle react-add" aria-expanded={picking} onClick={() => setPicking(!picking)}>반응하기</button>}
        </div>
        {!m.mine && <ReportButton memoId={m.id} who={m.nickname} />}
      </div>
      {open && <Comments m={m} onCount={setCount} />}
    </li>
  );
}

/** 궁사들이 공개한 순 메모와 하루 메모. 최근에 공개한 것부터 보고, 더 보기로 이어서 불러온다. */
export function SharedMemosView({ active }: { active: boolean }) {
  const store = useStore();
  const o = store.online;
  const [filter, setFilter] = useState<Filter>('all');
  const [list, setList] = useState<SharedMemo[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  /** 목록을 불러올 때 본 곳 (이번에 보는 동안 "새 댓글" 표시를 그대로 둔다) */
  const [seen, setSeen] = useState(store.settings.commentSeen ?? 0);
  const [seenReaction, setSeenReaction] = useState(store.settings.reactionSeen ?? 0);
  /** 글이 너무 많이 쌓여 앞의 글을 비우고 다음 묶음만 보이는 중 */
  const [paged, setPaged] = useState(false);
  const topRef = useRef<HTMLElement>(null);

  const load = async (before: number | null) => {
    setLoading(true);
    setErr('');
    try {
      const rows = await rpc<SharedMemo[]>('shared_memo_list', { p_key: o?.key ?? null, p_filter: filter, p_before: before, p_limit: PAGE });
      // 더 보기로 MEMO_LIST_MAX개를 넘기면 앞의 글은 비우고 다음 묶음만 보인다 (오래된 폰이 느려지지 않게)
      const replace = !!before && shouldReplacePage(list?.length ?? 0, PAGE);
      setList((p) => (before && p && !replace ? [...p, ...rows] : rows));
      setMore(rows.length === PAGE);
      if (!before) { setSeen(store.settings.commentSeen ?? 0); setSeenReaction(store.settings.reactionSeen ?? 0); setPaged(false); }
      if (replace) { setPaged(true); topRef.current?.scrollIntoView({ block: 'start' }); }
      // 내 메모 목록을 보면 새 댓글을 본 것으로 친다 (빨간 점이 사라진다)
      if (filter === 'mine') {
        const top = Math.max(0, ...rows.map((r) => r.last_comment ?? 0));
        if (top) void store.markCommentsSeen(Math.max(top, store.commentNews.latest));
        const topR = Math.max(0, ...rows.map(lastReactionOf));
        if (topR) void store.markReactionsSeen(Math.max(topR, store.reactionNews.latest));
      }
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
    void store.refreshCommentNews();
  }, [active, filter, o?.key, tick, store.memoPending === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!onlineAvailable()) {
    return <section className="card"><h2>활쏜얘기</h2><div className="empty">서버를 준비하고 있습니다. 곧 열립니다.</div></section>;
  }

  const filters: [Filter, string][] = o ? [['all', '전체'], ['club', '우리 활터'], ['mine', '내 메모']] : [['all', '전체']];
  const emptyText = filter === 'mine'
    ? '아직 공개한 메모가 없습니다. 습사 탭에서 순을 저장할 때 "메모 공개"를 고르면 여기에 올라갑니다.'
    : filter === 'club' && !o?.rangeName
      ? '설정에서 소속 활터를 정하면 같은 활터 궁사의 메모를 모아 볼 수 있습니다.'
      : '아직 공개된 메모가 없습니다.';

  return (
    <section className="card shared-memos" ref={topRef}>
      <div className="small muted">궁사들이 공개한 순 메모와 하루 메모입니다. 시수와 함께 보고 서로의 습사를 참고하세요.</div>
      <div className="row between">
        <div className="seg" role="group" aria-label="공개 메모 거르기">
          {filters.map(([f, l]) => <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</button>)}
        </div>
        <button className="act-btn" aria-label="새로 고침" onClick={() => setTick((t) => t + 1)} disabled={loading}>↻</button>
      </div>
      {!o && <div className="small muted">겨루기 탭의 랭킹에서 닉네임을 정하면 내 메모도 공개하고, 같은 활터 메모도 볼 수 있습니다.</div>}
      {o && filter !== 'mine' && store.commentNews.unread + store.reactionNews.unread > 0 && (
        <button className="banner news-banner" onClick={() => setFilter('mine')}>
          <span>내 메모에 {newsText(store.commentNews.unread, store.reactionNews.unread)}가 달렸습니다.</span><b>보기</b>
        </button>
      )}
      {o && store.memoPending > 0 && <div className="small muted">아직 서버에 알리지 못한 메모 {store.memoPending}개가 있습니다. 인터넷에 연결되면 올라갑니다.</div>}
      {err && <div className="small err-text" role="alert">{err}</div>}
      {loading && !list && <div className="empty small">불러오는 중…</div>}
      {list && list.length === 0 && <div className="empty small">{emptyText}</div>}
      {paged && (
        <div className="paged-note">
          <span className="small muted">앞의 글은 정리하고 이어지는 글을 보여 드립니다.</span>
          <button className="btn ghost small" onClick={() => void load(null)}>최근 글로 돌아가기</button>
        </div>
      )}
      {list && list.length > 0 && <ol className="shared-list">{list.map((m) => <MemoCard key={m.id} m={m} seen={seen} seenReaction={seenReaction} />)}</ol>}
      {list && more && <button className="btn ghost small" disabled={loading} onClick={() => void load(list[list.length - 1].id)}>{loading ? '불러오는 중…' : '더 보기'}</button>}
    </section>
  );
}
