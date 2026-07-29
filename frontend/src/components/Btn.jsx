import { C, sans } from '../theme/tokens';

export const Btn = ({ variant = 'primary', style = {}, ...props }) => {
  const variants = {
    primary:   { background: C.accent,  color: '#fff' },
    success:   { background: C.green,   color: C.bg  },
    danger:    { background: C.red,     color: '#fff' },
    ghost:     { background: 'transparent', color: C.muted, border: `1px solid ${C.border}` },
  };
  return (
    <button style={{
      padding: '9px 18px', borderRadius: '7px', border: 'none',
      fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: sans,
      transition: 'opacity 0.15s, transform 0.1s', ...variants[variant], ...style,
    }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
      {...props}
    />
  );
};
