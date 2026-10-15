# Filings Ledger

A public, read only view over the Signal Store: lobbying and federal
contract filings for the editorial watchlist, joined into
confluences and traced back to their source filings.

The pages, as of 2026-09-09:

- `/` **what changed**, the change ledger: filings seen for the first
  time, and recorded filings whose amount moved, over a rolling 30 days.
  `app/page.tsx`.
- `/confluence`, the confluence view, which was the front page until
  2026-09-09. `app/confluence/page.tsx`.
- `/filings`, a directory of pages, one per entity, split further by year
  (and by a numbered chunk within a year large enough to need one) for the
  few entities whose own history is large. `app/filings/page.tsx` and the
  two dynamic routes under it.
- `/search`, one search across every filing, over a static index the
  browser fetches on the first keystroke. `app/search/`.
- `/methodology`, what entity resolution does and does not claim, what a
  contract amount is made of, the confluence window, the agency crosswalk,
  the update cadence, the correction path, and what is deliberately left
  off the site. Reads the store since 2026-09-10, for action coverage and
  the crosswalk's counts, which must never be typed into the page.
- `/aliases`, the store's alias table, entity by entity, added
  2026-09-10.
- `/watchlist`, added 2026-09-11: every entity, the editor's stated
  reason for watching it from `entity_watch_reasons`, and its last 90
  days beside its own prior year from `entity_activity_baseline()`.
- `/filings/<entity>/<natural_key>` and `/filings/unmatched/<natural_key>`,
  added 2026-09-11: one page per filing, about eighteen thousand of them,
  every version, the source, the action detail and a cite block. They
  share a route with the period pages, `app/filings/[entity]/[key]`, which
  tells a period label from a natural key and refuses to build if the two
  ever collide. Every page reads `filingRecords()`, loaded once per build
  worker; a per page query here would be eighteen thousand queries.
- `/feed.xml` and `/filings/<entity>/feed.xml`, RSS, added 2026-09-11.
- `/license`, the license on the compiled data, how to cite one filing,
  and the downloads.
- `/data/*.csv` and `/data/*.json`, static exports built with the pages.
  `app/data/`. `/data/README.md` is the data dictionary for the two
  confluence files, rendered from `lib/dictionary.ts`, the same list the
  two CSV routes take their headers from.

## The confluence revision, 2026-09-10

The confluence page used to say its window was when USAspending last
touched an award. It never was: `confluence_candidates()` windows a
contract on its Base Obligation Date, so every award on the page is a new
award. The page now says so, splits each entity's new awards into single
action, multi action and unmeasured, and adds a by agency table from
`confluence_by_agency()`.

That function returns per class counts but no per class totals, so
`confluenceSplit()` in `lib/db.ts` computes the totals over
`confluence_candidates()` rows joined back to their filings on
`source_url`, then checks itself against both shared functions and throws
if any count or total disagrees. A throw fails the build and the last good
deploy keeps serving. If that ever fires, the two shared functions have
drifted apart, and the fix belongs in record-scanner, not here.

## Why the front page changed on 2026-09-09

The confluence view was the front page from launch, and the methodology
page had already conceded the problem with it in its own words: a
registered lobbyist files roughly every ninety days, the same length as
the confluence window, so an entity that lobbies at all clears the
lobbying half of that test nearly permanently. What the page actually
listed was the large federal vendors who keep both records open, and it
listed the same nine of them week after week. Nothing was wrong with it.
Nothing happened on it either, which is a poor property for the first
page a reader sees.

The change ledger that replaced it needed no new data and no new fetch.
`signal_store.filings` is append only and versioned, so a first sighting
and an amendment are separate rows and an amendment's amount can be
compared to the version before it; migration
`20260909000000_change_ledger.sql` in record-scanner is a window function
over rows that were already there. Read that migration's own comments for
what the ledger includes and, more importantly, excludes: the 17,643
first sightings that arrived on the day of the historical sweep are not a
day of federal activity, and the amendments that changed a fingerprint
without changing a figure are not movements.

## Why search is a static index rather than a query

