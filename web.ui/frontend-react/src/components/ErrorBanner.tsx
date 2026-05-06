import { useEffect, useState } from 'react';

interface Props {
  message: string | null;
  /** "info" auto-dismisses after 6s; "error" requires manual dismissal. */
  severity?: 'info' | 'error';
  onDismiss?: () => void;
}

export default function ErrorBanner({ message, severity = 'error', onDismiss }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      if (severity === 'info') {
        const timer = setTimeout(() => {
          setVisible(false);
          onDismiss?.();
        }, 6000);
        return () => clearTimeout(timer);
      }
    } else {
      setVisible(false);
    }
  }, [message, severity, onDismiss]);

  if (!visible || !message) return null;

  const isError = severity === 'error';
  return (
    <div
      role="alert"
      style={{
        background: isError ? '#d32f2f' : '#1976d2',
        color: '#fff',
        padding: '8px 16px',
        textAlign: 'center',
        fontWeight: 'bold',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span>{message}</span>
      {isError && (
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            onDismiss?.();
          }}
          aria-label="Dismiss error"
          style={{
            background: 'transparent',
            color: '#fff',
            border: '1px solid #fff',
            borderRadius: 4,
            padding: '2px 10px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
