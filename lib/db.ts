import postgres from "postgres";
import { confluencePlainTerms, tracePlainTerms } from "./plainTerms";

// Read only, always. This connects as signal_store_reader, whose grants
// are SELECT on schema signal_store and nothing on schema public, see
// migration 20260903000010_reader_role.sql in record-scanner's
// money-signal-store/supabase/migrations. Nothing in this codebase issues
// an INSERT, UPDATE or DELETE, and the role itself would refuse one if it
// did. SIGNAL_STORE_READER_URL is a Vercel environment variable, never
// committed; see .env.example for the shape with no real value.
const connectionString = process.env.SIGNAL_STORE_READER_URL;

if (!connectionString) {
  throw new Error(
    "SIGNAL_STORE_READER_URL is not set. This site has nothing to read " +
      "without it and refuses to render a page pretending otherwise."
  );
}

// Supavisor session mode, port 5432, per the migration plan's confirmed
// connection guidance: IPv4 on every tier including free, one dedicated
// backend connection for the life of the session, unlike transaction mode
// on 6543 which can leak session state between unrelated clients.
const sql = postgres(connectionString, {
  ssl: process.env.SIGNAL_STORE_READER_URL?.includes('localhost') ? false : 'require',
  max: 5,
  idle_timeout: 20,
});

// The source types this site has pages for, added 2026-09-21. An allowlist,
// not a blocklist: signal_store gained court_docket_entry rows that day
// (HANDOFF-5, decision C), and every query below that does not already scope
// itself to an entity or a named source type reads through this, so a new
// source type in the store is left off every page, export, feed and the
// search index until someone deliberately adds it here and builds the page it
// needs. Court entries get theirs in STEP 2, under the organisations only
// rule. Entity scoped queries need no filter: a court row has no entity.
export const PUBLISHED_SOURCE_TYPES = ["lobbying", "contract_award"] as const;
export type PublishedSourceType = (typeof PUBLISHED_SOURCE_TYPES)[number];

// A SQL fragment, built only from the constant above, never from input.
function published(alias?: string) {
  const col = alias ? `${alias}.source_type` : "source_type";
  const list = PUBLISHED_SOURCE_TYPES.map((t) => `'${t}'`).join(", ");
  return sql.unsafe(`${col} in (${list})`);
}

export type Entity = {
  id: string;
  canonical_name: string;
  entity_type: string;
};

export type ConfluenceRow = Entity & {
  lobbying_filings: number;
  contract_filings: number;
  lobbying_amount: string | null;
  contract_amount: string | null;
  earliest_occurred: string | null;
  latest_occurred: string | null;
};

export type FilingRow = {
  id: string;
  source_type: "lobbying" | "contract_award";
  natural_key: string;
  subject_raw_string: string;
  canonical_name: string | null;
  entity_id: string | null;
  occurred_date: string | null;
  reported_date: string | null;
  published_date: string | null;
  amount: string | null;
  source_url: string | null;
  retrieved_at: string;
  ingest_origin: "live" | "legacy_backfill" | "historical";
  wayback_status: string;
  wayback_url: string | null;
  // Null while wayback_status is pending or skipped. 'cdx' is a snapshot
  // someone else already made, found in the Wayback CDX index; 'spn2' is
  // one this system triggered itself. Different strength evidence, see
  // the methodology page. wayback_snapshot_at is when the archive was
  // actually made, not when this system found or made it.
  wayback_capture_source: "cdx" | "spn2" | null;
  wayback_snapshot_at: string | null;
  // The fingerprint of the source response this filing was built from,
  // computed once at ingest. Exposed on the page and in the exports as
  // half of the citation unit this site asks people to use, natural_key
  // plus content_hash plus retrieved_at: that triple names a specific
  // observation of a specific filing at a specific moment, which a bare
  // source URL does not, since the source can change under it. See the
  // methodology page on what this hash does and does not prove, and in
  // particular why it cannot be recomputed from the stored copy.
  content_hash: string;
  // Contract awards only, and null on any award this system has not
  // checked yet, which is most of them; see
  // signal_store.contract_award_actions. 1 means the award's current
  // total is a single obligating action, so the figure is a new award
  // amount rather than a cumulative one. Null is not zero: an award in
  // this store has at least one action by definition.
  action_count: number | null;
  // The per action detail, added 2026-09-09 once the transactions endpoint
  // had been probed. All four are null together when that endpoint was not
  // reached, which is a different state from an award with no
  // modifications. latest_action_obligation is the one number here where
  // zero is a real and common answer: an administrative modification
  // obligates nothing, and the first award this was checked against was
  // exactly that, a two action award whose second action incorporated a
  // form and moved no money.
  obligating_action_count: number | null;
  latest_action_date: string | null;
  latest_action_obligation: string | null;
  latest_action_modification: string | null;
};

const FILING_COLUMNS = `
  f.id, f.source_type, f.natural_key, f.subject_raw_string,
  e.canonical_name, f.subject_entity_id as entity_id,
  f.occurred_date, f.reported_date, f.published_date, f.amount,
  f.source_url, f.retrieved_at, f.ingest_origin,
  f.wayback_status, f.wayback_url,
  f.wayback_capture_source, f.wayback_snapshot_at,
  f.content_hash, a.action_count, a.obligating_action_count,
  a.latest_action_date::text as latest_action_date,
  a.latest_action_obligation, a.latest_action_modification
`;

// Every filings query carries this join, added 2026-09-09 with the action
// count. It is a left join and must stay one: an award with no observation
// yet is the ordinary case, not an omission, and an inner join here would
// silently drop most of the store. contract_award_actions_current is one
// row per award, so this cannot multiply rows.
const FILING_ACTIONS_JOIN = `
  left join signal_store.contract_award_actions_current a
         on a.natural_key = f.natural_key
`;

// One entity row per confluence, computed by signal_store.confluence_candidates(),
// the one shared definition of what counts as a confluence: entity
// resolved filings, coalesce(occurred_date, published_date) inside the
// window, at least min_source_types distinct source types. For a contract
// award occurred_date is USAspending's Base Obligation Date and for a
// lobbying filing, which never carries one, the window falls through to
// published_date, the Senate's dt_posted; both checked against the stored
// payloads on 2026-09-10. Read only,
// migration 20260904000001_confluence_candidates.sql. This function used
// to hand roll its own unwindowed, unthresholded join; that was a real
// duplication of money-signal-store/signal_writer.py's own definition,
// found and fixed before the two could quietly disagree with each other,
// which is exactly what they had started to. See the methodology page for
// the window and threshold this site uses, which are the shared
// function's defaults, since this repo has no access to
// money_sources.yaml, the config file that is authoritative for
// money-signal-store/signal_writer.py's own values.
export async function confluences(): Promise<ConfluenceRow[]> {
  return sql<ConfluenceRow[]>`
    select
      e.id, e.canonical_name, e.entity_type,
      count(*) filter (where cc.source_type = 'lobbying')::int as lobbying_filings,
      count(*) filter (where cc.source_type = 'contract_award')::int as contract_filings,
      sum(cc.amount) filter (where cc.source_type = 'lobbying') as lobbying_amount,
      sum(cc.amount) filter (where cc.source_type = 'contract_award') as contract_amount,
      -- ::text for the same reason the ledger casts, see changeLedger():
      -- these two reach confluence.csv, and a JavaScript Date written into
      -- a CSV is not a date any reader can parse.
      min(cc.occurred)::text as earliest_occurred,
      max(cc.occurred)::text as latest_occurred
    from signal_store.confluence_candidates(
           ${CONFLUENCE_WINDOW_DAYS}, ${CONFLUENCE_MIN_SOURCE_TYPES}) cc
    join signal_store.entities e on e.id = cc.entity_id
    group by e.id, e.canonical_name, e.entity_type
    order by count(*) desc, e.canonical_name
  `;
}

