import { IndexedDbRepository } from './indexedDbRepository';
import type { Repository } from './repository';

/** 앱 버전(Capacitor)에서는 여기서 SQLite 구현을 돌려주도록 바꾼다. */
export const repository: Repository = new IndexedDbRepository();
export type { Repository };
