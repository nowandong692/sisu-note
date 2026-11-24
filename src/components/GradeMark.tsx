import { useId } from 'react';
import { gradeTitle, type Grade, type GradeId } from '../domain/grade';

/** 테두리 재질: 위에서 아래로 빛이 흐르는 색 세 개 */
const MATERIAL: Record<GradeId, [string, string, string]> = {
  wood: ['#CDA470', '#A07548', '#6E4A2A'],
  iron: ['#8C9096', '#5E6268', '#3E4146'],
  bronze: ['#F2B27C', '#C4753F', '#8A4A22'],
  silver: ['#F4F6F8', '#C3C8CF', '#959BA4'],
  gold: ['#FFE38A', '#E3B23C', '#B9831B'],
};

/**
 * 등급 과녁: 앱 아이콘과 같은 국궁 과녁(흰 판, 검은 띠, 홍심)에 등급 재질의 테두리를 두른다.
 * grade가 없으면(30순 전) 테두리 없이 흐리게.
 */
export function GradeMark({ grade, size = 20, className = '' }: { grade: Grade | null; size?: number; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const label = grade ? gradeTitle(grade) : '등급 매기기 전';
  const m = grade ? MATERIAL[grade.id] : null;
  // 판 비율 2:3. 테두리는 큰 그림일수록 조금 얇게
  const w = 40, h = 56;
  const frame = size >= 48 ? 5 : size >= 30 ? 6 : 8;
  return (
    <svg className={`grade-mark ${grade ? grade.id : 'none'} ${className}`} width={(size * w) / h} height={size}
      viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <title>{label}</title>
      {m && (
        <defs>
          <linearGradient id={`gm${uid}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor={m[0]} />
            <stop offset="0.5" stopColor={m[1]} />
            <stop offset="1" stopColor={m[2]} />
          </linearGradient>
        </defs>
      )}
      {m
        ? <rect x={0} y={0} width={w} height={h} rx={5} fill={`url(#gm${uid})`} />
        : <rect x={1} y={1} width={w - 2} height={h - 2} rx={4} fill="none" style={{ stroke: 'var(--line)' }} strokeWidth={2} strokeDasharray="4 3" />}
      {m && grade!.id === 'wood' && (
        <g stroke="#5A361D" strokeOpacity={0.35} strokeWidth={0.8} fill="none">
          <path d="M2 10c3 2 3 6 0 9M38 30c-3 2-3 7 0 10M2 40c2 1 2 4 0 6" />
        </g>
      )}
      <g opacity={grade ? 1 : 0.45}>
        <rect x={frame} y={frame} width={w - frame * 2} height={h - frame * 2} fill="#EEEEEE" />
        <rect x={frame + 3} y={frame + 4} width={w - frame * 2 - 6} height={5} fill="#111111" />
        <rect x={frame + 3} y={frame + 14} width={w - frame * 2 - 6} height={h - frame * 2 - 18} fill="#111111" />
        <circle cx={w / 2} cy={frame + 14 + (h - frame * 2 - 18) / 2} r={6.5} fill="#FF0A14" />
      </g>
      {m && <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={4.5} fill="none" stroke="#000" strokeOpacity={0.18} />}
    </svg>
  );
}
