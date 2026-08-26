import { notFound } from "next/navigation";

import { AdminShell } from "../../components/admin-shell";
import { apiGet, KnownPathApiError } from "../../lib/api";
import { adminOverviewResponseSchema } from "../../lib/contracts";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    const overview = await apiGet("/api/v1/admin/overview", adminOverviewResponseSchema);
    return <AdminShell overview={overview}>{children}</AdminShell>;
  } catch (error) {
    if (error instanceof KnownPathApiError && error.status === 403) notFound();
    throw error;
  }
}
