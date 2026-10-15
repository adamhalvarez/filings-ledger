import { allFilings } from "@/lib/db";
import { downloadHeaders } from "@/lib/csv";
import { SITE_URL, DATA_LICENSE, DATA_LICENSE_URL, CONTACT_EMAIL } from "@/lib/site";

export const dynamic = "force-static";

// The same rows as filings.csv, with the provenance a machine reader needs
// carried in the file itself rather than only on the page that linked to
// it: what this is, when it was built, what license it carries, where to
// write about a mistake in it. A JSON export that says none of that is a
// file whose origin is lost the first time someone copies it somewhere.
export async function GET() {
  const rows = await allFilings();
  const body = {
    source: `${SITE_URL}/data/filings.json`,
    describes:
      "Lobbying disclosures filed under the Lobbying Disclosure Act and " +
      "federal contract awards recorded by USAspending, for the " +
      "editorial watchlist, latest version of each filing only.",
    built_at: new Date().toISOString(),
    rebuilt: "daily",
    row_count: rows.length,
    license: { name: DATA_LICENSE, url: DATA_LICENSE_URL },
    corrections: CONTACT_EMAIL,
    methodology: `${SITE_URL}/methodology`,
    citation_unit:
      "natural_key plus content_hash plus retrieved_at names one " +
      "observation of one filing at one moment. content_hash fingerprints " +
      "the source response as received and cannot be recomputed from the " +
      "stored copy; see the methodology page.",
    notes: {
      amount:
        "For a contract award this is the award's total obligated value as " +
        "USAspending reported it at retrieved_at. action_count 1 means that " +
        "total is a single obligating action; above 1 means it is " +
        "cumulative across that many actions; null means unchecked, never " +
        "zero.",
      actions:
        "obligating_action_count is how many of the award's actions carried " +
        "a non zero obligation, so action_count minus it is the number that " +
        "moved no money. latest_action_date, latest_action_obligation and " +
        "latest_action_modification describe the most recent action alone. " +
        "All four are null together when the per action endpoint was not " +
        "reached for that award, which is a different state from an award " +
        "with no modifications. A latest_action_obligation of 0 is real: an " +
        "administrative modification obligates nothing.",
      entity:
        "null means the filing's subject string could not be matched to a " +
        "watchlist entity by whole word comparison against a hand kept " +
        "alias list. It is not a claim about the entity.",
    },
    rows,
  };
  return new Response(JSON.stringify(body), {
    headers: downloadHeaders("filings-ledger-filings.json", "application/json"),
  });
}
