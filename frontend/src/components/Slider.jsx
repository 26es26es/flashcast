import { C, mono } from '../theme/tokens';

export function Slider({ label, value, min, max, step, unit, onChange, disabled }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
        <span style={{ fontSize: '13px', fontFamily: mono, color: disabled ? C.muted : C.text }}>
          {value} <span style={{ color: C.muted }}>{unit}</span>
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', opacity: disabled ? 0.4 : 1 }}
      />
    </div>
  );
}
