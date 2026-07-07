import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3010;

// Free OpenRouteService token (https://openrouteservice.org — 2,000 req/day).
// Set ORS_API_KEY in the environment (Render → Environment).
const ORS_API_KEY = process.env.ORS_API_KEY || "";

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public"), { extensions: ["html"] }));

// --- Small helpers -----------------------------------------------------------

function bad(res, code, msg) {
  res.status(code).json({ error: msg });
}

// Total elevation gain (ascent) for a route, in metres. ORS puts it at
// properties.ascent when elevation:true; fall back to summing the z values.
function ascentOf(feature) {
  const p = feature?.properties || {};
  if (typeof p.ascent === "number") return p.ascent;
  const coords = feature?.geometry?.coordinates || [];
  let gain = 0;
  for (let i = 1; i < coords.length; i++) {
    const dz = (coords[i][2] ?? 0) - (coords[i - 1][2] ?? 0);
    if (dz > 0) gain += dz;
  }
  return gain;
}

function distanceOf(feature) {
  return feature?.properties?.summary?.distance ?? 0; // metres
}

// Flatten ORS segments → a simple turn-by-turn list for the UI.
function stepsOf(feature) {
  const segs = feature?.properties?.segments || [];
  const steps = [];
  segs.forEach((seg) =>
    (seg.steps || []).forEach((st) =>
      steps.push({
        instruction: st.instruction || "",
        distance: Math.round(st.distance || 0),
        name: st.name && st.name !== "-" ? st.name : "",
      })
    )
  );
  return steps;
}

// Ask ORS for one round-trip loop of ~length metres from [lon,lat].
// `seed` varies the direction so we can generate several and keep the flattest.
async function fetchLoop({ lat, lon, length, seed, profile }) {
  const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;
  const body = {
    coordinates: [[lon, lat]],
    elevation: true,
    instructions: true, // we surface turn-by-turn directions to the user
    options: { round_trip: { length, points: 4, seed } },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: ORS_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/geo+json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    // 4xx from ORS usually means "couldn't build a loop here with this seed".
    return null;
  }
  const data = await r.json();
  return data?.features?.[0] || null;
}

// --- API ---------------------------------------------------------------------

// Generate a handful of loops and return the flattest few.
app.post("/api/routes", async (req, res) => {
  if (!ORS_API_KEY) return bad(res, 503, "Routing is not configured yet.");

  const lat = Number(req.body?.lat);
  const lon = Number(req.body?.lon);
  const length = Math.round(Number(req.body?.distance)); // metres
  const preferPaths = req.body?.preferPaths !== false;

  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return bad(res, 400, "Please choose a valid start location.");
  }
  if (!isFinite(length) || length < 500 || length > 42000) {
    return bad(res, 400, "Pick a distance between 0.5 km and 42 km.");
  }

  // foot-hiking prefers trails/paths; foot-walking sticks to pavements/streets.
  const profile = preferPaths ? "foot-hiking" : "foot-walking";
  // seedBase lets the client ask for a fresh batch of loops ("more routes").
  const seedBase = Math.max(0, Math.floor(Number(req.body?.seedBase) || 0));
  const seeds = [1, 2, 3, 4, 5, 6].map((s) => s + seedBase);

  try {
    const settled = await Promise.all(
      seeds.map((seed) =>
        fetchLoop({ lat, lon, length, seed, profile }).catch(() => null)
      )
    );

    // De-duplicate near-identical loops and keep the flattest options.
    const routes = settled
      .filter(Boolean)
      .map((f) => ({
        geometry: f.geometry, // GeoJSON LineString [lon,lat,ele]
        distance: distanceOf(f),
        ascent: Math.round(ascentOf(f)),
        steps: stepsOf(f),
      }))
      .filter((r) => r.distance > 0)
      .sort((a, b) => a.ascent - b.ascent);

    const seen = new Set();
    const unique = routes.filter((r) => {
      const key = `${Math.round(r.distance / 100)}-${r.ascent}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!unique.length) {
      return bad(
        res,
        422,
        "Couldn't build a loop here — try a different distance or move the start point."
      );
    }

    res.json({ routes: unique.slice(0, 3) });
  } catch {
    bad(res, 502, "The routing service is busy. Please try again.");
  }
});

// Search a place name → coordinates (proxied so we can send a proper
// User-Agent, as OpenStreetMap Nominatim's usage policy requires).
app.get("/api/geocode", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return bad(res, 400, "Type a place to search.");
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=" +
      encodeURIComponent(q);
    const r = await fetch(url, {
      headers: {
        "User-Agent": "FlatRouteFinder/0.1 (running route tool)",
        Accept: "application/json",
      },
    });
    if (!r.ok) return bad(res, 502, "Search is busy, try again.");
    const data = await r.json();
    res.json({
      results: (data || []).map((d) => ({
        name: d.display_name,
        lat: Number(d.lat),
        lon: Number(d.lon),
      })),
    });
  } catch {
    bad(res, 502, "Search is busy, try again.");
  }
});

// A stray error must never take the whole site down.
process.on("uncaughtException", (e) => console.error("uncaughtException:", e?.message || e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));

app.listen(PORT, () => {
  console.log(`Flat Route Finder running at http://localhost:${PORT}`);
});
