/**
 * Procedural anatomy for SELENA's BodyModel — parametric version.
 *
 * Every mesh is generated procedurally with Three.js. No external assets or network requests.
 *
 * Reference frame (before the global height scale): metres, reference height 1.81 m,
 * feet y = 0, front +z. The final per-geometry scale (spec.sx, spec.sy, spec.sx) is applied about the origin,
 * so the feet always stay on y = 0.
 *
 * Consistency model ("shell = bones + positive soft tissue"):
 *  - skeleton + organs depend on sex / height / shoulderWidth / hips (the skeletal frame) and never on fat;
 *    the only soft-tissue influence is the outward swing of the hanging arms around a bulkier trunk,
 *    applied identically to arm bones and arm shell;
 *  - the shell depends on the same frame PLUS soft tissue (weight, fat, muscle, waist, hips);
 *  - the trunk shell is floored by the real bone envelope (measured from the generated skeleton vertices),
 *    limb shells share the bones' joint-centre shifts and have a bounded negative thickness.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DEFAULT_SPEC, type AnatomySpec } from "../bodyParams";

type N3 = [number, number, number];
type G = THREE.BufferGeometry;

/* ───────────────────────── INTERPOLATION ───────────────────────── */

/** Monotone cubic interpolation (Fritsch–Carlson). */
function pchip(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const h: number[] = [];
  const d: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }

  const m: number[] = new Array<number>(n).fill(0);

  m[0] = d[0];
  m[n - 1] = d[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];

      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }

  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];

    let i = 0;

    while (x > xs[i + 1]) i++;

    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;

    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h[i] * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h[i] * m[i + 1]
    );
  };
}

/* ───────────────────────── LOFT GEOMETRY ───────────────────────── */

interface Frame {
  c: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  a: number;
  b: number;
  n: number;
}

const MIN_R = 0.0012;

