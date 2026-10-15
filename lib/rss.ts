import type { ChangeEvent } from "./db";
import { BUILD_TIME, formatAmount } from "./format";
import { filingUrl } from "./paths";
import { SITE_URL } from "./site";

// RSS 2.0 for the change ledger, added 2026-09-11. One item per change,
// built from the same rows What changed shows, with the filing's permalink
// as both link and guid, so an item in a reader's feed and a citation of
// the same filing point at one URL.

const SOURCE = { lobbying: "lobbying filing", contract_award: "contract award" } as const;

export const NOVELTY_TITLE = {
  new_to_record: "New to the record",
  new_to_watchlist: "New to the watchlist",
  undated: "New to the watchlist, undated",
} as const;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function itemTitle(e: ChangeEvent): string {
  const who = e.entity_name ?? "unmatched filing";
  if (e.event === "amended") {
    return `Amount moved: ${SOURCE[e.source_type]}, ${who}, ${formatAmount(e.previous_amount)} to ${formatAmount(e.amount)}`;
  }
  const label = e.novelty ? NOVELTY_TITLE[e.novelty] : "First seen";
  return `${label}: ${SOURCE[e.source_type]}, ${who}, ${formatAmount(e.amount)}`;
}

function itemDescription(e: ChangeEvent): string {
  const parts = [
    `Subject as filed: ${e.subject_raw_string}.`,
    e.occurred_date ? `Occurred ${e.occurred_date}.` : null,
    e.published_date
      ? `${e.source_type === "lobbying" ? "Posted" : "Last modified at the source"} ${e.published_date}.`
      : null,
    `Observed by this system ${e.observed_date}.`,
    e.source_url ? `Source: ${e.source_url}` : "Source link not on file.",
  ];
  return parts.filter(Boolean).join(" ");
}

export function rssFeed({
  title,
  description,
  path,
  pagePath,
  events,
}: {
  title: string;
  description: string;
  path: string;
  pagePath: string;
  events: ChangeEvent[];
}): string {
  const items = events
    .map((e) => {
      const link = filingUrl(e.natural_key, e.entity_name);
      return [
        "    <item>",
        `      <title>${esc(itemTitle(e))}</title>`,
        `      <link>${esc(link)}</link>`,
        `      <guid isPermaLink="true">${esc(link)}</guid>`,
        `      <pubDate>${new Date(`${e.observed_date}T00:00:00Z`).toUTCString()}</pubDate>`,
        `      <description>${esc(itemDescription(e))}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${esc(title)}</title>`,
    `    <link>${esc(SITE_URL + pagePath)}</link>`,
    `    <description>${esc(description)}</description>`,
    "    <language>en-us</language>",
    `    <lastBuildDate>${BUILD_TIME.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${esc(SITE_URL + path)}" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export function feedHeaders() {
  return {
    "content-type": "application/rss+xml; charset=utf-8",
    "cache-control": "public, max-age=3600",
  };
}
