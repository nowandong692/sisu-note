import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Club, End, Gear, GearCategory, OnlineProfile, Range, Settings, Weather } from '../domain/types';
import { OnlineError, newRecoveryCode, normalizeRecoveryCode, onlineAvailable, rpc } from '../platform/online';
import { RANGE_RADIUS_M, migrateRanges, nearestRange, pickOffer, type LatLon, type RangeOffer } from '../domain/range';
import { kakaoNearbyRanges } from '../platform/kakaoPlaces';
import { DEFAULT_SETTINGS } from '../domain/types';
import { sampleData } from '../domain/sample';
import { hasWeather } from '../domain/weather';
import { newId, today } from '../domain/util';
import type { Repository } from '../storage/repository';

interface Data {
  loaded: boolean;
  error: string | null;
  gear: Gear[];
  ends: End[];
  settings: Settings;
}

export interface Store extends Data {
  gearOf(c: GearCategory, includeArchived?: boolean): Gear[];
  gearName(id: string | null): string;
  saveEnd(e: Omit<End, 'id' | 'date' | 'recordedAt' | 'updatedAt' | 'bowId' | 'ringId' | 'arrowId' | 'stringId' | 'weather' | 'rangeId'>): Promise<End>;
  /** 등록한 활터 */
  ranges: Range[];
  rangeName(id: string | null | undefined): string;
  /** 지금 활터 (없으면 null) */
  currentRange: Range | null;
  addRange(r: Omit<Range, 'id'>): Promise<Range>;
  updateRange(r: Range): Promise<void>;
  deleteRange(id: string): Promise<void>;
  /** 직접 활터 고르기 (null이면 활터 없이) */
  chooseRange(id: string | null): Promise<void>;
  /** 마지막 GPS 위치가 등록된 활터 근처가 아니면 그 위치 (새 활터 등록 제안용) */
  unknownSpot: LatLon | null;
  setUnknownSpot(p: LatLon | null): void;
  /** 휴대폰 위치를 알게 됐을 때: 근처에 지금 활터와 다른 국궁장이 있으면 바꿀지 묻는다 */
  noticePosition(p: LatLon): void;
  /** 바꾸자고 물어보는 중인 활터 */
  rangeOffer: RangeOffer | null;
  /** 물어본 활터로 바꾸기 (등록하지 않은 곳이면 등록하고 바꾼다) */
  acceptOffer(): Promise<void>;
  /** 그대로 두기. 같은 곳은 다시 묻지 않는다. */
  dismissOffer(): void;
  /** 오늘 날씨 (다른 날 입력한 것이면 null) */
  todayWeather: Weather | null;
  /** 이미 저장한 순 고치기 (시, 태그, 메모) */
  updateEnd(e: End): Promise<void>;
  deleteEnd(id: string): Promise<void>;
  /** 습사 화면에 불러와 고치는 중인 순 */
  editId: string | null;
  setEditId(id: string | null): void;
  /** 습사 화면이 고치는 중인 순을 저장하는 방법 (다른 탭으로 갈 때 "저장하고 이동"에 쓴다) */
  editSaver: { current: { canSave: boolean; save(): Promise<void> } | null };
  addGear(g: Pick<Gear, 'category' | 'nickname' | 'bowType' | 'stringType' | 'thickness' | 'detail'>): Promise<Gear>;
  setArchived(id: string, archived: boolean): Promise<void>;
  /** 별명, 구분, 상세 고치기 */
  updateGear(g: Gear): Promise<void>;
  /** 장비 삭제. 그 장비를 쓴 기록은 남고 장비만 "미지정"이 된다. */
  deleteGear(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  /** 온라인 랭킹 참여 정보 (참여하지 않았으면 null) */
  online: OnlineProfile | null;
  /** 서버에 올리지 못한 일이 있으면 그 수 */
  onlinePending: number;
  /** 새로 참여: 복구 코드를 만들고 닉네임을 등록한다 */
  joinOnline(nickname: string, rangeName: string | null): Promise<void>;
  /** 다른 기기에서 쓰던 복구 코드로 이어 하기 */
  restoreOnline(code: string): Promise<void>;
  setOnlineProfile(nickname: string, rangeName: string | null): Promise<void>;
  /** 내 소속을 바꾼다. 랭킹에 참여 중이면 서버 프로필의 활터도 소속으로 바꾼다 */
  setClub(club: Club | null): Promise<void>;
  /** 참여 그만두기: 서버의 내 기록을 모두 지운다 */
  leaveOnline(): Promise<void>;
  loadSample(): Promise<void>;
  clearAll(): Promise<void>;
  /** 오늘 저장한 순을 모두 지운다 (랭킹에 올린 오늘 순도 지운다). 지운 순 수를 돌려준다. */
  clearToday(): Promise<number>;
}

const Ctx = createContext<Store | null>(null);

const offerKey = (o: RangeOffer) => ('range' in o ? o.range.id : `${o.place.name}|${o.place.lat.toFixed(3)}|${o.place.lon.toFixed(3)}`);

export function StoreProvider({ repo, children }: { repo: Repository; children: ReactNode }) {
  const [data, setData] = useState<Data>({ loaded: false, error: null, gear: [], ends: [], settings: DEFAULT_SETTINGS });

  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const [editId, setEditId] = useState<string | null>(null);
  const editSaver = useRef<{ canSave: boolean; save(): Promise<void> } | null>(null);
  const [unknownSpot, setUnknownSpot] = useState<LatLon | null>(null);
  const [rangeOffer, setRangeOffer] = useState<RangeOffer | null>(null);
  const declined = useRef(new Set<string>());

  const noticePosition = useCallback(async (pos: LatLon) => {
    const s = settingsRef.current;
    const ranges = s.ranges ?? [];
    const near = nearestRange(ranges, pos);
    setUnknownSpot(near ? null : pos);
    // 등록한 활터 근처가 아니면 지도에서 300m 안의 국궁장을 찾아본다
    const found = near ? [] : ((await kakaoNearbyRanges(pos.lat, pos.lon, RANGE_RADIUS_M).catch(() => null)) ?? []);
    const offer = pickOffer(ranges, settingsRef.current.currentRange, pos, found);
    setRangeOffer(offer && !declined.current.has(offerKey(offer)) ? offer : null);
  }, []);

  useEffect(() => {
    repo.loadAll()
      .then((d) => { const settings = migrateRanges(d.settings); settingsRef.current = settings; setData({ loaded: true, error: null, ...d, settings }); })
      .catch(() => setData((p) => ({ ...p, loaded: true, error: '기기 저장소를 열 수 없습니다. 비공개 창이면 일반 창에서 열어 주세요.' })));
  }, [repo]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next: Settings = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setData((p) => ({ ...p, settings: next }));
    await repo.saveSettings(next);
  }, [repo]);

