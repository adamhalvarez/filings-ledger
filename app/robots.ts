import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Added 2026-09-09 with the noindex removal. Says the same thing
// middleware.ts says in a header, to the crawlers that read this first.
//
// The two exclusions are not the same kind of thing. /filings/unmatched is
// excluded on the reasoning in middleware.ts: a list of unplaced subject
// strings should not surface in a search for a company's name. /data/ is
// excluded because those files are downloads meant to be linked from the
// pages that explain them, and a multi megabyte CSV ranking on its own,
// stripped of the methodology page that says what a null entity or a
// cumulative amount means, is worse than not being found at all.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/filings/unmatched", "/data/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
