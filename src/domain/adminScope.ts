import { weekStart } from './stats';

/** 관리자가 궁사 기록을 지우는 범위 */
export type DeleteScope = 'end' | 'day' | 'week' | 'month' | 'all';

const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
const plus6 = (d: string) => {
  const t = new Date(`${d}T12:00:00`);
  t.setDate(t.getDate() + 6);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

/** 지울 범위를 사람이 읽는 말로. 주는 월요일~일요일, 달은 1일~말일 (서버 admin_delete_ends와 같다) */
export function scopeLabel(scope: DeleteScope, date?: string, endNo?: number): string {
  if (scope === 'all') return '모든 기록';
  if (!date) return '';
  if (scope === 'end') return `${md(date)} ${endNo ?? ''}순`.trim();
  if (scope === 'day') return `${md(date)} 하루`;
  if (scope === 'week') { const s = weekStart(date); return `${md(s)} ~ ${md(plus6(s))} 한 주`; }
  return `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월 한 달`;
}
