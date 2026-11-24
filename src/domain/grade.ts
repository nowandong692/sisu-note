/**
 * 실력 등급: 최근 30순의 15시(3순) 기준 평균으로 나무·무쇠·청동·백은·황금 과녁 다섯 단계.
 *
 * - 직접 쏜 순이 30순 이상이어야 등급을 매긴다. 예시 기록은 넣지 않는다.
 * - 올라가는 것은 바로. 내려가는 것은 한 달(30일) 유예: 지난 30일 안의 어느 습사일에 이룬 등급 가운데 가장 높은 것을 보여 준다.
 *   30일 동안 습사를 쉬었으면 마지막으로 쏜 날의 등급을 그대로 둔다 (쉬었다고 내려가지 않는다).
 * - 단(대한궁도협회·궁도스포츠클럽)과 다른 앱 안의 등급이다. 그래서 단·급·명궁·신궁이라는 이름은 쓰지 않는다.
 * - 기록에서 매번 다시 계산한다. 지난 순을 고치거나 지우면 등급도 다시 계산된다.
 */
import type { End } from './types';
import { sampleEndIds } from './sample';
import { hitsOf } from './stats';
import { ymd } from './util';

/** 등급을 매기는 최근 순 수 */
export const GRADE_WINDOW = 30;
/** 내려가기 전에 기다리는 날 수 */
export const GRADE_HOLD_DAYS = 30;

export type GradeId = 'wood' | 'iron' | 'bronze' | 'silver' | 'gold';
export interface Grade {
  /** 1(나무)~5(황금). 서버에는 이 숫자만 올린다 */
  level: number;
  id: GradeId;
  /** 나무, 무쇠, 청동, 백은, 황금 */
  name: string;
  /** 이 등급이 되는 15시 기준 평균 (이상) */
  min: number;
}

/** 10중은 관중 랭킹 기준이자 대회 입상권(15시 10중)이라 백은의 경계로 둔다 */
export const GRADES: Grade[] = [
  { level: 1, id: 'wood', name: '나무', min: 0 },
  { level: 2, id: 'iron', name: '무쇠', min: 4 },
  { level: 3, id: 'bronze', name: '청동', min: 7 },
  { level: 4, id: 'silver', name: '백은', min: 10 },
  { level: 5, id: 'gold', name: '황금', min: 12 },
];

/** "청동 과녁" */
export const gradeTitle = (g: Grade) => `${g.name} 과녁`;

/** 15시 기준 평균에 맞는 등급 */
export function gradeOf(per15: number): Grade {
  let g = GRADES[0];
  for (const x of GRADES) if (per15 >= x.min - 1e-9) g = x;
  return g;
}

/** 서버에서 받은 숫자를 등급으로 (1~5가 아니면 null) */
export function gradeByLevel(v: unknown): Grade | null {
  return typeof v === 'number' ? GRADES.find((g) => g.level === v) ?? null : null;
}

export interface GradeReport {
  /** 셈에 넣은 순 (예시 기록 뺀 것) */
  counted: number;
  /** 등급을 매기려면 더 쏴야 하는 순 (0이면 매겼다) */
  need: number;
  /** 보여 줄 등급 (내려가는 유예를 넣은 것). 30순 전이면 null */
  grade: Grade | null;
  /** 최근 30순만 본 등급 */
  now: Grade | null;
  /** 최근 30순의 15시 기준 평균 */
  per15: number | null;
  /** grade가 now보다 높으면, grade를 이 날까지 유지한다 (그 전에 다시 이루면 늘어난다) */
  holdUntil: string | null;
  /** 다음 등급과 그 등급의 평균 */
  next: Grade | null;
}

const dayNo = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
const fromDayNo = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);

export function grade(all: End[], todayDate = ymd(new Date())): GradeReport {
  const sample = sampleEndIds(all);
  const ends = all.filter((e) => !sample.has(e.id) && e.date <= todayDate)
    .sort((a, b) => (a.date === b.date ? a.recordedAt - b.recordedAt : a.date < b.date ? -1 : 1));
  const counted = ends.length;
  if (counted < GRADE_WINDOW) return { counted, need: GRADE_WINDOW - counted, grade: null, now: null, per15: null, holdUntil: null, next: null };

  const sum = [0];
  for (const e of ends) sum.push(sum[sum.length - 1] + hitsOf(e));
  /** i번째 순까지 최근 30순의 15시 기준 평균 */
  const per15At = (i: number) => ((sum[i + 1] - sum[i + 1 - GRADE_WINDOW]) / GRADE_WINDOW) * 3;

  const last = counted - 1;
  const per15 = per15At(last);
  const now = gradeOf(per15);
  // 지난 30일 안 습사일마다 그날 마지막 순까지의 등급. 가장 높은 것을 보여 준다
  const from = dayNo(todayDate) - (GRADE_HOLD_DAYS - 1);
  let best = now;
  let bestDay = ends[last].date;
  for (let i = last; i >= GRADE_WINDOW - 1; i--) {
    const d = ends[i].date;
    if (dayNo(d) < from) break;
    if (i < last && ends[i + 1].date === d) continue; // 그날 마지막 순만
    const g = gradeOf(per15At(i));
    if (g.level > best.level) { best = g; bestDay = d; }
  }
  const held = best.level > now.level;
  return {
    counted, need: 0, grade: best, now, per15,
    holdUntil: held ? fromDayNo(dayNo(bestDay) + GRADE_HOLD_DAYS - 1) : null,
    next: GRADES.find((g) => g.level === best.level + 1) ?? null,
  };
}

/** 다음 등급까지: 최근 30순에서 몇 중을 더 맞혀야 하는지 (최근 30순 합계 기준) */
export function hitsToNext(r: GradeReport): number | null {
  if (!r.next || r.per15 == null) return null;
  const have = Math.round((r.per15 / 3) * GRADE_WINDOW);
  const want = Math.ceil((r.next.min / 3) * GRADE_WINDOW - 1e-9);
  return Math.max(0, want - have);
}
