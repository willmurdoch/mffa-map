/*
 * projections.mjs — the two map projections used by the MFFA donation map.
 *
 * This file is the SINGLE SOURCE OF TRUTH for projection math. It is used
 *   (a) at build time by tools/build-geo.mjs to project country outlines, and
 *   (b) at runtime, inlined verbatim into index.html, to place donor pins.
 *
 * Keeping one implementation for both means a pin can never drift away from
 * the coastline it is supposed to sit on.
 *
 * The Albers USA constants match d3-geo's geoAlbersUsa() defaults scaled to
 * 1300 / translated to [487.5, 305], which is exactly how the us-atlas
 * "*-albers-10m" TopoJSON files were pre-projected. That is why the state
 * outlines and the donor pins line up without any fitting step.
 */

const RAD = Math.PI / 180;
const { sin, cos, sqrt, abs } = Math;

// d3-geo's conicEqualAreaRaw, verbatim.
function conicEqualAreaRaw(y0, y1) {
  const sy0 = sin(y0);
  const n = (sy0 + sin(y1)) / 2;

  // Degenerate case: the two standard parallels are symmetric about the
  // equator, so the conic collapses to a cylindrical equal-area projection.
  if (abs(n) < 1e-6) {
    const cy0 = cos(y0);
    return (x, y) => [x * cy0, sin(y) / cy0];
  }

  const c = 1 + sy0 * (2 * n - sy0);
  const r0 = sqrt(c) / n;
  return (x, y) => {
    const r = sqrt(c - 2 * n * sin(y)) / n;
    const xn = x * n;
    return [r * sin(xn), r0 - r * cos(xn)];
  };
}

// d3 rotates longitude before projecting, then re-wraps into [-PI, PI].
function wrapLambda(l) {
  return l > Math.PI ? l - 2 * Math.PI : l < -Math.PI ? l + 2 * Math.PI : l;
}

function conic({ parallels, rotate, center, scale, translate }) {
  const raw = conicEqualAreaRaw(parallels[0] * RAD, parallels[1] * RAD);
  const dl = rotate[0] * RAD;
  const k = scale;
  const [tx, ty] = translate;
  // d3's recenter() feeds `center` straight into the raw projection, without
  // the rotation — i.e. `center` is expressed in already-rotated longitude.
  // The projected center then lands exactly on `translate`.
  const [cx, cy] = raw(center[0] * RAD, center[1] * RAD);
  return (lon, lat) => {
    const [px, py] = raw(wrapLambda(lon * RAD + dl), lat * RAD);
    return [tx + k * (px - cx), ty - k * (py - cy)];
  };
}

// --- Albers USA -------------------------------------------------------------

export const US_VIEWBOX = [0, 0, 975, 610];

const K = 1300;
const TX = 487.5;
const TY = 305;

const lower48 = conic({
  parallels: [29.5, 45.5], rotate: [96, 0], center: [-0.6, 38.7],
  scale: K, translate: [TX, TY],
});
const alaska = conic({
  parallels: [55, 65], rotate: [154, 0], center: [-2, 58.5],
  scale: K * 0.35, translate: [TX - 0.307 * K, TY + 0.201 * K],
});
const hawaii = conic({
  parallels: [8, 18], rotate: [157, 0], center: [-3, 19.9],
  scale: K, translate: [TX - 0.205 * K, TY + 0.212 * K],
});

// The inset windows d3 uses to decide which sub-projection owns a point.
const LOWER48_BOX = [TX - 0.455 * K, TY - 0.238 * K, TX + 0.455 * K, TY + 0.238 * K];
const ALASKA_BOX  = [TX - 0.425 * K, TY + 0.120 * K, TX - 0.214 * K, TY + 0.234 * K];
const HAWAII_BOX  = [TX - 0.214 * K, TY + 0.166 * K, TX - 0.115 * K, TY + 0.234 * K];

const within = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

/** Project [lon, lat] into the Albers USA canvas, or null if off-map. */
export function albersUsa(lon, lat) {
  let p = lower48(lon, lat);
  if (within(p, LOWER48_BOX)) return p;
  p = alaska(lon, lat);
  if (within(p, ALASKA_BOX)) return p;
  p = hawaii(lon, lat);
  if (within(p, HAWAII_BOX)) return p;
  return null;
}

// --- Natural Earth (world view) ---------------------------------------------

export const WORLD_VIEWBOX = [0, 0, 975, 500];

// d3-geo's naturalEarth1Raw, verbatim.
function naturalEarth1Raw(lambda, phi) {
  const phi2 = phi * phi;
  const phi4 = phi2 * phi2;
  return [
    lambda * (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4))),
    phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4))),
  ];
}

/*
 * The world view is cropped to WORLD_CLIP_LAT so Antarctica does not squash
 * the inhabited half of the planet into a letterbox. These fit constants are
 * derived once in build-geo.mjs and frozen here so the runtime point
 * projection matches the pre-projected country outlines exactly.
 */
export const WORLD_CLIP_LAT = [-58, 84];
export const WORLD_FIT = { k: 1, tx: 0, ty: 0 }; // overwritten by setWorldFit()

export function setWorldFit(fit) {
  WORLD_FIT.k = fit.k;
  WORLD_FIT.tx = fit.tx;
  WORLD_FIT.ty = fit.ty;
}

/** Project [lon, lat] into the Natural Earth world canvas. */
export function naturalEarth(lon, lat) {
  const [px, py] = naturalEarth1Raw(lon * RAD, lat * RAD);
  return [WORLD_FIT.tx + WORLD_FIT.k * px, WORLD_FIT.ty - WORLD_FIT.k * py];
}

/** Raw (unfitted) projection, used by the build step to compute the fit. */
export function naturalEarthRaw(lon, lat) {
  return naturalEarth1Raw(lon * RAD, lat * RAD);
}
