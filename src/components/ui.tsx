import { useEffect, useState, type ReactNode } from 'react';

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
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'del' }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={`${className} ${armed ? 'confirm' : ''}`} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmLabel : label}
    </button>
  );
}
