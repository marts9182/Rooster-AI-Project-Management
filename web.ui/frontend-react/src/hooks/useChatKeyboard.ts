import { useEffect } from 'react';
import { useChatDrawer } from '../components/chat/ChatDrawerContext';

const COMPOSER_SELECTOR = '.chat-composer-textarea';

export function useChatKeyboard() {
  const { isOpen, toggle, close } = useChatDrawer();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape' && isOpen) {
        close();
      } else if (mod && e.key === '/' && isOpen) {
        const ta = document.querySelector(COMPOSER_SELECTOR) as HTMLTextAreaElement | null;
        ta?.focus();
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, toggle, close]);
}
