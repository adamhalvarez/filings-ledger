import { confluenceSplit } from "@/lib/db";
import { toCsv, downloadHeaders } from "@/lib/csv";
import { CONFLUENCE_FILE, headers } from "@/lib/dictionary";
import { entityUrl } from "@/lib/paths";

export const dynamic = "force-static";

// Columns come from lib/dictionary.ts, which /data/README.md is rendered
// from, so every header here is documented there by construction. The
// contract split reconciles to confluence_candidates() before it returns;
// see confluenceSplit() in lib/db.ts.
export async function GET() {
  const rows = (await confluenceSplit()).map((r) => ({
    entity: r.canonical_name,
    entity_type: r.entity_type,
    lobbying_filings: r.lobbying_filings,
    lobbying_total: r.lobbying_amount,
    contract_awards: r.contract_filings,
    contract_total: r.contract_amount,
    awards_single_action: r.single_awards,
    single_action_total: r.single_total,
    awards_multi_action: r.multi_awards,
    multi_action_current_total: r.multi_total,
    awards_unmeasured: r.unmeasured_awards,
    window_first_date: r.earliest_occurred,
    window_last_date: r.latest_occurred,
    site_url: entityUrl(r.canonical_name),
  }));
  return new Response(toCsv(headers(CONFLUENCE_FILE), rows), {
    headers: downloadHeaders("filings-ledger-confluence.csv", "text/csv"),
  });
}
