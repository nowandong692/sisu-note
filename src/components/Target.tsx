import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
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
  /** 원 안에 쓸 글자 (없으면 n) */
  text?: string;
  /** 테두리 색 (예: 순마다 다른 색) */
  ring?: string;
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
  /** 번호가 있는 표시를 끌어서 놓으면 (n = 몇 번째 시, 1부터) */
  onMove?: (n: number, x: number, y: number) => void;
  /** 표시를 과녁 그림 바깥으로 끌어내 놓으면 (그 시를 지우려 할 때) */
  onRemove?: (n: number) => void;
  /** 끄는 동안 표시 위에 보여 줄 판정 (예: "3시 · 앞남 조금") */
  dragLabel?: (n: number, x: number, y: number) => string;
  /** 바깥으로 끌어냈을 때 보여 줄 말 (기본: "놓으면 n시 지우기") */
  removeLabel?: (n: number) => string;
  /** 번호가 있는 표시를 끌지 않고 누르기만 하면 (없으면 그 자리를 누른 것으로 친다) */
  onPick?: (n: number) => void;
  /** 번호 표시 원의 반지름 (과녁 좌표) */
  markRadius?: number;
}

/** 이만큼(화면 px) 움직여야 끄는 것으로 본다. 덜 움직이면 그 자리를 누른 것 */
const DRAG_START = 6;
/** 손가락으로 끌 때 표시를 손가락 위로 띄우는 거리 (화면 px). 손가락에 가려 안 보이지 않게 */
const TOUCH_LIFT = 34;
/** 그림 테두리 밖으로 이만큼(과녁 좌표) 넘어가면 "지우기"로 본다. 테두리에 걸친 것은 바깥 띠(불) */
const OUT_MARGIN = 10;

interface Drag {
  n: number;
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  /** 표시 중심과 처음 누른 곳의 차이 (과녁 좌표) */
  offX: number;
  offY: number;
  moved: boolean;
  x: number;
  y: number;
  /** 그림 바깥으로 끌어냈다 (놓으면 지우기) */
  out: boolean;
}

const sx = TW / BOARD.w;
const sy = TH / BOARD.h;

