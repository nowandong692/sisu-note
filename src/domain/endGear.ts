/** 한 순에 쓴 장비 (활·깍지·화살·현) */
import type { End, Settings, TrackedCategory } from './types';

export type EndGear = Pick<End, 'bowId' | 'ringId' | 'arrowId'> & { stringId: string | null };

export const GEAR_KEY: Record<TrackedCategory, keyof EndGear> = { bow: 'bowId', ring: 'ringId', arrow: 'arrowId', string: 'stringId' };

export const gearOfEnd = (e: Pick<End, 'bowId' | 'ringId' | 'arrowId' | 'stringId'>): EndGear =>
  ({ bowId: e.bowId, ringId: e.ringId, arrowId: e.arrowId, stringId: e.stringId ?? null });

export const gearOfSettings = (c: Settings['current']): EndGear =>
  ({ bowId: c.bow, ringId: c.ring, arrowId: c.arrow, stringId: c.string ?? null });

export const sameGear = (e: Pick<End, 'bowId' | 'ringId' | 'arrowId' | 'stringId'>, g: EndGear) =>
  e.bowId === g.bowId && e.ringId === g.ringId && e.arrowId === g.arrowId && (e.stringId ?? null) === g.stringId;

/** 그날 마지막 순의 장비 (기록이 없으면 null) */
export function lastGearOf(ends: End[], date: string): EndGear | null {
  const day = ends.filter((e) => e.date === date);
  if (!day.length) return null;
  return gearOfEnd(day.reduce((a, e) => (e.recordedAt > a.recordedAt ? e : a)));
}
