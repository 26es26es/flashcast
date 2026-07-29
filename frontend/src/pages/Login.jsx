import { useState, useEffect } from 'react';
import { C, mono } from '../theme/tokens';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Btn } from '../components/Btn';
import { Tag } from '../components/Tag';
import { login as apiLogin } from '../api/auth';
import { listAdvertisers, createAdvertiser, deleteAdvertiser } from '../api/advertisers';
import { logoArt, logoLabel } from '../constants/logos';

export function Login({ onLoginSuccess }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('operator@flashcast.com');
  const [password, setPassword] = useState('dummy_hash_for_now');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState([]);

  const loadCompanies = () => {
    listAdvertisers()
      .then(r => r.ok ? r.json() : [])
      .then(setCompanies)
      .catch(() => {});
  };

  useEffect(() => { loadCompanies(); }, []);

  const handleDeleteCompany = async (co, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete company "${co.name}" and all its campaigns? This cannot be undone.`)) return;
    try {
      await deleteAdvertiser(co.id);
      if (email === co.email) setEmail('operator@flashcast.com');
      loadCompanies();
    } catch {}
  };

  const doLogin = async (loginEmail, loginPassword) => {
    const res = await apiLogin(loginEmail, loginPassword);
    if (!res.ok) throw new Error('Invalid credentials');
    const data = await res.json();
    const role = (data.role || 'advertiser').toLowerCase();
    onLoginSuccess({ token: data.token, role, email: loginEmail, id: data.id, logo: data.logo });
  };

  const handleLogin = async () => {
    setError(''); setLoading(true);
    try {
      await doLogin(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setError(''); setNotice(''); setLoading(true);
    try {
      const res = await createAdvertiser(email, password);
      if (res.status === 409) throw new Error('A company with that email already exists');
      if (!res.ok) throw new Error('Could not create company');
      await doLogin(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submit = mode === 'login' ? handleLogin : handleCreate;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: C.bg }}>
      <div style={{ width: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: `linear-gradient(135deg, ${C.accent}, ${C.blue})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px',
            }}>⚡</div>
            <span style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em' }}>FlashCast</span>
          </div>
          <div style={{ color: C.muted, fontSize: '13px', marginTop: '6px' }}>Ad Decision Engine</div>
        </div>

        <Card>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
            {['login', 'create'].map(m => (
              <div key={m} onClick={() => { setMode(m); setError(''); setNotice(''); }}
                style={{
                  flex: 1, textAlign: 'center', padding: '8px', borderRadius: '7px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600,
                  background: mode === m ? C.accentDim : 'transparent',
                  color: mode === m ? C.accent : C.muted,
                  border: `1px solid ${mode === m ? C.accent + '44' : C.border}`,
                }}>
                {m === 'login' ? 'Sign in' : 'New company'}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Email</div>
              <Input type="email" placeholder={mode === 'create' ? 'e.g. xbox_ads@flashcast.com' : ''} value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Password</div>
              <div style={{ position: 'relative' }}>
                <Input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()} style={{ paddingRight: '42px' }} />
                <span onClick={() => setShowPassword(s => !s)} title={showPassword ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', fontSize: '15px', userSelect: 'none', lineHeight: 1 }}>
                  {showPassword ? '🙈' : '👁️'}
                </span>
              </div>
            </div>
            {error && (
              <div style={{ padding: '10px 12px', borderRadius: '7px', background: C.redDim, border: `1px solid ${C.red}44`, color: C.red, fontSize: '13px' }}>
                {error}
              </div>
            )}
            {notice && (
              <div style={{ padding: '10px 12px', borderRadius: '7px', background: C.greenDim, border: `1px solid ${C.green}44`, color: C.green, fontSize: '13px' }}>
                {notice}
              </div>
            )}
            <Btn onClick={submit} disabled={loading} style={{ marginTop: '4px' }}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create company & sign in'}
            </Btn>
          </div>

          {mode === 'login' && (
            <div style={{ marginTop: '20px', padding: '12px', borderRadius: '8px', background: C.surface, border: `1px solid ${C.border}`, maxHeight: '190px', overflowY: 'auto' }}>
              <div style={{ fontSize: '11px', color: C.muted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Quick switch</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', cursor: 'pointer', gap: '8px' }}
                onClick={() => setEmail('operator@flashcast.com')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span title="Operator" style={{ fontSize: '15px', lineHeight: 1 }}>📖</span>
                  <Tag color={C.green}>Operator</Tag>
                </div>
                <span style={{ fontSize: '12px', color: C.muted, fontFamily: mono }}>operator@flashcast.com</span>
              </div>
              {companies.map(co => (
                <div key={co.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, minWidth: 0 }}
                    onClick={() => setEmail(co.email)}>
                    <span title={logoLabel(co.logo)} style={{ fontSize: '15px', lineHeight: 1 }}>{logoArt(co.logo)}</span>
                    <Tag color={C.blue}>{co.name}</Tag>
                    <span style={{ fontSize: '12px', color: C.muted, fontFamily: mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{co.email}</span>
                  </div>
                  <span title="Delete company" onClick={(e) => handleDeleteCompany(co, e)}
                    style={{ cursor: 'pointer', color: C.muted, fontSize: '16px', lineHeight: 1, padding: '0 4px' }}
                    onMouseEnter={e => e.currentTarget.style.color = C.red}
                    onMouseLeave={e => e.currentTarget.style.color = C.muted}>×</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
