import type { End, Gear, Range, Settings } from './types';
import { SAMPLE_PREFIX } from './sample';

/**
 * 장비·설정 백업 (서버의 backups 표, 012_backup.sql).
 * 휴대폰 브라우저가 저장소를 비워도 복구 코드로 장비와 설정을 되찾게 한다.
 * 이 기기에만 의미가 있는 것(랭킹 열쇠와 올리기 대기열, 오늘 날씨, 댓글 읽음 표시)과 예시 데이터는 올리지 않는다.
 */
export const BACKUP_SETTING_KEYS = [
  'club', 'dans', 'title', 'rankHistory', 'memoTags', 'lastShare', 'appearance', 'hand', 'grid',
  'current', 'ranges', 'currentRange', 'currentRangeManual',
] as const satisfies readonly (keyof Settings)[];

type BackupSettings = Partial<Pick<Settings, (typeof BACKUP_SETTING_KEYS)[number]>>;

export interface Backup {
  v: 1;
  gear: Gear[];
  settings: BackupSettings;
}

const isSample = (id: string | null | undefined) => !!id && id.startsWith(SAMPLE_PREFIX);

export function makeBackup(gear: Gear[], settings: Settings): Backup {
  const s: BackupSettings = {};
  for (const k of BACKUP_SETTING_KEYS) {
    if (settings[k] !== undefined) (s as Record<string, unknown>)[k] = settings[k];
  }
  if (s.ranges) s.ranges = s.ranges.filter((r) => !isSample(r.id));
  if (isSample(s.currentRange)) { s.currentRange = null; s.currentRangeManual = false; }
  if (s.current) {
    const c = s.current;
    const keep = (id: string | null | undefined) => (isSample(id) ? null : id ?? null);
    s.current = { bow: keep(c.bow), ring: keep(c.ring), arrow: keep(c.arrow), string: keep(c.string) };
  }
  return { v: 1, gear: gear.filter((g) => !isSample(g.id)), settings: s };
}

/** 서버에서 받은 값이 백업 꼴인지 (모르는 꼴이면 무시한다) */
export function asBackup(x: unknown): Backup | null {
  if (!x || typeof x !== 'object') return null;
  const b = x as Partial<Backup>;
  if (b.v !== 1 || !Array.isArray(b.gear) || !b.settings || typeof b.settings !== 'object') return null;
  const gear = b.gear.filter((g): g is Gear => !!g && typeof g === 'object' && typeof g.id === 'string' && typeof g.nickname === 'string' && typeof g.category === 'string');
  return { v: 1, gear, settings: b.settings };
}

/**
 * 백업을 이 기기 데이터에 합친다.
 * - 장비: id로 합치고, 둘 다 있으면 더 나중에 고친 쪽을 쓴다. 이 기기 장비는 지우지 않는다.
 * - 설정: 이 기기가 비어 있으면(직접 등록한 장비도 순도 없으면) 백업 설정을 그대로 쓴다.
 *   이미 쓰던 기기면 비어 있는 항목만 채운다 (활터는 합친다, 고른 장비는 비어 있는 칸만).
 */
export function mergeBackup(local: { gear: Gear[]; ends: End[]; settings: Settings }, b: Backup): { gear: Gear[]; added: Gear[]; patch: Partial<Settings> } {
  const byId = new Map(local.gear.map((g) => [g.id, g]));
  const added: Gear[] = [];
  for (const g of b.gear) {
    const mine = byId.get(g.id);
    if (!mine || (g.updatedAt ?? 0) > (mine.updatedAt ?? 0)) { byId.set(g.id, g); added.push(g); }
  }
  const gear = [...byId.values()];
  const live = (id: string | null | undefined) => (id && gear.some((g) => g.id === id && !g.archived) ? id : null);

  const fresh = !local.gear.some((g) => !isSample(g.id)) && !local.ends.some((e) => !isSample(e.id));
  const s = b.settings;
  const cur = local.settings;
  const patch: Partial<Settings> = {};

  if (fresh) {
    for (const k of BACKUP_SETTING_KEYS) if (s[k] !== undefined) (patch as Record<string, unknown>)[k] = s[k];
    const keepSample = (cur.ranges ?? []).filter((r) => isSample(r.id));
    patch.ranges = [...keepSample, ...(s.ranges ?? [])];
  } else {
    if (!cur.club && s.club) patch.club = s.club;
    if (!cur.dans && s.dans) patch.dans = s.dans;
    if (!cur.title && s.title) patch.title = s.title;
    if (!cur.memoTags && s.memoTags) patch.memoTags = s.memoTags;
    if (!cur.appearance && s.appearance) patch.appearance = s.appearance;
    if (s.rankHistory) patch.rankHistory = { ...s.rankHistory, ...(cur.rankHistory ?? {}) };
    const have = new Set((cur.ranges ?? []).map((r) => r.id));
    const more: Range[] = (s.ranges ?? []).filter((r) => !have.has(r.id));
    if (more.length) patch.ranges = [...(cur.ranges ?? []), ...more];
  }

  const base = fresh ? { bow: null, ring: null, arrow: null, string: null } : cur.current;
  const want = s.current ?? { bow: null, ring: null, arrow: null };
  const pick = (k: 'bow' | 'ring' | 'arrow' | 'string') => live(base[k]) ?? live(want[k]) ?? null;
  const current = { bow: pick('bow'), ring: pick('ring'), arrow: pick('arrow'), string: pick('string') };
  if (fresh || JSON.stringify(current) !== JSON.stringify({ bow: cur.current.bow, ring: cur.current.ring, arrow: cur.current.arrow, string: cur.current.string ?? null })) {
    patch.current = current;
  }
  const ranges = patch.ranges ?? cur.ranges ?? [];
  if (patch.currentRange && !ranges.some((r) => r.id === patch.currentRange)) { patch.currentRange = null; patch.currentRangeManual = false; }

  return { gear, added, patch };
}
