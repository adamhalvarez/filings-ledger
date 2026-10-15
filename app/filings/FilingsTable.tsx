"use client";

import { useMemo, useState } from "react";
import type { FilingRow } from "@/lib/db";
import { formatDate, formatAmount, shortHash } from "@/lib/format";
import { filingPath } from "@/lib/paths";

const SOURCE_LABEL: Record<FilingRow["source_type"], string> = {
  lobbying: "Lobbying",
  contract_award: "Contract",
};

const ORIGIN_LABEL: Record<FilingRow["ingest_origin"], string> = {
  live: "live ingest",
  historical: "historical",
  legacy_backfill: "backfilled",
};

function OriginBadge({ origin }: { origin: FilingRow["ingest_origin"] }) {
  const cls =
    origin === "live"
      ? "badge-live"
      : origin === "historical"
        ? "badge-historical"
        : "badge-legacy";
  const title =
    origin === "historical"
      ? "fetched after the fact, back to 2024-11-01, under the same field list live ingest uses, so it carries real dates despite predating this store"
      : origin === "legacy_backfill"
        ? "migrated once from money.db before this store existed; contract filings from this backfill carry no occurred or published date"
        : "captured the day it happened, by this store's own daily ingest";
  return (
    <span className={`badge ${cls}`} title={title}>
      {ORIGIN_LABEL[origin]}
    </span>
  );
}

// What an amount is made of, per row, added 2026-09-09. This is the column
// the methodology page spent four paragraphs apologising for the absence
// of: USAspending's summary endpoint returns an award's cumulative total
// and no transaction history, so nothing here could say whether a figure
// was one obligation or an original award plus years of modifications. It
// is now asked directly, per award, and stored in
// signal_store.contract_award_actions.
//
// The count alone turned out not to be enough, and the first award checked
// showed why: two actions, of which the second obligated nothing at all
// and existed to incorporate a form. "2 actions" on its own invites
// exactly the wrong reading, that a second action means more money, and of
// the first 500 awards checked 441 are multi action, so that reading would
// be wrong most of the time. So where the per action detail is on file the
// cell also says how many of those actions obligated anything and what the
// most recent one did.
//
// Not checked stays its own state and is still the honest majority: the
// check is three requests per award against roughly 18,000 awards, so it
// fills in over weeks. It is never rendered as a zero, and neither is the
// obligating count, since an award in this store has at least one
// obligating action by definition. Zero on the latest action's amount is
// different, and real, and the point.
function ActionsCell({ row }: { row: FilingRow }) {
  if (row.source_type !== "contract_award") {
    return <span className="muted-count">not applicable</span>;
  }
  if (row.action_count === null) {
    return (
      // "unmeasured" since 2026-09-10, the word the confluence page and the
      // methodology use for the same state; it read "not checked" before.
      <span
        className="badge badge-unmeasured"
        title="this system has not yet asked USAspending how many actions produced this award's total; a gap in coverage, not a claim about the award"
      >
        unmeasured
      </span>
    );
  }

  const detail = row.latest_action_date !== null;
  const moved =
    row.latest_action_obligation !== null &&
    Number(row.latest_action_obligation) !== 0;

  return (
    <>
      {row.action_count === 1 ? (
        <span
          className="badge badge-single-action"
          title="one recorded action, so the amount is this award's own obligation and not a cumulative figure"
        >
          1 action
        </span>
      ) : (
        <span
          className="badge badge-multi-action"
          title="the amount is the award's current total across this many recorded actions"
        >
          {row.action_count} actions
        </span>
      )}
      {detail && (
        <div className="cite-line">
          {row.obligating_action_count !== null && row.action_count > 1 && (
            <>{row.obligating_action_count} obligating, </>
          )}
          latest {formatDate(row.latest_action_date)}
          {row.latest_action_obligation !== null && (
            <>
              {", "}
              {moved ? (
                formatAmount(row.latest_action_obligation)
              ) : (
                <span title="the most recent action against this award obligated nothing, an administrative modification rather than new money">
                  no money
                </span>
              )}
            </>
          )}
          {row.latest_action_modification &&
            row.latest_action_modification !== "0" && (
              <> (mod {row.latest_action_modification})</>
            )}
        </div>
      )}
    </>
  );
}

