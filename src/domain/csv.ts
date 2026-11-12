import type { End, Gear } from './types';
import { hitsOf } from './stats';

function cell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 순 하나가 한 줄. 엑셀에서 바로 열 수 있다. */
export function endsToCsv(ends: End[], gear: Gear[]): string {
  const name = (id: string | null) => gear.find((g) => g.id === id)?.nickname ?? '';
  const head = ['날짜', '활', '깍지', '화살', '중', '1시', '2시', '3시', '4시', '5시', '태그', '메모'];
  const shot = (e: End, i: number) => {
    const s = e.shots[i];
    if (!s) return '';
    if (s.hit) return s.zone ? `관중(${s.zone})` : '관중';
    return s.direction ? `${s.direction}${s.level === 2 ? '(많이)' : '(조금)'}` : '불';
  };
  const rows = [...ends]
    .sort((a, b) => (a.date === b.date ? a.recordedAt - b.recordedAt : a.date < b.date ? -1 : 1))
    .map((e) => [e.date, name(e.bowId), name(e.ringId), name(e.arrowId), hitsOf(e), shot(e, 0), shot(e, 1), shot(e, 2), shot(e, 3), shot(e, 4), e.tags.join(' '), e.memo]);
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}
