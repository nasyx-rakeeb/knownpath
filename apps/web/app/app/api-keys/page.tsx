import { ApiKeyManager } from "../../../components/api-key-manager";
import { PageHeading } from "../../../components/page-heading";
import { apiGet } from "../../../lib/api";
import { apiKeyListSchema } from "../../../lib/contracts";
export default async function ApiKeysPage() {
  const { apiKeys } = await apiGet("/api/v1/api-keys", apiKeyListSchema);
  return (
    <>
      <PageHeading
        eyebrow="Agent access"
        title="API keys"
        description="Issue scoped credentials for MCP and installer-managed agent connections."
      />
      <ApiKeyManager initialKeys={apiKeys} />
    </>
  );
}