`/search` fetches `/data/search-index.json` and filters it in the
reader's browser. That is not a shortcut around building a real search;
it is the only shape that keeps the property the section below is about.
A search box backed by a query is a connection per searching visitor,
which is exactly the cost the static model exists to avoid, and the
existing per page filter on `FilingsTable` cannot answer "which of these
hundred and fifty pages holds this filing" no matter how good it is.

The index is fetched on the first keystroke, never on page load, so
opening the page costs nothing. Two details in
`app/data/search-index.json/route.ts` are worth knowing before editing
it: rows are arrays with the field names given once, purely for size, and
source URLs are not repeated per row but expressed as one pattern per
source, checked against every stored URL at build time with any
exception carried literally. That check is the point. A search result
must never link to a URL this site assembled for it and never verified.

## Why this stays a static, build time queried site

Every page here is statically generated and queries the database at build
time, once, not per visitor. That was already true before the filings
page needed splitting into a directory on 2026-09-05, and the split was
chosen specifically to keep it true rather than to move to a runtime
query, considered and rejected at that point for a reason worth keeping
here rather than relitigating later.

**The value of the static model is that visitor traffic never reaches the
database at all.** `signal_store_reader`'s one connection is opened once
a day, at build time, for as long as the build takes, and nothing else
ever touches it: the built output is plain files Vercel's CDN serves,
and a visitor's browser never makes a request the database has to
answer. That is what makes pointing the public at a Supabase free tier
project safe regardless of how much traffic the site gets. A runtime
query model, whether server rendered per request or an API route a
client fetches, replaces that with a connection (or a pool of them) that
scales with visitor traffic instead of with how often this repo deploys.
Supabase's free tier has a real, modest connection ceiling; a static
site cannot run into it no matter how many people are looking at the
same page at once, and a runtime one genuinely could.

**A runtime query also changes what the deploy hook is for.** Today,
rebuilding is how new data reaches the page: `EVIDENCE_DEPLOY_HOOK_URL`
fired once a day is the entire data freshness mechanism, and the
acceptance test that proved this pipeline out was specifically that a
failed selftest leaves the deployed page unchanged, because nothing
rebuilt. Under a runtime model the hook would only matter for code
changes; data would be fresh on every request instead, which sounds
like an improvement until it is weighed against the connection cost
above. For a site with real per-visitor traffic that tradeoff might be
worth it. For a low traffic evidence site on a free tier project, it
is not: it trades a problem this site does not have (staleness between
daily builds) for one it would then have (the database load a visitor
now costs).

So: when this site's data outgrows a single page again, the answer is
another split, not a move to runtime queries, unless the traffic and
cost picture above has actually changed.

**One deliberate exception: `app/LastRefreshed.tsx`.** Every other
component on this site is a plain server component, rendered once at
build time, exactly the model argued for above. This one is a client
component, evaluated again in each visitor's own browser after the page
loads, because it has to be: the one thing a static site cannot tell a
reader by computing anything at build time is that it has stopped
updating. A stalled build never runs, so nothing computed at build time
can ever notice the stall; only a check made later, against a clock the
build itself cannot see, can. `BUILD_TIME` is already embedded in every
page's static HTML regardless; this component only compares it to the
visitor's own `Date.now()` and, past 72 hours, replaces the plain
refreshed line with one that says so. No data fetching, no new
connection to anything, nothing about the reader connection or the
build model above changes: this is the one comparison that has to happen
after the page is already in the visitor's hands, and it is scoped to
exactly that and nothing more.

## Data

Read only, via `signal_store_reader` against the `signal_store` schema in
the `agenda-ledger` Supabase project. This repo never writes to that
database; the connection role could not even if the code tried, its grants
are `SELECT` only. See `record-scanner/money-signal-store/` for the schema,
the migrations, and the ingest code that populates it.

## Local development

    cp .env.example .env.local
    # fill in SIGNAL_STORE_READER_URL
    npm install
    npm run dev

Both `npm run dev` and `npm run build` need a real reader connection:
every page here queries the store, so there is no offline mode and a
build against an unset or unreachable `SIGNAL_STORE_READER_URL` fails at
the first page rather than rendering an empty one. `npx tsc --noEmit`
type checks the whole app with no database at all, which is the useful
check to run when you cannot reach the store.

