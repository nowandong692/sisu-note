import type { Palette, ThemeMode } from '../domain/types';

const KEY = 'gukgungrok-appearance';

/** html 요소에 밝기·테마를 건다. 앱이 뜨기 전에도 쓸 수 있게 이 기기에 따로 기억해 둔다. */
export function applyAppearance(mode: ThemeMode = 'system', palette: Palette = 'hong') {
  const el = document.documentElement;
  if (mode === 'system') delete el.dataset.theme; else el.dataset.theme = mode;
  if (palette === 'hong') delete el.dataset.palette; else el.dataset.palette = palette;
  try { localStorage.setItem(KEY, JSON.stringify({ mode, palette })); } catch { /* 저장 못 해도 화면엔 이미 걸림 */ }
  // 주소창·상태 표시줄 색을 바탕색에 맞춘다
  requestAnimationFrame(() => {
    const c = getComputedStyle(el).getPropertyValue('--paper').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', c || '#F5F5F2'));
  });
}

/** 첫 화면이 깜빡이지 않게, 기억해 둔 테마를 바로 건다 */
export function applySavedAppearance() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v) applyAppearance(v.mode, v.palette);
  } catch { /* 없으면 기본 */ }
}
