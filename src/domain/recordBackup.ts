import type { DayNote, End, MemoShare, Shot } from './types';
import { SAMPLE_PREFIX } from './sample';
import { dayClientId, isDayClientId } from './sharedMemo';

/**
 * 순 기록·하루 메모 백업 (서버의 record_backups 표, 013_record_backup.sql).
 * 휴대폰 브라우저가 저장소를 비워도 복구 코드로 순 기록과 하루 메모를 모두 되찾게 한다.
 * 순은 순 id로, 하루 메모는 'day:YYYY-MM-DD'로 한 줄씩 올린다. 예시 기록은 올리지 않는다.
 */

/** 서버에 올리는 한 줄 */
export interface RecordRow { id: string; u: number; data: End | DayNote }

/** 한 번에 올리는 줄 수 (서버 한도 200) */
export const RECORD_BATCH = 100;

const isSample = (id: string) => id.startsWith(SAMPLE_PREFIX);

/** 백업할 기록의 id: 예시가 아닌 순, 하루 메모 */
export function recordIdsOf(ends: End[], days: DayNote[]): string[] {
  return [...ends.filter((e) => !isSample(e.id)).map((e) => e.id), ...days.map((d) => dayClientId(d.date))];
}

/**
 * 앞과 뒤를 견줘 서버에 알릴 id를 고른다 (새로 생김, 고침, 지움).
 * 같은 객체면 바뀌지 않은 것으로 본다 (앱은 고칠 때마다 새 객체를 만든다).
 */
export function changedRecordIds(prev: { ends: End[]; days: DayNote[] }, next: { ends: End[]; days: DayNote[] }): string[] {
  const out: string[] = [];
  const pe = new Map(prev.ends.map((e) => [e.id, e]));
  const ne = new Map(next.ends.map((e) => [e.id, e]));
  for (const [id, e] of ne) if (pe.get(id) !== e && !isSample(id)) out.push(id);
  for (const id of pe.keys()) if (!ne.has(id) && !isSample(id)) out.push(id);
  const pd = new Map(prev.days.map((d) => [d.date, d]));
  const nd = new Map(next.days.map((d) => [d.date, d]));
  for (const [date, d] of nd) if (pd.get(date) !== d) out.push(dayClientId(date));
  for (const date of pd.keys()) if (!nd.has(date)) out.push(dayClientId(date));
  return out;
}

/** 대기열의 id를 올릴 줄과 지울 id로 나눈다 (이 기기에 있으면 올리고, 없으면 지운다) */
export function splitRecordQueue(ids: string[], ends: End[], days: DayNote[]): { put: RecordRow[]; del: string[] } {
  const be = new Map(ends.map((e) => [e.id, e]));
  const bd = new Map(days.map((d) => [dayClientId(d.date), d]));
  const put: RecordRow[] = [];
  const del: string[] = [];
  for (const id of ids) {
    const x = isDayClientId(id) ? bd.get(id) : be.get(id);
    if (x) put.push({ id, u: x.updatedAt ?? 0, data: x });
    else del.push(id);
  }
  return { put, del };
}

/** 서버에서 받은 순이 쓸 만한 꼴인지 */
function asEnd(id: string, x: unknown): End | null {
  if (!x || typeof x !== 'object') return null;
  const e = x as Partial<End>;
  if (e.id !== id || typeof e.date !== 'string' || !Array.isArray(e.shots) || typeof e.recordedAt !== 'number') return null;
  return { bowId: null, ringId: null, arrowId: null, tags: [], memo: '', updatedAt: e.recordedAt, ...e } as End;
}

function asDay(id: string, x: unknown): DayNote | null {
  if (!x || typeof x !== 'object') return null;
  const d = x as Partial<DayNote>;
  if (typeof d.date !== 'string' || dayClientId(d.date) !== id || typeof d.memo !== 'string') return null;
  return { updatedAt: 0, ...d } as DayNote;
}

/** 랭킹 서버에 올라간 순 (my_ranked_ends) */
export interface RankedEnd { client_id: string; day: string; recorded_at: string; hits: boolean[]; tags: string[] | null; memo: string | null; scope: string | null }

const hitOnly = (hit: boolean): Shot => ({ hit, x: null, y: null, zone: null, side: null, level: null, direction: null });

