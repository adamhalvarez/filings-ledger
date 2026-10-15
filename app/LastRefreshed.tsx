"use client";

import { useEffect, useState } from "react";
import { BUILD_TIME, formatTimestamp } from "@/lib/format";

// The one deliberate exception to this site being fully static and build
// time queried. See README.md, "Why this stays a static, build time
// queried site": a static site cannot detect that it has stopped
// updating by computing anything at build time, since a stalled build
// never runs to notice its own staleness, so this one comparison has to
// happen against the visitor's own clock, in the browser, after the
// page has already loaded. No data fetching, no server, no new
// connection of any kind: BUILD_TIME is already embedded in every page's
// static HTML, and this only compares it to Date.now() client side.
//
// A visitor's first paint always shows the plain, non stale line, since
// server and client agree on that before this runs; the stale wording,
// when it applies, replaces it a moment later. That flash is accepted as
// the cost of the one thing build time cannot tell a reader by itself.
const STALE_AFTER_MS = 72 * 60 * 60 * 1000; // 72 hours

export default function LastRefreshed({
  label = "Last refreshed",
}: {
  label?: string;
}) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    setStale(Date.now() - BUILD_TIME.getTime() > STALE_AFTER_MS);
  }, []);

  if (!stale) {
    return (
      <>
        {label} {formatTimestamp(BUILD_TIME)}.
      </>
    );
  }

  const days = Math.floor(
    (Date.now() - BUILD_TIME.getTime()) / (24 * 60 * 60 * 1000)
  );
  return (
    <>
      {label} {formatTimestamp(BUILD_TIME)}, more than {days} days
      ago. This site rebuilds daily; a gap this size usually means the
      refresh has stalled, not that nothing happened at the source. Treat
      every figure here as current only as of that date until it catches
      up.
    </>
  );
}
