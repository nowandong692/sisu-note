import { useId } from 'react';
import { gradeTitle, type Grade, type GradeId } from '../domain/grade';
import { danFlowers, danShort } from '../domain/dan';

/** 테두리 재질: 위에서 아래로 빛이 흐르는 색 세 개 */
const MATERIAL: Record<GradeId, [string, string, string]> = {
  wood: ['#CDA470', '#A07548', '#6E4A2A'],
  iron: ['#8C9096', '#5E6268', '#3E4146'],
  bronze: ['#F2B27C', '#C4753F', '#8A4A22'],
  silver: ['#F4F6F8', '#C3C8CF', '#959BA4'],
  gold: ['#FFE38A', '#E3B23C', '#B9831B'],
};

/** 테두리에 다는 무궁화 반지름 */
const FLOWER_R = 4.4;

/** 무궁화 한 송이 (가운데 cx, cy, 반지름 r) */
function Mugunghwa({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={cx} cy={cy - r * 0.5} rx={r * 0.45} ry={r * 0.56} transform={`rotate(${a} ${cx} ${cy})`}
          fill="#F7B8D2" stroke="#A8336A" strokeWidth={r * 0.09} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.36} fill="#B0124F" />
    </g>
  );
}

/** 무궁화 n송이를 가운데로 모아 한 줄로 */
function FlowerRow({ n, y }: { n: number; y: number }) {
  const gap = FLOWER_R * 2.05;
  const x0 = 20 - (gap * (n - 1)) / 2;
  return <>{Array.from({ length: n }, (_, i) => <Mugunghwa key={i} cx={x0 + i * gap} cy={y} r={FLOWER_R} />)}</>;
}
/**
 * 등급 과녁: 앱 아이콘과 같은 국궁 과녁(흰 판, 검은 띠, 홍심)에 등급 재질의 테두리를 두른다.
 * grade가 없으면(30순 전) 테두리 없이 흐리게. dan(1~9)을 주면 테두리에 무궁화를 단 수만큼 단다.
 */
export function GradeMark({ grade, dan, size = 20, className = '' }: { grade: Grade | null; dan?: number | null; size?: number; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const f = danFlowers(dan);
  const label = `${grade ? gradeTitle(grade) : '등급 매기기 전'}${f.top ? `, ${danShort(dan!)}` : ''}`;
  const m = grade ? MATERIAL[grade.id] : null;
  // 판 비율 2:3. 테두리는 큰 그림일수록 조금 얇게
  const w = 40, h = 56;
  const frame = size >= 48 ? 5 : size >= 30 ? 6 : 8;
  // 무궁화는 테두리 위·아래 선에 걸치므로 그만큼 그림을 늘린다 (과녁 크기는 그대로)
  const padTop = f.top ? FLOWER_R : 0;
  const padBottom = f.bottom ? FLOWER_R : 0;
  const cy = frame + 14 + (h - frame * 2 - 18) / 2;
  return (
    <svg className={`grade-mark ${grade ? grade.id : 'none'} ${className}`} width={(size * w) / h} height={(size * (h + padTop + padBottom)) / h}
      viewBox={`0 ${-padTop} ${w} ${h + padTop + padBottom}`} role="img" aria-label={label}>
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
        {f.center ? <Mugunghwa cx={w / 2} cy={cy} r={7.5} /> : <circle cx={w / 2} cy={cy} r={6.5} fill="#FF0A14" />}
      </g>
      {m && <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={4.5} fill="none" stroke="#000" strokeOpacity={0.18} />}
      {f.top > 0 && <FlowerRow n={f.top} y={0.5} />}
      {f.bottom > 0 && <FlowerRow n={f.bottom} y={h - 0.5} />}
    </svg>
  );
}
