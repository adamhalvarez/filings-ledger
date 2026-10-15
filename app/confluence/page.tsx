import type { Metadata } from "next";
import Link from "next/link";
import {
  actionCoverage,
  confluenceByAgency,
  confluenceLobbyingReach,
  confluencesWithPlainTerms,
  storeCounts,
  slug,
  defenseCoverage,
  CONFLUENCE_WINDOW_DAYS,
  DEFENSE_DELAY_SOURCE,
} from "@/lib/db";
import { formatAmount, formatDate } from "@/lib/format";
import LastRefreshed from "../LastRefreshed";

export const metadata: Metadata = {
  title: "Confluence, lobbying and new federal contracts",
  description:
    "Watchlist entities with both a lobbying filing and a newly obligated federal contract award in the last 90 days, split by what each award total is made of and by awarding agency.",
};

// Was the front page until 2026-09-09, moved here rather than removed. See
// app/page.tsx for what took its place and why.
//
// Revised 2026-09-10. The page used to say the window was when USAspending
// last touched an award, and that an award could appear because of a later
// action. Neither was true: confluence_candidates() windows a contract on
// coalesce(occurred_date, published_date), and occurred_date is the Base
// Obligation Date on every contract row in the store, so every award here
// was first obligated inside the window. The function was right and the
// copy was wrong; the fix is copy, and the function is untouched because
// the underlying system's alerting shares it.
//
// The definition sits above the table and every caveat below it, so a
// reader sees what the table is before being asked to discount it.
function CountAndTotal({ n, total }: { n: number; total: string | null }) {
  return (
    <>
      {n}
      {n > 0 && <div className="cite-line">{formatAmount(total)}</div>}
    </>
  );
}

