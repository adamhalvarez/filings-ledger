import Link from "next/link";
import { storeCounts } from "@/lib/db";
import LastRefreshed from "../LastRefreshed";
import SearchClient from "./SearchClient";

export const metadata = {
  title: "Search every filing",
  description:
    "Search every lobbying disclosure and federal contract award on file for the editorial watchlist.",
};

// The answer to the one thing the filings directory could not do. Every
// filings page carries a filter over the rows already on it, which is the
// right tool for one entity's page and useless for a reader who does not
// yet know which of a hundred and fifty pages holds what they are looking
// for. This page searches all of them, without adding a server: the index
// is a static file built alongside the pages, fetched by the browser on the
// first keystroke. See app/data/search-index.json/route.ts for its shape
// and for why source URLs in it are patterns checked against the stored
// value rather than strings this site made up.
export default async function SearchPage() {
  const counts = await storeCounts();
  return (
    <>
      <h1>Search</h1>
      <p className="subtitle">
        Every one of the {counts.total} filings on file, searched by the
        subject string as the source agency recorded it, by watchlist entity,
        or by a filing&rsquo;s own key. Latest version of each filing only,
        the same rows the filings pages show. Unresolved filings are
        searchable here too, marked as such.
      </p>
      <p className="refreshed"><LastRefreshed /></p>
      <SearchClient />
      <p className="subtitle">
        Browsing rather than searching is the{" "}
        <Link href="/filings">filings directory</Link>, and the whole store is
        downloadable as <a href="/data/filings.csv">filings.csv</a> or{" "}
        <a href="/data/filings.json">filings.json</a> for anything this page
        cannot answer.
      </p>
    </>
  );
}
