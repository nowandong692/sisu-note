import { useState } from 'react';
import { ClubSheet } from '../components/ClubSheet';
import { ConfirmButton, Sheet, toast } from '../components/ui';
import { endsToCsv } from '../domain/csv';
import { DAN_LEVELS, DAN_ORGS, danLabel, validDan, type DanOrg } from '../domain/dan';
import { PALETTES, type Palette, type ThemeMode } from '../domain/types';
import { today } from '../domain/util';
import { saveTextFile } from '../platform/files';
import { useStore } from '../state/store';

const MODES: [ThemeMode, string][] = [['system', '기기 설정 따라'], ['light', '밝게'], ['dark', '어둡게']];

/** 화면 밝기와 색 테마 */
function AppearanceSection() {
  const { settings, updateSettings } = useStore();
  const cur = settings.appearance ?? { mode: 'system' as ThemeMode, palette: 'hong' as Palette };
  const set = (patch: Partial<typeof cur>) => updateSettings({ appearance: { ...cur, ...patch } });
  return (
    <section className="card">
      <h2>화면</h2>
      <div className="seg" role="group" aria-label="화면 밝기">
        {MODES.map(([m, l]) => <button key={m} className={cur.mode === m ? 'on' : ''} aria-pressed={cur.mode === m} onClick={() => set({ mode: m })}>{l}</button>)}
      </div>
      <div className="palettes" role="group" aria-label="색 테마">
        {PALETTES.map((p) => (
          <button key={p.id} className={`palette-btn ${cur.palette === p.id ? 'on' : ''}`} aria-pressed={cur.palette === p.id} onClick={() => set({ palette: p.id })}>
            <span className={`swatch sw-${p.id}`} aria-hidden="true"><i /><i /><i /></span>
            <b>{p.name}</b>
            <span className="small muted">{p.desc}</span>
          </button>
        ))}
      </div>
      <div className="small muted">과녁 그림과 관중 위치를 나타내는 파란 점은 테마와 상관없이 그대로입니다.</div>
    </section>
  );
}

/** 내 소속 활터 */
function ClubSection() {
  const { settings, setClub } = useStore();
  const [open, setOpen] = useState(false);
  const club = settings.club;
  return (
    <section className="card">
      <h2>내 소속</h2>
      {club ? (
        <div className="club-now">
          <b>{club.name}</b>
          {club.address && <span className="small muted">{club.region ? `${club.region} · ` : ''}{club.address}</span>}
        </div>
      ) : (
        <div className="small muted">소속 활터를 정해 두면 대회 일정과 활터 찾기에서 표시해 주고, 랭킹에 함께 보일 활터로 고를 수 있습니다.</div>
      )}
      <div className="row">
        <button className="btn small" onClick={() => setOpen(true)}>{club ? '바꾸기' : '소속 정하기'}</button>
        {club && <ConfirmButton className="btn ghost small" label="소속 지우기" confirmLabel="지우기" onConfirm={() => setClub(null).then(() => toast('소속을 지웠습니다'))} />}
      </div>
      {open && <ClubSheet onClose={() => setOpen(false)} />}
    </section>
  );
}

/** 내 단: 기관마다 하나씩 */
function DanSection() {
  const { settings, setDans } = useStore();
  const dans = settings.dans ?? {};
  const set = (org: DanOrg, v: string) => {
    const next = { ...dans };
    const level = validDan(Number(v));
    if (level) next[org] = level; else delete next[org];
    void setDans(next).then(() => toast(level ? `${org} ${danLabel(level)}로 정했습니다` : `${org} 단을 지웠습니다`));
  };
  return (
    <section className="card">
      <h2>내 단</h2>
      {DAN_ORGS.map((org) => (
        <div className="field dan-row" key={org}>
          <label htmlFor={`dan-${org}`}>{org}</label>
          <select id={`dan-${org}`} value={validDan(dans[org]) ?? ''} onChange={(e) => set(org, e.target.value)}>
            <option value="">없음</option>
            {DAN_LEVELS.map((l) => <option key={l} value={l}>{danLabel(l)}</option>)}
          </select>
        </div>
      ))}
      <div className="small muted">받은 단이 있는 기관만 고르세요. 겨루기에 참여 중이면 가장 높은 단 하나만 랭킹에 함께 보입니다 (기관 이름은 올리지 않습니다).</div>
    </section>
  );
}

type DataAction = 'sample' | 'ends' | 'all';

