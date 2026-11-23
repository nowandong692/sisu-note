/** 순마다 테두리 색 (9순부터 다시 처음 색). 습사 탭과 기록 탭의 과녁이 같은 색을 쓴다 */
export const END_COLORS = ['#1E66D0', '#E08A00', '#2E9D5B', '#8E44AD', '#D0367A', '#0FA3A3', '#8A6A2E', '#5B6B7A'];
export const endColor = (ei: number) => END_COLORS[ei % END_COLORS.length];