function loft(frames: Frame[], radial = 44): G {
  const rings = frames.length;

  const pos = new Float32Array(rings * radial * 3);

  const p = new THREE.Vector3();

  for (let r = 0; r < rings; r++) {
    const f = frames[r];
    const e = 2 / f.n;

    for (let k = 0; k < radial; k++) {
      const ang = (k / radial) * Math.PI * 2;

      const ca = Math.cos(ang);
      const sa = Math.sin(ang);

      const ex = Math.sign(ca) * Math.pow(Math.abs(ca), e);
      const ez = Math.sign(sa) * Math.pow(Math.abs(sa), e);

      p.copy(f.c)
        .addScaledVector(f.u, Math.max(f.a, MIN_R) * ex)
        .addScaledVector(f.v, Math.max(f.b, MIN_R) * ez);

      pos.set([p.x, p.y, p.z], (r * radial + k) * 3);
    }
  }

  const idx: number[] = [];

  for (let r = 0; r < rings - 1; r++) {
    for (let k = 0; k < radial; k++) {
      const a = r * radial + k;
      const b = r * radial + ((k + 1) % radial);
      const c = (r + 1) * radial + k;
      const d = (r + 1) * radial + ((k + 1) % radial);

      idx.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();

  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();

  return g;
}

/* ───────────────────────── REFERENCE TORSO AND HEAD ───────────────────────── */

// y, half-width, half-depth, z-centre, superellipse exponent

const TRUNK: [number, number, number, number, number][] = [
  [0.755, 0.055, 0.045, 0.0, 2.0],
  [0.775, 0.105, 0.075, 0.0, 2.2],
  [0.82, 0.15, 0.095, -0.004, 2.3],
  [0.88, 0.175, 0.105, -0.008, 2.4],
  [0.95, 0.17, 0.105, -0.006, 2.4],
  [1.02, 0.15, 0.096, 0.0, 2.3],
  [1.09, 0.145, 0.095, 0.002, 2.3],
  [1.16, 0.16, 0.105, 0.004, 2.4],
  [1.23, 0.18, 0.115, 0.006, 2.5],
  [1.30, 0.205, 0.12, 0.006, 2.5],
  [1.36, 0.218, 0.115, 0.002, 2.5],
  [1.41, 0.205, 0.105, -0.002, 2.4],
  [1.46, 0.155, 0.085, -0.004, 2.2],
  [1.50, 0.09, 0.07, -0.004, 2.0],
  [1.525, 0.06, 0.06, 0.0, 2.0],
  [1.56, 0.052, 0.056, 0.008, 2.0],
  [1.585, 0.056, 0.066, 0.016, 2.0],
  [1.61, 0.068, 0.088, 0.024, 2.0],
  [1.64, 0.076, 0.1, 0.018, 2.0],
  [1.68, 0.08, 0.105, 0.01, 2.0],
  [1.72, 0.08, 0.104, 0.004, 2.0],
  [1.76, 0.068, 0.092, 0.0, 2.0],
  [1.79, 0.044, 0.062, -0.004, 2.0],
  [1.803, 0.018, 0.03, -0.006, 2.0],
  [1.808, 0.002, 0.003, -0.006, 2.0],
];

/* ───────────────────────── PARAMETRIC HELPERS ───────────────────────── */

const SKIN = 0.007; // minimum shell clearance over any bone, m
const gs = (y: number, c: number, w: number) => Math.exp(-(((y - c) / w) ** 2));
const sstep = (x: number, lo: number, hi: number) => THREE.MathUtils.smoothstep(x, lo, hi);
const clampN = THREE.MathUtils.clamp;

/** Soft-tissue growth of the trunk half-width at height y (shell only). */
function trunkSoftA(spec: AnatomySpec, y: number): number {
  const s = spec.soft;
  return s.hip * gs(y, 0.88, 0.09) + s.waist * gs(y, 1.07, 0.11) + s.chest * gs(y, 1.31, 0.1);
}

/** Soft-tissue growth of the trunk half-depth at height y (shell only). */
function trunkSoftB(spec: AnatomySpec, y: number): number {
  const s = spec.soft;
  return (
    s.hipDepth * gs(y, 0.88, 0.09) + s.waistDepth * gs(y, 1.07, 0.11) + s.chestDepth * gs(y, 1.31, 0.1)
  );
}

/**
 * Outward "abduction" of the hanging arm so it clears a fatter trunk. Zero at the shoulder joint (the joint
 * stays put), peaks at waist / hip level, fades out again towards the hand. Bones and shell use the SAME
 * function, so the bone never leaves its skin.
 */
function armExtra(spec: AnatomySpec, y: number): number {
  return (
    0.7 *
    Math.max(0, trunkSoftA(spec, clampN(y, 0.9, 1.42))) *
    sstep(y, 0.85, 1.0) *
    (1 - sstep(y, 1.1, 1.38))
  );
}

/** Lateral shift of a leg point at height y: pelvis width, decaying towards the ankle. Bones + shell. */
function legShift(spec: AnatomySpec, y: number): number {
  return spec.hipDx * clampN(0.35 + (0.65 * (y - 0.1)) / 0.77, 0.35, 1);
}

const legWT = (y: number) => sstep(y, 0.42, 0.72);
const legWC = (y: number) => gs(y, 0.33, 0.11);

/** Extra outward shift of the leg shell (thigh / calf bulk), shell only. */
function legExtra(spec: AnatomySpec, y: number): number {
  return 0.8 * Math.max(0, spec.soft.thigh * legWT(y) + spec.soft.calf * legWC(y));
}

/* ───────────────────────── BONE ENVELOPE ───────────────────────── */

/** Per-height extent of the trunk bones (measured from the actual skeleton vertices). */
interface TrunkEnvelope {
  a: Float32Array; // max |x|
  front: Float32Array; // max z
  back: Float32Array; // max -z
  has: Uint8Array;
}

const ENV_Y0 = 0.7;
const ENV_STEP = 0.01;
const ENV_N = 100;
const ENV_DILATE = 3;

function buildEnvelope(parts: G[]): TrunkEnvelope {
  const a = new Float32Array(ENV_N);
  const front = new Float32Array(ENV_N).fill(-Infinity);
  const back = new Float32Array(ENV_N).fill(-Infinity);
  const has = new Uint8Array(ENV_N);

  for (const g of parts) {
    const P = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) {
      const bin = Math.round((P.getY(i) - ENV_Y0) / ENV_STEP);
      if (bin < 0 || bin >= ENV_N) continue;
      const x = Math.abs(P.getX(i));
      const z = P.getZ(i);
      if (x > a[bin]) a[bin] = x;
      if (z > front[bin]) front[bin] = z;
      if (-z > back[bin]) back[bin] = -z;
      has[bin] = 1;
    }
  }

  // Dilate so that a row between two bins still sees the bone extents next to it.
  const out: TrunkEnvelope = {
    a: new Float32Array(ENV_N),
    front: new Float32Array(ENV_N).fill(-Infinity),
    back: new Float32Array(ENV_N).fill(-Infinity),
    has: new Uint8Array(ENV_N),
  };
  for (let i = 0; i < ENV_N; i++) {
    for (let j = Math.max(0, i - ENV_DILATE); j <= Math.min(ENV_N - 1, i + ENV_DILATE); j++) {
      if (!has[j]) continue;
      out.has[i] = 1;
      out.a[i] = Math.max(out.a[i], a[j]);
      out.front[i] = Math.max(out.front[i], front[j]);
      out.back[i] = Math.max(out.back[i], back[j]);
    }
  }
  return out;
}

function envAt(env: TrunkEnvelope, y: number) {
  const i = Math.round((y - ENV_Y0) / ENV_STEP);
  if (i < 0 || i >= ENV_N || !env.has[i]) return null;
  return { a: env.a[i], front: env.front[i], back: env.back[i] };
}

/* ───────────────────────── TRUNK SHELL ───────────────────────── */

function trunkGeometry(spec: AnatomySpec, env: TrunkEnvelope): G {
  const s = spec.soft;

  const rows = TRUNK.map(([y, a, b, z, n]): [number, number, number, number, number] => {
    const neck = gs(y, 1.56, 0.045);
    let na = a + trunkSoftA(spec, y) + spec.shoulderDx * gs(y, 1.4, 0.07) + s.neck * neck;
    let nb = b + trunkSoftB(spec, y) + s.neck * neck;

    // Floor against the real skeleton so bones can never poke through the skin.
    if (y >= 0.8 && y <= 1.52) {
      const e = envAt(env, y);
      if (e) {
        na = Math.max(na, e.a + SKIN);
        nb = Math.max(nb, e.front + SKIN - z, e.back + SKIN + z);
      }
    }
    return [y, na, nb, z, n];
  });

  const ys = rows.map((k) => k[0]);

  const fa = pchip(ys, rows.map((k) => k[1]));
  const fb = pchip(ys, rows.map((k) => k[2]));
  const fz = pchip(ys, rows.map((k) => k[3]));
  const fn = pchip(ys, rows.map((k) => k[4]));

  const samples = new Set<number>(ys);

  for (let y = ys[0]; y < ys[ys.length - 1]; y += 0.007) {
    samples.add(+y.toFixed(4));
  }

  const frames: Frame[] = [...samples]
    .sort((p, q) => p - q)
    .map((y) => ({
      c: new THREE.Vector3(0, y, fz(y)),
      u: new THREE.Vector3(1, 0, 0),
      v: new THREE.Vector3(0, 0, 1),
      a: fa(y),
      b: fb(y),
      n: fn(y),
    }));

  return loft(frames, 56);
}

/* ───────────────────────── LIMBS ───────────────────────── */

interface TubeKey {
  p: N3;
  a: number;
  b: number;
}

interface TubeOpts {
  ref?: N3;
  capStart?: number;
  capEnd?: number;
  n?: number;
  radial?: number;
}

function tube(keys: TubeKey[], o: TubeOpts = {}): G {
  const pts = keys.map((k) => new THREE.Vector3(...k.p));

  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");

  const L = curve.getLength();

  const cum = [0];

  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  }

  const s = cum.map((c) => c / cum[cum.length - 1]);

  const fa = pchip(s, keys.map((k) => k.a));
  const fb = pchip(s, keys.map((k) => k.b));

  const capS = o.capStart ?? 0;
  const capE = o.capEnd ?? 0;

  const set = new Set<number>();

  const count = Math.max(8, Math.ceil(L / 0.01));

  for (let i = 0; i <= count; i++) {
    set.add(i / count);
  }

  for (const f of [0.02, 0.08, 0.2, 0.4, 0.65, 0.85]) {
    if (capS > 0) {
      set.add((capS * f) / L);
    }

    if (capE > 0) {
      set.add(1 - (capE * f) / L);
    }
  }

  const ts = [...set].sort((p, q) => p - q);

  const ref = new THREE.Vector3(...(o.ref ?? [0, 0, 1]));

  const frames: Frame[] = ts.map((t) => {
    const T = curve.getTangentAt(t).normalize();

    let u = new THREE.Vector3().crossVectors(T, ref);

    if (u.lengthSq() < 0.000001) {
      u = new THREE.Vector3().crossVectors(T, new THREE.Vector3(0, 1, 0));
    }

    if (u.lengthSq() < 0.000001) {
      u = new THREE.Vector3().crossVectors(T, new THREE.Vector3(1, 0, 0));
    }

    u.normalize();

    const v = new THREE.Vector3().crossVectors(u, T).normalize();

    const d = t * L;

    let k = 1;

    if (capS > 0 && d < capS) {
      k = Math.min(k, Math.sqrt(1 - (1 - d / capS) ** 2));
    }

    if (capE > 0 && L - d < capE) {
      k = Math.min(k, Math.sqrt(1 - (1 - (L - d) / capE) ** 2));
    }

    return {
      c: curve.getPointAt(t),
      u,
      v,
      a: fa(t) * k,
      b: fb(t) * k,
      n: o.n ?? 2,
    };
  });

  return loft(frames, o.radial ?? 30);
}

