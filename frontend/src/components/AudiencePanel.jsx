import { C } from '../theme/tokens';
import { INTERESTS, AUDIENCE_PRESETS } from '../constants/audience';
import { Chip } from './Chip';
import { FieldLabel } from './FieldLabel';
import { RatioSlider } from './RatioSlider';

export function AudiencePanel({ a, set, disabled, section }) {
  const upd = (patch) => set({ ...a, ...patch });
  const numBox = (val, on) => (
    <input type="number" value={val} disabled={disabled} onChange={on}
      style={{ width: '52px', padding: '4px 6px', borderRadius: '5px', border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: '12px' }} />
  );
  const showDemo = !section || section === 'demographics';
  const showTraits = !section || section === 'traits';
  return (
    <div style={{ opacity: disabled ? 0.55 : 1 }}>
      {showDemo && (
        <>
          <FieldLabel>Preset</FieldLabel>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {Object.keys(AUDIENCE_PRESETS).map(name => (
              <Chip key={name} on={false} onClick={() => !disabled && set({ ...AUDIENCE_PRESETS[name] })}>{name}</Chip>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
            <FieldLabel>Age</FieldLabel>
            {numBox(a.age_min, e => upd({ age_min: Number(e.target.value) }))}
            <span style={{ color: C.muted }}>→</span>
            {numBox(a.age_max, e => upd({ age_max: Number(e.target.value) }))}
          </div>

          <RatioSlider label="Male ratio" value={a.male_ratio} onChange={v => upd({ male_ratio: v })} disabled={disabled} />

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
            <FieldLabel>Income</FieldLabel>
            {numBox(a.income_min, e => upd({ income_min: Number(e.target.value) }))}
            <span style={{ color: C.muted }}>→</span>
            {numBox(a.income_max, e => upd({ income_max: Number(e.target.value) }))}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
            <FieldLabel>Price</FieldLabel>
            {numBox(a.price_min, e => upd({ price_min: Number(e.target.value) }))}
            <span style={{ color: C.muted }}>→</span>
            {numBox(a.price_max, e => upd({ price_max: Number(e.target.value) }))}
          </div>
        </>
      )}

      {showTraits && (
        <>
          <RatioSlider label="Risk-takers" value={a.risk_taker_ratio} onChange={v => upd({ risk_taker_ratio: v })} disabled={disabled} />
          <RatioSlider label="Relaxed" value={a.relaxed_ratio} onChange={v => upd({ relaxed_ratio: v })} disabled={disabled} />
          <RatioSlider label="Open to new" value={a.open_new_ratio} onChange={v => upd({ open_new_ratio: v })} disabled={disabled} />

          <FieldLabel>Interests in the crowd</FieldLabel>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {INTERESTS.map(i => {
              const on = a.interests.includes(i);
              return <Chip key={i} on={on} onClick={() => !disabled && upd({ interests: on ? a.interests.filter(x => x !== i) : [...a.interests, i] })}>{i}</Chip>;
            })}
          </div>
        </>
      )}
    </div>
  );
}
