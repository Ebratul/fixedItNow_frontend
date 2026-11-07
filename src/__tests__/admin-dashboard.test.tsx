import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin" }));
const serverAdminApi = vi.fn();
vi.mock("@/lib/server-admin-api", async (orig) => ({ ...(await orig<typeof import("@/lib/server-admin-api")>()), serverAdminApi: (...a: unknown[]) => serverAdminApi(...a) }));
vi.mock("server-only", () => ({}));

import { AdminProvider } from "@/components/admin/shell/admin-context";
import { DashboardBody, type Dashboard } from "@/components/admin/dashboard/dashboard-body";
import { DashboardFrame } from "@/components/admin/dashboard/dashboard-frame";
import { DashboardSummary } from "@/components/admin/dashboard/dashboard-summary";
import { BarChart } from "@/components/admin/dashboard/bar-chart";
import type { Me } from "@/lib/use-api";

const me = (permissions: string[]) => ({ user: { id: "a1", name: "Admin", email: "a@x.test", emailVerified: true, image: null }, isAdmin: true, admin: { role: { key: "r", name: "Role" }, permissions }, customer: { onboarded: false }, worker: { started: false, approved: false } }) as unknown as Me;
const days = (n: number) => Array.from({ length: n }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, value: i % 3 }));
const data = (over: Partial<Dashboard> = {}): Dashboard => ({
  generatedAt: "2026-11-07T06:00:00Z", days: 7,
  users: { total: 120, new: 9, suspended: 2, customers: 80 },
  workers: { total: 30, verified: 20, pending: 4, rejected: 1, resubmission: 2, notSubmitted: 3, published: 18 },
  bookings: { total: 55, new: 6, byStatus: { CONFIRMED: 5, IN_PROGRESS: 2, COMPLETED: 40, DISPUTED: 1 } },
  attention: [{ key: "workerReviews", label: "Worker applications to review", count: 4, href: "/admin/workers" }],
  trends: { newUsers: days(7), bookings: days(7) },
  finance: null, recentActivity: null, ...over,
});
const renderBody = (d: Dashboard) => render(<DashboardBody d={d} />);

beforeEach(() => { replace.mockReset(); serverAdminApi.mockReset(); });

describe("admin dashboard figures (Server Component body)", () => {
  it("shows real numbers and links to the queues", () => {
    renderBody(data());
    const link = screen.getByRole("link", { name: /Worker applications to review/ });
    expect(link).toHaveAttribute("href", "/admin/workers");
    expect(link.closest("div")!.textContent).toContain("4");
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText(/9 new in 7 days/)).toBeInTheDocument();
  });

  it("hides money and activity sections when the API did not send them", () => {
    renderBody(data());
    expect(screen.queryByRole("heading", { name: /Money/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Recent admin activity/ })).toBeNull();
  });

  it("shows finance and activity when present, using formatted taka", () => {
    renderBody(data({
      finance: { collectedBdt: 1500, refundedBdt: 500, netBdt: 1000, payments: 3, series: days(7) },
      recentActivity: [{ id: "x", action: "user.suspend", targetType: "User", at: "2026-11-07T05:00:00Z", by: "Root" }],
    }));
    expect(screen.getByRole("heading", { name: /Money, last 7 days/ })).toBeInTheDocument();
    expect(screen.getByText("৳1,500")).toBeInTheDocument();
    expect(screen.getByText("user.suspend")).toBeInTheDocument();
  });

  it("says so when nothing needs attention", () => {
    renderBody(data({ attention: [{ key: "a", label: "Open disputes", count: 0, href: "/admin/disputes" }] }));
    expect(screen.getByText(/Nothing is waiting for a decision/)).toBeInTheDocument();
  });
});

describe("DashboardSummary (server read)", () => {
  it("reads the chosen period with the visitor's session and renders the figures", async () => {
    serverAdminApi.mockResolvedValue({ ok: true, data: data() });
    render(await DashboardSummary({ days: 90 }));
    expect(serverAdminApi).toHaveBeenCalledWith("/admin/dashboard?days=90");
    expect(screen.getByText("120")).toBeInTheDocument();
  });

  it("explains a refusal, and renders nothing without a session", async () => {
    serverAdminApi.mockResolvedValue({ ok: false, status: 403 });
    render(await DashboardSummary({ days: 30 }));
    expect(screen.getByText("Your role cannot see this information.")).toBeInTheDocument();
    serverAdminApi.mockResolvedValue({ ok: false, status: 401 });
    expect(await DashboardSummary({ days: 30 })).toBeNull();
  });
});

describe("DashboardFrame (client)", () => {
  it("changes the period through the URL and refuses a role without dashboard.view", () => {
    render(<AdminProvider me={me(["dashboard.view"])}><DashboardFrame days={30}><p>figures</p></DashboardFrame></AdminProvider>);
    expect(screen.getByText("figures")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "90" } });
    expect(replace).toHaveBeenCalledWith("/admin?days=90", { scroll: false });
    render(<AdminProvider me={me(["users.read"])}><DashboardFrame days={30}><p>hidden figures</p></DashboardFrame></AdminProvider>);
    expect(screen.getByText("Your role cannot open this page")).toBeInTheDocument();
    expect(screen.queryByText("hidden figures")).toBeNull();
  });
});

describe("BarChart", () => {
  it("names the series, totals it, anchors zero bars at zero height and offers a table", () => {
    render(<BarChart title="New users per day" points={[{ date: "2026-11-01", value: 0 }, { date: "2026-11-02", value: 4 }]} />);
    expect(screen.getByRole("img", { name: /New users per day, 2 days, total 4/ })).toBeInTheDocument();
    expect(screen.getByText("Total 4")).toBeInTheDocument();
    // the same numbers are always reachable as a table
    expect(screen.getByText("Show as table")).toBeInTheDocument();
  });
  it("renders the table only while it is open, with the unit's formatting", () => {
    const { container } = render(<BarChart title="Money" unit="bdt" points={[{ date: "2026-11-01", value: 1500 }, { date: "2026-11-02", value: 0 }]} />);
    expect(container.querySelector("table")).toBeNull();
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getByRole("rowheader", { name: "2026-11-01" })).toBeInTheDocument();
    details.open = false;
    fireEvent(details, new Event("toggle"));
    expect(container.querySelector("table")).toBeNull();
  });
  it("handles an empty series", () => {
    render(<BarChart title="Empty" points={[]} />);
    expect(screen.getByText("Total 0")).toBeInTheDocument();
  });
});