## Deployment

Vercel. `SIGNAL_STORE_READER_URL` is set as a build time environment
variable there, since every page is statically generated and queries the
database at build time, not per visitor.

The HTTP Basic Auth this section used to describe was removed at launch,
and the site wide `X-Robots-Tag: noindex` that outlasted it was removed
on 2026-09-09; `middleware.ts` now carries the header for
`/filings/unmatched` alone and explains why. `BASIC_AUTH_USER` and
`BASIC_AUTH_PASS` are read by nothing in this repo any more and can be
deleted from Vercel's environment whenever someone is in there.

**The live site is the authoritative check that a deploy succeeded, not
GitHub's Deployments API.** Confirmed the hard way 2026-09-05: a deploy
hook was fired, the build completed and the site was serving it, but
`gh api repos/<owner>/filings-ledger/deployments` never registered an entry
for it at all, checked repeatedly over twelve real minutes. Every earlier
deploy this project has fired was verified exactly that way, by checking
the API rather than the page, and it had worked every time before this
one did not, which is what made the gap worth writing down instead of
shrugging off as a fluke. `gh api .../deployments/<id>/statuses` is still
the fastest way to confirm a build when it does report in, and stays
worth checking first; it is a convenience, not the ground truth, and a
"no new deployment yet" reading from it is not the same claim as "the
build has not happened." Load the actual page before concluding a deploy
failed.

**`SIGNAL_STORE_READER_URL` exists in two places on purpose, and both need
updating together.** It lives in `record-scanner/.env`, read by
`money-signal-store/signal_writer.py` and by anyone testing this repo
locally, and separately in this project's own Vercel environment
variables, read at build time by every deploy. These are two copies of
the same credential, not two credentials, and Vercel has no way to read
`record-scanner/.env` or know it changed. Rotating `signal_store_reader`'s
password in Supabase and updating only one of the two leaves the other
either broken (if `record-scanner/.env` is the stale one, `signal_writer.py`
starts failing to connect) or silently serving a build made with a
credential that no longer authenticates on the next deploy (if Vercel is
the stale one, the last successful build keeps serving until someone
redeploys, at which point the build itself fails rather than the site
going quietly wrong). Update both together, then confirm both work: a
local connection test in `record-scanner` and one fresh Vercel deploy.

**The commit author's email has to be one Vercel recognizes as the account
owner's, or the build is blocked, on push and on a fired deploy hook
alike.** This project is on Vercel's Hobby plan, and Hobby does not
support collaboration: a commit whose author email Vercel cannot tie to
the account owner is treated as an outside collaborator and the
deployment is refused outright, with the dashboard reading "Hobby teams
do not support collaboration. Please upgrade to Pro to add team members."
Confirmed the hard way, three ways, each isolating one variable at a
time:

- `Signal Store <noreply@example.org>`, this repo's intended
  identity for every real commit, blocked. Adding and verifying that
  address as a secondary email on the linked GitHub account did not fix
  it, even after disconnecting and reconnecting Vercel's GitHub
  integration to rule out a stale cache. Whatever Vercel's check actually
  reads, a domain catch all address verified as a GitHub secondary email
  was not enough.
- `Signal Store <your-github-primary@address>`, a literal placeholder
  typed in by mistake rather than a real address, blocked, unsurprisingly,
  and not informative about anything.
- `Signal Store <the account owner's GitHub primary email>`, the real
  address on the account, succeeded, both on a direct push and on a fired
  deploy hook. The display name carried no personal identity either time;
  only the email mattered to Vercel.

**Disconnecting and reconnecting Vercel's GitHub integration, tried to
rule out a stale cached email list while diagnosing the block above, has
its own side effect worth knowing about before doing it again: it
silently invalidates every existing deploy hook on the project.** The
hook this section is about firing started returning `404, deploy hook
... was not found` right after that reconnect, with no warning anywhere
in Vercel's own UI at the time it happened. A new hook had to be created
and `EVIDENCE_DEPLOY_HOOK_URL` replaced. If a future session reconnects
the integration for any reason, check the hook still resolves before
assuming the fix worked and moving on; a fresh 404 here reads exactly
like the account level block this section is about, and is not.

