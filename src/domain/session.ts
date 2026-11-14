/** 습사 시간: 그날 처음 저장한 순과 마지막으로 저장한 순 사이의 시간 */

export interface DaySpan { first: number; last: number; minutes: number }

/** 시각(ms) 목록에서 처음과 마지막. 순이 하나뿐이면 minutes는 0이다. */
export function spanOf(times: number[]): DaySpan | null {
  if (!times.length) return null;
  const first = Math.min(...times), last = Math.max(...times);
  return { first, last, minutes: Math.round((last - first) / 60000) };
}

type Timed = { recordedAt: number; rangeId?: string | null };

/**
 * 하루 기록을 활터가 바뀔 때마다 끊어 구간으로 나눈다. 두 활터를 오간 날은 이동하고 쉰 시간을
 * 습사 시간에 넣지 않기 위해서다. 활터 정보가 없으면 하루 전체가 한 구간이다.
 */
export function daySegments<T extends Timed>(items: T[]): { rangeId: string | null; ends: T[]; span: DaySpan }[] {
  const sorted = [...items].sort((a, b) => a.recordedAt - b.recordedAt);
  const out: { rangeId: string | null; ends: T[] }[] = [];
  for (const e of sorted) {
    const r = e.rangeId ?? null;
    const last = out[out.length - 1];
    if (last && last.rangeId === r) last.ends.push(e);
    else out.push({ rangeId: r, ends: [e] });
  }
  return out.map((g) => ({ ...g, span: spanOf(g.ends.map((e) => e.recordedAt))! }));
}

/** 하루 습사 시간 (활터별 구간의 합) */
export function dayMinutes(items: Timed[]): number {
  return daySegments(items).reduce((a, g) => a + g.span.minutes, 0);
}

/** 날짜별로 묶어 하루마다의 습사 시간을 더한다. timedDays는 두 순 이상 쏘아 시간이 잡힌 날 수. */
export function totalMinutes(items: (Timed & { date: string })[]): { days: number; timedDays: number; minutes: number } {
  const byDay = new Map<string, Timed[]>();
  for (const e of items) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  let minutes = 0, timedDays = 0;
  for (const list of byDay.values()) {
    const m = dayMinutes(list);
    minutes += m;
    if (m > 0) timedDays++;
  }
  return { days: byDay.size, timedDays, minutes };
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

const pad = (n: number) => (n < 10 ? '0' : '') + n;
export function formatClock(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "09:10 ~ 10:35 · 1시간 25분". 순이 하나면 "09:10 한 순", 1분 안에 모두 저장했으면 "09:10 · 1분 안". */
export function spanLabel(s: DaySpan): string {
  if (s.first === s.last) return `${formatClock(s.first)} 한 순`;
  if (s.minutes < 1) return `${formatClock(s.first)} · 1분 안`;
  return `${formatClock(s.first)} ~ ${formatClock(s.last)} · ${formatDuration(s.minutes)}`;
}
