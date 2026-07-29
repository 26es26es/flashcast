export const C = {
  bg:        'var(--c-bg)',
  surface:   'var(--c-surface)',
  panel:     'var(--c-panel)',
  border:    'var(--c-border)',
  borderHi:  'var(--c-borderHi)',
  text:      'var(--c-text)',
  muted:     'var(--c-muted)',
  accent:    'var(--c-accent)',
  accentDim: 'var(--c-accentDim)',
  green:     'var(--c-green)',
  greenDim:  'var(--c-greenDim)',
  red:       'var(--c-red)',
  redDim:    'var(--c-redDim)',
  yellow:    'var(--c-yellow)',
  blue:      'var(--c-blue)',
};

const themeVars = `
  :root, :root[data-theme="dark"] {
    --c-bg:        #0d0d12;
    --c-surface:   #13131a;
    --c-panel:     #1a1a24;
    --c-border:    #252535;
    --c-borderHi:  #353550;
    --c-text:      #e2e2f0;
    --c-muted:     #6b6b8a;
    --c-accent:    #7b61ff;
    --c-accentDim: #7b61ff22;
    --c-green:     #22d3a0;
    --c-greenDim:  #22d3a022;
    --c-red:       #f25f6a;
    --c-redDim:    #f25f6a22;
    --c-yellow:    #f0b429;
    --c-blue:      #4da6ff;
  }
  :root[data-theme="light"] {
    --c-bg:        #f4f5fa;
    --c-surface:   #ffffff;
    --c-panel:     #ffffff;
    --c-border:    #e2e3ee;
    --c-borderHi:  #cfd0e0;
    --c-text:      #1c1c28;
    --c-muted:     #71718a;
    --c-accent:    #6b4dff;
    --c-accentDim: #6b4dff18;
    --c-green:     #12a67f;
    --c-greenDim:  #12a67f18;
    --c-red:       #e0424f;
    --c-redDim:    #e0424f18;
    --c-yellow:    #c98a00;
    --c-blue:      #2f7fe0;
  }
`;

export const mono = "'JetBrains Mono', 'Fira Mono', monospace";
export const sans = "'Inter', system-ui, sans-serif";

export const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  ${themeVars}
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.text}; font-family: ${sans}; transition: background 0.2s ease, color 0.2s ease; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: ${C.surface}; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
  input[type=range] { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px; background: ${C.border}; outline: none; cursor: pointer; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: ${C.accent}; cursor: pointer; }
`;
