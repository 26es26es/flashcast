use std::collections::HashMap;
use serde::{Deserialize, Serialize};

use crate::engine::{rand_unit, rand_index};
use crate::models::{FieldSpec, FieldKind, TargetValue, FieldValue, CampaignField};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct UserProfile {
    pub(crate) age: i32,
    pub(crate) gender: String,
    pub(crate) income: i32,
    pub(crate) household: i32,
    pub(crate) location: String,
    pub(crate) language: String,
    pub(crate) interests: Vec<String>,
    pub(crate) risk_taker: bool,
    pub(crate) relaxed: bool,
    pub(crate) open_new: bool,
    pub(crate) shopper: String,
    pub(crate) price: i32,
    pub(crate) media: String,
}

pub(crate) struct DynamicTargeting<'a> {
    pub(crate) fields: &'a [CampaignField],
}

impl<'a> DynamicTargeting<'a> {
    pub(crate) fn is_eligible(&self, user: &HashMap<String, FieldValue>) -> bool {
        for field in self.fields {
            if field.forced && !field_satisfied(&field.kind, &field.target, user.get(&field.key)) {
                return false;
            }
        }
        true
    }

    pub(crate) fn match_score(&self, user: &HashMap<String, FieldValue>) -> f64 {
        let mut weighted_sum = 0.0;
        let mut weight_total = 0.0;

        for field in self.fields {
            let value = user.get(&field.key);
            let m = score_field(&field.kind, Some(&field.target), value);
            weighted_sum += m.clamp(0.0, 1.0) * field.weight;
            weight_total += field.weight;
        }

        if weight_total == 0.0 { 1.0 } else { (weighted_sum / weight_total).clamp(0.0, 1.0) }
    }
}

fn field_satisfied(kind: &FieldKind, target: &TargetValue, value: Option<&FieldValue>) -> bool {
    match (kind, target) {
        (FieldKind::Range { .. }, TargetValue::Range { lo, hi }) => {
            matches!(value, Some(FieldValue::Number(v)) if *v >= *lo && *v <= *hi)
        }
        (FieldKind::Categorical { .. }, TargetValue::Set { values }) => {
            if values.is_empty() {
                return true;
            }
            match value {
                Some(FieldValue::Text(v)) => values.iter().any(|s| s.eq_ignore_ascii_case(v)),
                Some(FieldValue::Number(v)) => values.iter().any(|s| s.eq_ignore_ascii_case(&v.to_string())),
                Some(FieldValue::List(vs)) => vs.iter().any(|v| values.iter().any(|s| s.eq_ignore_ascii_case(v))),
                _ => false,
            }
        }
        (FieldKind::Boolean, TargetValue::Want { value: want }) => {
            match want {
                None => true,
                Some(w) => matches!(value, Some(FieldValue::Flag(v)) if *v == *w),
            }
        }
        _ => true,
    }
}

fn score_field(kind: &FieldKind, target: Option<&TargetValue>, value: Option<&FieldValue>) -> f64 {
    match (kind, target) {
        (FieldKind::Range { falloff, .. }, Some(TargetValue::Range { lo, hi })) => {
            match value {
                Some(FieldValue::Number(v)) => range_match(*v, *lo, *hi, *falloff),
                _ => 0.0,
            }
        }
        (FieldKind::Categorical { .. }, Some(TargetValue::Set { values })) => {
            match value {
                Some(FieldValue::Text(v)) => any_or_contains(values, v),
                Some(FieldValue::Number(v)) => any_or_contains(values, &v.to_string()),
                Some(FieldValue::List(v)) => jaccard(values, v),
                _ => any_or_contains(values, ""),
            }
        }
        (FieldKind::Boolean, Some(TargetValue::Want { value: want })) => {
            match want {
                None => 1.0,
                Some(w) => match value {
                    Some(FieldValue::Flag(v)) => if *v == *w { 1.0 } else { 0.0 },
                    _ => 0.0,
                },
            }
        }
        (_, None) => 1.0,
        _ => 1.0,
    }
}

fn range_match(v: f64, lo: f64, hi: f64, falloff: f64) -> f64 {
    if v >= lo && v <= hi {
        1.0
    } else if v < lo {
        (1.0 - (lo - v) / falloff).max(0.0)
    } else {
        (1.0 - (v - hi) / falloff).max(0.0)
    }
}

fn set_contains(set: &[String], value: &str) -> f64 {
    if set.iter().any(|s| s.eq_ignore_ascii_case(value)) { 1.0 } else { 0.0 }
}

fn any_or_contains(set: &[String], value: &str) -> f64 {
    if set.is_empty() { 1.0 } else { set_contains(set, value) }
}

