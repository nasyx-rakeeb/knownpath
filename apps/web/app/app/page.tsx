import { accountDashboardResponseSchema } from "@knownpath/domain";
import Link from "next/link";
import { EmptyState } from "../../components/empty-state";
import { PageHeading, StatusBadge } from "../../components/page-heading";
import { apiGet } from "../../lib/api";
import { formatDate, words } from "../../lib/format";

export default async function OverviewPage() {
  const dashboard = await apiGet("/api/v1/account/dashboard", accountDashboardResponseSchema);
  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title="Your KnownPath activity"
        description={`A privacy-safe view of the last ${dashboard.windowDays} days.`}
        action={
          <Link className="button" href="/app/explore">
            Search knowledge
          </Link>
        }
      />
      <section className="metric-grid" aria-label="Account metrics">
        <article>
          <span>Searches</span>
          <strong>{dashboard.searches.total}</strong>
          <small>{dashboard.searches.selected} selected</small>
        </article>
        <article>
          <span>Contributions</span>
          <strong>{dashboard.contributions.total}</strong>
          <small>{dashboard.contributions.complete} processed</small>
        </article>
        <article>
          <span>Helpful outcomes</span>
          <strong>{dashboard.outcomes.solved + dashboard.outcomes.partiallyHelped}</strong>
          <small>{dashboard.outcomes.total} total reports</small>
        </article>
        <article>
          <span>Active API keys</span>
          <strong>{dashboard.apiKeys.active}</strong>
          <small>
            {dashboard.apiKeys.lastUsedAt === undefined
              ? "No usage yet"
              : `Last used ${formatDate(dashboard.apiKeys.lastUsedAt)}`}
          </small>
        </article>
      </section>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Account timeline</p>
            <h2>Recent activity</h2>
          </div>
        </div>
        {dashboard.recentActivity.length === 0 ? (
          <EmptyState title="No activity yet">
            Install KnownPath or search the knowledge base to begin.
          </EmptyState>
        ) : (
          <div className="data-list">
            {dashboard.recentActivity.map((item) => (
              <article key={`${item.kind}:${item.id}`}>
                <div>
                  <small>
                    {words(item.kind)} · {formatDate(item.occurredAt)}
                  </small>
                  <h3>{item.label}</h3>
                </div>
                <StatusBadge>{words(item.status)}</StatusBadge>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
