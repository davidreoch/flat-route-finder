// GET /api/geocode?q=... — Cloudflare Pages Function.
//
// Place name → coordinates. Proxied (rather than called from the browser) so we
// can send a proper User-Agent, which OpenStreetMap Nominatim's usage policy
// requires.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const bad = (status, error) => json({ error }, status);

export async function onRequestGet({ request }) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (!q) return bad(400, "Type a place to search.");

  try {
    const r = await fetch(
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=" +
        encodeURIComponent(q),
      {
        headers: {
          "User-Agent": "FlatRoutes/1.0 (https://flatroutes.com — running route tool)",
          Accept: "application/json",
        },
      }
    );
    if (!r.ok) return bad(502, "Search is busy, try again.");
    const data = await r.json();
    return json({
      results: (data || []).map((d) => ({
        name: d.display_name,
        lat: Number(d.lat),
        lon: Number(d.lon),
      })),
    });
  } catch {
    return bad(502, "Search is busy, try again.");
  }
}
