import { allFilings } from "@/lib/db";
import { toCsv, downloadHeaders } from "@/lib/csv";

// Static, like every page here: this file is written once at build time and
// served by the CDN, so a download never reaches the database. See
// README.md for why that model is the whole point rather than an
// optimisation.
export const dynamic = "force-static";

const HEADERS = [
  "natural_key",
  "source_type",
  "entity",
  "subject_as_filed",
  "occurred_date",
  "reported_date",
  "published_date",
  "amount",
  "action_count",
  "obligating_action_count",
  "latest_action_date",
  "latest_action_obligation",
  "latest_action_modification",
  "ingest_origin",
  "retrieved_at",
  "content_hash",
  "source_url",
  "archived_copy",
];

export async function GET() {
  const rows = await allFilings();
  return new Response(toCsv(HEADERS, rows), {
    headers: downloadHeaders("filings-ledger-filings.csv", "text/csv"),
  });
}
