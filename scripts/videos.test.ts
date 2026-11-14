import { describe, expect, it } from 'vitest';
// @ts-expect-error 빌드 스크립트(.mjs)라 타입 선언이 없다
import { parseFeed } from './videos.mjs';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>15시15중</title>
 <published>2019-04-21T00:42:42+00:00</published>
 <entry>
  <id>yt:video:aRWuwHjD6MI</id>
  <yt:videoId>aRWuwHjD6MI</yt:videoId>
  <title>제34회 명궁 궁도대회</title>
  <published>2026-11-14T10:17:06+00:00</published>
 </entry>
 <entry>
  <id>yt:video:P1SeptbR4Yk</id>
  <yt:videoId>P1SeptbR4Yk</yt:videoId>
  <title>제107회 전국체전 궁도경기 &amp; 시상 - 3일차</title>
  <published>2026-10-19T05:38:28+00:00</published>
 </entry>
</feed>`;

describe('유튜브 피드 읽기', () => {
  it('채널 제목은 빼고 영상만 뽑는다', () => {
    const r = parseFeed(FEED);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ id: 'aRWuwHjD6MI', title: '제34회 명궁 궁도대회', published: '2026-11-14T10:17:06+00:00', url: 'https://www.youtube.com/watch?v=aRWuwHjD6MI' });
    expect(r[1].title).toBe('제107회 전국체전 궁도경기 & 시상 - 3일차');
  });
});
