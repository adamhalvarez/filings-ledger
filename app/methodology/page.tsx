import type { Metadata } from "next";
import Link from "next/link";
import {
  actionCoverage,
  crosswalkCounts,
  defenseCoverage,
  BASELINE_WINDOW_DAYS,
  CONFLUENCE_WINDOW_DAYS,
  DEFENSE_DELAY_SOURCE,
} from "@/lib/db";
import { formatDate } from "@/lib/format";
import LastRefreshed from "../LastRefreshed";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How Filings Ledger matches filings to entities, what a contract amount is made of, how the confluence window and the agency crosswalk work, and what the site leaves out.",
};

// Reads the store since 2026-09-10, for two numbers that must never be
// typed into this file: action coverage and the crosswalk's own counts.
// Both change with every daily run, and a hardcoded figure here would be
// wrong by the next morning while looking exactly as authoritative.
export default async function MethodologyPage() {
  const [coverage, crosswalk, defense] = await Promise.all([
    actionCoverage(),
    crosswalkCounts(),
    defenseCoverage(),
  ]);
  return (
    <div className="methodology">
      <h1>Methodology</h1>
      <p className="refreshed"><LastRefreshed /></p>

      <section id="what-this-site-shows">
        <h2>What this site shows</h2>
        <p>
          This site tracks two kinds of federal primary source filings for
          a watchlist of entities: lobbying disclosures filed under the
          Lobbying Disclosure Act, and federal contract awards recorded by
          USAspending. Two kinds is the complete list; no other source,
          campaign donations, stock trades, insider filings, feeds this
          site yet. A confluence, in the definition this site computes, is
          a watchlist entity with at least one lobbying filing and at least
          one contract award, both entity resolved, inside a rolling{" "}
          {CONFLUENCE_WINDOW_DAYS} day window. The window reads one date per
          filing. For a contract award it is the Base Obligation Date, the
          date USAspending records the award was first obligated, so every
          award in a confluence is a new award; a later modification to an
          older award does not bring it into the window, however recently it
          happened. For a lobbying filing it is the date the Senate posted
          the filing, its dt_posted, since a lobbying filing carries no
          obligation date. That is the same definition, computed
          by the same shared database function, that the underlying
          system uses internally to decide whether an entity is worth a
          human&rsquo;s attention, not a separate definition built for
          this site alone.
        </p>
        <p>
          Two kinds present is not the same claim as two independent
          signals converging in time. A registered lobbyist files roughly
          every ninety days, the same length as this window, so a
          lobbying filing sits inside it for almost any entity that
          lobbies at all, nearly the whole year rather than only around
          one date. Checked weekly across 36 points from 2026-01-05
          through 2026-09-07, all but one of the twenty three watchlist
          entities with any lobbying registration showed a filing inside
          the trailing ninety days in at least thirty five of those
          thirty six checks. What a confluence actually tracks, in
          practice, is the contract side: which watchlist entities that
          already lobby also show recent federal contract activity. The
          lobbying half of this test is a gate an active lobbyist clears
          almost automatically, not a timing signal in its own right, and
          this page&rsquo;s own wording says so rather than implying a
          coincidence the underlying filings do not show.
        </p>
        <p>
          Every count, total and date on this site is computed directly
          from the filings listed on the filings page. Nothing here is
          estimated, projected or modeled.
        </p>
        <p>
          The filings page is not windowed the same way. It lists every
          filing on record for an entity regardless of date, since its job
          is to be the complete evidentiary record a confluence traces
          back to, not a second view of the same ninety day window.
        </p>
      </section>

      <section id="plain-terms">
        <h2>The plain language sentence</h2>
        <p>
          The line under each entity on the <Link href="/confluence">confluence
          page</Link> is generated, not written by a person. It states who the
          entity is, how many lobbying filings and contract awards it has in
          the window, what those total, and the date span they cover, drawn
          directly from the same reconciled figures the table above it shows.
          Nothing in it is estimated or paraphrased from a filing&rsquo;s own
          text: it is those numbers, in a sentence, and that is the whole of
          what it claims to be.
        </p>
        <p>
          Every dollar figure and date the sentence states is checked against
          that row&rsquo;s own totals before this site is allowed to build. A
          sentence that named a figure the row does not carry would fail that
          check and stop the build rather than publish a claim this site
          cannot stand behind, the same discipline{" "}
          <code>confluenceSplit()</code> already applies to the table itself,
          described above. This mirrors the internal system&rsquo;s own
          version of the same sentence, written for its Money Signals board
          and checked the same way; the two are independent generators over
          two different stores, described further under{" "}
          <Link href="#what-this-site-shows">what this site shows</Link>, and
          are not expected to read identically, only to both be traceable to
          their own filings.
        </p>
        <p>
          Two source types are the whole of what a confluence claims here,
          never a timing claim: see the reasoning under{" "}
          <Link href="#what-this-site-shows">what this site shows</Link> on
          why a lobbying filing sits inside the window for nearly any entity
          that lobbies at all, so what the sentence is really reporting, in
          practice, is the contract award.
        </p>
        <p>
          This page shows the sentence and never a numeric score. The
          underlying system&rsquo;s own Money Signals board carries one,
          Confluence Score, because a row there can show three or more
          source types and the score does real work telling those apart;
          every row here meets the two source floor by construction, so a
          score would only repeat what the sentence already says rather
          than distinguish anything. The public view deliberately shows the
          traced sentence rather than a score.
        </p>
      </section>

      <section>
        <h2>What a contract amount does and does not claim</h2>
        <p>
          USAspending&rsquo;s award search, the one this site&rsquo;s filings
          come from, returns an award&rsquo;s current state: who received
          it, its current total obligated value, when it was first obligated,
          when the record was last touched. Every contract Amount on this
          site is that total as USAspending reported it at the moment this
          system asked, not a figure for activity inside any particular
          window.
        </p>
        <p>
          What that total is made of is asked separately, per award, of
          USAspending&rsquo;s transaction count and transaction endpoints,
          and stored in its own table, contract_award_actions, one
          observation per award per check. Its central field is the action
          count. An action count of one means the award&rsquo;s total is a
          single obligating action, so the figure is a new award amount and
          nothing about it is cumulative. More than one means the total sums
          an original action and later ones; the same observation records
          how many of those actions obligated anything and what the most
          recent one did, which the filings pages show under Made of. What
          it does not give this site is the share of a multi action total
          that fell inside any window, which is why the confluence page
          labels a multi action total as the award&rsquo;s current total and
          never as money that moved in the window.
        </p>
        <p id="unmeasured">
          Unmeasured is the third state, and it is a gap in this
          system&rsquo;s coverage, not a claim about the award. As of this
          build, {coverage.store_measured} of the {coverage.store_awards}{" "}
          contract awards on file have been measured, and{" "}
          {coverage.confluence_measured} of the{" "}
          {coverage.confluence_awards} new awards in the current confluence
          set; both figures are read from the store when the site is built,
          not typed in. The check costs three requests per award, so it fills
          in over weeks rather than in one run. Awards in the confluence set
          are measured before any other backlog, so that table is the first
          to reach full coverage. Unmeasured never renders as anything else,
          and in particular never as a count of zero: an award in this store
          has at least one action by definition, so zero is not a possible
          answer and printing it would be a fabrication.
        </p>
        <p>
          Before that endpoint was found, this site tried building the same
          label by inference, from the gap between an award&rsquo;s own
          obligation date and when USAspending last touched the record, on
          the reasoning that a wide gap meant a later action. Checked
          directly against every award this store had itself observed on two
          separate occasions, actual dollar amount included, that gap did not
          predict whether the amount had changed: of the 518 such awards
          whose amount never moved between observations, 285 still carried a
          gap wide enough to have been labeled, and of the 7 whose amount did
          move, 4 carried a gap narrow enough to have passed unlabeled.
          Worse than chance, in both directions. The label was removed rather
          than recalibrated, and the record of that is left here on purpose:
          the fix that eventually worked was asking the source a question it
          already answers, not tuning a threshold on a signal that was never
          there.
        </p>
        <p>
          Per action detail arrived later the same day, once the endpoint
          carrying it had actually been called rather than read about. Where
          an award has been checked, a row now also says how many of its
          actions obligated anything and what the most recent one did. The
          first award this was run against is the reason it is worth having:
          two actions, of which the base award obligated 2,496,000 dollars
          and the second obligated nothing at all, an administrative
          modification to incorporate a form. A count of two, on its own,
          invites the opposite reading, and since 441 of the first 500
          awards checked carry more than one action, that reading would be
          wrong most of the time.
        </p>
        <p>
          A latest action of zero dollars is therefore a real and meaningful
          value on this site, not a missing one. It says the award was
          touched and no money moved. Missing is still written as
          unmeasured, and the count of actions that obligated something is
          never shown as zero, since an award with a total obligated value
          has at least one such action by definition.
        </p>
        <p>
          Since 11 September 2026 each filing&rsquo;s own page lists every
          recorded action against a measured award, with its date,
          modification number, type and what it obligated, as USAspending
          returned them. Where an amount on the front page moved, the latest
          action is shown beside it when the award has been measured, which
          is usually the action behind the change, and its date says whether
          it can be. For an award checked before the per action fetch existed
          the count is known and the individual actions are not, and its page
          says so. Occurred, the award&rsquo;s own obligation date, and
          Published, when USAspending last touched the record, remain on
          every row exactly as the source gives them.
        </p>
      </section>

      <section>
        <h2>What the front page counts as a change</h2>
        <p>
          The store this site reads is append only and versioned. A filing is
          never overwritten: the same filing reappearing with different
          content from the source is inserted as a new version next to the
          one before it. That makes two questions answerable from rows
          already here, with no new measurement of any kind, and the front
          page asks both. Which filings were seen for the first time, and
          which already recorded filings had their dollar amount change.
        </p>
        <p>
          Two kinds of row are deliberately left out of that page, and both
          exclusions matter more than what is in it. First sightings that
          arrived through the historical sweep and the one time backfill are
          not changes: thousands of them landed on the single day this system
          fetched them, and presenting that as a day of federal activity
          would be the most misleading thing this site could do with its own
          data. They are counted by day at the bottom of that page, labeled
          by how they arrived, and listed in full on the filings pages.
        </p>
        <p>
          Second, and quieter: an amendment whose amount did not move is not
          listed. An amendment here means the source response changed
          fingerprint, which for a contract award can be nothing more than
          USAspending touching the record. Of the 86 amendments this system
          observed live in the first week of September 2026, none moved a
          figure. A ledger that counted all of them would read as constant
          activity while reporting nothing at all.
        </p>
        <p>
          The day a change is filed under is the day this system observed it,
          not the day the underlying event happened at an agency. Both dates
          are on every row, and they can be weeks apart: a contract action
          from mid August can reach USAspending in early September and this
          system the same night.
        </p>
      </section>

      <section id="novelty">
        <h2>New to the record, and new only to this watchlist</h2>
        <p>
          A first sighting is the day this system first stored a filing. That
          is not always news. When an entity or an alias is added to the
          watchlist, the next daily poll asks about it for the first time and
          stores filings that had been public for months, all in one day. On
          10 September 2026 that put 47 lobbying filings onto the front page as
          if they had just happened, 44 of them posted in April and July. It
          is the same
          mistake the page already refused to make with the historical sweep,
          arriving by a different door.
        </p>
        <p>
          So every first sighting is compared with the date the source itself
          gives the filing: the day the Senate posted a lobbying filing, or the
          day USAspending last modified a contract award&rsquo;s record. Seen
          within seven days of that date, it is new to the record, the only
          kind the front page presents as news and the only kind in the site
          wide feed. Seen later than that, it is new to the watchlist: public
          before this system was watching, listed separately, with the number
          of days it had been public. A filing whose source gives no date is
          undated and listed with the second kind, since nothing can say it was
          new. Seven days is the same tolerance the front page has always used
          for on or near the day the source published it. The classification
          is computed in the store, in signal_store.first_sighting_novelty,
          from dates on the rows, and nothing about it is estimated.
        </p>
        <p>
          For a contract award the comparison is with the last modification,
          not the obligation, so an older award whose record was modified this
          week and first seen now counts as new to the record: the record
          changed at its source, and its Occurred date says how old the award
          itself is.
        </p>
      </section>

      <section id="watchlist">
        <h2>The watchlist, and who chooses it</h2>
        <p>
          The entities this site watches are chosen by the editor from entities
          named in the editor's reporting. The{" "}
          <Link href="/watchlist">watchlist page</Link> lists every one, with
          the editor&rsquo;s own one sentence reason for watching it, the
          series it belongs to and the published piece it ties to where there
          is one. Those reasons are statements of editorial interest, stored in
          signal_store.entity_watch_reasons and written by a person; they are
          not findings of this site and nothing here writes one. An entity with
          no recorded reason is shown as having no stated reason yet.
        </p>
      </section>

      <section id="baseline">
        <h2>The activity baseline, and why it is uneven for Defense work</h2>
        <p>
          Beside each entity&rsquo;s last {BASELINE_WINDOW_DAYS} days, the
          site shows the same count for the 365 days before, scaled to{" "}
          {BASELINE_WINDOW_DAYS} days by signal_store.entity_activity_baseline.
          The two are shown as two numbers. No ratio or index is computed from
          them, because either side can be moved by things that are not the
          entity.
        </p>
        <p>
          The largest of those is at the source. USAspending publishes
          Department of Defense contract data on a{" "}
          <a href={DEFENSE_DELAY_SOURCE}>90 day delay</a>. As of this build
          the newest Defense award in the store was obligated on{" "}
          {formatDate(defense.latest_defense_obligation)}, and the last{" "}
          {BASELINE_WINDOW_DAYS} days hold {defense.window_defense} Defense
          awards for the whole watchlist against {defense.window_civilian}{" "}
          civilian ones, while the baseline year holds its Defense awards in
          full. An entity whose federal work is mostly Defense therefore shows
          a window far below its baseline for that reason alone, which is a
          lag in publication and not a fall in activity; the watchlist and
          each entity page show the Defense counts under every figure so the
          size of it is visible. The same lag is why the confluence
          page&rsquo;s by agency table currently has no Defense rows.
        </p>
        <p>
          Two smaller things. The baseline year always contains one federal
          fiscal year end, when obligations peak, and the window may not:{" "}
          {defense.baseline_september.toLocaleString("en-US")} of the
          baseline year&rsquo;s {defense.baseline_awards.toLocaleString("en-US")}{" "}
          awards across the watchlist were obligated in a September. And the
          baseline is this store&rsquo;s own record rather than an
          entity&rsquo;s whole federal history: contract awards reach it
          through the historical sweep back to 1 November 2024, which covers
          the baseline year, and lobbying filings begin in 2024.
        </p>
      </section>

      <section id="permalinks">
        <h2>Permalinks, and how to cite one row</h2>
        <p>
          Every filing has its own page, at /filings/, the entity, and the
          filing&rsquo;s key at its source, or /filings/unmatched/ and the key
          for a filing not yet matched to an entity. The key is stable across
          amendments, so the address does not change when the record does. The
          page shows the current version, every earlier version this store
          holds with its amount and when it was retrieved, the source link,
          the archived copy and how it was made where there is one, the action
          detail for a measured contract award, and a cite this row block.
          Every table on the site that lists filings links to these pages, and
          changes.csv carries the address in its site_url column.
        </p>
        <p>
          To cite a figure, cite the page, the source address, and the date it
          was observed, which the block gives together with the content hash.
          The source can honestly change after that date; the page keeps every
          version, so a citation made today still leads to the figure it
          quoted. The{" "}
          <Link href="/license">license and citation page</Link> has the
          attribution line.
        </p>
      </section>

      <section>
        <h2>What entity resolution does, and does not, claim</h2>
        <p>
          A filing names a client, registrant or contract recipient as a
          plain text string, exactly as the source agency recorded it.
          That string is matched to a watchlist entity by whole word
          comparison against a hand kept alias list, never by a fuzzy or
          approximate match. A match means the filing&rsquo;s own text
          contains the entity&rsquo;s name or a known alias of it as a
          complete word, nothing more.
        </p>
        <p>
          A filing that cannot be matched this way is never dropped. It
          appears on the filings page marked unmatched, carrying the exact
          string the source agency recorded, and is queued for a human to
          review and decide whether it names an entity already on the
          watchlist under a spelling the alias list does not yet cover.
          An unmatched filing is not evidence of anything about an entity;
          it is a filing this site has not yet been able to place.
        </p>
        <p>
          A match is a claim about text, not about ownership or corporate
          structure. This site does not resolve subsidiaries, mergers or
          parent companies beyond what a human has explicitly entered into
          the alias list.
        </p>
        <p>
          The alias list is published, entity by entity, on the{" "}
          <Link href="/aliases">aliases page</Link>, with where each alias
          came from.
        </p>
      </section>

      <section id="agency-crosswalk">
        <h2>Matching a lobbying filing to a contracting agency</h2>
        <p>
          A lobbying disclosure names the government entities its lobbyists
          contacted, each with the Senate&rsquo;s own numeric id and name. A
          contract award names its Awarding Agency, in USAspending&rsquo;s
          spelling. Nothing in either source links the two, so this site
          uses a crosswalk kept by hand: one row per Senate entity id, giving
          the USAspending Awarding Agency it corresponds to. It is keyed on
          the numeric id, never on the name, so a change in how the Senate
          spells an office does not break a match, and it is edited only by a
          person, never by the daily ingest.
        </p>
        <p>
          A crosswalk row with no agency means the office has no contracting
          counterpart in this store, such as either chamber of Congress, an
          Executive Office of the President office, or the Federal Reserve.
          That is a decision recorded against the id, not a missing value. A
          Senate id that appears on a filing and has no crosswalk row at all
          is unmapped: a new office nobody has placed yet. Unmapped ids are
          left out of the confluence page&rsquo;s by agency table rather than
          guessed at, and counted there. As of this build the crosswalk holds{" "}
          {crosswalk.rows} ids, {crosswalk.mapped} mapped to an agency and{" "}
          {crosswalk.no_counterpart} recorded as having no contracting
          counterpart, and {crosswalk.unmapped_ids} ids seen on{" "}
          {crosswalk.unmapped_filings} filings are unmapped.
        </p>
        <p>
          A match here says a filing named an agency and an entity holds
          awards from it. It does not say the lobbying concerned those
          awards, and a filing naming several agencies counts once for each
          of them.
        </p>
      </section>

      <section>
        <h2>Update cadence</h2>
        <p>
          The underlying store is fed by a daily automated poll of both
          source agencies&rsquo; public APIs, one narrow query per watchlist
          entity. This site itself refreshes on the same daily schedule,
          after that day&rsquo;s poll completes successfully. A number on
          this site can lag the underlying agency source by up to one day
          for that reason, never longer under normal operation.
        </p>
        <p>
          The archive.org column on the filings page moves on its own,
          separate schedule, roughly every thirty minutes, independent of
          the once daily refresh described above. A filing can show no
          archived copy there for longer than that even after one has
          actually been found or made, simply because this site has not
          rebuilt since; this site&rsquo;s own refresh lags a background
          process that runs more often than the page does. There is no
          failure state to wait out either way, described further under
          archived copies below.
        </p>
      </section>

      <section>
        <h2>The correction path</h2>
        <p>
          Every filing on the filings page links to its original source
          document. If a figure here looks wrong, the source link is the
          place to check first, since this site never edits or reinterprets
          what a source filing says. An entity match that looks wrong is a
          question for the alias list behind entity resolution, described
          above, not a data error on any individual filing.
        </p>

        <h3>Correction, 9 September 2026: lobbying attribution</h3>
        <p>
          Anyone who read this site before 9 September 2026 saw a larger
          number of lobbying filings attributed to several watchlist
          entities than it shows now. Those attributions were wrong and
          have been withdrawn.
        </p>
        <p>
          The Senate lobbying database searches by client name on its own
          side, and that search is approximate: a query for one company
          returns filings by other organisations whose names resemble it.
          Every result is supposed to be re-checked here against the
          entity&rsquo;s own name and alias list before it is attributed to
          anyone. Because of a fault in the ingest code, a filing that
          failed that check was attributed to whichever entity&rsquo;s
          query had returned it, rather than being left unattributed.
        </p>
        <p>
          The effect was that 576 of 2,322 lobbying filings, 24.8 per cent,
          were recorded against an organisation that did not file them.
          Filings by unrelated hospital networks were attributed to
          Centene; filings by blockchain trade groups to Block; filings by
          Intuitive Surgical and Applied Intuition to Intuit; filings by
          the Amalgamated Transit Union and the Transport Workers Union to
          TransUnion; and filings by ICANN, Nammo and a medical centre to
          the National Association of Manufacturers. Federal contract
          awards were never affected, because that half of the ingest never
          had the fault.
        </p>
        <p>
          All 576 have been corrected. 54 of them, filed under Accenture
          LLP, moved to Accenture, which is now tracked separately from
          Accenture Federal Services. The remaining 522 carry no entity at
          all and appear on the filings page as unmatched, which is the
          honest state: the filing is real, and this site cannot say whose
          it is. The filings themselves were never altered, added or
          removed, and each one still links to the same source document it
          always did. What changed is only who this site says a filing
          concerns.
        </p>
        <p>
          The confluence view still lists nine entities; none dropped out,
          because each one held genuine lobbying activity alongside its
          federal contracts. The evidence behind three of them is smaller
          than it was: Accenture Federal Services from 46 filings to 41,
          TransUnion from 17 to 10, and UnitedHealth Group from 14 to 13.
          A figure cited from this site before that date should be
          re-checked against the figure shown now.
        </p>
      </section>

      <section>
        <h2>Legacy backfilled filings, and why some dates are missing</h2>
        <p>
          This store began with a one time backfill of filings already on
          file locally from before this site existed, marked backfilled
          on the filings page. That backfill carried over every filing
          exactly as it was originally captured, but it could not recover
          data the original capture never requested. Contract filings from
          the backfill carry no occurred date or published date for that
          reason: the original capture did not request the two USAspending
          fields those dates come from. Every filing captured since,
          marked live ingest on the filings page, carries both dates.
        </p>
        <p>
          Lobbying filings are not affected by this gap. Every lobbying
          filing, backfilled or live, carries the date it was posted,
          since that date was always part of the original capture.
        </p>
        <p>
          A third label, historical, covers filings fetched after the fact
          rather than on the day they happened, back to 2024-11-01, under
          the same corrected field list live ingest already uses. A
          historical filing is not the same claim as a live one: this
          system did not observe it the day it was recorded by the source
          agency, only later. It is a stronger claim than a backfilled one
          in exactly the respect the backfill could not manage, it carries
          real occurred and published dates rather than none.
        </p>
      </section>

      <section>
        <h2>What proves a filing, and what content hash checks</h2>
        <p>
          What this system captures at ingest is a record of what the
          source returned, and when: the exact response, stored verbatim,
          fingerprinted with a content hash, timestamped with when this
          system retrieved it. That is not a verification of what the
          filing says, only of what the source said and when this system
          saw it say it. It is the provenance this site actually claims
          for every filing here, whether or not an archived copy link
          appears next to it.
        </p>
        <p>
          Every filing stores a content hash, computed once, at the moment
          the filing was first captured from the source agency&rsquo;s own
          response. It is a fingerprint of that exact response, and it is
          what lets a repeated daily poll recognize a filing it has already
          seen without storing it twice.
        </p>
        <p>
          That hash cannot be recomputed later from the stored filing to
          check it. The database reformats the stored copy of a filing on
          write, in a way that does not exactly match the format the hash
          was originally computed against, so a later recomputation will
          not match even for a filing that is completely unchanged. A
          mismatch on recomputation means the check was performed
          incorrectly, not that the filing was altered.
        </p>
      </section>

      <section>
        <h2>What an archived copy means, and the two ways one gets made</h2>
        <p>
          The archived copy link next to a filing is a snapshot from the
          Internet Archive&rsquo;s Wayback Machine, and it can arrive one
          of two ways, marked so the difference is never hidden behind one
          plain link. A filing marked found had already been captured by
          someone else, at a time this system did not choose and was not
          present for; this system located it afterward. A filing marked
          captured was archived by this system itself, at or shortly after
          the moment the filing was recorded here. The date shown next to
          either label is when the archive was actually made, not when
          this system found or made it, which can lag behind by hours.
        </p>
        <p>
          A found snapshot and a captured one are not the same strength of
          corroboration: found means someone else made it, at a time this
          system did not choose; captured means this system made it
          itself, at or near the moment it recorded the filing. But
          neither is the filing&rsquo;s own provenance, which the capture
          described above already established at ingest, independent of
          whether any archived copy exists. A filing with no archived
          copy is exactly as evidenced as one with one.
        </p>
        <p>
          Most filings will never show an archived copy, and that is the
          ordinary case, not a gap. Capturing one depends on a public
          archive this project does not control and, as of September
          2026, cannot always reach reliably. A filing with no archived
          copy has not failed anything and nothing here is waiting on it:
          it simply has not picked up one additional, optional
          confirmation that was never a precondition for the
          filing&rsquo;s own provenance in the first place.
        </p>
      </section>

      <section>
        <h2>Being findable, and the one page kept out of search</h2>
        <p>
          This site launched public but unindexed, on the reasoning that
          being linkable and being searchable are two different decisions and
          the second could wait. It waited on the entity review queue being
          clear. That condition was dropped on 2026-09-09, because it does not
          arrive: a store fed by a daily poll of two agencies will always have
          filings whose subject string has not yet been placed, and treating
          a permanently non empty queue as a gate meant never opening the
          gate. An evidence site that a citation, an article link or a grant
          reviewer cannot find is not doing the work of an evidence site.
        </p>
        <p>
          One page is still kept out of search, and it is the page that
          reasoning was really about. The unresolved filings page is a list of
          raw subject strings this system could not place; those strings name
          real companies, and a search for a company&rsquo;s name should not
          surface them stripped of the explanation of what an unmatched filing
          means. It stays public and linked from the filings directory. The
          downloads are kept out of search for a related reason: a multi
          megabyte table ranking on its own, without the page that says what a
          null entity or a cumulative amount means, is worse than not being
          found.
        </p>
      </section>

      <section>
        <h2>Reusing a figure, and citing one</h2>
        <p>
          The filings are federal records and carry no copyright; what this
          project made is the watchlist, the alias list, the observation
          history and the action counts, and that is published under a
          Creative Commons attribution license. Every table here is
          downloadable as a static file, rebuilt with the site once a day.
        </p>
        <p>
          For a citation, a source link alone is weaker than it looks, and not
          because the agencies are unreliable: an award record is designed to
          change as money is obligated against it, so a link that showed one
          figure when you cited it can honestly show another later. Cite the
          filing&rsquo;s key, the content hash of the response this system
          stored, and the date it was retrieved, all three of which are on
          every row and in every download. The license and citation page has
          the exact form, and the limits of what the hash proves are described
          under content hash above.
        </p>
      </section>

      <section>
        <h2>What is not on this site</h2>
        <p>
          This site does not compute or display a salience ratio, meaning
          a measure of filing activity against press attention. The
          underlying store has a column reserved for that figure, and it
          is left empty on every filing by design. No source this project
          has confirmed as free and stable currently supplies a press
          mention count to serve as its denominator, and this site will
          not substitute an invented, scraped or estimated one in its
          place. A ratio with a fabricated denominator would be less
          honest than no ratio at all, so none is shown.
        </p>
        <p>
          Per action contract detail was on this list for one day, on the
          reasoning that a column built from documentation alone is the same
          class of thing as an invented denominator. The endpoint was then
          probed and the column built from what it actually returned, which
          is the difference between the two cases and the only thing that
          ever separated them.
        </p>
        <p>
          Search on this site is a static index your browser fetches and
          filters, not a query against the database. That is a deliberate
          limit rather than an unfinished feature: every page here is
          generated once a day and served as a file, so visitor traffic never
          reaches the store at all, and a search box that broke that property
          would trade a problem this site does not have for one it would then
          have. The index is a published file, documented inside itself, if
          you would rather query it yourself.
        </p>
      </section>

      {/* Added 2026-09-11 from HANDOFF-3 Phase A. The supplied copy said this
          site holds rulemaking records; it holds lobbying and contract
          filings only, so that word is not here. Integrity Index is run by
          Political Integrity PAC, a registered hybrid committee that also
          grades candidates, checked on its own pages the same day, and the
          copy says so rather than calling it independent. */}
      <section id="where-else-to-look">
        <h2>Where else to look</h2>
        <p>
          This site holds lobbying and federal contract records for the
          entities named in published pieces. It does not yet hold member stock
          trades or campaign finance. For those, go to the primary sources
          first:{" "}
          <a href="https://disclosures-clerk.house.gov/FinancialDisclosure">
            House financial disclosures
          </a>
          , <a href="https://efdsearch.senate.gov">Senate eFD</a>, and{" "}
          <a href="https://www.fec.gov/data">the FEC</a>.
        </p>
        <p>
          Two outside projects present those records in a scrollable format.{" "}
          <a href="https://www.quiverquant.com/congresstrading">Quiver Quant</a>{" "}
          shows member trades alongside lobbying and contracts.{" "}
          <a href="https://integrityindex.us">Integrity Index</a>, run by
          Political Integrity PAC, a registered hybrid committee, shows per
          candidate finances and trades, and also grades candidates and
          tracks a candidate pledge. We link them as reference, not as
          sources; every row on this site cites its own filing.
        </p>
      </section>
    </div>
  );
}
