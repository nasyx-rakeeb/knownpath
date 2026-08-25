import { outcomeHistoryResponseSchema } from "@knownpath/domain";
import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { PageHeading, StatusBadge } from "../../../components/page-heading";
import { apiGet } from "../../../lib/api";
import { formatDate, words } from "../../../lib/format";
export default async function OutcomesPage() {
  const data = await apiGet("/api/v1/account/outcomes?limit=50", outcomeHistoryResponseSchema);
  return (
    <>
      <PageHeading
        eyebrow="Learning loop"
        title="Outcome history"
        description="Private account history of solutions your agents actually attempted. Views alone never count as success."
      />
      {data.items.length === 0 ? (
        <EmptyState title="No reported outcomes">
          After an agent attempts a KnownPath, the skill can report whether it solved, helped,
          failed, or did not fit.
        </EmptyState>
      ) : (
        <div className="record-list">
          {data.items.map((item) => (
            <article key={item.outcomeId}>
              <div className="record-top">
                <div>
                  <p className="eyebrow">{formatDate(item.receivedAt)}</p>
                  <h2>
                    <Link href={`/app/known-paths/${item.knownPathId}`}>
                      {item.knownPathTitle ?? item.knownPathId}
                    </Link>
                  </h2>
                </div>
                <StatusBadge
                  tone={
                    item.outcome === "solved"
                      ? "good"
                      : item.outcome === "misleading_or_unsafe"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {words(item.outcome)}
                </StatusBadge>
              </div>
              {item.note === undefined ? null : <p>{item.note}</p>}
              <div className="result-meta">
                <span>{item.environment.ecosystem ?? "ecosystem unspecified"}</span>
                <span>{item.environment.platforms.join(", ") || "platform unspecified"}</span>
                <span>{words(item.influence)}</span>
              </div>
              {item.safetyReviewQueued ? (
                <p className="safety-note">
                  Safety review was queued. Review state remains separate from ranking.
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
