import { C } from '../theme/tokens';
import { Tag } from './Tag';

export const Pill = ({ ok, children }) => (
  <Tag color={ok ? C.green : C.red}>{children}</Tag>
);
