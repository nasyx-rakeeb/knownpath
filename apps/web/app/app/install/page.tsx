import { InstallGuide } from "../../../components/install-guide";
import { PageHeading } from "../../../components/page-heading";
export default function InstallPage() {
  return (
    <>
      <PageHeading
        eyebrow="Agent onboarding"
        title="Connect KnownPath"
        description="Install the MCP bridge and portable skill without manually editing every agent."
      />
      <InstallGuide />
    </>
  );
}
