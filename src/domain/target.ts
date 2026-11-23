import type { Hand, MissDir8, MissDirection, MissSide, Shot } from './types';
import { LEVEL_LABEL } from './types';

/**
 * 과녁 그림 좌표계.
 * 가운데 과녁 판(120 x 160) 바깥으로 35씩 두 겹의 띠가 있다.
 * 안쪽 띠 = 조금 빠짐, 바깥 띠 = 많이 빠짐.
 */
export const TX = 90;
export const TY = 100;
export const TW = 120;
export const TH = 160;
export const BAND = 35;

/** 화면에 그리는 범위: 바깥 띠까지만 (위아래 빈 여백 없이) */
export const VIEW_X = TX - 2 * BAND - 2;
export const VIEW_Y = TY - 2 * BAND - 2;
export const VIEW_W = TW + 4 * BAND + 4;
export const VIEW_H = TH + 4 * BAND + 4;

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

/** 관중이면 "관중"(칸 번호), 불이면 8방향과 조금·많이 (예: "앞넘음 조금") */
export function shotLabel(s: Shot | null, showZone: boolean, hand?: Hand): string {
  if (!s) return '';
  if (s.hit) return s.zone && showZone ? `관중 ${s.zone}` : '관중';
  const d = missDir8(s, hand);
  return d && s.level ? `${d} ${LEVEL_LABEL[s.level]}` : '불';
}

/** 과녁 중심에서 빠진 위치까지의 방향을 8방향(0 = 위, 시계 방향 45도씩)으로 나눈다. */
export function missOctant(s: Shot): number | null {
  if (s.hit) return null;
  if (s.x != null && s.y != null) {
    // 과녁이 세로로 길어서 가로·세로를 과녁 크기로 나눠 비율을 맞춘다
    const dx = (s.x - (TX + TW / 2)) / (TW / 2);
    const dy = (s.y - (TY + TH / 2)) / (TH / 2);
    if (dx === 0 && dy === 0) return null;
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 위 = 0, 오른쪽 = 90
    return ((Math.round(deg / 45) % 8) + 8) % 8;
  }
  return s.side === 'over' ? 0 : s.side === 'right' ? 2 : s.side === 'short' ? 4 : s.side === 'left' ? 6 : null;
}

/** 화면 8방향(0 = 위, 시계 방향) 가운데 오른쪽 절반(1~3)이 앞인지 뒤인지에 따라 붙이는 이름 */
const OCTANT_RIGHT_FRONT: MissDir8[] = ['넘음', '앞넘음', '앞남', '앞짧음', '짧음', '뒤짧음', '뒤남', '뒤넘음'];
const OCTANT_LEFT_FRONT: MissDir8[] = ['넘음', '뒤넘음', '뒤남', '뒤짧음', '짧음', '앞짧음', '앞남', '앞넘음'];

/**
 * 불을 사수 기준 8방향(앞·뒤·넘·짧과 그 사이 대각선)으로 나눈다.
 * 누른 위치가 있으면 위치로, 없으면 저장된 네 방향 그대로.
 * 앞이 어느 쪽인지는 저장할 때 판정한 앞남·뒤남에서 읽고, 넘음·짧음으로 저장된 불이면 hand(우궁·좌궁)를 쓴다.
 */
export function missDir8(s: Shot, hand?: Hand): MissDir8 | null {
  if (s.hit) return null;
  const o = missOctant(s);
  if (o == null || o % 4 === 0) return o === 0 ? '넘음' : o === 4 ? '짧음' : s.direction;
  let rightFront: boolean | null = null;
  if ((s.side === 'left' || s.side === 'right') && (s.direction === '앞남' || s.direction === '뒤남')) {
    rightFront = (s.side === 'right') === (s.direction === '앞남');
  } else if (hand) {
    rightFront = hand === 'right';
  }
  if (rightFront == null) return s.direction; // 앞이 어느 쪽인지 모르면 저장된 네 방향
  return (rightFront ? OCTANT_RIGHT_FRONT : OCTANT_LEFT_FRONT)[o];
}
