/**
 * 파일 내보내기. 웹에서는 브라우저 다운로드를 쓰고,
 * Capacitor 앱에서는 Filesystem/Share 플러그인으로 바꿔 끼운다.
 */
export function saveTextFile(filename: string, text: string, mime = 'text/csv'): void {
  const blob = new Blob(['﻿' + text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
