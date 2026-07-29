import { C, sans } from '../theme/tokens';

export const Input = ({ style = {}, ...props }) => (
  <input style={{
    padding: '9px 12px', borderRadius: '7px', border: `1px solid ${C.border}`,
    background: C.surface, color: C.text, fontFamily: sans, fontSize: '14px',
    width: '100%', outline: 'none', transition: 'border-color 0.15s',
    ...style,
  }}
    onFocus={e => e.target.style.borderColor = C.accent}
    onBlur={e => e.target.style.borderColor = C.border}
    {...props}
  />
);