const mx = (p: N3): N3 => [-p[0], p[1], p[2]];

const mirrorKeys = (keys: TubeKey[]): TubeKey[] =>
  keys.map((k) => ({
    ...k,
    p: mx(k.p),
  }));

// Reference arm (right side, x > 0): fuller upper arms, natural elbows and forearms.

const ARM: TubeKey[] = [
  { p: [0.205, 1.415, 0.0], a: 0.075, b: 0.072 },
  { p: [0.235, 1.36, -0.002], a: 0.068, b: 0.065 },
  { p: [0.255, 1.29, -0.004], a: 0.058, b: 0.055 },
  { p: [0.27, 1.21, -0.008], a: 0.052, b: 0.05 },
  { p: [0.28, 1.14, -0.006], a: 0.047, b: 0.045 },
  { p: [0.29, 1.08, 0.0], a: 0.044, b: 0.043 },
  { p: [0.30, 1.02, 0.008], a: 0.041, b: 0.039 },
  { p: [0.31, 0.96, 0.014], a: 0.036, b: 0.034 },
  { p: [0.32, 0.90, 0.02], a: 0.032, b: 0.03 },
  { p: [0.325, 0.86, 0.022], a: 0.035, b: 0.027 },
  { p: [0.33, 0.81, 0.025], a: 0.034, b: 0.024 },
  { p: [0.335, 0.76, 0.027], a: 0.027, b: 0.019 },
  { p: [0.338, 0.72, 0.028], a: 0.018, b: 0.014 },
  { p: [0.34, 0.70, 0.028], a: 0.009, b: 0.008 },
];

// Reference leg: balanced thighs, knees and calves.

const LEG: TubeKey[] = [
  { p: [0.105, 0.91, -0.006], a: 0.09, b: 0.095 },
  { p: [0.105, 0.84, -0.004], a: 0.092, b: 0.094 },
  { p: [0.103, 0.76, 0.0], a: 0.084, b: 0.087 },
  { p: [0.10, 0.68, 0.004], a: 0.073, b: 0.078 },
  { p: [0.097, 0.60, 0.008], a: 0.061, b: 0.066 },
  { p: [0.095, 0.53, 0.012], a: 0.053, b: 0.057 },
  { p: [0.093, 0.47, 0.006], a: 0.052, b: 0.058 },
  { p: [0.09, 0.40, -0.002], a: 0.049, b: 0.053 },
  { p: [0.087, 0.32, -0.008], a: 0.043, b: 0.047 },
  { p: [0.085, 0.23, -0.006], a: 0.036, b: 0.039 },
  { p: [0.084, 0.14, -0.004], a: 0.031, b: 0.033 },
  { p: [0.084, 0.08, 0.0], a: 0.032, b: 0.031 },
];

// Reference foot: slightly wider forefoot and rounded toes.

const FOOT: TubeKey[] = [
  { p: [0.084, 0.045, -0.055], a: 0.028, b: 0.034 },
  { p: [0.085, 0.04, -0.015], a: 0.035, b: 0.04 },
  { p: [0.087, 0.034, 0.035], a: 0.042, b: 0.034 },
  { p: [0.09, 0.027, 0.10], a: 0.045, b: 0.027 },
  { p: [0.092, 0.02, 0.16], a: 0.037, b: 0.019 },
  { p: [0.093, 0.018, 0.195], a: 0.018, b: 0.01 },
];

