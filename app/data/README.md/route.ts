import { downloadHeaders } from "@/lib/csv";
import { readmeMarkdown } from "@/lib/dictionary";
import { BUILD_TIME, formatTimestamp } from "@/lib/format";

export const dynamic = "force-static";

// The data dictionary for confluence.csv and confluence-by-agency.csv,
// rendered from the same column list the two CSV routes take their headers
// from. See lib/dictionary.ts.
export async function GET() {
  return new Response(readmeMarkdown(formatTimestamp(BUILD_TIME)), {
    headers: downloadHeaders("README.md", "text/markdown"),
  });
}
