import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound: () => notFound(), useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => "/admin/users/x" }));
const cookieJar = new Map<string, { name: string; value: string }>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => cookieJar.get(n) }) }));

import { AdminProvider } from "@/components/admin/shell/admin-context";
import { UserDetail } from "@/components/admin/people/user-detail-server";
import { serverAdminApi } from "@/lib/server-admin-api";
import type { Me } from "@/lib/use-api";

const me = { user: { id: "admin-1", name: "A", email: "a@x.test", emailVerified: true, image: null }, isAdmin: true, admin: { role: { key: "r", name: "R" }, permissions: ["users.read"] }, customer: { onboarded: false }, worker: { started: false, approved: false } } as unknown as Me;
const user = {
  id: "user-abc-123", name: "Rahim Uddin", email: "rahim@example.com", emailVerified: true, role: "USER", adminRole: null, suspended: false, suspensionReason: null,
  createdAt: "2026-09-01T06:00:00Z", updatedAt: "2026-09-02T06:00:00Z", isCustomer: true, worker: null, customerProfile: null, activeSessions: 1,
  counts: { bookingsAsCustomer: 3, bookingsAsWorker: 0, supportTickets: 1, reportsFiled: 0, posts: 4, reviews: 2 },
  recentActions: [{ id: "a1", action: "user.suspend", createdAt: "2026-09-03T06:00:00Z", by: "Admin", reason: "Abuse" }],
};
const fetchMock = vi.fn();

beforeEach(() => {
  cookieJar.clear();
  fetchMock.mockReset();
  notFound.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

describe("serverAdminApi", () => {
  it("forwards only the session cookie, uncached, and reports failures as a status", async () => {
    expect(await serverAdminApi("/admin/dashboard")).toEqual({ ok: false, status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    cookieJar.set("better-auth.session_token", { name: "better-auth.session_token", value: "tok.sig" });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ a: 1 }), { status: 200 }));
    expect(await serverAdminApi("/admin/dashboard?days=7")).toEqual({ ok: true, data: { a: 1 } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:4000/api/v1/admin/dashboard?days=7");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({ Accept: "application/json", Cookie: "better-auth.session_token=tok.sig" });
    fetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
    expect(await serverAdminApi("/admin/dashboard")).toEqual({ ok: false, status: 403 });
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await serverAdminApi("/admin/dashboard")).toEqual({ ok: false, status: 0 });
  });
});

describe("UserDetail (Server Component)", () => {
  beforeEach(() => cookieJar.set("better-auth.session_token", { name: "better-auth.session_token", value: "t" }));

  it("renders the facts, counts and recent actions on the server, with the client actions island", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ user }), { status: 200 }));
    render(<AdminProvider me={me}>{await UserDetail({ id: "user-abc-123" })}</AdminProvider>);
    expect(screen.getByRole("heading", { name: "Rahim Uddin" })).toBeInTheDocument();
    expect(screen.getByText("Bookings as customer").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("Reason: Abuse")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Suspension" })).toBeInTheDocument();
  });

  it("is a 404 for an unknown id, a message for a refusal, and nothing without a session", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    await expect(UserDetail({ id: "missing-id-1" })).rejects.toThrow("NEXT_NOT_FOUND");
    fetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
    render(await UserDetail({ id: "user-abc-123" }));
    expect(screen.getByText("Your role cannot see this information.")).toBeInTheDocument();
    cookieJar.clear();
    expect(await UserDetail({ id: "user-abc-123" })).toBeNull();
  });
});
