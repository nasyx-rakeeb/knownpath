import { WorkspaceManager } from "../../../components/workspace-manager";
import { PageHeading } from "../../../components/page-heading";
import { apiGet } from "../../../lib/api";
import { workspaceListResponseSchema } from "../../../lib/contracts";

export default async function WorkspacesPage() {
  const initial = await apiGet("/api/v1/workspaces", workspaceListResponseSchema);
  return (
    <>
      <PageHeading
        eyebrow="Private team memory"
        title="Workspaces"
        description="Share scoped knowledge with an authorized team without exposing it to the public network. Membership and search access are enforced by the backend."
      />
      <WorkspaceManager initial={initial} />
    </>
  );
}
