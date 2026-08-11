/*
 * build-geo.mjs — regenerates the map geometry embedded in index.html.
 *
 *   npm install && npm run build:geo
 *
 * You only need to run this if you want to change the map itself (different
 * resolution, different projection, a different world crop). Adding or editing
 * a DONOR does NOT require a rebuild — donors are projected in the browser by
 * the very same projection code this script uses, so you can just edit the
 * DONORS array in index.html and reload.
 *
 * Output is spliced into index.html between the GEO-DATA markers.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { feature } from 'topojson-client';
import {
  US_VIEWBOX,
  naturalEarthRaw, setWorldFit, naturalEarth, WORLD_FIT,
  WORLD_VIEWBOX, WORLD_CLIP_LAT,
} from './projections.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const START = '/* <GEO-DATA> */';
const END = '/* </GEO-DATA> */';

// Coordinate precision in canvas pixels. 0.1px is far finer than any screen
// will resolve at these canvas sizes, and it roughly halves the file size.
const PRECISION = 1;
// Rings with fewer points than this are specks (tiny offshore islets) that
// cost bytes and render as sub-pixel dust.
const MIN_RING_POINTS = 4;

const round = (n) => Number(n.toFixed(PRECISION));

/** Turn projected rings into an SVG path, dropping degenerate/duplicate points. */
function ringsToPath(rings) {
  const out = [];
  for (const ring of rings) {
    const pts = [];
    let prev = null;
    for (const p of ring) {
      if (!p) continue; // off-map under the Albers USA composite
      const xy = [round(p[0]), round(p[1])];
      if (prev && xy[0] === prev[0] && xy[1] === prev[1]) continue;
      pts.push(xy);
      prev = xy;
    }
    if (pts.length < MIN_RING_POINTS) continue;
    out.push('M' + pts.map((p) => `${p[0]},${p[1]}`).join('L') + 'Z');
  }
  return out.join('');
}

/*
 * Rings that straddle the antimeridian (Fiji, and Russia's Chukotka tip) are
 * stored with longitudes flipping between +179 and -179. Projected naively,
 * each flip draws a line clean across the whole map. Walk the ring keeping a
 * running ±360 offset so it stays continuous, then slide the finished ring
 * back onto whichever side of the map it mostly belongs to.
 */
function unwrapRing(ring) {
  const out = [];
  let offset = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    if (i > 0) {
      const delta = lon - ring[i - 1][0];
      if (delta > 180) offset -= 360;
      else if (delta < -180) offset += 360;
    }
    out.push([lon + offset, lat]);
  }
  const mean = out.reduce((sum, p) => sum + p[0], 0) / out.length;
  const shift = mean > 180 ? -360 : mean < -180 ? 360 : 0;
  return shift ? out.map(([lon, lat]) => [lon + shift, lat]) : out;
}

/** Walk a GeoJSON geometry's rings, projecting every coordinate. */
function project(geometry, projectFn, { unwrap = false } = {}) {
  const polys =
    geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates
    : [];
  const rings = [];
  for (const poly of polys) {
    for (const ring of poly) {
      const src = unwrap ? unwrapRing(ring) : ring;
      rings.push(src.map(([lon, lat]) => projectFn(lon, lat)));
    }
  }
  return ringsToPath(rings);
}

// --- United States ----------------------------------------------------------
// us-atlas' "-albers-10m" files are ALREADY projected into the same Albers USA
// canvas our runtime point projection targets, so these coordinates pass
// through untouched. That is what guarantees pins sit on the right ground.

const usTopo = require('us-atlas/states-albers-10m.json');
const usStates = feature(usTopo, usTopo.objects.states);
const usNation = feature(usTopo, usTopo.objects.nation);
const identity = (x, y) => [x, y];

const states = usStates.features
  .map((f) => ({ id: f.id, name: f.properties.name, d: project(f.geometry, identity) }))
  .filter((s) => s.d);

const nation = (usNation.features ?? [usNation])
  .map((f) => project(f.geometry, identity))
  .join('');

// --- World ------------------------------------------------------------------

const worldTopo = require('world-atlas/countries-110m.json');
const worldFeatures = feature(worldTopo, worldTopo.objects.countries).features
  // Antarctica spans the full 360° of longitude at the bottom of the map; it
  // would triple the vertical extent and squash the inhabited world flat.
  .filter((f) => f.properties.name !== 'Antarctica');

// Fit the cropped lat/lon window into the world viewBox, then freeze those
// constants so the browser projects donor pins into the identical frame.
{
  const [, , W, H] = WORLD_VIEWBOX;
  const pad = 6;
  const corners = [];
  for (const lat of [WORLD_CLIP_LAT[0], 0, WORLD_CLIP_LAT[1]]) {
    for (const lon of [-180, 0, 180]) corners.push(naturalEarthRaw(lon, lat));
  }
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const k = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0));
  setWorldFit({
    k,
    tx: W / 2 - k * (x0 + x1) / 2,
    ty: H / 2 + k * (y0 + y1) / 2, // y is flipped on screen
  });
}

const countries = worldFeatures
  .map((f) => ({ name: f.properties.name, d: project(f.geometry, naturalEarth, { unwrap: true }) }))
  .filter((c) => c.d);

// --- Splice into index.html -------------------------------------------------

const blob = {
  us: { viewBox: US_VIEWBOX, states, nation },
  world: { viewBox: WORLD_VIEWBOX, countries, fit: { ...WORLD_FIT } },
};

const htmlPath = join(ROOT, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const a = html.indexOf(START);
const b = html.indexOf(END);
if (a === -1 || b === -1) throw new Error(`Could not find ${START} / ${END} markers in index.html`);

const generated =
  `${START}\n` +
  `// Generated by tools/build-geo.mjs — do not edit by hand.\n` +
  `const GEO = ${JSON.stringify(blob)};\n` +
  `setWorldFit(GEO.world.fit);\n` +
  `    ${END}`;

writeFileSync(htmlPath, html.slice(0, a) + generated + html.slice(b + END.length));

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`states:    ${states.length} (${kb(JSON.stringify(states))})`);
console.log(`countries: ${countries.length} (${kb(JSON.stringify(countries))})`);
console.log(`world fit: k=${WORLD_FIT.k.toFixed(2)} tx=${WORLD_FIT.tx.toFixed(2)} ty=${WORLD_FIT.ty.toFixed(2)}`);
console.log(`index.html is now ${kb(readFileSync(htmlPath, 'utf8'))}`);
