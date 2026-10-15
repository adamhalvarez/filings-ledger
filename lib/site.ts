// The site's own public identity, in one place. Added 2026-09-09 with the
// sitemap, the robots rules and the citation guidance, all three of which
// need an absolute URL and none of which can derive one at build time:
// Vercel's own VERCEL_URL is the deployment's generated hostname, not the
// custom domain a reader or a citation would ever use.
//
// Not read from an environment variable on purpose. A missing variable
// would fail silently into a sitemap full of the wrong hostname, which is
// the kind of error nobody notices until a search engine has already
// indexed it.
export const SITE_URL = "https://filings-ledger.example.org";

// Where a correction, a question about an entity match, or a reuse
// question goes. press@ is the existing published address for media,
// credentialing and grant contact, so this site adds no new inbox to
// watch.
export const CONTACT_EMAIL = "contact@example.org";

// The compiled data's license, and the reason the two halves are stated
// separately on the license page: the underlying filings are US federal
// government records and carry no copyright to license, while the
// selection, the entity alias mapping and the observation history around
// them are this project's own work and are the only part a license here
// can speak for.
export const DATA_LICENSE = "CC BY 4.0";
export const DATA_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
