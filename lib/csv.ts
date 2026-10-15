// CSV, written out here rather than pulled in as a dependency: the whole
// need is quoting, and a package for that would be a supply chain surface
// on a site whose only other runtime dependency is the Postgres driver.
//
// RFC 4180 quoting, applied to every field rather than only the ones that
// look like they need it. Deciding per field which ones need quotes is
// where CSV writers go wrong, and an entity name from a federal filing is
// exactly the kind of string that carries a comma nobody expected.
export function csvValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  // A Date reaching here would be written as "Tue Sep 08 2026 00:00:00
  // GMT+0000 (Coordinated Universal Time)", which is what String() does to
  // one and which is unparseable by every spreadsheet and half of every
  // CSV reader. The queries behind these exports now cast their date
  // columns to text so this should not fire, and it stays as a backstop
  // rather than as the fix: a column added later without that cast should
  // land as an ISO timestamp, not as English prose.
  const s = v instanceof Date ? v.toISOString() : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

export function toCsv(
  headers: string[],
  rows: Record<string, unknown>[]
): string {
  const lines = [headers.map(csvValue).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvValue(row[h])).join(","));
  }
  // Trailing newline: a file without one is a file some tools read as
  // truncated, and every line above already ends without one.
  return lines.join("\r\n") + "\r\n";
}

// One place for the headers every download carries, so a reader who opens
// a CSV outside this site still knows what it is, when it was made and
// that it is a snapshot rather than a live feed.
export function downloadHeaders(filename: string, contentType: string) {
  return {
    "content-type": `${contentType}; charset=utf-8`,
    "content-disposition": `inline; filename="${filename}"`,
    // Rebuilt once a day by the deploy hook, so a copy cached for an hour
    // is never meaningfully behind the page that links to it.
    "cache-control": "public, max-age=3600",
  };
}