/** Right arm shell: shifted with the shoulder girdle, thickened by upper-arm / forearm soft tissue. */
function armKeysFor(spec: AnatomySpec): TubeKey[] {
  const s = spec.soft;
  return ARM.map((k) => {
    const y = k.p[1];
    const extra = armExtra(spec, y);
    const wUp = sstep(y, 0.95, 1.25);
    const wFore = (1 - wUp) * sstep(y, 0.82, 0.95);
    let dr = s.upperArm * wUp + s.forearm * wFore;
    dr = Math.max(dr, -0.012 * wUp); // bone-in-skin margin of the upper arm is ~27 mm
    // The arm bones follow the same shift, but the reference forearm has ~0 mm of bone-in-skin margin
    // and the two curves are interpolated independently, so keep a few mm of slack once it is displaced.
    if (extra > 0) dr = Math.max(dr, 0.004);
    return { p: [k.p[0] + spec.shoulderDx + extra, y, k.p[2]], a: k.a + dr, b: k.b + dr };
  });
}

/** Right leg shell. */
function legKeysFor(spec: AnatomySpec): TubeKey[] {
  const s = spec.soft;
  return LEG.map((k) => {
    const y = k.p[1];
    const wT = legWT(y);
    const wC = legWC(y);
    const extra = legExtra(spec, y);
    let dr = s.thigh * wT + s.calf * wC;
    dr = Math.max(dr, -0.012 * Math.min(1, wT + wC));
    dr = Math.max(dr, extra);
    return { p: [k.p[0] + legShift(spec, y) + extra, y, k.p[2]], a: k.a + dr, b: k.b + dr };
  });
}

function footKeysFor(spec: AnatomySpec): TubeKey[] {
  return FOOT.map((k) => ({
    ...k,
    p: [k.p[0] + legShift(spec, k.p[1]), k.p[1], k.p[2]] as N3,
  }));
}

/* ───────────────────────── PRIMITIVES ───────────────────────── */

function ellipsoid(c: N3, r: N3, rot: N3 = [0, 0, 0], seg = 24): G {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));

  g.deleteAttribute("uv");

  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...c),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(...r),
    ),
  );

  return g;
}

function pipe(points: N3[], r: number, segs = 24, radial = 8): G {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));

  const g = new THREE.TubeGeometry(curve, segs, r, radial, false);

  g.deleteAttribute("uv");

  return g;
}

function mirrored(g: G): G {
  const m = g.clone();

  m.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));

  return m;
}

function merge(parts: G[]): G {
  const out = mergeGeometries(parts, false);

  parts.forEach((p) => p.dispose());

  if (!out) {
    throw new Error("Unable to merge procedural anatomy geometries.");
  }

  return out;
}

/* ───────────────────────── SHELL ───────────────────────── */

/** Mannequin shell. One merged geometry, no sex-specific detail except an optional bust for `female`. */
function buildShell(spec: AnatomySpec, env: TrunkEnvelope): G {
  const s = spec.soft;
  const arm = armKeysFor(spec);
  const leg = legKeysFor(spec);
  const foot = footKeysFor(spec);

  const parts: G[] = [
    trunkGeometry(spec, env),

    // Arms
    tube(arm, { capEnd: 0.025, capStart: 0.035, radial: 32 }),
    tube(mirrorKeys(arm), { capEnd: 0.025, capStart: 0.035, radial: 32 }),

    // Legs
    tube(leg, { capStart: 0.045, capEnd: 0.025, radial: 36 }),
    tube(mirrorKeys(leg), { capStart: 0.045, capEnd: 0.025, radial: 36 }),

    // Feet
    tube(foot, { ref: [0, 1, 0], capStart: 0.035, capEnd: 0.035, n: 2.3, radial: 28 }),
    tube(mirrorKeys(foot), { ref: [0, 1, 0], capStart: 0.035, capEnd: 0.035, n: 2.3, radial: 28 }),
  ];

  for (const sg of [1, -1]) {
    const armX = (y: number) => spec.shoulderDx + armExtra(spec, y);
    const legX = (y: number) => legShift(spec, y) + legExtra(spec, y);

    // Rounded shoulders (deltoid)
    parts.push(
      ellipsoid(
        [sg * (0.215 + armX(1.405)), 1.405, 0.0],
        [0.075 + s.shoulder, 0.075 + s.shoulder, 0.068 + s.shoulder],
        [0, 0, sg * -0.08],
        32,
      ),
    );

    // Chest contour
    parts.push(
      ellipsoid(
        [sg * 0.095, 1.315, 0.09 + s.chestDepth],
        [0.09, 0.055, 0.035 + s.chestDepth * 0.2],
        [0.12, 0, sg * -0.08],
        32,
      ),
    );

    // Bust (female profile only)
    if (s.bust > 0) {
      parts.push(
        ellipsoid(
          [sg * 0.075, 1.275, 0.088 + s.chestDepth + 0.025 * s.bust],
          [0.05 + 0.014 * s.bust, 0.046 + 0.012 * s.bust, 0.03 + 0.022 * s.bust],
          [0.1, 0, 0],
          28,
        ),
      );
    }

    // Smooth hip / glute transition
    parts.push(
      ellipsoid(
        [sg * 0.085, 0.875, -0.045],
        [0.085 + Math.max(0, s.hip) * 0.8, 0.09, 0.065 + Math.max(0, s.hipDepth)],
        [0, 0, 0],
        28,
      ),
    );

    // Elbow
    parts.push(
      ellipsoid(
        [sg * (0.31 + armX(0.91)), 0.91, 0.018],
        [0.034 + s.forearm, 0.04 + s.forearm, 0.032 + s.forearm],
        [0, 0, 0],
        20,
      ),
    );

    // Wrist
    parts.push(ellipsoid([sg * (0.337 + armX(0.735)), 0.735, 0.027], [0.022, 0.03, 0.02], [0, 0, 0], 20));

    // Hand
    parts.push(
      ellipsoid(
        [sg * (0.342 + armX(0.685)), 0.685, 0.035],
        [0.031, 0.052, 0.018],
        [0.12, 0, sg * -0.12],
        24,
      ),
    );

    // Kneecap
    parts.push(
      ellipsoid([sg * (0.093 + legX(0.515)), 0.515, 0.044], [0.034, 0.035, 0.026], [0, 0, 0], 24),
    );

    // Ankle
    parts.push(
      ellipsoid([sg * (0.084 + legX(0.09)), 0.09, -0.002], [0.032, 0.04, 0.03], [0, 0, 0], 20),
    );

    // Ears
    parts.push(ellipsoid([sg * 0.078, 1.678, -0.004], [0.008, 0.028, 0.016], [0, 0, 0], 14));
  }

  // Subtle nose, no detailed facial features
  parts.push(ellipsoid([0, 1.662, 0.108], [0.011, 0.026, 0.02], [-0.25, 0, 0], 16));

  return merge(parts);
}

