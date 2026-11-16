import Dexie, { type Table } from 'dexie';
import type { DayNote, End, Gear, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { Repository } from './repository';

class SisuDb extends Dexie {
  gear!: Table<Gear, string>;
  ends!: Table<End, string>;
  kv!: Table<{ key: string; value: unknown }, string>;
  days!: Table<DayNote, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      gear: 'id, category, archived',
      ends: 'id, date, bowId, ringId, arrowId',
      kv: 'key',
    });
    // 2: 하루 메모
    this.version(2).stores({ days: 'date' });
  }
}

export class IndexedDbRepository implements Repository {
  private db: SisuDb;

  constructor(name = 'sisu-note') {
    this.db = new SisuDb(name);
  }

  async loadAll() {
    const [gear, ends, days, s] = await Promise.all([
      this.db.gear.toArray(),
      this.db.ends.orderBy('date').toArray(),
      this.db.days.toArray(),
      this.db.kv.get('settings'),
    ]);
    const settings = { ...DEFAULT_SETTINGS, ...((s?.value as Partial<Settings>) ?? {}) };
    return { gear, ends, days, settings };
  }

  async putGear(g: Gear) {
    await this.db.gear.put(g);
  }

  async deleteGear(id: string) {
    await this.db.transaction('rw', this.db.gear, this.db.ends, async () => {
      await this.db.gear.delete(id);
      await this.db.ends.toCollection().modify((e) => {
        if (e.bowId === id) e.bowId = null;
        if (e.ringId === id) e.ringId = null;
        if (e.arrowId === id) e.arrowId = null;
        if (e.stringId === id) e.stringId = null;
      });
    });
  }

  async putEnd(e: End) {
    await this.db.ends.put(e);
  }

  async deleteEnd(id: string) {
    await this.db.ends.delete(id);
  }

  async putDay(d: DayNote) {
    if (d.memo.trim() || d.draft?.trim()) await this.db.days.put(d);
    else await this.db.days.delete(d.date);
  }

  async saveSettings(s: Settings) {
    await this.db.kv.put({ key: 'settings', value: s });
  }

  async replaceAll(data: { gear: Gear[]; ends: End[]; days?: DayNote[] }) {
    await this.db.transaction('rw', this.db.gear, this.db.ends, this.db.days, async () => {
      await this.db.gear.clear();
      await this.db.ends.clear();
      await this.db.gear.bulkPut(data.gear);
      await this.db.ends.bulkPut(data.ends);
      if (data.days) {
        await this.db.days.clear();
        await this.db.days.bulkPut(data.days);
      }
    });
  }
}
