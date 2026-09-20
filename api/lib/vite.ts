import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  // boot.mjs and public/ are deployed as siblings (the CI workflow flattens
  // dist/'s contents into the app root), so resolve relative to this file's
  // own location rather than process.cwd() - Passenger's launch directory
  // isn't something to rely on matching.
  const publicPath = path.resolve(import.meta.dirname, "./public");

  app.use("*", serveStatic({ root: publicPath }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(publicPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content);
  });
}
