import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";
import config from "../next.config";

test("development proxies same-origin API requests to the local backend", async () => {
  const dev = config(PHASE_DEVELOPMENT_SERVER);
  assert.equal(dev.output, undefined);
  const origin = (
    process.env.LOCAL_API_ORIGIN || "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
  assert.deepEqual(await dev.rewrites?.(), [
    { source: "/api/:path*", destination: `${origin}/:path*` },
  ]);
});

test("production stays a static export without development rewrites", () => {
  const production = config(PHASE_PRODUCTION_BUILD);
  assert.equal(production.output, "export");
  assert.equal(production.rewrites, undefined);
});
