import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface ChatDrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const Ctx = createContext<ChatDrawerContextValue | null>(null);

const LS_DRAWER_OPEN = 'chat_drawer_open';

export function ChatDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(() => {
    try { return localStorage.getItem(LS_DRAWER_OPEN) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(LS_DRAWER_OPEN, isOpen ? '1' : '0'); } catch { /* ignore */ }
  }, [isOpen]);
  const value = useMemo<ChatDrawerContextValue>(() => ({
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((v) => !v),
  }), [isOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChatDrawer(): ChatDrawerContextValue {
  const v = useContext(Ctx);
  if (v) return v;
  // Fallback: tests that mount Header without a provider still work.
  return { isOpen: false, open: () => {}, close: () => {}, toggle: () => {} };
}
