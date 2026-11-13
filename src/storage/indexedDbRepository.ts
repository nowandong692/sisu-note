import Dexie, { type Table } from 'dexie';
import type { End, Gear, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { Repository } from './repository';

class SisuDb extends Dexie {
  gear!: Table<Gear, string>;
  ends!: Table<End, string>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      gear: 'id, category, archived',
      ends: 'id, date, bowId, ringId, arrowId',
      kv: 'key',
    });
  }
}

export class IndexedDbRepository implements Repository {
  private db: SisuDb;

  constructor(name = 'sisu-note') {
    this.db = new SisuDb(name);
  }

  async loadAll() {
    const [gear, ends, s] = await Promise.all([
      this.db.gear.toArray(),
      this.db.ends.orderBy('date').toArray(),
      this.db.kv.get('settings'),
    ]);
    const settings = { ...DEFAULT_SETTINGS, ...((s?.value as Partial<Settings>) ?? {}) };
    return { gear, ends, settings };
  }

  async putGear(g: Gear) {
    await this.db.gear.put(g);
  }

  async putEnd(e: End) {
    await this.db.ends.put(e);
  }

  async deleteEnd(id: string) {
    await this.db.ends.delete(id);
  }

  async saveSettings(s: Settings) {
    await this.db.kv.put({ key: 'settings', value: s });
  }

  async replaceAll(data: { gear: Gear[]; ends: End[] }) {
    await this.db.transaction('rw', this.db.gear, this.db.ends, async () => {
      await this.db.gear.clear();
      await this.db.ends.clear();
      await this.db.gear.bulkPut(data.gear);
      await this.db.ends.bulkPut(data.ends);
    });
  }
}