// ---------------------------------------------------------------------
// The confluence page's contract split and its by agency table, added
// 2026-09-10 with migration agency_crosswalk_and_confluence_views.
//
// The window is confluence_candidates()'s and nobody else's. Every contract
// row here is one confluence_candidates() already returned, joined back to
// its filing by source_url, which is unique per contract filing and is
// always the award page for the filing's own natural_key (checked
// 2026-09-10 on all 15,940). That join is what keeps this from being a
// second copy of the window rule: it adds the action count to rows the
// shared function selected, and selects none of its own.
//
// signal_store.confluence_by_agency() returns per class COUNTS and no per
// class totals, and the page needs both. confluenceSplit() therefore
// computes the totals here and reconciles itself against both shared
// functions before returning, throwing on any disagreement. A thrown error
// fails the build, and a failed build leaves the last good deploy serving,
// which is this site's established answer to a number it cannot stand
// behind. The cleaner long run fix is two more columns on
// confluence_by_agency(); that is a migration in record-scanner, not a query
// here.
// ---------------------------------------------------------------------

export const CONFLUENCE_WINDOW_DAYS = 90;
const CONFLUENCE_MIN_SOURCE_TYPES = 2;

export type AgencyRow = {
  entity_id: string;
  entity_name: string;
  // Null when the award's own record carries no Awarding Agency. Rendered
  // as not on file, never folded into another row.
  awarding_agency: string | null;
  contract_awards: number;
  contract_total: string | null;
  awards_single_action: number;
  awards_multi_action: number;
  awards_unmeasured: number;
  lobbying_filings_naming_agency: number;
  // The full amount of every filing that names this agency, not a share of
  // it. A filing naming three agencies counts in full on all three rows, so
  // this column must never be summed across agencies.
  lobbying_total_naming_agency: string | null;
};

export async function confluenceByAgency(): Promise<AgencyRow[]> {
  return sql<AgencyRow[]>`
    select entity_id, entity_name, awarding_agency,
           contract_awards::int, contract_total,
           awards_single_action::int, awards_multi_action::int,
           awards_unmeasured::int,
           lobbying_filings_naming_agency::int, lobbying_total_naming_agency
    from signal_store.confluence_by_agency(${CONFLUENCE_WINDOW_DAYS})
    order by lobbying_filings_naming_agency desc, contract_awards desc,
             entity_name, awarding_agency nulls last
  `;
}

export type ConfluenceSplitRow = ConfluenceRow & {
  single_awards: number;
  single_total: string | null;
  multi_awards: number;
  multi_total: string | null;
  unmeasured_awards: number;
};

type ClassTotals = {
  entity_id: string;
  single_awards: number;
  single_total: string | null;
  multi_awards: number;
  multi_total: string | null;
  unmeasured_awards: number;
  unmeasured_total: string | null;
};

