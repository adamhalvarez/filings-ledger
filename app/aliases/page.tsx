import type { Metadata } from "next";
import Link from "next/link";
import { aliasList, entitiesWithoutAliases, slug } from "@/lib/db";
import LastRefreshed from "../LastRefreshed";

export const metadata: Metadata = {
  title: "Entity aliases, how filings are matched",
  description:
    "Every alias the Signal Store holds for each watchlist entity, the normalized form a filing's subject string is compared against, and where each alias came from.",
};

// Added 2026-09-10. The methodology page has always said a filing is
// matched to an entity by whole word comparison against a hand kept alias
// list; this makes the list itself inspectable.
//
// What this page reads is signal_store.entity_aliases, the store's copy.
// The daily poll matches against the list in record-scanner's
// money_sources.yaml, which seeded this table, while an alias resolved
// through the review queue is written here directly. Both are kept by
// hand, this site cannot read the YAML, and on 2026-09-10 the two differed
// by five entries. So the page says it shows the store's table and does
// not claim to be byte for byte the list the poll ran with.
const SOURCE_LABEL: Record<string, string> = {
  seed_money_sources_yaml: "seeded from the watchlist configuration",
  manual: "entered by hand",
  review_queue_resolution: "resolved from the review queue",
};

export default async function AliasesPage() {
  const [aliases, bare] = await Promise.all([aliasList(), entitiesWithoutAliases()]);
  const entityCount = new Set(aliases.map((a) => a.canonical_name)).size;

  return (
    <>
      <h1>Entity aliases</h1>
      <p className="lede">
        The names a filing&rsquo;s subject string is matched against, one row
        per alias, {aliases.length} aliases across {entityCount} entities.
      </p>
      <p className="refreshed">
        <LastRefreshed />
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Alias</th>
              <th>Matched as</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {aliases.map((a) => (
              <tr key={`${a.canonical_name}-${a.normalized_alias}`}>
                <td>
                  <Link href={`/filings/${slug(a.canonical_name)}`}>{a.canonical_name}</Link>
                </td>
                <td>{a.alias}</td>
                <td>
                  <code className="cite">{a.normalized_alias}</code>
                </td>
                <td>
                  <span title={a.source}>{SOURCE_LABEL[a.source] ?? a.source}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="notes">
        <p>
          <strong>How a match is made.</strong> A filing&rsquo;s subject
          string and each alias are normalized the same way, lower cased,
          punctuation turned to spaces, and a fixed list of legal suffixes
          and filler words such as inc, llc, group, the and of dropped, which
          is the Matched as column above. A filing
          matches when the normalized alias appears in it as a whole word or
          run of whole words. Longer aliases are tried first, so General
          Dynamics Information Technology is not filed under General
          Dynamics. There is no fuzzy or approximate matching. See the{" "}
          <Link href="/methodology">methodology page</Link> for what a match
          does and does not claim.
        </p>
        <p>
          <strong>What this table is.</strong> This is the alias table held in
          the store. The daily poll reads its list from its own configuration,
          which seeded this table; an alias resolved through the review queue
          is written here directly. Both are kept by hand and are not
          guaranteed to be identical on any given day.
        </p>
        {bare.length > 0 && (
          <p>
            <strong>Entities with filings and no alias row.</strong>{" "}
            {bare.join(", ")}.
          </p>
        )}
        <p>
          A filing no alias matches is listed as{" "}
          <Link href="/filings/unmatched">unresolved</Link>, with its subject
          string exactly as filed. A spelling that belongs to a watched entity
          is added here by a person, never by the ingest.
        </p>
      </div>
    </>
  );
}
