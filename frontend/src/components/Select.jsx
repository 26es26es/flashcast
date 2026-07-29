import { C, sans } from '../theme/tokens';

export const Select = ({ style = {}, ...props }) => (
  <select style={{
    padding: '9px 12px', borderRadius: '7px', border: `1px solid ${C.border}`,
    background: C.surface, color: C.text, fontFamily: sans, fontSize: '14px',
    width: '100%', outline: 'none', cursor: 'pointer', ...style,
  }} {...props} />
);
