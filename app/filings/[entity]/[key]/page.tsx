import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  entityDirectory,
  entityPeriods,
  filingRecords,
  filingsForPeriod,
  type Period,
} from "@/lib/db";
import { formatAmount } from "@/lib/format";
import { slug } from "@/lib/paths";
import FilingsTable from "../../FilingsTable";
import FilingPermalink from "../../FilingPermalink";
import LastRefreshed from "../../../LastRefreshed";

// Two kinds of page share this URL position, since 2026-09-11 when the
// per filing permalinks arrived: a large entity's period page, labelled
// 2025, 2025-2 or pre-2024, and one filing's own page, labelled by its
// natural_key. A period label is digits, a hyphen and digits, or pre- and a
// year; a natural_key is a CONT_AWD_ style USAspending id or a Senate filing
// UUID. The two cannot collide, and generateStaticParams() refuses to build
// if they ever do.
//
// Static only, never rendered on demand: a key this build did not generate
// is a 404, not a runtime query.
export const dynamicParams = false;

type Params = { entity: string; key: string };

// A year or pre-<year>, either optionally split into numbered parts, so
// 2025, 2025-2, pre-2024 and pre-2024-1. The first version of this left the
// part off pre-2024 and six real pages rendered as 404s; the title check
// caught it before it shipped.
const PERIOD_LABEL = /^(\d{4}|pre-\d{4})(-\d+)?$/;

export async function generateStaticParams(): Promise<Params[]> {
  const [entities, records] = await Promise.all([entityDirectory(), filingRecords()]);
  const params: Params[] = [];
  for (const e of entities.filter((e) => e.large)) {
    for (const p of await entityPeriods(e.canonical_name)) {
      params.push({ entity: e.slug, key: p.label });
    }
  }
  for (const r of records.values()) {
    if (r.entity_name === null) continue; // under /filings/unmatched instead
    if (PERIOD_LABEL.test(r.natural_key)) {
      throw new Error(`natural_key ${r.natural_key} looks like a period label and would collide`);
    }
    params.push({ entity: slug(r.entity_name), key: r.natural_key });
  }
  return params;
}

function periodHeading(p: Period, periods: Period[]): string {
  const chunks = periods.filter((x) => x.year === p.year).length;
  const yearLabel = p.year === null ? "before 2024" : String(p.year);
  return chunks === 1 ? yearLabel : `${yearLabel}, part ${p.chunk} of ${chunks}`;
}

async function resolve(params: Promise<Params>) {
  const { entity: entitySlug, key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const entities = await entityDirectory();
  const match = entities.find((e) => e.slug === entitySlug);
  if (!match) return null;
  if (PERIOD_LABEL.test(key)) {
    if (!match.large) return null;
    const periods = await entityPeriods(match.canonical_name);
    const p = periods.find((x) => x.label === key);
    return p ? { kind: "period" as const, match, periods, period: p } : null;
  }
  const record = (await filingRecords()).get(key);
  if (!record || record.entity_name === null || slug(record.entity_name) !== entitySlug) return null;
  return { kind: "filing" as const, match, record };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const r = await resolve(params);
  if (!r) return {};
  if (r.kind === "filing") {
    const rec = r.record;
    const what = rec.source_type === "lobbying" ? "lobbying disclosure" : "federal contract award";
    const amount = formatAmount(rec.versions[rec.versions.length - 1]?.amount ?? null);
    // The key is in the title because the subject string is not unique: one
    // entity files thousands of awards under the same name, and a title
    // without the key repeated 8,458 times on the first build.
    return {
      title: `${r.match.canonical_name}, ${what} ${rec.natural_key}, ${amount}`,
      description: `${what[0].toUpperCase()}${what.slice(1)} ${rec.natural_key} for ${r.match.canonical_name}, ${amount}: every version this store holds, the source link and how to cite it.`,
    };
  }
  const heading = periodHeading(r.period, r.periods);
  return {
    title: `${r.match.canonical_name}, ${heading}, lobbying and federal contract filings`,
    description: `Lobbying disclosures and federal contract awards on record for ${r.match.canonical_name}, ${heading}, each traced to its source filing.`,
  };
}

export default async function EntityKeyPage({ params }: { params: Promise<Params> }) {
  const r = await resolve(params);
  if (!r) notFound();
  if (r.kind === "filing") {
    return (
      <>
        <p className="breadcrumb">
          <Link href="/filings">Filings</Link> /{" "}
          <Link href={`/filings/${r.match.slug}`}>{r.match.canonical_name}</Link>
        </p>
        <FilingPermalink record={r.record} />
        <p className="refreshed">
          <LastRefreshed />
        </p>
      </>
    );
  }
  return <PeriodPage match={r.match} periods={r.periods} thisPeriod={r.period} />;
}

async function PeriodPage({
  match,
  periods,
  thisPeriod,
}: {
  match: Awaited<ReturnType<typeof entityDirectory>>[number];
  periods: Period[];
  thisPeriod: Period;
}) {
  const period = thisPeriod.label;
  const chunksInYear = periods.filter((p) => p.year === thisPeriod.year).length;
  const rows = await filingsForPeriod(
    match.canonical_name,
    thisPeriod.year,
    thisPeriod.chunk,
    chunksInYear
  );

  // Previous and next page within this entity's own history, added
  // 2026-09-09. entityPeriods() returns them newest first and the period
  // index page above already lists them all; what was missing was the
  // ability to read straight through, which is what a reader following one
  // entity's record actually does. "Older" is the next entry in that
  // newest first array, so the two links are deliberately labelled by
  // direction in time rather than by array position.
  const at = periods.findIndex((p) => p.label === period);
  const newer = at > 0 ? periods[at - 1] : null;
  const older = at >= 0 && at < periods.length - 1 ? periods[at + 1] : null;
  const periodLabel = (p: { year: number | null; label: string }) =>
    p.year === null ? "before 2024" : p.label;

  const yearLabel = thisPeriod.year === null ? `before 2024` : `${thisPeriod.year}`;
  const heading = periodHeading(thisPeriod, periods);

  return (
    <>
      <h1>
        {match.canonical_name}, {heading}
      </h1>
      <p className="subtitle">
        {rows.length} filings.{" "}
        {chunksInYear > 1
          ? `This period had more filings than one page here holds, so it is split into ${chunksInYear} parts; every part together is the complete record for ${yearLabel}.`
          : `The complete record for ${yearLabel === "before 2024" ? "everything on file before 2024" : "this year"}.`}
      </p>
      <p className="refreshed"><LastRefreshed /></p>
      <p>
        <Link href={`/filings/${match.slug}`}>&larr; Back to {match.canonical_name}&rsquo;s years</Link>
        {" · "}
        <Link href="/filings">Filings directory</Link>
        {" · "}
        <Link href="/search">Search every filing</Link>
      </p>
      <p className="period-nav">
        {newer ? (
          <Link href={`/filings/${match.slug}/${newer.label}`}>
            &larr; Newer, {periodLabel(newer)}
          </Link>
        ) : (
          <span className="muted-count">Newest page on file</span>
        )}
        {" "}
        {older ? (
          <Link href={`/filings/${match.slug}/${older.label}`}>
            Older, {periodLabel(older)} &rarr;
          </Link>
        ) : (
          <span className="muted-count">Oldest page on file</span>
        )}
      </p>
      <FilingsTable rows={rows} />
    </>
  );
}
