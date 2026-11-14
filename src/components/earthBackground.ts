/**
 * earthBackground.ts — seamless 360° 3D Milky Way sky-sphere & multi-depth starfield
 * for the SELENA Celestial LiDAR Constellation viewer.
 */

import * as THREE from "three";

export type EarthQuality = "low" | "high";

export interface EarthBackgroundOptions {
  quality?: EarthQuality;
  pixelRatio?: number;
  horizonNdc?: number;
  tiltDeg?: number;
  brightness?: number;
}

export interface EarthBackground {
  setSize(width: number, height: number, pixelRatio?: number): void;
  setQuality(quality: EarthQuality): void;
  getQuality(): EarthQuality;
  readonly ready: boolean;
  update(timeSec: number, orbitAzimuth?: number): void;
  render(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/* Constants & Presets                                                 */
/* ------------------------------------------------------------------ */

const SPACE_COLOR = 0x010206;
const GEN_BUDGET_MS = 8;
const GALACTIC_TILT = 0.44; // ~25 deg diagonal sweep

interface Preset {
  texSize: number;
  galacticStars: number;
  fieldStars: number;
}

const PRESETS: Record<EarthQuality, Preset> = {
  low: { texSize: 256, galacticStars: 950, fieldStars: 360 },
  high: { texSize: 512, galacticStars: 2200, fieldStars: 750 },
};

/* ------------------------------------------------------------------ */
/* Deterministic PRNG + 2D Toroidal Periodic Noise                     */
/* ------------------------------------------------------------------ */

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

function hash2(ix: number, iy: number, seed: number): number {
  let h =
    Math.imul(ix, 0x27d4eb2d) ^
    Math.imul(iy, 0x165667b1) ^
    Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function noise2(x: number, y: number, period: number, seed: number): number {
  const xf = Math.floor(x);
  const yf = Math.floor(y);
  const fx = x - xf;
  const fy = y - yf;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  let x0 = xf % period;
  if (x0 < 0) x0 += period;
  const x1 = x0 + 1 >= period ? 0 : x0 + 1;

  let y0 = yf % period;
  if (y0 < 0) y0 += period;
  const y1 = y0 + 1 >= period ? 0 : y0 + 1;

  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm2(
  x: number,
  y: number,
  period: number,
  octaves: number,
  seed: number,
): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  let p = period;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(fx, fy, p, seed + i * 41);
    norm += amp;
    fx *= 2;
    fy *= 2;
    p *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const toByte = (v: number) =>
  v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;

/* ------------------------------------------------------------------ */
/* Smooth Galactic Dust & Gas Texture                                  */
/* ------------------------------------------------------------------ */

function* generateGalaxyTexture(
  size: number,
  buf: Uint8Array,
): Generator<void, void, void> {
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const i = (y * size + x) * 4;

      const wx = fbm2(u * 2, v * 2, 2, 3, 19) - 0.5;
      const wy = fbm2(u * 2 + 0.9, v * 2 + 1.4, 2, 3, 43) - 0.5;

      // R: grand luminous galactic cloud sweep
      const haze = smooth(
        0.22,
        0.78,
        fbm2(u * 3 + wx * 0.75, v * 3 + wy * 0.75, 3, 5, 83),
      );

      // G: mid-scale cosmic gas density
      const fine = smooth(
        0.28,
        0.80,
        fbm2(u * 6 - wy * 0.65, v * 6 + wx * 0.65, 6, 4, 127),
      );

      // B: dark absorption dust rifts
      const dust = smooth(
        0.34,
        0.74,
        fbm2(u * 4 + wx * 0.95, v * 4 - wy * 0.95, 4, 4, 179),
      );

      buf[i] = toByte(haze);
      buf[i + 1] = toByte(fine);
      buf[i + 2] = toByte(dust);
      buf[i + 3] = 255;
    }
    yield;
  }
}

function makeGalaxyTexture(data: Uint8Array, size: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // LinearFilter without mipmaps eliminates any 1px atan() wrap seam across 360 deg
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const GALAXY_VERT = /* glsl */ `
  varying vec3 vLocalDir;

  void main() {
    vLocalDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GALAXY_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uReveal;
  uniform float uBrightness;
  uniform float uQuality;
  uniform float uTilt;

  varying vec3 vLocalDir;

  const float TAU = 6.28318530718;

  vec2 rot2(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  }

  void main() {
    vec3 d = normalize(vLocalDir);

    // Tilt into galactic coordinates matching the galactic star band
    vec2 tiltedXY = rot2(d.xy, -uTilt);
    vec3 g = normalize(vec3(tiltedXY, d.z));

    // Seamless spherical longitude (0..1) and latitude height (-1..1)
    float lon = atan(g.z, g.x) / TAU + 0.5;
    float lat = g.y;

    // Integer lon multipliers keep 360 deg wrap 100% seamless
    vec2 uvA = vec2(lon * 2.0 + uTime * 0.00035, lat * 0.68 + 0.5);
    vec3 sA = texture2D(uTex, uvA).rgb;

    vec3 sB = sA;
    if (uQuality > 0.5) {
      vec2 uvB = vec2(lon * 3.0 - uTime * 0.00022 + 0.37, lat * 1.15 + 0.25);
      sB = texture2D(uTex, uvB).rgb;
    }

    // Grand, sweeping galactic band profile
    float spineWarp = (sA.r - 0.5) * 0.14 + (sB.g - 0.5) * 0.06;
    float distFromBand = abs(lat + spineWarp);

    float outerBand = exp(-pow(distFromBand / 0.52, 2.0));
    float innerBand = exp(-pow(distFromBand / 0.24, 2.0));

    // Broad distant galactic core bulge (seamless 3D angular distance)
    vec3 coreDir = normalize(vec3(-0.34, -0.06, -0.94));
    float coreDot = max(0.0, dot(d, coreDir));
    float galacticCore = pow(coreDot, 3.5);

    // Dark cosmic dust lanes slicing softly across the glowing band
    float dustMask = sA.b * 0.62 + sB.b * 0.38;
    float dustCut = 1.0 - smoothstep(0.40, 0.80, dustMask) * innerBand * 0.72;

    float gas = sA.r * 0.62 + sB.g * 0.38;
    float fineCloud = sA.g * 0.5 + sB.g * 0.5;

    vec3 abyss      = vec3(0.003, 0.006, 0.018);
    vec3 deepCosmos = vec3(0.018, 0.052, 0.135);
    vec3 nebulaTeal = vec3(0.048, 0.180, 0.285);
    vec3 warmCore   = vec3(0.220, 0.140, 0.082);
    vec3 violetHint = vec3(0.085, 0.045, 0.150);

    vec3 col = deepCosmos * outerBand * (0.48 + 0.88 * gas);
    col += nebulaTeal * innerBand * (0.32 + 0.92 * fineCloud);
    col += warmCore * galacticCore * innerBand * (0.35 + 0.65 * sA.r);
    col += violetHint * outerBand * (1.0 - innerBand) * sB.r * 0.65;

    col *= dustCut;

    vec3 finalCol = abyss + col * uBrightness * uReveal;
    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aBright;
  attribute float aPhase;
  attribute float aTemp;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uReveal;

  varying float vA;
  varying vec3 vTint;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio;

    float tw = 0.84 + 0.16 * sin(uTime * 1.4 + aPhase);
    vA = aBright * tw * (0.25 + 0.75 * uReveal);

    vec3 cool = vec3(0.68, 0.84, 1.0);
    vec3 neutral = vec3(0.96, 0.98, 1.0);
    vec3 warm = vec3(1.0, 0.86, 0.68);
    vTint = aTemp < 0.5
      ? mix(cool, neutral, aTemp * 2.0)
      : mix(neutral, warm, (aTemp - 0.5) * 2.0);
  }
`;

const STAR_FRAG = /* glsl */ `
  varying float vA;
  varying vec3 vTint;

  void main() {
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (r > 1.0) discard;

    float core = exp(-r * r * 11.0);
    float halo = exp(-r * r * 2.4) * 0.28;
    float a = (core + halo) * vA;
    vec3 col = mix(vTint, vec3(1.0), core * 0.75);

    gl_FragColor = vec4(col, a);
  }
`;

/* ------------------------------------------------------------------ */
/* Starfield Builders                                                  */
/* ------------------------------------------------------------------ */

function createStarPoints(
  count: number,
  radius: number,
  seed: number,
  galacticConcentrated: boolean,
  mat: THREE.ShaderMaterial,
): THREE.Points {
  const rand = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const bright = new Float32Array(count);
  const phase = new Float32Array(count);
  const temp = new Float32Array(count);

  const cosT = Math.cos(GALACTIC_TILT);
  const sinT = Math.sin(GALACTIC_TILT);

  for (let i = 0; i < count; i++) {
    let x: number;
    let y: number;
    let z: number;

    if (galacticConcentrated) {
      const phi = rand() * Math.PI * 2;
      const g1 = (rand() + rand() + rand() - 1.5) * 0.28;
      const lat = Math.max(-1.2, Math.min(1.2, g1));
      const cLat = Math.cos(lat);
      const lx = radius * cLat * Math.cos(phi);
      const ly = radius * Math.sin(lat);
      const lz = radius * cLat * Math.sin(phi);

      x = lx * cosT - ly * sinT;
      y = lx * sinT + ly * cosT;
      z = lz;

      const brightMicro = rand() < 0.11;
      size[i] = brightMicro ? 1.5 + rand() * 0.6 : 0.8 + rand() * 0.45;
      bright[i] = brightMicro ? 0.58 + rand() * 0.32 : 0.18 + rand() * 0.28;
    } else {
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      x = radius * s * Math.cos(phi);
      y = radius * u;
      z = radius * s * Math.sin(phi);

      const r = rand();
      if (r < 0.055) {
        size[i] = 2.3 + rand() * 0.9;
        bright[i] = 0.85 + rand() * 0.15;
      } else if (r < 0.26) {
        size[i] = 1.45 + rand() * 0.5;
        bright[i] = 0.45 + rand() * 0.26;
      } else {
        size[i] = 0.85 + rand() * 0.4;
        bright[i] = 0.16 + rand() * 0.24;
      }
    }

    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    phase[i] = rand() * Math.PI * 2;
    temp[i] = rand();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geo.setAttribute("aTemp", new THREE.BufferAttribute(temp, 1));

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

interface TextureJob {
  it: Generator<void, void, void>;
  buf: Uint8Array;
  size: number;
  q: EarthQuality;
}

export function createEarthBackground(
  options: EarthBackgroundOptions = {},
): EarthBackground {
  const brightness = options.brightness ?? 1.05;

  let quality: EarthQuality = options.quality ?? "high";
  let pixelRatio = options.pixelRatio ?? 1;
  let width = 400;
  let height = 560;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SPACE_COLOR);

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 300);
  camera.position.set(0, 0, 0);

  /* --- 1. Seamless 360 deg Milky Way sky-sphere --- */

  const placeholder = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]),
    1,
    1,
  );
  placeholder.needsUpdate = true;

