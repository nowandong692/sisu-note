import { describe, expect, it } from 'vitest';
import { authorizeUrl, parseLoginReturn } from './login';

const R = 'https://a.github.io/sisu-note/';
const pending = (over: Record<string, unknown> = {}) => JSON.stringify({ state: 'S1', provider: 'kakao', purpose: 'login', hash: '#settings', at: 1000, ...over });

describe('로그인에서 돌아왔을 때', () => {
  it('로그인 결과가 없는 주소는 그냥 넘긴다', () => {
    expect(parseLoginReturn('', pending(), 2000, R)).toBeNull();
    expect(parseLoginReturn('?foo=1', pending(), 2000, R)).toBeNull();
  });
  it('state가 맞으면 코드를 넘긴다', () => {
    const r = parseLoginReturn('?code=C&state=S1', pending({ provider: 'google', verifier: 'V' }), 2000, R);
    expect(r).toMatchObject({ ok: true, provider: 'google', purpose: 'login', code: 'C', verifier: 'V', redirect: R });
  });
  it('state가 다르거나 오래되면 받지 않는다', () => {
    expect(parseLoginReturn('?code=C&state=XX', pending(), 2000, R)).toMatchObject({ ok: false });
    expect(parseLoginReturn('?code=C&state=S1', null, 2000, R)).toMatchObject({ ok: false });
    expect(parseLoginReturn('?code=C&state=S1', pending(), 1000 + 16 * 60 * 1000, R)).toMatchObject({ ok: false });
  });
  it('취소하면 취소했다고 알린다', () => {
    expect(parseLoginReturn('?error=access_denied&state=S1', pending(), 2000, R)).toMatchObject({ ok: false, message: '로그인을 취소했습니다.' });
  });
});

describe('로그인 주소', () => {
  it('카카오는 동의 항목(scope)을 요청하지 않는다', () => {
    const u = new URL(authorizeUrl('kakao', 'K', 'S', 'https://a.github.io/sisu-note/'));
    expect(u.host).toBe('kauth.kakao.com');
    expect(u.searchParams.get('scope')).toBeNull();
    expect(u.searchParams.get('redirect_uri')).toBe('https://a.github.io/sisu-note/');
  });
  it('구글은 openid만 요청한다 (이메일·프로필 없음)', () => {
    const u = new URL(authorizeUrl('google', 'G', 'S', 'https://a.github.io/sisu-note/', 'CH'));
    expect(u.searchParams.get('scope')).toBe('openid');
    expect(u.searchParams.get('code_challenge')).toBe('CH');
  });
});
