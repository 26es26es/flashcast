import { C } from '../theme/tokens';

export const Card = ({ children, style = {} }) => (
  <div style={{
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: '12px', padding: '24px', ...style,
  }}>{children}</div>
);
