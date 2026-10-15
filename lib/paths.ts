import { SITE_URL } from "./site";

// Where things live on this site, in one module with no database import, so
// client components (FilingsTable, SearchClient) can build the same URLs the
// server does. Added 2026-09-11 with the per filing permalinks.

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// A filing's own page. Keyed on natural_key, which is stable across an
// amendment and across a rebuild, the same reason the row anchors use it.
// An unmatched filing lives under /filings/unmatched, which stays out of the
// index along with the list it belongs to.
export function filingPath(naturalKey: string, entityName: string | null): string {
  const key = encodeURIComponent(naturalKey);
  return entityName === null
    ? `/filings/unmatched/${key}`
    : `/filings/${slug(entityName)}/${key}`;
}

export function filingUrl(naturalKey: string, entityName: string | null): string {
  return `${SITE_URL}${filingPath(naturalKey, entityName)}`;
}

export function entityPath(entityName: string): string {
  return `/filings/${slug(entityName)}`;
}

export function entityUrl(entityName: string): string {
  return `${SITE_URL}${entityPath(entityName)}`;
}

export function feedPath(entityName: string): string {
  return `/filings/${slug(entityName)}/feed.xml`;
}
