/** 장비 종류: 활, 깍지, 화살 */
export type GearCategory = 'bow' | 'ring' | 'arrow';

export interface Gear {
  id: string;
  category: GearCategory;
  /** 사용자가 붙인 별명. 목록과 통계에 이 이름으로 표시된다. */
  nickname: string;
  /** 활만: 개량궁 / 각궁 / 기타 */
  bowType?: string;
  /** 브랜드·모델, 호수, 재질, 무게 같은 자유 입력 */
  detail?: string;
  startedOn: string; // YYYY-MM-DD
  archived: boolean;
  updatedAt: number;
}

/** 우궁: 오른쪽으로 빠지면 앞남. 좌궁: 왼쪽으로 빠지면 앞남. */
export type Hand = 'right' | 'left';

/** 과녁을 기준으로 빠진 쪽 (화면에서 본 방향) */
export type MissSide = 'left' | 'right' | 'over' | 'short';

export type MissDirection = '앞남' | '뒤남' | '넘음' | '짧음';

/** 1 = 조금, 2 = 많이 */
export type MissLevel = 1 | 2;

export interface Shot {
  hit: boolean;
  /** 과녁 그림 좌표 (위치를 기록하지 않았으면 null) */
  x: number | null;
  y: number | null;
  /** 9등분 칸 번호 1~9 (관중이고 9등분을 켰을 때만) */
  zone: number | null;
  side: MissSide | null;
  level: MissLevel | null;
  /** 저장할 때 우궁·좌궁 기준으로 판정한 방향 */
  direction: MissDirection | null;
}

export type Sky = '맑음' | '구름' | '흐림' | '비' | '눈';
export type WindLevel = '없음' | '약함' | '보통' | '강함';
export type WindDir = '맞바람' | '뒷바람' | '왼쪽에서' | '오른쪽에서';

/** 날씨는 모두 선택 입력. 모르는 칸은 null. */
export interface Weather {
  sky: Sky | null;
  /** 섭씨 */
  temp: number | null;
  wind: WindLevel | null;
  windDir: WindDir | null;
}

/** 한 순 = 5시 */
export interface End {
  id: string;
  date: string; // YYYY-MM-DD, 습사한 날
  recordedAt: number;
  bowId: string | null;
  ringId: string | null;
  arrowId: string | null;
  shots: Shot[];
  tags: string[];
  memo: string;
  /** 이 순을 쏠 때의 날씨 (입력하지 않았으면 없음) */
  weather?: Weather | null;
  updatedAt: number;
}

export interface Settings {
  hand: Hand;
  grid: boolean;
  current: { bow: string | null; ring: string | null; arrow: string | null };
  /** 오늘 입력한 날씨. 날짜가 바뀌면 쓰지 않는다. */
  weather?: (Weather & { date: string }) | null;
}

export const DEFAULT_SETTINGS: Settings = {
  hand: 'right',
  grid: false,
  current: { bow: null, ring: null, arrow: null },
};

export const MISS_DIRECTIONS: MissDirection[] = ['앞남', '뒤남', '넘음', '짧음'];
export const LEVEL_LABEL: Record<MissLevel, string> = { 1: '조금', 2: '많이' };
export const MEMO_TAGS = ['줌손', '깍지손', '만작', '호흡', '시선', '바람'];
export const SHOTS_PER_END = 5;