/* ───────────────────────── BRAIN ───────────────────────── */

function buildBrain(): G {
  const g = new THREE.SphereGeometry(1, 96, 64);

  g.deleteAttribute("uv");

  const p = g.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);

    const gyri =
      0.05 * Math.sin(v.x * 11 + 1.3) * Math.sin(v.y * 9) * Math.sin(v.z * 10 + 0.7) +
      0.03 * Math.sin(v.x * 21) * Math.sin(v.z * 19 + 2) +
      0.025 * Math.sin(v.y * 24 + v.x * 6);

    const fissure =
      v.y > 0.1 ? 0.07 * Math.exp(-((v.x / 0.07) ** 2)) * Math.min(1, v.y * 2) : 0;

    const flatBase = v.y < -0.35 ? (v.y + 0.35) * -0.25 : 0;

    v.multiplyScalar(1 + gyri - fissure - flatBase);

    p.setXYZ(i, v.x, v.y, v.z);
  }

  g.applyMatrix4(new THREE.Matrix4().makeScale(0.06, 0.05, 0.08).setPosition(0, 1.722, 0.002));

  g.computeVertexNormals();

  const cerebellum = ellipsoid([0, 1.668, -0.058], [0.042, 0.022, 0.03], [0.2, 0, 0], 24);

  const stem = pipe(
    [
      [0, 1.68, -0.03],
      [0, 1.625, -0.022],
      [0, 1.575, -0.012],
    ],
    0.011,
    10,
    10,
  );

  return merge([g, cerebellum, stem]);
}

/* ───────────────────────── EYES ───────────────────────── */

function buildEyes(): G {
  const parts: G[] = [];

  for (const s of [1, -1]) {
    parts.push(ellipsoid([s * 0.032, 1.688, 0.084], [0.0125, 0.0125, 0.0125], [0, 0, 0], 20));

    parts.push(
      pipe(
        [
          [s * 0.032, 1.688, 0.074],
          [s * 0.022, 1.692, 0.04],
          [s * 0.01, 1.7, 0.0],
        ],
        0.0035,
        12,
        8,
      ),
    );
  }

  return merge(parts);
}

/* ───────────────────────── HEART ───────────────────────── */

function buildHeart(): G {
  const g = new THREE.SphereGeometry(1, 48, 36);

  g.deleteAttribute("uv");

  const p = g.attributes.position;

  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);

    const taper = y < 0 ? 1 + y * 0.62 : 1;

    p.setXYZ(i, p.getX(i) * taper, y, p.getZ(i) * taper);
  }

  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(0.04, 1.285, 0.03),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.55)),
      new THREE.Vector3(0.045, 0.058, 0.04),
    ),
  );

  g.computeVertexNormals();

  const aorta = pipe(
    [
      [0.014, 1.31, 0.012],
      [0.004, 1.362, 0.004],
      [-0.026, 1.39, -0.016],
      [-0.046, 1.345, -0.036],
    ],
    0.0105,
    24,
    10,
  );

  const pulm = pipe(
    [
      [-0.006, 1.31, 0.03],
      [-0.022, 1.345, 0.032],
      [-0.044, 1.352, 0.01],
    ],
    0.008,
    16,
    8,
  );

  return merge([g, aorta, pulm]);
}

/* ───────────────────────── LUNGS ───────────────────────── */

function lung(side: 1 | -1): G {
  const g = new THREE.SphereGeometry(1, 40, 28);

  g.deleteAttribute("uv");

  const p = g.attributes.position;

  const size = side === 1 ? 0.92 : 1;

  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);

    if (x * side < 0) {
      x *= 0.62;
    }

    p.setXYZ(i, x * 0.058 * (1 + 0.16 * -y) * size, y * 0.115 * size, p.getZ(i) * 0.05);
  }

  g.applyMatrix4(new THREE.Matrix4().makeTranslation(side * 0.087, 1.315, -0.004));

  g.computeVertexNormals();

  return g;
}

function buildLungs(): G {
  const trachea = pipe(
    [
      [0, 1.5, -0.008],
      [0, 1.44, -0.008],
      [0, 1.395, -0.006],
    ],
    0.0085,
    12,
    10,
  );

  const bR = pipe(
    [
      [0, 1.395, -0.006],
      [-0.02, 1.37, -0.004],
      [-0.05, 1.335, -0.004],
    ],
    0.0065,
    12,
    8,
  );

  const bL = pipe(
    [
      [0, 1.395, -0.006],
      [0.02, 1.37, -0.004],
      [0.05, 1.335, -0.004],
    ],
    0.0065,
    12,
    8,
  );

  return merge([lung(-1), lung(1), trachea, bR, bL]);
}

