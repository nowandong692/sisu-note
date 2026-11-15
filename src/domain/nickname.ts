/** 닉네임 규칙. 서버(supabase/migrations/006_nickname.sql)의 _clean_nick과 같은 규칙으로 다듬는다. */
export const NICK_MAX = 12;

/** 앞뒤 공백을 지우고, 가운데 공백은 한 칸으로 줄이고, 한글 자모 조합을 하나로 맞춘다 */
export function cleanNickname(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** 닉네임으로 쓸 수 없으면 까닭을, 쓸 수 있으면 null */
export function nicknameProblem(s: string): string | null {
  const n = cleanNickname(s);
  if (!n) return '닉네임을 정해 주세요.';
  if ([...n].length > NICK_MAX) return `닉네임은 ${NICK_MAX}글자까지입니다.`;
  return null;
}

/** 같은 닉네임인지 (대소문자, 공백 차이는 같은 것으로 본다) */
export function sameNickname(a: string, b: string): boolean {
  return cleanNickname(a).toLowerCase() === cleanNickname(b).toLowerCase();
}
