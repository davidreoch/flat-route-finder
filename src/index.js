// Worker entry point.
//
// Static files in public/ are served by Cloudflare's asset layer before this
// Worker ever runs (free and unmetered), so we only see the API routes.

import { handleRoutes } from "./routes.js";
import { handleGeocode } from "./geocode.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/routes" && request.method === "POST") {
      return handleRoutes(request, env);
    }
    if (pathname === "/api/geocode" && request.method === "GET") {
      return handleGeocode(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
