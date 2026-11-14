/** 습사 시간: 그날 처음 저장한 순과 마지막으로 저장한 순 사이의 시간 */

export interface DaySpan { first: number; last: number; minutes: number }

/** 시각(ms) 목록에서 처음과 마지막. 순이 하나뿐이면 minutes는 0이다. */
export function spanOf(times: number[]): DaySpan | null {
  if (!times.length) return null;
  const first = Math.min(...times), last = Math.max(...times);
  return { first, last, minutes: Math.round((last - first) / 60000) };
}

/** 날짜별로 묶어 하루마다의 습사 시간을 더한다. timedDays는 두 순 이상 쏘아 시간이 잡힌 날 수. */
export function totalMinutes(items: { date: string; recordedAt: number }[]): { days: number; timedDays: number; minutes: number } {
  const byDay = new Map<string, number[]>();
  for (const e of items) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e.recordedAt]);
  let minutes = 0, timedDays = 0;
  for (const t of byDay.values()) {
    const m = spanOf(t)!.minutes;
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
