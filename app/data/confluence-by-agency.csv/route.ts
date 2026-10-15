import { confluenceByAgency, confluenceSplit } from "@/lib/db";
import { toCsv, downloadHeaders } from "@/lib/csv";
import { BY_AGENCY_FILE, headers } from "@/lib/dictionary";
import { entityUrl } from "@/lib/paths";

export const dynamic = "force-static";

// The /confluence page's by agency table as a file. confluenceSplit() is
// awaited first only for its reconciliation: it throws, and fails the
// build, if these rows do not sum to confluence_candidates() per entity,
// so this file can never ship disagreeing with confluence.csv.
export async function GET() {
  await confluenceSplit();
  const rows = (await confluenceByAgency()).map((r) => ({
    entity: r.entity_name,
    awarding_agency: r.awarding_agency,
    contract_awards: r.contract_awards,
    contract_total: r.contract_total,
    awards_single_action: r.awards_single_action,
    awards_multi_action: r.awards_multi_action,
    awards_unmeasured: r.awards_unmeasured,
    lobbying_filings_naming_agency: r.lobbying_filings_naming_agency,
    lobbying_total_naming_agency: r.lobbying_total_naming_agency,
    site_url: entityUrl(r.entity_name),
  }));
  return new Response(toCsv(headers(BY_AGENCY_FILE), rows), {
    headers: downloadHeaders("filings-ledger-confluence-by-agency.csv", "text/csv"),
  });
}
