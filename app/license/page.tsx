import Link from "next/link";
import {
  CONTACT_EMAIL,
  DATA_LICENSE,
  DATA_LICENSE_URL,
  SITE_URL,
} from "@/lib/site";

export const metadata = {
  title: "License and citation",
  description:
    "How to reuse and cite the data on this site, and who to write to about a mistake in it.",
};

// Added 2026-09-09. The site had no license, no contact address and no
// stated citation unit, which for an evidence site is a real gap rather
// than a missing formality: a reader who wants to use a figure in their own
// work had nothing telling them whether they may, how to point at the exact
// row, or where to write when it looks wrong.
export default function LicensePage() {
  return (
    <div className="methodology">
      <h1>License and citation</h1>

      <section>
        <h2>The filings themselves carry no license from anyone</h2>
        <p>
          Every figure on this site comes from a record published by the
          United States federal government: lobbying disclosures filed with
          the Senate under the Lobbying Disclosure Act, and contract award
          records published by USAspending. Works of the federal government
          are not subject to copyright in the United States, so there is no
          permission to grant over the filings themselves and this site does
          not pretend to grant one. Anyone can use them, from here or from
          the source, and the source links on every row are there so you can
          go and get them yourself.
        </p>
      </section>

      <section>
        <h2>What this project made, and how you may use it</h2>
        <p>
          What is this project&rsquo;s own work is the selection: which
          entities are watched, the hand kept alias list that decides when a
          filing&rsquo;s subject string names one of them, the observation
          history that records what a source said on a given day, and the
          per award action counts that say whether an amount is cumulative.
          That work, and the compiled datasets on this site that express it,
          are published under{" "}
          <a href={DATA_LICENSE_URL} target="_blank" rel="noreferrer">
            {DATA_LICENSE}
          </a>
          . Use it, republish it, build on it commercially or otherwise;
          credit the editor and link back so a reader of your work
          can check ours.
        </p>
        <p>
          Attribution that would satisfy this, for a dataset:{" "}
          <span className="cite">
            the editor, Filings Ledger, {SITE_URL}, {DATA_LICENSE}
          </span>
        </p>
      </section>

      <section>
        <h2>How to cite one filing</h2>
        <p>
          A source URL alone is a weak citation here, and not because the
          agencies are unreliable: an award record is designed to change as
          money is obligated against it, so a link that showed one figure
          when you cited it can honestly show another later. What this site
          can give you that the source cannot is a record of what the source
          said at a particular moment.
        </p>
        <p>
          So cite three things together, all of which are on the row and in
          every download: the filing&rsquo;s key, the content hash of the
          response this system stored, and the date it was retrieved. Since
          11 September 2026 every filing also has its own page on this site,
          linked from every table as this filing, which keeps every version
          this store holds and ends with a cite this row block giving all of
          it in one place.
        </p>
        <p>
          What that triple claims is exactly this: on that date, this system
          asked the source agency and received a response with that
          fingerprint. It is not a verification that the filing itself is
          accurate, and the hash cannot be recomputed from the stored copy to
          check it; the{" "}
          <Link href="/methodology">methodology page</Link> explains why, and
          it is a limit worth reading before relying on the hash for
          anything.
        </p>
      </section>

      <section>
        <h2>Downloads</h2>
        <p>
          Rebuilt with the site, once a day, and static files rather than a
          live API: a download never reaches the database behind this site.
        </p>
        <ul className="entity-directory">
          <li>
            <a href="/data/filings.csv">filings.csv</a>{" "}
            <span className="muted-count">
              every filing on file, latest version of each
            </span>
          </li>
          <li>
            <a href="/data/filings.json">filings.json</a>{" "}
            <span className="muted-count">
              the same rows, with the provenance and the caveats carried
              inside the file
            </span>
          </li>
          <li>
            <a href="/data/changes.csv">changes.csv</a>{" "}
            <span className="muted-count">
              the front page&rsquo;s window, first sightings and amounts that
              moved
            </span>
          </li>
          <li>
            <a href="/data/confluence.csv">confluence.csv</a>{" "}
            <span className="muted-count">
              the confluence page&rsquo;s entity table
            </span>
          </li>
          <li>
            <a href="/data/confluence-by-agency.csv">confluence-by-agency.csv</a>{" "}
            <span className="muted-count">
              the confluence page&rsquo;s by agency table
            </span>
          </li>
          <li>
            <a href="/data/README.md">README.md</a>{" "}
            <span className="muted-count">
              the data dictionary for changes.csv and both confluence files,
              every column
            </span>
          </li>
          <li>
            <a href="/feed.xml">feed.xml</a>{" "}
            <span className="muted-count">
              RSS of filings new to the record; each entity&rsquo;s page links
              a feed of its own
            </span>
          </li>
          <li>
            <a href="/data/search-index.json">search-index.json</a>{" "}
            <span className="muted-count">
              the compact index the search page reads, documented in the file
            </span>
          </li>
        </ul>
        <p>
          There is no rate limit and no key, because there is nothing to rate
          limit: these are files on a CDN. If you are building something that
          needs the store rather than a snapshot of it, write to the address
          below and ask.
        </p>
      </section>

      <section>
        <h2>Corrections and questions</h2>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> reaches the
          editor. Worth knowing which of two things you are reporting, since
          they are fixed in different places. A figure that disagrees with
          the source filing is a bug here and this site never edits or
          reinterprets what a filing says, so tell us and include the row.
          An entity match that looks wrong, in either direction, is almost
          always the alias list rather than the filing: a subsidiary filing
          under its own name sits in the unresolved list until a human adds
          that name, and a name added in error attributes one company&rsquo;s
          activity to another. Both are worth an email.
        </p>
      </section>
    </div>
  );
}
