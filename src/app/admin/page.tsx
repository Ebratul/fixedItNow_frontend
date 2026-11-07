import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/admin/dashboard/dashboard-body";
import { DashboardFrame } from "@/components/admin/dashboard/dashboard-frame";
import { DashboardSummary } from "@/components/admin/dashboard/dashboard-summary";
import { dashboardWindowOf } from "@/components/admin/dashboard/dashboard-windows";

export const metadata: Metadata = { title: "Dashboard" };

export const instant = false; // renders after the admin sign-in check; see ../layout.tsx

/**
 * Server Component. The figures (stat cards, "Needs attention", money, recent activity) are rendered on the server
 * by DashboardSummary and stream in behind DashboardSkeleton. The period select and the charts are the only Client
 * Components.
 */
export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const days = dashboardWindowOf((await searchParams).days);
  return (
    <DashboardFrame days={days}>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardSummary days={days} />
      </Suspense>
    </DashboardFrame>
  );
}
