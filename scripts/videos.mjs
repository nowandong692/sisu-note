/**
 * 경기 중계 채널(15시15중 유튜브)의 최근 영상 목록을 유튜브 공식 피드(RSS)에서 받아 JSON으로 낸다.
 * 배포할 때 GitHub Actions가 돌려 dist/videos.json을 만든다.
 *
 *   node scripts/videos.mjs > dist/videos.json
 */
export const CHANNEL_ID = 'UCAmMjZ44ugH9GmgYq0du5PQ';
export const CHANNEL_NAME = '15시15중';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');

/** 피드에서 영상마다 id, 제목, 올린 시각 */
export function parseFeed(xml) {
  const out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = e.match(/<title>([^<]*)<\/title>/)?.[1];
    const published = e.match(/<published>([^<]+)<\/published>/)?.[1];
    if (!id || !title) continue;
    out.push({ id, title: decode(title).trim(), published: published ?? '', url: `https://www.youtube.com/watch?v=${id}` });
  }
  return out;
}

async function main() {
  const res = await fetch(FEED, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseFeed(await res.text());
  if (!items.length) throw new Error('no videos parsed');
  process.stdout.write(JSON.stringify({
    channel: CHANNEL_NAME,
    channelUrl: `https://www.youtube.com/channel/${CHANNEL_ID}`,
    liveUrl: `https://www.youtube.com/channel/${CHANNEL_ID}/live`,
    fetchedAt: new Date().toISOString(),
    items,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
