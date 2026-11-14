import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
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
