// robotsdk.dev serves the GitHub Pages build of robot_sdk (the gh-pages branch, https://zacharyyamaoka.github.io/robot_sdk/).
// WHY a proxy, not a static-assets upload (2026-11-25): the hourly refresh workflow republishes gh-pages with a fresh
// graph.json and health.json. Proxying shows every refresh with no extra deploy step and no Cloudflare token stored in
// GitHub. gh-pages stays the one published copy; this Worker only gives it the domain Zach bought.
const ORIGIN = "https://zacharyyamaoka.github.io/robot_sdk";
const APEX = "robotsdk.dev";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname === "www." + APEX) {
      url.hostname = APEX;
      return Response.redirect(url.toString(), 301);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }
    // Cache follows GitHub Pages' own headers (max-age=600), so a refresh shows up within about ten minutes.
    const upstream = await fetch(ORIGIN + url.pathname + url.search, { method: request.method, redirect: "manual" });
    const headers = new Headers(upstream.headers);
    // GitHub Pages redirects /v10 to https://zacharyyamaoka.github.io/robot_sdk/v10/; keep the visitor on robotsdk.dev.
    const location = headers.get("location");
    if (location && location.startsWith(ORIGIN)) headers.set("location", `${url.origin}${location.slice(ORIGIN.length) || "/"}`);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  },
};
