import type { TournamentFile, VideoFile } from '../domain/tournaments';

const CACHE = 'gukgungrok-tournaments';
const VCACHE = 'gukgungrok-videos';

/** 중계 영상 목록. 못 읽으면 저장해 둔 것, 그것도 없으면 빈 목록 (대회 일정은 그대로 보인다) */
export async function loadVideos(): Promise<VideoFile> {
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

function readCache(): TournamentFile | null {
  try { return JSON.parse(localStorage.getItem(CACHE) ?? 'null'); } catch { return null; }
}

/** 배포 때 받아 둔 tournaments.json을 읽는다. 못 읽으면 이 기기에 마지막으로 받아 둔 목록을 쓴다. */
export async function loadTournaments(): Promise<{ file: TournamentFile; cached: boolean }> {
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
