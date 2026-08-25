import { PageHeading } from "../../../components/page-heading";
import { SearchExplorer } from "../../../components/search-explorer";
export default function ExplorePage() {
  return (
    <>
      <PageHeading
        eyebrow="Knowledge retrieval"
        title="Explore KnownPaths"
        description="Search public, published knowledge with explicit technical context."
      />
      <SearchExplorer />
    </>
  );
}
