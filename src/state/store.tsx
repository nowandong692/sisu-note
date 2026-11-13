import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { End, Gear, GearCategory, Settings, Weather } from '../domain/types';
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
  saveEnd(e: Omit<End, 'id' | 'date' | 'recordedAt' | 'updatedAt' | 'bowId' | 'ringId' | 'arrowId' | 'weather'>): Promise<End>;
  /** 오늘 날씨 (다른 날 입력한 것이면 null) */
  todayWeather: Weather | null;
  /** 이미 저장한 순 고치기 (시, 태그, 메모) */
  updateEnd(e: End): Promise<void>;
  deleteEnd(id: string): Promise<void>;
  /** 습사 화면에 불러와 고치는 중인 순 */
  editId: string | null;
  setEditId(id: string | null): void;
  addGear(g: Pick<Gear, 'category' | 'nickname' | 'bowType' | 'detail'>): Promise<Gear>;
  setArchived(id: string, archived: boolean): Promise<void>;
  /** 별명, 구분, 상세 고치기 */
  updateGear(g: Gear): Promise<void>;
  /** 장비 삭제. 그 장비를 쓴 기록은 남고 장비만 "미지정"이 된다. */
  deleteGear(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  loadSample(): Promise<void>;
  clearAll(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ repo, children }: { repo: Repository; children: ReactNode }) {
  const [data, setData] = useState<Data>({ loaded: false, error: null, gear: [], ends: [], settings: DEFAULT_SETTINGS });

  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    repo.loadAll()
      .then((d) => { settingsRef.current = d.settings; setData({ loaded: true, error: null, ...d }); })
      .catch(() => setData((p) => ({ ...p, loaded: true, error: '기기 저장소를 열 수 없습니다. 비공개 창이면 일반 창에서 열어 주세요.' })));
  }, [repo]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next: Settings = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setData((p) => ({ ...p, settings: next }));
    await repo.saveSettings(next);
  }, [repo]);

  const w = data.settings.weather;
  const todayWeather = useMemo<Weather | null>(
    () => (w && w.date === today() && hasWeather(w) ? { sky: w.sky, temp: w.temp, wind: w.wind, windDir: w.windDir, windSpeed: w.windSpeed ?? null, windFrom: w.windFrom ?? null } : null), [w]);

  const store = useMemo<Store>(() => ({
    ...data,
    todayWeather,
    gearOf: (c, includeArchived = false) => data.gear.filter((g) => g.category === c && (includeArchived || !g.archived)),
    gearName: (id) => data.gear.find((g) => g.id === id)?.nickname ?? '미지정',
    async saveEnd(input) {
      const now = Date.now();
      const e: End = { ...input, id: newId(), date: today(), recordedAt: now, updatedAt: now,
        bowId: data.settings.current.bow, ringId: data.settings.current.ring, arrowId: data.settings.current.arrow, weather: todayWeather };
      await repo.putEnd(e);
      setData((p) => ({ ...p, ends: [...p.ends, e] }));
      return e;
    },
    async updateEnd(e) {
      const next = { ...e, updatedAt: Date.now() };
      await repo.putEnd(next);
      setData((p) => ({ ...p, ends: p.ends.map((x) => (x.id === e.id ? next : x)) }));
    },
    editId,
    setEditId,
    async deleteEnd(id) {
      if (id === editId) setEditId(null);
      await repo.deleteEnd(id);
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
        ends: p.ends.map((e) => (e.bowId === id || e.ringId === id || e.arrowId === id
          ? { ...e, bowId: clear(e.bowId), ringId: clear(e.ringId), arrowId: clear(e.arrowId) } : e)),
      }));
      const cur = data.settings.current;
      if (cur[g.category] === id) {
        const other = data.gear.find((x) => x.category === g.category && !x.archived && x.id !== id);
        await updateSettings({ current: { ...cur, [g.category]: other?.id ?? null } });
      }
    },
    updateSettings,
    async loadSample() {
      const d = sampleData();
      await repo.replaceAll(d);
      setData((p) => ({ ...p, ...d }));
      await updateSettings({ hand: 'right', current: { bow: 'sample-b1', ring: 'sample-r1', arrow: 'sample-a1' } });
    },
    async clearAll() {
      await repo.replaceAll({ gear: [], ends: [] });
      setData((p) => ({ ...p, gear: [], ends: [] }));
      await updateSettings({ current: { bow: null, ring: null, arrow: null } });
    },
  }), [data, repo, updateSettings, todayWeather, editId]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
