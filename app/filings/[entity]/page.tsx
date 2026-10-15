import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { entityDirectory, entityPeriods, filingsForEntity } from "@/lib/db";
import FilingsTable from "../FilingsTable";
import EntitySummary from "../EntitySummary";
import EntityHeader from "../EntityHeader";
import { feedPath } from "@/lib/paths";
import LastRefreshed from "../../LastRefreshed";

// Static only, never rendered on demand: a slug this build did not
// generate is a 404, not a runtime query. See README.md for why a runtime
// query is not the shape this site uses at all.
export const dynamicParams = false;

export async function generateStaticParams() {
  const entities = await entityDirectory();
  return entities.map((e) => ({ entity: e.slug }));
}

// A title of its own per entity, added 2026-09-10: every page on the site
// shipped the one default title until then, which to a search engine is a
// hundred and fifty copies of one page.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ entity: string }>;
}): Promise<Metadata> {
  const { entity: entitySlug } = await params;
  const match = (await entityDirectory()).find((e) => e.slug === entitySlug);
  if (!match) return {};
  return {
    title: `${match.canonical_name}, lobbying and federal contract filings`,
    description: `Every lobbying disclosure and federal contract award on record for ${match.canonical_name}, by year and by agency, each traced to its source filing. ${match.total} filings.`,
    alternates: {
      types: { "application/rss+xml": feedPath(match.canonical_name) },
    },
  };
}

export default async function EntityFilingsPage({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity: entitySlug } = await params;
  const entities = await entityDirectory();
  const match = entities.find((e) => e.slug === entitySlug);
  if (!match) notFound();

  // A large entity's own filings are split by year (and by a numbered
  // chunk within a year big enough to need one, see entityPeriods): this
  // page is a period index for those four rather than the table itself,
  // the same reason the split exists in the first place.
  if (match.large) {
    const periods = await entityPeriods(match.canonical_name);
    return (
      <>
        <EntityHeader canonicalName={match.canonical_name} />
        <p className="subtitle">
          {match.total} filings on record for this entity, split by year
          (and by a numbered chunk within a year with enough of its own
          activity to need one) rather than one page, since this
          entity&rsquo;s own history is large enough that a single page
          would recreate the problem this split exists to avoid.
        </p>
        <p className="refreshed"><LastRefreshed /></p>
        <p>
          <Link href="/filings">&larr; Back to the filings directory</Link>
          {" · "}
          <Link href="/search">Search every filing</Link>
        </p>
        <EntitySummary canonicalName={match.canonical_name} />
        <h2>Filings, page by page</h2>
        <p className="subtitle">
          The pages below group filings by the year of their occurred date,
          falling back to the published date and then to the date this system
          retrieved them, so their counts can differ slightly from the year
          table above.
        </p>
        <ul className="entity-directory">
          {periods.map((p) => {
            const chunksInThisYear = periods.filter((x) => x.year === p.year).length;
            const yearLabel = p.year === null ? "before 2024" : String(p.year);
            const shown =
              chunksInThisYear === 1 ? yearLabel : `${yearLabel}, part ${p.chunk} of ${chunksInThisYear}`;
            return (
              <li key={p.label}>
              <Link href={`/filings/${match.slug}/${p.label}`}>
                {shown}
              </Link>{" "}
              <span className="muted-count">{p.count} filings</span>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  const rows = await filingsForEntity(match.canonical_name);

  return (
    <>
      <EntityHeader canonicalName={match.canonical_name} />
      <p className="subtitle">
        Every filing on record for this entity, latest version only,
        regardless of date: this page&rsquo;s job is to be the complete
        evidentiary record a confluence traces back to, not a windowed
        view. {rows.length} filings.
      </p>
      <p className="refreshed"><LastRefreshed /></p>
      <p>
        <Link href="/filings">&larr; Back to the filings directory</Link>
      </p>
      <EntitySummary canonicalName={match.canonical_name} />
      <h2>Every filing</h2>
      <FilingsTable rows={rows} />
    </>
  );
}
