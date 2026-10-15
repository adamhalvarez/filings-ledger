import { NextRequest, NextResponse } from "next/server";

// Site wide noindex was removed 2026-09-09, deliberately and with the
// original reasoning in front of us. This header was added at launch on the
// argument that public and linkable is not the same decision as indexed and
// searchable, and that the second decision waited on the entity review
// queue being clear. That queue is not clear, and the header came off
// anyway, because the two things turn out not to be connected the way that
// note assumed: an unresolved filing is not a claim about an entity, it is a
// filing this site says out loud it has not placed yet, and the review queue
// will never be permanently empty in a store fed by a daily poll of two
// agencies that keep inventing new spellings of the same company. Waiting
// for it was waiting for a condition that does not arrive.
//
// What the removal is actually for: an evidence site nobody can find is not
// doing the work of an evidence site. Citations point at it, an article
// links to it, a grant reviewer looks for it, and every one of those is a
// search away from someone who has never been told the URL.
//
// One page keeps the header, and it is the page the original reasoning was
// really about. /filings/unmatched is a list of raw subject strings this
// system could not place, which is exactly the content that should not turn
// up in a search for a company's name, out of context, with this site's
// domain behind it. It stays reachable, linked, and out of the index. See
// app/robots.ts, which says the same thing to a crawler that reads robots
// before it reads a header.
export function middleware(request: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

// Since 2026-09-11 each unmatched filing also has a permalink under this
// path, and the header covers those the same way.
export const config = {
  matcher: ["/filings/unmatched", "/filings/unmatched/:path*"],
};
