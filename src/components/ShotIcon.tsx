import { missOctant, shotLabel } from '../domain/target';
import type { Shot } from '../domain/types';

const SIZE = 20;

/** 관중은 빨간 원(칸 번호가 있으면 원 안에 숫자), 불은 빠진 방향의 화살표 */
export function ShotIcon({ shot, index }: { shot: Shot; index: number }) {
  const title = `${index + 1}시 ${shotLabel(shot, true)}`;
  if (shot.hit) {
    return (
      <svg className="shot-icon" width={SIZE} height={SIZE} viewBox="0 0 20 20" role="img" aria-label={title}>
        <title>{title}</title>
        <circle cx={10} cy={10} r={9} style={{ fill: 'var(--hong)' }} />
        {shot.zone != null && (
          <text x={10} y={14} textAnchor="middle" fontSize={12} fontWeight={700} fill="#FFFFFF">{shot.zone}</text>
        )}
      </svg>
    );
  }
  const o = missOctant(shot);
  return (
    <svg className="shot-icon" width={SIZE} height={SIZE} viewBox="0 0 20 20" role="img" aria-label={title}>
      <title>{title}</title>
      <circle cx={10} cy={10} r={8.5} fill="none" style={{ stroke: 'var(--muted)' }} strokeWidth={1.5} />
      {o == null ? (
        <circle cx={10} cy={10} r={2} style={{ fill: 'var(--muted)' }} />
      ) : (
        <g transform={`rotate(${o * 45} 10 10)`} style={{ stroke: 'var(--ink)' }} strokeWidth={shot.level === 2 ? 2.2 : 1.6} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M10 15V5" />
          <path d="M6.5 8.5L10 5l3.5 3.5" />
        </g>
      )}
    </svg>
  );
}
