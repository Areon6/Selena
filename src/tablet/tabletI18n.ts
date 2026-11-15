import type { BmiCategory, DaySource, Level, Sentiment, Sex } from "../types";
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
  mindData: {
    tabs: { calendar: string; analytics: string; importReport: string };
    ranges: [string, string, string];
    dayShort: (d: number) => string;
    dayTitle: (d: number) => string;
    levels: Record<Level, string>;
    emptyLevel: string;
    sources: Record<DaySource, string>;
    calDisclaimer: string;
    resetSample: string;
    resetting: string;
    physioTitle: string;
    psychTitle: string;
    tagsTitle: string;
    themesTitle: string;
    sentimentTitle: string;
    noteTitle: string;
    notePlaceholder: string;
    physioOptional: string;
    noData: (d: number) => string;
    noSignalTitle: string;
    noSignalSub: (d: number) => string;
    noSignalStatus: string;
    btnBack: string;
    btnEdit: string;
    btnFill: string;
    btnSave: string;
    btnSaving: string;
    formSubtitle: string;
    mood: string;
    energy: string;
    stress: string;
    sleep: string;
    hr: string;
    bp: string;
    bpSys: string;
    bpDia: string;
    spo2: string;
    ppco2: string;
    doseRate: string;
    tags: Record<string, string>;
    sentiments: Record<Sentiment, string>;
    themes: Record<string, string>;
    analytics: {
      loading: string;
      coverageTitle: string;
      loggedValue: (logged: number, total: number) => string;
      sampleTag: (n: number) => string;
      manualTag: (n: number) => string;
      checkinTag: (n: number) => string;
      importTag: (n: number) => string;
      avgMood: string;
      avgStress: string;
      avgSleep: string;
      volatility: string;
      sparkTitle: string;
      legend: { mood: string; stress: string; shift: string };
      noSeries: string;
      shiftsTitle: string;
      noShifts: string;
      shiftRow: (fromDay: number, toDay: number) => string;
      themesTitle: string;
      noThemes: string;
      sentimentTitle: string;
      corrTitle: string;
      corrCohortSample: (nA: number, nB: number) => string;
      corrInsufficient: string;
      corrPairs: Record<string, { title: string; cohortA: string; cohortB: string; note: string }>;
      corrMetrics: Record<string, string>;
      basisIllustrative: string;
      disclaimer: string;
    };
    stubImport: string;
    nextStep: string;
    loading: string;
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
      mindData: {
        title: "Mind & Data",
        desc: "Mission calendar from Day 1, crew log and data tools",
        modules: {
          calendar: { title: "Mission calendar", desc: "Browse Days 1–78, inspect daily status or log retroactive entries" },
          analytics: { title: "Mind & correlations", desc: "Mood volatility, thought themes and mind-body associations" },
          importReport: { title: "Import & report", desc: "CSV/JSON device ingestion and mission brief (next step)" },
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
      hint: "Live scenario session syncs into Day 78 of the mission log. Thresholds are illustrative.",
    },
    mindData: {
      tabs: { calendar: "Calendar", analytics: "Analytics", importReport: "Import" },
      ranges: ["Days 1–28", "Days 29–56", "Days 57–78"],
      dayShort: (d) => `D${String(d).padStart(2, "0")}`,
      dayTitle: (d) => `DAY ${String(d).padStart(2, "0")}`,
      levels: { nominal: "Nominal", watch: "Watch", critical: "Critical" },
      emptyLevel: "No data",
      sources: {
        sample: "Simulated sample history",
        checkin: "Crew Check-in",
        manual: "Manual log entry",
        import: "Device import",
      },
      calDisclaimer: "Days 1–77 are simulated sample history · Day rank A–D is an illustrative composite score",
      resetSample: "Reset log to sample",
      resetting: "Resetting…",
      physioTitle: "Physiological summary",
      psychTitle: "Psychological snapshot",
      tagsTitle: "Quick tags",
      themesTitle: "Detected thought themes",
      sentimentTitle: "Tone",
      noteTitle: "Crew notes",
      notePlaceholder: "Free-text thoughts, sleep notes or cabin observations…",
      physioOptional: "Physiological values (optional)",
      noData: (d) => `No telemetry or crew check-in logged for Day ${d}.`,
      noSignalTitle: "NO SIGNAL",
      noSignalSub: (d) => `NO DATA LOGGED FOR DAY ${String(d).padStart(2, "0")}`,
      noSignalStatus: "MISSION ARCHIVE",
      btnBack: "← Back",
      btnEdit: "Edit / add data",
      btnFill: "Log data for this date",
      btnSave: "Save entry",
      btnSaving: "Saving…",
      formSubtitle: "Retroactive or current mission day log",
      mood: "Mood",
      energy: "Energy",
      stress: "Stress",
      sleep: "Sleep",
      hr: "Heart rate",
      bp: "Blood pressure",
      bpSys: "BP Systolic",
      bpDia: "BP Diastolic",
      spo2: "SpO₂",
      ppco2: "ppCO₂",
      doseRate: "Dose rate",
      tags: {
        fatigue: "Fatigue",
        weakness: "Weakness",
        brain_fog: "Brain fog",
        poor_sleep: "Poor sleep",
        homesick: "Homesick / Family",
        cabin_stuffy: "Cabin stuffy",
        crew_tension: "Crew tension",
        calm: "Calm",
        focused: "Focused",
        motivated: "Motivated",
      },
      sentiments: {
        positive: "Positive",
        mixed: "Mixed",
        negative: "Negative",
        neutral: "Neutral",
      },
      themes: {
        isolation_family: "Isolation & family",
        fatigue_sleep: "Fatigue & sleep",
        cognitive_load: "Cognitive load",
        cabin_environment: "Cabin environment",
        crew_interpersonal: "Crew interpersonal",
        positive_recovery: "Positive recovery",
      },
      analytics: {
        loading: "Computing mission log analytics…",
        coverageTitle: "Archive coverage & baseline",
        loggedValue: (logged, total) => `${logged} / ${total} days`,
        sampleTag: (n) => `${n} simulated sample`,
        manualTag: (n) => `${n} manual`,
        checkinTag: (n) => `${n} check-in`,
        importTag: (n) => `${n} import`,
        avgMood: "Mean mood",
        avgStress: "Mean stress",
        avgSleep: "Mean sleep",
        volatility: "Volatility σ (mood / stress)",
        sparkTitle: "Mood & stress trajectory",
        legend: { mood: "Mood", stress: "Stress", shift: "Shift ≥ 2" },
        noSeries: "Not enough mood/stress points to plot trajectory.",
        shiftsTitle: "Sharp day-to-day shifts",
        noShifts: "No consecutive jumps with |ΔMood| ≥ 2 or |ΔStress| ≥ 2.",
        shiftRow: (fromDay, toDay) => `D${String(fromDay).padStart(2, "0")} → D${String(toDay).padStart(2, "0")}`,
        themesTitle: "Recurring thought themes",
        noThemes: "No tagged or note-derived themes logged yet.",
        sentimentTitle: "Note tone balance",
        corrTitle: "Mind ↔ Body associations",
        corrCohortSample: (nA, nB) => `n = ${nA} vs ${nB} days`,
        corrInsufficient: "Requires at least 3 logged days in each cohort.",
        corrPairs: {
          sleep_vs_mood: {
            title: "Short sleep vs adequate sleep",
            cohortA: "Sleep < 7.0 h",
            cohortB: "Sleep ≥ 7.0 h",
            note: "Associative comparison around the 7.0 h sleep boundary (ames-sleep). Not a causal claim.",
          },
          co2_vs_cognition: {
            title: "Elevated ppCO₂ vs nominal air",
            cohortA: "ppCO₂ ≥ 3.0 mmHg",
            cohortB: "ppCO₂ < 3.0 mmHg",
            note: "Associative comparison around the 3.0 mmHg NASA-STD-3001 Watch limit. Not a causal claim.",
          },
          stress_vs_sleep: {
            title: "High stress vs low/moderate stress",
            cohortA: "Stress ≥ 4/5",
            cohortB: "Stress ≤ 3/5",
            note: "Associative comparison between high-stress and baseline days. Not a causal claim.",
          },
        },
        corrMetrics: {
          mood: "Mean mood",
          stress: "Mean stress",
          fatigueCogPct: "Fatigue / fog days",
          energy: "Mean energy",
          sleep: "Mean sleep",
          hr: "Mean HR",
        },
        basisIllustrative: "illustrative",
        disclaimer: "Days 1–77 include simulated sample history. Cohort deltas are illustrative associations (n ≥ 3 per group), not causal or diagnostic claims.",
      },
      stubImport: "CSV/JSON device data import and Houston micro-report export will run here in Stage 4.",
      nextStep: "Coming in next stage",
      loading: "Loading mission archive…",
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
      mindData: {
        title: "Mind & Data",
        desc: "Календарь с Day 1, психология и данные приборов",
        modules: {
          calendar: { title: "Календарь миссии", desc: "Дни 1–78: статистика дат, экран NO SIGNAL и ввод задним числом" },
          analytics: { title: "Психика и корреляции", desc: "Волатильность, темы мыслей и ассоциации Mind↔Body" },
          importReport: { title: "Импорт и микроотчёт", desc: "Загрузка CSV/JSON с приборов и сводка для Хьюстона (Этап 4)" },
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
      hint: "Свежие записи также попадают в Day 78 журнала миссии. Пороги условные.",
    },
    mindData: {
      tabs: { calendar: "Календарь", analytics: "Аналитика", importReport: "Импорт" },
      ranges: ["Дни 1–28", "Дни 29–56", "Дни 57–78"],
      dayShort: (d) => `D${String(d).padStart(2, "0")}`,
      dayTitle: (d) => `ДЕНЬ ${String(d).padStart(2, "0")}`,
      levels: { nominal: "Норма", watch: "Внимание", critical: "Критично" },
      emptyLevel: "Нет данных",
      sources: {
        sample: "Демо-история (sample)",
        checkin: "Check-in экипажа",
        manual: "Ручная запись",
        import: "Импорт с прибора",
      },
      calDisclaimer: "Дни 1–77 — демо-история · Ранг дня A–D является условной составной оценкой",
      resetSample: "Сбросить лог к демо",
      resetting: "Сброс…",
      physioTitle: "Физиологическая сводка",
      psychTitle: "Психологический срез",
      tagsTitle: "Быстрые теги",
      themesTitle: "Распознанные темы мыслей",
      sentimentTitle: "Тональность",
      noteTitle: "Заметки и мысли",
      notePlaceholder: "Свободные мысли, наблюдения за сном или атмосферой в каюте…",
      physioOptional: "Физио-параметры (необязательно)",
      noData: (d) => `За День ${d} не зафиксировано телеметрии и записей экипажа.`,
      noSignalTitle: "NO SIGNAL",
      noSignalSub: (d) => `НЕТ ДАННЫХ ЗА ДЕНЬ ${String(d).padStart(2, "0")}`,
      noSignalStatus: "АРХИВ МИССИИ",
      btnBack: "← Назад",
      btnEdit: "Изменить / дополнить дату",
      btnFill: "Заполнить данные на эту дату",
      btnSave: "Сохранить запись",
      btnSaving: "Сохранение…",
      formSubtitle: "Ввод задним числом или запись на дату",
      mood: "Настроение",
      energy: "Энергия",
      stress: "Стресс",
      sleep: "Сон",
      hr: "Пульс",
      bp: "Давление",
      bpSys: "Систолическое",
      bpDia: "Диастолическое",
      spo2: "SpO₂",
      ppco2: "ppCO₂",
      doseRate: "Доза",
      tags: {
        fatigue: "Усталость",
        weakness: "Слабость",
        brain_fog: "Туман в голове",
        poor_sleep: "Плохой сон",
        homesick: "Скучаю по дому",
        cabin_stuffy: "Душно в каюте",
        crew_tension: "Напряжение в экипаже",
        calm: "Спокойствие",
        focused: "Фокус",
        motivated: "Мотивация",
      },
      sentiments: {
        positive: "Позитивная",
        mixed: "Смешанная",
        negative: "Негативная",
        neutral: "Нейтральная",
      },
      themes: {
        isolation_family: "Изоляция и дом",
        fatigue_sleep: "Усталость и сон",
        cognitive_load: "Когнитивная нагрузка",
        cabin_environment: "Среда каюты / CO₂",
        crew_interpersonal: "Отношения в экипаже",
        positive_recovery: "Ресурс и восстановление",
      },
      analytics: {
        loading: "Расчёт аналитики миссии…",
        coverageTitle: "Покрытие и средние",
        loggedValue: (logged, total) => `${logged} / ${total} дн.`,
        sampleTag: (n) => `${n} демо`,
        manualTag: (n) => `${n} ручных`,
        checkinTag: (n) => `${n} check-in`,
        importTag: (n) => `${n} импорт`,
        avgMood: "Ср. настроение",
        avgStress: "Ср. стресс",
        avgSleep: "Ср. сон",
        volatility: "Волатильность σ (настр. / стресс)",
        sparkTitle: "Динамика настроения и стресса",
        legend: { mood: "Настроение", stress: "Стресс", shift: "Сдвиг ≥ 2" },
        noSeries: "Недостаточно оценок настроения и стресса для графика.",
        shiftsTitle: "Резкие сдвиги между записями",
        noShifts: "Резких скачков (|ΔНастр.| ≥ 2 или |ΔСтресс| ≥ 2) нет.",
        shiftRow: (fromDay, toDay) => `D${String(fromDay).padStart(2, "0")} → D${String(toDay).padStart(2, "0")}`,
        themesTitle: "Частые темы мыслей",
        noThemes: "Темы появятся после заполнения тегов или заметок.",
        sentimentTitle: "Баланс тональности",
        corrTitle: "Ассоциации Mind ↔ Body",
        corrCohortSample: (nA, nB) => `n = ${nA} vs ${nB} дн.`,
        corrInsufficient: "Нужно минимум 3 дня с данными в каждой когорте.",
        corrPairs: {
          sleep_vs_mood: {
            title: "Недосып и достаточный сон",
            cohortA: "Сон < 7.0 h",
            cohortB: "Сон ≥ 7.0 h",
            note: "Ассоциативное сравнение по порогу сна 7.0 h (ames-sleep). Не является причинной связью.",
          },
          co2_vs_cognition: {
            title: "Повышенный ppCO₂ и норма",
            cohortA: "ppCO₂ ≥ 3.0 mmHg",
            cohortB: "ppCO₂ < 3.0 mmHg",
            note: "Ассоциативное сравнение по порогу NASA-STD-3001 (3.0 mmHg). Не является причинной связью.",
          },
          stress_vs_sleep: {
            title: "Высокий и умеренный стресс",
            cohortA: "Стресс ≥ 4/5",
            cohortB: "Стресс ≤ 3/5",
            note: "Ассоциативное сравнение дней высокого стресса и базы. Не является причинной связью.",
          },
        },
        corrMetrics: {
          mood: "Ср. настроение",
          stress: "Ср. стресс",
          fatigueCogPct: "Дни с усталостью / туманом",
          energy: "Ср. энергия",
          sleep: "Ср. сон",
          hr: "Ср. пульс",
        },
        basisIllustrative: "illustrative",
        disclaimer: "Дни 1–77 включают демо-историю (Simulated sample history). Сравнения когорт — условные ассоциации (n ≥ 3 в каждой группе), не диагноз и не причинность.",
      },
      stubImport: "Импорт CSV/JSON с приборов и экспорт микроотчёта для Хьюстона будут добавлены на Этапе 4.",
      nextStep: "Следующий этап",
      loading: "Загрузка журнала миссии…",
    },
  },
};