  const endsRef = useRef<End[]>([]);
  endsRef.current = data.ends;
  const flushing = useRef(false);

  /** 모아 둔 일을 서버에 올린다. 인터넷이 없으면 그대로 두고 다음에 다시 한다. */
  const flushOnline = useCallback(async () => {
    if (flushing.current || !onlineAvailable()) return;
    flushing.current = true;
    try {
      for (;;) {
        const o = settingsRef.current.online;
        const job = o?.queue[0];
        if (!o || !job) return;
        try {
          if (job.op === 'del') await rpc('delete_end', { p_key: o.key, p_client_id: job.id });
          else {
            const e = endsRef.current.find((x) => x.id === job.id);
            if (e) {
              const args = { p_key: o.key, p_client_id: e.id, p_hits: e.shots.map((s) => s.hit) };
              // 저장 시각(습사 시간용)을 함께 보낸다. 서버를 아직 고치지 않았으면 시각 없이 다시 보낸다.
              await rpc('submit_end', { ...args, p_recorded_at: new Date(e.recordedAt).toISOString() })
                .catch((err) => { if (err instanceof OnlineError && err.code === 'server') return rpc('submit_end', args); throw err; });
            }
          }
        } catch (err) {
          if (err instanceof OnlineError && err.code === 'network') return;
          // 한도 초과, 서버가 거절한 일은 다시 해도 같으므로 버린다
        }
        const cur = settingsRef.current.online;
        if (cur) await updateSettings({ online: { ...cur, queue: cur.queue.filter((q) => q !== job) } });
      }
    } finally {
      flushing.current = false;
    }
  }, [updateSettings]);

  /** 참여 뒤 오늘 저장·고치기·삭제한 순만 랭킹에 올린다. 지난 날짜 순은 서버가 받지 않는다. */
  const enqueue = useCallback(async (op: 'put' | 'del', e: Pick<End, 'id' | 'date' | 'recordedAt'>) => {
    const o = settingsRef.current.online;
    if (!o || e.date !== today() || e.recordedAt < o.joinedAt) return;
    await updateSettings({ online: { ...o, queue: [...o.queue.filter((q) => q.id !== e.id), { op, id: e.id }] } });
    void flushOnline();
  }, [updateSettings, flushOnline]);

