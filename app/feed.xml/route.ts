import { changeLedger, LEDGER_DAYS } from "@/lib/db";
import { rssFeed, feedHeaders } from "@/lib/rss";

export const dynamic = "force-static";

// The whole ledger as a feed, filings new to the record only, added
// 2026-09-11. A filing new only to the watchlist and an amendment are on the
// front page and in each entity's own feed; this one is the narrowest claim
// the site makes, a filing that was new at its source when this system saw
// it.
export async function GET() {
  const events = (await changeLedger()).filter(
    (e) => e.event === "first_seen" && e.novelty === "new_to_record"
  );
  return new Response(
    rssFeed({
      title: "Filings Ledger, new to the record",
      description: `Lobbying disclosures and federal contract awards for the editorial watchlist that this system saw within seven days of their source date, over the last ${LEDGER_DAYS} days.`,
      path: "/feed.xml",
      pagePath: "/",
      events,
    }),
    { headers: feedHeaders() }
  );
}
