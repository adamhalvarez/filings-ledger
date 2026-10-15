import Link from "next/link";
import {
  entityAgencies,
  entityYears,
  lobbyingFirstYear,
  watchlist,
  BASELINE_WINDOW_DAYS,
  CONFLUENCE_WINDOW_DAYS,
  type EntityAgencyRow,
} from "@/lib/db";
import { formatAmount } from "@/lib/format";
import { ContractPair, LobbyingPair } from "../watchlist/BaselinePair";

// The top of an entity's page, added 2026-09-10: its whole record by year,
// then the agencies block for the current year. A plain server component,
// rendered once at build time like everything else on the site.

// A total beside a count of zero is not a zero dollar figure, it is a sum
// over nothing, so the cell says so rather than printing $0. A total that is
// null beside a positive count means the filings carried no amount.
function Total({ n, total }: { n: number; total: string | null }) {
  if (n === 0) return <span className="muted-count">none</span>;
  return <>{formatAmount(total)}</>;
}

function agencyLabel(r: EntityAgencyRow) {
  if (r.kind === "no_counterpart") {
    return (
      <span className="muted-count">
        offices with no contracting counterpart, such as Congress
      </span>
    );
  }
  if (r.kind === "unmapped") {
    return <span className="badge badge-unmeasured">not yet in the crosswalk</span>;
  }
  return r.agency ?? <span className="muted-count">not on file on the award record</span>;
}

export default async function EntitySummary({ canonicalName }: { canonicalName: string }) {
  const [years, agencies, lobbyingFrom, list] = await Promise.all([
    entityYears(canonicalName),
    entityAgencies(canonicalName),
    lobbyingFirstYear(),
    watchlist(),
  ]);
  const baseline = list.find((r) => r.canonical_name === canonicalName)?.baseline ?? null;
  // A year before the store's first lobbying filing, for any entity, is a
  // year nobody swept. Its lobbying cells say so rather than print 0.
  const lobbyingMeasured = (year: number | null) =>
    year === null || (lobbyingFrom !== null && year >= lobbyingFrom);

  return (
    <>
      <h2>Last {BASELINE_WINDOW_DAYS} days beside the year before</h2>
      {baseline === null ? (
        <p className="subtitle">No dated filing for this entity in either span.</p>
      ) : (
        <div className="table-wrap">
          <table className="narrow">
            <thead>
              <tr>
                <th>Contract awards</th>
                <th>Lobbying filings</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <ContractPair b={baseline} />
                </td>
                <td>
                  <LobbyingPair b={baseline} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="subtitle">
        Two counts, never a ratio: filings dated in the last{" "}
        {BASELINE_WINDOW_DAYS} days, and the 365 days before that scaled to the
        same length. USAspending publishes Defense contract data 90 days late,
        so for an entity with Defense work the window is missing awards the
        baseline year is not; the <Link href="/watchlist">watchlist</Link>{" "}
        explains how to read the pair.
      </p>

      <h2>By year</h2>
      <p className="subtitle">
        Every filing on record for this entity, counted by the year of its
        own date: the Base Obligation Date for a contract award, the date the
        Senate posted it for a lobbying filing. A contract total is the sum of
        those awards&rsquo; current totals, so an award first obligated in an
        earlier year carries its later modifications with it.
      </p>
      <p className="subtitle">
        The store&rsquo;s record does not reach equally far back on both
        sides.{" "}
        {lobbyingFrom !== null && (
          <>
            It holds no lobbying filing for any entity before {lobbyingFrom},
            so lobbying for earlier years is marked not in the record rather
            than counted as zero.{" "}
          </>
        )}
        A contract award obligated before November 2024 is on record because
        the historical sweep, which looked back to 1 November 2024 by action
        date, found a later action on it, so an earlier year counts the awards
        still active since then, not everything obligated that year.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th>Lobbying filings</th>
              <th>Lobbying total</th>
              <th>Contract awards</th>
              <th>Contract total</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.activity_year ?? "undated"}>
                <td>
                  {y.activity_year ?? (
                    <span
                      className="badge badge-legacy"
                      title="carried over in the one time backfill with neither an occurred nor a published date on file"
                    >
                      undated, backfilled
                    </span>
                  )}
                </td>
                {lobbyingMeasured(y.activity_year) ? (
                  <>
                    <td>{y.lobbying_filings}</td>
                    <td>
                      <Total n={y.lobbying_filings} total={y.lobbying_total} />
                    </td>
                  </>
                ) : (
                  <td colSpan={2}>
                    <span className="muted-count">not in the record</span>
                  </td>
                )}
                <td>{y.contract_filings}</td>
                <td>
                  <Total n={y.contract_filings} total={y.contract_total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Agencies, {agencies.year}</h2>
      <p className="subtitle">
        This year&rsquo;s lobbying filings by the agency they name, beside
        this year&rsquo;s new contract awards by the agency that made them.
        The entity level version of the by agency table on the{" "}
        <Link href="/confluence">confluence page</Link>, for the calendar year
        rather than the {CONFLUENCE_WINDOW_DAYS} day window, and with agencies named only in
        lobbying listed too. {agencies.lobbying_filings} lobbying filings this
        year; one that names several agencies counts on each of their rows, so
        the lobbying column does not sum to that figure. Lobbying is matched
        to agencies through the hand kept{" "}
        <Link href="/methodology#agency-crosswalk">agency crosswalk</Link>.
      </p>
      {agencies.rows.length === 0 ? (
        <p>
          No lobbying filing naming an agency and no new contract award on
          record for this entity in {agencies.year}.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agency</th>
                <th>Lobbying filings naming it</th>
                <th>New contract awards</th>
                <th>Contract total</th>
              </tr>
            </thead>
            <tbody>
              {agencies.rows.map((r) => (
                <tr key={`${r.kind}-${r.agency ?? "none"}`}>
                  <td>{agencyLabel(r)}</td>
                  <td>{r.lobbying_filings}</td>
                  <td>
                    {r.kind === "agency" ? (
                      r.contract_awards
                    ) : (
                      <span className="muted-count">not applicable</span>
                    )}
                  </td>
                  <td>
                    {r.kind === "agency" ? (
                      <Total n={r.contract_awards} total={r.contract_total} />
                    ) : (
                      <span className="muted-count">not applicable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
