import { useState } from 'react';
import { ConfirmButton, HelpButton, Sheet, toast } from '../components/ui';
import { endsToCsv } from '../domain/csv';
import { summarize } from '../domain/stats';
import type { Gear, GearCategory } from '../domain/types';
import { today } from '../domain/util';
import { saveTextFile } from '../platform/files';
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

const CATS: [GearCategory, string][] = [['bow', '활'], ['ring', '깍지'], ['arrow', '화살']];
const PLACEHOLDER: Record<GearCategory, [string, string, string]> = {
  bow: ['예: 검은 활', '브랜드·모델, 호수 (선택)', '예: OO궁 45호'],
  ring: ['예: 소뿔 깍지', '종류·재질, 크기 (선택)', '예: 소뿔, 중'],
  arrow: ['예: 카본 7돈', '종류, 무게, 개수 (선택)', '예: 카본, 7돈, 5대'],
};

/** 장비 추가, 또는 editing을 주면 그 장비 고치기 */
function GearFormSheet({ editing, onClose }: { editing?: Gear; onClose: () => void }) {
  const { addGear, updateGear } = useStore();
  const [cat, setCat] = useState<GearCategory>(editing?.category ?? 'bow');
  const [nickname, setNickname] = useState(editing?.nickname ?? '');
  const [bowType, setBowType] = useState<string | undefined>(editing?.bowType);
  const [detail, setDetail] = useState(editing?.detail ?? '');
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!nickname.trim()) { setErr('별명을 입력하세요. 목록과 통계에 이 이름으로 표시됩니다.'); return; }
    const fields = { nickname: nickname.trim(), detail: detail.trim() || undefined, bowType: cat === 'bow' ? bowType : undefined };
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
  const usedCount = (id: string) => ends.filter((e) => e.bowId === id || e.ringId === id || e.arrowId === id).length;

  const statsFor = (id: string) => {
    const list = ends.filter((e) => e.bowId === id || e.ringId === id || e.arrowId === id);
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
            {items.length === 0 && <div className="empty small">등록된 {label}이(가) 없습니다.</div>}
            {items.map((g) => {
              const s = statsFor(g.id);
              const detail = [g.bowType, g.detail].filter(Boolean).join(' · ') || '상세 정보 없음';
              return (
                <div key={g.id} className={`eq ${g.archived ? 'off' : ''}`}>
                  <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} role="button" tabIndex={0} aria-label={`${g.nickname} 고치기`}
                    onClick={() => setEditingGear(g)} onKeyDown={(ev) => { if (ev.key === 'Enter') setEditingGear(g); }}>
                    <div className="nm">{g.nickname}{g.archived && <span className="pill archived">보관</span>}</div>
                    <div className="dt">{detail} · {s ? `${s.ends}순 · 순당 ${s.perEnd.toFixed(1)}중` : '기록 없음'}</div>
                  </div>
                  <button className="btn ghost small" onClick={() => setArchived(g.id, !g.archived).then(() => toast(g.archived ? '다시 사용합니다' : '보관했습니다. 기록은 그대로 남습니다'))}>
                    {g.archived ? '다시 사용' : '보관'}
                  </button>
                  <span className="eq-acts">
                    <button className="del edit" onClick={() => setEditingGear(g)}>고치기</button>
                    <button className="del" aria-label={`${g.nickname} 삭제`} onClick={() => setDeleting(g)}>삭제</button>
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

      <section className="card">
        <h2>데이터</h2>
        <div className="small muted">기록은 이 기기에만 저장됩니다. 가끔 CSV로 내보내 백업해 두세요.</div>
        <div className="row">
          <button className="btn ghost small" disabled={!ends.length} onClick={() => saveTextFile(`시수노트-${today()}.csv`, endsToCsv(ends, gear))}>CSV 내보내기</button>
          <ConfirmButton className="btn ghost small" label="예시 기록 불러오기" confirmLabel="지금 기록을 지우고 불러오기" onConfirm={() => store.loadSample().then(() => toast('예시 기록을 불러왔습니다'))} />
          <ConfirmButton className="btn ghost small" label="모든 기록 지우기" confirmLabel="정말 지우기" onConfirm={() => store.clearAll().then(() => toast('모든 기록과 장비를 지웠습니다'))} />
        </div>
      </section>
      {adding && <GearFormSheet onClose={() => setAdding(false)} />}
      {editingGear && <GearFormSheet editing={editingGear} onClose={() => setEditingGear(null)} />}
      {deleting && <DeleteGearSheet g={deleting} used={usedCount(deleting.id)} onClose={() => setDeleting(null)} />}
    </>
  );
}
