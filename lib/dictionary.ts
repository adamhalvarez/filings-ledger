import { CONFLUENCE_WINDOW_DAYS, LEDGER_DAYS as LEDGER_WINDOW_DAYS } from "./db";

// The data dictionary for the confluence downloads, added 2026-09-10. The
// CSV routes take their headers from here and /data/README.md is rendered
// from here, so a column cannot be added to a file without appearing in the
// README, and the README cannot describe a column the file does not carry.

export type Column = { name: string; description: string };

export type DataFile = {
  file: string;
  what: string;
  columns: Column[];
};

export const WINDOW_RULE =
  `A filing is inside the window when its date is on or after the build date minus ${CONFLUENCE_WINDOW_DAYS} days. ` +
  "For a contract award that date is the award's Base Obligation Date as USAspending records it, so every award counted here was first obligated inside the window. " +
  "A later modification to an older award does not bring it into the window. " +
  "For a lobbying filing it is the date the Senate posted the filing (dt_posted). " +
  "The entity set is the watchlist entities with at least one lobbying filing and at least one contract award inside the window, computed by signal_store.confluence_candidates.";

export const NULL_RULE =
  "An empty cell is never zero. It means the value is not on file, not measured, or, for a total beside a count of 0, that there was nothing to sum. " +
  "A count of 0 is a measured zero. Unmeasured awards, those this system has not yet asked USAspending about, are counted in their own column and never folded into single or multi action.";

export const CONFLUENCE_FILE: DataFile = {
  file: "confluence.csv",
  what: "One row per entity in the confluence set, the table on /confluence.",
  columns: [
    { name: "entity", description: "Watchlist entity name." },
    { name: "entity_type", description: "The watchlist's own classification of the entity." },
    { name: "lobbying_filings", description: "Lobbying filings for the entity inside the window." },
    { name: "lobbying_total", description: "Sum of the dollar amounts on those filings, as filed; empty if none carried an amount." },
    { name: "contract_awards", description: "Contract awards to the entity first obligated inside the window." },
    { name: "contract_total", description: "Sum of those awards' totals as USAspending reported them when this system retrieved each one." },
    { name: "awards_single_action", description: "Of contract_awards, those USAspending records as one action, so the amount is that one obligation." },
    { name: "single_action_total", description: "Sum of the amounts of the single action awards." },
    { name: "awards_multi_action", description: "Of contract_awards, those USAspending records as more than one action." },
    { name: "multi_action_current_total", description: "Sum of the multi action awards' current totals, which include actions after the obligation date; the increment inside the window is not known." },
    { name: "awards_unmeasured", description: "Of contract_awards, those whose action count this system has not yet measured." },
    { name: "window_first_date", description: "Earliest filing date among the entity's filings inside the window, both kinds, by the window rule above." },
    { name: "window_last_date", description: "Latest filing date among the entity's filings inside the window, both kinds, by the window rule above." },
    { name: "site_url", description: "The entity's page on this site, which lists every one of its filings with a permalink for each." },
  ],
};

export const BY_AGENCY_FILE: DataFile = {
  file: "confluence-by-agency.csv",
  what: "One row per entity and USAspending Awarding Agency with at least one new award inside the window, from signal_store.confluence_by_agency. Summed within an entity, the award counts and totals equal that entity's row in confluence.csv.",
  columns: [
    { name: "entity", description: "Watchlist entity name." },
    { name: "awarding_agency", description: "The award's Awarding Agency as USAspending records it; empty where the award record carries none." },
    { name: "contract_awards", description: "Awards from this agency to the entity first obligated inside the window." },
    { name: "contract_total", description: "Sum of those awards' totals as retrieved, the same meaning as contract_total in confluence.csv." },
    { name: "awards_single_action", description: "Of contract_awards, those recorded as one action." },
    { name: "awards_multi_action", description: "Of contract_awards, those recorded as more than one action." },
    { name: "awards_unmeasured", description: "Of contract_awards, those whose action count has not been measured." },
    { name: "lobbying_filings_naming_agency", description: "The entity's lobbying filings inside the window that name this agency, through the hand kept crosswalk from LDA government entity ids to Awarding Agency. 0 is a measured zero." },
    { name: "lobbying_total_naming_agency", description: "Sum of the full amounts of those filings. A filing naming several agencies counts in full on each, so this column must not be summed across agencies." },
    { name: "site_url", description: "The entity's page on this site; there is no page per agency." },
  ],
};

