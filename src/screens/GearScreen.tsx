import { PENCIL, TRASH } from '../components/icons';
import { useState } from 'react';
import { ConfirmButton, HelpButton, Sheet, toast } from '../components/ui';
import { summarize } from '../domain/stats';
import type { Gear, GearCategory } from '../domain/types';
import { useStore } from '../state/store';

function ArchiveHelp() {
  return (
    <HelpButton title="보관이란?">
      <p>더 이상 쓰지 않는 장비를 지우지 않고 치워 두는 기능입니다.</p>
      <ul>
        <li>오늘 장비를 고르는 목록과 이 화면에서 사라집니다.</li>
        <li>그 장비로 쏜 예전 기록과 통계는 그대로 남고, 통계의 활 선택에는 "(보관)"으로 나옵니다.</li>
        <li>아래 "보관한 장비 보기"를 누르면 다시 보이고, "다시 사용"으로 되돌릴 수 있습니다.</li>
      </ul>
      <p className="muted">삭제도 할 수 있지만, 지우면 그 장비로 쏜 예전 기록의 장비가 "미지정"이 되어 장비별 비교에서 빠집니다. 잘못 등록한 장비가 아니라면 보관을 권합니다.</p>
    </HelpButton>
  );
}

const CATS: [GearCategory, string][] = [['bow', '활'], ['ring', '깍지'], ['arrow', '화살'], ['string', '현'], ['etc', '기타']];
/** 기타 장비 종류 예시. 목록에 없으면 직접 적는다 */
const ETC_KINDS = ['궁대', '시복', '팔찌', '활집', '전통', '보호대'];
const STRING_TYPES = ['심고현', '기계현', '명주현', '기타'];
const PLACEHOLDER: Record<GearCategory, [string, string, string]> = {
  bow: ['예: 검은 활', '브랜드·모델, 호수 (선택)', '예: OO궁 45호'],
  ring: ['예: 소뿔 깍지', '종류·재질, 크기 (선택)', '예: 소뿔, 중'],
  arrow: ['예: 카본 7돈', '종류, 무게, 개수 (선택)', '예: 카본, 7돈, 5대'],
  string: ['예: 기계현 18합', '만든 곳, 맨 날 같은 메모 (선택)', '예: OO현, 11월 13일에 맴'],
  etc: ['예: 가죽 궁대', '메모 (선택)', '예: 3월에 삼, 허리 90'],
};

