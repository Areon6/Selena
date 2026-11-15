//! Deterministic bilingual (EN + RU) stem/phrase lexicon for crew notes and tags.
//! Runs 100% offline with zero external dependencies.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Sentiment {
    Positive,
    Mixed,
    Negative,
    Neutral,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LexiconResult {
    pub themes: Vec<String>,
    pub sentiment: Sentiment,
}

const THEME_ORDER: &[&str] = &[
    "isolation_family",
    "fatigue_sleep",
    "cognitive_load",
    "cabin_environment",
    "crew_interpersonal",
    "positive_recovery",
];

fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|w| !w.is_empty())
        .map(str::to_string)
        .collect()
}

fn has_prefix(tokens: &[String], prefixes: &[&str]) -> bool {
    tokens
        .iter()
        .any(|tok| prefixes.iter().any(|p| tok.starts_with(p)))
}

fn has_phrase(normalized: &str, phrases: &[&str]) -> bool {
    phrases.iter().any(|p| normalized.contains(p))
}

pub fn analyze(note: Option<&str>, tags: &[String]) -> LexiconResult {
    let raw = note.unwrap_or("").trim();
    let normalized = raw.to_lowercase();
    let tokens = tokenize(raw);

    let mut found: BTreeSet<&'static str> = BTreeSet::new();
    let mut pos_hits: usize = 0;
    let mut neg_hits: usize = 0;

    // 1. Canonical tags
    for tag in tags {
        match tag.as_str() {
            "homesick" => {
                found.insert("isolation_family");
                neg_hits += 1;
            }
            "fatigue" | "weakness" | "poor_sleep" => {
                found.insert("fatigue_sleep");
                neg_hits += 1;
            }
            "brain_fog" => {
                found.insert("cognitive_load");
                neg_hits += 1;
            }
            "cabin_stuffy" => {
                found.insert("cabin_environment");
                neg_hits += 1;
            }
            "crew_tension" => {
                found.insert("crew_interpersonal");
                neg_hits += 1;
            }
            "calm" | "focused" | "motivated" => {
                found.insert("positive_recovery");
                pos_hits += 1;
            }
            _ => {}
        }
    }

    // 2. Text stem & phrase matching (EN + RU)
    if !tokens.is_empty() {
        // Isolation & family
        let iso_stems = [
            "homesick", "lonely", "loneli", "isolat", "family", "home", "earth", "dinner",
            "скуча", "одинок", "изоляц", "семь", "дом", "земл", "родн", "тоск",
        ];
        let iso_phrases = ["miss home", "missed family", "far from", "далеко от"];
        if has_prefix(&tokens, &iso_stems) || has_phrase(&normalized, &iso_phrases) {
            found.insert("isolation_family");
            if has_prefix(
                &tokens,
                &["homesick", "lonely", "loneli", "miss", "missed", "скуча", "одинок", "тоск"],
            ) {
                neg_hits += 1;
            }
        }

        // Fatigue & sleep disruption (avoid matching healthy "deep uninterrupted sleep")
        let fatigue_stems = [
            "fatigu", "tired", "exhaust", "weak", "drows", "insomn", "awake", "sleepless",
            "letharg", "устал", "утомл", "слабост", "вял", "сонлив", "бессон", "разбит", "вымот",
            "недосып",
        ];
        let sleep_neg_phrases = [
            "poor sleep", "bad sleep", "less sleep", "no sleep", "hard to settle",
            "hard to sleep", "trouble sleep", "kept me awake", "плох сон", "плохо спал",
            "мало спал", "не спал", "тяжело усн", "проснул",
        ];
        if has_prefix(&tokens, &fatigue_stems) || has_phrase(&normalized, &sleep_neg_phrases) {
            found.insert("fatigue_sleep");
            neg_hits += 1;
        }

        // Cognitive load & somatic discomfort
        let cog_stems = [
            "fog", "foggy", "headach", "migrain", "confus", "scatter", "nausea", "dizzy",
            "overload", "туман", "голов", "мигрен", "рассеян", "пута", "тошн", "круж", "перегруз",
        ];
        let cog_phrases = [
            "low focus", "hard to focus", "lost focus", "brain fog", "трудно сосред",
            "нет фокуса", "болит голова",
        ];
        if has_prefix(&tokens, &cog_stems) || has_phrase(&normalized, &cog_phrases) {
            found.insert("cognitive_load");
            neg_hits += 1;
        }

        // Cabin environment & life support
        let env_stems = [
            "co2", "ppco2", "stuffy", "scrubber", "filter", "airflow", "ventil", "cartridge",
            "air", "душно", "душн", "скруббер", "фильтр", "вентил", "углек", "воздух",
        ];
        let env_neg_stems = ["stuffy", "heavy", "fault", "offline", "drift", "душно", "душн", "отказ"];
        if has_prefix(&tokens, &env_stems) {
            found.insert("cabin_environment");
            if has_prefix(&tokens, &env_neg_stems) {
                neg_hits += 1;
            }
        }

        // Crew interpersonal
        let crew_stems = [
            "tension", "friction", "conflict", "argu", "irritab", "annoy", "disagree",
            "напряж", "конфликт", "трени", "спор", "раздраж", "ссор",
        ];
        if has_prefix(&tokens, &crew_stems) {
            found.insert("crew_interpersonal");
            neg_hits += 1;
        }

        // Positive recovery
        let pos_stems = [
            "calm", "motivat", "rested", "steady", "crisp", "smooth", "fresh", "productiv",
            "bounced", "recover", "morale", "best", "good", "great", "спокой", "мотив",
            "бодр", "отдох", "восстанов", "отлич", "хорош", "рад", "свеж",
        ];
        let pos_phrases = ["bounced back", "personal best", "helped sleep", "прилив сил"];
        if has_prefix(&tokens, &pos_stems) || has_phrase(&normalized, &pos_phrases) {
            found.insert("positive_recovery");
            pos_hits += 1;
        }

        // Extra negative cues for sentiment accuracy
        let extra_neg = [
            "alarm", "alert", "shelter", "storm", "paused", "noisy", "тревог", "укрыт", "буря", "шум",
        ];
        if has_prefix(&tokens, &extra_neg) {
            neg_hits += 1;
        }
    }

    let themes = THEME_ORDER
        .iter()
        .filter(|id| found.contains(**id))
        .map(|id| (*id).to_string())
        .collect();

    let sentiment = match (pos_hits > 0, neg_hits > 0) {
        (true, true) => Sentiment::Mixed,
        (true, false) => Sentiment::Positive,
        (false, true) => Sentiment::Negative,
        (false, false) => Sentiment::Neutral,
    };

    LexiconResult { themes, sentiment }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_en_and_ru_themes_and_sentiment() {
        let en = analyze(
            Some("Air felt heavy, ppCO2 crept to 3.6 mmHg. Mild headache."),
            &["fatigue".into()],
        );
        assert!(en.themes.contains(&"cabin_environment".to_string()));
        assert!(en.themes.contains(&"cognitive_load".to_string()));
        assert!(en.themes.contains(&"fatigue_sleep".to_string()));
        assert_eq!(en.sentiment, Sentiment::Negative);

        let ru = analyze(
            Some("Душно в каюте, сильная усталость, но вечером стало спокойнее."),
            &[],
        );
        assert!(ru.themes.contains(&"cabin_environment".to_string()));
        assert!(ru.themes.contains(&"fatigue_sleep".to_string()));
        assert!(ru.themes.contains(&"positive_recovery".to_string()));
        assert_eq!(ru.sentiment, Sentiment::Mixed);
    }

    #[test]
    fn healthy_sleep_note_is_positive_not_fatigue() {
        let res = analyze(
            Some("Deep uninterrupted sleep. Full ARED resistive session completed."),
            &["calm".into(), "motivated".into()],
        );
        assert!(!res.themes.contains(&"fatigue_sleep".to_string()));
        assert!(res.themes.contains(&"positive_recovery".to_string()));
        assert_eq!(res.sentiment, Sentiment::Positive);
    }
    #[test]
    fn empty_and_whitespace_inputs_are_neutral_with_no_themes() {
        let empty = analyze(None, &[]);
        assert!(empty.themes.is_empty());
        assert_eq!(empty.sentiment, Sentiment::Neutral);

        let ws = analyze(Some("   \n\t  "), &[]);
        assert!(ws.themes.is_empty());
        assert_eq!(ws.sentiment, Sentiment::Neutral);
    }

    #[test]
    fn detects_russian_triggers_across_all_themes_and_spe_cues() {
        let res = analyze(
            Some("Тревога, буря, укрытие! Скучаю по дому, болит голова и туман, в экипаже напряжение и конфликт."),
            &[],
        );
        assert!(res.themes.contains(&"isolation_family".to_string()));
        assert!(res.themes.contains(&"cognitive_load".to_string()));
        assert!(res.themes.contains(&"crew_interpersonal".to_string()));
        assert_eq!(res.sentiment, Sentiment::Negative);

        let mixed = analyze(
            Some("Недосып и усталость, но бодрое настроение, восстановился и рад."),
            &["calm".into()],
        );
        assert!(mixed.themes.contains(&"fatigue_sleep".to_string()));
        assert!(mixed.themes.contains(&"positive_recovery".to_string()));
        assert_eq!(mixed.sentiment, Sentiment::Mixed);
    }
}