import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BodyMetrics, BodyProfile } from "../types";
import { DEFAULT_PROFILE, clampProfile, computeMetrics, profileKey } from "../bodyParams";

export interface BodyProfileApi {
  /** Persisted in Rust (app data dir). */
  saved: BodyProfile;
  /** Live form value (slider drag). Drives only the cheap 3D preview. */
  draft: BodyProfile;
  /** What the 3D geometry is built from. Updates on slider release / Apply. */
  geometry: BodyProfile;
  metrics: BodyMetrics;
  dirty: boolean;
  busy: boolean;
  loaded: boolean;
  setDraft: (patch: Partial<BodyProfile>) => void;
  /** Rebuild the 3D model from the current draft (slider release, field blur). Does not persist. */
  commitGeometry: () => void;
  /** Persist the draft in Rust and rebuild. */
  apply: () => Promise<void>;
  /** Drop unsaved edits. */
  revert: () => void;
  /** Reset to the neutral mannequin (persisted). */
  resetToDefault: () => Promise<void>;
}

export function useBodyProfile(onError: (message: string) => void): BodyProfileApi {
  const [saved, setSaved] = useState<BodyProfile>(DEFAULT_PROFILE);
  const [draft, setDraftState] = useState<BodyProfile>(DEFAULT_PROFILE);
  const [geometry, setGeometry] = useState<BodyProfile>(DEFAULT_PROFILE);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const draftRef = useRef(draft);
  const savedRef = useRef(saved);

  const adopt = useCallback((p: BodyProfile) => {
    const c = clampProfile(p);
    draftRef.current = c;
    savedRef.current = c;
    setSaved(c);
    setDraftState(c);
    setGeometry(c);
  }, []);

  useEffect(() => {
    let alive = true;
    invoke<BodyProfile>("get_body_profile")
      .then((p) => alive && adopt(p))
      .catch((e) => alive && onError(String(e)))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [adopt, onError]);

  const setDraft = useCallback((patch: Partial<BodyProfile>) => {
    const next = clampProfile({ ...draftRef.current, ...patch });
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const commitGeometry = useCallback(() => setGeometry(draftRef.current), []);

  const apply = useCallback(async () => {
    setBusy(true);
    try {
      adopt(await invoke<BodyProfile>("set_body_profile", { profile: draftRef.current }));
    } catch (e) {
      // keep the edits visible even if the disk write failed
      setGeometry(draftRef.current);
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }, [adopt, onError]);

  const revert = useCallback(() => {
    draftRef.current = savedRef.current;
    setDraftState(savedRef.current);
    setGeometry(savedRef.current);
  }, []);

  const resetToDefault = useCallback(async () => {
    setBusy(true);
    try {
      adopt(await invoke<BodyProfile>("reset_body_profile"));
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }, [adopt, onError]);

  const metrics = useMemo(() => computeMetrics(draft), [draft]);
  const dirty = profileKey(draft) !== profileKey(saved);

  return {
    saved,
    draft,
    geometry,
    metrics,
    dirty,
    busy,
    loaded,
    setDraft,
    commitGeometry,
    apply,
    revert,
    resetToDefault,
  };
}