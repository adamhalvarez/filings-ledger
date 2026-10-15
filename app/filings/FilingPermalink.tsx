import Link from "next/link";
import type { FilingRecord } from "@/lib/db";
import { formatAmount, formatDate, formatDelta } from "@/lib/format";
import { filingUrl, slug } from "@/lib/paths";

// One filing's own page, added 2026-09-11: the citation layer. Everything
// this store holds about the filing, every version it has recorded, and a
// block a reader can copy to cite it. Rendered from filingRecords(), which
// is read once per build worker, never per page.

const SOURCE_LABEL = { lobbying: "Lobbying disclosure", contract_award: "Federal contract award" } as const;
const ORIGIN_LABEL = { live: "live ingest", historical: "historical sweep", legacy_backfill: "one time backfill" } as const;
const NOVELTY_LABEL = {
  new_to_record: "new to the record",
  new_to_watchlist: "new to the watchlist",
  undated: "undated",
} as const;

function day(iso: string) {
  return iso.slice(0, 10);
}

export default function FilingPermalink({ record }: { record: FilingRecord }) {
  const versions = record.versions;
  const current = versions[versions.length - 1];
  const first = versions[0];
  const url = filingUrl(record.natural_key, record.entity_name);
  const a = record.actions;

  return (
    <>
      <h1 className="filing-title">{record.subject_raw_string}</h1>
      <p className="lede">
        {SOURCE_LABEL[record.source_type]}
        {record.entity_name ? (
          <>
            {", "}
            <Link href={`/filings/${slug(record.entity_name)}`}>{record.entity_name}</Link>
          </>
        ) : (
          <>
            {", "}
            <span className="badge badge-unmatched">unmatched</span>
          </>
        )}
        {", "}
        {formatAmount(current.amount)}
      </p>
      <p className="subtitle">
        Key <code className="cite">{record.natural_key}</code>. First seen by
        this system {formatDate(first.retrieved_at)} through the{" "}
        {ORIGIN_LABEL[first.ingest_origin]}
        {record.novelty && (
          <>
            , {NOVELTY_LABEL[record.novelty]}
            {record.days_public_before_observed !== null &&
              `, public ${record.days_public_before_observed} days before this system saw it`}
          </>
        )}
        .{" "}
        {versions.length === 1
          ? "One version on record."
          : `${versions.length} versions on record; the current one is first below.`}
      </p>

      <h2>Cite this row</h2>
      <div className="cite-block">
        <div>
          <span className="cite-label">On this site</span>{" "}
          <a href={url}>{url}</a>
        </div>
        <div>
          <span className="cite-label">At the source</span>{" "}
          {current.source_url ? (
            <a href={current.source_url} target="_blank" rel="noreferrer">
              {current.source_url}
            </a>
          ) : (
            "not on file"
          )}
        </div>
        <div>
          <span className="cite-label">Observed</span> {day(current.retrieved_at)}, version{" "}
          {current.version}, retrieved {current.retrieved_at}
        </div>
        <div>
          <span className="cite-label">Content hash</span>{" "}
          <code className="cite">{current.content_hash}</code>
        </div>
        <p className="cite-line">
          The source record can change after this date; the key, hash and
          retrieval time name exactly the response this system stored. See{" "}
          <Link href="/license">license and citation</Link>.
        </p>
      </div>

      <h2>Versions</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Amount</th>
              <th>Change</th>
              <th>Occurred</th>
              <th>Published</th>
              <th>Retrieved</th>
              <th>How it arrived</th>
              <th>Content hash</th>
            </tr>
          </thead>
          <tbody>
            {[...versions].reverse().map((v) => {
              const prev = versions.find((x) => x.version === v.version - 1);
              const delta =
                prev && v.amount !== null && prev.amount !== null && Number(v.amount) !== Number(prev.amount)
                  ? (Number(v.amount) - Number(prev.amount)).toFixed(2)
                  : null;
              return (
                <tr key={v.id}>
                  <td>
                    {v.version}
                    {v === current && <div className="cite-line">current</div>}
                  </td>
                  <td>{formatAmount(v.amount)}</td>
                  <td>
                    {!prev ? (
                      <span className="muted-count">first version</span>
                    ) : delta === null ? (
                      <span className="muted-count">amount unchanged</span>
                    ) : (
                      <span className={Number(delta) < 0 ? "delta-down" : "delta-up"}>
                        {formatDelta(delta)}
                      </span>
                    )}
                  </td>
                  <td>{formatDate(v.occurred_date)}</td>
                  <td>{formatDate(v.published_date)}</td>
                  <td>{v.retrieved_at}</td>
                  <td>{ORIGIN_LABEL[v.ingest_origin]}</td>
                  <td>
                    <code className="cite" title={v.content_hash}>
                      {v.content_hash.slice(0, 12)}
                    </code>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Archived copy</h2>
      {record.wayback_status === "captured" && record.wayback_url ? (
        <p>
          <a href={record.wayback_url} target="_blank" rel="noreferrer">
            {record.wayback_url}
          </a>{" "}
          {record.wayback_capture_source && (
            <span className={"badge " + (record.wayback_capture_source === "cdx" ? "badge-cdx" : "badge-spn2")}>
              {record.wayback_capture_source === "cdx"
                ? "found, made by someone else"
                : "captured by this system"}
              {record.wayback_snapshot_at && `, ${formatDate(record.wayback_snapshot_at)}`}
            </span>
          )}
        </p>
      ) : (
        <p className="subtitle">
          None on file. An archived copy is optional corroboration and never a
          condition of this filing&rsquo;s provenance, which is the stored
          response and its hash above; see the{" "}
          <Link href="/methodology">methodology page</Link>.
        </p>
      )}

      {record.source_type === "contract_award" && (
        <>
          <h2>What the amount is made of</h2>
          {a === null || a.action_count === null ? (
            <p className="subtitle">
              <span className="badge badge-unmeasured">unmeasured</span> This
              system has not yet asked USAspending how many actions produced
              this award&rsquo;s total. That is a gap in coverage, not a claim
              about the award.
            </p>
          ) : (
            <>
              <p>
                {a.action_count === 1
                  ? "One recorded action, so the amount is that single obligation and nothing about it is cumulative."
                  : `${a.action_count} recorded actions, so the amount is the award's current total across all of them.`}
                {a.obligating_action_count !== null &&
                  a.action_count > 1 &&
                  ` ${a.obligating_action_count} of them obligated money.`}{" "}
                Measured {day(a.retrieved_at)}
                {a.total_obligation !== null && `, when USAspending reported a total obligation of ${formatAmount(a.total_obligation)}`}
                .
              </p>
              {a.list && a.list.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Action date</th>
                        <th>Modification</th>
                        <th>Type</th>
                        <th>Obligated</th>
                        <th>Description as recorded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.list.map((x, i) => (
                        <tr key={`${x.action_date}-${x.modification_number}-${i}`}>
                          <td>{formatDate(x.action_date)}</td>
                          <td>{x.modification_number && x.modification_number !== "0" ? x.modification_number : "base"}</td>
                          <td>{x.action_type ?? "not on file"}</td>
                          <td>
                            {x.federal_action_obligation === null
                              ? "not on file"
                              : Number(x.federal_action_obligation) === 0
                                ? "no money"
                                : formatDelta(x.federal_action_obligation)}
                          </td>
                          <td>{x.description ?? <span className="muted-count">none</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="subtitle">
                  The per action detail was not fetched for this award, so the
                  individual actions are not listed; the count above stands.
                </p>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