// Exact to the cent for the sizes in this store: the largest sum is under a
// billion dollars, well inside a double's integer precision at two decimals.
function sameAmount(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

function addAmounts(values: (string | null)[]): string | null {
  const present = values.filter((v): v is string => v !== null);
  if (present.length === 0) return null;
  return present.reduce((s, v) => s + Number(v), 0).toFixed(2);
}

let splitPromise: Promise<ConfluenceSplitRow[]> | null = null;

export function confluenceSplit(): Promise<ConfluenceSplitRow[]> {
  if (!splitPromise) splitPromise = buildConfluenceSplit();
  return splitPromise;
}

async function buildConfluenceSplit(): Promise<ConfluenceSplitRow[]> {
  const [entities, byAgency, classes] = await Promise.all([
    confluences(),
    confluenceByAgency(),
    sql<ClassTotals[]>`
      select cc.entity_id,
        count(*) filter (where a.action_count = 1)::int as single_awards,
        sum(cc.amount) filter (where a.action_count = 1) as single_total,
        count(*) filter (where a.action_count > 1)::int as multi_awards,
        sum(cc.amount) filter (where a.action_count > 1) as multi_total,
        count(*) filter (where a.action_count is null)::int as unmeasured_awards,
        sum(cc.amount) filter (where a.action_count is null) as unmeasured_total
      from signal_store.confluence_candidates(
             ${CONFLUENCE_WINDOW_DAYS}, ${CONFLUENCE_MIN_SOURCE_TYPES}) cc
      join signal_store.filings_current f
        on f.source_url = cc.source_url and f.source_type = 'contract_award'
      left join signal_store.contract_award_actions_current a
        on a.natural_key = f.natural_key
      where cc.source_type = 'contract_award'
      group by cc.entity_id
    `,
  ]);

  const problems: string[] = [];
  const rows = entities.map((e) => {
    const c = classes.find((x) => x.entity_id === e.id) ?? {
      entity_id: e.id,
      single_awards: 0, single_total: null,
      multi_awards: 0, multi_total: null,
      unmeasured_awards: 0, unmeasured_total: null,
    };
    const agencies = byAgency.filter((a) => a.entity_id === e.id);
    const sum = (k: "contract_awards" | "awards_single_action" | "awards_multi_action" | "awards_unmeasured") =>
      agencies.reduce((s, a) => s + a[k], 0);

    const checks: [string, boolean][] = [
      ["class counts sum to confluence_candidates contract rows",
        c.single_awards + c.multi_awards + c.unmeasured_awards === e.contract_filings],
      ["class totals sum to confluence_candidates contract total",
        sameAmount(addAmounts([c.single_total, c.multi_total, c.unmeasured_total]), e.contract_amount)],
      ["by agency awards sum to confluence_candidates contract rows",
        sum("contract_awards") === e.contract_filings],
      ["by agency totals sum to confluence_candidates contract total",
        sameAmount(addAmounts(agencies.map((a) => a.contract_total)), e.contract_amount)],
      ["single action count agrees with confluence_by_agency",
        sum("awards_single_action") === c.single_awards],
      ["multi action count agrees with confluence_by_agency",
        sum("awards_multi_action") === c.multi_awards],
      ["unmeasured count agrees with confluence_by_agency",
        sum("awards_unmeasured") === c.unmeasured_awards],
    ];
    for (const [what, ok] of checks) {
      if (!ok) problems.push(`${e.canonical_name}: ${what}`);
    }
    return {
      ...e,
      single_awards: c.single_awards,
      single_total: c.single_total,
      multi_awards: c.multi_awards,
      multi_total: c.multi_total,
      unmeasured_awards: c.unmeasured_awards,
    };
  });

  const stray = byAgency.filter((a) => !entities.some((e) => e.id === a.entity_id));
  if (stray.length) {
    problems.push(
      `confluence_by_agency returned entities confluence_candidates did not: ${[...new Set(stray.map((a) => a.entity_name))].join(", ")}`
    );
  }

  if (problems.length) {
    throw new Error(
      "The confluence split does not reconcile to the shared functions, " +
        "refusing to build a page that disagrees with itself:\n  " +
        problems.join("\n  ")
    );
  }
  return rows;
}

// "In plain terms": one machine written sentence per confluence entity,
// mirroring record-scanner's scripts/money_signals.py plain_terms() on the
// internal side, the two repos' one other writer of a confluence sentence.
// confluencePlainTerms and tracePlainTerms live in lib/plainTerms.ts, a
// pure module with no database import, so they can be exercised without
// SIGNAL_STORE_READER_URL or a live connection, which this file throws for
// at import time above. What follows composes them with confluenceSplit()'s
// own rows, already reconciled against signal_store.confluence_candidates()
// with a throw on disagreement, so a figure quoted here is a figure this
// page has already checked once; tracePlainTerms is a second, independent
// check anyway, the same discipline scripts/socialcheck.py applies to a
// social post in record-scanner: a generated claim is only as good as its
// worst untraceable figure, verified by reading the sentence, not assumed
// from the function that wrote it. See the methodology page, "the plain
// language sentence".
export type ConfluencePlainRow = ConfluenceSplitRow & { plain_terms: string };

let plainTermsPromise: Promise<ConfluencePlainRow[]> | null = null;

export function confluencesWithPlainTerms(): Promise<ConfluencePlainRow[]> {
  if (!plainTermsPromise) plainTermsPromise = buildConfluencesWithPlainTerms();
  return plainTermsPromise;
}

async function buildConfluencesWithPlainTerms(): Promise<ConfluencePlainRow[]> {
  const rows = await confluenceSplit();
  const problems: string[] = [];
  const out = rows.map((r) => {
    const sentence = confluencePlainTerms(r, CONFLUENCE_WINDOW_DAYS);
    const { ok, reason } = tracePlainTerms(sentence, r);
    if (!ok) problems.push(`${r.canonical_name}: ${reason}`);
    return { ...r, plain_terms: sentence };
  });
  if (problems.length) {
    throw new Error(
      "A confluence 'in plain terms' sentence does not trace to its own row's " +
        "figures, refusing to build a page that cannot stand behind its own " +
        "claim:\n  " + problems.join("\n  ")
    );
  }
  return out;
}

// What the by agency table cannot show, counted so the page can say so.
// Every lobbying filing inside the window for an entity in the confluence
// set, classified by which kind of government entity it names. A filing
// can name more than one kind, so the three naming counts overlap and are
// not meant to sum to the total; names_none is exclusive of the others.
export type LobbyingReach = {
  filings: number;
  names_counterpart: number;
  names_no_counterpart: number;
  names_unmapped: number;
  names_none: number;
};

export async function confluenceLobbyingReach(): Promise<LobbyingReach> {
  const [row] = await sql<LobbyingReach[]>`
    with c as (
      select distinct entity_id
      from signal_store.confluence_candidates(
             ${CONFLUENCE_WINDOW_DAYS}, ${CONFLUENCE_MIN_SOURCE_TYPES})
    ),
    lob as (
      select f.id
      from signal_store.filings_current f
      where f.source_type = 'lobbying'
        and f.subject_entity_id in (select entity_id from c)
        -- ::int or Postgres reads an untyped parameter here as a date and
        -- the subtraction as date minus date, which is an integer.
        and f.published_date >= current_date - ${CONFLUENCE_WINDOW_DAYS}::int
    ),
    per as (
      select l.id,
        count(g.lda_entity_id) as named,
        bool_or(x.lda_entity_id is not null and x.usa_awarding_agency is not null) as counterpart,
        bool_or(x.lda_entity_id is not null and x.usa_awarding_agency is null) as no_counterpart,
        bool_or(g.lda_entity_id is not null and x.lda_entity_id is null) as unmapped
      from lob l
      left join signal_store.lobbying_agency_activity g on g.filing_id = l.id
      left join signal_store.agency_crosswalk x on x.lda_entity_id = g.lda_entity_id
      group by l.id
    )
    select count(*)::int as filings,
      count(*) filter (where counterpart)::int as names_counterpart,
      count(*) filter (where no_counterpart)::int as names_no_counterpart,
      count(*) filter (where unmapped)::int as names_unmapped,
      count(*) filter (where named = 0)::int as names_none
    from per
  `;
  return row;
}

// The crosswalk's own shape, for the methodology page. unmapped_ids counts
// LDA government entity ids that appear on a filing in this store and have
// no crosswalk row at all, which is a different state from a row whose
// usa_awarding_agency is null on purpose.
export async function crosswalkCounts() {
  const [row] = await sql<
    { rows: number; mapped: number; no_counterpart: number; unmapped_ids: number; unmapped_filings: number }[]
  >`
    select
      (select count(*)::int from signal_store.agency_crosswalk) as rows,
      (select count(*)::int from signal_store.agency_crosswalk
        where usa_awarding_agency is not null) as mapped,
      (select count(*)::int from signal_store.agency_crosswalk
        where usa_awarding_agency is null) as no_counterpart,
      (select count(distinct g.lda_entity_id)::int
         from signal_store.lobbying_agency_activity g
        where not exists (select 1 from signal_store.agency_crosswalk x
                          where x.lda_entity_id = g.lda_entity_id)) as unmapped_ids,
      (select count(distinct g.filing_id)::int
         from signal_store.lobbying_agency_activity g
        where not exists (select 1 from signal_store.agency_crosswalk x
                          where x.lda_entity_id = g.lda_entity_id)) as unmapped_filings
  `;
  return row;
}

// Action coverage, read at build time so the methodology page never states
// a number the store no longer holds. confluence_* is the confluence set as
// confluence_by_agency() counts it; store_* is every contract award on file.
export async function actionCoverage() {
  const [row] = await sql<
    { confluence_awards: number; confluence_measured: number; store_awards: number; store_measured: number }[]
  >`
    select
      (select coalesce(sum(contract_awards), 0)::int
         from signal_store.confluence_by_agency(${CONFLUENCE_WINDOW_DAYS})) as confluence_awards,
      (select coalesce(sum(awards_single_action + awards_multi_action), 0)::int
         from signal_store.confluence_by_agency(${CONFLUENCE_WINDOW_DAYS})) as confluence_measured,
      (select count(*)::int from signal_store.filings_current
        where source_type = 'contract_award') as store_awards,
      (select count(*)::int from signal_store.filings_current f
        where f.source_type = 'contract_award'
          and exists (select 1 from signal_store.contract_award_actions_current a
                      where a.natural_key = f.natural_key
                        and a.action_count is not null)) as store_measured
  `;
  return row;
}

// ---------------------------------------------------------------------
// Entity pages: the year table and the agencies block, added 2026-09-10.
// ---------------------------------------------------------------------

export type YearRow = {
  // Null for filings with neither an occurred nor a published date, which in
  // this store can only be a contract award from the one time backfill.
  activity_year: number | null;
  lobbying_filings: number;
  lobbying_total: string | null;
  contract_filings: number;
  contract_total: string | null;
};

// entity_year_rollup also carries backfilled_undated, and it is not read
// here on purpose: it counts every legacy_backfill row in the year's group,
// and the backfill's lobbying filings all carry a posted date, so on
// 2026-09-10 it was non zero in dated years for every large entity while
// not one undated row existed. The undated row is the row whose year is
// null, and that is the only test this page uses.
export async function entityYears(canonicalName: string): Promise<YearRow[]> {
  return sql<YearRow[]>`
    select activity_year,
           lobbying_filings::int, lobbying_total,
           contract_filings::int, contract_total
    from signal_store.entity_year_rollup
    where canonical_name = ${canonicalName}
    order by activity_year desc nulls last
  `;
}

// The first calendar year the store holds any lobbying filing for, across
// every entity. Read rather than typed in: on 2026-09-10 it was 2024, the
// historical sweep's reach, and a year before it is a year this system
// never looked at, so an entity's lobbying count for it is unmeasured, not
// zero. Contract awards reach much further back for a different reason,
// see EntitySummary.
export async function lobbyingFirstYear(): Promise<number | null> {
  const [row] = await sql<{ y: number | null }[]>`
    select min(extract(year from published_date))::int as y
    from signal_store.filings_current
    where source_type = 'lobbying'
  `;
  return row.y;
}

export type EntityAgencyRow = {
  // Null with kind 'agency' means the award record names no Awarding
  // Agency. Rows of kind 'no_counterpart' and 'unmapped' are lobbying only.
  agency: string | null;
  kind: "agency" | "no_counterpart" | "unmapped";
  lobbying_filings: number;
  contract_awards: number;
  contract_total: string | null;
};

// One entity, the current calendar year, both halves on one key. The
// entity level version of the confluence page's by agency table, except
// that an agency named only in lobbying is a row here too, since this block
// is not driven by the contract side.
export async function entityAgencies(canonicalName: string): Promise<{
  year: number;
  lobbying_filings: number;
  rows: EntityAgencyRow[];
}> {
  const [[meta], rows] = await Promise.all([
    sql<{ year: number; lobbying_filings: number }[]>`
      select extract(year from current_date)::int as year,
        (select count(*)::int
           from signal_store.filings_current f
           join signal_store.entities e on e.id = f.subject_entity_id
          where e.canonical_name = ${canonicalName}
            and f.source_type = 'lobbying'
            and extract(year from f.published_date) = extract(year from current_date)
        ) as lobbying_filings
    `,
    sql<EntityAgencyRow[]>`
      with ent as (
        select id from signal_store.entities where canonical_name = ${canonicalName}
      ),
      lob as (
        select
          case when x.lda_entity_id is null then 'unmapped'
               when x.usa_awarding_agency is null then 'no_counterpart'
               else 'agency' end as kind,
          x.usa_awarding_agency as agency,
          count(distinct g.filing_id)::int as n
        from signal_store.lobbying_agency_activity g
        left join signal_store.agency_crosswalk x on x.lda_entity_id = g.lda_entity_id
        where g.subject_entity_id in (select id from ent)
          and extract(year from g.published_date) = extract(year from current_date)
        group by 1, 2
      ),
      con as (
        select f.raw_payload->>'Awarding Agency' as agency,
               count(*)::int as n, sum(f.amount) as total
        from signal_store.filings_current f
        where f.subject_entity_id in (select id from ent)
          and f.source_type = 'contract_award'
          and extract(year from coalesce(f.occurred_date, f.published_date))
              = extract(year from current_date)
        group by 1
      )
      select coalesce(l.agency, c.agency) as agency,
             coalesce(l.kind, 'agency') as kind,
             coalesce(l.n, 0)::int as lobbying_filings,
             coalesce(c.n, 0)::int as contract_awards,
             c.total as contract_total
      from (select * from lob where kind = 'agency') l
      full join con c on c.agency = l.agency
      union all
      select null, kind, n, 0, null from lob where kind <> 'agency'
      order by kind, lobbying_filings desc, contract_awards desc, agency nulls last
    `,
  ]);
  return { year: meta.year, lobbying_filings: meta.lobbying_filings, rows };
}

// ---------------------------------------------------------------------
// The watchlist, its stated reasons and the activity baseline, added
// 2026-09-11 with migration watch_reasons_baseline_and_novelty.
// ---------------------------------------------------------------------

export const BASELINE_WINDOW_DAYS = 90;

export type WatchReason = {
  reason: string;
  source_article_url: string | null;
  source_series: string | null;
  added_on: string | null;
};

export type Baseline = {
  window_lobbying_filings: number;
  window_contract_awards: number;
  baseline_days: number;
  baseline_lobbying_filings: number;
  baseline_contract_awards: number;
  baseline_contract_awards_per_window: string;
  baseline_lobbying_filings_per_window: string;
  // Not from entity_activity_baseline(): Department of Defense awards in the
  // same two spans, counted here so a reader can see why a window can sit far
  // below its baseline. See defenseCoverage().
  window_defense_awards: number;
  baseline_defense_awards: number;
};

export type WatchlistRow = {
  entity_id: string;
  canonical_name: string;
  entity_type: string;
  // Every active reason row, oldest first. Usually one; the table allows
  // more, and an entity with two is still one row on the page.
  reasons: WatchReason[];
  // Null when entity_activity_baseline() returned no row for the entity,
  // which it does only for an entity with no dated filing in either span.
  baseline: Baseline | null;
};

let watchlistPromise: Promise<WatchlistRow[]> | null = null;

export function watchlist(): Promise<WatchlistRow[]> {
  if (!watchlistPromise) watchlistPromise = buildWatchlist();
  return watchlistPromise;
}

async function buildWatchlist(): Promise<WatchlistRow[]> {
  const w = BASELINE_WINDOW_DAYS;
  const [entities, reasons, baselines, defense] = await Promise.all([
    sql<{ id: string; canonical_name: string; entity_type: string }[]>`
      select id, canonical_name, entity_type
      from signal_store.entities
      order by canonical_name
    `,
    sql<(WatchReason & { entity_id: string })[]>`
      select entity_id, reason, source_article_url, source_series,
             added_on::text as added_on
      from signal_store.entity_watch_reasons
      where retired_on is null
      order by added_on nulls last, id
    `,
    sql<(Omit<Baseline, "window_defense_awards" | "baseline_defense_awards"> & { entity_id: string })[]>`
      select entity_id,
             window_lobbying_filings::int, window_contract_awards::int,
             baseline_days, baseline_lobbying_filings::int,
             baseline_contract_awards::int,
             baseline_contract_awards_per_window::text,
             baseline_lobbying_filings_per_window::text
      from signal_store.entity_activity_baseline(${w})
    `,
    // The same two spans entity_activity_baseline() uses, contract awards
    // only: the window is the last w days by coalesce(occurred_date,
    // published_date), the baseline the 365 days before that. Totals are
    // selected alongside the Defense counts so they can be checked against
    // the function's own, below.
    sql<{ entity_id: string; window_all: number; window_defense: number; baseline_all: number; baseline_defense: number }[]>`
      select f.subject_entity_id as entity_id,
        count(*) filter (where d >= current_date - ${w}::int)::int as window_all,
        count(*) filter (where d >= current_date - ${w}::int and defense)::int as window_defense,
        count(*) filter (where d >= current_date - ${w}::int - 365 and d < current_date - ${w}::int)::int as baseline_all,
        count(*) filter (where d >= current_date - ${w}::int - 365 and d < current_date - ${w}::int and defense)::int as baseline_defense
      from (
        select subject_entity_id, coalesce(occurred_date, published_date) as d,
               raw_payload->>'Awarding Agency' = 'Department of Defense' as defense
        from signal_store.filings_current
        where source_type = 'contract_award' and subject_entity_id is not null
          and coalesce(occurred_date, published_date) is not null
      ) f
      group by 1
    `,
  ]);

  const problems: string[] = [];
  const rows = entities.map((e) => {
    const b = baselines.find((x) => x.entity_id === e.id);
    const d = defense.find((x) => x.entity_id === e.id);
    if (b && d && (d.window_all !== b.window_contract_awards || d.baseline_all !== b.baseline_contract_awards)) {
      problems.push(
        `${e.canonical_name}: Defense split counts ${d.window_all}/${d.baseline_all} awards, ` +
          `entity_activity_baseline() ${b.window_contract_awards}/${b.baseline_contract_awards}`
      );
    }
    return {
      entity_id: e.id,
      canonical_name: e.canonical_name,
      entity_type: e.entity_type,
      reasons: reasons
        .filter((r) => r.entity_id === e.id)
        .map(({ reason, source_article_url, source_series, added_on }) => ({
          reason, source_article_url, source_series, added_on,
        })),
      baseline: b
        ? {
            ...b,
            window_defense_awards: d?.window_defense ?? 0,
            baseline_defense_awards: d?.baseline_defense ?? 0,
          }
        : null,
    };
  });

  const ids = new Set(rows.map((r) => r.entity_id));
  if (ids.size !== entities.length) problems.push("an entity appears more than once");
  for (const r of reasons) {
    if (!ids.has(r.entity_id)) problems.push(`a watch reason names an entity not in entities: ${r.entity_id}`);
  }
  if (problems.length) {
    throw new Error(
      "The watchlist does not reconcile, refusing to build it:\n  " + problems.join("\n  ")
    );
  }
  return rows;
}

// Why a baseline and its window can disagree for reasons that have nothing
// to do with an entity, read from the store at build time so the copy never
// states a date the store has moved past. Found 2026-09-11: USAspending
// publishes Department of Defense contract data on a 90 day delay, and the
// store held no Defense award obligated after 2026-06, for any entity,
// while civilian awards continued month by month.
// The source for the delay: USAspending's own About the Data document,
// read 2026-09-11, "Publication of Department of Defense (DOD) and U.S. Army
// Corps of Engineers (USACE) data in FPDS is delayed 90 days."
export const DEFENSE_DELAY_SOURCE = "https://www.usaspending.gov/data/about-the-data-download.pdf";

// baseline_september is also here because the baseline year always holds
// one federal fiscal year end and a 90 day window may not: on 2026-09-11,
// September 2025 alone was the largest month in the baseline year.
export async function defenseCoverage() {
  const w = BASELINE_WINDOW_DAYS;
  const [row] = await sql<
    {
      latest_defense_obligation: string | null;
      window_defense: number;
      window_civilian: number;
      baseline_awards: number;
      baseline_september: number;
    }[]
  >`
    select
      max(occurred_date) filter (where raw_payload->>'Awarding Agency' = 'Department of Defense')::text
        as latest_defense_obligation,
      count(*) filter (where raw_payload->>'Awarding Agency' = 'Department of Defense'
                         and coalesce(occurred_date, published_date) >= current_date - ${w}::int)::int
        as window_defense,
      count(*) filter (where raw_payload->>'Awarding Agency' is distinct from 'Department of Defense'
                         and coalesce(occurred_date, published_date) >= current_date - ${w}::int)::int
        as window_civilian,
      count(*) filter (where coalesce(occurred_date, published_date) >= current_date - ${w}::int - 365
                         and coalesce(occurred_date, published_date) < current_date - ${w}::int)::int
        as baseline_awards,
      count(*) filter (where coalesce(occurred_date, published_date) >= current_date - ${w}::int - 365
                         and coalesce(occurred_date, published_date) < current_date - ${w}::int
                         and extract(month from coalesce(occurred_date, published_date)) = 9)::int
        as baseline_september
    from signal_store.filings_current
    where source_type = 'contract_award' and subject_entity_id is not null
  `;
  return row;
}

// ---------------------------------------------------------------------
// Per filing permalinks, added 2026-09-11.
//
// About 18,000 pages, one per filing, so nothing here may query per page.
// Every version of every filing, every award's actions and every first
// sighting's novelty are read once per build worker and grouped by key in
// memory; a page is then a lookup. raw_payload is not selected, for the
// reason allFilings() gives.
// ---------------------------------------------------------------------

export type FilingVersion = {
  id: string;
  version: number;
  amount: string | null;
  occurred_date: string | null;
  published_date: string | null;
  retrieved_at: string;
  ingest_origin: IngestOrigin;
  content_hash: string;
  source_url: string | null;
};

export type AwardAction = {
  action_date: string | null;
  modification_number: string | null;
  action_type: string | null;
  federal_action_obligation: string | null;
  description: string | null;
};

export type FilingRecord = {
  natural_key: string;
  source_type: "lobbying" | "contract_award";
  subject_raw_string: string;
  entity_name: string | null;
  // Current version last; every version this store holds, oldest first.
  versions: FilingVersion[];
  novelty: Novelty | null;
  days_public_before_observed: number | null;
  wayback_status: string;
  wayback_url: string | null;
  wayback_capture_source: "cdx" | "spn2" | null;
  wayback_snapshot_at: string | null;
  actions: {
    action_count: number | null;
    obligating_action_count: number | null;
    latest_action_date: string | null;
    latest_action_obligation: string | null;
    latest_action_modification: string | null;
    total_obligation: string | null;
    retrieved_at: string;
    list: AwardAction[] | null;
  } | null;
};

let recordsPromise: Promise<Map<string, FilingRecord>> | null = null;

export function filingRecords(): Promise<Map<string, FilingRecord>> {
  if (!recordsPromise) recordsPromise = loadFilingRecords();
  return recordsPromise;
}

async function loadFilingRecords(): Promise<Map<string, FilingRecord>> {
  const [current, versions, actions] = await Promise.all([
    sql<
      {
        natural_key: string; source_type: "lobbying" | "contract_award";
        subject_raw_string: string; entity_name: string | null;
        wayback_status: string; wayback_url: string | null;
        wayback_capture_source: "cdx" | "spn2" | null; wayback_snapshot_at: string | null;
        novelty: Novelty | null; days_public_before_observed: number | null;
      }[]
    >`
      select f.natural_key, f.source_type, f.subject_raw_string,
             e.canonical_name as entity_name,
             f.wayback_status, f.wayback_url, f.wayback_capture_source,
             f.wayback_snapshot_at::text as wayback_snapshot_at,
             n.novelty, n.days_public_before_observed
      from signal_store.filings_current f
      left join signal_store.entities e on e.id = f.subject_entity_id
      left join signal_store.filings v1
             on v1.natural_key = f.natural_key and v1.version = 1
      left join signal_store.first_sighting_novelty n on n.filing_id = v1.id
      where ${published("f")}
    `,
    sql<(FilingVersion & { natural_key: string })[]>`
      select f.natural_key, f.id, f.version, f.amount,
             f.occurred_date::text as occurred_date,
             f.published_date::text as published_date,
             to_char(f.retrieved_at at time zone 'utc',
                     'YYYY-MM-DD"T"HH24:MI:SS"Z"') as retrieved_at,
             f.ingest_origin, f.content_hash, f.source_url
      from signal_store.filings f
      where ${published("f")}
      order by f.natural_key, f.version
    `,
    sql<
      {
        natural_key: string; action_count: number | null; obligating_action_count: number | null;
        latest_action_date: string | null; latest_action_obligation: string | null;
        latest_action_modification: string | null; total_obligation: string | null;
        retrieved_at: string; list: AwardAction[] | null;
      }[]
    >`
      select a.natural_key, a.action_count, a.obligating_action_count,
             a.latest_action_date::text as latest_action_date,
             a.latest_action_obligation, a.latest_action_modification,
             a.total_obligation,
             to_char(a.retrieved_at at time zone 'utc',
                     'YYYY-MM-DD"T"HH24:MI:SS"Z"') as retrieved_at,
             -- Only the five fields a reader needs, not the stored payload.
             case when a.actions is null then null else (
               select jsonb_agg(jsonb_build_object(
                        'action_date', x->>'action_date',
                        'modification_number', x->>'modification_number',
                        'action_type', coalesce(x->>'action_type_description', x->>'action_type'),
                        'federal_action_obligation', x->>'federal_action_obligation',
                        'description', x->>'description')
                      order by x->>'action_date' desc, x->>'modification_number' desc)
               from jsonb_array_elements(a.actions) x
             ) end as list
      from signal_store.contract_award_actions_current a
    `,
  ]);

  const byKey = new Map<string, FilingVersion[]>();
  for (const { natural_key, ...v } of versions) {
    const list = byKey.get(natural_key);
    if (list) list.push(v);
    else byKey.set(natural_key, [v]);
  }
  const actionsByKey = new Map(actions.map(({ natural_key, ...a }) => [natural_key, a]));

  const out = new Map<string, FilingRecord>();
  for (const c of current) {
    out.set(c.natural_key, {
      ...c,
      versions: byKey.get(c.natural_key) ?? [],
      actions: c.source_type === "contract_award" ? (actionsByKey.get(c.natural_key) ?? null) : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// The alias list, published at /aliases on 2026-09-10.
// ---------------------------------------------------------------------

export type AliasRow = {
  canonical_name: string;
  alias: string;
  normalized_alias: string;
  source: string;
};

export async function aliasList(): Promise<AliasRow[]> {
  return sql<AliasRow[]>`
    select e.canonical_name, a.alias, a.normalized_alias, a.source
    from signal_store.entity_aliases a
    join signal_store.entities e on e.id = a.entity_id
    order by e.canonical_name, a.normalized_alias
  `;
}

export async function entitiesWithoutAliases(): Promise<string[]> {
  const rows = await sql<{ canonical_name: string }[]>`
    select e.canonical_name
    from signal_store.entities e
    where not exists (select 1 from signal_store.entity_aliases a where a.entity_id = e.id)
      and exists (select 1 from signal_store.filings_current f where f.subject_entity_id = e.id)
    order by e.canonical_name
  `;
  return rows.map((r) => r.canonical_name);
}

// All three origins, not two. The live and backfill counts have been on
// the page since launch and the third was left out, which was survivable
// while this sentence sat under a confluence table and stopped being so
// when it moved to the front page: 18,252 filings, of which 102 live and
// 478 backfilled, silently drops 17,672 rows and invites the reader to
// wonder what the other 97 percent are. They are the historical sweep, and
// the front page now says so.
export async function storeCounts() {
  const [row] = await sql<
    { total: string; legacy: string; live: string; historical: string }[]
  >`
    select
      count(*)::text as total,
      count(*) filter (where ingest_origin = 'legacy_backfill')::text as legacy,
      count(*) filter (where ingest_origin = 'live')::text as live,
      count(*) filter (where ingest_origin = 'historical')::text as historical
    from signal_store.filings_current
    where ${published()}
  `;
  return row;
}

// ---------------------------------------------------------------------
// The filings pages: a directory rather than one table, added 2026-09-05
// after the historical sweep took filings_current from 594 rows to
// 18,000+ and a single unpaginated page turned into a ~20 MB static
// artifact that failed to build on Vercel while an equivalent local build
// succeeded, almost certainly a memory/output ceiling specific to
// Vercel's build container rather than anything wrong with the query,
// which itself runs in well under a second either way. See README.md for
// why this stays a static, build time queried site rather than moving to
// a runtime query: the value on a free tier project is that visitor
// traffic never reaches the database at all, only this build does, once
// a day.
// ---------------------------------------------------------------------

// Defined in lib/paths.ts since 2026-09-11, so client components can build
// the same URLs without importing this module; re-exported here so every
// existing caller keeps working.
import { slug } from "./paths";
export { slug };

// The four entities whose own filing count is large enough that even a
// single page per entity would recreate the problem this exists to fix.
// Chosen 2026-09-05 by real row count, not a guess: at the time, every
// other entity's total was under 800 rows, comparable to the 594 row
// scale the site had before the sweep and never had a problem at.
export const LARGE_ENTITIES = [
  "Leidos",
  "General Dynamics Information Technology",
  "Booz Allen Hamilton",
  "Deloitte",
];

// Rows per generated page, upper bound. Chosen from the ~1.1 KB/row rate
// measured on the single 20 MB, 18,237 row page this replaces: 1000 rows
// is a little over 1 MB, comfortably under whatever ceiling the old page
// hit. A year with more than this many rows for a large entity is split
// further into numbered chunks within that year; every other page, large
// entity or small, is under this bound in one piece.
const CHUNK_SIZE = 1000;

export type EntityDirectoryRow = {
  canonical_name: string;
  slug: string;
  total: number;
  large: boolean;
};

// The filings landing page's directory: every entity that has at least
// one filing on file, with its own count, so a reader can see the shape
// of the record before picking an entity rather than getting the whole
// thing at once.
// Memoized per build worker since 2026-09-11. Every entity, period and
// filing page calls this, and with a page per filing that is eighteen
// thousand calls; unmemoized it would be as many queries against a pool
// that allows fifteen clients.
let directoryPromise: Promise<EntityDirectoryRow[]> | null = null;

export function entityDirectory(): Promise<EntityDirectoryRow[]> {
  if (!directoryPromise) directoryPromise = queryEntityDirectory();
  return directoryPromise;
}

async function queryEntityDirectory(): Promise<EntityDirectoryRow[]> {
  const rows = await sql<{ canonical_name: string; total: number }[]>`
    select e.canonical_name, count(*)::int as total
    from signal_store.filings_current f
    join signal_store.entities e on e.id = f.subject_entity_id
    group by e.canonical_name
    order by e.canonical_name
  `;
  return rows.map((r) => ({
    ...r,
    slug: slug(r.canonical_name),
    large: LARGE_ENTITIES.includes(r.canonical_name),
  }));
}

export async function unmatchedCount(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from signal_store.filings_current
    where subject_entity_id is null and ${published()}
  `;
  return row.n;
}

// The supplementary "most recent across every entity" view a reader
// arriving cold actually wants, per instruction: bounded on purpose, not
// a second copy of the whole table. 300 is comfortably under CHUNK_SIZE's
// own size budget and covers roughly the last few weeks of ingest at this
// store's current pace.
const RECENT_LIMIT = 300;

export async function recentFilings(): Promise<FilingRow[]> {
  return sql<FilingRow[]>`
    select ${sql.unsafe(FILING_COLUMNS)}
    from signal_store.filings_current f
    left join signal_store.entities e on e.id = f.subject_entity_id
    ${sql.unsafe(FILING_ACTIONS_JOIN)}
    where ${published("f")}
    order by f.retrieved_at desc
    limit ${RECENT_LIMIT}
  `;
}

// The review queue's own visibility on this site: every filing that
// could not be resolved to a watchlist entity, exactly as
// FilingsTable always rendered it inline, now with a page of its own
// rather than a section of one giant table. Bounded the same way recent
// activity is, most recent first; the raw string and the source link are
// what matters here; there is no entity to browse this by, so no further
// split applies.
export async function unmatchedFilings(): Promise<FilingRow[]> {
  return sql<FilingRow[]>`
    select ${sql.unsafe(FILING_COLUMNS)}
    from signal_store.filings_current f
    left join signal_store.entities e on e.id = f.subject_entity_id
    ${sql.unsafe(FILING_ACTIONS_JOIN)}
    where f.subject_entity_id is null and ${published("f")}
    order by f.retrieved_at desc
    limit ${RECENT_LIMIT}
  `;
}

// Every filing for one of the twenty entities small enough not to need a
// further split. Callers are responsible for checking the entity is not
// in LARGE_ENTITIES first; generateStaticParams only ever calls this for
// entities it already excluded from the large set.
export async function filingsForEntity(canonicalName: string): Promise<FilingRow[]> {
  return sql<FilingRow[]>`
    select ${sql.unsafe(FILING_COLUMNS)}
    from signal_store.filings_current f
    join signal_store.entities e on e.id = f.subject_entity_id
    ${sql.unsafe(FILING_ACTIONS_JOIN)}
    where e.canonical_name = ${canonicalName}
    order by f.retrieved_at desc
  `;
}

// year is null for the pre-2024 bucket: date_type action_date on the
// historical sweep means occurred_date can be a modification's original
// obligation date, decades before the action that surfaced it, and a
// contractor with thirty years of federal work has a handful of rows in
// most of them. One page per such year, most holding one or two rows,
// was the same shape of problem in miniature and also what pushed one
// build past Supavisor's session mode pool_size during static
// generation, each page opening its own connection. Bucketed together
// once, since nothing before the watchlist's own 2024-11-01 sweep start
// needs entity-page-per-year granularity to be browsable.
const BUCKET_BEFORE_YEAR = 2024;

export type Period = {
  label: string;
  year: number | null;
  chunk: number;
  count: number;
};

// For one of the four large entities: how many pages its own history
// needs, and how big each one is. A year with at most CHUNK_SIZE rows is
// one page, labelled by the year alone; a year over that is split into
// numbered chunks, "<year>-<n>", each independently bounded. Computed
// from a single grouped count, never by fetching the rows themselves:
// generateStaticParams needs to know how many pages to build, not what is
// on them yet.
// Memoized per build worker for the same reason as entityDirectory().
const periodCache = new Map<string, Promise<Period[]>>();

export function entityPeriods(canonicalName: string): Promise<Period[]> {
  let p = periodCache.get(canonicalName);
  if (!p) {
    p = queryEntityPeriods(canonicalName);
    periodCache.set(canonicalName, p);
  }
  return p;
}

async function queryEntityPeriods(canonicalName: string): Promise<Period[]> {
  const rows = await sql<{ year: number; n: number }[]>`
    select
      extract(year from coalesce(f.occurred_date, f.published_date, f.retrieved_at))::int as year,
      count(*)::int as n
    from signal_store.filings_current f
    join signal_store.entities e on e.id = f.subject_entity_id
    where e.canonical_name = ${canonicalName}
    group by 1
    order by 1 desc
  `;

  const recent = rows.filter((r) => r.year >= BUCKET_BEFORE_YEAR);
  const earlier = rows.filter((r) => r.year < BUCKET_BEFORE_YEAR);
  const earlierTotal = earlier.reduce((sum, r) => sum + r.n, 0);

  const periods: Period[] = [];
  const pushYear = (year: number | null, n: number, label: string) => {
    const chunks = Math.max(1, Math.ceil(n / CHUNK_SIZE));
    if (chunks === 1) {
      periods.push({ label, year, chunk: 1, count: n });
      return;
    }
    // Even split across the year's own chunk count, not CHUNK_SIZE sized
    // chunks with a small remainder tacked onto the last one: a 4137 row
    // year at CHUNK_SIZE 1000 becomes 5 chunks of ~827 rather than four
    // full 1000s and one nearly-empty 137.
    const perChunk = Math.ceil(n / chunks);
    for (let c = 1; c <= chunks; c++) {
      periods.push({ label: `${label}-${c}`, year, chunk: c, count: perChunk });
    }
  };

  for (const { year, n } of recent) pushYear(year, n, String(year));
  if (earlierTotal > 0) pushYear(null, earlierTotal, `pre-${BUCKET_BEFORE_YEAR}`);

  return periods;
}

// Rows for one period of one large entity. year is a real calendar year
// for a per-year period, or null for the pre-2024 bucket (see
// BUCKET_BEFORE_YEAR above). chunkIndex and chunksInYear (both 1-indexed)
// select a slice within a period large enough to have been split,
// ordered the same stable way every time so the same chunk index always
// means the same rows across a rebuild that added nothing to that
// period.
export async function filingsForPeriod(
  canonicalName: string,
  year: number | null,
  chunkIndex: number,
  chunksInYear: number
): Promise<FilingRow[]> {
  const yearFilter =
    year === null
      ? sql`extract(year from coalesce(f.occurred_date, f.published_date, f.retrieved_at))::int < ${BUCKET_BEFORE_YEAR}`
      : sql`extract(year from coalesce(f.occurred_date, f.published_date, f.retrieved_at))::int = ${year}`;

  if (chunksInYear <= 1) {
    return sql<FilingRow[]>`
      select ${sql.unsafe(FILING_COLUMNS)}
      from signal_store.filings_current f
      join signal_store.entities e on e.id = f.subject_entity_id
      ${sql.unsafe(FILING_ACTIONS_JOIN)}
      where e.canonical_name = ${canonicalName} and ${yearFilter}
      order by f.retrieved_at desc, f.id
    `;
  }
  const total = await sql<{ n: number }[]>`
    select count(*)::int as n
    from signal_store.filings_current f
    join signal_store.entities e on e.id = f.subject_entity_id
    where e.canonical_name = ${canonicalName} and ${yearFilter}
  `;
  const perChunk = Math.ceil(total[0].n / chunksInYear);
  const offset = (chunkIndex - 1) * perChunk;
  return sql<FilingRow[]>`
    select ${sql.unsafe(FILING_COLUMNS)}
    from signal_store.filings_current f
    join signal_store.entities e on e.id = f.subject_entity_id
    ${sql.unsafe(FILING_ACTIONS_JOIN)}
    where e.canonical_name = ${canonicalName} and ${yearFilter}
    order by f.retrieved_at desc, f.id
    limit ${perChunk} offset ${offset}
  `;
}

// ---------------------------------------------------------------------
// The change ledger, added 2026-09-09. The front page's own data.
//
// Both of these are thin wrappers over signal_store.change_ledger_days()
// and signal_store.change_ledger(), migration
// 20260909000000_change_ledger.sql, for the same reason confluences()
// calls a shared function rather than hand rolling a join: the definition
// of what counts as a change belongs in one place, next to the append only
// table it is derived from, not in a page component in a different
// repository. Read that migration for what the two functions include and
// exclude, and why a day carrying a historical sweep is large by
// construction rather than a day of unusual federal activity.
// ---------------------------------------------------------------------

export type IngestOrigin = "live" | "historical" | "legacy_backfill";

export type ChangeDay = {
  observed_date: string;
  ingest_origin: IngestOrigin;
  first_seen: number;
  amendments: number;
  amendments_with_amount_change: number;
  net_amount_change: string;
};

// first_sighting_novelty, migration watch_reasons_baseline_and_novelty,
// 2026-09-11. Only a first sighting has one: it compares the day this
// system first saw a filing with the day the source says it became public,
// with a seven day tolerance. An amendment is not a first sighting and its
// novelty is null.
export type Novelty = "new_to_record" | "new_to_watchlist" | "undated";

export type ChangeEvent = {
  observed_date: string;
  filing_id: string;
  natural_key: string;
  version: number;
  event: "first_seen" | "amended";
  source_type: "lobbying" | "contract_award";
  entity_id: string | null;
  entity_name: string | null;
  subject_raw_string: string;
  amount: string | null;
  previous_amount: string | null;
  amount_delta: string | null;
  occurred_date: string | null;
  published_date: string | null;
  source_url: string | null;
  ingest_origin: IngestOrigin;
  novelty: Novelty | null;
  days_public_before_observed: number | null;
  // contract_award_actions_current, null together when the award has not
  // been measured. action_measured is the one to test: it is true when an
  // observation row exists, which is a different fact from its fields being
  // non null.
  action_measured: boolean;
  latest_action_date: string | null;
  latest_action_obligation: string | null;
  latest_action_modification: string | null;
};

// The window the front page reports on. 30 days rather than 14 because the
// store's own live day is small, one to a few filings, and a fortnight of
// those can be a table with four rows in it; a month is enough to show
// shape without becoming a second filings page.
export const LEDGER_DAYS = 30;

export async function changeLedgerDays(
  days: number = LEDGER_DAYS
): Promise<ChangeDay[]> {
  // Columns named out rather than select *, purely to cast the date. See
  // changeLedger() below for why that matters.
  //
  // change_ledger_days() counts every source type and returns no source_type
  // column, so rows outside PUBLISHED_SOURCE_TYPES are counted here, over the
  // same window and the same day and origin grouping, and taken off. Their
  // amendments are subtracted with their amounts, so every column stays
  // about published filings only, and the novelty cross check on the front
  // page, which counts published first sightings, still compares like with
  // like. A day left with nothing is dropped, as the function would drop it.
  const [all, outside] = await Promise.all([
    sql<ChangeDay[]>`
      select observed_date::text as observed_date, ingest_origin, first_seen,
             amendments, amendments_with_amount_change, net_amount_change
      from signal_store.change_ledger_days(${days})
    `,
    sql<ChangeDay[]>`
      with versioned as (
        select f.retrieved_at, f.ingest_origin, f.version, f.amount,
               f.source_type,
               lag(f.amount) over (partition by f.natural_key
                                   order by f.version) as previous_amount
        from signal_store.filings f
        where f.retrieved_at >= now() - (${days}::int * interval '1 day')
      )
      select (v.retrieved_at at time zone 'utc')::date::text as observed_date,
             v.ingest_origin,
             count(*) filter (where v.version = 1)::int as first_seen,
             count(*) filter (where v.version > 1)::int as amendments,
             count(*) filter (where v.version > 1
               and coalesce(v.amount, -1) <> coalesce(v.previous_amount, -1)
             )::int as amendments_with_amount_change,
             coalesce(sum(case when v.version > 1
               then coalesce(v.amount, 0) - coalesce(v.previous_amount, 0)
             end), 0)::text as net_amount_change
      from versioned v
      where not (${published("v")})
      group by 1, 2
    `,
  ]);
  const key = (d: ChangeDay) => `${d.observed_date}|${d.ingest_origin}`;
  const off = new Map(outside.map((d) => [key(d), d]));
  return all
    .map((d) => {
      const o = off.get(key(d));
      if (!o) return d;
      return {
        ...d,
        first_seen: d.first_seen - o.first_seen,
        amendments: d.amendments - o.amendments,
        amendments_with_amount_change:
          d.amendments_with_amount_change - o.amendments_with_amount_change,
        net_amount_change: (Number(d.net_amount_change) - Number(o.net_amount_change)).toString(),
      };
    })
    .filter((d) => d.first_seen > 0 || d.amendments > 0);
}

// Memoized per build worker since 2026-09-11: the front page, changes.csv,
// /feed.xml and one feed per entity all read the same window.
const ledgerCache = new Map<string, Promise<ChangeEvent[]>>();

export function changeLedger(
  days: number = LEDGER_DAYS,
  maxRows: number = 500
): Promise<ChangeEvent[]> {
  const key = `${days}:${maxRows}`;
  let p = ledgerCache.get(key);
  if (!p) {
    p = queryChangeLedger(days, maxRows);
    ledgerCache.set(key, p);
  }
  return p;
}

async function queryChangeLedger(
  days: number,
  maxRows: number
): Promise<ChangeEvent[]> {
  // Every date is cast to text here. postgres.js hands a Postgres date back
  // as a JavaScript Date, and while the pages survive that (formatDate
  // accepts either), the CSV export did not: String(new Date()) is "Tue Sep
  // 08 2026 00:00:00 GMT+0000 (Coordinated Universal Time)", which shipped
  // in the first build of changes.csv and is unreadable to a spreadsheet.
  // Casting in the query rather than formatting at each consumer also makes
  // the row types above true, which they were not before.
  //
  // Novelty and the latest action are joined on here rather than added to
  // change_ledger(), which the underlying system also reads. Both joins are
  // one row per key: first_sighting_novelty is version 1 rows only, keyed
  // on filing id, and contract_award_actions_current is one row per award.
  return sql<ChangeEvent[]>`
    select l.observed_date::text as observed_date, l.filing_id, l.natural_key,
           l.version, l.event, l.source_type, l.entity_id, l.entity_name,
           l.subject_raw_string, l.amount, l.previous_amount, l.amount_delta,
           l.occurred_date::text as occurred_date,
           l.published_date::text as published_date,
           l.source_url, l.ingest_origin,
           n.novelty, n.days_public_before_observed,
           (a.natural_key is not null) as action_measured,
           a.latest_action_date::text as latest_action_date,
           a.latest_action_obligation, a.latest_action_modification
    from signal_store.change_ledger(${days}, ${maxRows + LEDGER_HEADROOM}) l
    left join signal_store.first_sighting_novelty n on n.filing_id = l.filing_id
    left join signal_store.contract_award_actions_current a
           on a.natural_key = l.natural_key and l.source_type = 'contract_award'
  `.then((rows) => {
    // change_ledger() applies its limit before any filter this site could
    // add, so it is asked for LEDGER_HEADROOM more rows than wanted, rows
    // outside PUBLISHED_SOURCE_TYPES are dropped, and the rest trimmed to
    // maxRows. If the function filled the whole inflated window and the
    // filter still left fewer than maxRows, events past the window may be
    // missing, and the build refuses rather than publish a short ledger.
    const kept = rows.filter((r) =>
      (PUBLISHED_SOURCE_TYPES as readonly string[]).includes(r.source_type));
    if (rows.length === maxRows + LEDGER_HEADROOM && kept.length < maxRows) {
      throw new Error(
        `change ledger: ${rows.length - kept.length} unpublished rows filled ` +
        `the headroom of ${LEDGER_HEADROOM}; raise LEDGER_HEADROOM`);
    }
    return kept.slice(0, maxRows);
  });
}

// Extra rows asked of change_ledger() so unpublished source types can be
// filtered out without shortening the ledger. Court entries add a few live
// first sightings a day; the build refuses if this is ever too small.
const LEDGER_HEADROOM = 2000;

// How many of each day's first sightings were new to the record, counted on
// the same rows change_ledger_days() counts: version 1 filings retrieved
// inside the window, grouped by the UTC day and the ingest origin. The
// first_seen column here must equal change_ledger_days()'s own, and the
// page refuses to build if it does not, since a mismatch would mean the two
// counts are not about the same filings.
export type DayNovelty = {
  observed_date: string;
  ingest_origin: IngestOrigin;
  first_seen: number;
  new_to_record: number;
};

export async function changeLedgerDayNovelty(
  days: number = LEDGER_DAYS
): Promise<DayNovelty[]> {
  return sql<DayNovelty[]>`
    select (f.retrieved_at at time zone 'utc')::date::text as observed_date,
           f.ingest_origin,
           count(*)::int as first_seen,
           count(*) filter (where n.novelty = 'new_to_record')::int as new_to_record
    from signal_store.filings f
    left join signal_store.first_sighting_novelty n on n.filing_id = f.id
    where f.version = 1
      and f.retrieved_at >= now() - (${days}::int * interval '1 day')
      and ${published("f")}
    group by 1, 2
  `;
}

// ---------------------------------------------------------------------
// The export and search dataset, added 2026-09-09.
//
// One query for the whole current store, shared by every export route and
// by the search index, memoized for the life of the build process rather
// than run once per consumer. Next.js generates pages across more than one
// worker (see next.config.mjs's cpus: 2), so this is not a guarantee of
// exactly one query per build, only of one per worker that needs it, which
// is the part worth caring about: the alternative was five separate 18,000
// row queries, four of which would have returned the same rows.
//
// raw_payload is deliberately not selected. It is the largest column in
// the store by far and nothing here needs it; selecting it would multiply
// this query's memory cost for an export nobody asked for.
// ---------------------------------------------------------------------

export type ExportRow = {
  natural_key: string;
  source_type: "lobbying" | "contract_award";
  entity: string | null;
  subject_as_filed: string;
  occurred_date: string | null;
  reported_date: string | null;
  published_date: string | null;
  amount: string | null;
  action_count: number | null;
  obligating_action_count: number | null;
  latest_action_date: string | null;
  latest_action_obligation: string | null;
  latest_action_modification: string | null;
  ingest_origin: IngestOrigin;
  retrieved_at: string;
  content_hash: string;
  source_url: string | null;
  archived_copy: string | null;
};

let allFilingsPromise: Promise<ExportRow[]> | null = null;

export function allFilings(): Promise<ExportRow[]> {
  if (!allFilingsPromise) {
    allFilingsPromise = sql<ExportRow[]>`
      select
        f.natural_key, f.source_type, e.canonical_name as entity,
        f.subject_raw_string as subject_as_filed,
        f.occurred_date::text as occurred_date,
        f.reported_date::text as reported_date,
        f.published_date::text as published_date,
        f.amount, a.action_count, a.obligating_action_count,
        a.latest_action_date::text as latest_action_date,
        a.latest_action_obligation, a.latest_action_modification,
        f.ingest_origin,
        -- Not ::text, which for a timestamptz gives "2026-09-08
        -- 12:47:39.447186+00", a valid Postgres literal and not an ISO 8601
        -- one. Spelled out in UTC so a downloaded file carries the same
        -- instant this site displays, with no zone to infer.
        to_char(f.retrieved_at at time zone 'utc',
                'YYYY-MM-DD"T"HH24:MI:SS"Z"') as retrieved_at,
        f.content_hash,
        f.source_url, f.wayback_url as archived_copy
      from signal_store.filings_current f
      left join signal_store.entities e on e.id = f.subject_entity_id
      left join signal_store.contract_award_actions_current a
             on a.natural_key = f.natural_key
      where ${published("f")}
      order by f.retrieved_at desc, f.natural_key
    `;
  }
  return allFilingsPromise;
}
