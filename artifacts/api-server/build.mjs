import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, mkdir, readdir, copyFile } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    // Two entry points: index.ts (the long-running-process entrypoint, used
    // by `pnpm run start` for local/single-process deploys) and app.ts (just
    // the Express app itself, no .listen() call — this is what the Vercel
    // serverless function at artifacts/ludo-game/api/[...path].ts imports).
    // Building app.ts to plain JS here means Vercel's function build never
    // has to re-type-check api-server's TypeScript source from a different
    // project context, which is what caused it to fail before.
    entryPoints: [
      path.resolve(artifactDir, "src/index.ts"),
      path.resolve(artifactDir, "src/app.ts"),
    ],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  // Also copy the compiled output into artifacts/ludo-game/api/_server/ —
  // that's what the Vercel serverless function at
  // artifacts/ludo-game/api/[...path].ts imports. It needs its own copy
  // inside that project's directory tree (not a reference back out to
  // this dist/ folder): Vercel's function bundler can silently drop files
  // reached by going *outside* a project's Root Directory from what
  // actually gets deployed, even though this build step creates them
  // successfully either way.
  //
  // Plain Node.js fs calls, not shell commands (mkdir -p / cp) — those are
  // Unix-only and fail on Windows (including when testing locally via
  // `vercel build`), so doing this in JS keeps the build identical on
  // Vercel's Linux servers and on a Windows or Mac laptop.
  const functionServerDir = path.resolve(artifactDir, "../ludo-game/api/_server");
  await mkdir(functionServerDir, { recursive: true });
  const distFiles = await readdir(distDir);
  const bundleFiles = distFiles.filter((f) => f.endsWith(".mjs"));
  await Promise.all(
    bundleFiles.map((f) => copyFile(path.join(distDir, f), path.join(functionServerDir, f))),
  );
  console.log(`Copied ${bundleFiles.length} file(s) to ${functionServerDir}: ${bundleFiles.join(", ")}`);
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
