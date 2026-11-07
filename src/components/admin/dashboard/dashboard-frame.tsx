"use client";

import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition, type ReactNode } from "react";
import { AdminPage } from "@/components/admin/kit/admin-page";
import { SelectInput } from "@/components/ui/select-input";
import { DASHBOARD_WINDOWS } from "./dashboard-windows";

const OPTIONS = DASHBOARD_WINDOWS.map((d) => ({ value: String(d), label: `Last ${d} days` }));

/**
 * The client part of the dashboard: the page frame (permission check) and the period select. The figures arrive as
 * `children`, rendered on the server. Changing the period updates `?days=` in a transition: the current figures
 * stay on screen, dimmed, until the server sends the new ones.
 */
export function DashboardFrame({ days, children }: { days: number; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [shownDays, setShownDays] = useOptimistic(days);
  const choose = (value: string) =>
    startTransition(() => {
      setShownDays(Number(value));
      router.replace(`${pathname}?days=${value}`, { scroll: false });
    });

  return (
    <AdminPage
      title="Dashboard"
      permission="dashboard.view"
      description="Live figures from the database. Only the sections your role can open are shown."
      actions={<SelectInput id="dash-days" label="Period" hideLabel placeholder={null} value={String(shownDays)} onChange={(e) => choose(e.target.value)} options={OPTIONS} />}
    >
      <div aria-busy={pending || undefined} className={pending ? "opacity-60 transition-opacity" : undefined}>
        {children}
      </div>
    </AdminPage>
  );
}
