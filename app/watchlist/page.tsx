import type { Metadata } from "next";
import Link from "next/link";
import {
  defenseCoverage,
  watchlist,
  BASELINE_WINDOW_DAYS,
  DEFENSE_DELAY_SOURCE,
} from "@/lib/db";
import { formatDate } from "@/lib/format";
import { entityPath, feedPath } from "@/lib/paths";
import LastRefreshed from "../LastRefreshed";
import { ContractPair, LobbyingPair } from "./BaselinePair";

export const metadata: Metadata = {
  title: "Watchlist, who is watched and why",
  description:
    "Every entity the Signal Store watches, the editor's stated reason for watching it, the the editor's reporting it ties to, and its filings in the last 90 days beside its own prior year.",
};

// Added 2026-09-11. Until then nothing on the site said why any entity was
// watched, and a reader could not tell the store from a filter run on
// USAspending. The reasons come only from signal_store.entity_watch_reasons,
// written by the editor; this page never supplies one. An entity with no
// row says so and sorts last, and the page still builds when the table is
// empty, which it was on the day this shipped.
const TYPE_LABEL: Record<string, string> = {
  contractor: "Contractor",
  trade_association: "Trade association",
};

export default async function WatchlistPage() {
  const [rows, defense] = await Promise.all([watchlist(), defenseCoverage()]);
  const sorted = [...rows].sort(
    (a, b) =>
      Number(a.reasons.length === 0) - Number(b.reasons.length === 0) ||
      a.canonical_name.localeCompare(b.canonical_name)
  );
  const withReason = rows.filter((r) => r.reasons.length > 0).length;

  return (
    <>
      <h1>Watchlist</h1>
      <p className="lede">
        The {rows.length} entities this site watches. The editor chooses them
        from entities named in the editor&rsquo;s reporting, and the
        reason column is the editor&rsquo;s statement of why, not a finding of
        this site.
      </p>
      <p className="refreshed">
        <LastRefreshed />{" "}
        {withReason === 0
          ? "No stated reason has been recorded for any entity yet."
          : `${withReason} of ${rows.length} entities have a stated reason.`}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Type</th>
              <th>Why watched</th>
              <th>Series</th>
              <th>editorial reporting</th>
              <th>Contract awards, last {BASELINE_WINDOW_DAYS} days</th>
              <th>Lobbying filings, last {BASELINE_WINDOW_DAYS} days</th>
              <th>Feed</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.entity_id}>
                <td>
                  <Link href={entityPath(r.canonical_name)}>{r.canonical_name}</Link>
                </td>
                <td>{TYPE_LABEL[r.entity_type] ?? r.entity_type}</td>
                <td>
                  {r.reasons.length === 0 ? (
                    <span className="badge badge-unmeasured">no stated reason yet</span>
                  ) : (
                    r.reasons.map((x, i) => <p key={i} className="cell-p">{x.reason}</p>)
                  )}
                </td>
                <td>
                  {r.reasons.length === 0
                    ? <span className="muted-count">none</span>
                    : r.reasons.map((x, i) => (
                        <p key={i} className="cell-p">
                          {x.source_series ?? <span className="muted-count">none</span>}
                        </p>
                      ))}
                </td>
                <td>
                  {r.reasons.length === 0
                    ? <span className="muted-count">none</span>
                    : r.reasons.map((x, i) => (
                        <p key={i} className="cell-p">
                          {x.source_article_url ? (
                            <a href={x.source_article_url}>the piece</a>
                          ) : (
                            <span className="muted-count">none yet</span>
                          )}
                        </p>
                      ))}
                </td>
                <td>
                  {r.baseline ? <ContractPair b={r.baseline} /> : <NoDatedFilings />}
                </td>
                <td>
                  {r.baseline ? <LobbyingPair b={r.baseline} /> : <NoDatedFilings />}
                </td>
                <td>
                  <a href={feedPath(r.canonical_name)}>RSS</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Reading the two numbers</h2>
      <div className="notes">
        <p>
          The first number is the entity&rsquo;s filings dated inside the last{" "}
          {BASELINE_WINDOW_DAYS} days, by the same dates the confluence page
          uses: the Base Obligation Date for a contract award, the day the
          Senate posted a lobbying filing. The second is the same count for the
          365 days before that, scaled to {BASELINE_WINDOW_DAYS} days by the
          database; the raw year is underneath. They are two counts from this
          store, shown side by side. The site computes no ratio and no index
          from them.
        </p>
        <p>
          <strong>They are not like for like for contract awards.</strong>{" "}
          USAspending publishes Department of Defense contract data on a{" "}
          <a href={DEFENSE_DELAY_SOURCE}>90 day delay</a>. As of this build
          the newest Defense award in this store was obligated on{" "}
          {formatDate(defense.latest_defense_obligation)}, so the window holds{" "}
          {defense.window_defense} Defense awards for the whole watchlist
          against {defense.window_civilian} civilian ones, while the baseline
          year holds its Defense awards in full. For an entity whose federal
          work is mostly Defense, the window will sit far below its baseline
          for that reason alone, and the Defense counts under each figure show
          by how much. That gap is a publication lag at the source, not a fall
          in the entity&rsquo;s activity. The baseline year also always
          contains one federal fiscal year end, when obligations peak:{" "}
          {defense.baseline_september.toLocaleString("en-US")} of its{" "}
          {defense.baseline_awards.toLocaleString("en-US")} awards across the
          watchlist were obligated in a September. A window that has not
          reached the end of September is being set against a year that has.
        </p>
        <p>
          The baseline is this store&rsquo;s own record, not an
          entity&rsquo;s full federal history: contract awards reach it
          through the historical sweep, which went back to 1 November 2024,
          and lobbying filings begin in 2024. See the{" "}
          <Link href="/methodology#baseline">methodology page</Link>.
        </p>
        <p>
          <strong>Why watched.</strong> Each reason is one sentence written by
          the editor and stored in the watchlist&rsquo;s own table, with the
          series and the published piece it ties to where there is one. An
          entity reading no stated reason yet is watched but its reason has not
          been written down; nothing on this site fills the gap.
        </p>
        <p>
          <strong>Following an entity.</strong> The RSS link on each row is a
          feed of that entity&rsquo;s changes on the front page, first
          sightings and amounts that moved. The{" "}
          <a href="/feed.xml">site wide feed</a> carries filings new to the
          record only.
        </p>
      </div>
    </>
  );
}

// entity_activity_baseline() leaves out an entity with no dated filing in
// either span. That is a count of zero from the store, but it is shown as its
// own label so it cannot be read as a measured quiet year.
function NoDatedFilings() {
  return <span className="muted-count">no dated filing in either span</span>;
}