  const galaxyGeo = new THREE.SphereGeometry(140, 48, 32);
  const galaxyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: placeholder },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uBrightness: { value: brightness },
      uQuality: { value: quality === "high" ? 1 : 0 },
      uTilt: { value: GALACTIC_TILT },
    },
    vertexShader: GALAXY_VERT,
    fragmentShader: GALAXY_FRAG,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });

  const galaxyMesh = new THREE.Mesh(galaxyGeo, galaxyMat);
  galaxyMesh.frustumCulled = false;
  galaxyMesh.renderOrder = 0;
  scene.add(galaxyMesh);

  /* --- 2. Multi-depth Starfields --- */

  const starMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uReveal: { value: 0 },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

  const galacticStars = createStarPoints(
    PRESETS.high.galacticStars,
    95,
    0x5e1e4a,
    true,
    starMat,
  );
  galacticStars.renderOrder = 1;
  scene.add(galacticStars);

  const fieldStars = createStarPoints(
    PRESETS.high.fieldStars,
    55,
    0x7c9eb2,
    false,
    starMat,
  );
  fieldStars.renderOrder = 2;
  scene.add(fieldStars);

  const applyStarPreset = (q: EarthQuality) => {
    const p = PRESETS[q];
    galacticStars.geometry.setDrawRange(0, p.galacticStars);
    fieldStars.geometry.setDrawRange(0, p.fieldStars);
  };
  applyStarPreset(quality);

  /* --- 3. Incremental texture generation --- */

  let texQuality: EarthQuality | null = null;
  let job: TextureJob | null = null;
  let galaxyTex: THREE.DataTexture | null = null;
  let readyAt = -1;
  let lastTime = 0;
  let ready = false;
  let disposed = false;

  // Continuous unwrapped azimuth so spinning 360 deg never snaps at +/- PI
  let hasAzimuth = false;
  let prevAzimuth = 0;
  let unwrappedAzimuth = 0;

  const startJob = (q: EarthQuality) => {
    const size = PRESETS[q].texSize;
    const buf = new Uint8Array(size * size * 4);
    job = {
      it: generateGalaxyTexture(size, buf),
      buf,
      size,
      q,
    };
  };

  const finishJob = () => {
    if (!job) return;
    const j = job;
    job = null;

    const nextTex = makeGalaxyTexture(j.buf, j.size);
    galaxyMat.uniforms.uTex.value = nextTex;
    galaxyTex?.dispose();
    galaxyTex = nextTex;

    texQuality = j.q;
    if (!ready) {
      ready = true;
      readyAt = lastTime;
    }
  };

  const ensureTexture = () => {
    if (texQuality === quality) {
      job = null;
      return;
    }
    if (job && job.q === quality) return;
    if (texQuality === "high" && quality === "low") {
      job = null;
      return;
    }
    startJob(quality);
  };

  const pump = () => {
    if (!job) return;
    const t0 = performance.now();
    while (performance.now() - t0 < GEN_BUDGET_MS) {
      const r = job.it.next();
      if (r.done) {
        finishJob();
        return;
      }
    }
  };

  ensureTexture();

  /* --- 4. Public API --- */

  const api: EarthBackground = {
    setSize(w, h, pr) {
      if (w < 2 || h < 2) return;
      width = w;
      height = h;
      if (pr !== undefined) {
        pixelRatio = pr;
        starMat.uniforms.uPixelRatio.value = pr;
      }
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },

    setQuality(q) {
      if (q === quality) return;
      quality = q;
      galaxyMat.uniforms.uQuality.value = q === "high" ? 1 : 0;
      applyStarPreset(q);
      ensureTexture();
    },

    getQuality() {
      return quality;
    },

    get ready() {
      return ready;
    },

    update(timeSec, orbitAzimuth = 0) {
      if (disposed) return;
      lastTime = timeSec;
      pump();

      if (!hasAzimuth) {
        hasAzimuth = true;
        prevAzimuth = orbitAzimuth;
        unwrappedAzimuth = orbitAzimuth;
      } else {
        let delta = orbitAzimuth - prevAzimuth;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        prevAzimuth = orbitAzimuth;
        unwrappedAzimuth += delta;
      }

      let reveal = 0;
      if (ready) {
        const k = THREE.MathUtils.clamp((timeSec - readyAt) / 0.85, 0, 1);
        reveal = k * k * (3 - 2 * k);
      }

      galaxyMat.uniforms.uTime.value = timeSec;
      galaxyMat.uniforms.uReveal.value = reveal;

      starMat.uniforms.uTime.value = timeSec;
      starMat.uniforms.uReveal.value = reveal;

      // Sky-sphere & galactic band rotate together seamlessly; foreground field stars add parallax
      const skyYaw = -unwrappedAzimuth * 0.14 + timeSec * 0.0012;
      galaxyMesh.rotation.y = skyYaw;
      galacticStars.rotation.y = skyYaw;
      fieldStars.rotation.y = -unwrappedAzimuth * 0.25 + timeSec * 0.0024;
    },

    render(renderer) {
      if (disposed) return;
      renderer.render(scene, camera);
    },

    dispose() {
      disposed = true;
      job = null;
      galaxyGeo.dispose();
      galaxyMat.dispose();
      galacticStars.geometry.dispose();
      fieldStars.geometry.dispose();
      starMat.dispose();
      placeholder.dispose();
      galaxyTex?.dispose();
      galaxyTex = null;
    },
  };

  return api;
}