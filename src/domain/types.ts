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
  /** 날씨 서비스에서 불러온 풍속 (m/s). 직접 입력했으면 없음. */
  windSpeed?: number | null;
  /** 날씨 서비스에서 불러온 바람이 불어오는 방위 (도). 사대 방향을 나중에 정해도 다시 계산할 수 있게 둔다. */
  windFrom?: number | null;
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
  /** 이 순을 쏜 활터 (모르면 없음) */
  rangeId?: string | null;
  /** 이 순을 쏠 때의 날씨 (입력하지 않았으면 없음) */
  weather?: Weather | null;
  updatedAt: number;
}

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

/** 활터. 위치를 남겨 두면 GPS로 가까운 활터를 알아서 고른다. */
export interface Range {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** 사대에서 과녁을 바라보는 방위 (0 = 북, 90 = 동). 바람 방향 계산에 쓴다. */
  bearing: number | null;
}

export interface Settings {
  hand: Hand;
  grid: boolean;
  current: { bow: string | null; ring: string | null; arrow: string | null };
  /** 등록한 활터들 */
  ranges?: Range[];
  /** 지금 있는 활터. 다음에 저장하는 순에 들어간다. */
  currentRange?: string | null;
  /** 사용자가 직접 고른 활터면 true. GPS로 다른 등록 활터 근처가 아니면 그대로 둔다. */
  currentRangeManual?: boolean;
  /** @deprecated 예전 버전의 활터 하나 (불러올 때 ranges로 옮긴다) */
  rangeBearing?: number | null;
  /** @deprecated */
  rangePlace?: Place | null;
  /** 오늘 입력한 날씨. 날짜가 바뀌면 쓰지 않는다. */
  weather?: (Weather & {
    date: string;
    /** 날씨 서비스에서 마지막으로 불러온 시각 (ms) */
    fetchedAt?: number | null;
    /** 불러온 서비스 이름 */
    source?: string | null;
    /** 사용자가 직접 고쳤으면 true. 이때는 자동으로 새로 불러와 덮어쓰지 않는다. */
    manual?: boolean;
  }) | null;
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
