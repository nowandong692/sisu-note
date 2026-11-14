import { describe, expect, it } from 'vitest';
// @ts-expect-error 빌드 스크립트(.mjs)라 타입 선언이 없다
import { parseKungdoList } from './tournaments.mjs';

const ROW = (id: number, name: string, period: string, place: string, notice = true) => `
                <tr class="bo-list ${notice ? 'bo_notice' : ''}">
                        <td class="td_num2" style="width:9%;">
            ${notice ? '<strong class="notice_icon"><i class="fa fa-bullhorn" aria-hidden="true"></i><span class="sound_only">공지</span></strong>' : '1228'}            </td>
            <td class="td_subject" style="padding-left:0px;">
                                <div class="bo_tit">
                    <a href="http://kungdo.or.kr/bbs/board.php?bo_table=game_news&amp;wr_id=${id}">
                                                                        ${name}
                    </a>
                    <i class="fa fa-download" aria-hidden="true"></i>                                    </div>
            </td>
			<td style="width:25%;">${period}</td>
            <td style="width:14%;">${place}</td>
                                </tr>`;

const PAGE = `<table class="table table-striped"><thead><tr><th scope="col">번호</th><th scope="col">제목</th><th scope="col">대회기간</th><th scope="col">장소</th></tr></thead><tbody>
${ROW(1263, '제5회 안성맞춤기 전국 남녀 궁도대회', '2026/11/20 ~ 2026/11/22', '안성 마춤정')}
${ROW(1261, '제21회 광양시장기 전국 남&middot;녀 궁도대회', '2026/11/21 ~ 2026/11/23', '광양 마로정')}
${ROW(1258, '2026 화성특례시 정조대왕 효 전국 남·녀 궁도대회', '2026/10/16 ~ 2026/10/18', '화성 화성정', false)}
</tbody></table>`;

describe('협회 대회일정 게시판 읽기', () => {
  it('대회명, 기간, 장소, 글 주소를 뽑는다', () => {
    const r = parseKungdoList(PAGE);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({ id: '1263', name: '제5회 안성맞춤기 전국 남녀 궁도대회', start: '2026-11-20', end: '2026-11-22', place: '안성 마춤정', url: 'http://kungdo.or.kr/bbs/board.php?bo_table=game_news&wr_id=1263' });
    expect(r[1].name).toBe('제21회 광양시장기 전국 남·녀 궁도대회');
    expect(r[2].place).toBe('화성 화성정');
  });
  it('쪽 번호가 붙은 글 주소도 읽는다', () => {
    const r = parseKungdoList(PAGE.replace(/wr_id=(\d+)"/g, 'wr_id=$1&amp;page=2"'));
    expect(r).toHaveLength(3);
    expect(r[0].url).toBe('http://kungdo.or.kr/bbs/board.php?bo_table=game_news&wr_id=1263');
  });
  it('머리줄이나 다른 표는 건너뛴다', () => {
    expect(parseKungdoList('<table><tr><td>없음</td></tr></table>')).toEqual([]);
  });
});
