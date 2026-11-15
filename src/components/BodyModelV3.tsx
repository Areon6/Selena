import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BodyProfile, BodyZone, Level } from "../types";
import { I18N, type Lang } from "../i18n";
import { buildBodyGeometries, type BodyGeometries } from "./bodyGeometries";
import { createEarthBackground, type EarthQuality } from "./earthBackground";
import {
  DEFAULT_PROFILE,
  REF_HEIGHT_M,
  deriveAnatomy,
  previewScale,
  profileKey,
  type AnatomySpec,
} from "../bodyParams";

export type BodyRenderMode = "lidar" | "holo";

export interface BodyModelProps {
  zones: BodyZone[];
  selected: string;
  onSelect: (id: string) => void;
  radiationLevel: Level;
  lang: Lang;
  /** Profile the geometry is BUILT from. A change rebuilds the point cloud / meshes (not the scene / renderer). */
  profile?: BodyProfile;
  /** Live slider draft: only applies a cheap group scale until `profile` catches up. */
  previewProfile?: BodyProfile;
  /**
   * Quality of the orbital Earth backdrop. "high" is the default; if the frame rate stays low the
   * backdrop downgrades itself to "low" once. Changing this prop re-arms that logic.
   */
  earthQuality?: EarthQuality;
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
  nominal: [0.204, 0.827, 0.6], // #34d399
  watch: [0.984, 0.749, 0.141], // #fbbf24
  critical: [0.973, 0.443, 0.443], // #f87171
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

function buildBodyAssets(spec: AnatomySpec): {
  pointGeo: THREE.BufferGeometry;
  geometries: BodyGeometries;
  centers: Record<string, THREE.Vector3>;
} {
  const geometries = buildBodyGeometries(spec);

  const sources: { id: string; geo: THREE.BufferGeometry }[] = [
    { id: "radiation", geo: geometries.shell },
    { id: "brain", geo: geometries.brain },
    { id: "eyes", geo: geometries.eyes },
    { id: "heart", geo: geometries.heart },
    { id: "lungs", geo: geometries.lungs },
    { id: "bones", geo: geometries.skeleton },
  ];

  const total = sources.reduce((s, src) => s + ZONE_COUNTS[src.id], 0);

  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const aZone = new Float32Array(total);
  const aSize = new Float32Array(total);
  const aPhase = new Float32Array(total);
  const aCenter = new Float32Array(total * 3);
  const centers: Record<string, THREE.Vector3> = {};

  let offset = 0;

  for (const src of sources) {
    const n = ZONE_COUNTS[src.id];
    const zoneNum = ZONE_INDEX_MAP[src.id];
    const scale = ZONE_SIZE_SCALE[src.id];
    const rand = mulberry32(0x5e1e4a + zoneNum * 7919);

    const { pos, nrm } = sampleSurface(src.geo, n, rand);

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
    centers[src.id] = new THREE.Vector3(cx, cy, cz);

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
  }

  const pointGeo = new THREE.BufferGeometry();
  pointGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  pointGeo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  pointGeo.setAttribute("aZone", new THREE.BufferAttribute(aZone, 1));
  pointGeo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
  pointGeo.setAttribute("aPhase", new THREE.BufferAttribute(aPhase, 1));
  pointGeo.setAttribute("aCenter", new THREE.BufferAttribute(aCenter, 3));
  pointGeo.computeBoundingSphere();

  return { pointGeo, geometries, centers };
}

/* ------------------------------------------------------------------ */
/* Shaders (LiDAR Points)                                              */
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

    if (zi == 3) {
      pos = aCenter + (pos - aCenter) * (1.0 + 0.05 * uBeat);
    }
    if (zi == 4) {
      pos = aCenter + (pos - aCenter) *
        vec3(1.0 + 0.030 * uBreath, 1.0 + 0.040 * uBreath, 1.0 + 0.035 * uBreath);
    }

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = length(mv.xyz);

    vec3 nV = normalize(normalMatrix * normal);
    vec3 toCam = normalize(-mv.xyz);
    float fres = 1.0 - abs(dot(nV, toCam));
    float rimShell = pow(fres, 4.0);
    float rimOrg = pow(fres, 3.0);

    float bright = smoothstep(1.45, 1.65, aSize);

