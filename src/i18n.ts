export type Lang = "en";

export interface ZoneItem {
  name: string;
  note: string;
  why: string;
  action: string;
}

const EN = {
    systemTitle: "On-board clinical decision support",
    missionBadge: (day: number, delayMin: number) => `SOL / DAY ${day} · ${delayMin} MIN EARTH DELAY`,
    crewSetup: "CREW SETUP",
    crewChipTitle: "Crew profile and flight deck briefing",
    tabletBtn: "Tablet",
    offline: "OFFLINE",
    mission: "Mission",
    day: "Day",
    mode: "Mode",
    autonomous: "Autonomous",
    linked: "Linked",
    levels: {
      nominal: "Nominal",
      watch: "Watch",
      critical: "Critical",
    },
    emergencyProtocol: "Emergency protocol",
    fiveHazards: "NASA HRP · five hazards",
    earthLink: "Earth link",
    houston: "Houston",
    crew: "Crew",
    commsDelayText: (min: number) => `${min} min one-way signal delay. All analysis runs offline on board.`,
    demoControls: "Demo controls",
    simulateSolar: "Simulate solar particle event",
    simulateCo2: "Simulate CO₂ scrubber failure",
    restoreCo2: "Restore CO₂ scrubber",
    resetScenario: "Reset scenario",
    bodyMapTitle: "Body map · select a region",
    vitals: {
      heartRate: "Heart rate",
      bloodPressure: "Blood pressure",
      spo2: "SpO₂",
      co2: "ppCO₂",
      sleep: "Sleep",
      doseRate: "Dose rate",
    },
    selectedRegion: "Selected region",
    whyItMatters: "Why it matters",
    whatToDo: "What to do",
    countermeasures: "Countermeasures",
    sources: "Sources",
    checked: "Checked",
    basis: {
      nasa: "NASA standard",
      mixed: "NASA + illustrative",
      illustrative: "Illustrative threshold",
    },
    zones: {
      brain: {
        name: "Brain · Sleep",
        note: "Short sleep under isolation erodes judgment. Keep a fixed sleep window.",
        why: "Isolation, confinement and shifted light cycles erode sleep, and short sleep degrades judgment and mood.",
        action: "Hold a fixed sleep window, log mood daily, and tell the crew if two nights in a row come up short.",
      },
      eyes: {
        name: "Eyes · SANS",
        note: "Headward fluid shift can swell the optic disc. The baseline scan is your reference.",
        why: "Without gravity, fluid shifts toward the head. It can swell the optic disc and flatten the back of the eye (SANS).",
        action: "Run the optic nerve ultrasound on schedule, compare with your baseline, and report any new blurring.",
      },
      heart: {
        name: "Cardiovascular",
        note: "Resting values inside the planned range. Monitored for orthostatic deconditioning.",
        why: "The heart works less without gravity and pressure regulation drifts. On long missions that matters.",
        action: "Take pressure and pulse at rest at the same time each day. Keep the aerobic sessions in the plan.",
      },
      lungs: {
        name: "Lungs · Air",
        note: "Cabin CO₂ builds up before any alarm. Headache or drowsiness is the early sign.",
        why: "A sealed cabin lets CO₂ build up. Headache and drowsiness show up before most alarms do.",
        action: "Check ppCO₂ near your sleep station, move the air, and report sustained readings above watch level.",
      },
      bones: {
        name: "Bone & Muscle",
        note: "Unloaded bone loses mineral. Resistive exercise is the main countermeasure.",
        why: "Without gravity and countermeasures, an unloaded skeleton loses about 1–1.5% of its bone density per month on 4–6 month missions.",
        action: "Complete the ARED sessions and keep protein and vitamin D on plan.",
      },
      radiation: {
        name: "Radiation",
        note: "Background cosmic rays monitored. Critical shelter protocols standing by.",
        why: "Cosmic rays are constant. Solar particle events arrive within hours and can deliver a large dose fast.",
        action: "In a storm, go to the shielded shelter, follow the protocol and log personal dosimeter readings.",
      },
    } as Record<string, ZoneItem>,
    hazards: {
      radiation: { name: "Space Radiation", detail: "Simulated cumulative dose" },
      isolation: { name: "Isolation & Confinement", detail: "Sleep & mood check-in" },
      distance: { name: "Distance from Earth", detail: "Offline decision support" },
      gravity: { name: "Gravity Fields", detail: "ARED & optic baseline" },
      environment: { name: "Closed Environment", detail: "Limit 3.0 mmHg · NASA-STD-3001" },
    },
    tasks: {
      ared: { title: "ARED resistive exercise", detail: "Squat, deadlift and heel-raise sets to counter bone demineralization." },
      optic_scan: { title: "Optic nerve ultrasound", detail: "Ultrasound self-scan of the optic nerve sheath (SANS)." },
      bp_check: { title: "Blood pressure and pulse", detail: "Seated, at rest. Log it in Tablet → Check-in." },
      sleep_log: { title: "Sleep and mood log", detail: "Hours slept and a 1–5 mood score. Log it in Tablet → Check-in." },
    },
};

export const I18N: Record<Lang, typeof EN> = { en: EN };
