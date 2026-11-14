import { useEffect, useState } from 'react';
import { searchHwalter, type HwalterFile } from '../domain/hwalter';
import { loadHwalter } from '../platform/hwalterData';
import { useStore } from '../state/store';
import { Sheet, toast } from './ui';

/** 내 소속 활터 정하기: 협회 활터현황에서 찾아 고르거나, 없으면 직접 적는다 */
export function ClubSheet({ onClose }: { onClose: () => void }) {
  const { settings, setClub } = useStore();
  const [file, setFile] = useState<HwalterFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState(settings.club?.name ?? '');
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => { loadHwalter().then(setFile, () => { setFailed(true); setTyping(true); }); }, []);

  const hits = file && q.trim() ? searchHwalter(file.items, q, null).slice(0, 30) : [];
  const done = (msg: string) => { toast(msg); onClose(); };

  return (
    <Sheet title="내 소속" onClose={onClose}>
      {!typing ? (
        <>
          <input type="search" autoFocus placeholder="활터 이름이나 지역 (예: 황학정, 수원)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="소속 활터 검색" />
          {!file && !failed && <div className="small muted">활터 목록을 불러오는 중…</div>}
          {file && q.trim() && hits.length === 0 && <div className="small muted">찾는 활터가 없습니다.</div>}
          {hits.length > 0 && (
            <ol className="hw-list club-hits">
              {hits.map((h) => (
                <li key={h.id} className="hw-row">
                  <button className="hw-head" onClick={() => setClub({ name: h.name, region: h.region, address: h.address, hwalterId: h.id }).then(() => done(`${h.name}을(를) 내 소속으로 정했습니다`))}>
                    <span className="hw-main"><b>{h.name}</b><span className="small muted">{h.address}</span></span>
                    {h.region && <span className="hw-region">{h.region}</span>}
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button className="btn ghost small" onClick={() => { setTyping(true); setName(q.trim()); }}>목록에 없어요, 직접 적을게요</button>
        </>
      ) : (
        <form className="field" onSubmit={(e) => { e.preventDefault(); if (name.trim()) setClub({ name: name.trim() }).then(() => done('내 소속을 정했습니다')); }}>
          <label htmlFor="clubName">소속 활터 이름</label>
          {failed && <div className="small muted">활터 목록을 불러오지 못해 직접 적습니다.</div>}
          <input id="clubName" type="text" autoFocus maxLength={20} placeholder="예: 황학정" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" type="submit" disabled={!name.trim()}>저장</button>
          {!failed && <button className="btn ghost small" type="button" onClick={() => setTyping(false)}>목록에서 찾기</button>}
        </form>
      )}
    </Sheet>
  );
}
