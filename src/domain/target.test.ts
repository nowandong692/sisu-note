import { describe, expect, it } from 'vitest';
import { BAND, TH, TW, TX, TY, classifyTap, directionFor, missOctant, shotLabel } from './target';

const cx = TX + TW / 2;
const cy = TY + TH / 2;

describe('과녁 판정', () => {
  it('과녁 판 안은 관중이고 9등분이면 칸 번호를 남긴다', () => {
    expect(classifyTap(cx, cy, 'right', true)).toMatchObject({ hit: true, zone: 5 });
    expect(classifyTap(TX + 1, TY + 1, 'right', true)).toMatchObject({ hit: true, zone: 1 });
    expect(classifyTap(TX + TW - 1, TY + TH - 1, 'right', true)).toMatchObject({ hit: true, zone: 9 });
  });

  it('9등분을 끄면 관중 위치를 남기지 않는다', () => {
    expect(classifyTap(cx, cy, 'right', false)).toEqual({ hit: true, x: null, y: null, zone: null, side: null, level: null, direction: null });
  });

  it('우궁은 오른쪽이 앞남, 왼쪽이 뒤남', () => {
    expect(classifyTap(TX + TW + 10, cy, 'right', true)).toMatchObject({ hit: false, side: 'right', direction: '앞남', level: 1 });
    expect(classifyTap(TX - 10, cy, 'right', true)).toMatchObject({ hit: false, side: 'left', direction: '뒤남' });
  });

  it('좌궁은 반대', () => {
    expect(classifyTap(TX + TW + 10, cy, 'left', true)).toMatchObject({ direction: '뒤남' });
    expect(classifyTap(TX - 10, cy, 'left', true)).toMatchObject({ direction: '앞남' });
    expect(directionFor('over', 'left')).toBe('넘음');
  });

  it('위·아래와 빠진 정도(조금·많이)', () => {
    expect(classifyTap(cx, TY - 10, 'right', true)).toMatchObject({ side: 'over', direction: '넘음', level: 1 });
    expect(classifyTap(cx, TY + TH + BAND + 10, 'right', true)).toMatchObject({ side: 'short', direction: '짧음', level: 2 });
  });

  it('모서리는 더 많이 벗어난 쪽으로 판정한다', () => {
    expect(classifyTap(TX + TW + 30, TY - 5, 'right', true)).toMatchObject({ side: 'right' });
    expect(classifyTap(TX + TW + 5, TY - 30, 'right', true)).toMatchObject({ side: 'over' });
  });

  it('표시 이름', () => {
    expect(shotLabel(classifyTap(cx, cy, 'right', true), true)).toBe('관중 5');
    expect(shotLabel(classifyTap(cx, cy, 'right', true), false)).toBe('관중');
    expect(shotLabel(classifyTap(TX - BAND - 10, cy, 'right', true), true)).toBe('뒤남 많이');
  });

  it('불은 과녁 중심 기준 8방향으로 나눈다 (0 = 위, 시계 방향)', () => {
    const at = (x: number, y: number) => missOctant(classifyTap(x, y, 'right', true));
    expect(at(cx, TY - 10)).toBe(0);
    expect(at(TX + TW + 30, TY - 30)).toBe(1);
    expect(at(TX + TW + 10, cy)).toBe(2);
    expect(at(TX + TW + 30, TY + TH + 30)).toBe(3);
    expect(at(cx, TY + TH + 10)).toBe(4);
    expect(at(TX - 30, TY + TH + 30)).toBe(5);
    expect(at(TX - 10, cy)).toBe(6);
    expect(at(TX - 30, TY - 30)).toBe(7);
    expect(missOctant(classifyTap(cx, cy, 'right', true))).toBeNull();
  });
});
