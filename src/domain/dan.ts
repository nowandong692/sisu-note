/** 궁도 단: 단을 주는 기관과 1단(초단)~9단(신궁) */

export const DAN_ORGS = ['대한궁도협회', '궁도스포츠클럽'] as const;
export type DanOrg = (typeof DAN_ORGS)[number];
/** 기관마다 받은 단 (없으면 빠진다) */
export type Dans = Partial<Record<DanOrg, number>>;

export const DAN_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 1단은 초단, 9단은 신궁이라고도 부른다. 2~8단은 따로 부르는 이름이 없다 */
export function danAlias(level: number): string | null {
  return level === 1 ? '초단' : level === 9 ? '신궁' : null;
}

/** "1단 (초단)", "3단", "9단 (신궁)" */
export function danLabel(level: number): string {
  const a = danAlias(level);
  return a ? `${level}단 (${a})` : `${level}단`;
}

/** 저장해 둔 값이 1~9 사이 정수일 때만 단으로 본다 */
export function validDan(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 9 ? v : null;
}
