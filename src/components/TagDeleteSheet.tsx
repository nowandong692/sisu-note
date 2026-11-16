import { useRef } from 'react';
import { Sheet, toast } from './ui';
import { removeTag, myTags, tagUseCount } from '../domain/tags';
import { MEMO_TAGS } from '../domain/types';
import { useStore } from '../state/store';

/** 태그를 목록에서 빼기 전에 묻는 창. 무엇이 바뀌고 무엇이 남는지 먼저 알려 준다. */
export function TagDeleteSheet({ tag, onClose, onDeleted, inDraft = false }: { tag: string; onClose: () => void; onDeleted?: () => void; inDraft?: boolean }) {
  const { settings, ends, updateSettings } = useStore();
  const n = tagUseCount(ends, tag);
  const isDefault = MEMO_TAGS.includes(tag);
  const run = async () => {
    await updateSettings({ memoTags: removeTag(myTags(settings), tag) });
    toast(`#${tag} 태그를 뺐습니다`);
    onDeleted?.();
    onClose();
  };
  return (
    <Sheet title={`#${tag} 태그를 뺄까요?`} onClose={onClose}>
      <div className="warn-box" role="alert">
        <b>습사 화면의 태그 목록에서 빠집니다.</b>
        <span className="small">기록은 지우지 않습니다.</span>
      </div>
      <div className="warn-list">
        <div className="small"><b>유의사항</b></div>
        <ul className="small">
          <li>{n ? `이 태그를 붙인 ${n}순은 태그가 그대로 남습니다. 메모 모아보기에서 #${tag}로 계속 찾을 수 있고, 그 순을 고칠 때도 보입니다.` : '아직 이 태그를 붙인 순은 없습니다.'}</li>
          {inDraft && <li>지금 입력 중인 순에 붙인 #{tag}는 그대로 둡니다. 빼려면 저장하기 전에 한 번 눌러 끄세요.</li>}
          <li>{isDefault ? '기본 태그라서 설정 탭의 "기본 태그 되살리기"로 다시 넣을 수 있습니다.' : '다시 쓰려면 같은 이름으로 새로 더하면 됩니다.'}</li>
        </ul>
      </div>
      <button className="btn danger" onClick={() => void run()}>#{tag} 빼기</button>
      <button className="btn ghost" onClick={onClose}>취소</button>
    </Sheet>
  );
}

/** 길게 누르기. 길게 누른 뒤에 따라오는 click은 무시한다. */
// eslint-disable-next-line react-refresh/only-export-components
export function useLongPress(onLong: () => void, ms = 550) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown: () => { fired.current = false; clear(); timer.current = setTimeout(() => { fired.current = true; onLong(); }, ms); },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    /** click을 처리해도 되면 true (길게 누른 뒤면 false) */
    take: () => { const ok = !fired.current; fired.current = false; return ok; },
  };
}