/* ───────────────────────── SKELETON ───────────────────────── */

const spineZ = (y: number) => -0.062 + 0.02 * Math.cos(((y - 1.0) / 0.25) * Math.PI);

function iliacWingGeometry(): G {
  const NU = 14;
  const NV = 12;

  const evalMid = (u: number, v: number): THREE.Vector3 => {
    const x0 = 0.048 + 0.04 * u - 0.004 * Math.sin(u * Math.PI);
    const y0 = 0.895 - 0.012 * Math.sin(u * Math.PI) + 0.01 * u;
    const z0 = -0.036 + 0.064 * u;

    const x1 = 0.044 + 0.052 * u + 0.012 * Math.sin(u * Math.PI);
    const y1 = 0.930 + 0.018 * Math.sin(u * Math.PI) + 0.002 * u;
    const z1 = -0.048 + 0.086 * u;

    const x2 = 0.040 + 0.062 * u + 0.042 * Math.sin(Math.pow(u, 0.85) * Math.PI);
    const y2 = 0.960 + 0.048 * Math.sin(Math.pow(u, 0.8) * Math.PI) - 0.008 * u;
    const z2 = -0.056 + 0.102 * u;

    const w0 = (1 - v) * (1 - 2 * v);
    const w1 = 4 * v * (1 - v);
    const w2 = v * (2 * v - 1);

    return new THREE.Vector3(
      w0 * x0 + w1 * x1 + w2 * x2,
      w0 * y0 + w1 * y1 + w2 * y2,
      w0 * z0 + w1 * z1 + w2 * z2,
    );
  };

  const halfThick = (u: number, v: number): number => {
    const fossa = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
    return 0.0075 - 0.0032 * fossa - 0.0015 * v;
  };

  const cols = NU + 1;
  const rows = NV + 1;
  const perSide = cols * rows;
  const positions = new Float32Array(perSide * 2 * 3);

  const du = new THREE.Vector3();
  const dv = new THREE.Vector3();
  const n = new THREE.Vector3();
  const eps = 0.01;

  for (let iv = 0; iv < rows; iv++) {
    const v = iv / NV;
    for (let iu = 0; iu < cols; iu++) {
      const u = iu / NU;
      const m = evalMid(u, v);

      const u0 = Math.max(0, u - eps);
      const u1 = Math.min(1, u + eps);
      const v0 = Math.max(0, v - eps);
      const v1 = Math.min(1, v + eps);

      du.subVectors(evalMid(u1, v), evalMid(u0, v));
      dv.subVectors(evalMid(u, v1), evalMid(u, v0));
      n.crossVectors(dv, du);
      if (n.lengthSq() > 1e-12) {
        n.normalize();
      } else {
        n.set(1, 0, 0);
      }

      const h = halfThick(u, v);
      const idx = iv * cols + iu;

      positions.set([m.x + n.x * h, m.y + n.y * h, m.z + n.z * h], idx * 3);
      positions.set([m.x - n.x * h, m.y - n.y * h, m.z - n.z * h], (perSide + idx) * 3);
    }
  }

  const idx: number[] = [];
  const o = (iu: number, iv: number) => iv * cols + iu;
  const i = (iu: number, iv: number) => perSide + iv * cols + iu;

  for (let iv = 0; iv < NV; iv++) {
    for (let iu = 0; iu < NU; iu++) {
      const oa = o(iu, iv);
      const ob = o(iu + 1, iv);
      const oc = o(iu, iv + 1);
      const od = o(iu + 1, iv + 1);
      idx.push(oa, oc, ob, ob, oc, od);

      const ia = i(iu, iv);
      const ib = i(iu + 1, iv);
      const ic = i(iu, iv + 1);
      const id = i(iu + 1, iv + 1);
      idx.push(ia, ib, ic, ib, id, ic);
    }
  }

  for (let iu = 0; iu < NU; iu++) {
    idx.push(o(iu, 0), o(iu + 1, 0), i(iu, 0), o(iu + 1, 0), i(iu + 1, 0), i(iu, 0));
    idx.push(o(iu, NV), i(iu, NV), o(iu + 1, NV), o(iu + 1, NV), i(iu, NV), i(iu + 1, NV));
  }
  for (let iv = 0; iv < NV; iv++) {
    idx.push(o(0, iv), i(0, iv), o(0, iv + 1), o(0, iv + 1), i(0, iv), i(0, iv + 1));
    idx.push(o(NU, iv), o(NU, iv + 1), i(NU, iv), o(NU, iv + 1), i(NU, iv + 1), i(NU, iv));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

interface SkeletonParts {
  skull: G[];
  /** spine, ribs, sternum, scapulae, pelvis: defines the trunk bone envelope */
  trunk: G[];
  clavicles: G[];
  /** arm + leg bones (covered by the limb shells, which share their joint-centre shifts) */
  limbs: G[];
}

function skeletonParts(spec: AnatomySpec): SkeletonParts {
  const skull: G[] = [];
  const trunk: G[] = [];
  const clavicles: G[] = [];
  const limbs: G[] = [];

  const dx = spec.shoulderDx;
  /** z about the rib-cage centre, scaled with the rib depth */
  const zr = (z: number) => 0.004 + (z - 0.004) * spec.ribZ;
  const A = (s: number) => (x: number, y: number, z: number): N3 => [s * (x + dx + armExtra(spec, y)), y, z];
  const L = (s: number) => (x: number, y: number, z: number): N3 => [s * (x + legShift(spec, y)), y, z];

  // Skull and mandible

  skull.push(ellipsoid([0, 1.716, -0.004], [0.072, 0.088, 0.092], [0, 0, 0], 32));

  skull.push(
    pipe(
      [
        [-0.05, 1.63, 0.005],
        [-0.03, 1.598, 0.06],
        [0, 1.592, 0.085],
        [0.03, 1.598, 0.06],
        [0.05, 1.63, 0.005],
      ],
      0.008,
      20,
      8,
    ),
  );

  // Vertebral column

  for (let i = 0; i < 24; i++) {
    const t = i / 23;

    const y = 1.505 - t * 0.575;
    const r = 0.012 + t * 0.012;

    const c = new THREE.CylinderGeometry(r, r * 1.05, 0.017, 14);

    c.deleteAttribute("uv");
    c.translate(0, y, spineZ(y));

    trunk.push(c);

    trunk.push(ellipsoid([0, y + 0.002, spineZ(y) - r - 0.01], [0.006, 0.01, 0.014], [0.35, 0, 0], 8));
  }

  // Rib cage

  const widths = [0.62, 0.76, 0.88, 0.96, 1.0, 1.0, 0.97, 0.9, 0.82, 0.74];

  for (let i = 0; i < 10; i++) {
    const y0 = 1.425 - i * 0.0255;

    const w = widths[i];

    const rx = 0.15 * w * spec.ribX;
    const rz = 0.092 * (0.7 + 0.3 * w) * spec.ribZ;

    const pts: N3[] = [];

    for (let j = 0; j <= 9; j++) {
      const phi = (0.04 + (j / 9) * 0.89) * Math.PI;

      pts.push([rx * Math.sin(phi), y0 - 0.055 * Math.pow(phi / Math.PI, 1.3), 0.004 - rz * Math.cos(phi)]);
    }

    const r = pipe(pts, 0.0038, 28, 6);

    trunk.push(r, mirrored(r));
  }

  // Sternum

  trunk.push(ellipsoid([0, 1.335, zr(0.094)], [0.02, 0.09, 0.008], [-0.05, 0, 0], 12));

  // Shoulder girdle

  for (const s of [1, -1] as const) {
    clavicles.push(
      pipe(
        [
          [s * 0.015, 1.468, zr(0.075)],
          [s * (0.1 + 0.5 * dx), 1.478, zr(0.065)],
          [s * (0.195 + dx), 1.455, zr(0.015)],
        ],
        0.0065,
        20,
        8,
      ),
    );

    trunk.push(
      ellipsoid([s * (0.1 + 0.5 * dx), 1.37, zr(-0.078)], [0.05, 0.07, 0.012], [0.1, s * 0.3, 0], 16),
    );

    limbs.push(ellipsoid([s * (0.205 + dx), 1.43, -0.005], [0.022, 0.016, 0.022], [0, 0, 0], 12));
  }

  // Pelvis (sacrum, coccyx, iliac wings + crests, pelvic ring, ischium, acetabulum).
  // Built in the reference frame, then widened as one piece by spec.pelvisW.

  const pelvis: G[] = [];

  pelvis.push(
    tube(
      [
        { p: [0, 0.935, -0.047], a: 0.044, b: 0.016 },
        { p: [0, 0.910, -0.058], a: 0.042, b: 0.015 },
        { p: [0, 0.880, -0.064], a: 0.030, b: 0.012 },
        { p: [0, 0.850, -0.060], a: 0.017, b: 0.009 },
        { p: [0, 0.822, -0.045], a: 0.006, b: 0.005 },
      ],
      { capStart: 0.01, capEnd: 0.01, n: 2.2, radial: 20 },
    ),
  );

  const rightWing = iliacWingGeometry();
  pelvis.push(rightWing, mirrored(rightWing));

  // Pubic symphysis
  pelvis.push(ellipsoid([0, 0.818, 0.054], [0.012, 0.016, 0.009], [-0.2, 0, 0], 12));

  for (const s of [1, -1] as const) {
    // Iliac crest rim -> ASIS -> AIIS -> acetabular roof
    pelvis.push(
      pipe(
        [
          [s * 0.040, 0.960, -0.056],
          [s * 0.078, 0.992, -0.041],
          [s * 0.112, 1.003, -0.005],
          [s * 0.114, 0.985, 0.024],
          [s * 0.102, 0.952, 0.046],
          [s * 0.092, 0.916, 0.034],
          [s * 0.088, 0.884, 0.008],
        ],
        0.0075,
        28,
        8,
      ),
    );

    // Sacroiliac border & greater sciatic notch
    pelvis.push(
      pipe(
        [
          [s * 0.040, 0.956, -0.052],
          [s * 0.038, 0.915, -0.050],
          [s * 0.062, 0.892, -0.034],
          [s * 0.082, 0.870, -0.018],
        ],
        0.008,
        18,
        8,
      ),
    );

    // Pelvic brim & superior pubic ramus
    pelvis.push(
      pipe(
        [
          [s * 0.038, 0.928, -0.042],
          [s * 0.072, 0.902, -0.016],
          [s * 0.082, 0.874, 0.012],
          [s * 0.048, 0.842, 0.042],
          [0, 0.822, 0.054],
        ],
        0.0085,
        22,
        8,
      ),
    );

    // Inferior pubic ramus & ischium (forms obturator ring)
    pelvis.push(
      pipe(
        [
          [0, 0.810, 0.052],
          [s * 0.026, 0.790, 0.032],
          [s * 0.055, 0.784, -0.018],
          [s * 0.080, 0.835, -0.024],
          [s * 0.084, 0.868, -0.008],
        ],
        0.009,
        22,
        8,
      ),
    );

    // Ischial tuberosity
    pelvis.push(ellipsoid([s * 0.055, 0.785, -0.018], [0.014, 0.016, 0.018], [0.2, 0, 0], 12));

    // Acetabulum socket rim
    const acetabulum = new THREE.TorusGeometry(0.022, 0.007, 8, 20);
    acetabulum.deleteAttribute("uv");
    acetabulum.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(s * 0.088, 0.872, -0.002),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, s * 1.25, 0)),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    pelvis.push(acetabulum);
  }

  const widen = new THREE.Matrix4().makeScale(spec.pelvisW, 1, 1);
  for (const g of pelvis) g.applyMatrix4(widen);
  trunk.push(...pelvis);

  // Limbs: femur, tibia, fibula, humerus, radius and ulna

  for (const s of [1, -1] as const) {
    const l = L(s);
    const a = A(s);

    // Femoral head (centre = acetabulum centre after pelvis widening)
    limbs.push(ellipsoid(l(0.088, 0.872, -0.002), [0.019, 0.019, 0.019], [0, 0, 0], 14));

    // Femoral neck
    limbs.push(pipe([l(0.088, 0.872, -0.002), l(0.104, 0.858, -0.004), l(0.116, 0.844, -0.006)], 0.0105, 12, 8));

    // Greater trochanter
    limbs.push(ellipsoid(l(0.120, 0.854, -0.008), [0.014, 0.020, 0.015], [0, 0, s * -0.15], 12));

    // Femur
    limbs.push(pipe([l(0.114, 0.842, -0.006), l(0.100, 0.68, 0.005), l(0.088, 0.53, 0.01)], 0.0135, 28, 10));

    // Condyles
    limbs.push(ellipsoid(l(0.088, 0.515, 0.01), [0.034, 0.02, 0.028], [0, 0, 0], 14));

    // Tibia
    limbs.push(pipe([l(0.086, 0.49, 0.012), l(0.084, 0.3, -0.004), l(0.08, 0.1, -0.004)], 0.011, 28, 10));

    // Fibula
    limbs.push(pipe([l(0.104, 0.48, 0.0), l(0.1, 0.3, -0.016), l(0.094, 0.1, -0.012)], 0.0055, 24, 6));

    // Humerus
    limbs.push(pipe([a(0.212, 1.405, 0.0), a(0.236, 1.28, -0.006), a(0.26, 1.15, -0.008)], 0.0115, 22, 10));

    // Radius
    limbs.push(pipe([a(0.262, 1.12, -0.004), a(0.274, 1.02, 0.006), a(0.292, 0.91, 0.016)], 0.0075, 20, 8));

    // Ulna
    limbs.push(pipe([a(0.254, 1.12, -0.014), a(0.266, 1.02, -0.004), a(0.288, 0.9, 0.006)], 0.007, 20, 8));

    // Hand bones
    limbs.push(ellipsoid(a(0.302, 0.842, 0.02), [0.034, 0.05, 0.012], [0, 0, 0], 12));
  }

  return { skull, trunk, clavicles, limbs };
}

