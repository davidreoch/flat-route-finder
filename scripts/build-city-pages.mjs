// Generates the /flat-running-routes-<city> landing pages.
//
// Each page reuses the exact tool markup from public/index.html (so app.js works
// identically) and adds: city-specific <head> SEO tags, a real H1 + intro, a
// "where it's flat" section with genuine local knowledge, links to sibling
// cities, and a window.FLATROUTES_CITY global that drops the start pin on the
// city (see the hook at the bottom of app.js).
//
// Content is deliberately unique per city — thin, near-identical "doorway" pages
// get the whole site penalised. Add a city here only if you can say something
// true and useful about running flat there.
//
// Run: node scripts/build-city-pages.mjs   (writes into public/, updates sitemap)

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const SITE = "https://flatroutes.com";

// --- City data ---------------------------------------------------------------
// lat/lon = rough city centre (the start pin; users can drag it or use GPS).
const CITIES = [
  {
    slug: "edinburgh",
    name: "Edinburgh",
    lat: 55.9533,
    lon: -3.1883,
    hook: "Yes, it's a hilly city — but there's plenty of flat running if you know where to look.",
    paras: [
      "Edinburgh has a reputation for hills — Arthur's Seat, the Crags, the climb up to the Old Town. But you don't have to run any of them. The city is threaded with flat, traffic-free paths along water, and once you find them you can rack up easy miles without a single incline.",
      "Set your distance below and the finder will plot a flat loop from wherever you drop the pin. Move it towards the canal or the shore for the flattest results.",
    ],
    spots: [
      ["Union Canal towpath", "Dead flat for miles from Fountainbridge out west — the single best flat run in the city."],
      ["Water of Leith Walkway", "A gentle river path winding from Balerno through Dean Village to Leith."],
      ["Cramond & Silverknowes promenade", "A flat seafront stretch along the Firth of Forth with big open views."],
      ["The Meadows & Bruntsfield Links", "Flat parkland paths right in the centre, ideal for a quick loop."],
    ],
  },
  {
    slug: "london",
    name: "London",
    lat: 51.5074,
    lon: -0.1278,
    hook: "Canals, riverside and royal parks give London mile after mile of flat, traffic-free running.",
    paras: [
      "London is largely flat, and its best running avoids the roads entirely: the canal towpaths and the Thames Path give you long, uninterrupted, level miles across the whole city.",
      "Drop the pin near a canal, the river or one of the big parks and set your distance — the finder will build a flat loop from there.",
    ],
    spots: [
      ["Regent's Canal", "A flat towpath from Little Venice through Camden and east to Limehouse."],
      ["The Thames Path", "Level riverside running on both banks, right through the centre."],
      ["Victoria Park & the Hertford Union Canal", "Flat parkland in the east, linked to the canal network."],
      ["Lee Valley towpath", "Long, flat, traffic-free miles following the River Lea north."],
    ],
  },
  {
    slug: "manchester",
    name: "Manchester",
    lat: 53.4808,
    lon: -2.2426,
    hook: "Old railway lines and canal towpaths make Manchester a genuinely flat place to run.",
    paras: [
      "Manchester sits on a plain, and its network of former railway lines and canal towpaths gives you flat, car-free routes reaching right out of the centre into the suburbs.",
      "Set a distance and drop the pin near the Fallowfield Loop, a canal or the Mersey for the flattest loop.",
    ],
    spots: [
      ["The Fallowfield Loop", "England's longest urban traffic-free path — a flat former railway across south Manchester."],
      ["Bridgewater & Rochdale Canal towpaths", "Flat towpaths radiating out from the city centre."],
      ["The Mersey riverside", "A level path through Didsbury and Chorlton along the river."],
      ["Wythenshawe Park", "Flat open parkland with easy loops."],
    ],
  },
  {
    slug: "bristol",
    name: "Bristol",
    lat: 51.4545,
    lon: -2.5879,
    hook: "Bristol is hilly overall — but the harbourside and the railway path stay reliably flat.",
    paras: [
      "Bristol has some serious hills, so the trick to flat running here is to stick to the water and the old railway line. Do that and you'll find long, level, traffic-free miles.",
      "For the flattest loop, drop the pin down by the harbour or on the Bristol & Bath Railway Path before setting your distance.",
    ],
    spots: [
      ["Bristol & Bath Railway Path", "A flat, tarmac, traffic-free former railway — the go-to flat run in the city."],
      ["The Harbourside loop", "Level waterside paths circling the floating harbour."],
      ["The River Avon towpath", "Flat running along the river towards Pill and the Avon Gorge."],
      ["Eastville Park", "Flat parkland beside the River Frome."],
    ],
  },
  {
    slug: "cambridge",
    name: "Cambridge",
    lat: 52.2053,
    lon: 0.1218,
    hook: "One of the flattest cities in Britain — almost anywhere you run here is level.",
    paras: [
      "Cambridge is famously flat. There's barely a hill in the place, so you can start a run almost anywhere and stay level — the riverside and the old paths out of town are especially good.",
      "Pick a distance and drop the pin near the river or the guided busway path for long, uninterrupted flat miles.",
    ],
    spots: [
      ["The River Cam towpath", "Flat riverside running past the Backs and out towards Fen Ditton and Baits Bite Lock."],
      ["The Cambridgeshire Guided Busway path", "A long, dead-flat, traffic-free path alongside the busway."],
      ["Jesus Green & Midsummer Common", "Flat open commons right in the centre."],
      ["Coe Fen & Sheep's Green", "Level meadow paths just south of the colleges."],
    ],
  },
  {
    slug: "york",
    name: "York",
    lat: 53.96,
    lon: -1.0873,
    hook: "Flat, compact and full of riverside paths — York is made for easy running.",
    paras: [
      "York sits on flat ground beside two rivers, so level running is easy to find. The riverside paths and a converted railway line give you traffic-free flat miles straight from the centre.",
      "Set your distance and drop the pin by the Ouse or the old railway path for the flattest loop.",
    ],
    spots: [
      ["The River Ouse & River Foss paths", "Flat riverside running looping through the heart of the city."],
      ["The Solar System cycle path", "A flat, traffic-free former railway heading out towards Selby."],
      ["Rowntree Park", "Level Edwardian parkland beside the Ouse."],
      ["Millennium Bridge loops", "Flat out-and-backs and loops along both riverbanks."],
    ],
  },
  {
    slug: "glasgow",
    name: "Glasgow",
    lat: 55.8642,
    lon: -4.2518,
    hook: "The Clyde, the Kelvin and the canal give Glasgow long, flat, traffic-free running.",
    paras: [
      "Glasgow's rivers and its canal carve flat corridors right across the city. Follow the water and you'll find level, car-free miles without much effort.",
      "Drop the pin near the Clyde, the Kelvin or the canal, set a distance, and the finder will plot a flat loop.",
    ],
    spots: [
      ["The Clyde Walkway", "A flat riverside path running through and beyond the city centre."],
      ["The Forth & Clyde Canal towpath", "Long, flat, traffic-free miles across the north of the city."],
      ["The Kelvin Walkway", "A mostly gentle river path from the West End northwards."],
      ["Glasgow Green", "Flat parkland loops beside the Clyde."],
    ],
  },
  {
    slug: "birmingham",
    name: "Birmingham",
    lat: 52.4862,
    lon: -1.8904,
    hook: "More canals than Venice means miles of flat, traffic-free towpath running.",
    paras: [
      "Birmingham's famous canal network is a gift for flat running: the towpaths give you level, car-free miles spreading out from the centre in every direction.",
      "Set a distance and drop the pin on a canal or in one of the flat parks for the easiest loop.",
    ],
    spots: [
      ["The canal towpaths", "The Birmingham & Fazeley and Worcester & Birmingham canals give flat miles right from the centre."],
      ["The Rea Valley Route", "A flat, mostly traffic-free path following the River Rea south."],
      ["Cannon Hill Park", "Flat, popular parkland with easy loops."],
      ["The Harborne Walkway", "A level former railway path in the south-west."],
    ],
  },
];