/** 데이터 지우기 전에 띄우는 경고 창: 무엇이 지워지고 무엇이 남는지 보여 준다 */
function DataWarnSheet({ action, onClose }: { action: DataAction; onClose: () => void }) {
  const store = useStore();
  const { ends, gear } = store;
  const [busy, setBusy] = useState(false);
  const n = ends.length;
  const g = gear.length;
  const spec = {
    sample: {
      title: '예시 기록 불러오기',
      gone: [`이 기기의 순 기록 ${n}순`, `등록한 장비 ${g}개`],
      added: ['두 달치 예시 기록과 예시 장비·활터'],
      kept: ['닉네임과 랭킹 참여, 소속, 단, 화면 설정', '랭킹 서버에 이미 올린 기록'],
      button: '지우고 예시 불러오기',
      run: () => store.loadSample().then(() => toast('예시 기록을 불러왔습니다')),
    },
    ends: {
      title: '기록만 지우기',
      gone: [`이 기기의 순 기록 ${n}순 (기록과 통계에서 사라집니다)`],
      added: [],
      kept: [`등록한 장비 ${g}개와 오늘 장비`, '닉네임과 랭킹 참여, 소속, 단, 활터, 화면 설정', '랭킹 서버에 이미 올린 기록'],
      button: `${n}순 지우기`,
      run: () => store.clearEnds().then((k) => toast(`이 기기의 기록 ${k}순을 지웠습니다. 장비는 그대로입니다`)),
    },
    all: {
      title: '모든 데이터 지우기',
      gone: [`이 기기의 순 기록 ${n}순`, `등록한 장비 ${g}개와 오늘 장비 선택`],
      added: [],
      kept: ['닉네임과 랭킹 참여, 소속, 단, 활터, 화면 설정', '랭킹 서버에 이미 올린 기록'],
      button: '모두 지우기',
      run: () => store.clearAll().then(() => toast('이 기기의 모든 기록과 장비를 지웠습니다')),
    },
  }[action];
  const empty = action !== 'sample' && n === 0 && (action === 'ends' || g === 0);
  return (
    <Sheet title={spec.title} onClose={onClose} backCloses={!busy}>
      <div className="warn-box" role="alert">
        <b>지우면 되돌릴 수 없습니다.</b>
        <span className="small">필요하면 먼저 CSV로 내보내 두세요.</span>
      </div>
      <div className="warn-list">
        <div className="small"><b>지워지는 것</b></div>
        <ul className="small">{spec.gone.map((x) => <li key={x}>{x}</li>)}</ul>
        {spec.added.length > 0 && (<><div className="small"><b>들어오는 것</b></div><ul className="small">{spec.added.map((x) => <li key={x}>{x}</li>)}</ul></>)}
        <div className="small"><b>남는 것</b></div>
        <ul className="small muted">{spec.kept.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      {empty && <div className="small muted">지울 기록이 없습니다.</div>}
      <button className="btn danger" disabled={busy || empty} onClick={async () => { setBusy(true); try { await spec.run(); onClose(); } finally { setBusy(false); } }}>{busy ? '처리하는 중…' : spec.button}</button>
      <button className="btn ghost" disabled={busy} onClick={onClose}>취소</button>
    </Sheet>
  );
}

/** 설정 탭: 내 소속, 내 단, 화면 밝기·테마, 데이터 */
export function SettingsScreen() {
  const store = useStore();
  const { ends, gear } = store;
  const [warn, setWarn] = useState<DataAction | null>(null);
  return (
    <>
      <ClubSection />
      <DanSection />
      <AppearanceSection />
      <section className="card">
        <h2>데이터</h2>
        <div className="small muted">기록은 이 기기에만 저장됩니다. 가끔 CSV로 내보내 백업해 두세요. "기록만 지우기"는 순 기록만, "모든 데이터 지우기"는 장비까지 지웁니다. 누르면 무엇이 지워지는지 먼저 보여 줍니다.</div>
        <div className="row">
          <button className="btn ghost small" disabled={!ends.length} onClick={() => saveTextFile(`국궁록-${today()}.csv`, endsToCsv(ends, gear, store.ranges))}>CSV 내보내기</button>
          <button className="btn ghost small" onClick={() => setWarn('sample')}>예시 기록 불러오기</button>
          <button className="btn ghost small" onClick={() => setWarn('ends')}>기록만 지우기</button>
          <button className="btn ghost small danger-text" onClick={() => setWarn('all')}>모든 데이터 지우기</button>
        </div>
      </section>
      {warn && <DataWarnSheet action={warn} onClose={() => setWarn(null)} />}
    </>
  );
}
