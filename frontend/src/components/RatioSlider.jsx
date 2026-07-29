import { C, mono } from '../theme/tokens';

export const RatioSlider = ({ label, value, onChange, disabled }) => (
  <div style={{ marginBottom: '10px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: C.muted, marginBottom: '3px' }}>
      <span>{label}</span><span style={{ fontFamily: mono }}>{Math.round(value * 100)}%</span>
    </div>
    <input type="range" min={0} max={100} step={5} value={Math.round(value * 100)} disabled={disabled}
      onChange={e => onChange(Number(e.target.value) / 100)}
      style={{ width: '100%', opacity: disabled ? 0.4 : 1 }} />
  </div>
);
