import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, DATA_LICENSE, SITE_URL } from "@/lib/site";
import LastRefreshed from "./LastRefreshed";
import "./globals.css";

export const metadata: Metadata = {
  // metadataBase added 2026-09-09 with the sitemap and the noindex removal:
  // without it Next.js has no absolute origin to resolve a canonical or an
  // Open Graph URL against, and a relative one is not a canonical at all.
  metadataBase: new URL(SITE_URL),
  // Every page sets its own title and description since 2026-09-10; this
  // default only covers a page that forgets to, and the 404.
  title: {
    default: "Filings Ledger",
    template: "%s | Filings Ledger",
  },
  description:
    "Lobbying and federal contract activity for the editorial watchlist, traced to primary source filings.",
  // No canonical is set here, deliberately. Metadata declared in a root
  // layout applies to every page under it, so a canonical of "/" here would
  // have every one of the site's hundred and fifty pages declare the front
  // page as its canonical version, which is an instruction to a search
  // engine to drop all of them. A canonical belongs on a page that has a
  // duplicate to point at, and no page here does.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="site-title">
              Filings Ledger
            </Link>
            <nav>
              <Link href="/">What changed</Link>
              <Link href="/watchlist">Watchlist</Link>
              <Link href="/confluence">Confluence</Link>
              <Link href="/filings">Filings</Link>
              <Link href="/search">Search</Link>
              <Link href="/methodology">Methodology</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <p>
            Every figure on this site traces to a filing on the methodology
            page. Data comes from the Senate Lobbying Disclosure Act
            database and USAspending, both public federal sources.
          </p>
          <p>
            Compiled data under {DATA_LICENSE}, filings themselves in the
            public domain: see <Link href="/license">license and citation</Link>{" "}
            for how to reuse a figure and how to cite one row. Corrections to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
          {/* The short form of the methodology page's Where else to look
              section, HANDOFF-3 Phase A. */}
          <p>
            Member stock trades and campaign finance are not on this site
            yet. For those, start at{" "}
            <a href="https://disclosures-clerk.house.gov/FinancialDisclosure">
              House disclosures
            </a>
            , <a href="https://efdsearch.senate.gov">Senate eFD</a> and{" "}
            <a href="https://www.fec.gov/data">the FEC</a>; see{" "}
            <Link href="/methodology#where-else-to-look">where else to look</Link>{" "}
            for two outside projects that present them.
          </p>
          {/* In the shared footer since 2026-09-11, so every page, the
              license page and the 404 included, prints the build time from
              the one source, BUILD_TIME. /license had none until then. */}
          <p className="footer-refreshed">
            <LastRefreshed />
          </p>
        </footer>
      </body>
    </html>
  );
}