    float sel = abs(float(zi) - uSelectedZone) < 0.5 ? 1.0 : 0.0;
    float hov = abs(float(zi) - uHoveredZone) < 0.5 ? 1.0 : 0.0;
    float pulse = 0.5 + 0.5 * sin(uTime * 4.5);
    float tw = 0.82 + 0.18 * sin(uTime * 2.6 + aPhase);

    vec3 col = uColors[zi];
    float alpha;
    float px = aSize;

    if (zi == 0) {
      alpha = (0.12 + 0.90 * rimShell) * tw;
      col = mix(col, vec3(0.92, 0.98, 1.0), rimShell * 0.60);
      px *= 1.0 + rimShell * 0.15;
    } else if (zi == 5) {
      alpha = 0.26 + 0.34 * rimOrg;
      col = mix(col, vec3(0.92, 0.98, 1.0), rimOrg * 0.20);
    } else if (zi == 3 || zi == 4) {
      alpha = 0.20 + 0.40 * rimOrg;
      alpha *= 1.0 + 0.12 * (zi == 3 ? uBeat : 0.0);
    } else {
      alpha = 0.34 + 0.40 * rimOrg;
    }

    alpha *= mix(0.80, 1.50, bright);

    px *= 1.0 + sel * (0.30 + 0.15 * pulse) + hov * 0.18;
    alpha += sel * (0.18 + 0.14 * pulse) + hov * 0.10;

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

    float dn = clamp((dist - (uCamDist - 0.45)) / 0.9, 0.0, 1.0);
    alpha *= mix(1.0, 0.5, dn);

    alpha *= 1.9;

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
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (r > 1.0) discard;

    float core = exp(-r * r * 7.0);
    float halo = exp(-r * r * 3.0) * 0.22;
    float edge = 1.0 - smoothstep(0.85, 1.0, r);

    float intensity = (core + halo) * edge;
    vec3 col = mix(vColor, vec3(1.0), core * 0.65);

    gl_FragColor = vec4(col, vAlpha * intensity);
  }
`;

/* ------------------------------------------------------------------ */
/* Shaders (Alternative Fresnel X-Ray Holo Mesh)                       */
/* ------------------------------------------------------------------ */

const HOLO_VERT = /* glsl */ `
  uniform float uBeat;
  uniform float uBreath;
  uniform int uZoneNum;
  uniform vec3 uCenter;

  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying float vLocalY;

  void main() {
    vec3 pos = position;
    if (uZoneNum == 3) {
      pos = uCenter + (pos - uCenter) * (1.0 + 0.055 * uBeat);
    } else if (uZoneNum == 4) {
      pos = uCenter + (pos - uCenter) *
        vec3(1.0 + 0.032 * uBreath, 1.0 + 0.042 * uBreath, 1.0 + 0.035 * uBreath);
    }

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    vLocalY = pos.y;
  }
`;

const HOLO_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uSelected;
  uniform float uHovered;
  uniform float uRadiationCrit;
  uniform float uBodyHeight;
  uniform int uZoneNum;
  uniform vec3 uColor;

  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying float vLocalY;

  void main() {
    float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
    float fres = clamp(1.0 - ndotv, 0.0, 1.0);
    float pulse = 0.5 + 0.5 * sin(uTime * 4.5);

    vec3 col = uColor;
    float alpha;

    if (uZoneNum == 0) {
      // Body shell: subtle x-ray veil in center, sharp Fresnel silhouette
      float rim = pow(fres, 2.8);
      alpha = 0.014 + 0.25 * rim;
      col = mix(col, vec3(0.90, 0.97, 1.0), rim * 0.45);
    } else if (uZoneNum == 5) {
      // Skeleton: clean translucent structural contour
      float rim = pow(fres, 2.0);
      alpha = 0.065 + 0.19 * rim;
      col = mix(col, vec3(0.92, 0.97, 1.0), rim * 0.20);
    } else {
      // Vital organs: crisp translucent volume + bright rim
      float rim = pow(fres, 1.7);
      alpha = 0.14 + 0.34 * rim;
      col = mix(col * 0.85, mix(col, vec3(1.0), 0.30), rim);
    }

    if (uSelected > 0.5) {
      alpha += (uZoneNum == 0 ? 0.08 : 0.14) * (0.75 + 0.25 * pulse);
      col = mix(col, vec3(1.0), 0.12 + 0.08 * pulse);
    } else if (uHovered > 0.5) {
      alpha += uZoneNum == 0 ? 0.04 : 0.08;
    }

    if (uRadiationCrit > 0.5) {
      float w = fract(vLocalY / uBodyHeight - uTime * 0.18);
      float band = smoothstep(0.0, 0.04, w) * (1.0 - smoothstep(0.04, 0.17, w));
      float k = uZoneNum == 0 ? 1.0 : 0.40;
      vec3 flux = vec3(0.941, 0.376, 0.247);
      col = mix(col, flux, band * k);
      alpha += band * 0.22 * k;
    }

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
  }
`;

