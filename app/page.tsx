import type { Metadata } from "next";
import Link from "next/link";
import {
  changeLedger,
  changeLedgerDays,
  changeLedgerDayNovelty,
  storeCounts,
  LEDGER_DAYS,
  type ChangeEvent,
} from "@/lib/db";
import { formatDate, formatAmount, formatDelta } from "@/lib/format";
import { filingPath, slug } from "@/lib/paths";
import LastRefreshed from "./LastRefreshed";

// absolute because the layout's "%s | Filings Ledger" template applies to
// pages below the root layout's own segment and not to this one.
export const metadata: Metadata = {
  title: {
    absolute: `What changed, lobbying and federal contract filings in the last ${LEDGER_DAYS} days | Filings Ledger`,
  },
  description: `New lobbying disclosures and federal contract awards for the editorial watchlist, and recorded amounts that moved, over the last ${LEDGER_DAYS} days, each traced to its source filing.`,
  alternates: {
    types: { "application/rss+xml": "/feed.xml" },
  },
};

const SOURCE_LABEL = {
  lobbying: "Lobbying",
  contract_award: "Contract",
} as const;

const ORIGIN_LABEL = {
  live: "live ingest",
  historical: "historical",
  legacy_backfill: "backfilled",
} as const;

// This page replaced the confluence view as the front page on 2026-09-09,
// because a lobbying registrant files about every ninety days, the length
// of the confluence window, so that page looked the same most weeks.
//
// Revised 2026-09-11. On that day 51 of the 84 rows here were lobbying
// filings public for weeks or months before this system first saw them, 47
// of them first seen on 2026-09-10 (44 posted in April and July), only
// because an entity was added to the watchlist and the daily poll asked
// about it for the first time. The page already refused to present the
// historical sweep's first sightings as agency activity, since the date a
// fetch happened says nothing about an agency; a watchlist addition is the
// same case and was not being refused. first_sighting_novelty draws the line:
// a first sighting within seven days of the source's own date is new to the
// record, anything older is new to the watchlist, and they get separate
// tables so the second cannot read as the first.
function FilingCell({ e }: { e: ChangeEvent }) {
  return (
    <>
      <Link href={filingPath(e.natural_key, e.entity_name)}>this filing</Link>
      <div className="cite-line">
        {e.source_url ? (
          <a href={e.source_url} target="_blank" rel="noreferrer">
            source
          </a>
        ) : (
          "source not on file"
        )}
      </div>
    </>
  );
}

function EntityCell({ e }: { e: ChangeEvent }) {
  return e.entity_name ? (
    <Link href={`/filings/${slug(e.entity_name)}`}>{e.entity_name}</Link>
  ) : (
    <span className="badge badge-unmatched">unmatched</span>
  );
}

// What the most recent recorded action against an award did, when this
// system has asked. Unmeasured is its own label, never a blank and never
// zero; a latest action that obligated nothing is a real and common value.
function LatestAction({ e }: { e: ChangeEvent }) {
  if (e.source_type !== "contract_award") {
    return <span className="muted-count">not applicable</span>;
  }
  if (!e.action_measured || e.latest_action_date === null) {
    return <span className="badge badge-unmeasured">unmeasured</span>;
  }
  const mod = e.latest_action_modification;
  const obligation = e.latest_action_obligation;
  return (
    <>
      {mod && mod !== "0" ? `mod ${mod}` : "base award"}
      <div className="cite-line">
        {formatDate(e.latest_action_date)},{" "}
        {obligation === null
          ? "amount not on file"
          : Number(obligation) === 0
            ? "no money"
            : formatDelta(obligation)}
      </div>
    </>
  );
}

