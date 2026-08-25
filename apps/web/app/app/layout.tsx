import { AppShell } from "../../components/app-shell";
import { apiGet } from "../../lib/api";
import { accountSchema } from "../../lib/contracts";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const account = await apiGet("/api/v1/account/me", accountSchema);
  return <AppShell account={account}>{children}</AppShell>;
}
