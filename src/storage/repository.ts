import type { DayNote, End, Gear, Settings } from '../domain/types';

/**
 * 앱이 데이터를 읽고 쓰는 유일한 통로.
 * 웹(PWA)에서는 IndexedDB 구현을 쓰고, 나중에 Capacitor 앱에서는
 * 같은 인터페이스의 SQLite 구현으로 바꿔 끼운다 (iOS는 웹 저장소를 지울 수 있음).
 */
export interface Repository {
  loadAll(): Promise<{ gear: Gear[]; ends: End[]; days: DayNote[]; settings: Settings }>;
  putGear(g: Gear): Promise<void>;
  /** 장비를 지우고, 그 장비를 쓴 기록에서는 장비를 "미지정"(null)으로 바꾼다 */
  deleteGear(id: string): Promise<void>;
  putEnd(e: End): Promise<void>;
  deleteEnd(id: string): Promise<void>;
  /** 하루 메모 저장. 메모가 비었으면 그날 메모를 지운다 */
  putDay(d: DayNote): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
  /** 모든 기록과 장비를 한 번에 바꾼다 (예시 불러오기, 가져오기, 전체 삭제). days를 주면 하루 메모도 바꾼다 */
  replaceAll(data: { gear: Gear[]; ends: End[]; days?: DayNote[] }): Promise<void>;
}
