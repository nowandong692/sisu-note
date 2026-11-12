import type { Hand, MissDirection, MissSide, Shot } from './types';
import { LEVEL_LABEL } from './types';

/**
 * 과녁 그림 좌표계: 300 x 360.
 * 가운데 과녁 판(120 x 160) 바깥으로 35씩 두 겹의 띠가 있다.
 * 안쪽 띠 = 조금 빠짐, 바깥 띠 = 많이 빠짐.
 */
export const VIEW_W = 300;
export const VIEW_H = 360;
export const TX = 90;
export const TY = 100;
export const TW = 120;
export const TH = 160;
export const BAND = 35;

/** 과녁 판 그림 비율 (실제 과녁 사진 기준 280 x 363) */
export const BOARD = {
  w: 280,
  h: 363,
  topBar: { x: 40, y: 38, w: 197, h: 44 },
  lowerBox: { x: 42, y: 127, w: 198, h: 198 },
  circle: { cx: 141, cy: 230, r: 73 },
};

export function directionFor(side: MissSide, hand: Hand): MissDirection {
  if (side === 'over') return '넘음';
  if (side === 'short') return '짧음';
  return side === hand ? '앞남' : '뒤남';
}

/** 과녁 그림에서 누른 위치를 관중 또는 불로 판정한다. */
export function classifyTap(x: number, y: number, hand: Hand, recordHitPosition: boolean): Shot {
  if (x >= TX && x <= TX + TW && y >= TY && y <= TY + TH) {
    if (!recordHitPosition) {
      return { hit: true, x: null, y: null, zone: null, side: null, level: null, direction: null };
    }
    const col = Math.min(2, Math.floor((x - TX) / (TW / 3)));
    const row = Math.min(2, Math.floor((y - TY) / (TH / 3)));
    return { hit: true, x, y, zone: row * 3 + col + 1, side: null, level: null, direction: null };
  }
  const dx = x < TX ? TX - x : x > TX + TW ? x - TX - TW : 0;
  const dy = y < TY ? TY - y : y > TY + TH ? y - TY - TH : 0;
  const side: MissSide = dx >= dy ? (x < TX ? 'left' : 'right') : y < TY ? 'over' : 'short';
  const level = Math.max(dx, dy) > BAND ? 2 : 1;
  const cx = Math.max(TX - 2 * BAND + 4, Math.min(TX + TW + 2 * BAND - 4, x));
  const cy = Math.max(TY - 2 * BAND + 4, Math.min(TY + TH + 2 * BAND - 4, y));
  return { hit: false, x: cx, y: cy, zone: null, side, level, direction: directionFor(side, hand) };
}

export function hitShot(): Shot {
  return { hit: true, x: null, y: null, zone: null, side: null, level: null, direction: null };
}

export function shotLabel(s: Shot | null, showZone: boolean): string {
  if (!s) return '';
  if (s.hit) return s.zone && showZone ? `관중 ${s.zone}` : '관중';
  return s.direction && s.level ? `${s.direction} ${LEVEL_LABEL[s.level]}` : '불';
}
