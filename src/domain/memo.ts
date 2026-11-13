import type { End } from './types';
import { weatherLabel } from './weather';

export interface MemoHit {
  end: End;
  /** 그날 몇 번째 순인지 (1부터) */
  index: number;
}

/** 메모나 태그가 있는 순만 골라 최근 것부터. 검색어는 띄어쓰기로 나눠 모두 들어 있어야 맞는다 (메모, 태그, 장비 별명, 날씨, 활터에서 찾는다). */
export function searchMemos(ends: End[], query: string, tag: string | null, gearName: (id: string | null) => string, rangeName: (id: string | null | undefined) => string = () => ''): MemoHit[] {
  const byDate = new Map<string, End[]>();
  for (const e of ends) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const indexOf = new Map<string, number>();
  for (const list of byDate.values()) [...list].sort((a, b) => a.recordedAt - b.recordedAt).forEach((e, i) => indexOf.set(e.id, i + 1));

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return ends
    .filter((e) => e.memo.trim() || e.tags.length)
    .filter((e) => !tag || e.tags.includes(tag))
    .filter((e) => {
      if (!terms.length) return true;
      const hay = [e.memo, ...e.tags, gearName(e.bowId), gearName(e.ringId), gearName(e.arrowId), e.stringId ? gearName(e.stringId) : '', weatherLabel(e.weather), e.rangeId ? rangeName(e.rangeId) : ''].join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t.replace(/^#/, '')));
    })
    .sort((a, b) => (a.date === b.date ? b.recordedAt - a.recordedAt : a.date < b.date ? 1 : -1))
    .map((end) => ({ end, index: indexOf.get(end.id)! }));
}

/** 검색어가 들어간 곳을 표시하기 위해 글을 조각낸다. 홀수 번째 조각이 맞은 부분. */
export function splitByTerms(text: string, query: string): string[] {
  const terms = query.trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return [text];
  return text.split(new RegExp(`(${terms.join('|')})`, 'gi'));
}
