import { changeLedger, entityDirectory, LEDGER_DAYS } from "@/lib/db";
import { rssFeed, feedHeaders } from "@/lib/rss";
import { feedPath } from "@/lib/paths";

export const dynamic = "force-static";
export const dynamicParams = false;

// One feed per entity, added 2026-09-11: every change the front page shows
// for this entity over its window, first sightings of both kinds and
// amounts that moved, each titled with which of those it is. A static
// segment, so it takes precedence over the [key] route beside it.
export async function generateStaticParams() {
  return (await entityDirectory()).map((e) => ({ entity: e.slug }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entity: string }> }
) {
  const { entity } = await params;
  const match = (await entityDirectory()).find((e) => e.slug === entity);
  if (!match) return new Response("not found", { status: 404 });
  const events = (await changeLedger()).filter((e) => e.entity_name === match.canonical_name);
  return new Response(
    rssFeed({
      title: `Filings Ledger, ${match.canonical_name}`,
      description: `Changes to the lobbying and federal contract record for ${match.canonical_name} over the last ${LEDGER_DAYS} days, as observed by the Signal Store.`,
      path: feedPath(match.canonical_name),
      pagePath: `/filings/${match.slug}`,
      events,
    }),
    { headers: feedHeaders() }
  );
}
