import type { ReactNode } from "react";
import { StatCard, StatGrid } from "@/components/admin/kit/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { UserDetail } from "./types";
import { UserAccountActions } from "./user-detail";
import { UserBadges } from "./user-badges";

/*
 * The read-only parts of /admin/users/[id]: the account facts, the activity counts and the recent admin actions.
 * No "use client": they render on the server (UserDetail in user-detail-server.tsx) and ship as HTML. Only
 * UserAccountActions (suspension and the admin-role select) is a Client Component.
 */

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

export function UserFacts({ user }: { user: UserDetail }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-extrabold text-brand-950">{user.name || "(no name)"}</h2>
        {user.suspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}
      </div>
      <div className="mt-2"><UserBadges user={user} /></div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Email">{user.email} <span className="text-xs text-ink-subtle">({user.emailVerified ? "verified" : "not verified"})</span></Fact>
        <Fact label="User id"><span className="font-mono text-xs">{user.id}</span></Fact>
        <Fact label="Account role">{user.role === "ADMIN" ? `Administrator${user.adminRole ? `: ${user.adminRole.name}` : ""}` : "Regular user"}</Fact>
        <Fact label="Joined">{formatDateTime(user.createdAt)}</Fact>
        <Fact label="Last updated">{formatDateTime(user.updatedAt)}</Fact>
        <Fact label="Signed in on">{user.activeSessions} {user.activeSessions === 1 ? "device" : "devices"}</Fact>
        {user.customerProfile && <Fact label="Customer profile">{user.customerProfile.displayName ?? "No display name"}{user.customerProfile.preferredDivision ? `, ${user.customerProfile.preferredDivision}` : ""}</Fact>}
        {user.worker && <Fact label="Worker profile">{user.worker.published ? "Published" : "Not published"}</Fact>}
      </dl>
    </Card>
  );
}

export function UserActivity({ counts: c }: { counts: UserDetail["counts"] }) {
  return (
    <section aria-labelledby="counts-h" className="space-y-3">
      <h2 id="counts-h" className="text-lg font-bold text-brand-950">Activity</h2>
      <StatGrid>
        <StatCard label="Bookings as customer" value={c.bookingsAsCustomer} />
        <StatCard label="Bookings as worker" value={c.bookingsAsWorker} />
        <StatCard label="Support tickets" value={c.supportTickets} />
        <StatCard label="Reports filed" value={c.reportsFiled} />
        <StatCard label="Community posts" value={c.posts} />
        <StatCard label="Reviews written" value={c.reviews} />
      </StatGrid>
    </section>
  );
}

export function RecentActions({ actions }: { actions: UserDetail["recentActions"] }) {
  return (
    <section aria-labelledby="actions-h" className="space-y-3">
      <h2 id="actions-h" className="text-lg font-bold text-brand-950">Recent admin actions on this account</h2>
      {actions.length === 0 ? (
        <p className="text-ink-muted">No administrator has acted on this account yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-canvas">
          {actions.map((a) => (
            <li key={a.id} className="px-4 py-3 text-sm">
              <p><span className="font-mono font-semibold">{a.action}</span> by {a.by} <span className="text-ink-subtle">· {formatDateTime(a.createdAt)}</span></p>
              {a.reason && <p className="mt-1 text-ink-muted">Reason: {a.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The whole detail in its original order: facts, activity, the client actions island, recent actions. */
export function UserDetailContent({ user }: { user: UserDetail }) {
  return (
    <>
      <UserFacts user={user} />
      <UserActivity counts={user.counts} />
      <UserAccountActions user={user} />
      <RecentActions actions={user.recentActions} />
    </>
  );
}
