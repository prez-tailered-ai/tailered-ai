import { readAdrs } from "./company.js";
import type { EvalRow, ModelTier, RunOutcome } from "./contracts.js";
import { CompanyLedger } from "./ledger.js";

export async function renderDashboard(root: string): Promise<string> {
  const ledger = new CompanyLedger(root);
  const [evals, adrs] = await Promise.all([ledger.evals(), readAdrs(root)]);
  const latest = evals.at(-1);
  const decisions = adrs.slice(-5).reverse();
  const curves = tokensPerOutcome(evals);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Tailered company dashboard</title>
    <style>
      :root {
        color: #17211b;
        background: #f4f2ec;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-synthesis: none;
        --accent: #276044;
        --line: #cfcdc5;
      }
      * { box-sizing: border-box; }
      body { margin: 0; }
      main { width: min(76rem, calc(100% - 2rem)); margin: 3rem auto; }
      header { border-bottom: 2px solid var(--accent); padding-bottom: 1.25rem; }
      h1, h2, p { margin-top: 0; }
      h1 { margin-bottom: 0.4rem; font-size: clamp(2rem, 5vw, 4rem); letter-spacing: -0.045em; }
      h2 { margin-bottom: 1rem; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.08em; }
      .status { color: var(--accent); font-weight: 750; }
      section { margin-top: 2.5rem; }
      .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line); }
      .metric { padding: 1rem; border-right: 1px solid var(--line); }
      .metric:last-child { border-right: 0; }
      .metric span { display: block; color: #5d625e; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; }
      .metric strong { display: block; margin-top: 0.3rem; font-size: 1.35rem; }
      table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
      th, td { padding: 0.75rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
      th { color: #5d625e; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; }
      .decision { border-top: 1px solid var(--line); padding: 1rem 0; }
      .decision h3 { margin: 0 0 0.35rem; }
      .decision p { margin-bottom: 0; color: #4f5551; }
      code { font-family: ui-monospace, monospace; }
      @media (max-width: 48rem) {
        .metrics { grid-template-columns: 1fr 1fr; }
        .metric:nth-child(2) { border-right: 0; }
        .metric:nth-child(-n + 2) { border-bottom: 1px solid var(--line); }
        table { display: block; overflow-x: auto; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Company ledger</h1>
        <p>Pure render of repository state.</p>
      </header>
      <section>
        <h2>Latest run</h2>
        ${renderLatest(latest)}
      </section>
      <section>
        <h2>Tokens per outcome</h2>
        <table>
          <thead>
            <tr>
              <th>Outcome</th>
              <th>Runs</th>
              <th>Total tokens</th>
              <th>Tokens / outcome</th>
              <th>Total cost</th>
              <th>Cost / outcome</th>
            </tr>
          </thead>
          <tbody>${curves.map(renderCurveRow).join("")}</tbody>
        </table>
      </section>
      <section>
        <h2>Last five decisions</h2>
        ${
          decisions.length === 0
            ? "<p>No decisions recorded.</p>"
            : decisions
                .map(
                  (adr) => `<article class="decision">
          <h3>${escapeHtml(adr.id)} — ${escapeHtml(adr.title)}</h3>
          <p><span class="status">${escapeHtml(adr.rendered_status)}</span> · caused by ${escapeHtml(adr.caused_by.join(", ") || "root charter")}</p>
        </article>`,
                )
                .join("")
        }
      </section>
    </main>
  </body>
</html>
`;
}

interface OutcomeCurve {
  outcome: RunOutcome;
  runs: number;
  tokens: number;
  tokensPerOutcome: number;
  costUsd: number;
  costPerOutcomeUsd: number;
}

function tokensPerOutcome(evals: EvalRow[]): OutcomeCurve[] {
  const outcomes: RunOutcome[] = [
    "shipped",
    "halted_attempts",
    "halted_budget",
    "rejected",
  ];
  return outcomes.map((outcome) => {
    const rows = evals.filter((row) => row.outcome === outcome);
    const tokens = rows.reduce(
      (total, row) => total + sumTierTokens(row.tokens_by_tier),
      0,
    );
    const costUsd = rows.reduce((total, row) => total + row.cost_usd, 0);
    return {
      outcome,
      runs: rows.length,
      tokens,
      tokensPerOutcome: rows.length === 0 ? 0 : tokens / rows.length,
      costUsd,
      costPerOutcomeUsd: rows.length === 0 ? 0 : costUsd / rows.length,
    };
  });
}

function sumTierTokens(tokens: Record<ModelTier, number>): number {
  return tokens.frontier + tokens.mid + tokens.cheap;
}

function renderLatest(latest: EvalRow | undefined): string {
  if (!latest) {
    return "<p>No runs recorded.</p>";
  }
  return `<div class="metrics">
          <div class="metric"><span>Outcome</span><strong class="status">${escapeHtml(latest.outcome)}</strong></div>
          <div class="metric"><span>Tests</span><strong>${latest.tests_passed.length}/${latest.tests_total}</strong></div>
          <div class="metric"><span>Cost</span><strong>$${latest.cost_usd.toFixed(6)}</strong></div>
          <div class="metric"><span>Wall time</span><strong>${formatDuration(latest.wall_time_ms)}</strong></div>
        </div>
        ${latest.blocker ? `<p><strong>Blocker:</strong> ${escapeHtml(latest.blocker)}</p>` : ""}`;
}

function renderCurveRow(curve: OutcomeCurve): string {
  return `<tr>
              <td>${escapeHtml(curve.outcome)}</td>
              <td>${curve.runs}</td>
              <td>${curve.tokens.toLocaleString("en-US")}</td>
              <td>${Math.round(curve.tokensPerOutcome).toLocaleString("en-US")}</td>
              <td>$${curve.costUsd.toFixed(6)}</td>
              <td>$${curve.costPerOutcomeUsd.toFixed(6)}</td>
            </tr>`;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) {
    return `${milliseconds} ms`;
  }
  return `${(milliseconds / 1_000).toFixed(2)} s`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
