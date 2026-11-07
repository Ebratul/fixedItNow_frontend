import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { StatCard, StatGrid } from "@/components/admin/kit/stat-card";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBdt, formatDateTime } from "@/lib/format";
import type { Point } from "./bar-chart";
import { BarChartSkeleton, LazyBarChart } from "./lazy-bar-chart";

/*
 * The dashboard's figures. No "use client": this module renders on the server (DashboardSummary), so its stat
 * cards, "Needs attention", money and recent-activity sections ship as HTML with no JavaScript. Only the charts are
 * Client Components (LazyBarChart: hover and the table toggle), loaded as their own chunk.
 */

export type Dashboard = {
  generatedAt: string;
  days: number;
  users: { total: number; new: number; suspended: number; customers: number };
  workers: { total: number; verified: number; pending: number; rejected: number; resubmission: number; notSubmitted: number; published: number };
  bookings: { total: number; new: number; byStatus: Record<string, number> };
  attention: { key: string; label: string; count: number; href: string }[];
  trends: { newUsers: Point[]; bookings: Point[] };
  finance: { collectedBdt: number; refundedBdt: number; netBdt: number; payments: number; series: Point[] } | null;
  recentActivity: { id: string; action: string; targetType: string; at: string; by: string }[] | null;
};

export function DashboardBody({ d }: { d: Dashboard }) {
  const open = d.attention.filter((a) => a.count > 0);
  return (
    <div className="space-y-8">
      <section aria-labelledby="attention-h">
        <h2 id="attention-h" className="text-lg font-bold">Needs attention</h2>
        {d.attention.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Your role has no work queues.</p>
        ) : open.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted"><CheckCircle2 className="size-4 text-success" aria-hidden /> Nothing is waiting for a decision right now.</p>
        ) : null}
        {d.attention.length > 0 && (
          <div className="mt-3"><StatGrid>{d.attention.map((a) => <StatCard key={a.key} label={a.label} value={a.count} href={a.href} />)}</StatGrid></div>
        )}
      </section>

      <section aria-labelledby="platform-h">
        <h2 id="platform-h" className="text-lg font-bold">Platform</h2>
        <div className="mt-3">
          <StatGrid>
            <StatCard label="Users" value={d.users.total} hint={`${d.users.new} new in ${d.days} days`} />
            <StatCard label="Customers set up" value={d.users.customers} />
            <StatCard label="Suspended accounts" value={d.users.suspended} />
            <StatCard label="Workers" value={d.workers.total} hint={`${d.workers.verified} verified · ${d.workers.published} listed`} />
            <StatCard label="Applications pending" value={d.workers.pending} hint={`${d.workers.resubmission} asked to resubmit · ${d.workers.rejected} rejected`} />
            <StatCard label="Bookings" value={d.bookings.total} hint={`${d.bookings.new} new in ${d.days} days`} />
            <StatCard label="Confirmed / in progress" value={(d.bookings.byStatus.CONFIRMED ?? 0) + (d.bookings.byStatus.IN_PROGRESS ?? 0)} />
            <StatCard label="Completed" value={d.bookings.byStatus.COMPLETED ?? 0} hint={`${d.bookings.byStatus.DISPUTED ?? 0} in dispute`} />
          </StatGrid>
        </div>
      </section>

      <section aria-labelledby="trends-h">
        <h2 id="trends-h" className="text-lg font-bold">Trends</h2>
        <p className="mt-1 text-xs text-ink-subtle">Days are Bangladesh calendar days. Updated {formatDateTime(d.generatedAt)}.</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <LazyBarChart title="New users per day" points={d.trends.newUsers} />
          <LazyBarChart title="New bookings per day" points={d.trends.bookings} />
          {d.finance && <LazyBarChart title="Money collected per day (BDT)" points={d.finance.series} unit="bdt" />}
        </div>
      </section>

      {d.finance && (
        <section aria-labelledby="money-h">
          <h2 id="money-h" className="text-lg font-bold">Money, last {d.days} days</h2>
          <p className="mt-1 text-xs text-ink-subtle">Only payments confirmed by the provider count. <Link href="/admin/finance" className="font-semibold text-brand-700 underline">Full reports</Link></p>
          <div className="mt-3"><StatGrid>
            <StatCard label="Collected" value={formatBdt(d.finance.collectedBdt)} hint={`${d.finance.payments} payments`} />
            <StatCard label="Refunded" value={formatBdt(d.finance.refundedBdt)} />
            <StatCard label="Net" value={formatBdt(d.finance.netBdt)} />
          </StatGrid></div>
        </section>
      )}

      {d.recentActivity && (
        <section aria-labelledby="activity-h">
          <div className="flex items-baseline justify-between"><h2 id="activity-h" className="text-lg font-bold">Recent admin activity</h2><Link href="/admin/audit" className="text-sm font-semibold text-brand-700 underline">Audit log</Link></div>
          <Card className="mt-3 divide-y divide-line">
            {d.recentActivity.length === 0 ? <p className="p-4 text-sm text-ink-muted">No activity yet.</p> : d.recentActivity.map((a) => (
              <p key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><span><span className="font-mono text-xs">{a.action}</span> · {a.by}</span><span className="text-xs text-ink-subtle">{formatDateTime(a.at)}</span></p>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

/** The dashboard's layout while the figures load: the stat grids and the three chart boxes at their real height. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading the dashboard">
      <Skeleton className="h-24" />
      <Skeleton className="h-48" />
      <div className="grid gap-4 lg:grid-cols-2">
        <BarChartSkeleton title="New users per day" />
        <BarChartSkeleton title="New bookings per day" />
      </div>
    </div>
  );
}
