/* Flat Route Finder — one-tap flat running loops. No login, no drawing. */
(function () {
  // --- Map ---------------------------------------------------------------
  const map = L.map("map", { zoomControl: true }).setView([55.9533, -3.1883], 13); // Edinburgh default

  // Basemaps — default to a clean, low-clutter style that's easy to read; the
  // green route pops against it. Standard + Satellite offered via the toggle
  // (top-right of the map).
  const cleanLight = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
    maxZoom: 20, attribution: '&copy; OpenStreetMap, &copy; CARTO',
  });
  const cleanDark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", {
    maxZoom: 20, attribution: '&copy; OpenStreetMap, &copy; CARTO',
  });
  const standardTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  });
  const satelliteTiles = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "Tiles &copy; Esri" }
  );

  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const cleanTiles = prefersDark ? cleanDark : cleanLight;
  cleanTiles.addTo(map);

  L.control
    .layers(
      { Clean: cleanTiles, Standard: standardTiles, Satellite: satelliteTiles },
      null,
      { position: "topright" }
    )
    .addTo(map);

  let startMarker = null;
  let start = null; // {lat, lon}
  let routeLayers = []; // Leaflet layers for drawn routes
  let routes = []; // data from the API
  let activeIdx = 0; // which route is currently shown / will be exported

  const $ = (id) => document.getElementById(id);
  const statusEl = $("status");
  const goBtn = $("go");
  const panel = $("panel");
  const isMobile = () => window.matchMedia("(max-width: 560px)").matches;

  // Mobile: tap the grab handle to collapse/expand the controls sheet.
  $("handle").addEventListener("click", () => panel.classList.toggle("collapsed"));

  function setStatus(msg, isError) {
    statusEl.className = "status" + (isError ? " error" : "");
    statusEl.innerHTML = msg || "";
  }

  // Centre a point in the part of the map that's actually visible. On mobile the
  // bottom sheet covers the lower portion, so a plain setView() would drop the
  // pin behind it — shift the map so the pin lands in the visible strip above.
  function centerOn(lat, lon, zoom) {
    const z = zoom || map.getZoom();
    if (isMobile()) {
      const panelTop = panel.getBoundingClientRect().top;
      const size = map.getSize();
      const pt = map.project([lat, lon], z);
      pt.y += Math.max(0, (size.y - panelTop) / 2); // push centre down → pin rises up
      map.setView(map.unproject(pt, z), z);
    } else {
      map.setView([lat, lon], z);
    }
  }

  function setStart(lat, lon, recenter) {
    start = { lat, lon };
    if (startMarker) startMarker.setLatLng([lat, lon]);
    else startMarker = L.marker([lat, lon], { draggable: true }).addTo(map);
    startMarker.on("dragend", () => {
      const p = startMarker.getLatLng();
      start = { lat: p.lat, lon: p.lng };
    });
    if (recenter) centerOn(lat, lon, 15);
    goBtn.disabled = false;
  }

  // --- Geolocation -------------------------------------------------------
  $("locate").addEventListener("click", () => {
    if (!navigator.geolocation) {
      setStatus("Your browser can't share location — search for a place instead.", true);
      return;
    }
    const btn = $("locate");
    btn.textContent = "📍 Locating…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn.textContent = "📍 Location set";
        btn.classList.add("on");
        setStart(pos.coords.latitude, pos.coords.longitude, true);
        setStatus("");
      },
      () => {
        btn.textContent = "📍 Use my location";
        setStatus("Couldn't get your location. Allow location access, or search a place.", true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // --- Place search ------------------------------------------------------
  let searchTimer = null;
  $("search").addEventListener("input", (e) => {
    const q = e.target.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 3) {
      $("search-results").innerHTML = "";
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const r = await fetch("/api/geocode?q=" + encodeURIComponent(q));
        const data = await r.json();
        const box = $("search-results");
        box.innerHTML = "";
        (data.results || []).forEach((res) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = res.name;
          b.addEventListener("click", () => {
            setStart(res.lat, res.lon, true);
            box.innerHTML = "";
            $("search").value = res.name.split(",")[0];
            $("locate").classList.remove("on");
            $("locate").textContent = "📍 Use my location";
          });
          box.appendChild(b);
        });
      } catch {
        /* ignore search hiccups */
      }
    }, 350);
  });

  // --- Distance chips ----------------------------------------------------
  let distanceKm = 5;
  const chipEls = Array.from(document.querySelectorAll(".chip"));
  chipEls.forEach((chip) => {
    chip.addEventListener("click", () => {
      chipEls.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      distanceKm = Number(chip.dataset.km);
      $("custom").value = "";
    });
  });
  $("custom").addEventListener("input", (e) => {
    const v = Number(e.target.value);
    if (v > 0) {
      chipEls.forEach((c) => c.classList.remove("active"));
      distanceKm = v;
    }
  });

  // --- Elevation → label -------------------------------------------------
  // Rough gain-per-km thresholds so people can read flatness at a glance.
  function flatnessBadge(ascent, distanceM) {
    const perKm = ascent / (distanceM / 1000);
    if (perKm < 8) return { cls: "badge-flat", text: "Very flat" };
    if (perKm < 18) return { cls: "badge-rolling", text: "Gently rolling" };
    return { cls: "badge-hilly", text: "Hilly" };
  }

  function clearRoutes() {
    routeLayers.forEach((l) => map.removeLayer(l));
    routeLayers = [];
  }

  // Fit the route into the part of the map that's actually visible — clear of
  // the left panel on desktop, and above the bottom sheet on mobile.
  function fitToRoute(line) {
    const b = line.getBounds();
    if (isMobile()) {
      const panelH = Math.min(panel.getBoundingClientRect().height, window.innerHeight * 0.5);
      map.fitBounds(b, { paddingTopLeft: [24, 64], paddingBottomRight: [24, panelH + 20] });
    } else {
      map.fitBounds(b, { paddingTopLeft: [360, 30], paddingBottomRight: [40, 40] });
    }
  }

  function drawRoute(idx, focus) {
    clearRoutes();
    const r = routes[idx];
    if (!r) return;
    activeIdx = idx;
    const latlngs = r.geometry.coordinates.map((c) => [c[1], c[0]]);
    const halo = L.polyline(latlngs, { color: "#fff", weight: 8, opacity: 0.9 });
    const line = L.polyline(latlngs, { color: "#16a34a", weight: 5, opacity: 1 });
    halo.addTo(map);
    line.addTo(map);
    routeLayers = [halo, line];
    if (focus) fitToRoute(line);

    document.querySelectorAll(".route-card").forEach((c, i) => {
      c.classList.toggle("active", i === idx);
    });
  }

  function renderResults() {
    const box = $("results");
    box.innerHTML = "";
    routes.forEach((r, i) => {
      const km = (r.distance / 1000).toFixed(1);
      const badge = flatnessBadge(r.ascent, r.distance);
      const card = document.createElement("div");
      card.className = "route-card" + (i === 0 ? " active" : "");
      card.innerHTML =
        `<div><div class="rc-main">${km} km loop</div>` +
        `<div class="rc-sub">${r.ascent} m of climbing</div></div>` +
        `<span class="rc-badge ${badge.cls}">${badge.text}</span>`;
      card.addEventListener("click", () => drawRoute(i, true));
      box.appendChild(card);
    });
    $("download").hidden = false;
    $("export-note").hidden = false;
  }

  // --- GPX export --------------------------------------------------------
  // Build a GPX track from a route's coordinates (incl. elevation). This is
  // the standard file Strava, Garmin, Komoot, Runna etc. import to follow a
  // route on a watch or phone.
  function buildGpx(route) {
    const km = (route.distance / 1000).toFixed(1);
    const name = `Flat ${km}km loop`;
    const pts = route.geometry.coordinates
      .map((c) => {
        const ele = typeof c[2] === "number" ? `<ele>${c[2].toFixed(1)}</ele>` : "";
        return `      <trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}">${ele}</trkpt>`;
      })
      .join("\n");
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="Flat Route Finder" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      `  <metadata><name>${name}</name></metadata>\n` +
      `  <trk>\n    <name>${name}</name>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n` +
      "</gpx>\n"
    );
  }

  function downloadGpx(route) {
    if (!route) return;
    const blob = new Blob([buildGpx(route)], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flat-${(route.distance / 1000).toFixed(1)}km-loop.gpx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  $("download").addEventListener("click", () => downloadGpx(routes[activeIdx]));

  // --- Generate ----------------------------------------------------------
  $("go").addEventListener("click", async () => {
    if (!start) {
      setStatus("Set a start point first — tap “Use my location”.", true);
      return;
    }
    goBtn.disabled = true;
    setStatus('<span class="spinner"></span>Finding the flattest loops near you…');
    $("results").innerHTML = "";
    $("download").hidden = true;
    $("export-note").hidden = true;
    clearRoutes();

    try {
      const r = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: start.lat,
          lon: start.lon,
          distance: Math.round(distanceKm * 1000),
          preferPaths: $("preferPaths").checked,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Something went wrong.");

      routes = data.routes || [];
      if (!routes.length) throw new Error("No loops found — try another distance.");

      renderResults();
      setStatus(`Found ${routes.length} route${routes.length > 1 ? "s" : ""} — flattest first. Tap one to view.`);
      if (isMobile()) {
        panel.classList.add("collapsed"); // drop the sheet so the map shows
        // Let the sheet finish collapsing before fitting, so the route frames
        // into the visible area above it (not centred under the sheet).
        setTimeout(() => drawRoute(0, true), 260);
      } else {
        drawRoute(0, true);
      }
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      goBtn.disabled = false;
    }
  });

  // Try to locate on load for the true one-tap feel (silent if denied).
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!start) setStart(pos.coords.latitude, pos.coords.longitude, true);
      },
      () => {},
      { timeout: 8000 }
    );
  }
})();