// Receives an already scoped, bounded set of rows: one entity, one
// period, the recent-activity list, or the unmatched list, never the
// whole store. The text filter below narrows within that set; it does
// not fetch anything further, so it stays cheap regardless of which page
// it is on. For search across the whole store, which cannot work this
// way, see /search and the build time index it reads.
export default function FilingsTable({ rows }: { rows: FilingRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.subject_raw_string.toLowerCase().includes(q) ||
        r.natural_key.toLowerCase().includes(q) ||
        r.content_hash.toLowerCase().startsWith(q) ||
        (r.canonical_name ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <>
      {rows.length > 20 && (
        <div className="filter-bar">
          <input
            type="text"
            placeholder="Filter this page's filings"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter filings"
          />
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Subject as filed</th>
              <th>Occurred</th>
              <th>Published</th>
              <th>Amount</th>
              <th>Made of</th>
              <th>Retrieved</th>
              <th>Origin</th>
              <th>Filing</th>
              <th>Archived copy</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              // The row's own anchor, so a citation can point at one filing
              // rather than at a page holding hundreds. natural_key rather
              // than the row's uuid: the key is stable across an amendment
              // and across a rebuild, the uuid names one version of one
              // observation and changes when the filing is amended.
              <tr key={r.id} id={r.natural_key}>
                <td>{SOURCE_LABEL[r.source_type]}</td>
                <td>
                  {r.subject_raw_string}
                  {!r.entity_id && (
                    <>
                      {" "}
                      <span className="badge badge-unmatched">unmatched</span>
                    </>
                  )}
                </td>
                <td>{formatDate(r.occurred_date)}</td>
                <td>{formatDate(r.published_date)}</td>
                <td>{formatAmount(r.amount)}</td>
                <td>
                  <ActionsCell row={r} />
                </td>
                <td>{formatDate(r.retrieved_at)}</td>
                <td>
                  <OriginBadge origin={r.ingest_origin} />
                </td>
                {/* The permalink first since 2026-09-11, the source beside
                    it: the filing's own page is what a citation should
                    point at, and it carries every version and the source
                    link itself. */}
                <td>
                  <a href={filingPath(r.natural_key, r.canonical_name)}>this filing</a>
                  <div className="cite-line">
                    {r.source_url ? (
                      <a href={r.source_url} target="_blank" rel="noreferrer">
                        source
                      </a>
                    ) : (
                      "source not on file"
                    )}{" "}
                    <code title={`${r.natural_key} · ${r.content_hash}`}>
                      {shortHash(r.content_hash)}
                    </code>
                  </div>
                </td>
                <td>
                  {r.wayback_status === "captured" && r.wayback_url ? (
                    <>
                      <a href={r.wayback_url} target="_blank" rel="noreferrer">
                        archive.org
                      </a>
                      {r.wayback_capture_source && (
                        <>
                          {" "}
                          <span
                            className={
                              "badge " +
                              (r.wayback_capture_source === "cdx"
                                ? "badge-cdx"
                                : "badge-spn2")
                            }
                            title={
                              r.wayback_capture_source === "cdx"
                                ? "an existing snapshot someone else made, found in the Wayback index"
                                : "a snapshot this system captured itself"
                            }
                          >
                            {r.wayback_capture_source === "cdx" ? "found" : "captured"}
                            {r.wayback_snapshot_at && ` ${formatDate(r.wayback_snapshot_at)}`}
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    "not on file"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && <p>No filing matches that filter.</p>}
    </>
  );
}