/** 장비 추가, 또는 editing을 주면 그 장비 고치기 */
function GearFormSheet({ editing, onClose }: { editing?: Gear; onClose: () => void }) {
  const { addGear, updateGear, gear } = useStore();
  const [cat, setCat] = useState<GearCategory>(editing?.category ?? 'bow');
  const [nickname, setNickname] = useState(editing?.nickname ?? '');
  const [bowType, setBowType] = useState<string | undefined>(editing?.bowType);
  const [stringType, setStringType] = useState<string | undefined>(editing?.stringType);
  const [thickness, setThickness] = useState(editing?.thickness ?? '');
  const [kind, setKind] = useState(editing?.kind ?? '');
  /** 예시와 이미 적어 둔 종류를 함께 고르게 한다 */
  const kinds = [...new Set([...ETC_KINDS, ...gear.map((g) => g.kind?.trim()).filter((k): k is string => !!k)])];
  const [detail, setDetail] = useState(editing?.detail ?? '');
  const [err, setErr] = useState('');

  const submit = async () => {
    if (cat === 'etc' && !kind.trim()) { setErr('종류를 고르거나 적어 주세요. 예: 궁대'); return; }
    if (!nickname.trim()) { setErr('별명을 입력하세요. 목록과 통계에 이 이름으로 표시됩니다.'); return; }
    const fields = { nickname: nickname.trim(), detail: detail.trim() || undefined, bowType: cat === 'bow' ? bowType : undefined,
      stringType: cat === 'string' ? stringType : undefined, thickness: cat === 'string' ? thickness.trim() || undefined : undefined, kind: cat === 'etc' ? kind.trim() : undefined };
    if (editing) {
      await updateGear({ ...editing, ...fields });
      toast('고쳤습니다. 예전 기록과 통계에도 새 이름으로 나옵니다');
    } else {
      await addGear({ category: cat, ...fields });
      toast(`${nickname.trim()} 추가했습니다`);
    }
    onClose();
  };

  return (
    <Sheet title={editing ? '장비 고치기' : '장비 추가'} onClose={onClose}>
      {!editing && (
        <div className="chips">
          {CATS.map(([c, l]) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{l}</button>)}
        </div>
      )}
      {cat === 'etc' && (
        <div className="field">
          <label htmlFor="f-kind">종류 (필수)</label>
          <div className="chips">
            {kinds.map((t) => <button key={t} className={`chip ${kind === t ? 'on' : ''}`} onClick={() => { setKind(kind === t ? '' : t); setErr(''); }}>{t}</button>)}
          </div>
          <input type="text" id="f-kind" maxLength={12} placeholder="목록에 없으면 직접 적기" value={kind} onChange={(e) => { setKind(e.target.value); setErr(''); }} />
        </div>
      )}
      <div className="field">
        <label htmlFor="f-nick">별명 (필수)</label>
        <input type="text" id="f-nick" autoFocus maxLength={20} placeholder={PLACEHOLDER[cat][0]} value={nickname} onChange={(e) => { setNickname(e.target.value); setErr(''); }} />
      </div>
      {cat === 'bow' && (
        <div className="field">
          <label>구분 (선택)</label>
          <div className="chips">
            {['개량궁', '각궁', '기타'].map((t) => <button key={t} className={`chip ${bowType === t ? 'on' : ''}`} onClick={() => setBowType(bowType === t ? undefined : t)}>{t}</button>)}
          </div>
        </div>
      )}
      {cat === 'string' && (
        <>
          <div className="field">
            <label>종류 (선택)</label>
            <div className="chips">
              {STRING_TYPES.map((t) => <button key={t} className={`chip ${stringType === t ? 'on' : ''}`} onClick={() => setStringType(stringType === t ? undefined : t)}>{t}</button>)}
            </div>
          </div>
          <div className="field">
            <label htmlFor="f-thick">현 굵기 (선택)</label>
            <input type="text" id="f-thick" maxLength={20} placeholder="예: 18합, 2.0mm" value={thickness} onChange={(e) => setThickness(e.target.value)} />
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor="f-detail">{PLACEHOLDER[cat][1]}</label>
        <input type="text" id="f-detail" placeholder={PLACEHOLDER[cat][2]} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </div>
      {err && <div className="small" role="alert" style={{ color: 'var(--hong)' }}>{err}</div>}
      <button className="btn" onClick={submit}>{editing ? '저장' : '추가'}</button>
    </Sheet>
  );
}

function DeleteGearSheet({ g, used, onClose }: { g: Gear; used: number; onClose: () => void }) {
  const { deleteGear, setArchived } = useStore();
  const del = () => deleteGear(g.id).then(() => { toast(`${g.nickname} 삭제했습니다`); onClose(); });
  return (
    <Sheet title={`${g.nickname} 삭제`} onClose={onClose}>
      {used === 0 ? (
        <>
          <div className="small muted">이 장비로 남긴 기록이 없습니다. 지우면 되돌릴 수 없습니다.</div>
          <button className="btn danger" onClick={del}>삭제</button>
        </>
      ) : (
        <>
          <div className="small">이 장비로 남긴 기록이 <b>{used}순</b> 있습니다. 지우면 기록은 남지만 그 순들의 장비가 "미지정"이 되어 장비별 비교에서 빠지고, 되돌릴 수 없습니다.</div>
          {!g.archived && <div className="small muted">더 쓰지 않는 장비라면 보관하면 기록과 통계는 그대로 두고 목록에서만 치울 수 있습니다.</div>}
          {!g.archived && <button className="btn" onClick={() => setArchived(g.id, true).then(() => { toast('보관했습니다. 기록은 그대로 남습니다'); onClose(); })}>보관하기</button>}
          <ConfirmButton className="btn ghost danger-text" label="그래도 삭제" confirmLabel={`${used}순의 장비를 미지정으로 바꾸고 삭제`} onConfirm={del} />
        </>
      )}
      <button className="btn ghost small" onClick={onClose}>취소</button>
    </Sheet>
  );
}

export function GearScreen() {
  const store = useStore();
  const { gear, ends, setArchived } = store;
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [deleting, setDeleting] = useState<Gear | null>(null);
  const [editingGear, setEditingGear] = useState<Gear | null>(null);
  const usedCount = (id: string) => ends.filter((e) => e.bowId === id || e.ringId === id || e.arrowId === id || e.stringId === id).length;

  const statsFor = (id: string) => {
    const list = ends.filter((e) => e.bowId === id || e.ringId === id || e.arrowId === id || e.stringId === id);
    return list.length ? summarize(list) : null;
  };

  return (
    <>
      <button className="btn" onClick={() => setAdding(true)}>장비 추가</button>
      {CATS.map(([c, label]) => {
        const items = gear.filter((g) => g.category === c && (showArchived || !g.archived));
        return (
          <section className="card" key={c}>
            <div className="row between"><h2>{label}</h2>{c === 'bow' && <ArchiveHelp />}</div>
            {c === 'etc' && <div className="small muted">궁대, 시복처럼 활·깍지·화살·현 말고 가진 장비를 종류를 직접 적어 둡니다. 순마다 기록에는 붙지 않습니다.</div>}
            {items.length === 0 && <div className="empty small">등록된 {label}이(가) 없습니다.</div>}
            {items.map((g) => {
              const s = statsFor(g.id);
              const detail = [g.kind, g.bowType, g.stringType, g.thickness && `굵기 ${g.thickness}`, g.detail].filter(Boolean).join(' · ') || '상세 정보 없음';
              return (
                <div key={g.id} className={`eq ${g.archived ? 'off' : ''}`}>
                  <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} role="button" tabIndex={0} aria-label={`${g.nickname} 고치기`}
                    onClick={() => setEditingGear(g)} onKeyDown={(ev) => { if (ev.key === 'Enter') setEditingGear(g); }}>
                    <div className="nm">{g.nickname}{g.archived && <span className="pill archived">보관</span>}</div>
                    <div className="dt">{detail}{c === 'etc' ? '' : ` · ${s ? `${s.ends}순 · 순당 ${s.perEnd.toFixed(1)}중` : '기록 없음'}`}</div>
                  </div>
                  <span className="end-acts">
                    <button className="act-btn" onClick={() => setArchived(g.id, !g.archived).then(() => toast(g.archived ? '다시 사용합니다' : '보관했습니다. 기록은 그대로 남습니다'))}>
                      {g.archived ? '다시 사용' : '보관'}
                    </button>
                    <button className="act-btn" aria-label={`${g.nickname} 고치기`} title="고치기" onClick={() => setEditingGear(g)}>{PENCIL}</button>
                    <button className="act-btn danger" aria-label={`${g.nickname} 삭제`} title="삭제" onClick={() => setDeleting(g)}>{TRASH}</button>
                  </span>
                </div>
              );
            })}
          </section>
        );
      })}
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn ghost" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? '보관한 장비 숨기기' : '보관한 장비 보기'}
        </button>
        <ArchiveHelp />
      </div>

      {adding && <GearFormSheet onClose={() => setAdding(false)} />}
      {editingGear && <GearFormSheet editing={editingGear} onClose={() => setEditingGear(null)} />}
      {deleting && <DeleteGearSheet g={deleting} used={usedCount(deleting.id)} onClose={() => setDeleting(null)} />}
    </>
  );
}
