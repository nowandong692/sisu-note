import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbRepository } from './indexedDbRepository';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { End, Gear } from '../domain/types';

const gear: Gear = { id: 'g1', category: 'bow', nickname: '검은 활', startedOn: '2026-11-01', archived: false, updatedAt: 1 };
const end: End = { id: 'e1', date: '2026-11-12', recordedAt: 1, bowId: 'g1', ringId: null, arrowId: null, shots: [], tags: ['줌손'], memo: '메모', updatedAt: 1 };

describe('IndexedDB 저장소', () => {
  it('처음에는 비어 있고 기본 설정을 돌려준다', async () => {
    const repo = new IndexedDbRepository('t-empty');
    expect(await repo.loadAll()).toEqual({ gear: [], ends: [], settings: DEFAULT_SETTINGS });
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

  it('replaceAll은 기존 기록을 모두 바꾼다', async () => {
    const repo = new IndexedDbRepository('t-replace');
    await repo.putEnd(end);
    await repo.replaceAll({ gear: [gear], ends: [] });
    const d = await repo.loadAll();
    expect(d.ends).toEqual([]);
    expect(d.gear).toEqual([gear]);
  });
});
