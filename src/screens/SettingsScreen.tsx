import { ConfirmButton, toast } from '../components/ui';
import { endsToCsv } from '../domain/csv';
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

/** 설정 탭: 화면 밝기·테마, 데이터 */
export function SettingsScreen() {
  const store = useStore();
  const { ends, gear } = store;
  return (
    <>
      <AppearanceSection />
      <section className="card">
        <h2>데이터</h2>
        <div className="small muted">기록은 이 기기에만 저장됩니다. 가끔 CSV로 내보내 백업해 두세요.</div>
        <div className="row">
          <button className="btn ghost small" disabled={!ends.length} onClick={() => saveTextFile(`국궁록-${today()}.csv`, endsToCsv(ends, gear, store.ranges))}>CSV 내보내기</button>
          <ConfirmButton className="btn ghost small" label="예시 기록 불러오기" confirmLabel="지금 기록을 지우고 불러오기" onConfirm={() => store.loadSample().then(() => toast('예시 기록을 불러왔습니다'))} />
          <ConfirmButton className="btn ghost small" label="모든 기록 지우기" confirmLabel="정말 지우기" onConfirm={() => store.clearAll().then(() => toast('모든 기록과 장비를 지웠습니다'))} />
        </div>
      </section>
    </>
  );
}
