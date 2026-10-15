import Link from "next/link";
import { watchlist } from "@/lib/db";
import { feedPath } from "@/lib/paths";

// The top of an entity's page since 2026-09-11: its name, the editor's
// stated reason for watching it, the series and piece that reason ties to,
// and its feed. The reason is read from entity_watch_reasons and nowhere
// else; an entity without one says so.
export default async function EntityHeader({ canonicalName }: { canonicalName: string }) {
  const row = (await watchlist()).find((r) => r.canonical_name === canonicalName);
  const reasons = row?.reasons ?? [];
  return (
    <>
      <h1>{canonicalName}</h1>
      {reasons.length === 0 ? (
        <p className="why-watched">
          <span className="badge badge-unmeasured">no stated reason yet</span>{" "}
          <span className="muted-count">
            This entity is on the <Link href="/watchlist">watchlist</Link>; the
            editor has not yet recorded why.
          </span>
        </p>
      ) : (
        reasons.map((r, i) => (
          <p key={i} className="why-watched">
            <span className="muted-count">Why watched:</span> {r.reason}
            {(r.source_series || r.source_article_url) && (
              <span className="muted-count">
                {" "}
                {r.source_series && <>{r.source_series}</>}
                {r.source_series && r.source_article_url && ", "}
                {r.source_article_url && <a href={r.source_article_url}>the piece</a>}
              </span>
            )}
          </p>
        ))
      )}
      <p className="subtitle">
        Follow this entity&rsquo;s changes as{" "}
        <a href={feedPath(canonicalName)}>an RSS feed</a>.
      </p>
    </>
  );
}