// Added 2026-09-11. changes.csv is the front page's window, which has its
// own rule, stated in `what` rather than under the confluence window above.
export const CHANGES_FILE: DataFile = {
  file: "changes.csv",
  what:
    `One row per change on the front page, /: every filing first seen live in the last ${LEDGER_WINDOW_DAYS} days, and every amendment in that span whose amount moved. ` +
    "First sightings from the historical sweep and the one time backfill are left out, because the day this system fetched them says nothing about an agency. Up to 500 rows, largest movements first within a day.",
  columns: [
    { name: "observed_date", description: "The UTC day this system retrieved this version of the filing." },
    { name: "event", description: "first_seen for a filing's first version, amended for a later version whose amount differs from the one before it." },
    { name: "novelty", description: "First sightings only, empty for an amendment. new_to_record: first seen within seven days of the source's own date (dt_posted for lobbying, last modified for a contract award). new_to_watchlist: public longer than that before this system saw it, which happens when an alias or an entity is added. undated: the source gives no date to compare." },
    { name: "days_public_before_observed", description: "observed_date minus the source's own date, in days, for a first sighting; empty when undated or for an amendment." },
    { name: "version", description: "The filing's version number in this store, 1 for a first sighting." },
    { name: "source_type", description: "lobbying or contract_award." },
    { name: "entity", description: "Watchlist entity name; empty for a filing not matched to one." },
    { name: "subject_as_filed", description: "The client, registrant or recipient string exactly as the source recorded it." },
    { name: "amount", description: "The filing's amount in this version, as filed or as USAspending reported it." },
    { name: "previous_amount", description: "Amendments only: the amount in the version before." },
    { name: "amount_delta", description: "Amendments only: amount minus previous_amount." },
    { name: "occurred_date", description: "Contract awards: the Base Obligation Date. Lobbying filings carry none." },
    { name: "published_date", description: "Lobbying: the date the Senate posted the filing. Contract awards: the date USAspending last modified the record." },
    { name: "ingest_origin", description: "live for the daily poll; the other two origins do not appear in this file's first sightings." },
    { name: "natural_key", description: "The filing's own key at its source, stable across amendments; with content_hash and retrieved_at in filings.csv it is the citation unit." },
    { name: "source_url", description: "The filing at its source agency." },
    { name: "site_url", description: "The filing's permalink on this site, which shows every version this store holds." },
  ],
};

export const DATA_FILES = [CHANGES_FILE, CONFLUENCE_FILE, BY_AGENCY_FILE];

export function headers(file: DataFile): string[] {
  return file.columns.map((c) => c.name);
}

export function readmeMarkdown(builtAt: string): string {
  const lines: string[] = [
    "# Filings Ledger, data dictionary",
    "",
    `Built ${builtAt}. Rebuilt with the site once a day. Source: signal_store in the Signal Store, read only.`,
    "Every number in these files is a count or a sum over filings on record; nothing is estimated.",
    "Covers every column of changes.csv, confluence.csv and confluence-by-agency.csv. filings.json carries its own notes on the key fields it shares with filings.csv.",
    "",
    "## Confluence window",
    "",
    "Applies to confluence.csv and confluence-by-agency.csv. changes.csv has its own rule, given under it below.",
    "",
    WINDOW_RULE,
    "",
    "## Empty cells",
    "",
    NULL_RULE,
    "",
  ];
  for (const f of DATA_FILES) {
    lines.push(`## ${f.file}`, "", f.what, "");
    for (const c of f.columns) lines.push(`- \`${c.name}\`: ${c.description}`);
    lines.push("");
  }
  lines.push(
    "## Citing a row",
    "",
    "These files are summaries. To cite one filing, use its natural_key, content_hash and retrieved_at from filings.csv; see /license on the site.",
    ""
  );
  return lines.join("\n");
}
