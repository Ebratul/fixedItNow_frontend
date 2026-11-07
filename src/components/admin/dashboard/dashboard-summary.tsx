import { Alert } from "@/components/ui/alert";
import { adminReadMessage, serverAdminApi } from "@/lib/server-admin-api";
import { DashboardBody, type Dashboard } from "./dashboard-body";

/**
 * Server Component: reads `/admin/dashboard` with the visitor's own session and renders the figures as HTML.
 * Without a session (401), it renders nothing; the client shell shows the log-in form instead.
 */
export async function DashboardSummary({ days }: { days: number }) {
  const result = await serverAdminApi<Dashboard>(`/admin/dashboard?days=${days}`);
  if (result.ok) return <DashboardBody d={result.data} />;
  if (result.status === 401) return null;
  return <Alert tone="error" title="The dashboard could not be loaded">{adminReadMessage(result.status)}</Alert>;
}
