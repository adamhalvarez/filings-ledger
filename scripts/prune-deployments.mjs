#!/usr/bin/env node
// Prune retained Vercel deployments so Deployment Storage stays under the
// Hobby plan's 10 GB ceiling.
//
// Why this exists. filings-ledger prerenders one page per filing, 18,354 of
// them as of 2026-09-19, at roughly 19.5 KB of HTML plus 11.5 KB of RSC
// payload each. That is about 570 MB of static output per build before
// Vercel's precompressed copies, and the daily refresh produces a new
// deployment every day. Vercel retains every deployment's build output
// until it is deleted, and deployment retention policy is a Pro feature,
// so on Hobby the only lever is deleting deployments.
//
// The site's methodology page guarantees that every page is generated once
// a day and served as a file, so visitor traffic never reaches the store.
// Pruning deployments keeps that guarantee intact: it removes old copies of
// the site, never the way the current one is built.
//
// Safety. Dry run is the default and prints what it would delete without
// deleting anything. Nothing is deleted unless --apply is passed. The
// current production deployment and any deployment Vercel marks as a
// rollback candidate are never deleted, whatever KEEP is set to.
//
// Usage:
//   VERCEL_TOKEN=... node scripts/prune-deployments.mjs                 # dry run, all projects
//   VERCEL_TOKEN=... node scripts/prune-deployments.mjs --apply         # actually delete
//   VERCEL_TOKEN=... node scripts/prune-deployments.mjs --project filings-ledger --keep 3
//
// Create the token at https://vercel.com/account/tokens with scope
// the owning team. Keep it out of the repo: pass it in the
// environment, or put it in a file this repo's .gitignore already covers.

const TOKEN = process.env.VERCEL_TOKEN;
const TEAM = process.env.VERCEL_TEAM_ID || "team_tzZmaPeJG6xxOWR8e1IeD5fy";
const API = "https://api.vercel.com";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const KEEP = Number(valueOf("--keep") ?? 3);
const ONLY = valueOf("--project");

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

if (!TOKEN) {
  console.error("VERCEL_TOKEN is not set. Create one at https://vercel.com/account/tokens");
  process.exit(1);
}
if (!Number.isInteger(KEEP) || KEEP < 1) {
  console.error(`--keep must be a positive integer, got ${KEEP}`);
  process.exit(1);
}

async function api(path, init = {}) {
  const url = new URL(path, API);
  url.searchParams.set("teamId", TEAM);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// Vercel paginates deployments; follow until it stops handing back a cursor.
async function allDeployments(projectId) {
  const out = [];
  let until;
  for (;;) {
    const qs = until ? `&until=${until}` : "";
    const page = await api(`/v6/deployments?projectId=${projectId}&limit=100${qs}`);
    const batch = page.deployments || [];
    out.push(...batch);
    const next = page.pagination && page.pagination.next;
    if (!next || batch.length === 0) break;
    until = next;
  }
  return out;
}

function bytes(n) {
  if (n == null) return "unknown size";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

const projects = (await api("/v9/projects?limit=100")).projects
  .filter((p) => !ONLY || p.name === ONLY);

if (projects.length === 0) {
  console.error(ONLY ? `No project named ${ONLY}` : "No projects found");
  process.exit(1);
}

let deleted = 0;
let wouldDelete = 0;

for (const project of projects) {
  const deployments = await allDeployments(project.id);
  // Newest first is what the API already returns, but sort explicitly so the
  // keep window does not depend on that staying true.
  deployments.sort((a, b) => b.created - a.created);

  // Which deployment is actually live. Vercel spells this two ways
  // depending on the project, so read both rather than trusting one.
  const current = await api(`/v9/projects/${project.id}`)
    .then((p) =>
      (p.targets && p.targets.production && (p.targets.production.id || p.targets.production.uid)) ||
      (p.latestDeployment && (p.latestDeployment.id || p.latestDeployment.uid)) ||
      null
    )
    .catch(() => null);

  const keepIds = new Set();
  // The live production deployment, always.
  if (current) keepIds.add(current);
  // Anything Vercel considers a rollback target, always.
  for (const d of deployments) if (d.isRollbackCandidate) keepIds.add(d.uid || d.id);
  // Then the KEEP most recent production deployments.
  let kept = 0;
  for (const d of deployments) {
    if (d.target !== "production") continue;
    if (kept >= KEEP) break;
    keepIds.add(d.uid || d.id);
    kept++;
  }

  const doomed = deployments.filter((d) => !keepIds.has(d.uid || d.id));
  if (doomed.length === 0) {
    console.log(`${project.name}: ${deployments.length} deployments, nothing to prune`);
    continue;
  }

  console.log(
    `${project.name}: ${deployments.length} deployments, keeping ${keepIds.size}, ` +
    `${APPLY ? "deleting" : "would delete"} ${doomed.length}`
  );

  for (const d of doomed) {
    const id = d.uid || d.id;
    const when = new Date(d.created).toISOString().slice(0, 10);
    const what = `${when}  ${d.state.padEnd(9)}  ${d.target || "preview"}  ${id}`;
    if (!APPLY) {
      console.log(`    would delete  ${what}`);
      wouldDelete++;
      continue;
    }
    try {
      await api(`/v13/deployments/${id}`, { method: "DELETE" });
      console.log(`    deleted       ${what}`);
      deleted++;
    } catch (err) {
      console.log(`    FAILED        ${what}\n                  ${err.message}`);
    }
  }
}

console.log(
  APPLY
    ? `\nDeleted ${deleted} deployments. Re-check Usage, then Deployment Storage.`
    : `\nDry run: ${wouldDelete} deployments would be deleted. Re-run with --apply to do it.`
);
