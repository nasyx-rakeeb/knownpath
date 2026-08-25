import { contributionHistoryResponseSchema } from "@knownpath/domain";
import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { PageHeading, StatusBadge } from "../../../components/page-heading";
import { apiGet } from "../../../lib/api";
import { formatDate, words } from "../../../lib/format";
export default async function ContributionsPage() {
  const data = await apiGet(
    "/api/v1/account/contributions?limit=50",
    contributionHistoryResponseSchema,
  );
  return (
    <>
      <PageHeading
        eyebrow="Shared learning"
        title="Your contributions"
        description="Only sanitized, generalized experience appears here. Private records remain owner-scoped."
      />
      {data.items.length === 0 ? (
        <EmptyState title="No contributions yet">
          The KnownPath skill asks before sharing a public lesson and only contributes after a real
          successful outcome.
        </EmptyState>
      ) : (
        <div className="record-list">
          {data.items.map((item) => (
            <article key={item.contributionId}>
              <div className="record-top">
                <div>
                  <p className="eyebrow">
                    {item.kind} · {formatDate(item.createdAt)}
                  </p>
                  <h2>{item.problem}</h2>
                </div>
                <div className="badge-row">
                  <StatusBadge tone={item.visibility === "private" ? "neutral" : "good"}>
                    {item.visibility}
                  </StatusBadge>
                  <StatusBadge
                    tone={
                      item.status === "accepted"
                        ? "good"
                        : item.status === "quarantined"
                          ? "danger"
                          : "warn"
                    }
                  >
                    {words(item.processingStage)}
                  </StatusBadge>
                </div>
              </div>
              <p>{item.solutionSummary}</p>
              <dl className="inline-facts">
                <div>
                  <dt>Sanitization</dt>
                  <dd>
                    {item.sanitization.status} · {item.sanitization.findingCount} findings
                  </dd>
                </div>
                <div>
                  <dt>Trust</dt>
                  <dd>{words(item.trustState)}</dd>
                </div>
              </dl>
              {item.knownPathId === undefined ? null : (
                <Link className="text-link" href={`/app/known-paths/${item.knownPathId}`}>
                  View resulting KnownPath
                </Link>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
