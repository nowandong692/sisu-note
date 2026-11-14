/**
 * 온라인 랭킹 서버(Supabase) 연결.
 * 로그인 없이 무작위 열쇠(= 복구 코드)로만 궁사를 구분한다. 서버는 열쇠의 해시만 저장한다.
 * 앱은 테이블을 직접 읽거나 쓰지 못하고, supabase/schema.sql의 함수(RPC)만 부른다.
 */
const URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const KEY = import.meta.env.VITE_SUPABASE_KEY;

export const onlineAvailable = () => !!(URL && KEY);

export type OnlineErrorCode = 'network' | 'nickname-taken' | 'unknown-key' | 'daily-limit' | 'server';
export class OnlineError extends Error {
  readonly code: OnlineErrorCode;
  constructor(message: string, code: OnlineErrorCode) { super(message); this.code = code; }
}

const MESSAGES: [RegExp, OnlineErrorCode, string][] = [
  [/nickname taken/, 'nickname-taken', '이미 쓰는 닉네임입니다. 다른 닉네임을 정해 주세요.'],
  [/unknown key|bad key/, 'unknown-key', '복구 코드가 맞지 않습니다.'],
  [/daily limit/, 'daily-limit', '하루에 올릴 수 있는 순(40순)을 넘었습니다.'],
];

export async function rpc<T>(fn: string, args: Record<string, unknown>, timeoutMs = 10000): Promise<T> {
  if (!URL || !KEY) throw new OnlineError('온라인 랭킹이 아직 설정되지 않았습니다.', 'server');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: ctl.signal,
    });
  } catch {
    throw new OnlineError('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.', 'network');
  } finally {
    clearTimeout(t);
  }
  const text = await res.text();
  if (!res.ok) {
    const msg = (() => { try { return String(JSON.parse(text).message ?? text); } catch { return text; } })();
    const hit = MESSAGES.find(([re]) => re.test(msg));
    throw hit ? new OnlineError(hit[2], hit[1]) : new OnlineError(`서버 오류: ${msg.slice(0, 80)}`, 'server');
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** 사람이 옮겨 적기 쉬운 글자만 (0/O, 1/I/L 같은 헷갈리는 글자 뺌) */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** 새 복구 코드: 4글자씩 6묶음, 약 118비트 */
export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

/** 사람이 입력한 복구 코드를 정리: 대문자, 공백 제거, 4글자마다 하이픈 */
export function normalizeRecoveryCode(input: string): string {
  const s = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return (s.match(/.{1,4}/g) ?? []).join('-');
}
