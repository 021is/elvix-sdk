#!/usr/bin/env node
/**
 * Keep the translation CDN in step with the SDK.
 *
 * The SDK bundles only English; every other locale is fetched from
 * `https://elvix.is/api/v1/i18n/elvix/<locale>.json`, which reads the shared
 * R2 bucket at `elvix/main/<locale>.json`. Nothing used to put the SDK's
 * catalogs there, so a release could ship keys (the whole `buttons`
 * namespace, in 0.13) that the CDN did not have, and every non-English
 * locale silently fell back to English.
 *
 *   node scripts/sync-catalogs.mjs            upload every catalog to R2
 *   node scripts/sync-catalogs.mjs --check    fail unless the CDN serves every
 *                                             key of every catalog, byte-equal
 *
 * Upload reads R2_I18N_ENDPOINT / R2_I18N_BUCKET / R2_I18N_ACCESS_KEY_ID /
 * R2_I18N_SECRET_ACCESS_KEY (the names elvix's route uses). `--check` needs
 * nothing: it reads what the world sees. `publish.yml` runs both, upload first,
 * so a tag cannot publish keys the CDN lacks.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/locale/catalogs");
const PREFIX = "elvix/main";
const CDN = process.env.ELVIX_I18N_BASE ?? "https://elvix.is/api/v1/i18n/elvix";

const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

/** Every `namespace.key` a catalog defines. */
function keysOf(catalog) {
  return Object.entries(catalog.namespaces).flatMap(([ns, keys]) =>
    Object.keys(keys).map((key) => `${ns}.${key}`),
  );
}

async function upload() {
  const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const need = [
    "R2_I18N_ENDPOINT",
    "R2_I18N_ACCESS_KEY_ID",
    "R2_I18N_SECRET_ACCESS_KEY",
  ].filter((name) => !process.env[name]);
  if (need.length) throw new Error(`missing ${need.join(", ")}`);
  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_I18N_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_I18N_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_I18N_SECRET_ACCESS_KEY,
    },
  });
  const Bucket = process.env.R2_I18N_BUCKET ?? "i18n";
  for (const file of files) {
    const body = readFileSync(join(DIR, file), "utf8");
    await client.send(
      new PutObjectCommand({
        Bucket,
        Key: `${PREFIX}/${file}`,
        Body: body,
        ContentType: "application/json; charset=utf-8",
      }),
    );
    console.log(`uploaded ${PREFIX}/${file} (${keysOf(JSON.parse(body)).length} keys)`);
  }
}

async function check() {
  const problems = [];
  for (const file of files) {
    const tag = file.replace(/\.json$/, "");
    const want = JSON.parse(readFileSync(join(DIR, file), "utf8"));
    // The route is cached for minutes at the edge; a unique query defeats it.
    const res = await fetch(`${CDN}/${tag}.json?v=${Date.now()}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      problems.push(`${tag}: HTTP ${res.status}`);
      continue;
    }
    const body = await res.json();
    // The route wraps the catalog in the Spine envelope.
    const served = body?.data ?? body;
    const have = new Set(keysOf(served));
    const missing = keysOf(want).filter((key) => !have.has(key));
    if (missing.length) problems.push(`${tag}: missing ${missing.length} keys, e.g. ${missing[0]}`);
    else if (JSON.stringify(served.namespaces) !== JSON.stringify(want.namespaces)) {
      problems.push(`${tag}: same keys, different text (CDN is stale)`);
    } else console.log(`ok ${tag}`);
  }
  if (problems.length) {
    console.error(`\nThe CDN does not match the SDK catalogs:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
}

await (process.argv.includes("--check") ? check() : upload());
