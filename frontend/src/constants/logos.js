// The 15 built-in company logos. Keys must stay in sync with LOGO_OPTIONS in src/models.rs.
export const LOGOS = [
  { key: 'owl',       label: 'Owl',       art: '🦉' },
  { key: 'eagle',     label: 'Eagle',     art: '🦅' },
  { key: 'penguin',   label: 'Penguin',   art: '🐧' },
  { key: 'parrot',    label: 'Parrot',    art: '🦜' },
  { key: 'flamingo',  label: 'Flamingo',  art: '🦩' },
  { key: 'fox',       label: 'Fox',       art: '🦊' },
  { key: 'tiger',     label: 'Tiger',     art: '🐯' },
  { key: 'panda',     label: 'Panda',     art: '🐼' },
  { key: 'octopus',   label: 'Octopus',   art: '🐙' },
  { key: 'whale',     label: 'Whale',     art: '🐳' },
  { key: 'walter',    label: 'The Chemist',  art: '🧪' },
  { key: 'dwight',    label: 'The Beet Guy', art: '🥬' },
  { key: 'eleven',    label: 'The Waffle Kid', art: '🧇' },
  { key: 'spongebob', label: 'The Sponge',   art: '🧽' },
  { key: 'homer',     label: 'The Donut Dad', art: '🍩' },
];

export const DEFAULT_LOGO = 'owl';

const BY_KEY = Object.fromEntries(LOGOS.map(l => [l.key, l]));

export const logoArt = (key) => (BY_KEY[key] || BY_KEY[DEFAULT_LOGO]).art;
export const logoLabel = (key) => (BY_KEY[key] || BY_KEY[DEFAULT_LOGO]).label;
