export const GENDERS   = ['male', 'female', 'nonbinary'];
export const INTERESTS = ['gaming', 'sports', 'music', 'tech', 'finance'];
export const MEDIA     = ['livestream', 'youtube', 'webpage'];
export const SHOPPERS  = ['any', 'frequent', 'occasional', 'rare'];

export const defaultTargeting = () => ({
  target_age_min: 13, target_age_max: 80,
  target_genders: [...GENDERS],
  target_income_min: 1, target_income_max: 10,
  target_household_min: 1, target_household_max: 10,
  target_interests: [],
  want_risk_taker: null, want_relaxed: null, want_open_new: null,
  target_shopper: 'any',
  target_price_min: 1, target_price_max: 10,
  target_media: [],
});

export const defaultAudience = () => ({
  age_min: 18, age_max: 65,
  male_ratio: 0.5,
  income_min: 1, income_max: 10,
  household_min: 1, household_max: 10,
  locations: [], languages: [],
  interests: [...INTERESTS],
  risk_taker_ratio: 0.4, relaxed_ratio: 0.5, open_new_ratio: 0.5,
  shopper_weights: [1, 1, 1],
  price_min: 1, price_max: 10,
  media_weights: [1, 1, 1],
});

export const AUDIENCE_PRESETS = {
  'General Population': defaultAudience(),
  'Young Gamers': {
    ...defaultAudience(),
    age_min: 16, age_max: 28, male_ratio: 0.68,
    interests: ['gaming', 'tech'],
    risk_taker_ratio: 0.7, open_new_ratio: 0.7,
    shopper_weights: [3, 2, 1], media_weights: [4, 3, 1],
    price_min: 2, price_max: 6,
  },
  'Affluent Families': {
    ...defaultAudience(),
    age_min: 32, age_max: 55, male_ratio: 0.5,
    income_min: 6, income_max: 10, household_min: 5, household_max: 10,
    interests: ['finance', 'tech', 'sports'],
    risk_taker_ratio: 0.3, relaxed_ratio: 0.6,
    shopper_weights: [3, 3, 1], media_weights: [1, 2, 4],
    price_min: 6, price_max: 10,
  },
  'Bargain Hunters': {
    ...defaultAudience(),
    age_min: 22, age_max: 60, male_ratio: 0.45,
    income_min: 1, income_max: 5,
    interests: ['finance', 'music', 'sports'],
    risk_taker_ratio: 0.5, open_new_ratio: 0.6,
    shopper_weights: [5, 2, 1], media_weights: [2, 3, 3],
    price_min: 1, price_max: 4,
  },
};

export const STATUS_META = {
  approved:          { color: 'var(--c-green)',  label: 'WON' },
  no_fill:           { color: 'var(--c-muted)',  label: 'NO FILL' },
  budget_exhausted:  { color: 'var(--c-red)',    label: 'BUDGET ✗' },
};
export const statusColor = (status) => STATUS_META[status]?.color ?? 'var(--c-muted)';
export const statusLabel = (status) => STATUS_META[status]?.label ?? (status ?? 'UNKNOWN').toUpperCase();

export const PARAM_HINTS = {
  budget: 'Total money the campaign can spend across its lifetime. Impressions draw down this budget.',
  cpm: 'Maximum cost per thousand impressions the advertiser will pay. Among matched ads, the highest CPM wins the slot.',
  category: 'The stream category this campaign targets (gaming, sports, music, tech, finance).',
  click_rate: 'Constant probability that a shown ad is clicked. Clicking no longer depends on how well the viewer matches the ad.',
  rate: 'Number of ad-slot requests generated per second by the simulator.',
  duration: 'How long the simulator keeps sending traffic, in seconds.',
};

export const DEFAULT_FIELD_SCHEMA = [
  { key: 'age', label: 'Age', description: 'Viewer age in years. Campaigns target a range; users outside it match progressively less.', weight: 0.9, kind: { type: 'range', min: 13, max: 80, falloff: 10 }, target: { type: 'range', lo: 13, hi: 80 } },
  { key: 'gender', label: 'Gender', description: "Viewer gender. A campaign matches when the viewer's gender is in its selected set.", weight: 0.9, kind: { type: 'categorical', options: ['male', 'female', 'nonbinary'] }, target: { type: 'set', values: [] } },
  { key: 'income', label: 'Income bracket', description: 'Relative income tier from 1 (lowest) to 10 (highest).', weight: 0.8, kind: { type: 'range', min: 1, max: 10, falloff: 3 }, target: { type: 'range', lo: 1, hi: 10 } },
  { key: 'household', label: 'Household status', description: 'Household size / status tier from 1 to 10.', weight: 0.8, kind: { type: 'range', min: 1, max: 10, falloff: 3 }, target: { type: 'range', lo: 1, hi: 10 } },
  { key: 'interests', label: 'Interests', description: "Viewer interests. Overlap with the campaign's interests raises the match (empty targets everyone).", weight: 0.8, kind: { type: 'categorical', options: ['gaming', 'sports', 'music', 'tech', 'finance'] }, target: { type: 'set', values: [] } },
  { key: 'risk_taker', label: 'Risk-taker', description: 'Whether the viewer is a risk-taker. Campaigns may require yes, no, or not care.', weight: 0.9, kind: { type: 'boolean' }, target: { type: 'want', value: null } },
  { key: 'relaxed', label: 'Relaxed', description: 'Whether the viewer has a relaxed disposition.', weight: 0.9, kind: { type: 'boolean' }, target: { type: 'want', value: null } },
  { key: 'open_new', label: 'Open to new', description: 'Whether the viewer is open to trying new things.', weight: 0.9, kind: { type: 'boolean' }, target: { type: 'want', value: null } },
  { key: 'shopper', label: 'Shopper type', description: 'Shopping frequency of the viewer: frequent, occasional, or rare.', weight: 0.9, kind: { type: 'categorical', options: ['frequent', 'occasional', 'rare'] }, target: { type: 'set', values: [] } },
  { key: 'price', label: 'Price sensitivity', description: 'Preferred price tier from 1 (cheap) to 10 (premium).', weight: 0.9, kind: { type: 'range', min: 1, max: 10, falloff: 3 }, target: { type: 'range', lo: 1, hi: 10 } },
  { key: 'media', label: 'Media type', description: 'Where the viewer is watching: livestream, youtube, or webpage.', weight: 0.8, kind: { type: 'categorical', options: ['livestream', 'youtube', 'webpage'] }, target: { type: 'set', values: [] } },
];