function FirstSightingTable({ rows, showLag }: { rows: ChangeEvent[]; showLag: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Observed</th>
            <th>Source</th>
            <th>Entity</th>
            <th>Subject as filed</th>
            <th>Amount</th>
            <th>Occurred</th>
            <th>Published</th>
            {showLag && <th>Public before this system saw it</th>}
            <th>Filing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.filing_id} id={e.natural_key}>
              <td>{formatDate(e.observed_date)}</td>
              <td>{SOURCE_LABEL[e.source_type]}</td>
              <td>
                <EntityCell e={e} />
              </td>
              <td>{e.subject_raw_string}</td>
              <td>{formatAmount(e.amount)}</td>
              <td>{formatDate(e.occurred_date)}</td>
              <td>{formatDate(e.published_date)}</td>
              {showLag && (
                <td>
                  {e.novelty === "undated" || e.days_public_before_observed === null ? (
                    <span
                      className="badge badge-unmeasured"
                      title="the source gives no published date, so how long it was public before this system saw it cannot be said"
                    >
                      undated
                    </span>
                  ) : (
                    `${e.days_public_before_observed} days`
                  )}
                </td>
              )}
              <td>
                <FilingCell e={e} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ChangeLedgerPage() {
  const [events, days, dayNovelty, counts] = await Promise.all([
    changeLedger(),
    changeLedgerDays(),
    changeLedgerDayNovelty(),
    storeCounts(),
  ]);

  const movements = events.filter((e) => e.event === "amended");
  const newToRecord = events.filter((e) => e.event === "first_seen" && e.novelty === "new_to_record");
  const newToWatchlist = events.filter(
    (e) => e.event === "first_seen" && (e.novelty === "new_to_watchlist" || e.novelty === "undated")
  );

  // Every row lands in exactly one of the three tables, or the page does
  // not build. A first sighting with no novelty row, or an amendment with
  // one, would mean the view and the ledger disagree about what a first
  // sighting is.
  const placed = movements.length + newToRecord.length + newToWatchlist.length;
  if (placed !== events.length) {
    const stray = events.filter(
      (e) => !movements.includes(e) && !newToRecord.includes(e) && !newToWatchlist.includes(e)
    );
    throw new Error(
      `What changed: ${events.length} ledger rows but ${placed} placed in a table; ` +
        `unplaced: ${stray.map((e) => `${e.natural_key} ${e.event} novelty=${e.novelty}`).join(", ")}`
    );
  }
  const dayProblems: string[] = [];
  const byDay = days.map((d) => {
    const n = dayNovelty.find(
      (x) => x.observed_date === d.observed_date && x.ingest_origin === d.ingest_origin
    );
    if (d.first_seen > 0 && (!n || n.first_seen !== d.first_seen)) {
      dayProblems.push(`${d.observed_date} ${d.ingest_origin}: ${d.first_seen} first seen, novelty counted ${n?.first_seen ?? "none"}`);
    }
    const ntr = n?.new_to_record ?? 0;
    if (ntr > d.first_seen) dayProblems.push(`${d.observed_date} ${d.ingest_origin}: new to record exceeds first seen`);
    return { ...d, new_to_record: ntr };
  });
  if (dayProblems.length) {
    throw new Error("What changed, by day, does not reconcile:\n  " + dayProblems.join("\n  "));
  }

  return (
    <>
      <h1>What changed</h1>
      <p className="subtitle">
        Every change this system observed in the last {LEDGER_DAYS} days: an
        already recorded filing whose dollar amount moved, and a filing seen
        for the first time. First sightings are split by whether the filing
        was new to the public record or only new to this watchlist. Both come
        from the same append only store the rest of this site reads: a filing
        is never overwritten, so an amendment is a new version sitting next to
        the one before it, and the change is the difference between them.
      </p>
      <p className="refreshed">
        <LastRefreshed /> The store holds {counts.total} filings:{" "}
        {counts.live} captured live by the daily poll, {counts.historical}{" "}
        fetched after the fact by the historical sweep, and {counts.legacy}{" "}
        carried over in the one time backfill. The sweep is most of the
        store and none of this page, for the reason given under the daily
        counts below.
      </p>

      <h2>Amounts that moved</h2>
      <p className="subtitle">
        The rarest thing here and the reason this page exists. A figure this
        site has already published changing is a fact about the federal
        record, not about this system. {movements.length} of the{" "}
        {events.length} changes on this page are of this kind. An amendment
        that changed nothing but a timestamp is not listed anywhere on this
        page: most amendments are exactly that.
      </p>
      {movements.length === 0 ? (
        <p>
          No recorded amount moved in the last {LEDGER_DAYS} days. That is an
          ordinary result, not a stall; the refreshed line above is what says
          whether this site is still being updated.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Observed</th>
                <th>Entity</th>
                <th>Subject as filed</th>
                <th>Was</th>
                <th>Now</th>
                <th>Change</th>
                <th>Latest action</th>
                <th>Filing</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((e) => (
                <tr key={e.filing_id} id={e.natural_key}>
                  <td>{formatDate(e.observed_date)}</td>
                  <td>
                    <EntityCell e={e} />
                  </td>
                  <td>{e.subject_raw_string}</td>
                  <td>{formatAmount(e.previous_amount)}</td>
                  <td>{formatAmount(e.amount)}</td>
                  <td className={Number(e.amount_delta) < 0 ? "delta-down" : "delta-up"}>
                    {formatDelta(e.amount_delta)}
                  </td>
                  <td>
                    <LatestAction e={e} />
                  </td>
                  <td>
                    <FilingCell e={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="subtitle">
        A figure moving down is a deobligation or a corrected record, not an
        error on this site: both numbers are what USAspending reported, at the
        two moments this system asked. Where this system has measured the
        award, the latest action column shows the most recent recorded action
        against it, its modification number, date and what it obligated; that
        is usually the action behind the change and its date says whether it
        can be. Unmeasured means this system has not yet asked, not that there
        was no action.
      </p>

      <h2>New to the record</h2>
      <p className="subtitle">
        {newToRecord.length} filings this system first saw within seven days
        of the date the source gives them: for a lobbying filing, the day the
        Senate posted it; for a contract award, the day USAspending last
        modified the record. These are the first sightings that say something
        about an agency rather than about this system.
      </p>
      {newToRecord.length === 0 ? (
        <p>No filing new to the record in the last {LEDGER_DAYS} days.</p>
      ) : (
        <FirstSightingTable rows={newToRecord} showLag={false} />
      )}

      <h2>New to the watchlist</h2>
      <p className="subtitle">
        {newToWatchlist.length} filings that were public before this system
        was watching the entity, and arrived because an alias or an entity was
        added; a row marked undated carries no published date to compare.
      </p>
      {newToWatchlist.length === 0 ? (
        <p>None in the last {LEDGER_DAYS} days.</p>
      ) : (
        <FirstSightingTable rows={newToWatchlist} showLag={true} />
      )}

      <h2>By day, including the days this system was catching up</h2>
      <p className="subtitle">
        Every row the store gained in the window, counted by the day this
        system observed it and by how it arrived, with nothing summed away.
        A day carrying a historical sweep or the one time backfill is large
        because of the fetch, not because of the federal record, and reading
        it as a day of unusual activity would be the single easiest mistake
        to make from this data. New to record counts the first sightings
        within seven days of their source date, by the same rule as the table
        above.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Day observed</th>
              <th>How it arrived</th>
              <th>First seen</th>
              <th>Of those, new to record</th>
              <th>Amendments</th>
              <th>Of those, amount moved</th>
              <th>Net change</th>
            </tr>
          </thead>
          <tbody>
            {byDay.map((d) => (
              <tr key={`${d.observed_date}-${d.ingest_origin}`}>
                <td>{formatDate(d.observed_date)}</td>
                <td>
                  <span
                    className={
                      "badge " +
                      (d.ingest_origin === "live"
                        ? "badge-live"
                        : d.ingest_origin === "historical"
                          ? "badge-historical"
                          : "badge-legacy")
                    }
                  >
                    {ORIGIN_LABEL[d.ingest_origin]}
                  </span>
                </td>
                <td>{d.first_seen}</td>
                <td>{d.new_to_record}</td>
                <td>{d.amendments}</td>
                <td>{d.amendments_with_amount_change}</td>
                <td>
                  {Number(d.net_amount_change) === 0
                    ? "no change"
                    : formatDelta(d.net_amount_change)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="subtitle">
        This window is downloadable as{" "}
        <a href="/data/changes.csv">changes.csv</a>, with every column
        described in <a href="/data/README.md">the data dictionary</a>, and
        followable as <a href="/feed.xml">an RSS feed</a> of the filings new to
        the record. Each entity&rsquo;s page has a feed of its own. The{" "}
        <Link href="/confluence">confluence</Link> view this page replaced is
        still here and still computed the same way.
      </p>
    </>
  );
}
