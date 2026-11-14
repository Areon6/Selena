import { useState } from "react";
import type { Lang } from "../../../i18n";
import type { DayEntry } from "../../../types";
import { TABLET_I18N } from "../../tabletI18n";

interface Props {
  lang: Lang;
  day: number;
  existing?: DayEntry;
  onBack: () => void;
  onSave: (entry: DayEntry) => Promise<void>;
}

const TAG_IDS = [
  "fatigue",
  "weakness",
  "brain_fog",
  "poor_sleep",
  "homesick",
  "cabin_stuffy",
  "crew_tension",
  "calm",
  "focused",
  "motivated",
] as const;

function parseOpt(raw: string): number | undefined {
  const s = raw.trim().replace(",", ".");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function ScaleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="df-scale-row">
      <span className="df-scale-label">{label}</span>
      <div className="df-scale-btns">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={value === n ? "df-scale-btn active" : "df-scale-btn"}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DayForm({ lang, day, existing, onBack, onSave }: Props) {
  const T = TABLET_I18N[lang].mindData;

  const [mood, setMood] = useState(existing?.mood ?? 3);
  const [energy, setEnergy] = useState(existing?.energy ?? 3);
  const [stress, setStress] = useState(existing?.stress ?? 2);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [note, setNote] = useState(existing?.note ?? "");

  const [sleepH, setSleepH] = useState(existing?.sleepHours !== undefined ? String(existing.sleepHours) : "");
  const [hr, setHr] = useState(existing?.hr !== undefined ? String(existing.hr) : "");
  const [bpSys, setBpSys] = useState(existing?.bpSys !== undefined ? String(existing.bpSys) : "");
  const [bpDia, setBpDia] = useState(existing?.bpDia !== undefined ? String(existing.bpDia) : "");
  const [spo2, setSpo2] = useState(existing?.spo2 !== undefined ? String(existing.spo2) : "");
  const [ppco2, setPpco2] = useState(existing?.ppco2 !== undefined ? String(existing.ppco2) : "");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleTag = (id: string) =>
    setTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const entry: DayEntry = {
        day,
        source: "manual",
        mood,
        energy,
        stress,
        tags,
        note: note.trim() || undefined,
        themes: existing?.themes ?? [],
        sleepHours: parseOpt(sleepH),
        hr: parseOpt(hr),
        bpSys: parseOpt(bpSys),
        bpDia: parseOpt(bpDia),
        spo2: parseOpt(spo2),
        ppco2: parseOpt(ppco2),
        doseUsvH: existing?.doseUsvH,
      };
      await onSave(entry);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="df-root">
      <div className="df-header">
        <span className="dc-day-label">{T.dayTitle(day)}</span>
        <span className="df-subtitle">{T.formSubtitle}</span>
      </div>

      <div className="df-section-title">{T.psychTitle}</div>
      <ScaleRow label={T.mood} value={mood} onChange={setMood} />
      <ScaleRow label={T.energy} value={energy} onChange={setEnergy} />
      <ScaleRow label={T.stress} value={stress} onChange={setStress} />

      <div className="df-section-title">{T.tagsTitle}</div>
      <div className="df-tags">
        {TAG_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={tags.includes(id) ? "df-tag active" : "df-tag"}
            onClick={() => toggleTag(id)}
          >
            {T.tags[id] ?? id}
          </button>
        ))}
      </div>

      <div className="df-section-title">{T.noteTitle}</div>
      <textarea
        className="df-textarea"
        rows={3}
        placeholder={T.notePlaceholder}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="df-section-title">{T.physioOptional}</div>
      <div className="df-physio-grid">
        <div className="df-physio-row">
          <label className="df-physio-label">{T.sleep} (h)</label>
          <input className="df-physio-input" inputMode="decimal" placeholder="7.5" value={sleepH} onChange={(e) => setSleepH(e.target.value)} />
        </div>
        <div className="df-physio-row">
          <label className="df-physio-label">{T.hr} (bpm)</label>
          <input className="df-physio-input" inputMode="decimal" placeholder="66" value={hr} onChange={(e) => setHr(e.target.value)} />
        </div>
        <div className="df-physio-row">
          <label className="df-physio-label">{T.bpSys}</label>
          <input className="df-physio-input" inputMode="numeric" placeholder="120" value={bpSys} onChange={(e) => setBpSys(e.target.value)} />
        </div>
        <div className="df-physio-row">
          <label className="df-physio-label">{T.bpDia}</label>
          <input className="df-physio-input" inputMode="numeric" placeholder="78" value={bpDia} onChange={(e) => setBpDia(e.target.value)} />
        </div>
        <div className="df-physio-row">
          <label className="df-physio-label">{T.spo2} (%)</label>
          <input className="df-physio-input" inputMode="decimal" placeholder="97.5" value={spo2} onChange={(e) => setSpo2(e.target.value)} />
        </div>
        <div className="df-physio-row">
          <label className="df-physio-label">{T.ppco2} (mmHg)</label>
          <input className="df-physio-input" inputMode="decimal" placeholder="2.4" value={ppco2} onChange={(e) => setPpco2(e.target.value)} />
        </div>
      </div>

      {err && <div className="tb-warn-box tb-err">{err}</div>}

      <div className="dc-actions">
        <button type="button" className="md-btn md-btn-ghost" onClick={onBack} disabled={saving}>
          {T.btnBack}
        </button>
        <button type="button" className="md-btn md-btn-primary" onClick={submit} disabled={saving}>
          {saving ? T.btnSaving : T.btnSave}
        </button>
      </div>
    </div>
  );
}