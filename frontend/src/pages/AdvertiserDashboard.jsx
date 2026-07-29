import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { C, mono } from '../theme/tokens';
import { PARAM_HINTS, DEFAULT_FIELD_SCHEMA } from '../constants/audience';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Btn } from '../components/Btn';
import { Tag } from '../components/Tag';
import { Pill } from '../components/Pill';
import { StatBox } from '../components/StatBox';
import { Header } from '../components/Header';
import { Tooltip } from '../components/Tooltip';
import { CampaignFieldsEditor } from '../components/CampaignFieldsEditor';
import { LogoPicker } from '../components/LogoPicker';
import { DEFAULT_LOGO, logoArt, logoLabel } from '../constants/logos';
import { changePassword as apiChangePassword } from '../api/auth';
import { getAdvertiserLogo, updateAdvertiserLogo } from '../api/advertisers';
import {
  listMyCampaigns, createCampaign, updateCampaign, deleteCampaign as apiDeleteCampaign,
  activateCampaign as apiActivateCampaign, purgeCampaign as apiPurgeCampaign, adjustBudget,
} from '../api/campaigns';
import { getAnalytics } from '../api/analytics';

export function AdvertiserDashboard({ auth, onLogout, onLogoChange }) {
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState({ name: '', budget: 1000, cpm: 12.5, category: 'gaming', targetFields: DEFAULT_FIELD_SCHEMA });
  const [creating, setCreating] = useState(false);
  const [statusTab, setStatusTab] = useState('active');
  const [view, setView] = useState('list');

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', budget: 1000, cpm: 12.5, category: 'gaming', targetFields: DEFAULT_FIELD_SCHEMA });
    setView('form');
  };
  const backToList = () => { setView('list'); setEditing(null); };

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await listMyCampaigns(auth.token);
      if (res.ok) setCampaigns(await res.json());
    } catch (e) { console.error(e); }
  }, [auth.token]);

  useEffect(() => {
    fetchCampaigns();
    const id = setInterval(fetchCampaigns, 5000);
    return () => clearInterval(id);
  }, [fetchCampaigns]);

  const [analyticsData, setAnalyticsData] = useState([]);
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await getAnalytics(auth.token);
        if (res.ok) {
          const points = await res.json();
          setAnalyticsData(points.map(p => ({
            ...p,
            click_rate_pct: p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0,
          })));
        }
      } catch {}
    };
    fetchAnalytics();
    const id = setInterval(fetchAnalytics, 3000);
    return () => clearInterval(id);
  }, [auth.token]);

  const handleCreate = async (status = 'active') => {
    setCreating(true);
    try {
      const res = await createCampaign(auth.token, {
        name: form.name,
        total_budget: parseFloat(form.budget),
        max_cpm: parseFloat(form.cpm),
        target_categories: [form.category],
        status,
        target_fields: form.targetFields,
      });
      if (res.ok) {
        setForm({ name: '', budget: 1000, cpm: 12.5, category: 'gaming', targetFields: DEFAULT_FIELD_SCHEMA });

        setStatusTab(status === 'draft' ? 'draft' : 'active');
        setView('list');
        await fetchCampaigns();
      }
    } catch (e) { console.error(e); }
    setCreating(false);
  };

  const activateCampaign = async (c) => {
    try {
      await apiActivateCampaign(auth.token, c.id);
      setStatusTab(statusOf(c) === 'deleted' ? 'draft' : 'active');
      await fetchCampaigns();
    } catch (e) { console.error(e); }
  };

  const [armedPurge, setArmedPurge] = useState(null);

  const purgeCampaign = async (c) => {
    if (armedPurge !== c.id) {
      setArmedPurge(c.id);
      return;
    }

    if (!window.confirm(`Permanently delete "${c.name}"? This CANNOT be undone.`)) {
      setArmedPurge(null);
      return;
    }
    try {
      await apiPurgeCampaign(auth.token, c.id);
      await fetchCampaigns();
    } catch (e) { console.error(e); }
    setArmedPurge(null);
  };

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', cpm: 0, category: 'gaming', addBudget: '', targetFields: [] });
  const [saving, setSaving] = useState(false);

  const openEdit = (c) => {
    setEditing(c);
    setEditForm({
      name: c.name,
      cpm: c.max_cpm,
      category: (c.target_categories && c.target_categories[0]) || 'gaming',
      addBudget: '',
      targetFields: (c.target_fields && c.target_fields.length > 0) ? c.target_fields : DEFAULT_FIELD_SCHEMA,
    });
    setView('form');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateCampaign(auth.token, editing.id, {
        name: editForm.name,
        max_cpm: parseFloat(editForm.cpm),
        target_categories: [editForm.category],
        target_fields: editForm.targetFields,
      });
      const adjust = parseFloat(editForm.addBudget);
      if (adjust && adjust !== 0) {
        const budgetRes = await adjustBudget(auth.token, editing.id, adjust);
        if (budgetRes.status === 409) {
          await fetchCampaigns();
          window.alert('Cannot remove more than the remaining budget.');
          setSaving(false);
          return;
        }
      }
      await fetchCampaigns();
      setEditing(null);
      setView('list');
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const [logoOpen, setLogoOpen] = useState(false);
  const [logo, setLogo] = useState(auth.logo || DEFAULT_LOGO);
  const [logoSaving, setLogoSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await getAdvertiserLogo(auth.token, auth.id);
        if (res.ok) {
          const { logo: current } = await res.json();
          setLogo(current);
          onLogoChange?.(current);
        }
      } catch {}
    })();
  }, [auth.token, auth.id, onLogoChange]);

  const pickLogo = async (key) => {
    const previous = logo;
    setLogo(key);
    setLogoSaving(true);
    try {
      const res = await updateAdvertiserLogo(auth.token, auth.id, key);
      if (res.ok) onLogoChange?.(key);
      else setLogo(previous);
    } catch { setLogo(previous); }
    setLogoSaving(false);
  };

  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '' });
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  const changePassword = async () => {
    setPwMsg(null);
    if (!pwForm.next) { setPwMsg({ ok: false, text: 'Enter a new password.' }); return; }
    setPwSaving(true);
    try {
      const res = await apiChangePassword(auth.token, pwForm.current, pwForm.next);
      if (res.status === 401) setPwMsg({ ok: false, text: 'Current password is incorrect.' });
      else if (!res.ok) setPwMsg({ ok: false, text: 'Could not update password.' });
      else { setPwMsg({ ok: true, text: 'Password updated.' }); setPwForm({ current: '', next: '' }); }
    } catch { setPwMsg({ ok: false, text: 'Network error.' }); }
    setPwSaving(false);
  };

  const deleteCampaign = async () => {
    if (!editing) return;
    if (!window.confirm(`Delete campaign "${editing.name}"? It will move to the Deleted tab and stop serving ads. You can restore it later.`)) return;
    setSaving(true);
    try {
      await apiDeleteCampaign(auth.token, editing.id);
      await fetchCampaigns();
      setEditing(null);
      setView('list');
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const statusOf = (c) => c.status || 'active';
  const counts = {
    active:  campaigns.filter(c => statusOf(c) === 'active').length,
    draft:   campaigns.filter(c => statusOf(c) === 'draft').length,
    deleted: campaigns.filter(c => statusOf(c) === 'deleted').length,
  };
  const visibleCampaigns = campaigns.filter(c => statusOf(c) === statusTab);

  const activeCampaigns = campaigns.filter(c => statusOf(c) === 'active');
  const totalBudget = activeCampaigns.reduce((s, c) => s + c.total_budget, 0);
  const totalSpent  = activeCampaigns.reduce((s, c) => s + c.spent, 0);
  const totalImpr   = activeCampaigns.reduce((s, c) => s + c.impressions, 0);

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Header auth={auth} onLogout={onLogout} />
      <div style={{ padding: '28px 32px', maxWidth: '1200px', margin: '0 auto' }}>

        <Card style={{ marginBottom: '20px', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setLogoOpen(o => !o)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px', lineHeight: 1 }}>{logoArt(logo)}</span>
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Company Logo
              </div>
              <span style={{ fontSize: '12px', color: C.muted }}>{logoLabel(logo)}</span>
            </div>
            <span style={{ color: C.muted, fontSize: '13px' }}>{logoOpen ? '▲' : '▼'}</span>
          </div>
          {logoOpen && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '12px' }}>
                Pick a logo to represent your company. It appears in your header and on the operator's company list.
              </div>
              <LogoPicker value={logo} onPick={pickLogo} disabled={logoSaving} />
            </div>
          )}
        </Card>

        <Card style={{ marginBottom: '20px', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => { setPwOpen(o => !o); setPwMsg(null); }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              🔒 Change Password
            </div>
            <span style={{ color: C.muted, fontSize: '13px' }}>{pwOpen ? '▲' : '▼'}</span>
          </div>
          {pwOpen && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ fontSize: '11px', color: C.muted, marginBottom: '5px' }}>CURRENT PASSWORD</div>
                  <Input type={showPw ? 'text' : 'password'} value={pwForm.current}
                    onChange={e => setPwForm({ ...pwForm, current: e.target.value })} />
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ fontSize: '11px', color: C.muted, marginBottom: '5px' }}>NEW PASSWORD</div>
                  <Input type={showPw ? 'text' : 'password'} value={pwForm.next}
                    onChange={e => setPwForm({ ...pwForm, next: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && changePassword()} />
                </div>
                <Btn onClick={changePassword} disabled={pwSaving}>
                  {pwSaving ? 'Saving…' : 'Update'}
                </Btn>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <span onClick={() => setShowPw(s => !s)}
                  style={{ fontSize: '12px', color: C.muted, cursor: 'pointer', userSelect: 'none' }}>
                  {showPw ? '🙈 Hide passwords' : '👁️ Show passwords'}
                </span>
                {pwMsg && (
                  <span style={{ fontSize: '13px', color: pwMsg.ok ? C.green : C.red }}>{pwMsg.text}</span>
                )}
              </div>
            </div>
          )}
        </Card>

        {view === 'form' ? (

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>
                {editing ? `Edit Campaign #${editing.id}` : 'Create New Campaign'}
              </div>
              <Btn variant="ghost" onClick={backToList} disabled={creating || saving}>← Back to campaigns</Btn>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '32px', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Basics</div>
                <div>
                  <div style={{ fontSize: '11px', color: C.muted, marginBottom: '5px' }}>NAME</div>
                  <Input placeholder="e.g. Summer Sale 2025"
                    value={editing ? editForm.name : form.name}
                    onChange={e => editing ? setEditForm({ ...editForm, name: e.target.value }) : setForm({ ...form, name: e.target.value })} />
                </div>
                {!editing && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '11px', color: C.muted, marginBottom: '5px' }}>
                      TOTAL BUDGET ($)<Tooltip text={PARAM_HINTS.budget} />
                    </div>
                    <Input type="number" value={form.budget}
                      onChange={e => setForm({ ...form, budget: e.target.value })} />
                  </div>
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '11px', color: C.muted, marginBottom: '5px' }}>
                    MAX CPM ($)<Tooltip text={PARAM_HINTS.cpm} />
                  </div>
                  <Input type="number" step="0.1"
                    value={editing ? editForm.cpm : form.cpm}
                    onChange={e => editing ? setEditForm({ ...editForm, cpm: e.target.value }) : setForm({ ...form, cpm: e.target.value })} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '11px', color: C.muted, marginBottom: '5px' }}>
                    CATEGORY<Tooltip text={PARAM_HINTS.category} />
                  </div>
                  <Select
                    value={editing ? editForm.category : form.category}
                    onChange={e => editing ? setEditForm({ ...editForm, category: e.target.value }) : setForm({ ...form, category: e.target.value })}>
                    <option value="gaming">Gaming</option>
                    <option value="sports">Sports</option>
                    <option value="music">Music</option>
                    <option value="tech">Tech</option>
                    <option value="finance">Finance</option>
                  </Select>
                </div>
                {editing && (
                  <div>
                    <div style={{ fontSize: '11px', color: C.muted, marginBottom: '5px' }}>
                      ADJUST BUDGET ($) — positive adds, negative removes
                      <span style={{ marginLeft: '8px', fontFamily: mono, color: C.muted }}>
                        (${editing.remaining.toFixed(2)} / ${editing.total_budget.toLocaleString()} left)
                      </span>
                    </div>
                    <Input type="number" step="1" placeholder="0" value={editForm.addBudget}
                      onChange={e => setEditForm({ ...editForm, addBudget: e.target.value })} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  🎯 Targeting Fields
                  <Tooltip text="Fields this campaign is matched on. Each field has its own type, value range or options, target, and weight. Campaigns can define as many or as few as they want." />
                </div>
                {editing
                  ? <CampaignFieldsEditor fields={editForm.targetFields} set={tf => setEditForm({ ...editForm, targetFields: tf })} />
                  : <CampaignFieldsEditor fields={form.targetFields} set={tf => setForm({ ...form, targetFields: tf })} />}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '28px', borderTop: `1px solid ${C.border}`, paddingTop: '20px' }}>
              {editing ? (
                <>
                  <Btn onClick={saveEdit} disabled={saving || !editForm.name}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
                  <Btn variant="ghost" onClick={backToList} disabled={saving}>Cancel</Btn>
                  <Btn variant="danger" onClick={deleteCampaign} disabled={saving} style={{ marginLeft: 'auto' }}>Delete Campaign</Btn>
                </>
              ) : (
                <>
                  <Btn onClick={() => handleCreate('active')} disabled={creating || !form.name}>
                    {creating ? 'Working…' : 'Publish Campaign'}
                  </Btn>
                  <Btn variant="ghost" onClick={() => handleCreate('draft')} disabled={creating || !form.name}>
                    💾 Save as Draft
                  </Btn>
                  <Btn variant="ghost" onClick={backToList} disabled={creating} style={{ marginLeft: 'auto' }}>Cancel</Btn>
                </>
              )}
            </div>
          </Card>
        ) : (

          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
              {[
                { label: 'Total Budget', value: `$${totalBudget.toLocaleString()}`, color: C.text },
                { label: 'Total Spent', value: `$${totalSpent.toFixed(2)}`, color: C.yellow },
                { label: 'Impressions', value: totalImpr.toLocaleString(), color: C.accent },
              ].map(s => (
                <Card key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                  <StatBox {...s} />
                </Card>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', height: '220px', marginBottom: '20px' }}>
              <Card style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  Ads Shown over Time
                  <Tooltip text="How many of your ads are being shown live, in 5-second buckets over the last 10 minutes." />
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analyticsData}>
                      <defs>
                        <linearGradient id="gshown" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.accent} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="minute" stroke={C.muted} tick={{ fontSize: 10, fontFamily: mono }} tickFormatter={v => v ? v.slice(11, 19) : ''} />
                      <YAxis stroke={C.muted} tick={{ fontSize: 10, fontFamily: mono }} />
                      <ChartTooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, fontSize: '12px' }} />
                      <Area type="monotone" dataKey="impressions" stroke={C.accent} fill="url(#gshown)" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  Click Rate over Time (%)
                  <Tooltip text="Live click rate: clicks divided by ads shown, in 5-second buckets over the last 10 minutes." />
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analyticsData}>
                      <defs>
                        <linearGradient id="gclickrate" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={C.green} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="minute" stroke={C.muted} tick={{ fontSize: 10, fontFamily: mono }} tickFormatter={v => v ? v.slice(11, 19) : ''} />
                      <YAxis stroke={C.muted} tick={{ fontSize: 10, fontFamily: mono }} domain={[0, 100]} />
                      <ChartTooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, fontSize: '12px' }} />
                      <Area type="monotone" dataKey="click_rate_pct" stroke={C.green} fill="url(#gclickrate)" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <Btn onClick={openCreate} style={{ padding: '11px 22px', fontSize: '14px' }}>+ Create New Campaign</Btn>
            </div>

            <Card style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { key: 'active',  label: 'Active',  color: C.green },
                    { key: 'draft',   label: 'Drafts',  color: C.yellow },
                    { key: 'deleted', label: 'Deleted', color: C.red },
                  ].map(t => {
                    const on = statusTab === t.key;
                    return (
                      <div key={t.key} onClick={() => { setStatusTab(t.key); setArmedPurge(null); }}
                        style={{
                          padding: '6px 14px', borderRadius: '7px', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 600,
                          background: on ? t.color + '22' : 'transparent',
                          color: on ? t.color : C.muted,
                          border: `1px solid ${on ? t.color + '55' : C.border}`,
                        }}>
                        {t.label}
                        <span style={{ marginLeft: '6px', fontFamily: mono, opacity: 0.8 }}>{counts[t.key]}</span>
                      </div>
                    );
                  })}
                </div>
                <Btn variant="ghost" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={fetchCampaigns}>↻ Refresh</Btn>
              </div>
              {visibleCampaigns.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: C.muted, fontSize: '14px' }}>
                  {statusTab === 'active' && 'No active campaigns. Click “+ Create New Campaign” to start.'}
                  {statusTab === 'draft' && 'No drafts yet. Use “Save as Draft” or restore a deleted campaign to park one here.'}
                  {statusTab === 'deleted' && 'No deleted campaigns.'}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        {['ID', 'Name', 'CPM', 'Budget', 'Spent', 'Remaining', 'Impressions', 'Status', ''].map((h, hi) => (
                          <th key={hi} style={{ padding: '14px 20px', textAlign: 'left', color: C.muted, fontWeight: 500, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: `1px solid ${C.border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCampaigns.map((c, i) => (
                        <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.surface + '88', opacity: statusTab === 'deleted' ? 0.72 : 1 }}>
                          <td style={{ padding: '16px 20px', fontFamily: mono, color: C.muted }}>{c.id}</td>
                          <td style={{ padding: '16px 20px', fontWeight: 500 }}>{c.name}</td>
                          <td style={{ padding: '16px 20px', fontFamily: mono }}>${c.max_cpm.toFixed(2)}</td>
                          <td style={{ padding: '16px 20px', fontFamily: mono }}>${c.total_budget.toLocaleString()}</td>
                          <td style={{ padding: '16px 20px', fontFamily: mono, color: C.yellow }}>${c.spent.toFixed(2)}</td>
                          <td style={{ padding: '16px 20px', fontFamily: mono, color: C.green }}>${c.remaining.toFixed(2)}</td>
                          <td style={{ padding: '16px 20px', fontFamily: mono, color: C.accent }}>{c.impressions.toLocaleString()}</td>
                          <td style={{ padding: '16px 20px' }}>
                            {statusTab === 'active'  && <Pill ok={c.is_active}>{c.is_active ? 'LIVE' : 'PAUSED'}</Pill>}
                            {statusTab === 'draft'   && <Tag color={C.yellow}>DRAFT</Tag>}
                            {statusTab === 'deleted' && <Tag color={C.red}>DELETED</Tag>}
                          </td>
                          <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                            {statusTab === 'active' && (
                              <Btn variant="ghost" style={{ padding: '5px 14px', fontSize: '12px' }} onClick={() => openEdit(c)}>Edit</Btn>
                            )}
                            {statusTab === 'draft' && (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <Btn variant="ghost" style={{ padding: '5px 14px', fontSize: '12px' }} onClick={() => openEdit(c)}>Edit</Btn>
                                <Btn variant="success" style={{ padding: '5px 14px', fontSize: '12px' }} onClick={() => activateCampaign(c)}>Publish</Btn>
                              </div>
                            )}
                            {statusTab === 'deleted' && (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <Btn variant="ghost" style={{ padding: '5px 14px', fontSize: '12px' }} onClick={() => activateCampaign(c)}>Restore</Btn>
                                <Btn variant="danger" style={{ padding: '5px 14px', fontSize: '12px' }} onClick={() => purgeCampaign(c)}>
                                  {armedPurge === c.id ? 'Click to confirm' : 'Delete Forever'}
                                </Btn>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
