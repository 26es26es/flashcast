import { C, mono } from '../theme/tokens';

export const Tag = ({ color = C.accent, children }) => (
  <span style={{
    display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
    fontSize: '11px', fontFamily: mono, fontWeight: 500, letterSpacing: '0.05em',
    background: color + '22', color, border: `1px solid ${color}44`,
  }}>{children}</span>
);
