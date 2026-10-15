import type { Metadata } from "next";
import Link from "next/link";
import { unmatchedFilings } from "@/lib/db";
import FilingsTable from "../FilingsTable";
import LastRefreshed from "../../LastRefreshed";

// A title of its own like every other page, though this one is kept out of
// the index by middleware.ts and robots.ts; the title is for the reader's
// tab and history, not for a search engine.
export const metadata: Metadata = {
  title: "Unresolved filings",
  description:
    "Filings this site could not yet match to a watchlist entity, with the subject string exactly as the source agency recorded it.",
};

export default async function UnmatchedFilingsPage() {
  const rows = await unmatchedFilings();

  return (
    <>
      <h1>Unresolved filings</h1>
      <p className="subtitle">
        Every filing this site could not match to a watchlist entity by
        whole word comparison against the alias list, most recent first,
        bounded to the last {rows.length}. An unmatched filing is not
        evidence of anything about an entity; it is a filing this site has
        not yet been able to place, carrying the exact string the source
        agency recorded, queued for a human to review. See the
        methodology page for the full account of what a match does and
        does not claim.
      </p>
      <p className="refreshed"><LastRefreshed /></p>
      <p>
        <Link href="/filings">&larr; Back to the filings directory</Link>
      </p>
      <FilingsTable rows={rows} />
    </>
  );
}