/* ───────────────────────── ASSEMBLY ───────────────────────── */

export interface BodyGeometries {
  shell: G;
  brain: G;
  eyes: G;
  heart: G;
  lungs: G;
  skeleton: G;
}

/** Rib-cage fit for organs: scale about the chest axis. */
function chestMatrix(spec: AnatomySpec): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(0, 0, 0.004)
    .multiply(new THREE.Matrix4().makeScale(spec.ribX, 1, spec.ribZ))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.004));
}

/** Global height / proportion scale about the origin: feet stay on y = 0. */
function finish(g: G, spec: AnatomySpec): G {
  g.applyMatrix4(new THREE.Matrix4().makeScale(spec.sx, spec.sy, spec.sx));
  g.computeBoundingSphere();
  return g;
}

/**
 * Builds all six zone geometries for one AnatomySpec. The caller owns the result and must `dispose()` it.
 * Cost is dominated by lofts and ~400 small primitives (tens of ms).
 */
export function buildBodyGeometries(spec: AnatomySpec = DEFAULT_SPEC): BodyGeometries {
  const sk = skeletonParts(spec);
  const env = buildEnvelope(sk.trunk);

  const chest = chestMatrix(spec);
  const heart = buildHeart();
  heart.applyMatrix4(chest);
  const lungs = buildLungs();
  lungs.applyMatrix4(chest);

  return {
    shell: finish(buildShell(spec, env), spec),
    brain: finish(buildBrain(), spec),
    eyes: finish(buildEyes(), spec),
    heart: finish(heart, spec),
    lungs: finish(lungs, spec),
    skeleton: finish(merge([...sk.skull, ...sk.trunk, ...sk.clavicles, ...sk.limbs]), spec),
  };
}

