import type { End, Settings } from './types';
import { MEMO_TAGS } from './types';

/** 태그 이름은 이 글자 수까지 */
export const TAG_MAX = 10;
/** 내 태그 목록은 이 개수까지 */
export const TAGS_LIMIT = 30;

/** 앞의 #과 공백을 지운다. 태그는 띄어 쓰지 않는다 (CSV와 "#태그" 표시가 띄어쓰기로 나누므로). */
export function cleanTag(s: string): string {
  return s.normalize('NFC').replace(/#/g, '').replace(/\s+/g, '');
}

/** 내 태그 목록. 아직 손대지 않았으면 기본 태그 */
export function myTags(settings: Settings): string[] {
  return settings.memoTags ?? MEMO_TAGS;
}

/** 새 태그로 쓸 수 없으면 까닭을, 쓸 수 있으면 null */
export function tagProblem(name: string, list: string[]): string | null {
  const t = cleanTag(name);
  if (!t) return '태그 이름을 적어 주세요.';
  if ([...t].length > TAG_MAX) return `태그는 ${TAG_MAX}글자까지입니다.`;
  if (list.some((x) => x.toLowerCase() === t.toLowerCase())) return '이미 있는 태그입니다.';
  if (list.length >= TAGS_LIMIT) return `태그는 ${TAGS_LIMIT}개까지 둘 수 있습니다.`;
  return null;
}

export function addTag(list: string[], name: string): string[] {
  return tagProblem(name, list) ? list : [...list, cleanTag(name)];
}

/** 목록에서만 뺀다. 이미 이 태그를 붙인 순은 그대로 둔다. */
export function removeTag(list: string[], tag: string): string[] {
  return list.filter((t) => t !== tag);
}

/** 태그를 앞(-1)이나 뒤(+1)로 한 칸 옮긴다 */
export function moveTag(list: string[], tag: string, by: -1 | 1): string[] {
  const i = list.indexOf(tag);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 지운 기본 태그를 목록 끝에 되살린다 */
export function restoreDefaults(list: string[]): string[] {
  return [...list, ...MEMO_TAGS.filter((t) => !list.includes(t))];
}

/** 이 태그를 붙인 순 개수 */
export function tagUseCount(ends: End[], tag: string): number {
  return ends.filter((e) => e.tags.includes(tag)).length;
}

/** 습사 화면에 보일 태그: 내 목록에, 고치는 순에 이미 붙어 있지만 목록에서 지운 태그를 더한다 */
export function tagChoices(list: string[], picked: string[]): string[] {
  return [...list, ...picked.filter((t) => !list.includes(t))];
}
