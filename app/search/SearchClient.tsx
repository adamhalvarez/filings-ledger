"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate, formatAmount } from "@/lib/format";
import { filingPath } from "@/lib/paths";

type Entity = { name: string; slug: string; large: boolean };
type Row = [
  string, // natural_key
  string, // subject as filed
  number, // entity index, or -1
  0 | 1, // 0 lobbying, 1 contract award
  string | null, // date
  string | null, // amount
  number | null, // action count
  0 | 1 | string, // source url: template, none, or literal
];
type Index = {
  built_at: string;
  row_count: number;
  url_templates: { lobbying: string; contract_award: string };
  entities: Entity[];
  rows: Row[];
};

// Rendered at a time. The index holds around 18,000 rows and a query of two
// or three letters can match thousands of them; painting all of those is
// slow enough to feel broken on a phone, and nobody reads result 400. The
// count above the table always reports the real total, so a bounded render
// never hides how many there were.
const SHOWN = 200;

// The whole index, fetched once, on the reader's first keystroke rather than
// on page load. It is a few megabytes: a visitor who opened this page by
// accident should not pay for it, and a visitor who is typing has already
// asked for it.
export default function SearchClient() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | "lobbying" | "contract">("all");
  const [index, setIndex] = useState<Index | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">(
    "idle"
  );
  const asked = useRef(false);

  useEffect(() => {
    if (!query || asked.current) return;
    asked.current = true;
    setState("loading");
    fetch("/data/search-index.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: Index) => {
        setIndex(d);
        setState("ready");
      })
      .catch(() => setState("failed"));
  }, [query]);

  const results = useMemo(() => {
    if (!index) return { rows: [] as Row[], total: 0 };
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { rows: [], total: 0 };
    const matched: Row[] = [];
    for (const row of index.rows) {
      if (source === "lobbying" && row[3] !== 0) continue;
      if (source === "contract" && row[3] !== 1) continue;
      const entity = row[2] >= 0 ? index.entities[row[2]].name : "";
      if (
        row[1].toLowerCase().includes(q) ||
        row[0].toLowerCase().includes(q) ||
        entity.toLowerCase().includes(q)
      ) {
        matched.push(row);
      }
    }
    return { rows: matched.slice(0, SHOWN), total: matched.length };
  }, [index, query, source]);

  function urlFor(row: Row): string | null {
    if (!index) return null;
    const flag = row[7];
    if (flag === 0) return null;
    if (typeof flag === "string") return flag;
    const template =
      row[3] === 0 ? index.url_templates.lobbying : index.url_templates.contract_award;
    return template.replace("{key}", row[0]);
  }

  // Where this filing sits on this site: its own permalink since
  // 2026-09-11, for matched and unmatched filings alike, which replaced the
  // entity page anchor this used to guess at.
  function pageFor(row: Row): string | null {
    if (!index) return null;
    return filingPath(row[0], row[2] >= 0 ? index.entities[row[2]].name : null);
  }

  return (
    <>
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search every filing by subject, entity or filing key"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search filings"
          autoFocus
        />
        <select
          value={source}
          onChange={(e) =>
            setSource(e.target.value as "all" | "lobbying" | "contract")
          }
          aria-label="Limit to one source"
        >
          <option value="all">Both sources</option>
          <option value="lobbying">Lobbying only</option>
          <option value="contract">Contracts only</option>
        </select>
      </div>

      {state === "idle" && (
        <p className="subtitle">
          Start typing to search. The index is fetched on your first
          keystroke, not before, so this page costs nothing to open.
        </p>
      )}
      {state === "loading" && <p className="subtitle">Fetching the index.</p>}
      {state === "failed" && (
        <p className="subtitle">
          The search index could not be fetched. Every filing is still
          browsable by entity from the{" "}
          <a href="/filings">filings directory</a>, which needs nothing but
          the page itself.
        </p>
      )}

      {state === "ready" && query.trim().length < 2 && (
        <p className="subtitle">
          Two characters or more, please: a single letter matches most of the{" "}
          {index?.row_count.toLocaleString("en-US")} filings on file and tells
          you nothing.
        </p>
      )}

      {state === "ready" && query.trim().length >= 2 && (
        <>
          <p className="subtitle">
            {results.total.toLocaleString("en-US")} of{" "}
            {index?.row_count.toLocaleString("en-US")} filings match
            {results.total > SHOWN && `, showing the first ${SHOWN}`}. Latest
            version of each filing only, the same rows the filings pages show.
          </p>
          {results.total === 0 ? (
            <p>
              Nothing matches that. Entity matching on this site is whole word
              against a hand kept alias list, so a subsidiary filing under its
              own name may be on file as an unmatched filing rather than under
              its parent; the{" "}
              <a href="/filings/unmatched">unresolved filings page</a> is where
              those are.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subject as filed</th>
                    <th>Entity</th>
                    <th>Source</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Made of</th>
                    <th>Filing</th>
                  </tr>
                </thead>
                <tbody>
                  {results.rows.map((row) => {
                    const url = urlFor(row);
                    const page = pageFor(row);
                    return (
                      <tr key={row[0]}>
                        <td>{row[1]}</td>
                        <td>
                          {row[2] >= 0 ? (
                            index?.entities[row[2]].name
                          ) : (
                            <span className="badge badge-unmatched">
                              unmatched
                            </span>
                          )}
                        </td>
                        <td>{row[3] === 0 ? "Lobbying" : "Contract"}</td>
                        <td>{formatDate(row[4])}</td>
                        <td>{formatAmount(row[5])}</td>
                        <td>
                          {row[3] === 0 ? (
                            <span className="muted-count">not applicable</span>
                          ) : row[6] === null ? (
                            <span className="badge badge-unmeasured">unmeasured</span>
                          ) : row[6] === 1 ? (
                            <span className="badge badge-single-action">
                              1 action
                            </span>
                          ) : (
                            <span className="badge badge-multi-action">
                              {row[6]} actions
                            </span>
                          )}
                        </td>
                        <td>
                          {page && <a href={page}>this filing</a>}
                          <div className="cite-line">
                            {url ? (
                              <a href={url} target="_blank" rel="noreferrer">
                                source
                              </a>
                            ) : (
                              "source not on file"
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
