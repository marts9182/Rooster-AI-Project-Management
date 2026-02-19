import { useEffect, useState } from 'react';

interface Props {
  message: string | null;
}

export default function ErrorBanner({ message }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (!visible || !message) return null;
  return (
    <div
      role="alert"
      style={{
        background: '#d32f2f',
        color: '#fff',
        padding: '8px 16px',
        textAlign: 'center',
        fontWeight: 'bold',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
      }}
    >
      {message}
    </div>
  );
}
