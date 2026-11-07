import { Badge } from "@/components/ui/badge";
import type { UserRow } from "./types";

/* No "use client": used by the users list (client) and by the user detail page's server-rendered facts. */

export const VERIFICATION_LABELS: Record<string, string> = {
  NOT_SUBMITTED: "not submitted",
  PENDING: "pending review",
  VERIFIED: "verified",
  REJECTED: "rejected",
  RESUBMISSION_REQUIRED: "resubmission required",
};

export function UserBadges({ user }: { user: UserRow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.role === "ADMIN" && <Badge tone="brand">Admin{user.adminRole ? `: ${user.adminRole.name}` : ""}</Badge>}
      {user.isCustomer && <Badge>Customer</Badge>}
      {user.worker && <Badge tone={user.worker.verificationStatus === "VERIFIED" ? "success" : "neutral"}>Worker: {VERIFICATION_LABELS[user.worker.verificationStatus] ?? user.worker.verificationStatus.toLowerCase()}</Badge>}
      {!user.isCustomer && !user.worker && user.role !== "ADMIN" && <Badge>No profile yet</Badge>}
    </div>
  );
}
