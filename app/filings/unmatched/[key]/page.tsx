import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { filingRecords } from "@/lib/db";
import FilingPermalink from "../../FilingPermalink";
import LastRefreshed from "../../../LastRefreshed";

// An unmatched filing's own page, added 2026-09-11 with the permalinks.
// Kept out of the index like the list it belongs to: middleware.ts sends
// noindex for everything under /filings/unmatched, and robots.ts disallows
// the whole prefix. See middleware.ts for why.
export const dynamicParams = false;

type Params = { key: string };

export async function generateStaticParams(): Promise<Params[]> {
  const records = await filingRecords();
  const params: Params[] = [];
  for (const r of records.values()) {
    if (r.entity_name === null) params.push({ key: r.natural_key });
  }
  return params;
}

async function resolve(params: Promise<Params>) {
  const { key } = await params;
  const record = (await filingRecords()).get(decodeURIComponent(key));
  return record && record.entity_name === null ? record : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const record = await resolve(params);
  if (!record) return {};
  return {
    title: `Unresolved filing ${record.natural_key}`,
    description: "A filing this site has not matched to a watchlist entity, with the subject string exactly as the source recorded it.",
  };
}

export default async function UnmatchedFilingPage({ params }: { params: Promise<Params> }) {
  const record = await resolve(params);
  if (!record) notFound();
  return (
    <>
      <p className="breadcrumb">
        <Link href="/filings">Filings</Link> /{" "}
        <Link href="/filings/unmatched">Unresolved</Link>
      </p>
      <p className="subtitle">
        This filing&rsquo;s subject string does not match any watchlist entity
        or alias. That is not evidence of anything about any entity; it is a
        filing this site has not yet been able to place.
      </p>
      <FilingPermalink record={record} />
      <p className="refreshed">
        <LastRefreshed />
      </p>
    </>
  );
}