**This is not settled for good, only for that one commit.** The block is
evaluated against whatever commit is currently at HEAD, not only at the
moment of push: a deploy hook fired twice against the same blocked commit,
hours apart, was blocked identically both times. That means the very next
commit whose author email Vercel does not recognize, pushed by anyone,
breaks the daily automated deploy again, silently, until someone notices
and pushes a fix. Whoever commits to this repo needs to know that before
it happens again.

**Confirmed, and this is the standing identity: GitHub's own private
noreply email.** `<id>+<username>@users.noreply.github.com`, under
Settings → Emails → "Keep my email addresses private", is a real email
GitHub itself associates with the account, unlike the domain catch all
above, and Vercel accepts it. Every commit from here on carries
`Signal Store <id+username@users.noreply.github.com>`: the
display name stays non-personal, and the email is real, GitHub verified,
and tied to the account without exposing a personal inbox, which is the
combination none of the first three candidates managed together. The
earlier commits made while testing the personal Gmail address and the
two typed placeholders were rewritten out of this repo's history once
this identity was confirmed working; see git log for the commit that
first proved it, and note that this address still reveals the GitHub
username on the account, which anyone able to see this repository
already sees as its owner regardless.

## This will resurface at launch, step 6

Step 6 removes `middleware.ts`'s Basic Auth gate entirely. That removal
is itself a commit, and per everything above, that commit's author email
has to be one Vercel recognizes or the deploy is blocked the same way.
The failure mode at that exact moment is worth naming in advance: the
site keeps serving its last good build, Basic Auth included, and it will
look exactly like the middleware removal did not work rather than like a
blocked deploy, since nothing about a blocked deploy is visible from the
site itself. Check the commit author before troubleshooting the
middleware code.

## What this repo depends on in record-scanner

These things, all of which live there and none of which this repo can
fix on its own:

- `signal_store.change_ledger()` and `change_ledger_days()`, migration
  `20260909000000_change_ledger.sql`. The front page is a thin wrapper
  over them, deliberately, so the definition of a change sits next to the
  append only table it is derived from rather than in a page component in
  a different repository.
- `signal_store.contract_award_actions`, migrations
  `20260909000002`, `20260909000003` and `20260909000004`, filled by
  `scripts/money_actions.py` on the daily run. This is what the Made of
  column reads: the count of actions behind an award's total, how many of
  them obligated anything, and what the most recent one did. Every
  contract row reads "unmeasured" (it read "not checked" until
  2026-09-10) until that script has reached that award, which for a store
  of roughly eighteen thousand awards takes weeks; that is expected and
  the column says so. Since 2026-09-10 the script measures the confluence
  set before any other backlog, so that page reaches full coverage first.
  Note the third of those
  migrations: adding a column to a table in that schema means recreating
  every view over it in the same migration, because the `_current` views
  are defined with a star and Postgres freezes the column list at
  creation. That has now bitten this project twice.
- `signal_store.confluence_candidates()`, which predates all of this and
  which the confluence page has always called. Never change it from here:
  the underlying system's alerting shares it.
- `signal_store.agency_crosswalk`, `lobbying_agency_activity`,
  `confluence_by_agency()` and `entity_year_rollup`, migration
  `20260910000007_agency_crosswalk_and_confluence_views.sql`, applied
  2026-09-10. The crosswalk is hand kept by Adam and never written by
  ingest. Read that migration's header before relying on
  `entity_year_rollup.backfilled_undated`; this site does not.
- `signal_store.entity_watch_reasons`, `first_sighting_novelty` and
  `entity_activity_baseline()`, migration
  `watch_reasons_baseline_and_novelty`, applied 2026-09-11. The reasons are
  written by Adam and never by this site; an entity without one reads "no
  stated reason yet". Read `defenseCoverage()` in `lib/db.ts` before
  reading anything into a window that sits below its baseline: USAspending
  publishes Defense contract data 90 days late.
- `signal_store.entity_aliases`, which `/aliases` publishes. The daily
  poll matches against `money_sources.yaml`, which seeded this table, so
  the page says it shows the store's copy.
