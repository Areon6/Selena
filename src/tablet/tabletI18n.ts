import type { BmiCategory, Sex } from "../types";
import type { Lang } from "../i18n";

/** Tablet texts live next to the tablet so a new section only touches this folder. Same EN / RU switch as i18n.ts. */
export interface TabletTexts {
  open: string;
  title: string;
  close: string;
  back: string;
  sections: Record<string, { title: string; desc: string; modules: Record<string, { title: string; desc: string }> }>;
  body: {
    sex: string;
    sexOpts: Record<Sex, string>;
    fields: Record<"heightCm" | "weightKg" | "bodyFatPct" | "muscularity" | "shoulderWidth" | "waist" | "hips", string>;
    derived: string;
    bmi: string;
    bsa: string;
    fatMass: string;
    leanMass: string;
    ffmi: string;
    bmr: string;
    energyRef: string;
    evaExtra: string;
    bmiNote: string;
    source: string;
    checked: string;
    categories: Record<BmiCategory, string>;
    apply: string;
    applying: string;
    cancel: string;
    defaults: string;
    saved: string;
    unsaved: string;
    hint: string;
    warnings: Record<string, string>;
    checkDirty: string;
    checkOverall: string;
    anthro: string;
    zonesTitle: string;
    noFactors: string;
    factors: Record<string, string>;
    checkDisclaimer: string;
  };
  checkin: {
    sleepHours: string;
    mood: string;
    systolic: string;
    diastolic: string;
    pulse: string;
    save: string;
    saving: string;
    last: string;
    none: string;
    justNow: string;
    ago: (min: number) => string;
    hint: string;
  };
}

