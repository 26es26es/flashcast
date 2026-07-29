import { C } from '../theme/tokens';

export const Chip = ({ on, onClick, children }) => (
  <span onClick={onClick} style={{
    padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', userSelect: 'none',
    background: on ? C.accentDim : 'transparent', color: on ? C.accent : C.muted,
    border: `1px solid ${on ? C.accent + '55' : C.border}`,
  }}>{children}</span>
);
