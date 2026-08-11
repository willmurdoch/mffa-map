# MFFA Donation Map

An interactive map of every place that has donated to **Moving Forward For Ataxia**.
Glowing pins for each city, light-trails flying home to Michigan, a US ↔ World
toggle, a clickable roll call, and live counters.

Everything lives in one file: **`index.html`**. No server, no build step, no
internet connection required. Double-click it and it works.

---

## ⚙️ The one thing you must do first

Open `index.html` in any text editor, find the `CONFIG` block near the top of the
`<script>`, and paste in the real PayPal link:

```js
const CONFIG = {
  org: 'Moving Forward For Ataxia',
  site: 'movingforwardforataxia.org',

  donateUrl: 'PASTE_PAYPAL_LINK_HERE',   // ← put the PayPal link here

  home: { label: 'Home base', city: 'Dimondale', region: 'MI', lat: 42.6459, lon: -84.6486 },
};
```

Either kind of PayPal link works:

- a PayPal.Me link — `https://www.paypal.com/paypalme/username`
- a donate-button link — `https://www.paypal.com/donate/?hosted_button_id=...`

Until that is filled in, the page shows an orange setup banner at the top and the
Donate buttons stay greyed out, so it can't accidentally go live half-finished.

**Also check `home`.** Every arc on the map flies toward that point, and it is
currently set to Dimondale, MI (the first entry on the handwritten list). Change
the city, state, latitude and longitude if the donations are headed somewhere
else — nothing else needs updating.

---

## ➕ Adding a new donation

Find the `DONORS` list, copy a line, and change it:

```js
const DONORS = [
  { city: 'Dimondale', region: 'MI', country: 'US', lat: 42.6459, lon: -84.6486 },
  // ...
];
```

To get the latitude and longitude: open Google Maps, right-click the town, and
the two numbers are the first thing in the menu. Copy them in that order —
latitude first, longitude second. (For anywhere in the US the longitude is
negative.)

Save the file and reload the page. That is the whole process — the map, the
counters, the roll call and the arcs all update themselves from that one list.

**Someone whose town you don't know yet?** Put them in `UNPLACED` instead. They
still count in the "Gifts received" total and still get named in the roll call;
they just can't be drawn until there's a location.

```js
const UNPLACED = [
  { name: 'Jessica P.', note: 'city not recorded yet' },
];
```

**A donor from a new country?** Add the two-letter code to `COUNTRY_NAMES` so the
country lights up on the world map:

```js
const COUNTRY_NAMES = {
  US: 'United States of America',
  CY: 'Cyprus',
};
```

The name on the right has to match the name in the map data (Natural Earth), so
for example the UK is `'United Kingdom'` and South Korea is `'South Korea'`.

---

## 🌐 Putting it online

It's a single static file, so almost anything will host it for free:

- **GitHub Pages** — push this repo, then Settings → Pages → deploy from `main`,
  root folder. It'll be at `https://<user>.github.io/mffa-map/`.
- **Netlify Drop** — drag `index.html` onto <https://app.netlify.com/drop>.
- **The existing site** — upload `index.html` and link to it from
  movingforwardforataxia.org.

---

## 🗺️ Rebuilding the map geometry (rarely needed)

The country and state outlines are baked into `index.html` between the
`/* <GEO-DATA> */` markers. You only need to regenerate them if you want to
change the map itself — a different resolution, a different crop of the world.

```bash
npm install
npm run build:geo
```

- `tools/projections.mjs` — the Albers USA and Natural Earth projection math.
- `tools/build-geo.mjs` — projects the outlines and splices them into `index.html`.

The projection code is **duplicated verbatim** inside `index.html` (section 2 of
the script). That is intentional: the build step and the browser have to agree
exactly on where a latitude/longitude lands, or pins drift off their coastlines.
If you edit one copy, edit the other.

---

## Notes on how it's built

- **Data source:** the handwritten list. Two entries on that page were crossed
  out — "Clackamus OR", replaced on the same line by Happy Valley OR (Happy
  Valley is what's on the map), and one struck-through name, which was left off.
- **No colour-only encoding.** A US gift is a circle, an international gift is a
  diamond, and the home base is an open ring, so the three categories stay
  distinguishable in greyscale or with any form of colour blindness. Checked with
  the palette validator: worst-case adjacent-pair separation ΔE 19.8 for deutan
  vision, 24.9 for normal vision, and every marker clears 3:1 contrast against
  the map surface.
- **Deliberately dark.** The page commits to one night-sky look rather than
  following the OS light/dark setting; the pins are brighter than a chart palette
  would normally allow because they read as lights on a near-black map.
- **`prefers-reduced-motion` is respected** — the starfield, ripples, travelling
  sparks and the button shimmer all switch off, and the counters render their
  final value immediately.
- **Keyboard accessible.** Every pin is tabbable and responds to Enter/Space, the
  roll call is a real list of buttons, and the map carries a text description
  pointing at it.