export const TABLET_I18N: Record<Lang, TabletTexts> = {
  en: {
    open: "Tablet",
    title: "Tablet",
    close: "Close",
    back: "Back",
    sections: {
      myBody: {
        title: "My Body",
        desc: "Body parameters and condition check",
        modules: {
          enterParams: { title: "Enter parameters", desc: "Sex, height, weight, body fat and build — applied to the 3D model" },
          checkState: { title: "Check condition", desc: "Summary of body, zones and risks using your profile and telemetry" },
        },
      },
      checkIn: {
        title: "Check-in",
        desc: "Log sleep, mood and blood pressure",
        modules: {
          sleepMood: { title: "Sleep and mood", desc: "Hours slept and a 1–5 mood score" },
          bloodPressure: { title: "Blood pressure", desc: "Seated, at rest: pressure and pulse" },
        },
      },
    },
    body: {
      sex: "Biological profile",
      sexOpts: { neutral: "Neutral", male: "Male", female: "Female" },
      fields: {
        heightCm: "Height",
        weightKg: "Weight",
        bodyFatPct: "Body fat",
        muscularity: "Muscularity",
        shoulderWidth: "Shoulder width",
        waist: "Waist",
        hips: "Hips",
      },
      derived: "Derived",
      bmi: "BMI",
      bsa: "Body surface area",
      fatMass: "Fat mass",
      leanMass: "Lean mass",
      ffmi: "Lean mass index",
      bmr: "Resting energy (est.)",
      energyRef: "Crew energy reference",
      evaExtra: "EVA extra energy",
      bmiNote: "BMI classes are standard clinical cut-offs, not NASA limits. Body metrics are informational and do not change any status.",
      source: "Source",
      checked: "Checked",
      categories: { under: "Underweight", normal: "Normal", over: "Overweight", obese1: "Obesity I", obese2: "Obesity II", obese3: "Obesity III" },
      apply: "Apply & save",
      applying: "Saving…",
      cancel: "Discard edits",
      defaults: "Defaults",
      saved: "Saved on board",
      unsaved: "Unsaved changes",
      hint: "Sliders preview instantly; the model is rebuilt when you release them. Weight and fat change soft tissue only — bones and organs follow height, sex, shoulders and hips.",
      warnings: {
        fatLowForBmi: "Very low body fat for this BMI. Check the values.",
        fatHighForBmi: "High body fat for this BMI. Check the values.",
        leanVeryHigh: "Lean mass index is unusually high.",
        leanVeryLow: "Lean mass index is unusually low.",
        muscleVsMass: "Muscularity does not match the lean mass.",
      },
      checkDirty: "You have unsaved edits. This check uses the saved profile.",
      checkOverall: "Overall",
      anthro: "Anthropometry",
      zonesTitle: "Zones · telemetry and profile",
      noFactors: "No profile-specific factors.",
      factors: {
        spinal: "Spinal elongation in microgravity: height can increase by up to 3% (about +{cm} cm for you). Re-check height and suit / seat fit.",
      },
      checkDisclaimer: "Not medical advice. Zone statuses mix NASA limits with illustrative thresholds, marked per zone.",
    },
    checkin: {
      sleepHours: "Hours slept",
      mood: "Mood",
      systolic: "Systolic",
      diastolic: "Diastolic",
      pulse: "Pulse",
      save: "Save entry",
      saving: "Saving…",
      last: "Last entry",
      none: "No entry yet",
      justNow: "just now",
      ago: (m) => `${m} min ago`,
      hint: "Kept on board for this session only. Resets with the scenario. Thresholds are illustrative.",
    },
  },
  ru: {
    open: "Планшет",
    title: "Планшет",
    close: "Закрыть",
    back: "Назад",
    sections: {
      myBody: {
        title: "Моё тело",
        desc: "Параметры тела и проверка состояния",
        modules: {
          enterParams: { title: "Ввести параметры", desc: "Пол, рост, вес, % жира и фигура — применяются к 3D-модели" },
          checkState: { title: "Проверить состояние", desc: "Сводка по телу, зонам и рискам с учётом профиля и телеметрии" },
        },
      },
      checkIn: {
        title: "Check-in",
        desc: "Запись сна, самочувствия и давления",
        modules: {
          sleepMood: { title: "Сон и самочувствие", desc: "Часы сна и оценка 1–5" },
          bloodPressure: { title: "Давление", desc: "Сидя, в покое: давление и пульс" },
        },
      },
    },
    body: {
      sex: "Биологический профиль",
      sexOpts: { neutral: "Нейтр.", male: "Муж.", female: "Жен." },
      fields: {
        heightCm: "Рост",
        weightKg: "Вес",
        bodyFatPct: "Жир",
        muscularity: "Мышцы",
        shoulderWidth: "Ширина плеч",
        waist: "Талия",
        hips: "Бёдра",
      },
      derived: "Расчётные",
      bmi: "ИМТ",
      bsa: "Площадь поверхности тела",
      fatMass: "Масса жира",
      leanMass: "Безжировая масса",
      ffmi: "Индекс безжировой массы",
      bmr: "Энергия покоя (оц.)",
      energyRef: "Норма энергии экипажа",
      evaExtra: "Добавка за ВКД",
      bmiNote: "Классы ИМТ это стандартные клинические границы, а не нормы NASA. Параметры тела справочные и статус не меняют.",
      source: "Источник",
      checked: "Проверено",
      categories: { under: "Дефицит массы", normal: "Норма", over: "Избыток массы", obese1: "Ожирение I", obese2: "Ожирение II", obese3: "Ожирение III" },
      apply: "Применить и сохранить",
      applying: "Сохранение…",
      cancel: "Отменить правки",
      defaults: "По умолчанию",
      saved: "Сохранено на борту",
      unsaved: "Есть несохранённые изменения",
      hint: "Слайдеры дают мгновенный предпросмотр, модель пересобирается при отпускании. Вес и жир меняют только мягкие ткани, кости и органы зависят от роста, пола, плеч и таза.",
      warnings: {
        fatLowForBmi: "Очень низкий % жира при таком ИМТ. Проверьте значения.",
        fatHighForBmi: "Высокий % жира при таком ИМТ. Проверьте значения.",
        leanVeryHigh: "Индекс безжировой массы необычно высок.",
        leanVeryLow: "Индекс безжировой массы необычно низок.",
        muscleVsMass: "Развитость мышц не соответствует безжировой массе.",
      },
      checkDirty: "Есть несохранённые правки. Проверка использует сохранённый профиль.",
      checkOverall: "Итог",
      anthro: "Антропометрия",
      zonesTitle: "Зоны · телеметрия и профиль",
      noFactors: "Особых факторов по профилю нет.",
      factors: {
        spinal: "В невесомости позвоночник удлиняется: рост может вырасти до 3 % (для вас около +{cm} см). Перепроверьте рост и посадку скафандра / кресла.",
      },
      checkDisclaimer: "Не медицинская рекомендация. Статусы зон смешивают нормативы NASA и условные пороги, помеченные у каждой зоны.",
    },
    checkin: {
      sleepHours: "Часов сна",
      mood: "Самочувствие",
      systolic: "Систолическое",
      diastolic: "Диастолическое",
      pulse: "Пульс",
      save: "Сохранить запись",
      saving: "Сохранение…",
      last: "Последняя запись",
      none: "Записей пока нет",
      justNow: "только что",
      ago: (m) => `${m} мин назад`,
      hint: "Хранится на борту до конца сессии. Сбрасывается вместе со сценарием. Пороги условные.",
    },
  },
};