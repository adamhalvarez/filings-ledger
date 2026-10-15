import { allFilings, entityDirectory, slug, LARGE_ENTITIES } from "@/lib/db";
import { downloadHeaders } from "@/lib/csv";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

// The whole store, in the smallest honest shape, for /search to fetch once
// and filter in the reader's own browser.
//
// Search across every filing is the one thing this site's static model
// makes awkward: there is no server to ask, by design, and the filings
// pages are a directory of more than a hundred separately generated pages
// precisely so that no single page has to hold 18,000 rows. Shipping the
// index as a file the search page fetches on demand keeps both properties:
// a visitor who never searches never downloads it, and a visitor who does
// pays the CDN, not the database.
//
// Two compressions, both worth explaining because both could be dishonest
// if done carelessly:
//
// Rows are arrays rather than objects, with the field names given once in
// `fields`. That is a size decision only; nothing is dropped.
//
// Source URLs are not repeated. Every stored URL in this store follows one
// of two patterns built from the filing's own key, so the patterns are
// emitted once in `url_templates` and each row says only whether it follows
// one. This is checked against the actual stored value for every row rather
// than assumed: a row whose URL does not match its pattern carries the
// literal URL instead, and a row with no URL at all says so. A search
// result therefore never links to a URL this site invented for it. The
// `url_exceptions` count is there so a future reader can see whether that
// assumption is still holding.
const URL_TEMPLATES = {
  lobbying: "https://lda.gov/filings/public/filing/{key}/print/",
  contract_award: "https://www.usaspending.gov/award/{key}",
} as const;

export async function GET() {
  const [rows, entities] = await Promise.all([allFilings(), entityDirectory()]);

  const entityIndex = new Map<string, number>();
  const entityList = entities.map((e, i) => {
    entityIndex.set(e.canonical_name, i);
    return { name: e.canonical_name, slug: e.slug, large: e.large };
  });

  let exceptions = 0;
  const out = rows.map((r) => {
    const expected = URL_TEMPLATES[r.source_type].replace("{key}", r.natural_key);
    let url: 0 | 1 | string;
    if (!r.source_url) {
      url = 0;
    } else if (r.source_url === expected) {
      url = 1;
    } else {
      url = r.source_url;
      exceptions++;
    }
    return [
      r.natural_key,
      r.subject_as_filed,
      r.entity === null ? -1 : (entityIndex.get(r.entity) ?? -1),
      r.source_type === "lobbying" ? 0 : 1,
      r.occurred_date ?? r.published_date ?? null,
      r.amount,
      r.action_count,
      url,
    ];
  });

  const body = {
    source: `${SITE_URL}/data/search-index.json`,
    built_at: new Date().toISOString(),
    row_count: out.length,
    // Named here so a caller reading this file cold does not have to count
    // positions in an array to know what it is looking at.
    fields: [
      "natural_key",
      "subject_as_filed",
      "entity_index",
      "source_type_code",
      "date",
      "amount",
      "action_count",
      "source_url",
    ],
    legend: {
      entity_index: "position in entities, or -1 for a filing not matched to a watchlist entity",
      source_type_code: "0 lobbying, 1 contract award",
      date: "occurred_date, or published_date when there is no occurred_date, or null",
      action_count: "contract awards only, null means unchecked, 1 means the amount is a single obligating action",
      source_url: "1 follows this source's url_template, 0 means no url on file, a string is a literal url that does not follow the pattern",
    },
    url_templates: URL_TEMPLATES,
    url_exceptions: exceptions,
    // Which entities have their filings split across per year pages, so a
    // search result can link somewhere that actually exists: a small
    // entity's row has an anchor on its own single page, a large entity's
    // does not, since its rows live on one of several year pages.
    large_entities: LARGE_ENTITIES.map((n) => slug(n)),
    entities: entityList,
    rows: out,
  };

  return new Response(JSON.stringify(body), {
    headers: downloadHeaders("filings-ledger-search-index.json", "application/json"),
  });
}
