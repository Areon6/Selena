import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BodyProfile, BodyZone, Level } from "../types";
import { I18N } from "../i18n";
import { buildBodyGeometries } from "./bodyGeometries";
import {
  DEFAULT_PROFILE,
  REF_HEIGHT_M,
  deriveAnatomy,
  previewScale,
  profileKey,
  type AnatomySpec,
} from "../bodyParams";

export interface BodyModelProps {
  zones: BodyZone[];
  selected: string;
  onSelect: (id: string) => void;
  radiationLevel: Level;
  lang: "en" | "ru";
  /** Profile the geometry is BUILT from. A change rebuilds the point cloud (not the scene / renderer / material). */
  profile?: BodyProfile;
  /** Live slider draft: only applies a cheap `pointCloud.scale` until `profile` catches up. */
  previewProfile?: BodyProfile;
}

/* ------------------------------------------------------------------ */
/* Zone tables                                                         */
/* ------------------------------------------------------------------ */

const ZONE_INDEX_MAP: Record<string, number> = {
  radiation: 0,
  brain: 1,
  eyes: 2,
  heart: 3,
  lungs: 4,
  bones: 5,
};

const INDEX_TO_ZONE = ["radiation", "brain", "eyes", "heart", "lungs", "bones"];

// When several zones are under the cursor, small organs win over large layers
const PICK_PRIORITY = ["eyes", "heart", "brain", "lungs", "bones", "radiation"];

// Raw sRGB triplets (shader writes them without colour-space conversion)
const COLOR_VEC: Record<Level, [number, number, number]> = {
  nominal: [0.263, 0.753, 0.682], // #43c0ae
  watch: [0.914, 0.686, 0.306], // #e8af4e
  critical: [0.941, 0.376, 0.247], // #f0603f
};

const DUST: [number, number, number] = [0.55, 0.663, 0.741]; // #8ca9bd

/**
 * Surface sample counts per zone (~37 600 total).
 * Shell carries the silhouette, so it gets the biggest share.
 */
const ZONE_COUNTS: Record<string, number> = {
  radiation: 18000,
  bones: 8000,
  brain: 3500,
  eyes: 800,
  heart: 2800,
  lungs: 4500,
};

// Per-zone multiplier on the star-magnitude size (heart/lungs slightly finer
// so dense chest clusters keep the texture of individual points)
const ZONE_SIZE_SCALE: Record<string, number> = {
  radiation: 1.0,
  bones: 1.0,
  brain: 1.1,
  eyes: 1.15,
  heart: 0.9,
  lungs: 0.9,
};

/** Small deterministic PRNG: rebuilt clouds keep their point layout / sizes / twinkle phases stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Star-magnitude size distribution (CSS px, before zone scale):
 *  - ~83% faint dust:   0.8 – 1.2 px
 *  - ~17% anchor stars: 1.8 – 2.6 px (power-skewed: few really big ones)
 */
function starSize(rand: () => number): number {
  if (rand() < 0.17) {
    return 1.8 + Math.pow(rand(), 2.0) * 0.8;
  }
  return 0.8 + rand() * 0.4;
}

/* ------------------------------------------------------------------ */
/* Area-weighted surface sampling (positions + normals)                */
/* ------------------------------------------------------------------ */

interface Sampled {
  pos: Float32Array;
  nrm: Float32Array;
}

