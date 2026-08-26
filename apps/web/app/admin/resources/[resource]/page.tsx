import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGet } from "../../../../lib/api";
import { adminListResponseSchema } from "../../../../lib/contracts";

const resources = new Set([
  "sources",
  "source-items",
  "jobs",
  "extractions",
  "candidates",
  "known-paths",
  "contributions",
  "outcomes",
  "users",
  "audit",
]);
const labels: Record<string, string> = {
  sources: "Source registry",
  "source-items": "Normalized sources",
  jobs: "Pipeline runs",
  extractions: "Extraction attempts",
  candidates: "Candidate experiences",
  "known-paths": "Canonical KnownPaths",
  contributions: "Contributions",
  outcomes: "Outcome and safety reports",
  users: "Users and API-key metadata",
  audit: "Audit history",
};

export default async function AdminResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ cursor?: string; status?: string; search?: string }>;
}) {
  const { resource } = await params;
  if (!resources.has(resource)) notFound();
  const query = await searchParams;
  const url = new URL(`/api/v1/admin/resources/${resource}`, "https://knownpath.invalid");
  if (query.cursor) url.searchParams.set("cursor", query.cursor);
  if (query.status) url.searchParams.set("status", query.status);
  if (query.search) url.searchParams.set("search", query.search);
  const result = await apiGet(`${url.pathname}${url.search}`, adminListResponseSchema);
  return (
    <>
      <header className="admin-page-heading compact">
        <div>
          <p className="eyebrow">Operations records</p>
          <h1>{labels[resource]}</h1>
          <p>Paginated, server-authorized views projected from the real KnownPath domain model.</p>
        </div>
        {resource === "sources" ? (
          <Link className="quiet-button" href="/admin/resources/source-items">
            Inspect source items
          </Link>
        ) : null}
      </header>
      <form className="admin-filter" method="get">
        <label>
          Search
          <input
            defaultValue={query.search}
            name="search"
            placeholder="Name, email, or identifier"
          />
        </label>
        <label>
          Status
          <input defaultValue={query.status} name="status" placeholder="Optional exact status" />
        </label>
        <button className="quiet-button" type="submit">
          Apply filters
        </button>
      </form>
      {result.items.length === 0 ? (
        <div className="empty-state">
          <h2>No matching records</h2>
          <p>The view reflects the current database; no placeholder operations data is shown.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Status</th>
                <th>Context</th>
                <th>Observed</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/admin/resources/${resource}/${item.id}`}>{item.title}</Link>
                    <code>{item.id}</code>
                  </td>
                  <td>
                    <span className={`badge ${tone(item.status)}`}>{item.status}</span>
                  </td>
                  <td>
                    {Object.entries(item.facts).map(([key, value]) => (
                      <span className="fact" key={key}>
                        {key}: {String(value)}
                      </span>
                    ))}
                  </td>
                  <td>{item.occurredAt?.toLocaleString() ?? "Unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.nextCursor ? (
        <Link
          className="quiet-button admin-next"
          href={`?cursor=${encodeURIComponent(result.nextCursor)}${query.status ? `&status=${encodeURIComponent(query.status)}` : ""}${query.search ? `&search=${encodeURIComponent(query.search)}` : ""}`}
        >
          Next page
        </Link>
      ) : null}
    </>
  );
}

function tone(status: string) {
  return /failed|quarantined|rejected|suspended|restricted/iu.test(status)
    ? "badge-danger"
    : /pending|review|stale|flagged|disabled/iu.test(status)
      ? "badge-warn"
      : /active|completed|published|approved|enabled|success/iu.test(status)
        ? "badge-good"
        : "";
}
