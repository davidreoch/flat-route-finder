/* Flat Route Finder — one-tap flat running loops. No login, no drawing. */
(function () {
  // --- Map ---------------------------------------------------------------
  const map = L.map("map", { zoomControl: true }).setView([55.9533, -3.1883], 13); // Edinburgh default
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  let startMarker = null;
  let start = null; // {lat, lon}
  let routeLayers = []; // Leaflet layers for drawn routes
  let routes = []; // data from the API

  const $ = (id) => document.getElementById(id);
  const statusEl = $("status");
  const goBtn = $("go");

  function setStatus(msg, isError) {
    statusEl.className = "status" + (isError ? " error" : "");
    statusEl.innerHTML = msg || "";
  }

  function setStart(lat, lon, recenter) {
    start = { lat, lon };
    if (startMarker) startMarker.setLatLng([lat, lon]);
    else startMarker = L.marker([lat, lon], { draggable: true }).addTo(map);
    startMarker.on("dragend", () => {
      const p = startMarker.getLatLng();
      start = { lat: p.lat, lon: p.lng };
    });
    if (recenter) map.setView([lat, lon], 15);
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

  function drawRoute(idx, focus) {
    clearRoutes();
    const r = routes[idx];
    if (!r) return;
    const latlngs = r.geometry.coordinates.map((c) => [c[1], c[0]]);
    const halo = L.polyline(latlngs, { color: "#fff", weight: 8, opacity: 0.9 });
    const line = L.polyline(latlngs, { color: "#16a34a", weight: 5, opacity: 1 });
    halo.addTo(map);
    line.addTo(map);
    routeLayers = [halo, line];
    if (focus) map.fitBounds(line.getBounds(), { padding: [50, 50] });

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
  }

  // --- Generate ----------------------------------------------------------
  $("go").addEventListener("click", async () => {
    if (!start) {
      setStatus("Set a start point first — tap “Use my location”.", true);
      return;
    }
    goBtn.disabled = true;
    setStatus('<span class="spinner"></span>Finding the flattest loops near you…');
    $("results").innerHTML = "";
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
      drawRoute(0, true);
      setStatus(`Found ${routes.length} route${routes.length > 1 ? "s" : ""} — flattest first. Tap one to view.`);
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
