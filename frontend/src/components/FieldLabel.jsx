import { C } from '../theme/tokens';
import { Tooltip } from './Tooltip';

export const FieldLabel = ({ children, hint }) => (
  <div style={{ display: 'flex', alignItems: 'center', fontSize: '11px', color: C.muted, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
    <span>{children}</span>
    <Tooltip text={hint} />
  </div>
);
