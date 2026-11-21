/**
 * 온라인 랭킹 서버(Supabase) 연결.
 * 무작위 열쇠(= 복구 코드)로 궁사를 구분한다. 서버는 열쇠의 해시만 저장한다. 카카오·구글 로그인은 login.ts.
 * 앱은 테이블을 직접 읽거나 쓰지 못하고, supabase/schema.sql의 함수(RPC)만 부른다.
 */
const URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const KEY = import.meta.env.VITE_SUPABASE_KEY;

export const onlineAvailable = () => !!(URL && KEY);

/** missing: 서버에 그 함수가 아직 없음 (SQL을 실행하기 전) */
export type OnlineErrorCode = 'network' | 'nickname-taken' | 'unknown-key' | 'daily-limit' | 'missing' | 'server';
export class OnlineError extends Error {
  readonly code: OnlineErrorCode;
  constructor(message: string, code: OnlineErrorCode) { super(message); this.code = code; }
}

const MESSAGES: [RegExp, OnlineErrorCode, string][] = [
  [/nickname taken/, 'nickname-taken', '이미 쓰는 닉네임입니다. 다른 닉네임을 정해 주세요.'],
  [/unknown key|bad key/, 'unknown-key', '복구 코드가 맞지 않습니다.'],
  [/daily limit/, 'daily-limit', '하루에 올릴 수 있는 순(40순)을 넘었습니다.'],
  [/not admin/, 'server', '관리자 코드가 맞지 않습니다.'],
  [/no such archer/, 'server', '그런 닉네임의 궁사가 없습니다.'],
  [/no club/, 'server', '같은 활터 공개는 소속 활터를 정한 뒤에 쓸 수 있습니다.'],
  [/share limit/, 'server', '하루에 공개할 수 있는 메모(40개)를 넘었습니다.'],
  [/empty comment/, 'server', '댓글 내용을 적어 주세요.'],
  [/comment too long/, 'server', '댓글은 300자까지 쓸 수 있습니다.'],
  [/comment limit/, 'server', '하루에 달 수 있는 댓글(100개)을 넘었습니다.'],
  [/report limit/, 'server', '하루에 할 수 있는 신고(30건)를 넘었습니다.'],
  [/Could not find the function public\.(report_content|comment_news|admin_content_reports|admin_delete_memo|admin_delete_comment|admin_dismiss_content_report)/, 'missing', '서버에 신고 기능이 아직 없습니다. supabase/migrations/009_memo_reports.sql을 실행해 주세요.'],
  [/Could not find the function public\.(save_backup|load_backup)/, 'missing', '서버에 장비·설정 백업 기능이 아직 없습니다. supabase/migrations/012_backup.sql을 실행해 주세요.'],
  [/not linked/, 'server', '이 계정에 연결된 기록이 없습니다. 예전에 쓰던 기기의 설정 → 로그인 연결에서 먼저 연결해 두어야 합니다. 복구 코드가 있으면 복구 코드로 이어 써 주세요.'],
  [/login failed/, 'server', '로그인을 확인하지 못했습니다. 한 번 더 해 주세요.'],
  [/login not ready/, 'server', '이 로그인은 아직 준비 중입니다.'],
  [/Could not find the function public\.(login_providers|link_login|login_with|my_logins|unlink_login)/, 'missing', '서버에 로그인 기능이 아직 없습니다. supabase/migrations/014_login.sql을 실행해 주세요.'],
  [/backup too large/, 'server', '장비·설정 백업이 너무 큽니다.'],
  [/no such memo/, 'server', '이 메모는 내려갔거나 볼 수 없습니다.'],
  [/Could not find the function public\.(add_comment|delete_comment|memo_comment_list)/, 'missing', '서버에 댓글 기능이 아직 없습니다. supabase/migrations/008_memo_comments.sql을 실행해 주세요.'],
  [/Could not find the function public\.(share_memo|unshare_memo|shared_memo_list)/, 'missing', '서버에 메모 공개 기능이 아직 없습니다. supabase/migrations/007_shared_memos.sql을 실행해 주세요.'],
  [/Could not find the function public\.admin_(find_archers|archer_days|archer_day_ends|delete_ends)/, 'server', '서버에 기록 관리 기능이 아직 없습니다. supabase/migrations/005_admin_records.sql을 실행해 주세요.'],
  [/Could not find the function public\.admin_/, 'server', '서버에 관리자 기능이 아직 없습니다. supabase/migrations/003_admin.sql을 실행해 주세요.'],
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
