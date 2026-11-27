import { Sheet } from './ui';
import { GradeMark } from './GradeMark';
import { GRADES, GRADE_HOLD_DAYS, GRADE_WINDOW, gradeTitle, hitsToNext, type GradeReport } from '../domain/grade';
import { formatDate } from '../domain/util';
import { danLabel } from '../domain/dan';

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');

/** 등급을 매기는 방법 (업적 보기의 ? 설명과 습사 탭의 등급 창이 함께 쓴다) */
export function GradeHelp() {
  return (
    <>
      <p>직접 쏜 <b>최근 {GRADE_WINDOW}순</b>을 15시(3순) 기준 평균으로 봅니다. 예시 기록은 넣지 않습니다.</p>
      <ul className="grade-steps">{GRADES.map((x, i) => (
        <li key={x.id}><GradeMark grade={x} size={22} /> <b>{gradeTitle(x)}</b> <span className="muted">{i === 0 ? `${GRADES[1].min}중 미만` : GRADES[i + 1] ? `${x.min}~${GRADES[i + 1].min}중` : `${x.min}중 이상`}</span></li>
      ))}</ul>
      <p>10중은 관중 랭킹에 드는 기준이자 대회 입상권(15시 10중)이라 백은 과녁의 경계로 두었습니다.</p>
      <p><b>올라가는 것은 바로</b> 됩니다. <b>내려가는 것은 {GRADE_HOLD_DAYS}일 기다립니다.</b> 지난 {GRADE_HOLD_DAYS}일 안에 이룬 가장 높은 등급을 보여 줍니다. 습사를 쉬는 동안에는 내려가지 않습니다.</p>
      <p>등급은 앱 안의 기록으로 매기는 것이라 협회의 단과는 다릅니다. 지난 순을 고치거나 지우면 다시 계산합니다.</p>
      <p><b>단은 무궁화로</b> 답니다. 설정에 단을 넣으면 과녁 테두리에 무궁화가 핍니다. 1~4단은 위쪽에 단 수만큼, 5~8단은 위쪽 네 송이에 아래쪽으로 더하고, 9단(신궁)은 홍심도 무궁화가 됩니다.</p>
      <ul className="grade-steps dan-steps">{[1, 4, 5, 8, 9].map((d) => (
        <li key={d}><GradeMark grade={GRADES[4]} dan={d} size={30} /> <b>{danLabel(d)}</b></li>
      ))}</ul>
    </>
  );
}

/** 내 등급: 큰 과녁, 이름, 최근 평균, 다음 등급까지 막대, 내려가기 유예 */
export function GradeSummary({ r, dan, title }: { r: GradeReport; dan?: number | null; title?: string | null }) {
  const g = r.grade;
  const more = hitsToNext(r);
  const pct = !g ? Math.round((r.counted / GRADE_WINDOW) * 100)
    : !r.next || r.per15 == null ? 100
    : Math.max(0, Math.min(100, Math.round(((r.per15 - g.min) / (r.next.min - g.min)) * 100)));
  return (
    <>
      <div className="grade-main">
        <GradeMark grade={g} dan={dan} size={72} />
        <div className="grade-text">
          <b className="grade-name">{g ? gradeTitle(g) : '등급 매기기 전'}</b>
          {g && r.per15 != null
            ? <span className="small muted">최근 {GRADE_WINDOW}순 15시 평균 <b className="ink">{fmt1(r.per15)}중</b></span>
            : <span className="small muted">{GRADE_WINDOW}순을 쏘면 등급이 매겨집니다 · 지금 {r.counted}순</span>}
          {title && <span className="pill title big">{title}</span>}
        </div>
      </div>
      <div className="ach-prog">
        <div className="row between small">
          <span className="muted">{!g ? `${r.need}순 남음` : r.next ? `${gradeTitle(r.next)}까지` : '가장 높은 등급입니다'}</span>
          {g && r.next && more != null && <span className="muted">최근 {GRADE_WINDOW}순에서 {more}중 더</span>}
        </div>
        <div className="ach-track" aria-hidden><div className={`fill ${g ? g.id : ''}`} style={{ width: `${pct}%` }} /></div>
      </div>
      {g && r.now && r.holdUntil && (
        <div className="small muted">지금 최근 {GRADE_WINDOW}순은 {gradeTitle(r.now)}입니다. {formatDate(r.holdUntil)}까지 다시 {g.min}중을 넘기면 {gradeTitle(g)}을 이어 갑니다.</div>
      )}
    </>
  );
}

/** 습사 탭에서 등급 과녁을 눌렀을 때: 내 등급과 등급 설명 */
export function GradeSheet({ r, dan, title, onClose }: { r: GradeReport; dan?: number | null; title?: string | null; onClose: () => void }) {
  return (
    <Sheet title="내 등급" onClose={onClose}>
      <div className="grade-sheet">
        <GradeSummary r={r} dan={dan} title={title} />
        <h3>등급은 이렇게 매깁니다</h3>
        <div className="help-body"><GradeHelp /></div>
      </div>
      <button className="btn" onClick={onClose}>확인</button>
    </Sheet>
  );
}
