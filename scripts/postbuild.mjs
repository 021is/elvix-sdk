/**
 * tsup/esbuild strips the `"use client"` directive when bundling, which makes
 * Next's App Router treat the React entry as a Server Component and crash on
 * createContext. The whole react bundle is client-only (index.js is type-only,
 * server.js is server-only), so we re-prepend the directive to dist/react.js
 * after the build. Idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";

const file = "dist/react.js";
const src = readFileSync(file, "utf8");
const directive = '"use client";';

if (!src.startsWith(directive) && !src.startsWith("'use client'")) {
  writeFileSync(file, `${directive}\n${src}`);
  console.log(`postbuild: prepended "use client" to ${file}`);
} else {
  console.log(`postbuild: ${file} already has the client directive`);
}
