import { C, mono } from '../theme/tokens';
import { Tag } from './Tag';
import { Btn } from './Btn';
import { logoArt, logoLabel } from '../constants/logos';

export function Header({ auth, onLogout }) {
  const roleColor = auth.role === 'operator' ? C.green : C.blue;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '16px 32px', borderBottom: `1px solid ${C.border}`,
      background: C.surface, position: 'sticky', top: 0, zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '7px',
          background: `linear-gradient(135deg, ${C.accent}, ${C.blue})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
        }}>⚡</div>
        <span style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>FlashCast</span>
        <span style={{ color: C.border }}>|</span>
        <Tag color={roleColor}>{auth.role.toUpperCase()}</Tag>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '46px' }}>
        {auth.role === 'advertiser' && (
          <span title={logoLabel(auth.logo)} style={{ fontSize: '18px', lineHeight: 1 }}>{logoArt(auth.logo)}</span>
        )}
        <span style={{ fontSize: '13px', color: C.muted, fontFamily: mono }}>{auth.email}</span>
        <Btn variant="ghost" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={onLogout}>Sign out</Btn>
      </div>
    </div>
  );
}
