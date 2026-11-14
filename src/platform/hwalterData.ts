import type { HwalterFile } from '../domain/hwalter';

const CACHE = 'gukgungrok-hwalter';

/** 배포 때 받아 둔 hwalter.json. 못 읽으면 이 기기에 마지막으로 받아 둔 목록 */
export async function loadHwalter(): Promise<HwalterFile> {
  const embedded = (window as unknown as { __HWALTER__?: HwalterFile }).__HWALTER__;
  if (embedded) return embedded;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}hwalter.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const file = (await res.json()) as HwalterFile;
    if (!file.items?.length) throw new Error('empty');
    try { localStorage.setItem(CACHE, JSON.stringify(file)); } catch { /* 저장 못 해도 보여 준다 */ }
    return file;
  } catch (e) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) ?? 'null') as HwalterFile | null;
      if (c) return c;
    } catch { /* 아래로 */ }
    throw e;
  }
}
