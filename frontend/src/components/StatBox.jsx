import { C, mono } from '../theme/tokens';

export const StatBox = ({ label, value, sub, color = C.text }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: '22px', fontWeight: 700, color, fontFamily: mono }}>{value}</div>
    <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
    {sub && <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>{sub}</div>}
  </div>
);
