import Link from "next/link";
import { notFound } from "next/navigation";

import { PrivateContributionReveal } from "../../../../../components/private-contribution-reveal";
import { apiGet, KnownPathApiError } from "../../../../../lib/api";
import { adminDetailResponseSchema } from "../../../../../lib/contracts";

export default async function AdminDetailPage({
  params,
}: {
  params: Promise<{ resource: string; id: string }>;
}) {
  const { resource, id } = await params;
  try {
    const detail = await apiGet(
      `/api/v1/admin/resources/${resource}/${id}`,
      adminDetailResponseSchema,
    );
    return (
      <>
        <Link className="back-link" href={`/admin/resources/${resource}`}>
          ← Back to {resource}
        </Link>
        <header className="admin-page-heading compact">
          <div>
            <p className="eyebrow">{detail.resource}</p>
            <h1>{detail.title}</h1>
            <code>{detail.id}</code>
          </div>
          <span className="badge">{detail.status}</span>
        </header>
        {detail.privateContentAvailable ? (
          <PrivateContributionReveal contributionId={detail.id} />
        ) : null}
        <div className="admin-detail-grid">
          {detail.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.fields.length ? (
                <dl>
                  {section.fields.map((field, index) => (
                    <div key={`${field.label}-${index}`}>
                      <dt>{field.label}</dt>
                      <dd className={`tone-${field.tone}`}>{field.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {section.text ? (
                <pre className="untrusted-content" aria-label="Escaped untrusted source content">
                  {section.text}
                </pre>
              ) : null}
            </section>
          ))}
        </div>
        {detail.references.length ? (
          <section className="admin-references">
            <h2>Provenance</h2>
            <ul>
              {detail.references.map((reference, index) => (
                <li key={`${reference.url}-${index}`}>
                  <a href={reference.url} rel="noreferrer" target="_blank">
                    {reference.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </>
    );
  } catch (error) {
    if (error instanceof KnownPathApiError && error.status === 404) notFound();
    throw error;
  }
}
