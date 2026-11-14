import { describe, expect, it } from 'vitest';
import CFB from 'cfb';
import { deflateRawSync } from 'node:zlib';
// @ts-expect-error 빌드 스크립트는 .mjs라 타입이 없다
import { hwpText, parseYogang } from './yogang.mjs';

const ANSEONG = `2. 대회기간 : 2026년 11월 20일 (금) ~ 2026년 11월 22일 (일) 3일간(우천불구)
12. 신청방법
가. 단체전은 각 정 다조까지 참가할 수 있으며, 조당 참가비 50,000원을 접수 마감일까지 온라인 입금해야 함. (농협 351-1294-0552-13, 안성시궁도협회)
다. 접수처 : 15시 15중 앱으로 접수 (단체전, 개인전, 실업부)
라. 접수기간 : 2026년 11월 10일 (화) 13:00 ~ 11월 14일 (토) 17:00까지 (5일간)`;

const NAMHAE = `가. 개인전 참가선수는 1인당 참가비 20,000원을 재작대 시 납부하여야 함.
나. 단체전은 각 정당 다조 참가 가능하며, 각 팀당 참가비 50,000원을 현장납부.
다. 접수방법: 15시 15중 앱으로 접수(단체전, 개인전, 실업부)
라. 접수기간: 2026년 11월 18일(수) 13:00부터 ~ 11월 22일(일) 17:00까지(5일간)
⦁단체전 : 80대 선착순 마감 /개인전 : 11/29일 48대(336명), 11/30일 : 48대(336명)
16.문의처: 남해 궁도협회 전무이사 홍길동(010-1234-5678),`;

describe('parseYogang', () => {
  it('안성: 해가 적힌 접수기간과 접수처, 계좌번호는 지운다', () => {
    const r = parseYogang(ANSEONG, 2026);
    expect(r.open).toBe('2026-11-10T13:00');
    expect(r.close).toBe('2026-11-14T17:00');
    expect(r.via).toBe('15시15중 앱');
    expect(r.fee[0]).toContain('50,000원');
    expect(r.fee[0]).not.toMatch(/351|농협/);
  });

  it('남해: "부터 ~" 형식과 선착순', () => {
    const r = parseYogang(NAMHAE, 2026);
    expect(r.open).toBe('2026-11-18T13:00');
    expect(r.close).toBe('2026-11-22T17:00');
    expect(r.limit[0]).toContain('80대 선착순');
    expect(r.fee).toHaveLength(2);
    expect(JSON.stringify(r)).not.toMatch(/010|홍길동/);
  });

  it('점 찍은 날짜, 해 없는 날짜, 다른 앱', () => {
    expect(parseYogang('라. 접수기간 : 2026. 11. 11.(수) 13:00 ~ 11. 15(일) 17:00까지', 2026)).toMatchObject({ open: '2026-11-11T13:00', close: '2026-11-15T17:00' });
    expect(parseYogang('다. 접수기간 : 10월27일(화) 13:00~ 10월31일(토) 17:00까지(5일간)', 2026)).toMatchObject({ open: '2026-10-27T13:00', close: '2026-10-31T17:00' });
    expect(parseYogang('다. 접수기간 : 2026. 10. 13(화) 13:00 ~ 10. 17(토) 18:00까지 한함.', 2026)).toMatchObject({ close: '2026-10-17T18:00' });
    expect(parseYogang('다. 접수방법 : 활로145 앱으로 접수\n라. 접수기간 : 2026년 10월 28일(수) 13:00 ~ 11월 01일(일) 17:00까지', 2026))
      .toMatchObject({ via: '활로145 앱', open: '2026-10-28T13:00', close: '2026-11-01T17:00' });
  });

  it('해를 넘기는 접수기간', () => {
    expect(parseYogang('접수기간 : 12월 28일 13:00 ~ 1월 3일 17:00', 2026)).toMatchObject({ open: '2026-12-28T13:00', close: '2027-01-03T17:00' });
  });

  it('접수기간이 없으면 null', () => {
    expect(parseYogang('2. 대회기간 : 2026년 11월 20일', 2026)).toBeNull();
  });
});

/** 문단 하나짜리 hwp를 만든다 */
function fakeHwp(paragraphs: string[], compressed = true): Buffer {
  const recs = paragraphs.map((p) => {
    const body = Buffer.concat([
      // 문단 앞에 8글자짜리 조판 부호 하나를 넣어 건너뛰는지 본다
      Buffer.from([11, 0, ...Array(14).fill(0x41)]),
      Buffer.from(p, 'utf16le'),
      Buffer.from([13, 0]),
    ]);
    const h = Buffer.alloc(4);
    h.writeUInt32LE((67 | (body.length << 20)) >>> 0);
    return Buffer.concat([h, body]);
  });
  const raw = Buffer.concat(recs);
  const header = Buffer.alloc(256);
  header.write('HWP Document File');
  header.writeUInt32LE(compressed ? 1 : 0, 36);
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, '/FileHeader', header);
  CFB.utils.cfb_add(cfb, '/BodyText/Section0', compressed ? deflateRawSync(raw) : raw);
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array);
}

describe('hwpText', () => {
  it('압축된 본문의 문단 글을 읽고 조판 부호는 건너뛴다', () => {
    const t = hwpText(fakeHwp(['라. 접수기간 : 2026년 11월 10일 13:00 ~ 11월 14일 17:00', '다. 접수처 : 15시15중 앱']));
    expect(t.split('\n')).toEqual(['라. 접수기간 : 2026년 11월 10일 13:00 ~ 11월 14일 17:00', '다. 접수처 : 15시15중 앱']);
    expect(parseYogang(t, 2026)).toMatchObject({ open: '2026-11-10T13:00', via: '15시15중 앱' });
  });
  it('압축 안 된 파일도', () => {
    expect(hwpText(fakeHwp(['접수기간'], false))).toBe('접수기간');
  });
  it('hwp가 아니면 오류', () => {
    expect(() => hwpText(Buffer.from('hello'))).toThrow();
  });
});
