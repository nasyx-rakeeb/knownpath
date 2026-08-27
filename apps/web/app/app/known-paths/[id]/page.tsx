import { knownPathDetailResponseSchema } from "@knownpath/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading, StatusBadge } from "../../../../components/page-heading";
import { apiGet, KnownPathApiError } from "../../../../lib/api";
import { formatDate, words } from "../../../../lib/format";
import { PublicShareForm } from "../../../../components/public-share-form";

export default async function KnownPathPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scope?: string; workspaceId?: string }>;
}) {
  const { id } = await params;
  const requestedScope = await searchParams;
  const scope = ["public", "personal", "workspace", "workspace_and_public"].includes(
    requestedScope.scope ?? "public",
  )
    ? (requestedScope.scope ?? "public")
    : "public";
  const query = new URLSearchParams({ scope });
  if (requestedScope.workspaceId !== undefined)
    query.set("workspaceId", requestedScope.workspaceId);
  let path;
  try {
    path = await apiGet(
      `/api/v1/known-paths/${encodeURIComponent(id)}?${query.toString()}`,
      knownPathDetailResponseSchema,
    );
  } catch (error) {
    if (error instanceof KnownPathApiError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <Link className="back-link" href="/app/explore">
        ← Back to search
      </Link>
      <PageHeading
        eyebrow={`${path.applicability.ecosystem} knowledge`}
        title={path.title}
        description={path.problemSummary}
      />
      <div className="evidence-strip">
        <div>
          <span>Trust</span>
          <strong>{path.trust.score}/100</strong>
          <small>{words(path.trust.grade)}</small>
        </div>
        <div>
          <span>Freshness</span>
          <strong>{words(path.freshness.status)}</strong>
          <small>
            {path.freshness.lastVerifiedAt === undefined
              ? "Not yet verified"
              : formatDate(path.freshness.lastVerifiedAt)}
          </small>
        </div>
        <div>
          <span>Outcomes</span>
          <strong>{words(path.outcomes.status)}</strong>
          <small>{path.outcomes.explanation}</small>
        </div>
        <div>
          <span>State</span>
          <StatusBadge tone={path.status === "published" ? "good" : "warn"}>
            {path.status}
          </StatusBadge>
        </div>
      </div>
      <div className="detail-columns">
        <div>
          <section className="section-block">
            <p className="eyebrow">Symptoms</p>
            <h2>What this path addresses</h2>
            <ul className="plain-list">
              {path.symptoms.map((item) => (
                <li key={item.summary}>{item.summary}</li>
              ))}
            </ul>
            {path.errors.length === 0 ? null : (
              <div className="error-stack">
                {path.errors.map((item) => (
                  <code key={item.normalized}>{item.normalized}</code>
                ))}
              </div>
            )}
          </section>
          {path.solutions.map((solution, index) => (
            <section className="section-block solution" key={solution.id}>
              <p className="eyebrow">Solution {index + 1}</p>
              <h2>{solution.summary}</h2>
              <ol className="steps">
                {solution.steps.map((step) => (
                  <li key={step.order}>
                    <span>{step.order}</span>
                    <div>
                      {step.title === undefined ? null : <h3>{step.title}</h3>}
                      <p>{step.instruction}</p>
                      {step.code === undefined ? null : (
                        <pre>
                          <code>{step.code}</code>
                        </pre>
                      )}
                      {step.verification === undefined ? null : (
                        <p className="verification">
                          <b>Verify:</b> {step.verification}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              {solution.caveats.length === 0 ? null : (
                <div className="caveat">
                  <strong>Conditions and caveats</strong>
                  <ul>
                    {solution.caveats.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </div>
        <aside>
          <section className="side-section">
            <p className="eyebrow">Applicability</p>
            <dl>
              <dt>Platforms</dt>
              <dd>{path.applicability.platforms.join(", ") || "Unspecified"}</dd>
              <dt>Versions</dt>
              <dd>{path.applicability.versions.join(", ") || "Unspecified"}</dd>
              <dt>Packages</dt>
              <dd>
                {path.applicability.packages
                  .map((item) =>
                    item.version === undefined ? item.name : `${item.name} ${item.version}`,
                  )
                  .join(", ") || "Unspecified"}
              </dd>
            </dl>
          </section>
          <section className="side-section">
            <p className="eyebrow">Why trust it</p>
            <p>{path.trust.explanation}</p>
          </section>
          <section className="side-section">
            <p className="eyebrow">Provenance</p>
            <ul className="source-list">
              {path.provenance.map((source) => (
                <li key={`${source.sourceItemId}:${source.relationship}`}>
                  <a href={source.canonicalUrl} rel="noreferrer" target="_blank">
                    {source.title ?? source.publisher}
                  </a>
                  <small>
                    {words(source.authority)} · {words(source.relationship)}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      {path.visibility.scope === "public" ? null : <PublicShareForm path={path} />}
    </>
  );
}
