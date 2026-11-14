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
        underweight: "Low BMI: less reserve against bone and muscle loss.",
        obesity: "High BMI or body fat: higher cardiovascular load during exercise and stress.",
        lowFat: "Low body fat: small energy reserve under mission workload.",
        lowLean: "Low lean mass: little muscle and bone reserve before resistive exercise begins.",
        highLean: "High lean mass: expect higher ARED loads and protein needs.",
        highBmr: "High resting energy use: more O₂ use and CO₂ output per person in a sealed cabin.",
        spinal: "Spinal elongation in microgravity is expected: re-check height and suit / seat fit.",
      },
      checkDisclaimer: "Demo heuristics, not medical advice. Thresholds are placeholders pending NASA-STD-3001 / flight surgeon criteria.",
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
        underweight: "Низкий ИМТ: меньше запас прочности против потери костной и мышечной массы.",
        obesity: "Высокий ИМТ или % жира: выше сердечно-сосудистая нагрузка при тренировках и стрессе.",
        lowFat: "Мало жира: небольшой энергетический запас при миссионной нагрузке.",
        lowLean: "Мало безжировой массы: малый запас мышц и костей до начала силовых тренировок.",
        highLean: "Много безжировой массы: ожидайте более высокие нагрузки ARED и потребность в белке.",
        highBmr: "Высокий расход энергии в покое: больше потребление O₂ и выдох CO₂ на человека в замкнутом отсеке.",
        spinal: "В невесомости ожидается удлинение позвоночника: перепроверьте рост и посадку скафандра / кресла.",
      },
      checkDisclaimer: "Демонстрационные эвристики, не медицинская рекомендация. Пороги условные, до сверки с NASA-STD-3001 / полётным врачом.",
    },
  },
};