fn jaccard(target: &[String], user: &[String]) -> f64 {
    if target.is_empty() { return 1.0; }
    if user.is_empty() { return 0.0; }
    let lower = |v: &[String]| v.iter().map(|s| s.to_ascii_lowercase()).collect::<Vec<_>>();
    let (t, u) = (lower(target), lower(user));
    let inter = t.iter().filter(|x| u.contains(x)).count() as f64;
    let union = t.iter().chain(u.iter()).collect::<std::collections::BTreeSet<_>>().len() as f64;
    if union == 0.0 { 1.0 } else { inter / union }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct AudienceConfig {
    pub(crate) age_min: i32,
    pub(crate) age_max: i32,

    pub(crate) male_ratio: f64,
    pub(crate) income_min: i32,
    pub(crate) income_max: i32,
    pub(crate) household_min: i32,
    pub(crate) household_max: i32,
    pub(crate) locations: Vec<String>,
    pub(crate) languages: Vec<String>,
    pub(crate) interests: Vec<String>,
    pub(crate) risk_taker_ratio: f64,
    pub(crate) relaxed_ratio: f64,
    pub(crate) open_new_ratio: f64,

    pub(crate) shopper_weights: [f64; 3],
    pub(crate) price_min: i32,
    pub(crate) price_max: i32,

    pub(crate) media_weights: [f64; 3],
}

impl Default for AudienceConfig {

    fn default() -> Self {
        Self {
            age_min: 18, age_max: 65,
            male_ratio: 0.5,
            income_min: 1, income_max: 10,
            household_min: 1, household_max: 10,
            locations: vec![],
            languages: vec![],
            interests: vec![
                "gaming".into(), "sports".into(), "music".into(),
                "tech".into(), "finance".into(),
            ],
            risk_taker_ratio: 0.4,
            relaxed_ratio: 0.5,
            open_new_ratio: 0.5,
            shopper_weights: [1.0, 1.0, 1.0],
            price_min: 1, price_max: 10,
            media_weights: [1.0, 1.0, 1.0],
        }
    }
}

impl AudienceConfig {

    pub(crate) fn sample_user(&self) -> UserProfile {
        let gender = {
            let r = rand_unit();
            if r < self.male_ratio { "male" }
            else if r < self.male_ratio + (1.0 - self.male_ratio) * 0.95 { "female" }
            else { "nonbinary" }
        }.to_string();

        let interests = self.interests.iter()
            .filter(|_| rand_unit() < 0.5)
            .cloned()
            .collect::<Vec<_>>();

        let shopper = pick_weighted(&["frequent", "occasional", "rare"], &self.shopper_weights);
        let media = pick_weighted(&["livestream", "youtube", "webpage"], &self.media_weights);

        let pick_one = |v: &[String], fallback: &str| -> String {
            if v.is_empty() { fallback.to_string() } else { v[rand_index(v.len())].clone() }
        };

        UserProfile {
            age: rand_range_i(self.age_min, self.age_max),
            gender,
            income: rand_range_i(self.income_min, self.income_max),
            household: rand_range_i(self.household_min, self.household_max),
            location: pick_one(&self.locations, "global"),
            language: pick_one(&self.languages, "en"),
            interests,
            risk_taker: rand_unit() < self.risk_taker_ratio,
            relaxed: rand_unit() < self.relaxed_ratio,
            open_new: rand_unit() < self.open_new_ratio,
            shopper,
            price: rand_range_i(self.price_min, self.price_max),
            media,
        }
    }
}

impl AudienceConfig {
    pub(crate) fn sample_dynamic_user(&self, schema: &[FieldSpec]) -> HashMap<String, FieldValue> {
        let base = self.sample_user();
        let mut out: HashMap<String, FieldValue> = HashMap::new();

        for spec in schema {
            let value = match spec.key.as_str() {
                "age" => FieldValue::Number(base.age as f64),
                "gender" => FieldValue::Text(base.gender.clone()),
                "income" => FieldValue::Number(base.income as f64),
                "household" => FieldValue::Number(base.household as f64),
                "interests" => FieldValue::List(base.interests.clone()),
                "risk_taker" => FieldValue::Flag(base.risk_taker),
                "relaxed" => FieldValue::Flag(base.relaxed),
                "open_new" => FieldValue::Flag(base.open_new),
                "shopper" => FieldValue::Text(base.shopper.clone()),
                "price" => FieldValue::Number(base.price as f64),
                "media" => FieldValue::Text(base.media.clone()),
                _ => sample_from_kind(&spec.kind),
            };
            out.insert(spec.key.clone(), value);
        }

        out
    }
}

fn sample_from_kind(kind: &FieldKind) -> FieldValue {
    match kind {
        FieldKind::Range { min, max, .. } => {
            FieldValue::Number(rand_range_i(*min as i32, *max as i32) as f64)
        }
        FieldKind::Categorical { options } => {
            if options.is_empty() {
                FieldValue::Text(String::new())
            } else {
                FieldValue::Text(options[rand_index(options.len())].clone())
            }
        }
        FieldKind::Boolean => FieldValue::Flag(rand_unit() < 0.5),
    }
}

fn rand_range_i(lo: i32, hi: i32) -> i32 {
    let (lo, hi) = if lo <= hi { (lo, hi) } else { (hi, lo) };
    let span = (hi - lo + 1).max(1) as usize;
    lo + rand_index(span) as i32
}

fn pick_weighted(labels: &[&str; 3], weights: &[f64; 3]) -> String {
    let total: f64 = weights.iter().sum();
    if total <= 0.0 { return labels[0].to_string(); }
    let mut r = rand_unit() * total;
    for (i, w) in weights.iter().enumerate() {
        if r < *w { return labels[i].to_string(); }
        r -= *w;
    }
    labels[labels.len() - 1].to_string()
}
