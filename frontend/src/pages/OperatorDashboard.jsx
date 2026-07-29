import { useState, useEffect, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { C, mono } from '../theme/tokens';
import { defaultAudience, statusColor, statusLabel, PARAM_HINTS } from '../constants/audience';
import { WS_URL } from '../api/client';
import { Card } from '../components/Card';
import { Btn } from '../components/Btn';
import { Tag } from '../components/Tag';
import { StatBox } from '../components/StatBox';
import { Header } from '../components/Header';
import { Slider } from '../components/Slider';
import { Tooltip as InfoTip } from '../components/Tooltip';
import { AudiencePanel } from '../components/AudiencePanel';
import { getAnalytics } from '../api/analytics';
import { simulateStatus, simulateStart, simulateStop } from '../api/simulate';
import { listAdvertisers } from '../api/advertisers';
import { logoArt } from '../constants/logos';
import { listAllCampaigns } from '../api/campaigns';
import { getFields } from '../api/fields';

export function OperatorDashboard({ auth, onLogout }) {
  const [simRunning, setSimRunning] = useState(false);
  const [rate, setRate] = useState(100);
  const [duration, setDuration] = useState(60);
  const [clickRate, setClickRate] = useState(10);
  const [audienceByCompany, setAudienceByCompany] = useState({});

  const [wsConnected, setWsConnected] = useState(false);
  const [decisionFeed, setDecisionFeed] = useState([]);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [totals, setTotals] = useState({ impressions: 0, approved: 0, noFill: 0, clicks: 0, spend: 0 });
  const [companies, setCompanies] = useState([]);
  const [campaignsAll, setCampaignsAll] = useState([]);
  const [selected, setSelected] = useState(null);
  const [unionFields, setUnionFields] = useState([]);

  const wsRef = useRef(null);
  const feedRef = useRef(null);
  const bufferRef = useRef([]);
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => { setWsConnected(false); setTimeout(connect, 2000); };
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.timestamp) {
            bufferRef.current.push(event);
          }
        } catch {}
      };
    };
    connect();
    const timer = setInterval(() => {
      if (bufferRef.current.length === 0) return;
      const incoming = [...bufferRef.current];
      bufferRef.current = [];

      setDecisionFeed(prev => [...incoming.reverse(), ...prev].slice(0, 80));

      let addedApproved = 0;
      let addedNoFill = 0;
      let addedSpend = 0;
      let addedClicks = 0;

      for (const ev of incoming) {
        if (ev.status === 'approved') addedApproved++;
        else addedNoFill++;
        if (ev.clicked) addedClicks++;
        addedSpend += ev.cost || 0;
      }

      setTotals(prev => ({
        impressions: prev.impressions + addedApproved,
        approved:    prev.approved    + addedApproved,
        noFill:      prev.noFill      + addedNoFill,
        clicks:      (prev.clicks || 0) + addedClicks,
        spend:       prev.spend       + addedSpend,
      }));
    }, 100);

    return () => {
      wsRef.current?.close();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await getAnalytics(auth.token, selected);
        if (res.ok) setAnalyticsData(await res.json());
      } catch {}
    };
    fetchAnalytics();
    const id = setInterval(fetchAnalytics, 3000);
    return () => clearInterval(id);
  }, [selected]);

  useEffect(() => {
    const poll = async () => {
      try {
        if (selected == null) {
          const results = await Promise.all(
            companies.map(co => simulateStatus(auth.token, co.id).then(r => r.ok ? r.json() : { running: false }).catch(() => ({ running: false })))
          );
          setSimRunning(results.some(d => d.running));
        } else {
          const res = await simulateStatus(auth.token, selected);
          if (res.ok) {
            const data = await res.json();
            setSimRunning(!!data.running);
          }
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [selected, companies]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cRes, aRes] = await Promise.all([
          listAdvertisers(),
          listAllCampaigns(auth.token),
        ]);
        if (cRes.ok) setCompanies(await cRes.json());
        if (aRes.ok) setCampaignsAll(await aRes.json());
      } catch {}
    };
    fetchData();
    const id = setInterval(fetchData, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (selected == null) { setUnionFields([]); return; }
    const load = async () => {
      try {
        const res = await getFields(auth.token, selected);
        if (res.ok) setUnionFields(await res.json());
      } catch {}
    };
    load();
  }, [selected]);

  const audience = audienceByCompany[selected ?? 'all'] || defaultAudience();
  const setAudience = (next) => setAudienceByCompany(prev => ({ ...prev, [selected ?? 'all']: next }));

  const startOne = async (advertiserId) => {
    const aud = audienceByCompany[advertiserId] || defaultAudience();
    return simulateStart(auth.token, {
      rate, duration, audience: aud,
      advertiserId,
      clickRate: clickRate / 100,
    });
  };

  const handleStart = async () => {
    try {
      if (selected == null) {
        await Promise.all(companies.map(co => startOne(co.id)));
      } else {
        const res = await startOne(selected);
        if (!(res.ok || res.status === 409)) return;
      }
      setSimRunning(true);
    } catch (e) { console.error(e); }
  };

  const handleStop = async () => {
    try {
      if (selected == null) {
        await Promise.all(companies.map(co => simulateStop(auth.token, co.id)));
      } else {
        await simulateStop(auth.token, selected);
      }
      setSimRunning(false);
    } catch (e) { console.error(e); }
  };

  const selectedCompany = selected ? companies.find(c => c.id === selected) : null;
  const scopeLabel = selectedCompany ? selectedCompany.name : 'All Companies';
  const companyCampaignIds = selected
    ? new Set(campaignsAll.filter(c => c.advertiser_id === selected).map(c => c.id))
    : null;
  const feed = companyCampaignIds
    ? decisionFeed.filter(ev => companyCampaignIds.has(ev.campaign_id))
    : decisionFeed;

  const totalImpr = companies.reduce((s, co) => s + co.impressions, 0);
  const totalSpent = companies.reduce((s, co) => s + co.spent, 0);
  const totalRemaining = companies.reduce((s, co) => s + co.remaining, 0);

  const kpis = selectedCompany
    ? [
        { label: 'Campaigns',   value: selectedCompany.campaigns.toLocaleString(),        color: C.text },
        { label: 'Impressions', value: selectedCompany.impressions.toLocaleString(),      color: C.green },
        { label: 'Spent',       value: `$${selectedCompany.spent.toFixed(2)}`,            color: C.yellow },
        { label: 'Remaining',   value: `$${selectedCompany.remaining.toFixed(2)}`,        color: C.accent },
      ]
    : [
        { label: 'Companies',   value: companies.length.toLocaleString(), color: C.text },
        { label: 'Impressions', value: totalImpr.toLocaleString(),        color: C.green },
        { label: 'Total Spent', value: `$${totalSpent.toFixed(2)}`,       color: C.yellow },
        { label: 'Remaining',   value: `$${totalRemaining.toFixed(2)}`,   color: C.accent },
      ];

  const ctr = totals.approved > 0 ? ((totals.clicks || 0) / totals.approved * 100).toFixed(1) : '0.0';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: C.bg }}>
      <Header auth={auth} onLogout={onLogout} />
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

      <div style={{
        position: 'sticky', top: 0, zIndex: 90,
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
        padding: '10px 18px', background: C.surface, borderBottom: `1px solid ${C.border}`,
      }}>
        <Btn variant="success" style={{ padding: '8px 18px' }} onClick={handleStart} disabled={simRunning || (selected == null && companies.length === 0)}>
          {simRunning ? '● Running' : selected == null ? '▶ Start All' : '▶ Start'}
        </Btn>
        <Btn variant="danger" style={{ padding: '8px 18px' }} onClick={handleStop} disabled={!simRunning}>
          {selected == null ? '■ Stop All' : '■ Stop'}
        </Btn>
        {selected == null ? (
          simRunning ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: C.green }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.green, animation: 'pulse 1.5s infinite' }} />
              Running simulators for all {companies.length} companies · {rate} req/s · {clickRate}% click rate
            </span>
          ) : (
            <span style={{ fontSize: '13px', color: C.muted }}>Start runs a simulator for every company; Stop halts them all. This tab shows all companies' spend.</span>
          )
        ) : simRunning ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: C.green }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.green, animation: 'pulse 1.5s infinite' }} />
            {scopeLabel}: {rate} req/s · {clickRate}% click rate for {duration}s
          </span>
        ) : (
          <span style={{ fontSize: '13px', color: C.muted }}>Idle — configure {scopeLabel}'s simulator below and press Start.</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '18px', fontSize: '13px', fontFamily: mono }}>
          <span style={{ color: C.muted }}>Served <span style={{ color: C.text }}>{totals.approved.toLocaleString()}</span></span>
          <span style={{ color: C.muted }}>Clicks <span style={{ color: C.blue }}>{(totals.clicks || 0).toLocaleString()}</span></span>
          <span style={{ color: C.muted }}>CTR <span style={{ color: C.green }}>{ctr}%</span></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: wsConnected ? C.green : C.red }} />
            <span style={{ color: wsConnected ? C.green : C.red }}>{wsConnected ? 'WS' : 'WS ✗'}</span>
          </span>
        </div>
      </div>

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {kpis.map(s => (
            <Card key={s.label} style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
              <StatBox {...s} />
            </Card>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '12px', height: '340px' }}>

          <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Live Decision Feed <span style={{ color: C.accent }}>· {scopeLabel}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Tag color={C.blue}>★ CLICK</Tag>
                <Tag color={C.green}>WON</Tag>
                <Tag color={C.muted}>NO FILL</Tag>
                <Tag color={C.red}>BUDGET ✗</Tag>
              </div>
            </div>
            <div ref={feedRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 0' }}>
              {feed.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
                  {selectedCompany ? `No decisions for ${scopeLabel} yet.` : 'Waiting for decisions… start the simulator or send traffic.'}
                </div>
              ) : feed.map((ev, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '84px 76px 1fr 60px 78px',
                  alignItems: 'center', padding: '5px 18px', gap: '10px',
                  borderLeft: `3px solid ${statusColor(ev.status)}`,
                  marginBottom: '2px',
                  background: i === 0 ? statusColor(ev.status) + '11' : 'transparent',
                  transition: 'background 0.3s',
                }}>
                  <span style={{ fontSize: '11px', fontFamily: mono, color: C.muted }}>
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                  <Tag color={ev.clicked ? C.blue : statusColor(ev.status)}>
                    {ev.clicked ? '★ CLICK' : statusLabel(ev.status)}
                  </Tag>
                  <span style={{ fontSize: '12px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {ev.status === 'approved' ? ev.campaign_name || `Campaign #${ev.campaign_id}` : '—'}
                  </span>
                  <span style={{ fontSize: '11px', fontFamily: mono, color: C.muted }}>{ev.category}</span>
                  <span style={{ fontSize: '12px', fontFamily: mono, color: ev.cost > 0 ? C.yellow : C.muted, textAlign: 'right' }}>
                    {ev.cost > 0 ? `$${ev.cost.toFixed(5)}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Company Budgets</div>
              <span style={{ fontSize: '11px', fontFamily: mono, color: C.muted }}>{companies.length} companies</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 12px' }}>
              <div onClick={() => setSelected(null)}
                style={{
                  padding: '8px 10px', marginBottom: '8px', borderRadius: '7px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600,
                  background: selected === null ? C.accentDim : C.surface,
                  border: `1px solid ${selected === null ? C.accent + '55' : C.border}`,
                  color: selected === null ? C.accent : C.text,
                }}>
                All Companies
              </div>
              {companies.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>No companies found.</div>
              ) : companies.map(co => {
                const pct = co.total_budget > 0 ? Math.min(100, (co.spent / co.total_budget) * 100) : 0;
                const barColor = pct >= 95 ? C.red : pct >= 70 ? C.yellow : C.green;
                const active = selected === co.id;
                return (
                  <div key={co.id} onClick={() => setSelected(co.id)}
                    style={{
                      padding: '9px 10px', marginBottom: '7px', borderRadius: '7px', cursor: 'pointer',
                      background: active ? C.accentDim : 'transparent',
                      border: `1px solid ${active ? C.accent + '55' : 'transparent'}`,
                      transition: 'background 0.15s',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        <span style={{ marginRight: '5px' }}>{logoArt(co.logo)}</span>
                        {co.name}
                        <span style={{ color: C.muted, fontWeight: 400 }}> · {co.campaigns} camp.</span>
                      </span>
                      <span style={{ fontSize: '11px', fontFamily: mono, color: C.muted, whiteSpace: 'nowrap' }}>
                        ${co.spent.toFixed(0)} / ${co.total_budget.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ height: '7px', borderRadius: '4px', background: C.surface, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '4px', transition: 'width 0.4s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', height: '220px' }}>
          <Card style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Impressions over Time <span style={{ color: C.accent }}>· {scopeLabel}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analyticsData}>
                  <defs>
                    <linearGradient id="gimp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.accent} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="minute" stroke={C.muted} tick={{ fontSize: 10, fontFamily: mono }} tickFormatter={v => v ? v.slice(11, 19) : ''} />
                  <YAxis stroke={C.muted} tick={{ fontSize: 10, fontFamily: mono }} />
                  <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, fontSize: '12px' }} />
                  <Area type="monotone" dataKey="impressions" stroke={C.accent} fill="url(#gimp)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Spend over Time ($) <span style={{ color: C.accent }}>· {scopeLabel}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analyticsData}>
                  <defs>
                    <linearGradient id="gspend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.yellow} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={C.yellow} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="minute" stroke={C.muted} tick={{ fontSize: 10, fontFamily: mono }} tickFormatter={v => v ? v.slice(11, 19) : ''} />
                  <YAxis stroke={C.muted} tick={{ fontSize: 10, fontFamily: mono }} />
                  <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: '8px', color: C.text, fontSize: '12px' }} />
                  <Area type="monotone" dataKey="spend" stroke={C.yellow} fill="url(#gspend)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {selected != null && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>Traffic Simulator · {scopeLabel}</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Btn variant="success" style={{ padding: '9px 20px' }} onClick={handleStart} disabled={simRunning}>
                {simRunning ? '● Running' : '▶ Start'}
              </Btn>
              <Btn variant="danger" style={{ padding: '9px 20px' }} onClick={handleStop} disabled={!simRunning}>■ Stop</Btn>
            </div>
          </div>

          <div style={{ marginBottom: '20px', padding: '14px 16px', borderRadius: '10px', background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: unionFields.length === 0 ? 0 : '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Fields in play
                <span style={{ color: C.accent, marginLeft: '6px' }}>· {scopeLabel}</span>
                <InfoTip text="The union of every targeting field used across this company's campaigns. Each simulated viewer is generated with a value for all of these; each campaign is scored only on the fields it declares." />
              </div>
              {unionFields.length > 0 && (
                <span style={{ fontSize: '11px', fontFamily: mono, color: C.muted, padding: '2px 8px', borderRadius: '10px', background: C.panel, border: `1px solid ${C.border}` }}>
                  {unionFields.length} {unionFields.length === 1 ? 'field' : 'fields'}
                </span>
              )}
            </div>
            {unionFields.length === 0 ? (
              <div style={{ fontSize: '12px', color: C.muted }}>No campaign fields yet — the default field set is used.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
                {unionFields.map(f => (
                  <div key={f.key} title={f.description || ''} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', borderRadius: '8px',
                    background: C.panel, border: `1px solid ${C.border}`,
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.accent, flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.label || f.key}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '9px', fontFamily: mono, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                      {(f.kind && f.kind.type) === 'categorical' ? 'set' : (f.kind && f.kind.type) || ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px', alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '16px' }}>Traffic</div>
              <Slider label="Rate" value={rate} min={10} max={2000} step={10} unit="req/s"
                onChange={setRate} disabled={simRunning} />
              <Slider label="Duration" value={duration} min={10} max={300} step={10} unit="sec"
                onChange={setDuration} disabled={simRunning} />
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '2px' }}>
                Click Rate<InfoTip text={PARAM_HINTS.click_rate} />
              </div>
              <Slider label="" value={clickRate} min={0} max={100} step={1} unit="%"
                onChange={setClickRate} disabled={simRunning} />
              <div style={{ marginTop: '8px', padding: '12px', borderRadius: '8px', background: C.surface, border: `1px solid ${C.border}`, fontSize: '12px', color: C.muted, lineHeight: 1.6 }}>
                Sends <span style={{ color: C.text, fontFamily: mono }}>{rate}</span> ad requests/sec for{' '}
                <span style={{ color: C.text, fontFamily: mono }}>{duration}</span>s. Which ad is shown is decided by how
                well each viewer matches the campaigns; whether they click is a constant{' '}
                <span style={{ color: C.text, fontFamily: mono }}>{clickRate}%</span>.
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '16px' }}>👥 Audience — Demographics</div>
              <AudiencePanel a={audience} set={setAudience} disabled={simRunning} section="demographics" />
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '16px' }}>👥 Audience — Traits & Interests</div>
              <AudiencePanel a={audience} set={setAudience} disabled={simRunning} section="traits" />
            </div>
          </div>
        </Card>
        )}

      </div>
    </div>
  );
}
