#!/usr/bin/env node
/**
 * Fails when the documentation has drifted from the code.
 *
 * Every HTTP route the app mounts must be documented in API_DOCS.md, listed in
 * README.md, and exercised by the Postman collection. Every variable in
 * .env.example must appear in both configuration tables. The checker is
 * deliberately static: it reads the route and index files rather than booting
 * the app, so it stays usable in CI without a WhatsApp session.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const HTTP_METHODS = "get|post|put|patch|delete";

/** `app.use("/channel", channelRoutes)` -> { channelRoutes: "/channel" } */
function readRouterMounts(indexSource) {
  const requires = new Map();
  const requirePattern =
    /const\s+(\w+)\s*=\s*require\(\s*"(\.\/src\/routes\/[^"]+)"\s*\)/g;
  for (const [, variable, modulePath] of indexSource.matchAll(requirePattern)) {
    requires.set(variable, `${modulePath.replace(/^\.\//, "")}.js`);
  }

  const mounts = [];
  const usePattern = /app\.use\(\s*"([^"]*)"\s*,\s*(\w+)\s*\)/g;
  for (const [, prefix, variable] of indexSource.matchAll(usePattern)) {
    const file = requires.get(variable);
    if (file) mounts.push({ prefix: prefix === "/" ? "" : prefix, file });
  }
  return mounts;
}

function joinRoute(prefix, routePath) {
  const suffix = routePath === "/" ? "" : routePath;
  return `${prefix}${suffix}` || "/";
}

function collectRoutes() {
  const indexSource = read("index.js");
  const routes = [];

  const appRoutePattern = new RegExp(
    `app\\.(${HTTP_METHODS})\\(\\s*"([^"]+)"`,
    "g",
  );
  for (const [, method, routePath] of indexSource.matchAll(appRoutePattern)) {
    routes.push({ method: method.toUpperCase(), path: routePath });
  }

  for (const { prefix, file } of readRouterMounts(indexSource)) {
    const source = read(file);
    const routerPattern = new RegExp(
      `router\\.(${HTTP_METHODS})\\(\\s*"([^"]*)"`,
      "g",
    );
    for (const [, method, routePath] of source.matchAll(routerPattern)) {
      routes.push({
        method: method.toUpperCase(),
        path: joinRoute(prefix, routePath),
      });
    }
  }

  return routes.sort((a, b) =>
    `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`),
  );
}

function collectEnvironmentVariables() {
  return read(".env.example")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0].trim())
    .filter(Boolean);
}

function postmanPaths() {
  const collection = JSON.parse(
    read("postman/WhatsApp_API.postman_collection.json"),
  );
  const found = new Set();

  const walk = (items) => {
    for (const item of items) {
      if (item.item) {
        walk(item.item);
        continue;
      }
      const request = item.request;
      if (!request) continue;
      const segments =
        typeof request.url === "string"
          ? request.url.split("?")[0].split("/").slice(3)
          : request.url?.path;
      if (!Array.isArray(segments)) continue;
      found.add(`${request.method.toUpperCase()} /${segments.join("/")}`);
    }
  };

  walk(collection.item);
  return found;
}

const problems = [];
const note = (message) => problems.push(message);

const routes = collectRoutes();
const apiDocs = read("API_DOCS.md");
const readme = read("README.md");
const postman = postmanPaths();

if (routes.length === 0) {
  note("No routes were discovered; the route parser needs updating.");
}

for (const { method, path: routePath } of routes) {
  const signature = `${method} ${routePath}`;

  // API_DOCS.md documents each route as a fenced `METHOD /path` line.
  const documented = new RegExp(
    `^${method} ${routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\?|\\s|$)`,
    "m",
  ).test(apiDocs);
  if (!documented && routePath !== "/") {
    note(`API_DOCS.md does not document "${signature}".`);
  }

  if (routePath !== "/" && !readme.includes(routePath)) {
    note(`README.md does not mention "${signature}".`);
  }

  if (routePath !== "/" && !postman.has(signature)) {
    note(`The Postman collection has no request for "${signature}".`);
  }
}

for (const variable of collectEnvironmentVariables()) {
  if (!new RegExp(`\`${variable}\``).test(apiDocs)) {
    note(`API_DOCS.md does not document the "${variable}" variable.`);
  }
  if (!new RegExp(`\`${variable}\``).test(readme)) {
    note(`README.md does not document the "${variable}" variable.`);
  }
}

if (problems.length > 0) {
  console.error("Documentation is out of date:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    `\n${problems.length} problem(s). Run the "update-docs" skill or fix them by hand.`,
  );
  process.exit(1);
}

console.log(
  `Docs are in sync: ${routes.length} routes and ${collectEnvironmentVariables().length} variables checked.`,
);