/** 백업이 없던 순을 랭킹 기록에서 되살린다: 관중 여부와 날짜, 저장 시각, 공개했던 메모·태그만 있다 */
export function endFromRanked(r: RankedEnd): End | null {
  if (!r.client_id || !/^\d{4}-\d{2}-\d{2}$/.test(r.day) || !Array.isArray(r.hits) || r.hits.length !== 5) return null;
  const t = Date.parse(r.recorded_at);
  const at = Number.isFinite(t) ? t : Date.parse(`${r.day}T12:00:00+09:00`);
  const share: MemoShare | null = r.scope === 'all' || r.scope === 'club' ? r.scope : null;
  return {
    id: r.client_id, date: r.day, recordedAt: at, updatedAt: at,
    bowId: null, ringId: null, arrowId: null, stringId: null, rangeId: null, weather: null,
    shots: r.hits.map((h) => hitOnly(!!h)), tags: r.tags ?? [], memo: r.memo ?? '',
    ...(share ? { share } : {}),
  };
}

/**
 * 복구할 때 서버 기록을 이 기기 기록에 합친다. 이 기기 기록은 지우지 않는다.
 * - 백업: id가 같으면 더 나중에 고친 쪽을 쓴다.
 * - 랭킹 기록: 이 기기에도 백업에도 없는 순만 넣는다 (관중 여부만 있으므로 가장 마지막 수단).
 */
export function mergeRecords(
  local: { ends: End[]; days: DayNote[] },
  rows: { client_id: string; data: unknown }[],
  ranked: RankedEnd[],
): { ends: End[]; days: DayNote[]; addedEnds: End[]; addedDays: DayNote[]; fromRanking: number } {
  const ends = new Map(local.ends.map((e) => [e.id, e]));
  const days = new Map(local.days.map((d) => [d.date, d]));
  const addedEnds = new Map<string, End>();
  const addedDays = new Map<string, DayNote>();
  for (const r of rows) {
    if (isDayClientId(r.client_id)) {
      const d = asDay(r.client_id, r.data);
      if (!d) continue;
      const mine = days.get(d.date);
      if (!mine || (d.updatedAt ?? 0) > (mine.updatedAt ?? 0)) { days.set(d.date, d); addedDays.set(d.date, d); }
    } else {
      const e = asEnd(r.client_id, r.data);
      if (!e) continue;
      const mine = ends.get(e.id);
      if (!mine || (e.updatedAt ?? 0) > (mine.updatedAt ?? 0)) { ends.set(e.id, e); addedEnds.set(e.id, e); }
    }
  }
  let fromRanking = 0;
  for (const r of ranked) {
    if (ends.has(r.client_id)) continue;
    const e = endFromRanked(r);
    if (!e) continue;
    ends.set(e.id, e); addedEnds.set(e.id, e); fromRanking++;
  }
  // 이 기기에 있던 순은 원래 순서대로, 되살린 순은 저장 시각 순서로 뒤에 붙인다
  const restored = [...addedEnds.values()].filter((e) => !local.ends.some((x) => x.id === e.id)).sort((a, b) => a.recordedAt - b.recordedAt);
  const merged = [...local.ends.map((e) => ends.get(e.id)!), ...restored];
  return { ends: merged, days: [...days.values()], addedEnds: [...addedEnds.values()], addedDays: [...addedDays.values()], fromRanking };
}

/** 복구를 마친 뒤 알림 글 */
export function restoreMessage(r: { gear: number; ends: number; fromRanking: number; days: number; nickname?: string }): string {
  const got = [
    r.ends ? `순 기록 ${r.ends}순` : '',
    r.days ? `하루 메모 ${r.days}일` : '',
    r.gear ? `장비 ${r.gear}개` : '',
  ].filter(Boolean);
  // 어느 닉네임으로 이어 쓰게 됐는지 보여 준다. 로그인이 다른 닉네임에 연결돼 있으면 여기서 알아챌 수 있다
  const who = r.nickname ? `'${r.nickname}' 닉네임` : '예전 닉네임';
  const head = got.length ? `${who}과 기록을 되살렸습니다 (${got.join(', ')})` : `${who}과 랭킹 기록을 이어 씁니다`;
  return r.fromRanking ? `${head}. 그중 ${r.fromRanking}순은 랭킹 기록에서 되살려 관중 여부만 있습니다` : head;
}
