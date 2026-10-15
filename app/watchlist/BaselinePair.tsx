import type { Baseline } from "@/lib/db";

// Two numbers side by side, never a ratio. The window count, then the
// baseline year scaled to the window's length by entity_activity_baseline()
// itself, with the raw counts underneath so the scaling is checkable. The
// Defense line appears only for contract awards, where USAspending's 90 day
// Defense delay makes the pair uneven; see defenseCoverage() in lib/db.ts.
export function ContractPair({ b }: { b: Baseline }) {
  return (
    <>
      <span className="pair">
        {b.window_contract_awards} <span className="pair-sep">in window</span>{" "}
        {b.baseline_contract_awards_per_window} <span className="pair-sep">baseline per window</span>
      </span>
      <div className="cite-line">
        baseline year {b.baseline_contract_awards.toLocaleString("en-US")}
        {b.baseline_contract_awards > 0 &&
          `, of which Defense ${b.baseline_defense_awards.toLocaleString("en-US")}`}
        ; window Defense {b.window_defense_awards}
      </div>
    </>
  );
}

export function LobbyingPair({ b }: { b: Baseline }) {
  return (
    <>
      <span className="pair">
        {b.window_lobbying_filings} <span className="pair-sep">in window</span>{" "}
        {b.baseline_lobbying_filings_per_window} <span className="pair-sep">baseline per window</span>
      </span>
      <div className="cite-line">
        baseline year {b.baseline_lobbying_filings.toLocaleString("en-US")}
      </div>
    </>
  );
}
