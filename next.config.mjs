import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // outputFileTracingRoot is set only because this repo sits next to
  // record-scanner on disk and Next.js would otherwise guess a shared
  // parent as the workspace root.
  outputFileTracingRoot: __dirname,
  // Next.js sends X-Powered-By: Next.js by default, a framework
  // fingerprint that serves no purpose on a site this small and is worth
  // not sending, part of the exposure audit this build gets before launch.
  poweredByHeader: false,
  // The build's one timestamp, read by lib/format.ts's BUILD_TIME. Values in
  // env are inlined at compile time, which happens once, so every page and
  // every static generation worker reads the same instant.
  env: {
    LEDGER_BUILD_TIME: new Date().toISOString(),
  },
  // Added 2026-09-05 with the filings directory split: that split turned
  // one page into well over a hundred, each independently querying
  // signal_store_reader during static generation, and Next.js parallelizes
  // page generation across workers by default. The first build attempt
  // hit "max clients reached in session mode - max clients are limited to
  // pool_size: 15", Supavisor's own ceiling, well before the page count
  // reduction below made it survivable on its own. cpus: 2 caps how many
  // pages render at once regardless of how many pages exist, independent
  // of the pool_size the connection string itself asks for.
  experimental: {
    cpus: 2,
  },
};

export default nextConfig;
