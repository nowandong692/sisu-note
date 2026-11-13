import type { End } from './types';

/** 순의 장비·태그 한 줄: "활 · 깍지 · #태그" */
export function endMeta(end: End, gearName: (id: string | null) => string): string {
  return `${gearName(end.bowId)} · ${gearName(end.ringId)}${end.tags.length ? ' · #' + end.tags.join(' #') : ''}`;
}
