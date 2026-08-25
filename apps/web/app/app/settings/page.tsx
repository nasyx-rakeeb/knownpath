import { accountSessionListResponseSchema } from "@knownpath/domain";
import { PageHeading } from "../../../components/page-heading";
import { SettingsManager } from "../../../components/settings-manager";
import { apiGet } from "../../../lib/api";
import { accountSchema, contributionSettingsSchema } from "../../../lib/contracts";
export default async function SettingsPage() {
  const [account, settings, sessions] = await Promise.all([
    apiGet("/api/v1/account/me", accountSchema),
    apiGet("/api/v1/account/contribution-settings", contributionSettingsSchema),
    apiGet("/api/v1/account/sessions", accountSessionListResponseSchema),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="Account controls"
        title="Settings"
        description="Manage identity, privacy defaults, password, and active browser sessions."
      />
      <SettingsManager
        account={account}
        initialMode={settings.contributionMode}
        initialSessions={sessions.sessions}
      />
    </>
  );
}