/* ------------------------------------------------------------------ */
/* Animation helpers                                                   */
/* ------------------------------------------------------------------ */

function heartbeat(t: number): number {
  const period = 60 / 72;
  const ph = (t % period) / period;
  const g = (x: number, c: number, w: number) =>
    Math.exp(-Math.pow((x - c) / w, 2));
  return g(ph, 0.06, 0.04) + 0.6 * g(ph, 0.24, 0.05);
}

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
  earthQuality = "high",
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<BodyRenderMode>("lidar");

  const propsRef = useRef({ zones, selected, radiationLevel, onSelect, renderMode });

  useEffect(() => {
    propsRef.current = { zones, selected, radiationLevel, onSelect, renderMode };
  }, [zones, selected, radiationLevel, onSelect, renderMode]);

  const initialProfileRef = useRef<BodyProfile>(profile);
  const earthQualityRef = useRef<EarthQuality>(earthQuality);

  const resetCameraRef = useRef<() => void>(() => {});
  const applyGeometryRef = useRef<(p: BodyProfile) => void>(() => {});
  const applyPreviewRef = useRef<(p: BodyProfile | undefined) => void>(() => {});
  const applyEarthQualityRef = useRef<(q: EarthQuality) => void>(() => {});
  const applyRenderModeRef = useRef<(m: BodyRenderMode) => void>(() => {});

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || 400;
    let height = container.clientHeight || 560;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

    let spec = deriveAnatomy(initialProfileRef.current);
    let builtKey = profileKey(initialProfileRef.current);
    const k0 = spec.heightM / REF_HEIGHT_M;

    // 1. SCENE AND CAMERA

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    const TARGET = new THREE.Vector3(0, 1.05 * k0, 0);
    camera.position.set(0, 1.15 * k0, 3.8 * k0);
    camera.lookAt(TARGET);

    // 2. RENDERER

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
    });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    renderer.autoClear = false;

    const dom = renderer.domElement;
    dom.style.display = "block";
    dom.style.position = "absolute";
    dom.style.inset = "0";
    dom.style.width = "100%";
    dom.style.height = "100%";
    dom.style.cursor = "grab";
    container.appendChild(dom);

    // 2b. EARTH BACKDROP (earthBackground.ts — untouched)

    const earth = createEarthBackground({
      quality: earthQualityRef.current,
      pixelRatio,
    });
    earth.setSize(width, height, pixelRatio);

    let autoDowngraded = false;
    let lastFrameT = 0;
    let accDt = 0;
    let accN = 0;
    let badWindows = 0;

    applyEarthQualityRef.current = (q: EarthQuality) => {
      autoDowngraded = q === "low";
      accDt = 0;
      accN = 0;
      badWindows = 0;
      earth.setQuality(q);
    };

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

    // 4. CONSTELLATION (LiDAR) + ALTERNATIVE HOLO MESHES

    const initialAssets = buildBodyAssets(spec);
    let zoneAttr = initialAssets.pointGeo.getAttribute("aZone") as THREE.BufferAttribute;

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

    const pointCloud = new THREE.Points(initialAssets.pointGeo, constellationMat);
    scene.add(pointCloud);

    // Holo Mesh group sharing the exact same geometries and anatomical centers
    const holoGroup = new THREE.Group();
    const holoEntries: {
      id: string;
      zoneNum: number;
      mesh: THREE.Mesh;
      mat: THREE.ShaderMaterial;
    }[] = [];

    const holoDefs: { id: string; key: keyof BodyGeometries; order: number }[] = [
      { id: "bones", key: "skeleton", order: 0 },
      { id: "brain", key: "brain", order: 1 },
      { id: "eyes", key: "eyes", order: 1 },
      { id: "heart", key: "heart", order: 1 },
      { id: "lungs", key: "lungs", order: 1 },
      { id: "radiation", key: "shell", order: 2 },
    ];

    for (const def of holoDefs) {
      const zoneNum = ZONE_INDEX_MAP[def.id];
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uBeat: { value: 0 },
          uBreath: { value: 0 },
          uZoneNum: { value: zoneNum },
          uCenter: { value: (initialAssets.centers[def.id] ?? new THREE.Vector3()).clone() },
          uColor: { value: uColors[zoneNum].clone() },
          uSelected: { value: 0.0 },
          uHovered: { value: 0.0 },
          uRadiationCrit: { value: 0.0 },
          uBodyHeight: { value: spec.heightM },
        },
        vertexShader: HOLO_VERT,
        fragmentShader: HOLO_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(initialAssets.geometries[def.key], mat);
      mesh.renderOrder = def.order;
      mesh.userData.zoneId = def.id;
      mesh.userData.zoneNum = zoneNum;
      holoGroup.add(mesh);
      holoEntries.push({ id: def.id, zoneNum, mesh, mat });
    }
    scene.add(holoGroup);

    const syncVisibility = (mode: BodyRenderMode) => {
      pointCloud.visible = mode === "lidar";
      holoGroup.visible = mode === "holo";
    };
    syncVisibility(propsRef.current.renderMode);
    applyRenderModeRef.current = syncVisibility;

    // 4b. PROFILE CHANGES: swap geometries on both representations

    const rebuild = (next: BodyProfile) => {
      const key = profileKey(next);
      if (key === builtKey) return;

      const nextSpec = deriveAnatomy(next);
      let nextAssets: ReturnType<typeof buildBodyAssets>;
      try {
        nextAssets = buildBodyAssets(nextSpec);
      } catch (e) {
        console.error("SELENA: body geometry rebuild failed, keeping the previous model", e);
        return;
      }

      const prevGeo = pointCloud.geometry;
      pointCloud.geometry = nextAssets.pointGeo;
      zoneAttr = nextAssets.pointGeo.getAttribute("aZone") as THREE.BufferAttribute;
      prevGeo.dispose();
      pointCloud.scale.set(1, 1, 1);

      for (let idx = 0; idx < holoDefs.length; idx++) {
        const def = holoDefs[idx];
        const entry = holoEntries[idx];
        const oldMeshGeo = entry.mesh.geometry;
        entry.mesh.geometry = nextAssets.geometries[def.key];
        oldMeshGeo.dispose();
        entry.mat.uniforms.uCenter.value.copy(nextAssets.centers[def.id] ?? new THREE.Vector3());
        entry.mat.uniforms.uBodyHeight.value = nextSpec.heightM;
      }
      holoGroup.scale.set(1, 1, 1);

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
        holoGroup.scale.set(1, 1, 1);
        return;
      }
      const [sx, sy, sz] = previewScale(spec, deriveAnatomy(p));
      pointCloud.scale.set(sx, sy, sz);
      holoGroup.scale.set(sx, sy, sz);
    };

    applyGeometryRef.current = rebuild;
    applyPreviewRef.current = preview;

    // 5. PICKING (works identically in LiDAR and Holo Mesh modes)

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.02;
    const mouse = new THREE.Vector2();
    const holoMeshes = holoEntries.map((e) => e.mesh);

    const updateMouse = (e: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const pick = (): { id: string; zoneNum: number } | null => {
      raycaster.setFromCamera(mouse, camera);
      const found = new Set<string>();

      if (propsRef.current.renderMode === "holo") {
        const hits = raycaster.intersectObjects(holoMeshes, false);
        for (const h of hits) {
          const id = h.object.userData.zoneId as string | undefined;
          if (id) found.add(id);
        }
      } else {
        const hits = raycaster.intersectObject(pointCloud, false);
        for (const h of hits) {
          if (h.index === undefined) continue;
          const zNum = Math.round(zoneAttr.getX(h.index));
          const id = INDEX_TO_ZONE[zNum];
          if (id) found.add(id);
        }
      }

      if (!found.size) return null;
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
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;

      updateMouse(e);
      const hit = pick();
      if (hit) propsRef.current.onSelect(hit.id);
    };

    let moveQueued = false;
    let pickRaf = 0;
    let lastPickAt = 0;
    let lastEvent: PointerEvent | null = null;
    let lastHover: string | null = null;
    let hoveredZoneNum = -1.0;

    const runPick = (now: number) => {
      if (!lastEvent) {
        moveQueued = false;
        return;
      }
      if (now - lastPickAt < 50) {
        pickRaf = requestAnimationFrame(runPick);
        return;
      }
      lastPickAt = now;
      moveQueued = false;

      updateMouse(lastEvent);
      const hit = pick();
      const id = hit ? hit.id : null;

      if (id !== lastHover) {
        lastHover = id;
        hoveredZoneNum = hit ? hit.zoneNum : -1.0;
        setHoveredZone(id);
        dom.style.cursor = id ? "pointer" : "grab";
        constellationMat.uniforms.uHoveredZone.value = hoveredZoneNum;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return;
      lastEvent = e;
      if (moveQueued) return;
      moveQueued = true;
      pickRaf = requestAnimationFrame(runPick);
    };

    const onPointerLeave = () => {
      cancelAnimationFrame(pickRaf);
      moveQueued = false;
      lastEvent = null;
      lastHover = null;
      hoveredZoneNum = -1.0;
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
      earth.setSize(width, height, pixelRatio);
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
      const {
        selected: activeSel,
        zones: curZones,
        radiationLevel: radLv,
        renderMode: mode,
      } = propsRef.current;

      controls.update();

      const beat = heartbeat(time);
      const breath = breathing(time);
      const selNum = ZONE_INDEX_MAP[activeSel] ?? -1.0;
      const radCrit = radLv === "critical" ? 1.0 : 0.0;

      // Update zone colors shared by both render modes
      setLevelColor(
        uColors[0],
        DUST,
        radLv,
        radLv === "nominal" ? 0 : radLv === "watch" ? 0.35 : 0.5,
      );
      for (let i = 1; i <= 4; i++) {
        const zone = curZones.find((z) => z.id === INDEX_TO_ZONE[i]);
        const level: Level = zone?.level ?? "nominal";
        uColors[i].set(...COLOR_VEC[level]);
      }
      const bones = curZones.find((z) => z.id === "bones");
      setLevelColor(uColors[5], DUST, bones?.level ?? "nominal", 0.5);

      if (mode === "lidar") {
        const u = constellationMat.uniforms;
        u.uTime.value = time;
        u.uBeat.value = beat;
        u.uBreath.value = breath;
        u.uCamDist.value = camera.position.distanceTo(controls.target);
        u.uSelectedZone.value = selNum;
        u.uRadiationCrit.value = radCrit;
      } else {
        for (const entry of holoEntries) {
          const mu = entry.mat.uniforms;
          mu.uTime.value = time;
          mu.uBeat.value = beat;
          mu.uBreath.value = breath;
          mu.uColor.value.copy(uColors[entry.zoneNum]);
          mu.uSelected.value = entry.zoneNum === selNum ? 1.0 : 0.0;
          mu.uHovered.value = entry.zoneNum === hoveredZoneNum ? 1.0 : 0.0;
          mu.uRadiationCrit.value = radCrit;
        }
      }

      const dt = time - lastFrameT;
      lastFrameT = time;
      if (!autoDowngraded && earth.ready && earth.getQuality() === "high" && time > 4) {
        accDt += Math.min(dt, 0.25);
        accN++;
        if (accN >= 90) {
          badWindows = accDt / accN > 0.036 ? badWindows + 1 : 0;
          accDt = 0;
          accN = 0;
          if (badWindows >= 2) {
            autoDowngraded = true;
            earth.setQuality("low");
            console.warn("SELENA: low frame rate, Earth backdrop switched to low quality");
          }
        }
      }

      renderer.clear();
      earth.update(time, controls.getAzimuthalAngle());
      earth.render(renderer);
      renderer.clearDepth();
      renderer.render(scene, camera);
    };

    animate();

    // 8. CLEANUP

    return () => {
      cancelAnimationFrame(reqId);
      cancelAnimationFrame(pickRaf);
      resizeObserver.disconnect();

      applyGeometryRef.current = () => {};
      applyPreviewRef.current = () => {};
      applyEarthQualityRef.current = () => {};
      applyRenderModeRef.current = () => {};

      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerleave", onPointerLeave);
      dom.removeEventListener("dblclick", onDoubleClick);

      controls.dispose();
      pointCloud.geometry.dispose();
      constellationMat.dispose();
      for (const entry of holoEntries) {
        entry.mesh.geometry.dispose();
        entry.mat.dispose();
      }
      earth.dispose();

      renderer.dispose();
      renderer.forceContextLoss();

      if (container.contains(dom)) {
        container.removeChild(dom);
      }
    };
  }, []);

  useEffect(() => {
    earthQualityRef.current = earthQuality;
    applyEarthQualityRef.current(earthQuality);
  }, [earthQuality]);

  useEffect(() => {
    applyRenderModeRef.current(renderMode);
  }, [renderMode]);

  const geoKey = profileKey(profile);
  useEffect(() => {
    applyGeometryRef.current(profile);
  }, [geoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewKey = previewProfile ? profileKey(previewProfile) : "";
  useEffect(() => {
    applyPreviewRef.current(previewProfile);
  }, [previewKey, geoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = I18N[lang];

  const items = [
    { id: "brain", label: "Brain" },
    { id: "eyes", label: "Eyes · SANS" },
    { id: "heart", label: "Heart" },
    { id: "lungs", label: "Lungs" },
    { id: "bones", label: "Skeleton" },
    { id: "radiation", label: "Radiation" },
  ];

  const CSS_COLOR: Record<Level, string> = {
    nominal: "#34d399",
    watch: "#fbbf24",
    critical: "#f87171",
  };

  const HAIRLINE = "1px solid rgba(255, 255, 255, 0.16)";
  const mono = "var(--mono)";

  // WebKitGTK: native button chrome must be reset explicitly on every custom button.
  const btnBase: React.CSSProperties = {
    WebkitAppearance: "none",
    appearance: "none",
    margin: 0,
    borderRadius: 2,
    border: HAIRLINE,
    fontFamily: mono,
    fontSize: 10.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "border-color 0.15s, color 0.15s",
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 420,
        overflow: "hidden",
        background: "#05070b",
        userSelect: "none",
      }}
    >
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* Top telemetry caption */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 12,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: mono,
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#626c7c",
          }}
        >
          {renderMode === "lidar" ? "LiDAR constellation scan" : "Holographic anatomy mesh"}
        </span>

        <span
          style={{
            fontFamily: "var(--sans)",
            fontSize: 12.5,
            fontWeight: 500,
            color: "#e6eaf0",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#38bdf8",
              display: "inline-block",
            }}
          />
          {hoveredZone ? (t.zones[hoveredZone]?.name ?? hoveredZone) : "Rotate model · click an organ"}
        </span>
      </div>

      {/* Mode toggle + Reset view */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          role="radiogroup"
          aria-label="Render mode"
          style={{ display: "inline-flex", border: HAIRLINE, borderRadius: 2, background: "#0b0f17" }}
        >
          {(
            [
              { id: "lidar", label: "LiDAR" },
              { id: "holo", label: "Holo" },
            ] as const
          ).map((m) => {
            const active = renderMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setRenderMode(m.id)}
                style={{
                  ...btnBase,
                  border: "none",
                  borderRadius: 0,
                  padding: "6px 10px",
                  fontWeight: active ? 600 : 400,
                  color: active ? "#38bdf8" : "#98a2b3",
                  background: active ? "rgba(56, 189, 248, 0.14)" : "#0b0f17",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => resetCameraRef.current()}
          style={{
            ...btnBase,
            padding: "6px 10px",
            color: "#98a2b3",
            background: "#0b0f17",
          }}
        >
          ⟲ Reset view
        </button>
      </div>

      {/* Quick zone selector */}
      <div
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 10,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 4,
        }}
      >
        {items.map((item) => {
          const zoneObj = zones.find((z) => z.id === item.id);
          const level: Level = item.id === "radiation" ? radiationLevel : (zoneObj?.level ?? "nominal");
          const isSelected = selected === item.id;
          const c = CSS_COLOR[level];

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              style={{
                ...btnBase,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 9px",
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? "#e6eaf0" : "#98a2b3",
                background: isSelected ? "#111622" : "#0b0f17",
                border: `1px solid ${isSelected ? c : "rgba(255, 255, 255, 0.12)"}`,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: c,
                  display: "inline-block",
                }}
              />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BodyModel;
