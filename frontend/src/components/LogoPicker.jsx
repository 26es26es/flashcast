import { C } from '../theme/tokens';
import { LOGOS } from '../constants/logos';

export function LogoPicker({ value, onPick, disabled }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: '10px' }}>
      {LOGOS.map(l => {
        const on = value === l.key;
        return (
          <div key={l.key}
            onClick={() => !disabled && onPick(l.key)}
            title={l.label}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              padding: '10px 4px', borderRadius: '9px',
              cursor: disabled ? 'default' : 'pointer',
              background: on ? C.accentDim : C.surface,
              border: `1px solid ${on ? C.accent + '99' : C.border}`,
              opacity: disabled ? 0.6 : 1,
              transition: 'background 0.15s, border-color 0.15s',
            }}>
            <span style={{ fontSize: '26px', lineHeight: 1 }}>{l.art}</span>
            <span style={{
              fontSize: '10px', color: on ? C.accent : C.muted, fontWeight: on ? 600 : 400,
              textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
            }}>
              {l.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
