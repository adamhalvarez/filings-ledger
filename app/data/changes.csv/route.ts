import { changeLedger, LEDGER_DAYS } from "@/lib/db";
import { toCsv, downloadHeaders } from "@/lib/csv";
import { CHANGES_FILE, headers } from "@/lib/dictionary";
import { filingUrl } from "@/lib/paths";

export const dynamic = "force-static";

// The front page's own window, exactly as the page shows it: same function,
// same window, same inclusion rule. A reader who wants the sweep days this
// deliberately leaves out wants filings.csv, which is the whole current
// store with nothing filtered. Columns come from lib/dictionary.ts, so every
// one of them is in /data/README.md.
export async function GET() {
  const events = await changeLedger();
  const rows = events.map((e) => ({
    observed_date: e.observed_date,
    event: e.event,
    novelty: e.novelty,
    days_public_before_observed: e.days_public_before_observed,
    version: e.version,
    source_type: e.source_type,
    entity: e.entity_name,
    subject_as_filed: e.subject_raw_string,
    amount: e.amount,
    previous_amount: e.previous_amount,
    amount_delta: e.amount_delta,
    occurred_date: e.occurred_date,
    published_date: e.published_date,
    ingest_origin: e.ingest_origin,
    natural_key: e.natural_key,
    source_url: e.source_url,
    site_url: filingUrl(e.natural_key, e.entity_name),
  }));
  return new Response(toCsv(headers(CHANGES_FILE), rows), {
    headers: downloadHeaders(
      `filings-ledger-changes-${LEDGER_DAYS}d.csv`,
      "text/csv"
    ),
  });
}
