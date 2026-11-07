import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { adminReadMessage, serverAdminApi } from "@/lib/server-admin-api";
import type { UserDetail as UserDetailData } from "./types";
import { UserDetailContent } from "./user-detail-sections";

/**
 * Server Component: reads `/admin/users/:id` with the visitor's own session. An unknown id is a 404 page, and a
 * missing session renders nothing (the client shell shows the log-in form).
 */
export async function UserDetail({ id }: { id: string }) {
  const result = await serverAdminApi<{ user: UserDetailData }>(`/admin/users/${encodeURIComponent(id)}`);
  if (result.ok) return <UserDetailContent user={result.data.user} />;
  if (result.status === 404) notFound();
  if (result.status === 401) return null;
  return <Alert tone="error" title="This account could not be loaded">{adminReadMessage(result.status)}</Alert>;
}