// --- Page template -----------------------------------------------------------
// The tool markup mirrors public/index.html exactly so app.js works unchanged.
// If you change the tool's markup there, re-run this script to keep pages in sync.
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function page(city, others) {
  const url = `${SITE}/flat-running-routes-${city.slug}`;
  const title = `Flat Running Routes in ${city.name} — Free, No Login | Flat Routes`;
  const desc = `Find a flat running route in ${city.name}. Pick a distance, tap once, get a flat loop that prefers paths over busy roads. Free, no login, GPX export.`;

  const paras = city.paras.map((p) => `        <p>${esc(p)}</p>`).join("\n");
  const spots = city.spots
    .map(([n, d]) => `          <li><strong>${esc(n)}</strong> — ${esc(d)}</li>`)
    .join("\n");
  const siblings = others
    .map((o) => `<a href="/flat-running-routes-${o.slug}">${esc(o.name)}</a>`)
    .join("\n          ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="index, follow" />

    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="Tap once, get a flat running loop in ${esc(city.name)}. Free, no login, GPX export." />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:card" content="summary" />

    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <link rel="stylesheet" href="/styles.css" />
    <style>
      /* City-page copy only — kept here so the shared styles.css stays untouched. */
      .city-copy { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
      .city-copy h2 { font-size: 0.95rem; margin: 0 0 8px; }
      .city-copy p { margin: 0 0 10px; color: var(--muted); font-size: 0.9rem; }
      .city-copy ul { margin: 0; padding-left: 18px; font-size: 0.88rem; }
      .city-copy li { margin-bottom: 7px; }
      .city-copy li strong { color: var(--text); }
      .city-nav { margin-top: 14px; font-size: 0.82rem; color: var(--muted); }
      .city-nav a { display: inline-block; margin: 0 8px 6px 0; color: var(--accent); text-decoration: none; }
      .city-nav a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div id="map"></div>

    <div class="panel" id="panel">
      <button class="handle" id="handle" type="button" aria-label="Expand or collapse controls"></button>
      <div class="panel-body" id="panel-body">
      <div class="panel-head">
        <h1>Flat Running Routes in ${esc(city.name)}</h1>
        <p>${esc(city.hook)}</p>
      </div>

      <button id="locate" class="locate">📍 Use my location</button>

      <div class="search-row">
        <input id="search" type="text" placeholder="…or search a place" autocomplete="off" />
      </div>
      <div id="search-results" class="search-results"></div>

      <div class="dist-label">Distance</div>
      <div class="chips" id="chips">
        <button class="chip" data-km="2">2 km</button>
        <button class="chip" data-km="3">3 km</button>
        <button class="chip active" data-km="5">5 km</button>
        <button class="chip" data-km="10">10 km</button>
        <input id="custom" class="chip-input" type="number" min="0.5" max="42" step="0.5" placeholder="km" />
      </div>

      <label class="toggle">
        <input type="checkbox" id="preferPaths" checked />
        <span>Prefer paths &amp; parks over busy roads</span>
      </label>

      <button id="go" class="go" disabled>Find flat route</button>

      <section class="city-copy">
${paras}
        <h2>Where it's flat in ${esc(city.name)}</h2>
        <ul>
${spots}
        </ul>
        <nav class="city-nav" aria-label="Flat running routes in other cities">
          Other cities:
          ${siblings}
          <a href="/">Anywhere →</a>
        </nav>
      </section>
      </div><!-- /.panel-body -->

      <div id="status" class="status" role="status" aria-live="polite"></div>

      <div id="results" class="results"></div>
      <div id="elevation" class="elevation" hidden></div>

      <button id="download" class="download" type="button" hidden>⬇ Download route (GPX)</button>
      <p id="export-note" class="export-note" hidden>Works with Garmin, Komoot &amp; most running apps.</p>

      <a id="watch-aff" class="watch-aff" target="_blank" rel="noopener sponsored" hidden>⌚ Follow routes hands-free — <strong>best running watches</strong> →</a>

      <button id="dir-toggle" class="ghost-btn" type="button" hidden>🧭 Turn-by-turn directions</button>
      <ol id="directions" class="directions" hidden></ol>

      <button id="more" class="ghost-btn" type="button" hidden>🔄 Show different routes</button>
    </div>

    <script>window.FLATROUTES_CITY = ${JSON.stringify({ name: city.name, lat: city.lat, lon: city.lon })};</script>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="/app.js"></script>
  </body>
</html>
`;
}

// --- Write pages -------------------------------------------------------------
for (const city of CITIES) {
  const others = CITIES.filter((c) => c.slug !== city.slug);
  writeFileSync(join(publicDir, `flat-running-routes-${city.slug}.html`), page(city, others));
}

// --- Rebuild sitemap ---------------------------------------------------------
const urls = [
  { loc: `${SITE}/`, priority: "1.0" },
  ...CITIES.map((c) => ({ loc: `${SITE}/flat-running-routes-${c.slug}`, priority: "0.8" })),
];
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n") +
  "\n</urlset>\n";
writeFileSync(join(publicDir, "sitemap.xml"), sitemap);

console.log(`Wrote ${CITIES.length} city pages + sitemap (${urls.length} urls).`);
