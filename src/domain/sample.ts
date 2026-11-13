import type { End, Gear, MissDirection, Range, Shot, Weather } from './types';
import { SKIES, WIND_DIRS, WIND_LEVELS } from './weather';
import { BAND, TH, TW, TX, TY, classifyTap } from './target';
import { MEMO_TAGS, MISS_DIRECTIONS } from './types';
import { dayOffset, newId } from './util';

/** 처음 써 보는 사람을 위한 두 달치 예시 기록 (우궁 기준). 항상 같은 결과가 나오도록 고정 난수를 쓴다. */
export function sampleData(now = new Date()): { gear: Gear[]; ends: End[]; ranges: Range[] } {
  let s = 20261112;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const g = () => (r() + r() + r() - 1.5) / 1.5;
  const between = (a: number, b: number) => a + r() * (b - a);
  const t = Date.now();
  const mk = (id: string, category: Gear['category'], nickname: string, detail: string, startedOn: string, extra: Partial<Gear> = {}): Gear =>
    ({ id, category, nickname, detail, startedOn, archived: false, updatedAt: t, ...extra });

  const gear: Gear[] = [
    mk('sample-b1', 'bow', '검은 활', '45호', dayOffset(-200, now), { bowType: '개량궁' }),
    mk('sample-b2', 'bow', '새 각궁', '48호', dayOffset(-8, now), { bowType: '각궁' }),
    mk('sample-b0', 'bow', '입문용 활', '38호', dayOffset(-700, now), { bowType: '개량궁', archived: true }),
    mk('sample-r1', 'ring', '소뿔 깍지', '소뿔, 중', dayOffset(-150, now)),
    mk('sample-r2', 'ring', '연습용 깍지', '플라스틱, 중', dayOffset(-300, now)),
    mk('sample-a1', 'arrow', '카본 7돈', '카본, 7돈, 5대', dayOffset(-200, now)),
  ];

  const hit = (): Shot => classifyTap(
    Math.max(TX + 3, Math.min(TX + TW - 3, 150 + g() * 85)),
    Math.max(TY + 3, Math.min(TY + TH - 3, 180 + g() * 115)),
    'right', true);
  const miss = (dir: MissDirection): Shot => {
    const near = between(3, BAND - 3) + (r() < 0.65 ? 0 : BAND);
    if (dir === '앞남') return classifyTap(TX + TW + near, between(TY, TY + TH), 'right', true);
    if (dir === '뒤남') return classifyTap(TX - near, between(TY, TY + TH), 'right', true);
    if (dir === '넘음') return classifyTap(between(TX + 5, TX + TW - 5), TY - near, 'right', true);
    return classifyTap(between(TX + 5, TX + TW - 5), TY + TH + near, 'right', true);
  };
  const memos = ['줌손이 흔들림', '만작을 길게 가져가니 좋았음', '앞바람이 셌음', '깍지손 떼는 타이밍이 빨랐음', '호흡 고르고 쏘니 안정적', '어깨에 힘이 들어감'];
  const dirW: Record<string, number[]> = { 'sample-b1': [.2, .4, .2, .2], 'sample-b2': [.15, .2, .45, .2] };

  // 날씨는 따로 고정 난수를 써서 다른 값에 영향을 주지 않게 한다
  let ws = 777;
  const wr = () => { ws = (ws * 16807) % 2147483647; return ws / 2147483647; };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(wr() * a.length)];

  const ends: End[] = [];
  for (let day = -60; day <= -1; day++) {
    if (r() > 0.42) continue;
    const date = dayOffset(day, now);
    const n = 3 + Math.floor(r() * 4);
    const rangeId = wr() < 0.8 ? 'sample-g1' : 'sample-g2';
    const wind = pick(WIND_LEVELS);
    const weather: Weather | null = wr() < 0.15 ? null : {
      sky: pick(SKIES.slice(0, 4)), temp: Math.round(18 + (day / 60) * 10 + (wr() - 0.5) * 8),
      wind, windDir: wind === '없음' ? null : pick(WIND_DIRS),
    };
    for (let k = 0; k < n; k++) {
      const bow = day >= -7 && r() < 0.75 ? 'sample-b2' : 'sample-b1';
      const ring = r() < 0.6 ? 'sample-r1' : 'sample-r2';
      let p = bow === 'sample-b1' ? 0.5 + ((day + 60) / 60) * 0.08 : 0.42 + ((day + 7) / 7) * 0.08;
      if (ring === 'sample-r1') p += 0.05;
      if (weather?.wind === '강함') p -= 0.1;
      else if (weather?.wind === '보통') p -= 0.04;
      const shots: Shot[] = [];
      for (let i = 0; i < 5; i++) {
        if (r() < p - (i === 4 ? 0.08 : 0) + (i === 0 ? 0.03 : 0)) { shots.push(hit()); continue; }
        const x = r(); let acc = 0; let dir: MissDirection = '짧음';
        for (let j = 0; j < 4; j++) { acc += dirW[bow][j]; if (x < acc) { dir = MISS_DIRECTIONS[j]; break; } }
        shots.push(miss(dir));
      }
      ends.push({
        id: newId(), date, recordedAt: t + day * 864e5 + k, bowId: bow, ringId: ring, arrowId: 'sample-a1', shots,
        tags: r() < 0.3 ? [MEMO_TAGS[Math.floor(r() * MEMO_TAGS.length)]] : [],
        memo: r() < 0.18 ? memos[Math.floor(r() * memos.length)] : '',
        weather,
        rangeId,
        updatedAt: t,
      });
    }
  }
  const ranges: Range[] = [
    { id: 'sample-g1', name: '동네 활터', lat: 37.5796, lon: 126.9670, bearing: 0 },
    { id: 'sample-g2', name: '원정 간 활터', lat: 35.8150, lon: 127.1530, bearing: 90 },
  ];
  return { gear, ends, ranges };
}
