import type { End, MemoShare, OnlineProfile, Settings } from './types';

/** 공개 메모 글자 수 한도 (서버도 같은 한도로 자른다) */
export const SHARED_MEMO_MAX = 500;
/** 공개 메모에 함께 올리는 태그 수 한도 */
export const SHARED_TAGS_MAX = 10;

export const SHARE_LABEL: Record<MemoShare, string> = { all: '전체 공개', club: '같은 활터 공개' };

/** 메모 공개 상태. 메모와 태그가 없으면 보일 것이 없으니 null */
export type ShareState = MemoShare | 'private';
export function shareStateOf(e: End): ShareState | null {
  if (!e.memo.trim() && !e.tags.length) return null;
  return e.share ?? 'private';
}
export const SHARE_STATE_LABEL: Record<ShareState, string> = { ...SHARE_LABEL, private: '나만 보기' };

/** 새 순의 공개 범위: 마지막으로 고른 것. 참여하지 않았거나, 같은 활터인데 소속이 없으면 나만 보기 */
export function defaultShare(settings: Pick<Settings, 'lastShare'>, online: Pick<OnlineProfile, 'rangeName'> | null | undefined): MemoShare | null {
  const s = settings.lastShare ?? null;
  if (!online || !s) return null;
  if (s === 'club' && !online.rangeName) return null;
  return s;
}

/** 그날 몇 번째 순인지 (저장한 차례, 1부터) */
export function endNoOf(ends: End[], e: End): number {
  const day = ends.filter((x) => x.date === e.date).sort((a, b) => a.recordedAt - b.recordedAt || (a.id < b.id ? -1 : 1));
  const i = day.findIndex((x) => x.id === e.id);
  return i < 0 ? day.length + 1 : i + 1;
}

export interface ShareArgs {
  p_client_id: string;
  p_day: string;
  p_end_no: number;
  p_hits: boolean[];
  p_tags: string[];
  p_memo: string;
  p_scope: MemoShare;
}

/** 서버에 올릴 공개 메모. 공개하지 않았거나 메모와 태그가 모두 비었으면 null (= 서버에서 내린다) */
export function shareArgs(e: End | undefined, ends: End[]): ShareArgs | null {
  if (!e?.share) return null;
  const memo = e.memo.trim().slice(0, SHARED_MEMO_MAX);
  const tags = e.tags.slice(0, SHARED_TAGS_MAX);
  if (!memo && !tags.length) return null;
  return { p_client_id: e.id, p_day: e.date, p_end_no: endNoOf(ends, e), p_hits: e.shots.map((s) => s.hit), p_tags: tags, p_memo: memo, p_scope: e.share };
}

/** 이 순의 공개 상태를 서버에 다시 알려야 하는가 (공개 중이었거나 공개하게 됐으면) */
export const shareTouched = (before: End | undefined, after: End | undefined) => !!(before?.share || after?.share);

/** 서버가 돌려준 공개 메모 한 줄 */
export interface SharedMemo {
  id: number;
  nickname: string;
  range_name: string | null;
  dan: number | null;
  day: string;
  end_no: number | null;
  hits: boolean[];
  tags: string[];
  memo: string;
  scope: MemoShare;
  created_at: string;
  updated_at: string;
  mine: boolean;
}

/** "방금", "5분 전", "3시간 전", "어제", "4일 전", 그보다 오래면 날짜 */
export function agoLabel(iso: string, now = Date.now()): string {
  const m = Math.floor((now - Date.parse(iso)) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d === 1) return '어제';
  if (d < 7) return `${d}일 전`;
  const t = new Date(iso);
  return `${t.getFullYear() !== new Date(now).getFullYear() ? `${t.getFullYear()}년 ` : ''}${t.getMonth() + 1}월 ${t.getDate()}일`;
}
