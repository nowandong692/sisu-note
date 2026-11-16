import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { IndexedDbRepository } from './indexedDbRepository';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { End, Gear } from '../domain/types';

const gear: Gear = { id: 'g1', category: 'bow', nickname: '검은 활', startedOn: '2026-11-01', archived: false, updatedAt: 1 };
const end: End = { id: 'e1', date: '2026-11-12', recordedAt: 1, bowId: 'g1', ringId: null, arrowId: null, shots: [], tags: ['줌손'], memo: '메모', updatedAt: 1 };

describe('IndexedDB 저장소', () => {
  it('처음에는 비어 있고 기본 설정을 돌려준다', async () => {
    const repo = new IndexedDbRepository('t-empty');
    expect(await repo.loadAll()).toEqual({ gear: [], ends: [], days: [], settings: DEFAULT_SETTINGS });
  });

  it('장비, 순, 설정을 저장하고 다시 읽는다', async () => {
    const repo = new IndexedDbRepository('t-roundtrip');
    await repo.putGear(gear);
    await repo.putEnd(end);
    await repo.saveSettings({ ...DEFAULT_SETTINGS, hand: 'left', grid: true });
    const again = await new IndexedDbRepository('t-roundtrip').loadAll();
    expect(again.gear).toEqual([gear]);
    expect(again.ends).toEqual([end]);
    expect(again.settings.hand).toBe('left');
    await repo.deleteEnd('e1');
    expect((await repo.loadAll()).ends).toEqual([]);
  });

  it('장비를 지우면 그 장비를 쓴 기록은 남고 장비만 비운다', async () => {
    const repo = new IndexedDbRepository('t-delgear');
    await repo.putGear(gear);
    await repo.putEnd(end);
    await repo.putEnd({ ...end, id: 'e2', bowId: 'g2', ringId: 'g1' });
    await repo.deleteGear('g1');
    const d = await repo.loadAll();
    expect(d.gear).toEqual([]);
    expect(d.ends.map((e) => [e.id, e.bowId, e.ringId])).toEqual([['e1', null, null], ['e2', 'g2', null]]);
  });

  it('replaceAll은 기존 기록을 모두 바꾼다', async () => {
    const repo = new IndexedDbRepository('t-replace');
    await repo.putEnd(end);
    await repo.replaceAll({ gear: [gear], ends: [] });
    const d = await repo.loadAll();
    expect(d.ends).toEqual([]);
    expect(d.gear).toEqual([gear]);
  });

  it('하루 메모를 저장하고, 비우면 지우고, replaceAll에 days를 주면 함께 바꾼다', async () => {
    const repo = new IndexedDbRepository('t-days');
    await repo.putDay({ date: '2026-11-12', memo: '사범님: 줌손 더 밀기', updatedAt: 1 });
    await repo.putDay({ date: '2026-11-13', memo: '바람 셌음', updatedAt: 2 });
    expect((await repo.loadAll()).days.map((d) => d.date)).toEqual(['2026-11-12', '2026-11-13']);
    await repo.putDay({ date: '2026-11-12', memo: '  ', updatedAt: 3 });
    expect((await repo.loadAll()).days.map((d) => d.date)).toEqual(['2026-11-13']);
    await repo.replaceAll({ gear: [], ends: [] });
    expect((await repo.loadAll()).days).toHaveLength(1);
    await repo.replaceAll({ gear: [], ends: [], days: [] });
    expect((await repo.loadAll()).days).toEqual([]);
  });

  it('메모가 비어도 공개 확인 전 초안이 있으면 남긴다', async () => {
    const repo = new IndexedDbRepository('t-draft');
    await repo.putDay({ date: '2026-11-16', memo: '', share: 'all', draft: '아직 확인 전', updatedAt: 1 });
    expect((await repo.loadAll()).days).toEqual([{ date: '2026-11-16', memo: '', share: 'all', draft: '아직 확인 전', updatedAt: 1 }]);
    await repo.putDay({ date: '2026-11-16', memo: '', share: 'all', updatedAt: 2 });
    expect((await repo.loadAll()).days).toEqual([]);
  });

  it('하루 메모가 없던 예전 저장소도 그대로 열린다', async () => {
    const old = new Dexie('t-upgrade');
    old.version(1).stores({ gear: 'id, category, archived', ends: 'id, date, bowId, ringId, arrowId', kv: 'key' });
    await old.table('ends').put(end);
    old.close();
    const d = await new IndexedDbRepository('t-upgrade').loadAll();
    expect(d.ends).toEqual([end]);
    expect(d.days).toEqual([]);
  });
});
