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

/** 랭킹과 인사에 붙이는 짧은 이름: 초단, 2단 … 8단, 신궁 */
export function danShort(level: number): string {
  return danAlias(level) ?? `${level}단`;
}

/** 여러 기관 단 가운데 가장 높은 단 (없으면 null) */
export function topDan(dans: Dans | null | undefined): number | null {
  const ls = Object.values(dans ?? {}).map(validDan).filter((v): v is number => v !== null);
  return ls.length ? Math.max(...ls) : null;
}

/** 단을 무궁화 수로: 1~4단은 위에 1~4송이, 5~8단은 위 4송이에 아래 1~4송이, 9단(신궁)은 홍심도 무궁화 */
export function danFlowers(dan: number | null | undefined): { top: number; bottom: number; center: boolean } {
  const d = dan && Number.isInteger(dan) && dan >= 1 && dan <= 9 ? dan : 0;
  return { top: Math.min(d, 4), bottom: Math.max(0, Math.min(d - 4, 4)), center: d === 9 };
}