/** 국궁 과녁 그림. 과녁 판 = 관중, 바깥 두 겹 띠 = 불 (안쪽 조금, 바깥 많이). */
export function Target({ hand, grid, marks = [], small, zoneCounts, onTap, label, dotRadius = 3.2, onMove, onRemove, dragLabel, removeLabel, onPick, markRadius = 10 }: Props) {
  const left = directionFor('left', hand);
  const right = directionFor('right', hand);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  /** 표시를 끌거나 누른 뒤 따라오는 click은 이미 처리했으니 버린다 */
  const skipClick = useRef(false);
  const draggable = !!onMove && !small;

  const toView = (clientX: number, clientY: number) => {
    const rc = svgRef.current!.getBoundingClientRect();
    return {
      x: VIEW_X + ((clientX - rc.left) / rc.width) * VIEW_W,
      y: VIEW_Y + ((clientY - rc.top) / rc.height) * VIEW_H,
      /** 화면 1px이 과녁 좌표로 얼마인지 */
      unit: VIEW_H / rc.height,
    };
  };

  const handle = (ev: MouseEvent<SVGSVGElement>) => {
    if (skipClick.current) { skipClick.current = false; return; }
    if (!onTap) return;
    const p = toView(ev.clientX, ev.clientY);
    onTap(p.x, p.y);
  };

  // 표시를 손가락으로 누르면 화면이 따라 스크롤되지 않게 막는다 (passive가 아니어야 막을 수 있다)
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !draggable) return;
    const stop = (e: TouchEvent) => {
      if (dragRef.current || (e.target as Element | null)?.closest?.('[data-drag]')) e.preventDefault();
    };
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => { el.removeEventListener('touchstart', stop); el.removeEventListener('touchmove', stop); };
  }, [draggable]);

  const update = (d: Drag | null) => { dragRef.current = d; setDrag(d); };

  const grab = (m: Mark) => (ev: PointerEvent<SVGGElement>) => {
    if (!draggable || m.n == null || m.x == null || m.y == null || dragRef.current) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    svgRef.current?.setPointerCapture(ev.pointerId);
    const p = toView(ev.clientX, ev.clientY);
    update({ n: m.n, pointerId: ev.pointerId, touch: ev.pointerType !== 'mouse', startX: ev.clientX, startY: ev.clientY,
      offX: m.x - p.x, offY: m.y - p.y, moved: false, x: m.x, y: m.y, out: false });
  };

  /** 끄는 중인 표시가 놓일 자리 (과녁 그림 안으로) */
  const placeOf = (d: Drag, clientX: number, clientY: number) => {
    const p = toView(clientX, clientY);
    const lift = d.touch ? TOUCH_LIFT * p.unit : 0;
    const rx = p.x + d.offX;
    const ry = p.y + d.offY - lift;
    const out = !!onRemove && (rx < VIEW_X - OUT_MARGIN || rx > VIEW_X + VIEW_W + OUT_MARGIN || ry < VIEW_Y - OUT_MARGIN || ry > VIEW_Y + VIEW_H + OUT_MARGIN);
    return {
      x: Math.max(VIEW_X + 2, Math.min(VIEW_X + VIEW_W - 2, rx)),
      y: Math.max(VIEW_Y + 2, Math.min(VIEW_Y + VIEW_H - 2, ry)),
      out,
    };
  };

  const move = (ev: PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || ev.pointerId !== d.pointerId) return;
    const moved = d.moved || Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) >= DRAG_START;
    if (!moved) return;
    update({ ...d, moved, ...placeOf(d, ev.clientX, ev.clientY) });
  };

  const drop = (ev: PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || ev.pointerId !== d.pointerId) return;
    update(null);
    skipClick.current = true;
    // 손가락이면 click이 오지 않을 수 있어 잠시 뒤 풀어 둔다
    setTimeout(() => { skipClick.current = false; }, 400);
    if (d.moved && d.out) onRemove?.(d.n);
    else if (d.moved) onMove?.(d.n, d.x, d.y);
    else if (onPick) onPick(d.n);
    else if (onTap) {
      // 거의 움직이지 않았으면 원래처럼 그 자리를 누른 것으로 친다
      const p = toView(ev.clientX, ev.clientY);
      onTap(p.x, p.y);
    }
  };

  const cancel = (ev: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current && ev.pointerId === dragRef.current.pointerId) update(null);
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
      ref={svgRef}
      onClick={onTap ? handle : undefined}
      onPointerMove={draggable ? move : undefined}
      onPointerUp={draggable ? drop : undefined}
      onPointerCancel={draggable ? cancel : undefined}
      data-interactive={onTap ? 'true' : undefined}
      data-dragging={drag?.moved ? 'true' : undefined}
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
        const canDrag = draggable && m.n != null;
        const r = m.big ? markRadius + 2 : markRadius;
        const lifted = drag?.moved && drag.n === m.n;
        if (lifted) {
          // 끄는 중: 원래 자리는 점선으로만 남긴다
          return <circle key={i} cx={m.x} cy={m.y} r={r} fill="none" style={{ stroke: 'var(--muted)' }} strokeWidth={1.5} strokeDasharray="3 3" />;
        }
        return (
          <g key={i} opacity={m.dim ? 0.3 : undefined} {...(canDrag ? { 'data-drag': 'true', className: 'mark-drag', onPointerDown: grab(m), 'aria-label': `${m.text ?? `${m.n}시`} 표시 (끌어서 옮기기)` } : {})}>
            {/* 손가락으로 잡기 쉽게 보이지 않는 넓은 자리 */}
            {canDrag && <circle cx={m.x} cy={m.y} r={18} fill="transparent" />}
            <circle cx={m.x} cy={m.y} r={r} style={{ fill: m.hit ? '#FFFFFF' : 'var(--ink)', stroke: m.ring ?? (m.hit ? 'var(--hong)' : 'var(--paper)') }} strokeWidth={m.ring ? 3 : 2} />
            <text x={m.x} y={m.y + r * 0.4} textAnchor="middle" fontSize={r * 1.1} fontWeight={700} style={{ fill: m.hit ? '#C4302A' : 'var(--paper)' }}>{m.text ?? m.n}</text>
          </g>
        );
      })}
      {drag?.moved && (() => {
        const m = marks.find((k) => k.n === drag.n);
        const text = drag.out ? removeLabel?.(drag.n) ?? `놓으면 ${drag.n}시 지우기` : dragLabel?.(drag.n, drag.x, drag.y) ?? `${drag.n}시`;
        const w = text.length * 11 + 16;
        // 위에 자리가 없으면 아래에 띄운다
        const above = drag.y - 40 > VIEW_Y;
        const ly = above ? drag.y - 38 : drag.y + 18;
        const lx = Math.max(VIEW_X + w / 2 + 2, Math.min(VIEW_X + VIEW_W - w / 2 - 2, drag.x));
        return (
          <g pointerEvents="none">
            {drag.out && (
              // 바깥으로 끌어냄: 그림 둘레를 빨갛게
              <rect x={VIEW_X + 1.5} y={VIEW_Y + 1.5} width={VIEW_W - 3} height={VIEW_H - 3} rx={16} fill="none" stroke="#C4302A" strokeWidth={3} strokeDasharray="8 5" />
            )}
            {!drag.out && <>
            <line x1={drag.x - 16} x2={drag.x + 16} y1={drag.y} y2={drag.y} style={{ stroke: 'var(--ink)' }} strokeOpacity={0.5} />
            <line x1={drag.x} x2={drag.x} y1={drag.y - 16} y2={drag.y + 16} style={{ stroke: 'var(--ink)' }} strokeOpacity={0.5} />
            <circle cx={drag.x} cy={drag.y} r={12} fillOpacity={0.9} style={{ fill: m?.hit ? '#FFFFFF' : 'var(--ink)', stroke: 'var(--hong)' }} strokeWidth={2.5} />
            <text x={drag.x} y={drag.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} style={{ fill: m?.hit ? '#C4302A' : 'var(--paper)' }}>{m?.text ?? drag.n}</text>
            </>}
            {drag.out && <>
              <circle cx={drag.x} cy={drag.y} r={12} fill="#C4302A" fillOpacity={0.9} />
              <path d={`M${drag.x - 5} ${drag.y - 5}L${drag.x + 5} ${drag.y + 5}M${drag.x + 5} ${drag.y - 5}L${drag.x - 5} ${drag.y + 5}`} stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" />
            </>}
            <rect x={lx - w / 2} y={ly} width={w} height={20} rx={10} style={{ fill: drag.out ? '#C4302A' : 'var(--ink)' }} fillOpacity={0.88} />
            <text x={lx} y={ly + 14} textAnchor="middle" fontSize={11} fontWeight={700} style={{ fill: drag.out ? '#FFFFFF' : 'var(--paper)' }}>{text}</text>
          </g>
        );
      })()}
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
