import { C } from '../theme/tokens';
import { FieldLabel } from './FieldLabel';

export const TriToggle = ({ label, value, onChange, hint }) => {
  const opts = [[null, 'Any'], [true, 'Yes'], [false, 'No']];
  return (
    <div style={{ minWidth: 0 }}>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div style={{ display: 'flex', gap: '4px' }}>
        {opts.map(([v, t]) => (
          <span key={t} onClick={() => onChange(v)} style={{
            flex: 1, textAlign: 'center', padding: '4px 0', borderRadius: '6px',
            cursor: 'pointer', fontSize: '12px', userSelect: 'none',
            background: value === v ? C.accentDim : 'transparent',
            color: value === v ? C.accent : C.muted,
            border: `1px solid ${value === v ? C.accent + '55' : C.border}`,
          }}>{t}</span>
        ))}
      </div>
    </div>
  );
};