  useEffect(() => {
    if (!data.loaded) return;
    void flushOnline();
    const on = () => void flushOnline();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [data.loaded, flushOnline]);

  const w = data.settings.weather;
  const todayWeather = useMemo<Weather | null>(
    () => (w && w.date === today() && hasWeather(w) ? { sky: w.sky, temp: w.temp, wind: w.wind, windDir: w.windDir, windSpeed: w.windSpeed ?? null, windFrom: w.windFrom ?? null } : null), [w]);

  const ranges = useMemo(() => data.settings.ranges ?? [], [data.settings.ranges]);

  const store = useMemo<Store>(() => ({
    ...data,
    todayWeather,
    ranges,
    rangeName: (id) => (id ? ranges.find((r) => r.id === id)?.name ?? '지운 활터' : '활터 미지정'),
    currentRange: ranges.find((r) => r.id === data.settings.currentRange) ?? null,
    async addRange(input) {
      const r: Range = { ...input, id: newId() };
      await updateSettings({ ranges: [...ranges, r], currentRange: r.id, currentRangeManual: false });
      setUnknownSpot(null);
      return r;
    },
    async updateRange(r) {
      await updateSettings({ ranges: ranges.map((x) => (x.id === r.id ? r : x)) });
    },
    async deleteRange(id) {
      const cur = data.settings.currentRange;
      await updateSettings({ ranges: ranges.filter((x) => x.id !== id), ...(cur === id ? { currentRange: null, currentRangeManual: false } : {}) });
    },
    async chooseRange(id) {
      setRangeOffer(null);
      await updateSettings({ currentRange: id, currentRangeManual: true });
    },
    unknownSpot,
    setUnknownSpot,
    noticePosition: (p) => { void noticePosition(p); },
    rangeOffer,
    async acceptOffer() {
      const o = rangeOffer;
      if (!o) return;
      setRangeOffer(null);
      if ('range' in o) await updateSettings({ currentRange: o.range.id, currentRangeManual: false });
      else {
        const r: Range = { name: o.place.name, lat: o.place.lat, lon: o.place.lon, bearing: null, id: newId() };
        await updateSettings({ ranges: [...ranges, r], currentRange: r.id, currentRangeManual: false });
        setUnknownSpot(null);
      }
    },
    dismissOffer() {
      if (rangeOffer) declined.current.add(offerKey(rangeOffer));
      setRangeOffer(null);
    },
    gearOf: (c, includeArchived = false) => data.gear.filter((g) => g.category === c && (includeArchived || !g.archived)),
    gearName: (id) => data.gear.find((g) => g.id === id)?.nickname ?? '미지정',
    async saveEnd(input) {
      const now = Date.now();
      const e: End = { ...input, id: newId(), date: today(), recordedAt: now, updatedAt: now,
        bowId: data.settings.current.bow, ringId: data.settings.current.ring, arrowId: data.settings.current.arrow, stringId: data.settings.current.string ?? null, weather: todayWeather,
        rangeId: data.settings.currentRange ?? null };
      await repo.putEnd(e);
      setData((p) => ({ ...p, ends: [...p.ends, e] }));
      endsRef.current = [...endsRef.current, e];
      void enqueue('put', e);
      return e;
    },
    async updateEnd(e) {
      const next = { ...e, updatedAt: Date.now() };
      await repo.putEnd(next);
      setData((p) => ({ ...p, ends: p.ends.map((x) => (x.id === e.id ? next : x)) }));
      endsRef.current = endsRef.current.map((x) => (x.id === e.id ? next : x));
      void enqueue('put', next);
    },
    editId,
    setEditId,
    editSaver,
    async deleteEnd(id) {
      if (id === editId) setEditId(null);
      const gone = data.ends.find((e) => e.id === id);
      await repo.deleteEnd(id);
      if (gone) void enqueue('del', gone);
      setData((p) => ({ ...p, ends: p.ends.filter((e) => e.id !== id) }));
    },
    async addGear(input) {
      const g: Gear = { ...input, id: newId(), startedOn: today(), archived: false, updatedAt: Date.now() };
      await repo.putGear(g);
      setData((p) => ({ ...p, gear: [...p.gear, g] }));
      const cur = data.settings.current;
      const key = input.category;
      if (!cur[key] || !data.gear.some((x) => x.id === cur[key] && !x.archived)) {
        await updateSettings({ current: { ...cur, [key]: g.id } });
      }
      return g;
    },
    async setArchived(id, archived) {
      const g = data.gear.find((x) => x.id === id);
      if (!g) return;
      const next = { ...g, archived, updatedAt: Date.now() };
      await repo.putGear(next);
      setData((p) => ({ ...p, gear: p.gear.map((x) => (x.id === id ? next : x)) }));
      const cur = data.settings.current;
      if (archived && cur[g.category] === id) {
        const other = data.gear.find((x) => x.category === g.category && !x.archived && x.id !== id);
        await updateSettings({ current: { ...cur, [g.category]: other?.id ?? null } });
      }
    },
    async updateGear(g) {
      const next = { ...g, updatedAt: Date.now() };
      await repo.putGear(next);
      setData((p) => ({ ...p, gear: p.gear.map((x) => (x.id === g.id ? next : x)) }));
    },
    async deleteGear(id) {
      const g = data.gear.find((x) => x.id === id);
      if (!g) return;
      await repo.deleteGear(id);
      const clear = (v: string | null) => (v === id ? null : v);
      setData((p) => ({
        ...p,
        gear: p.gear.filter((x) => x.id !== id),
        ends: p.ends.map((e) => (e.bowId === id || e.ringId === id || e.arrowId === id || e.stringId === id
          ? { ...e, bowId: clear(e.bowId), ringId: clear(e.ringId), arrowId: clear(e.arrowId), stringId: clear(e.stringId ?? null) } : e)),
      }));
      const cur = data.settings.current;
      if (cur[g.category] === id) {
        const other = data.gear.find((x) => x.category === g.category && !x.archived && x.id !== id);
        await updateSettings({ current: { ...cur, [g.category]: other?.id ?? null } });
      }
    },
    updateSettings,
    async loadSample() {
      const { gear, ends, ranges: sampleRanges } = sampleData();
      await repo.replaceAll({ gear, ends });
      setData((p) => ({ ...p, gear, ends }));
      await updateSettings({ hand: 'right', current: { bow: 'sample-b1', ring: 'sample-r1', arrow: 'sample-a1', string: 'sample-s1' }, ranges: sampleRanges, currentRange: 'sample-g1', currentRangeManual: true });
    },
    online: data.settings.online ?? null,
    onlinePending: data.settings.online?.queue.length ?? 0,
    async joinOnline(nickname, rangeName) {
      const key = newRecoveryCode();
      await rpc('register', { p_key: key, p_nickname: nickname.trim() });
      if (rangeName) await rpc('set_profile', { p_key: key, p_nickname: nickname.trim(), p_range_name: rangeName });
      await updateSettings({ online: { key, nickname: nickname.trim(), rangeName, joinedAt: Date.now(), queue: [] } });
    },
    async restoreOnline(code) {
      const key = normalizeRecoveryCode(code);
      const rows = await rpc<{ nickname: string; range_name: string | null }[]>('whoami', { p_key: key });
      if (!rows?.length) throw new OnlineError('복구 코드가 맞지 않습니다.', 'unknown-key');
      await updateSettings({
        online: { key, nickname: rows[0].nickname, rangeName: rows[0].range_name, joinedAt: Date.now(), queue: [] },
        // 다른 기기에서 쓰던 소속을 이어받는다 (이 기기에 소속이 없을 때만)
        ...(!data.settings.club && rows[0].range_name ? { club: { name: rows[0].range_name } } : {}),
      });
    },
    async setOnlineProfile(nickname, rangeName) {
      const o = data.settings.online;
      if (!o) return;
      await rpc('set_profile', { p_key: o.key, p_nickname: nickname.trim(), p_range_name: rangeName ?? '' });
      await updateSettings({ online: { ...o, nickname: nickname.trim(), rangeName } });
    },
    async setClub(club) {
      await updateSettings({ club });
      const o = data.settings.online;
      if (!o || (o.rangeName ?? null) === (club?.name ?? null)) return;
      await rpc('set_profile', { p_key: o.key, p_nickname: o.nickname, p_range_name: club?.name ?? '' });
      await updateSettings({ online: { ...o, rangeName: club?.name ?? null } });
    },
    async leaveOnline() {
      const o = data.settings.online;
      if (!o) return;
      await rpc('delete_me', { p_key: o.key });
      await updateSettings({ online: null });
    },
    async clearToday() {
      const gone = data.ends.filter((e) => e.date === today());
      if (editId && gone.some((e) => e.id === editId)) setEditId(null);
      for (const e of gone) await repo.deleteEnd(e.id);
      const ids = new Set(gone.map((e) => e.id));
      setData((p) => ({ ...p, ends: p.ends.filter((e) => !ids.has(e.id)) }));
      endsRef.current = endsRef.current.filter((e) => !ids.has(e.id));
      for (const e of gone) await enqueue('del', e);
      return gone.length;
    },
    async clearAll() {
      await repo.replaceAll({ gear: [], ends: [] });
      setData((p) => ({ ...p, gear: [], ends: [] }));
      await updateSettings({ current: { bow: null, ring: null, arrow: null } });
    },
  }), [data, repo, updateSettings, todayWeather, editId, ranges, unknownSpot, rangeOffer, noticePosition, enqueue]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
