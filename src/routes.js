// POST /api/routes
//
// Asks OpenRouteService for a handful of round-trip loops from the start point
// and returns the flattest few. The ORS key comes from env (Worker secret).

import { json, bad } from "./http.js";

// Total elevation gain (ascent) in metres. ORS puts it at properties.ascent when
// elevation:true; fall back to summing the z values.
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

// One round-trip loop of ~length metres from [lon,lat]. `seed` varies the
// direction, so we generate several and keep the flattest.
async function fetchLoop({ lat, lon, length, seed, profile, key }) {
  const r = await fetch(
    `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
    {
      method: "POST",
      headers: {
        Authorization: key,
        "Content-Type": "application/json",
        Accept: "application/geo+json",
      },
      body: JSON.stringify({
        coordinates: [[lon, lat]],
        elevation: true,
        instructions: true, // we surface turn-by-turn directions to the user
        options: { round_trip: { length, points: 4, seed } },
      }),
    }
  );
  // A 4xx from ORS usually just means "no loop possible here with this seed".
  if (!r.ok) return null;
  const data = await r.json();
  return data?.features?.[0] || null;
}

export async function handleRoutes(request, env) {
  const key = env.ORS_API_KEY;
  if (!key) return bad(503, "Routing is not configured yet.");

  let body;
  try {
    body = await request.json();
  } catch {
    return bad(400, "Please choose a valid start location.");
  }

  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  const length = Math.round(Number(body?.distance)); // metres
  const preferPaths = body?.preferPaths !== false;

  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return bad(400, "Please choose a valid start location.");
  }
  if (!isFinite(length) || length < 500 || length > 42000) {
    return bad(400, "Pick a distance between 0.5 km and 42 km.");
  }

  // foot-hiking prefers trails/paths; foot-walking sticks to pavements/streets.
  const profile = preferPaths ? "foot-hiking" : "foot-walking";
  // seedBase lets the client ask for a fresh batch of loops ("more routes").
  const seedBase = Math.max(0, Math.floor(Number(body?.seedBase) || 0));
  const seeds = [1, 2, 3, 4, 5, 6].map((s) => s + seedBase);

  try {
    const settled = await Promise.all(
      seeds.map((seed) =>
        fetchLoop({ lat, lon, length, seed, profile, key }).catch(() => null)
      )
    );

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

    // Drop near-identical loops.
    const seen = new Set();
    const unique = routes.filter((r) => {
      const k = `${Math.round(r.distance / 100)}-${r.ascent}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (!unique.length) {
      return bad(
        422,
        "Couldn't build a loop here — try a different distance or move the start point."
      );
    }

    return json({ routes: unique.slice(0, 3) });
  } catch {
    return bad(502, "The routing service is busy. Please try again.");
  }
}
