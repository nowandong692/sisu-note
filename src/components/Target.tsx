import type { MouseEvent } from 'react';
import type { Hand } from '../domain/types';
import { BAND, BOARD, TH, TW, TX, TY, VIEW_H, VIEW_W, VIEW_X, VIEW_Y, directionFor } from '../domain/target';

export interface Mark {
  x: number | null;
  y: number | null;
  hit: boolean;
  n?: number;
  /** 선택되지 않은 화살: 흐리게 */
  dim?: boolean;
  /** 선택된 화살: 번호가 든 큰 원으로 */
  big?: boolean;
}

interface Props {
  hand: Hand;
  grid: boolean;
  marks?: Mark[];
  /** 통계용 작은 점 */
  small?: boolean;
  /** 칸별 관중 수 (9등분 통계) */
  zoneCounts?: number[] | null;
  onTap?: (x: number, y: number) => void;
  label?: string;
  /** small 모드 점 크기 */
  dotRadius?: number;
}

const sx = TW / BOARD.w;
const sy = TH / BOARD.h;

/** 국궁 과녁 그림. 과녁 판 = 관중, 바깥 두 겹 띠 = 불 (안쪽 조금, 바깥 많이). */
export function Target({ hand, grid, marks = [], small, zoneCounts, onTap, label, dotRadius = 3.2 }: Props) {
  const left = directionFor('left', hand);
  const right = directionFor('right', hand);

  const handle = (ev: MouseEvent<SVGSVGElement>) => {
    if (!onTap) return;
    const rc = ev.currentTarget.getBoundingClientRect();
    onTap(VIEW_X + ((ev.clientX - rc.left) / rc.width) * VIEW_W, VIEW_Y + ((ev.clientY - rc.top) / rc.height) * VIEW_H);
  };

  const textStyle = { fill: 'var(--muted)', stroke: 'var(--band2)' };
  const labels = (
    <g fontSize={12} fontWeight={600} textAnchor="middle" strokeWidth={4} paintOrder="stroke" style={textStyle}>
      <text x={150} y={TY - 2 * BAND + 20}>넘음</text>
      <text x={150} y={TY + TH + 2 * BAND - 10}>짧음</text>
      {[[TX - 1.5 * BAND, left], [TX + TW + 1.5 * BAND, right]].map(([x, t]) => (
        <text key={String(x)} x={x as number} y={174}>
          <tspan x={x as number}>{(t as string).charAt(0)}</tspan>
          <tspan x={x as number} dy={16}>{(t as string).charAt(1)}</tspan>
        </text>
      ))}
    </g>
  );
  const total = zoneCounts?.reduce((a, b) => a + b, 0) || 1;

  return (
    <svg
      viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_H}`}
      role={onTap ? 'button' : 'img'}
      aria-label={label ?? (onTap ? '과녁을 눌러 입력' : '탄착 분포')}
      onClick={onTap ? handle : undefined}
      data-interactive={onTap ? 'true' : undefined}
    >
      <rect x={TX - 2 * BAND} y={TY - 2 * BAND} width={TW + 4 * BAND} height={TH + 4 * BAND} rx={16} style={{ fill: 'var(--band2)' }} />
      <rect x={TX - BAND} y={TY - BAND} width={TW + 2 * BAND} height={TH + 2 * BAND} rx={10} style={{ fill: 'var(--band1)' }} />
      {!small && labels}
      <rect x={TX} y={TY} width={TW} height={TH} fill="#EEEEEE" style={{ stroke: 'var(--ink)' }} strokeWidth={1.5} />
      <rect x={TX + BOARD.topBar.x * sx} y={TY + BOARD.topBar.y * sy} width={BOARD.topBar.w * sx} height={BOARD.topBar.h * sy} fill="#000000" />
      <rect x={TX + BOARD.lowerBox.x * sx} y={TY + BOARD.lowerBox.y * sy} width={BOARD.lowerBox.w * sx} height={BOARD.lowerBox.h * sy} fill="#000000" />
      <circle cx={TX + BOARD.circle.cx * sx} cy={TY + BOARD.circle.cy * sy} r={BOARD.circle.r * sx} fill="#FF0A14" />
      {grid && [1, 2].map((k) => (
        <g key={k} stroke="#8A8A8A" strokeDasharray="4 4">
          <line x1={TX + (TW * k) / 3} x2={TX + (TW * k) / 3} y1={TY} y2={TY + TH} />
          <line x1={TX} x2={TX + TW} y1={TY + (TH * k) / 3} y2={TY + (TH * k) / 3} />
        </g>
      ))}
      {[...marks].sort((a, b) => Number(!!b.dim) - Number(!!a.dim) || Number(!!a.big) - Number(!!b.big)).map((m, i) => {
        if (m.x == null || m.y == null) return null;
        if (small && m.dim) {
          return <circle key={i} cx={m.x} cy={m.y} r={dotRadius * 0.8} fill={m.hit ? '#1E66D0' : 'var(--muted)'} fillOpacity={0.18} />;
        }
        if (small && !m.big) {
          return <circle key={i} cx={m.x} cy={m.y} r={dotRadius} fill={m.hit ? '#1E66D0' : 'var(--muted)'} fillOpacity={m.hit ? 0.85 : 0.6} stroke={m.hit ? '#FFFFFF' : 'none'} strokeWidth={0.8} />;
        }
        return (
          <g key={i}>
            <circle cx={m.x} cy={m.y} r={10} style={{ fill: m.hit ? '#FFFFFF' : 'var(--ink)', stroke: m.hit ? 'var(--hong)' : 'var(--paper)' }} strokeWidth={2} />
            <text x={m.x} y={m.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} style={{ fill: m.hit ? '#C4302A' : 'var(--paper)' }}>{m.n}</text>
          </g>
        );
      })}
      {zoneCounts && zoneCounts.map((c, i) => (
        <text key={i} x={TX + TW / 6 + (i % 3) * (TW / 3)} y={TY + TH / 6 + Math.floor(i / 3) * (TH / 3) + 5}
          textAnchor="middle" fontSize={14} fontWeight={700} fill="#FFFFFF" stroke="#000000" strokeOpacity={0.35} strokeWidth={3} paintOrder="stroke">
          {Math.round((c / total) * 100)}%
        </text>
      ))}
      {small && labels}
    </svg>
  );
}
