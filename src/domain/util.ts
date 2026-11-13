const pad = (n: number) => (n < 10 ? '0' : '') + n;

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayOffset(n: number, from = new Date()): string {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export const today = () => dayOffset(0);

export function formatDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  const wd = '일월화수목금토'.charAt(new Date(y, m - 1, d).getDay());
  return `${m}월 ${d}일 (${wd})`;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
