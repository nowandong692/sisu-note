import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';

/*
 * 휴대폰의 뒤로 가기로 창(시트)을 닫는다. 창을 열 때 방문 기록을 한 칸 넣고,
 * 뒤로 가기로 그 칸이 빠지면 맨 위 창 하나만 닫는다. 창을 버튼으로 닫으면 넣어 둔 칸을 치운다.
 * 창 하나를 닫자마자 다른 창을 여는 경우(오늘 장비 → 장비 관리)는 칸을 다시 쓴다.
 */
const sheetStack: { id: number; close: () => void }[] = [];
let sheetSeq = 0;
let ignorePops = 0;
let pendingBack: { timer: ReturnType<typeof setTimeout>; id: number } | null = null;

if (typeof window !== 'undefined') {
  // 앱의 다른 popstate 처리(고치는 중 확인 등)보다 먼저 등록되어, 창을 닫은 뒤로 가기는 여기서 끝낸다
  window.addEventListener('popstate', (e) => {
    if (ignorePops > 0) { ignorePops--; e.stopImmediatePropagation(); return; }
    const top = sheetStack[sheetStack.length - 1];
    const at = (history.state as { sheet?: number } | null)?.sheet ?? 0;
    if (top && at < top.id) {
      sheetStack.pop();
      top.close();
      e.stopImmediatePropagation();
    }
  });
}

function pushSheet(close: () => void): number {
  const id = ++sheetSeq;
  if (pendingBack) {
    clearTimeout(pendingBack.timer);
    pendingBack = null;
    history.replaceState({ sheet: id }, '');
  } else {
    history.pushState({ sheet: id }, '');
  }
  sheetStack.push({ id, close });
  return id;
}

function popSheet(id: number) {
  const i = sheetStack.findIndex((x) => x.id === id);
  if (i < 0) return; // 뒤로 가기로 이미 닫혔다
  sheetStack.splice(i, 1);
  if ((history.state as { sheet?: number } | null)?.sheet !== id) return;
  const timer = setTimeout(() => {
    pendingBack = null;
    if ((history.state as { sheet?: number } | null)?.sheet === id) { ignorePops++; history.back(); }
  }, 0);
  pendingBack = { timer, id };
}

/** backCloses=false: 뒤로 가기와 묶지 않는다 (뒤로 가기를 눌러서 뜨는 확인 창 등) */
export function Sheet({ title, onClose, children, backCloses = true }: { title: string; onClose: () => void; children: ReactNode; backCloses?: boolean }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  useEffect(() => {
    if (!backCloses) return;
    const id = pushSheet(() => closeRef.current());
    return () => popSheet(id);
  }, [backCloses]);
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

let pushToast: ((m: string) => void) | null = null;

// eslint-disable-next-line react-refresh/only-export-components
export function toast(message: string) {
  pushToast?.(message);
}

export function ToastHost() {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null);
  useEffect(() => {
    pushToast = (text) => setMsg({ text, key: Date.now() });
    return () => { pushToast = null; };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 1600);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div className="toast" role="status" key={msg.key}>{msg.text}</div> : null;
}

/** 두 번 눌러야 실행되는 버튼 (삭제처럼 되돌릴 수 없는 동작) */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'del', ariaLabel }: { label: ReactNode; confirmLabel: string; onConfirm: () => void; className?: string; ariaLabel?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={`${className} ${armed ? 'confirm' : ''}`} aria-label={armed ? undefined : ariaLabel} title={armed ? undefined : ariaLabel} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmLabel : label}
    </button>
  );
}

/** 물음표 버튼. 누르면 설명 창을 띄운다. 화면에 설명 글을 늘어놓지 않기 위한 것. */
export function HelpButton({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="help-btn" aria-label={`${title} 설명 보기`} onClick={() => setOpen(true)}>?</button>
      {open && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          <div className="help-body">{children}</div>
          <button className="btn" onClick={() => setOpen(false)}>확인</button>
        </Sheet>
      )}
    </>
  );
}

/** 내용에 맞춰 높이가 늘어나는 입력 칸 (아주 길면 화면 60%에서 멈추고 칸 안에서 스크롤) */
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
  }, [props.value]);
  return <textarea {...props} ref={ref} className={`autogrow ${props.className ?? ''}`} />;
}