/* Single-geometry accessors (kept for compatibility; prefer buildBodyGeometries). */

export function shellGeometry(spec: AnatomySpec = DEFAULT_SPEC): G {
  const sk = skeletonParts(spec);
  const env = buildEnvelope(sk.trunk);
  [...sk.skull, ...sk.trunk, ...sk.clavicles, ...sk.limbs].forEach((g) => g.dispose());
  return finish(buildShell(spec, env), spec);
}

export function skeletonGeometry(spec: AnatomySpec = DEFAULT_SPEC): G {
  const sk = skeletonParts(spec);
  return finish(merge([...sk.skull, ...sk.trunk, ...sk.clavicles, ...sk.limbs]), spec);
}

export const brainGeometry = (spec: AnatomySpec = DEFAULT_SPEC): G => finish(buildBrain(), spec);
export const eyesGeometry = (spec: AnatomySpec = DEFAULT_SPEC): G => finish(buildEyes(), spec);

export function heartGeometry(spec: AnatomySpec = DEFAULT_SPEC): G {
  const g = buildHeart();
  g.applyMatrix4(chestMatrix(spec));
  return finish(g, spec);
}

export function lungsGeometry(spec: AnatomySpec = DEFAULT_SPEC): G {
  const g = buildLungs();
  g.applyMatrix4(chestMatrix(spec));
  return finish(g, spec);
}