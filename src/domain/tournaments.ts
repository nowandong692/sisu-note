/** 대한궁도협회 대회일정 (배포 때 scripts/tournaments.mjs가 만든 tournaments.json) */
export interface Tournament { id: string; name: string; start: string; end: string; place: string; url: string }
export interface TournamentFile { source?: string; fetchedAt?: string; items: Tournament[]; error?: boolean }

const DAY = 86400000;
const toTime = (d: string) => new Date(`${d}T00:00:00`).getTime();

/** 오늘 기준: 진행 중이면 0, 앞으로면 남은 날 수, 끝났으면 음수 */
export function daysUntil(t: Pick<Tournament, 'start' | 'end'>, today: string): number {
  if (t.start <= today && today <= t.end) return 0;
  if (today < t.start) return Math.round((toTime(t.start) - toTime(today)) / DAY);
  return -Math.max(1, Math.round((toTime(today) - toTime(t.end)) / DAY));
}

export function dLabel(t: Pick<Tournament, 'start' | 'end'>, today: string): string {
  const d = daysUntil(t, today);
  if (d === 0) return '진행 중';
  return d > 0 ? `D-${d}` : '끝남';
}

/** 다가오는(진행 중 포함) 대회는 가까운 순, 지난 대회는 최근 순 */
export function splitTournaments(items: Tournament[], today: string) {
  const upcoming = items.filter((t) => t.end >= today).sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  const past = items.filter((t) => t.end < today).sort((a, b) => b.end.localeCompare(a.end));
  return { upcoming, past };
}

/** "안성 마춤정"처럼 지역과 정 이름이 함께 오므로, 내 활터 이름이 들어 있으면 같은 활터로 본다 */
export function isMyRange(place: string, rangeNames: string[]): boolean {
  const p = place.replace(/\s/g, '');
  return rangeNames.some((n) => {
    const k = n.replace(/\s/g, '').replace(/(활터|궁도장)$/, '');
    return k.length >= 2 && p.includes(k);
  });
}

export function periodText(t: Pick<Tournament, 'start' | 'end'>): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
  return t.start === t.end ? md(t.start) : `${md(t.start)} ~ ${md(t.end)}`;
}

/** 달력 한 달: 일요일부터 시작하는 주 단위 칸 (앞뒤 빈칸은 null) */
export function monthGrid(ym: string): (string | null)[][] {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [...Array(first).fill(null)];
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function onDay(items: Tournament[], day: string): Tournament[] {
  return items.filter((t) => t.start <= day && day <= t.end).sort((a, b) => a.start.localeCompare(b.start));
}

export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 경기 중계 영상 (배포 때 scripts/videos.mjs가 만든 videos.json) */
export interface Video { id: string; title: string; published: string; url: string }
export interface VideoFile { channel?: string; channelUrl?: string; liveUrl?: string; fetchedAt?: string; items: Video[] }

/** 비교용: 띄어쓰기·기호·"- 2일차" 같은 꼬리를 뺀다 */
function core(s: string): string {
  return s.replace(/\s*-\s*\d+\s*일차.*$/, '').replace(/\(.*?\)/g, '').replace(/[\s·ㆍ,.\-_'"]/g, '').replace(/남녀|남여/g, '');
}

/** 대회 기간(앞뒤 하루 여유) 안에 올라왔고 이름이 겹치는 영상 */
export function videosFor(t: Tournament, videos: Video[]): Video[] {
  const name = core(t.name);
  if (name.length < 4) return [];
  const from = toTime(t.start) - DAY, to = toTime(t.end) + 2 * DAY;
  return videos.filter((v) => {
    const at = Date.parse(v.published);
    if (!(at >= from && at <= to)) return false;
    const vt = core(v.title);
    return vt.length >= 4 && (name.includes(vt) || vt.includes(name));
  }).sort((a, b) => a.published.localeCompare(b.published));
}
