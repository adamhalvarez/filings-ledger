// One instant for the whole build, stamped once in next.config.mjs and
// inlined into every bundle, so every page, route and the sitemap read the
// same value. Until 2026-09-10 this was new Date() at module load, which is
// once per static generation worker rather than once per build (see
// next.config.mjs's cpus: 2), so two pages of one deploy could disagree.
// The fallback only runs outside next build and next dev, which is never.
export const BUILD_TIME = new Date(process.env.LEDGER_BUILD_TIME ?? Date.now());

export function formatTimestamp(d: Date): string {
  return d.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "not on file";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatAmount(value: string | null): string {
  if (value === null) return "not on file";
  const n = Number(value);
  if (Number.isNaN(n)) return "not on file";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// A signed figure, for the one place on this site where the direction of a
// change is the point rather than the size: an award whose total fell is a
// different story from one whose total rose, and a bare "$3,192,952" on a
// deobligation would tell the wrong one. Zero is not expected here, since
// the ledger only carries amendments whose amount actually moved, but it
// formats without a sign rather than as a positive if it ever appears.
export function formatDelta(value: string | null): string {
  if (value === null) return "not on file";
  const n = Number(value);
  if (Number.isNaN(n)) return "not on file";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

// The first twelve characters of a content hash. Enough to identify one
// observation in this store in practice, and short enough to sit in a table
// cell; the full value is in the exports, which is where anyone actually
// checking one would be working. Never presented as a proof of the
// filing's contents, see the methodology page.
export function shortHash(hash: string): string {
  return hash.slice(0, 12);
}
