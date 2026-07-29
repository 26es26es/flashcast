import { useState } from 'react';
import { C } from '../theme/tokens';

export function Tooltip({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', marginLeft: '5px' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '14px', height: '14px', borderRadius: '50%',
        border: `1px solid ${C.border}`, color: C.muted,
        fontSize: '10px', cursor: 'help', userSelect: 'none', lineHeight: 1,
      }}>?</span>
      {open && (
        <span style={{
          position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, width: '220px', padding: '8px 10px', borderRadius: '7px',
          background: C.panel, border: `1px solid ${C.borderHi}`, color: C.text,
          fontSize: '12px', lineHeight: 1.5, textTransform: 'none', letterSpacing: 'normal',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)', pointerEvents: 'none',
        }}>{text}</span>
      )}
    </span>
  );
}
