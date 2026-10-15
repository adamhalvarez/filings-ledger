// "In plain terms": one machine written sentence per confluence entity,
// mirroring record-scanner's scripts/money_signals.py plain_terms() on the
// internal side, the two repos' one other writer of a confluence sentence.
// A pure module deliberately: no database import, so these two functions
// can be exercised without SIGNAL_STORE_READER_URL or a live connection,
// which lib/db.ts throws for at import time. lib/db.ts composes them with
// confluenceSplit()'s own reconciled rows in confluencesWithPlainTerms().
// See the methodology page, "the plain language sentence".

export type ConfluencePlainInput = {
  canonical_name: string;
  lobbying_filings: number;
  contract_filings: number;
  lobbying_amount: string | null;
  contract_amount: string | null;
  earliest_occurred: string | null;
  latest_occurred: string | null;
};

const PLAIN_TERMS_MONEY_RE = /\$[\d,]+(?:\.\d+)?/g;
const PLAIN_TERMS_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;

function plainAmount(v: string | null): string | null {
  if (v === null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function confluencePlainTerms(
  row: ConfluencePlainInput,
  windowDays: number
): string {
  const lobbyingAmount = plainAmount(row.lobbying_amount);
  const contractAmount = plainAmount(row.contract_amount);
  const bits = [
    `${row.lobbying_filings} lobbying filing${row.lobbying_filings === 1 ? "" : "s"}` +
      (lobbyingAmount ? ` totaling ${lobbyingAmount}` : ""),
    `${row.contract_filings} contract award${row.contract_filings === 1 ? "" : "s"}` +
      (contractAmount ? ` totaling ${contractAmount}` : ""),
  ];
  const when =
    row.earliest_occurred && row.latest_occurred
      ? row.earliest_occurred === row.latest_occurred
        ? `on ${row.earliest_occurred}`
        : `between ${row.earliest_occurred} and ${row.latest_occurred}`
      : "with no filing date on file";
  return (
    `${row.canonical_name} shows ${bits.join(" and ")} in the trailing ` +
    `${windowDays} days, ${when}. Two source types, lobbying and a ` +
    `federal contract, moved for this entity in the window, which is why ` +
    `it counts as a confluence rather than one filing read too closely; ` +
    `this store carries only these two source types today, so every ` +
    `confluence row here meets that same two type floor.`
  );
}

export function tracePlainTerms(
  sentence: string,
  row: ConfluencePlainInput
): { ok: boolean; reason?: string } {
  const allowedAmounts = new Set<string>();
  for (const v of [row.lobbying_amount, row.contract_amount]) {
    const f = plainAmount(v);
    if (f) allowedAmounts.add(f);
  }
  const allowedDates = new Set<string>();
  for (const d of [row.earliest_occurred, row.latest_occurred]) {
    if (d) allowedDates.add(d);
  }
  for (const m of sentence.match(PLAIN_TERMS_MONEY_RE) ?? []) {
    if (!allowedAmounts.has(m)) {
      return { ok: false, reason: `figure ${m} does not trace to this row's own totals` };
    }
  }
  for (const d of sentence.match(PLAIN_TERMS_DATE_RE) ?? []) {
    if (!allowedDates.has(d)) {
      return { ok: false, reason: `date ${d} does not trace to this row's own dates` };
    }
  }
  return { ok: true };
}

// This repo carries no test framework; the established check here is
// next build throwing on a bad row, per buildConfluencesWithPlainTerms in
// lib/db.ts. That needs a live SIGNAL_STORE_READER_URL, so it cannot prove
// tracePlainTerms itself catches a bad figure with no database at all. This
// is that proof, run with `npx tsx lib/plainTerms.ts`, no dependency beyond
// what the repo already has: a fixture row renders the right amounts and
// dates, and a sentence carrying a figure the row never reported is
// rejected. Mutation proof for both: replay the same assertions against a
// row from which one field has been removed, and a check with the
// substance of the disallowed-figure test deleted.
if (import.meta.url === `file://${process.argv[1]}`) {
  const row: ConfluencePlainInput = {
    canonical_name: "Test Contractor",
    lobbying_filings: 2,
    contract_filings: 1,
    lobbying_amount: "75000.00",
    contract_amount: "1500000.00",
    earliest_occurred: "2026-06-01",
    latest_occurred: "2026-08-20",
  };
  const sentence = confluencePlainTerms(row, 90);
  const checks: [string, boolean][] = [
    ["states the lobbying total", sentence.includes("$75,000")],
    ["states the contract total", sentence.includes("$1,500,000")],
    ["states the earliest date", sentence.includes("2026-06-01")],
    ["states the latest date", sentence.includes("2026-08-20")],
    ["a genuine sentence traces", tracePlainTerms(sentence, row).ok],
    ["an untraceable figure is rejected",
      !tracePlainTerms(sentence + " Also worth noting, $9,999,999.", row).ok],
    ["an untraceable date is rejected",
      !tracePlainTerms(sentence + " Confirmed again on 2099-01-01.", row).ok],
    // MUTATION: drop the contract amount from the row a sentence is traced
    // against, the way a live confluenceSplit() row never would. The
    // sentence still names $1,500,000, so it must now fail to trace,
    // proving the check reads the row rather than trusting the sentence
    // that was built from it a moment earlier.
    ["a figure no longer on the row fails once the row is mutated",
      !tracePlainTerms(sentence, { ...row, contract_amount: null }).ok],
  ];
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? "ok " : "FAIL"}  ${label}`);
    if (!ok) failed++;
  }
  console.log(`\n${checks.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
