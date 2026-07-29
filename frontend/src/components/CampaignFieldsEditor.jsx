import { C } from '../theme/tokens';
import { Input } from './Input';
import { Select } from './Select';
import { Btn } from './Btn';
import { Chip } from './Chip';
import { FieldLabel } from './FieldLabel';
import { TriToggle } from './TriToggle';
import { Tooltip } from './Tooltip';

function defaultKind(type) {
  if (type === 'range') return { type: 'range', min: 1, max: 10, falloff: 3 };
  if (type === 'categorical') return { type: 'categorical', options: [] };
  return { type: 'boolean' };
}

function defaultTarget(kind) {
  if (kind.type === 'range') return { type: 'range', lo: kind.min, hi: kind.max };
  if (kind.type === 'categorical') return { type: 'set', values: [] };
  return { type: 'want', value: null };
}

function blankField() {
  const kind = defaultKind('range');
  return { key: '', label: '', description: '', weight: 0.8, kind, target: defaultTarget(kind), forced: false };
}

export function CampaignFieldsEditor({ fields, set }) {
  const list = fields || [];
  const updField = (i, patch) => set(list.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const updKind = (i, kindPatch) => {
    const kind = { ...list[i].kind, ...kindPatch };
    updField(i, { kind, target: defaultTarget(kind) });
  };
  const updTarget = (i, target) => updField(i, { target });
  const setRange = (i, lo, hi) => {
    const kind = { ...list[i].kind, min: lo, max: hi };
    updField(i, { kind, target: { type: 'range', lo, hi } });
  };
  const addField = () => set([...list, blankField()]);
  const removeField = (i) => set(list.filter((_, idx) => idx !== i));

  const numBox = (val, on) => (
    <Input type="number" value={val} onChange={on} style={{ width: '72px' }} />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {list.length === 0 && (
        <div style={{ fontSize: '13px', color: C.muted }}>
          No targeting fields yet. Add fields this campaign should be matched on.
        </div>
      )}

      {list.map((f, i) => (
        <div key={i} style={{ padding: '14px', borderRadius: '9px', border: `1px solid ${C.border}`, background: C.surface, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '10px' }}>
            <div>
              <FieldLabel>Key</FieldLabel>
              <Input value={f.key} placeholder="pet_owner" onChange={e => updField(i, { key: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Label</FieldLabel>
              <Input value={f.label} placeholder="Pet owner" onChange={e => updField(i, { label: e.target.value })} />
            </div>
            <div>
              <FieldLabel hint="How much this field counts toward the match score.">Weight</FieldLabel>
              <Input type="number" step="0.1" min="0" max="1" value={f.weight} onChange={e => updField(i, { weight: Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <FieldLabel>Description</FieldLabel>
            <Input value={f.description} placeholder="Shown as a tooltip." onChange={e => updField(i, { description: e.target.value })} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '10px', alignItems: 'start' }}>
            <div>
              <FieldLabel>Type</FieldLabel>
              <Select value={f.kind.type} onChange={e => updKind(i, defaultKind(e.target.value))}>
                <option value="range">Range</option>
                <option value="categorical">Categorical</option>
                <option value="boolean">Boolean</option>
              </Select>
            </div>

            {f.kind.type === 'range' && (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div>
                  <FieldLabel hint="The span of values this campaign targets. Viewers inside it match fully; outside it, the match fades.">Target range: {f.target.lo}–{f.target.hi}</FieldLabel>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {numBox(f.target.lo, e => setRange(i, Number(e.target.value), f.target.hi))}
                    <span style={{ color: C.muted }}>→</span>
                    {numBox(f.target.hi, e => setRange(i, f.target.lo, Number(e.target.value)))}
                  </div>
                </div>
                <div style={{ width: '90px' }}>
                  <FieldLabel hint="How quickly the match decays for viewers outside the target range. Higher = more forgiving.">Falloff</FieldLabel>
                  {numBox(f.kind.falloff, e => updKind(i, { falloff: Number(e.target.value) }))}
                </div>
              </div>
            )}

            {f.kind.type === 'categorical' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <FieldLabel>Options (comma separated)</FieldLabel>
                  <Input value={f.kind.options.join(', ')}
                    onChange={e => updKind(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                </div>
                <div>
                  <FieldLabel>Target (empty = any)</FieldLabel>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {f.kind.options.map(opt => {
                      const on = (f.target.values || []).includes(opt);
                      return (
                        <Chip key={opt} on={on} onClick={() => updTarget(i, {
                          type: 'set',
                          values: on ? f.target.values.filter(x => x !== opt) : [...(f.target.values || []), opt],
                        })}>{opt}</Chip>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {f.kind.type === 'boolean' && (
              <div>
                <TriToggle label="Target" value={f.target.value} onChange={value => updTarget(i, { type: 'want', value })} />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div
              onClick={() => updField(i, { forced: !f.forced })}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none',
                padding: '5px 10px', borderRadius: '7px',
                background: f.forced ? C.redDim : 'transparent',
                border: `1px solid ${f.forced ? C.red + '66' : C.border}`,
              }}>
              <span style={{
                width: '30px', height: '16px', borderRadius: '9px', position: 'relative', flexShrink: 0,
                background: f.forced ? C.red : C.border, transition: 'background 0.15s',
              }}>
                <span style={{
                  position: 'absolute', top: '2px', left: f.forced ? '16px' : '2px',
                  width: '12px', height: '12px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
                }} />
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: f.forced ? C.red : C.muted }}>Forced</span>
              <Tooltip text="When on, a viewer whose value falls outside this field disqualifies the campaign entirely — it is removed from the auction rather than just scoring lower." />
            </div>
            <Btn variant="danger" style={{ padding: '5px 12px', fontSize: '12px' }} onClick={() => removeField(i)}>Remove field</Btn>
          </div>
        </div>
      ))}

      <Btn variant="ghost" onClick={addField}>+ Add field</Btn>
    </div>
  );
}
