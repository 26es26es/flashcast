import { useState, useEffect } from 'react';
import { C } from '../theme/tokens';

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('flashcast_theme') || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('flashcast_theme', theme); } catch {}
  }, [theme]);

  const isDark = theme === 'dark';
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle color theme"
      style={{
        position: 'fixed', top: '16px', right: '16px', zIndex: 1000,
        width: '38px', height: '38px', borderRadius: '50%',
        border: `1px solid ${C.border}`, background: C.panel, color: C.text,
        cursor: 'pointer', fontSize: '17px', lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        transition: 'transform 0.1s, opacity 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
