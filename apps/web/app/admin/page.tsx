import Link from "next/link";

import { apiGet } from "../../lib/api";
import { adminOverviewResponseSchema } from "../../lib/contracts";

export default async function AdminOverviewPage() {
  const overview = await apiGet("/api/v1/admin/overview", adminOverviewResponseSchema);
  const cards = [
    ["Sources", overview.counts["sources"] ?? 0, "/admin/resources/sources"],
    ["Pipeline runs", overview.counts["jobs"] ?? 0, "/admin/resources/jobs"],
    ["Candidates", overview.counts["candidates"] ?? 0, "/admin/resources/candidates"],
    ["KnownPaths", overview.counts["knownPaths"] ?? 0, "/admin/resources/known-paths"],
    ["Contributions", overview.counts["contributions"] ?? 0, "/admin/resources/contributions"],
    ["Outcome reports", overview.counts["outcomes"] ?? 0, "/admin/resources/outcomes"],
    ["Users", overview.counts["users"] ?? 0, "/admin/resources/users"],
    ["Audit events", overview.counts["audit"] ?? 0, "/admin/resources/audit"],
  ] as const;
  return (
    <>
      <header className="admin-page-heading">
        <div>
          <p className="eyebrow">Network operations</p>
          <h1>Admin overview</h1>
          <p>Real system state, moderation queues, and evidence-grounded operational controls.</p>
        </div>
        <span className={`badge ${overview.queues.status === "ok" ? "badge-good" : "badge-warn"}`}>
          Queues {overview.queues.status}
        </span>
      </header>
      <section className="admin-metric-grid" aria-label="System record counts">
        {cards.map(([label, value, href]) => (
          <Link href={href} key={label}>
            <span>{label}</span>
            <strong>{value.toLocaleString()}</strong>
            <small>Inspect records</small>
          </Link>
        ))}
      </section>
      <section className="admin-callout">
        <div>
          <p className="eyebrow">Safety boundary</p>
          <h2>High-impact changes require a fresh session.</h2>
          <p>
            Merge, split, moderation, queue controls, user suspension, and private-content reveal
            are checked again by the backend and require exact target confirmation.
          </p>
        </div>
        <Link className="button" href="/admin/controls">
          Open controlled actions
        </Link>
      </section>
      <section className="admin-system-strip" aria-label="Safe provider and worker health">
        <div>
          <span>Active workers</span>
          <strong>{overview.queues.activeWorkers}</strong>
        </div>
        <div>
          <span>Gemini</span>
          <strong>{overview.providers.gemini}</strong>
        </div>
        <div>
          <span>Embedding model</span>
          <strong>{overview.providers.embeddingModel}</strong>
        </div>
        <div>
          <span>Search backend</span>
          <strong>{overview.providers.searchBackend}</strong>
        </div>
      </section>
    </>
  );
}
