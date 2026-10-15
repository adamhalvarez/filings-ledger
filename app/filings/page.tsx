import type { Metadata } from "next";
import Link from "next/link";
import { entityDirectory, recentFilings, unmatchedCount, LARGE_ENTITIES } from "@/lib/db";
import FilingsTable from "./FilingsTable";
import LastRefreshed from "../LastRefreshed";

export const metadata: Metadata = {
  title: "Filings, every watchlist entity",
  description:
    "The directory of every lobbying disclosure and federal contract award on record for the editorial watchlist, one page per entity.",
};

export default async function FilingsIndexPage() {
  const [entities, recent, unmatched] = await Promise.all([
    entityDirectory(),
    recentFilings(),
    unmatchedCount(),
  ]);
  const total = entities.reduce((sum, e) => sum + e.total, 0) + unmatched;

  return (
    <>
      <h1>Filings</h1>
      <p className="subtitle">
        Every filing behind the confluence page, grouped by entity, latest
        version only. An amendment to a filing supersedes an earlier
        version rather than replacing it in place; each entity&rsquo;s own
        page shows the current version of each. {total} filings on file
        across {entities.length} watchlist entities.
      </p>
      <p className="refreshed"><LastRefreshed /></p>
      <p className="subtitle">
        Looking for one filing rather than one entity?{" "}
        <Link href="/search">Search every filing</Link> covers all of these
        pages at once. The whole set is downloadable as{" "}
        <a href="/data/filings.csv">filings.csv</a> or{" "}
        <a href="/data/filings.json">filings.json</a>.
      </p>

      <h2>By entity</h2>
      <p className="subtitle">
        {LARGE_ENTITIES.length} entities with enough history split further
        by year, and by a numbered chunk within a year large enough to
        need one; every other entity is one page.
      </p>
      <ul className="entity-directory">
        {entities.map((e) => (
          <li key={e.slug}>
            <Link href={`/filings/${e.slug}`}>{e.canonical_name}</Link>
            {" "}
            <span className="muted-count">{e.total} filings{e.large ? ", split by year" : ""}</span>
          </li>
        ))}
      </ul>

      <h2>Unresolved</h2>
      <p className="subtitle">
        A filing whose subject could not be matched to a watchlist entity
        by whole word comparison against the{" "}
        <Link href="/aliases">alias list</Link>. Not evidence of
        anything about an entity; a filing this site has not yet been able
        to place. See the methodology page for what an unmatched filing
        does and does not mean.
      </p>
      <p>
        <Link href="/filings/unmatched">{unmatched} unmatched filings &rarr;</Link>
      </p>

      <h2>Most recent activity, across every entity</h2>
      <p className="subtitle">
        The last {recent.length} filings retrieved, most recent first,
        regardless of entity. This is the one view that is not scoped to a
        single entity or period; it is deliberately bounded rather than a
        second copy of the full record; browse by entity above for
        anything older.
      </p>
      <FilingsTable rows={recent} />
    </>
  );
}