function sampleSurface(geo: THREE.BufferGeometry, count: number, rand: () => number): Sampled {
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);

  const P = geo.getAttribute("position") as THREE.BufferAttribute;
  const N = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
  const index = geo.getIndex();
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(P.count / 3);

  const vi = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const na = new THREE.Vector3();
  const nb = new THREE.Vector3();
  const nc = new THREE.Vector3();
  const n = new THREE.Vector3();

  if (triCount < 1) {
    for (let i = 0; i < count; i++) {
      const v = i % P.count;
      pos[i * 3] = P.getX(v);
      pos[i * 3 + 1] = P.getY(v);
      pos[i * 3 + 2] = P.getZ(v);
      nrm[i * 3 + 2] = 1;
    }
    return { pos, nrm };
  }

  // Cumulative triangle areas
  const cum = new Float64Array(triCount);
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(P, vi(t, 0));
    b.fromBufferAttribute(P, vi(t, 1));
    c.fromBufferAttribute(P, vi(t, 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    total += ab.cross(ac).length() * 0.5;
    cum[t] = total;
  }

  for (let i = 0; i < count; i++) {
    const r = rand() * total;
    let lo = 0;
    let hi = triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }

    const i0 = vi(lo, 0);
    const i1 = vi(lo, 1);
    const i2 = vi(lo, 2);

    a.fromBufferAttribute(P, i0);
    b.fromBufferAttribute(P, i1);
    c.fromBufferAttribute(P, i2);

    let u = rand();
    let v = rand();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;

    pos[i * 3] = a.x * w + b.x * u + c.x * v;
    pos[i * 3 + 1] = a.y * w + b.y * u + c.y * v;
    pos[i * 3 + 2] = a.z * w + b.z * u + c.z * v;

    if (N) {
      na.fromBufferAttribute(N, i0);
      nb.fromBufferAttribute(N, i1);
      nc.fromBufferAttribute(N, i2);
      n.set(0, 0, 0)
        .addScaledVector(na, w)
        .addScaledVector(nb, u)
        .addScaledVector(nc, v);
      if (n.lengthSq() < 1e-10) {
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        n.crossVectors(ab, ac);
      }
    } else {
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      n.crossVectors(ab, ac);
    }
    n.normalize();

    nrm[i * 3] = n.x;
    nrm[i * 3 + 1] = n.y;
    nrm[i * 3 + 2] = n.z;
  }

  return { pos, nrm };
}

