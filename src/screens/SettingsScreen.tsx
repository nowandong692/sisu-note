import { useMemo, useState } from 'react';
import { ClubSheet } from '../components/ClubSheet';
import { NicknameField, type NickStatus } from '../components/NicknameField';
import { cleanNickname, nicknameProblem } from '../domain/nickname';
import { onlineAvailable } from '../platform/online';
import { CodeSheet, RestoreForm } from './RankingScreen';
import { ConfirmButton, Sheet, toast } from '../components/ui';
import { endsToCsv } from '../domain/csv';
import { sampleEndIds } from '../domain/sample';
import { DAN_LEVELS, DAN_ORGS, danLabel, validDan, type DanOrg } from '../domain/dan';
import { PALETTES, type Palette, type ThemeMode } from '../domain/types';
import { today } from '../domain/util';
import { addTag, moveTag, myTags, restoreDefaults, tagProblem, tagUseCount, TAG_MAX } from '../domain/tags';
import { TagDeleteSheet } from '../components/TagDeleteSheet';
import { MEMO_TAGS } from '../domain/types';
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

/** 내 닉네임: 인사와 랭킹에 쓰인다. 다른 궁사와 겹치지 않게 서버에서 확인한다 */
function NicknameSection() {
  const store = useStore();
  const o = store.online;
  const [nickname, setNickname] = useState(o?.nickname ?? '');
  const [nick, setNick] = useState<NickStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  // 다른 곳(랭킹 탭)에서 닉네임이 바뀌면 칸도 맞춘다
  const [seen, setSeen] = useState(o?.nickname);
  if (o?.nickname !== seen) { setSeen(o?.nickname); setNickname(o?.nickname ?? ''); }

  const unchanged = !!o && cleanNickname(nickname) === o.nickname;
  const save = async () => {
    const bad = nicknameProblem(nickname);
    if (bad) { setErr(bad); return; }
    if (nick === 'taken') { setErr('이미 쓰는 닉네임입니다. 다른 닉네임을 정해 주세요.'); return; }
    setBusy(true); setErr('');
    try {
      if (o) { await store.setOnlineProfile(nickname, store.settings.club?.name ?? null); toast('닉네임을 바꿨습니다'); }
      else { await store.joinOnline(nickname, store.settings.club?.name ?? null); setCode('new'); }
    } catch (e) { setErr(e instanceof Error ? e.message : '알 수 없는 오류가 났습니다.'); } finally { setBusy(false); }
  };

  return (
    <section className="card">
      <h2>내 닉네임</h2>
      {!onlineAvailable() && !o ? (
        <div className="small muted">닉네임은 랭킹 서버에서 겹치지 않게 확인한 뒤 정합니다. 랭킹 서버를 준비하고 있어 곧 정할 수 있습니다.</div>
      ) : !o && restoring ? (
        <RestoreForm onBack={() => setRestoring(false)} onDone={() => setRestoring(false)} />
      ) : (
        <>
          <NicknameField id="set-nick" label={o ? '습사 인사와 랭킹에 이 이름으로 보입니다' : '습사 인사와 랭킹에 쓸 이름 (실명이 아니어도 됩니다)'}
            value={nickname} mine={o?.nickname} myKey={o?.key} onStatus={setNick} onChange={(v) => { setNickname(v); setErr(''); }}
            takenHint={!o && <>예전에 내가 쓰던 닉네임이면 <button type="button" className="link-btn" onClick={() => { setRestoring(true); setErr(''); }}>복구 코드로 이어 쓰기</button></>} />
          {!o && <div className="small muted">닉네임을 정하면 랭킹에 함께 참여합니다. 순마다 관중 여부와 저장 시각, 닉네임과 소속만 서버에 올라가고, 이 기기에 복구 코드가 저장됩니다.</div>}
          {err && <div className="small err-text" role="alert">{err}</div>}
          <div className="row">
            <button className="btn small" disabled={busy || unchanged || nick === 'taken' || nick === 'checking'} onClick={save}>
              {busy ? '저장하는 중…' : o ? '닉네임 바꾸기' : '닉네임 정하고 랭킹 참여'}
            </button>
            {!o && <button className="btn ghost small" onClick={() => { setRestoring(true); setErr(''); }}>예전 닉네임이 있어요</button>}
          </div>
        </>
      )}
      {code && store.online && <CodeSheet code={store.online.key} first onClose={() => setCode(null)} />}
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

/** 내 메모 태그: 습사 화면에 보일 태그를 더하고, 빼고, 순서를 바꾼다 */
function MemoTagSection() {
  const { settings, ends, updateSettings } = useStore();
  const list = myTags(settings);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const save = (memoTags: string[]) => updateSettings({ memoTags });
  const add = () => {
    const bad = tagProblem(name, list);
    if (bad) { setErr(bad); return; }
    void save(addTag(list, name)).then(() => toast('태그를 더했습니다'));
    setName(''); setErr('');
  };
  const [deleting, setDeleting] = useState<string | null>(null);
  const missing = MEMO_TAGS.filter((t) => !list.includes(t)).length;
  return (
    <section className="card">
      <h2>메모 태그</h2>
      {list.length ? (
        <ul className="tag-list">
          {list.map((t, i) => {
            const n = tagUseCount(ends, t);
            return (
              <li key={t}>
                <span className="tag-name">#{t}</span>
                <span className="small muted">{n ? `${n}순` : ''}</span>
                <button className="btn ghost small" aria-label={`${t} 앞으로`} disabled={i === 0} onClick={() => void save(moveTag(list, t, -1))}>↑</button>
                <button className="btn ghost small" aria-label={`${t} 뒤로`} disabled={i === list.length - 1} onClick={() => void save(moveTag(list, t, 1))}>↓</button>
                <button className="btn ghost small" aria-label={`${t} 빼기`} onClick={() => setDeleting(t)}>빼기</button>
              </li>
            );
          })}
        </ul>
      ) : <div className="small muted">태그가 없습니다. 아래에서 더해 보세요.</div>}
      <div className="row tag-add">
        <input type="text" aria-label="새 태그 이름" placeholder="새 태그 (예: 발디딤)" maxLength={TAG_MAX + 2} value={name}
          onChange={(e) => { setName(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn small" onClick={add}>더하기</button>
      </div>
      {err && <div className="small err-text" role="alert">{err}</div>}
      {missing > 0 && <button className="btn ghost small" onClick={() => void save(restoreDefaults(list)).then(() => toast('기본 태그를 되살렸습니다'))}>기본 태그 되살리기 ({missing}개)</button>}
      {deleting && <TagDeleteSheet tag={deleting} onClose={() => setDeleting(null)} />}
      <div className="small muted">태그를 빼도 이미 붙인 순의 태그는 지우지 않습니다. 메모 모아보기에서 그대로 찾을 수 있고, 그 순을 고칠 때도 보입니다. 태그는 이 기기에만 저장되고 서버에 올리지 않습니다.</div>
    </section>
  );
}

type DataAction = 'ends' | 'all' | 'sample';

/** 데이터 지우기 전에 띄우는 경고 창: 무엇이 지워지고 무엇이 남는지 보여 준다 */
function DataWarnSheet({ action, onClose }: { action: DataAction; onClose: () => void }) {
  const store = useStore();
  const { ends, gear } = store;
  const [busy, setBusy] = useState(false);
  const n = ends.length;
  const g = gear.length;
  const dn = store.days.length;
  const ns = sampleEndIds(ends).size;
  const spec = {
    sample: {
      title: '예시 기록 빼기',
      gone: [`예시 기록 ${ns}순`, '예시 장비와 예시 활터 (직접 쓴 기록이 쓰고 있는 것은 남깁니다)'],
      kept: [`직접 기록한 순 ${n - ns}순`, '직접 등록한 장비와 활터', '닉네임과 랭킹 참여, 소속, 단, 화면 설정'],
      button: `예시 ${ns}순 빼기`,
      run: () => store.removeSample().then((r) => toast(`예시 기록 ${r.ends}순과 예시 장비 ${r.gear}개를 뺐습니다`)),
    },
    ends: {
      title: '기록만 지우기',
      gone: [`이 기기의 순 기록 ${n}순 (기록과 통계에서 사라집니다)`, ...(dn ? [`하루 메모 ${dn}일`] : [])],
      kept: [`등록한 장비 ${g}개와 오늘 장비`, '닉네임과 랭킹 참여, 소속, 단, 활터, 화면 설정', '랭킹 서버에 이미 올린 기록'],
      button: `${n}순 지우기`,
      run: () => store.clearEnds().then((k) => toast(`이 기기의 기록 ${k}순을 지웠습니다. 장비는 그대로입니다`)),
    },
    all: {
      title: '모든 데이터 지우기',
      gone: [`이 기기의 순 기록 ${n}순`, ...(dn ? [`하루 메모 ${dn}일`] : []), `등록한 장비 ${g}개와 오늘 장비 선택`],
      kept: ['닉네임과 랭킹 참여, 소속, 단, 활터, 화면 설정', '랭킹 서버에 이미 올린 기록'],
      button: '모두 지우기',
      run: () => store.clearAll().then(() => toast('이 기기의 모든 기록과 장비를 지웠습니다')),
    },
  }[action];
  const empty = action === 'sample' ? ns === 0 : n === 0 && dn === 0 && (action === 'ends' || g === 0);
  return (
    <Sheet title={spec.title} onClose={onClose} backCloses={!busy}>
      <div className="warn-box" role="alert">
        <b>지우면 되돌릴 수 없습니다.</b>
        <span className="small">필요하면 먼저 CSV로 내보내 두세요.</span>
      </div>
      <div className="warn-list">
        <div className="small"><b>지워지는 것</b></div>
        <ul className="small">{spec.gone.map((x) => <li key={x}>{x}</li>)}</ul>
        <div className="small"><b>남는 것</b></div>
        <ul className="small muted">{spec.kept.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      {empty && <div className="small muted">지울 기록이 없습니다.</div>}
      <button className="btn danger" disabled={busy || empty} onClick={async () => { setBusy(true); try { await spec.run(); onClose(); } finally { setBusy(false); } }}>{busy ? '처리하는 중…' : spec.button}</button>
      <button className="btn ghost" disabled={busy} onClick={onClose}>취소</button>
    </Sheet>
  );
}

/** 설정 탭: 내 닉네임, 내 소속, 내 단, 메모 태그, 화면 밝기·테마, 데이터 */
export function SettingsScreen() {
  const store = useStore();
  const { ends, gear } = store;
  const [warn, setWarn] = useState<DataAction | null>(null);
  const hasSample = useMemo(() => sampleEndIds(ends).size > 0, [ends]);
  return (
    <>
      <NicknameSection />
      <ClubSection />
      <DanSection />
      <MemoTagSection />
      <AppearanceSection />
      <section className="card">
        <h2>데이터</h2>
        <div className="small muted">기록은 이 기기에만 저장됩니다. 가끔 CSV로 내보내 백업해 두세요. "기록만 지우기"는 순 기록만, "모든 데이터 지우기"는 장비까지 지웁니다. 누르면 무엇이 지워지는지 먼저 보여 줍니다.</div>
        <div className="row">
          <button className="btn ghost small" disabled={!ends.length} onClick={() => saveTextFile(`국궁록-${today()}.csv`, endsToCsv(ends, gear, store.ranges))}>CSV 내보내기</button>
          {hasSample && <button className="btn ghost small" onClick={() => setWarn('sample')}>예시 기록 빼기</button>}
          <button className="btn ghost small" onClick={() => setWarn('ends')}>기록만 지우기</button>
          <button className="btn ghost small danger-text" onClick={() => setWarn('all')}>모든 데이터 지우기</button>
        </div>
      </section>
      {warn && <DataWarnSheet action={warn} onClose={() => setWarn(null)} />}
    </>
  );
}