export default async function ConfluencePage() {
  const [rows, byAgency, reach, coverage, counts, defense] = await Promise.all([
    confluencesWithPlainTerms(),
    confluenceByAgency(),
    confluenceLobbyingReach(),
    actionCoverage(),
    storeCounts(),
    defenseCoverage(),
  ]);

  return (
    <>
      <h1>Confluence</h1>
      <p className="lede">
        Watchlist entities with at least one lobbying filing and at least one
        contract award obligated inside the trailing {CONFLUENCE_WINDOW_DAYS}{" "}
        days.
      </p>
      <p className="lede">
        Two source types moving together inside the window, not one filing
        read too closely, is what counts as a confluence here. This store
        currently holds two kinds of federal filing, lobbying and contracts,
        so two is also every row&rsquo;s ceiling as well as its floor; see{" "}
        <Link href="/methodology#plain-terms">the methodology page</Link> for
        how the sentence under each entity below is generated and checked.
      </p>
      <p className="refreshed">
        <LastRefreshed />
      </p>

      {rows.length === 0 ? (
        <p>No entity currently has both a lobbying filing and a new contract award in the window.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Entity</th>
                <th>Lobbying filings</th>
                <th>Lobbying total</th>
                <th>New contract awards</th>
                <th>Total of new awards</th>
                <th>Single action awards</th>
                <th>Multi action awards, current total</th>
                <th>Awards not yet measured</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/filings/${slug(r.canonical_name)}`}>
                      {r.canonical_name}
                    </Link>
                    <div className="cite-line">{r.plain_terms}</div>
                  </td>
                  <td>{r.lobbying_filings}</td>
                  <td>{formatAmount(r.lobbying_amount)}</td>
                  <td>{r.contract_filings}</td>
                  <td>{formatAmount(r.contract_amount)}</td>
                  <td>
                    <CountAndTotal n={r.single_awards} total={r.single_total} />
                  </td>
                  <td>
                    <CountAndTotal n={r.multi_awards} total={r.multi_total} />
                  </td>
                  <td>
                    {r.unmeasured_awards > 0 ? (
                      <span className="badge badge-unmeasured">
                        {r.unmeasured_awards} unmeasured
                      </span>
                    ) : (
                      0
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>By agency</h2>
      <p className="lede">
        The same new awards, grouped by the agency that made them, beside the
        entity&rsquo;s lobbying filings in the window that name that agency.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Awarding agency</th>
              <th>New awards</th>
              <th>Total</th>
              <th>Lobbying filings naming this agency in window</th>
            </tr>
          </thead>
          <tbody>
            {byAgency.map((a) => (
              // Zero lobbying rows are drawn exactly like the others. They
              // are the finding as often as the rows above them are, and a
              // dimmed row would say otherwise.
              <tr key={`${a.entity_id}-${a.awarding_agency ?? "none"}`}>
                <td>
                  <Link href={`/filings/${slug(a.entity_name)}`}>{a.entity_name}</Link>
                </td>
                <td>
                  {a.awarding_agency ?? (
                    <span className="muted-count">not on file on the award record</span>
                  )}
                </td>
                <td>{a.contract_awards}</td>
                <td>{formatAmount(a.contract_total)}</td>
                <td>{a.lobbying_filings_naming_agency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Reading these tables</h2>
      <div className="notes">
        <p>
          <strong>The window.</strong> A contract award is inside it when its
          Base Obligation Date, the date USAspending records it was first
          obligated, falls in the last {CONFLUENCE_WINDOW_DAYS} days. A later
          modification to an older award does not bring that award in. A
          lobbying filing is inside it when the Senate posted it in the same
          span. The two halves of the test are not equally selective: a
          registered lobbyist files every quarter, so an entity that lobbies
          at all almost always has a filing in the window, and what actually
          varies here is the contract side.
        </p>
        <p>
          <strong>What a contract total is.</strong> Every contract figure is
          a sum of award totals as USAspending reported them when this system
          retrieved each award. For a single action award that total is the
          one obligation that created it. For a multi action award it is the
          award&rsquo;s current total, which includes actions after the
          obligation date, and how much of it was obligated inside the window
          is not known, so that column should not be read as money that moved
          in the window. The three class columns sum to the new awards count,
          and the first two totals plus the unmeasured awards&rsquo; own
          amounts make up the total of new awards.
        </p>
        <p>
          <strong>Unmeasured.</strong> An award this system has not yet asked
          USAspending about is counted as unmeasured, never as a single
          action award and never as zero. It is a gap in coverage, not a
          claim about the award. {coverage.confluence_measured} of the{" "}
          {coverage.confluence_awards} new awards in this table have been
          measured as of this build.
        </p>
        <p>
          <strong>By agency.</strong> Awards are grouped by USAspending&rsquo;s
          Awarding Agency. A lobbying filing is matched to an agency through a
          hand kept crosswalk from the Senate&rsquo;s own government entity
          ids to USAspending agency names; see the{" "}
          <Link href="/methodology#agency-crosswalk">methodology page</Link>. A
          row with no lobbying filings naming its agency stays in the table,
          since an agency awarding new contracts to an entity that did not
          lobby it is as much a finding as one it did. A filing that names
          several agencies counts once on each of their rows, so the last
          column does not sum to the entity&rsquo;s lobbying filings, and an
          agency the entity lobbied without a new award from it has no row
          here; the entity&rsquo;s own page lists both sides for the year.
        </p>
        <p>
          <strong>No Defense rows, for now.</strong> USAspending publishes
          Department of Defense contract data on a{" "}
          <a href={DEFENSE_DELAY_SOURCE}>90 day delay</a>, the same length as
          this window. As of this build the newest Defense award in the store
          was obligated on {formatDate(defense.latest_defense_obligation)}, and
          the window holds {defense.window_defense} Defense awards for the whole
          watchlist. So an entity&rsquo;s new Defense awards, and any lobbying
          of the Department of Defense beside them, cannot appear in these
          tables until the delay has passed. The absence of a Defense row is a
          lag at the source, not a finding.
        </p>
        <p>
          <strong>What the crosswalk leaves out.</strong> Of the{" "}
          {reach.filings} lobbying filings in the window for these entities,{" "}
          {reach.names_counterpart} name at least one agency that awards
          contracts, {reach.names_no_counterpart} name at least one office
          with no contracting counterpart in this store, such as either
          chamber of Congress, and {reach.names_none} name no government
          entity at all. {reach.names_unmapped} name a Senate entity id not
          yet in the crosswalk, and those are left out of the by agency
          table rather than guessed at.
        </p>
        <p>
          <strong>Blank amounts.</strong> An amount shown as not on file means
          the source filing carried no dollar figure, not zero spend.
        </p>
        <p>
          The store holds {counts.total} filings: {counts.live} captured live
          by the daily poll, {counts.historical} fetched after the fact by the
          historical sweep, and {counts.legacy} carried over in the one time
          backfill. The <Link href="/filings">filings pages</Link> list every
          one, unwindowed. For what moved recently, see{" "}
          <Link href="/">what changed</Link>.
        </p>
      </div>
      <p className="subtitle">
        Downloadable as <a href="/data/confluence.csv">confluence.csv</a> and{" "}
        <a href="/data/confluence-by-agency.csv">confluence-by-agency.csv</a>,
        with every column described in{" "}
        <a href="/data/README.md">the data dictionary</a>.
      </p>
    </>
  );
}