function buildConstellationPointCloud(spec: AnatomySpec): THREE.BufferGeometry {
  const g = buildBodyGeometries(spec);

  const sources: { id: string; geo: THREE.BufferGeometry }[] = [
    { id: "radiation", geo: g.shell },
    { id: "brain", geo: g.brain },
    { id: "eyes", geo: g.eyes },
    { id: "heart", geo: g.heart },
    { id: "lungs", geo: g.lungs },
    { id: "bones", geo: g.skeleton },
  ];

  const total = sources.reduce((s, src) => s + ZONE_COUNTS[src.id], 0);

  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const aZone = new Float32Array(total);
  const aSize = new Float32Array(total);
  const aPhase = new Float32Array(total);
  const aCenter = new Float32Array(total * 3);

  let offset = 0;

  for (const src of sources) {
    const n = ZONE_COUNTS[src.id];
    const zoneNum = ZONE_INDEX_MAP[src.id];
    const scale = ZONE_SIZE_SCALE[src.id];
    const rand = mulberry32(0x5e1e4a + zoneNum * 7919);

    const { pos, nrm } = sampleSurface(src.geo, n, rand);

    // Zone centroid: pivot for heartbeat / breathing scaling
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < n; i++) {
      cx += pos[i * 3];
      cy += pos[i * 3 + 1];
      cz += pos[i * 3 + 2];
    }
    cx /= n;
    cy /= n;
    cz /= n;

    positions.set(pos, offset * 3);
    normals.set(nrm, offset * 3);

    for (let i = 0; i < n; i++) {
      const k = offset + i;
      aZone[k] = zoneNum;
      aSize[k] = starSize(rand) * scale;
      aPhase[k] = rand() * Math.PI * 2;
      aCenter[k * 3] = cx;
      aCenter[k * 3 + 1] = cy;
      aCenter[k * 3 + 2] = cz;
    }

    offset += n;
    src.geo.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("aZone", new THREE.BufferAttribute(aZone, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(aPhase, 1));
  geo.setAttribute("aCenter", new THREE.BufferAttribute(aCenter, 3));
  geo.computeBoundingSphere();

  return geo;
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const VERT = /* glsl */ `
  attribute float aZone;
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aCenter;

  uniform float uTime;
  uniform float uBeat;
  uniform float uBreath;
  uniform float uSelectedZone;
  uniform float uHoveredZone;
  uniform float uRadiationCrit;
  uniform float uPixelRatio;
  uniform float uRefDist;
  uniform float uCamDist;
  uniform float uBodyHeight;
  uniform vec3 uColors[6];

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    int zi = int(aZone + 0.5);

    // Heartbeat: scale about the heart centroid (no size/brightness blow-up)
    if (zi == 3) {
      pos = aCenter + (pos - aCenter) * (1.0 + 0.05 * uBeat);
    }
    // Breathing: lungs expand / contract about their centroid
    if (zi == 4) {
      pos = aCenter + (pos - aCenter) *
        vec3(1.0 + 0.030 * uBreath, 1.0 + 0.040 * uBreath, 1.0 + 0.035 * uBreath);
    }

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = length(mv.xyz);

    // Fresnel-style rim: 0 facing the camera, 1 at grazing angle.
    // abs() makes it independent of the normal's winding direction.
    vec3 nV = normalize(normalMatrix * normal);
    vec3 toCam = normalize(-mv.xyz);
    float fres = 1.0 - abs(dot(nV, toCam));
    float rimShell = pow(fres, 4.0);   // razor-thin silhouette on the body
    float rimOrg = pow(fres, 3.0);     // softer edge emphasis on bones / organs

    // Anchor stars (large aSize) vs faint dust (small aSize)
    float bright = smoothstep(1.45, 1.65, aSize);

    float sel = abs(float(zi) - uSelectedZone) < 0.5 ? 1.0 : 0.0;
    float hov = abs(float(zi) - uHoveredZone) < 0.5 ? 1.0 : 0.0;
    float pulse = 0.5 + 0.5 * sin(uTime * 4.5);
    float tw = 0.82 + 0.18 * sin(uTime * 2.6 + aPhase);

    vec3 col = uColors[zi];
    float alpha;
    float px = aSize;

    if (zi == 0) {
      // Body: almost transparent front/interior, bright whitish contour
      alpha = (0.12 + 0.90 * rimShell) * tw;
      col = mix(col, vec3(0.92, 0.98, 1.0), rimShell * 0.60);
      px *= 1.0 + rimShell * 0.15;
    } else if (zi == 5) {
      // Skeleton: thin haze-free structure, edges emphasised
      alpha = 0.26 + 0.34 * rimOrg;
      col = mix(col, vec3(0.92, 0.98, 1.0), rimOrg * 0.20);
    } else if (zi == 3 || zi == 4) {
      // Heart / lungs: low per-point opacity so additive overlap stays textured
      alpha = 0.20 + 0.40 * rimOrg;
      alpha *= 1.0 + 0.12 * (zi == 3 ? uBeat : 0.0);
    } else {
      // Brain / eyes
      alpha = 0.34 + 0.40 * rimOrg;
    }

    // Star magnitude: anchor stars shine, dust stays faint
    alpha *= mix(0.80, 1.50, bright);

    // Selection / hover emphasis (size stays within the 5 px cap below)
    px *= 1.0 + sel * (0.30 + 0.15 * pulse) + hov * 0.18;
    alpha += sel * (0.18 + 0.14 * pulse) + hov * 0.10;

    // Solar particle event: proton-flux band sweeps up the body
    if (uRadiationCrit > 0.5) {
      float w = fract(pos.y / uBodyHeight - uTime * 0.18);
      float band = smoothstep(0.0, 0.04, w) * (1.0 - smoothstep(0.04, 0.17, w));
      float k = zi == 0 ? 1.0 : 0.45;
      vec3 flux = mix(vec3(0.914, 0.686, 0.306), vec3(0.941, 0.376, 0.247),
                      fract(aPhase * 0.318));
      col = mix(col, flux, band * k);
      alpha += band * 0.45 * k;
      px *= 1.0 + band * 0.30 * k;
    }

    // Depth cue: points nearer the camera are brighter, far ones recede
    float dn = clamp((dist - (uCamDist - 0.45)) / 0.9, 0.0, 1.0);
    alpha *= mix(1.0, 0.5, dn);

    // Global brightness lift
    alpha *= 1.9;

    // Gentle perspective attenuation, hard 1–5 px cap
    float atten = clamp(uRefDist / dist, 0.8, 1.3);
    gl_PointSize = clamp(px * atten, 1.0, 5.0) * uPixelRatio;

    vColor = col;
    vAlpha = clamp(alpha, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // r: 0 at sprite centre, 1 at its edge. Purely radial profile,
    // so no 4-ray "cartoon star" artefacts.
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (r > 1.0) discard;

    float core = exp(-r * r * 7.0);           // small hot nucleus
    float halo = exp(-r * r * 3.0) * 0.22;    // faint, fast-fading glow
    float edge = 1.0 - smoothstep(0.85, 1.0, r);

    float intensity = (core + halo) * edge;
    vec3 col = mix(vColor, vec3(1.0), core * 0.65);  // white-hot centre

    gl_FragColor = vec4(col, vAlpha * intensity);
  }
`;

/* ------------------------------------------------------------------ */
/* Animation helpers                                                   */
/* ------------------------------------------------------------------ */

// Double-pulse heartbeat (lub-dub), ~72 bpm
function heartbeat(t: number): number {
  const period = 60 / 72;
  const ph = (t % period) / period;
  const g = (x: number, c: number, w: number) =>
    Math.exp(-Math.pow((x - c) / w, 2));
  return g(ph, 0.06, 0.04) + 0.6 * g(ph, 0.24, 0.05);
}

// Smooth breathing cycle, ~4.5 s
function breathing(t: number): number {
  return 0.5 - 0.5 * Math.cos((t * Math.PI * 2) / 4.5);
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export const BodyModel: React.FC<BodyModelProps> = ({
  zones,
  selected,
  onSelect,
  radiationLevel,
  lang,
  profile = DEFAULT_PROFILE,
  previewProfile,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);

  const propsRef = useRef({ zones, selected, radiationLevel, onSelect });

  useEffect(() => {
    propsRef.current = { zones, selected, radiationLevel, onSelect };
  }, [zones, selected, radiationLevel, onSelect]);

  // Profile the scene is initially built from (read once, inside the mount effect)
  const initialProfileRef = useRef<BodyProfile>(profile);

  const resetCameraRef = useRef<() => void>(() => {});
  const applyGeometryRef = useRef<(p: BodyProfile) => void>(() => {});
  const applyPreviewRef = useRef<(p: BodyProfile | undefined) => void>(() => {});

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || 400;
    let height = container.clientHeight || 560;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    let spec = deriveAnatomy(initialProfileRef.current);
    let builtKey = profileKey(initialProfileRef.current);
    const k0 = spec.heightM / REF_HEIGHT_M; // camera framing scales with the body

    // 1. SCENE AND CAMERA

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070c11);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    const TARGET = new THREE.Vector3(0, 1.05 * k0, 0);
    camera.position.set(0, 1.15 * k0, 3.8 * k0);
    camera.lookAt(TARGET);

    // 2. RENDERER

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);

    const dom = renderer.domElement;
    dom.style.display = "block";
    dom.style.position = "absolute";
    dom.style.inset = "0";
    dom.style.width = "100%";
    dom.style.height = "100%";
    dom.style.cursor = "grab";
    container.appendChild(dom);

    // 3. CONTROLS

    const controls = new OrbitControls(camera, dom);
    controls.target.copy(TARGET);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.5 * k0;
    controls.maxDistance = 6 * k0;
    controls.update();
    controls.saveState();

    resetCameraRef.current = () => {
      controls.reset();
    };

    // 4. CONSTELLATION

    const initialGeo = buildConstellationPointCloud(spec);
    let zoneAttr = initialGeo.getAttribute("aZone") as THREE.BufferAttribute;

    const uColors: THREE.Vector3[] = [
      new THREE.Vector3(...DUST),
      new THREE.Vector3(...COLOR_VEC.nominal),
      new THREE.Vector3(...COLOR_VEC.nominal),
      new THREE.Vector3(...COLOR_VEC.nominal),
      new THREE.Vector3(...COLOR_VEC.nominal),
      new THREE.Vector3(...DUST),
    ];

    const constellationMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uBreath: { value: 0 },
        uColors: { value: uColors },
        uSelectedZone: { value: -1.0 },
        uHoveredZone: { value: -1.0 },
        uRadiationCrit: { value: 0.0 },
        uPixelRatio: { value: pixelRatio },
        uRefDist: { value: 3.8 * k0 },
        uCamDist: { value: 3.8 * k0 },
        uBodyHeight: { value: spec.heightM },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    });

    const pointCloud = new THREE.Points(initialGeo, constellationMat);
    scene.add(pointCloud);

    // 4b. PROFILE CHANGES: swap ONLY the geometry (scene / renderer / controls / material stay)

    const rebuild = (next: BodyProfile) => {
      const key = profileKey(next);
      if (key === builtKey) return;

      let nextGeo: THREE.BufferGeometry;
      const nextSpec = deriveAnatomy(next);
      try {
        nextGeo = buildConstellationPointCloud(nextSpec);
      } catch (e) {
        console.error("SELENA: body geometry rebuild failed, keeping the previous model", e);
        return;
      }

      const prevGeo = pointCloud.geometry;
      pointCloud.geometry = nextGeo;
      zoneAttr = nextGeo.getAttribute("aZone") as THREE.BufferAttribute;
      prevGeo.dispose(); // release GPU buffers of the old cloud
      pointCloud.scale.set(1, 1, 1); // the live preview is now baked into the geometry

      // Keep the user's orbit angle, re-frame for the new height.
      const kOld = spec.heightM / REF_HEIGHT_M;
      const kNew = nextSpec.heightM / REF_HEIGHT_M;
      const newTarget = new THREE.Vector3(0, 1.05 * kNew, 0);
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(kNew / kOld);
      controls.target.copy(newTarget);
      camera.position.copy(newTarget).add(offset);
      controls.target0.copy(newTarget);
      controls.position0.set(0, 1.15 * kNew, 3.8 * kNew);
      controls.minDistance = 1.5 * kNew;
      controls.maxDistance = 6 * kNew;
      controls.update();

      constellationMat.uniforms.uRefDist.value = 3.8 * kNew;
      constellationMat.uniforms.uBodyHeight.value = nextSpec.heightM;

      spec = nextSpec;
      builtKey = key;
    };

    const preview = (p: BodyProfile | undefined) => {
      if (!p || profileKey(p) === builtKey) {
        pointCloud.scale.set(1, 1, 1);
        return;
      }
      const [sx, sy, sz] = previewScale(spec, deriveAnatomy(p));
      pointCloud.scale.set(sx, sy, sz); // about the origin: feet stay on y = 0
    };

    applyGeometryRef.current = rebuild;
    applyPreviewRef.current = preview;

    // 5. PICKING

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.02;
    const mouse = new THREE.Vector2();

    const updateMouse = (e: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    /** Returns { id, zoneNum } for the highest-priority zone under the cursor. */
    const pick = (): { id: string; zoneNum: number } | null => {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(pointCloud, false);
      if (!hits.length) return null;

      const found = new Set<string>();
      for (const h of hits) {
        if (h.index === undefined) continue;
        const zNum = Math.round(zoneAttr.getX(h.index));
        const id = INDEX_TO_ZONE[zNum];
        if (id) found.add(id);
      }
      for (const id of PICK_PRIORITY) {
        if (found.has(id)) return { id, zoneNum: ZONE_INDEX_MAP[id] };
      }
      return null;
    };

    let downX = 0;
    let downY = 0;
    let downValid = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      downX = e.clientX;
      downY = e.clientY;
      downValid = true;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0 || !downValid) return;
      downValid = false;

      // A drag orbits the camera, it is not a click
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;

      updateMouse(e);
      const hit = pick();
      if (hit) propsRef.current.onSelect(hit.id);
    };

    let moveQueued = false;
    let lastEvent: PointerEvent | null = null;
    let lastHover: string | null = null;

    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return; // orbiting
      lastEvent = e;
      if (moveQueued) return;
      moveQueued = true;

      requestAnimationFrame(() => {
        moveQueued = false;
        if (!lastEvent) return;

        updateMouse(lastEvent);
        const hit = pick();
        const id = hit ? hit.id : null;

        if (id !== lastHover) {
          lastHover = id;
          setHoveredZone(id);
          dom.style.cursor = id ? "pointer" : "grab";
          constellationMat.uniforms.uHoveredZone.value = hit ? hit.zoneNum : -1.0;
        }
      });
    };

    const onPointerLeave = () => {
      lastHover = null;
      setHoveredZone(null);
      constellationMat.uniforms.uHoveredZone.value = -1.0;
      dom.style.cursor = "grab";
    };

    const onDoubleClick = () => {
      resetCameraRef.current();
    };

    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerleave", onPointerLeave);
    dom.addEventListener("dblclick", onDoubleClick);

    // 6. RESIZE

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 2 || h < 2) return;
      width = w;
      height = h;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    });
    resizeObserver.observe(container);

    // 7. ANIMATION

    let reqId = 0;
    const clock = new THREE.Clock();
    const tint = new THREE.Vector3();

    const setLevelColor = (
      target: THREE.Vector3,
      base: [number, number, number],
      level: Level,
      amount: number,
    ) => {
      target.set(...base);
      tint.set(...COLOR_VEC[level]);
      target.lerp(tint, amount);
    };

    const animate = () => {
      reqId = requestAnimationFrame(animate);

      const time = clock.getElapsedTime();
      const { selected: activeSel, zones: curZones, radiationLevel: radLv } =
        propsRef.current;

      controls.update();

      const u = constellationMat.uniforms;
      u.uTime.value = time;
      u.uBeat.value = heartbeat(time);
      u.uBreath.value = breathing(time);
      u.uCamDist.value = camera.position.distanceTo(controls.target);
      u.uSelectedZone.value = ZONE_INDEX_MAP[activeSel] ?? -1.0;
      u.uRadiationCrit.value = radLv === "critical" ? 1.0 : 0.0;

      // Shell: silver dust, gently tinted by radiation status (contour stays readable)
      setLevelColor(
        uColors[0],
        DUST,
        radLv,
        radLv === "nominal" ? 0 : radLv === "watch" ? 0.35 : 0.5,
      );

      // Organs: pure status colour
      for (let i = 1; i <= 4; i++) {
        const zone = curZones.find((z) => z.id === INDEX_TO_ZONE[i]);
        const level: Level = zone?.level ?? "nominal";
        uColors[i].set(...COLOR_VEC[level]);
      }

      // Skeleton: silver blended with its status colour
      const bones = curZones.find((z) => z.id === "bones");
      setLevelColor(uColors[5], DUST, bones?.level ?? "nominal", 0.5);

      renderer.render(scene, camera);
    };

    animate();

    // 8. CLEANUP

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();

      applyGeometryRef.current = () => {};
      applyPreviewRef.current = () => {};

      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerleave", onPointerLeave);
      dom.removeEventListener("dblclick", onDoubleClick);

      controls.dispose();
      pointCloud.geometry.dispose(); // the CURRENT geometry (it may have been swapped)
      constellationMat.dispose();

      renderer.dispose();
      renderer.forceContextLoss();

      if (container.contains(dom)) {
        container.removeChild(dom);
      }
    };
  }, []);

  // Rebuild the point cloud when the committed profile changes (no-op if the key is unchanged).
  const geoKey = profileKey(profile);
  useEffect(() => {
    applyGeometryRef.current(profile);
  }, [geoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cheap live preview from the slider draft. Runs after the rebuild effect of the same commit.
  const previewKey = previewProfile ? profileKey(previewProfile) : "";
  useEffect(() => {
    applyPreviewRef.current(previewProfile);
  }, [previewKey, geoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = I18N[lang];

  const mono =
    'ui-monospace, "JetBrains Mono", "IBM Plex Mono", SFMono-Regular, Menlo, Consolas, monospace';

  const items = [
    { id: "brain", label: lang === "ru" ? "Мозг" : "Brain" },
    { id: "eyes", label: lang === "ru" ? "Глаза (SANS)" : "Eyes" },
    { id: "heart", label: lang === "ru" ? "Сердце" : "Heart" },
    { id: "lungs", label: lang === "ru" ? "Лёгкие" : "Lungs" },
    { id: "bones", label: lang === "ru" ? "Скелет" : "Skeleton" },
    { id: "radiation", label: lang === "ru" ? "Радиация" : "Radiation" },
  ];

  const CSS_COLOR: Record<Level, string> = {
    nominal: "#43c0ae",
    watch: "#e8af4e",
    critical: "#f0603f",
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 460,
        overflow: "hidden",
        background: "#070c11",
        userSelect: "none",
      }}
    >
      {/* Канвас монтируется сюда; он absolute и не влияет на раскладку */}
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* Верхняя телеметрия */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 16,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          pointerEvents: "none",
          fontFamily: mono,
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#5d6d76",
          }}
        >
          {lang === "ru"
            ? "LiDAR-созвездие человека"
            : "Celestial LiDAR Constellation Telemetry"}
        </span>

        <span
          style={{
            fontSize: 12,
            color: "#43c0ae",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#43c0ae",
              boxShadow: "0 0 8px #43c0ae",
              display: "inline-block",
            }}
          />
          {hoveredZone
            ? t.zones[hoveredZone]?.name ?? hoveredZone.toUpperCase()
            : lang === "ru"
              ? "Вращайте модель · Нажмите на орган"
              : "Rotate model · Click an organ"}
        </span>
      </div>

      {/* Сброс камеры */}
      <div style={{ position: "absolute", top: 12, right: 16 }}>
        <button
          onClick={() => resetCameraRef.current()}
          style={{
            padding: "5px 10px",
            fontFamily: mono,
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#cbd5e1",
            background: "rgba(15,25,34,0.6)",
            border: "1px solid rgba(100,116,139,0.6)",
            cursor: "pointer",
          }}
        >
          {lang === "ru" ? "⟲ Сброс вида" : "⟲ Reset View"}
        </button>
      </div>

      {/* Быстрый выбор органов */}
      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 12,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {items.map((item) => {
          const zoneObj = zones.find((z) => z.id === item.id);
          const level: Level =
            item.id === "radiation"
              ? radiationLevel
              : zoneObj?.level ?? "nominal";
          const isSelected = selected === item.id;
          const c = CSS_COLOR[level];

          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              style={{
                padding: "5px 10px",
                fontFamily: mono,
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                color: isSelected ? c : "#94a3ab",
                background: isSelected
                  ? "rgba(15,25,34,0.85)"
                  : "rgba(7,12,17,0.7)",
                border: `1px solid ${isSelected ? c : "rgba(100,116,139,0.35)"}`,
                boxShadow: isSelected ? `0 0 12px ${c}66` : "none",
                transition: "all 0.15s",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BodyModel;