import { useEffect, useMemo, useState } from 'react';
import { AREAS, HWALTER_SOURCE, contactUrl, isMyClub, mapLinks, searchHwalter, type Hwalter, type HwalterFile } from '../domain/hwalter';
import { loadHwalter } from '../platform/hwalterData';
import { toast } from '../components/ui';
import { isMyRange } from '../domain/tournaments';
import { useStore } from '../state/store';

const PAGE = 40;

function Row({ h, mine, club, open, onToggle, onClub }: { h: Hwalter; mine: boolean; club: boolean; open: boolean; onToggle: () => void; onClub: () => void }) {
  const map = mapLinks(h);
  return (
    <li className={`hw-row ${mine ? 'mine' : ''}`}>
      <button className="hw-head" aria-expanded={open} onClick={onToggle}>
        <span className="hw-main">
          <b>{h.name}{club ? <span className="pill best">내 소속</span> : mine && <span className="pill best">내 활터</span>}</b>
          <span className="small muted">{h.address}</span>
        </span>
        {h.region && <span className="hw-region">{h.region}</span>}
      </button>
      {open && (
        <div className="hw-actions">
          <a className="btn small ghost" href={map.naver} target="_blank" rel="noopener noreferrer">네이버 지도</a>
          <a className="btn small ghost" href={map.kakao} target="_blank" rel="noopener noreferrer">카카오맵</a>
          <a className="btn small ghost" href={contactUrl(h)} target="_blank" rel="noopener noreferrer">연락처 (협회)</a>
          {!club && <button className="btn small ghost" onClick={onClub}>내 소속으로</button>}
        </div>
      )}
    </li>
  );
}

/** 협회에 등록된 활터를 이름·주소로 찾아보기 */
export function HwalterView({ active }: { active: boolean }) {
  const { ranges, settings, setClub } = useStore();
  const club = settings.club ?? null;
  const [file, setFile] = useState<HwalterFile | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    if (!active || file) return;
    loadHwalter().then(setFile, () => setErr(true));
  }, [active, file]);
  useEffect(() => { setLimit(PAGE); }, [q, region]);

  const names = ranges.map((r) => r.name);
  const items = file?.items;
  const regions = useMemo(() => AREAS.filter((a) => items?.some((h) => h.region === a)), [items]);
  const hits = useMemo(() => {
    const list = searchHwalter(items ?? [], q, region);
    // 내 소속과 내 활터를 맨 위로
    const top = (h: Hwalter) => isMyClub(h, club) || isMyRange(h.name, names);
    return [...list.filter(top), ...list.filter((h) => !top(h))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, region, names.join('|'), club]);

  if (err) {
    return (
      <section className="card">
        <h2>활터 찾기</h2>
        <div className="empty small">활터 목록을 불러오지 못했습니다. 인터넷 연결을 확인하거나 <a href={HWALTER_SOURCE} target="_blank" rel="noopener noreferrer">대한궁도협회 활터현황</a>에서 직접 보세요.</div>
      </section>
    );
  }
  if (!file) return <section className="card"><h2>활터 찾기</h2><div className="empty small">불러오는 중…</div></section>;

  const updated = file.fetchedAt ? new Date(file.fetchedAt) : null;
  return (
    <>
      <section className="card">
        <div className="row between"><h2>활터 찾기</h2><span className="small muted">{file.items.length}곳</span></div>
        <input type="search" placeholder="활터 이름이나 지역 (예: 황학정, 수원)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="활터 검색" />
        <div className="chips hw-regions" role="group" aria-label="지역">
          <button className={`chip ${region === null ? 'on' : ''}`} aria-pressed={region === null} onClick={() => setRegion(null)}>전체</button>
          {regions.map((r) => (
            <button key={r} className={`chip ${region === r ? 'on' : ''}`} aria-pressed={region === r} onClick={() => setRegion(region === r ? null : r)}>{r}</button>
          ))}
        </div>
        <div className="small muted">{hits.length}곳{(q || region) && ' 찾음'}. 활터를 누르면 지도와 연락처가 나옵니다.</div>
        {hits.length === 0
          ? <div className="empty small">찾는 활터가 없습니다. 이름 일부만 넣어 보세요.</div>
          : <ol className="hw-list">{hits.slice(0, limit).map((h) => <Row key={h.id} h={h} mine={isMyRange(h.name, names)} club={isMyClub(h, club)} open={open === h.id} onToggle={() => setOpen(open === h.id ? null : h.id)}
            onClub={() => setClub({ name: h.name, region: h.region, address: h.address, hwalterId: h.id }).then(() => toast(`${h.name}을(를) 내 소속으로 정했습니다`))} />)}</ol>}
        {hits.length > limit && <button className="btn ghost small" style={{ alignSelf: 'center' }} onClick={() => setLimit(limit + PAGE)}>{Math.min(PAGE, hits.length - limit)}곳 더 보기</button>}
      </section>
      <div className="small muted tour-note">
        출처: <a href={file.source ?? HWALTER_SOURCE} target="_blank" rel="noopener noreferrer">대한궁도협회 활터현황</a>. 협회에 등록된 활터만 나옵니다.
        {updated && ` ${updated.getMonth() + 1}월 ${updated.getDate()}일에 받아 온 목록입니다.`}
        {' '}사두와 전화번호는 이 앱에 옮기지 않고, 연락처 버튼으로 협회 페이지를 엽니다.
      </div>
    </>
  );
}
