import { PageHeading } from "../../../components/page-heading";
import { SearchExplorer } from "../../../components/search-explorer";
import { apiGet } from "../../../lib/api";
import { workspaceListResponseSchema } from "../../../lib/contracts";

export default async function ExplorePage() {
  const { workspaces } = await apiGet("/api/v1/workspaces", workspaceListResponseSchema);
  return (
    <>
      <PageHeading
        eyebrow="Knowledge retrieval"
        title="Explore KnownPaths"
        description="Search public, personal, or authorized workspace knowledge with explicit technical context."
      />
      <SearchExplorer workspaces={workspaces} />
    </>
  );
}
