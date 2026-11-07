import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useApi } from "@/lib/use-api";

type Pending = { url: string; signal: AbortSignal; resolve: (body: unknown) => void };

function mockFetch() {
  const calls: Pending[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Promise<Response>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        calls.push({ url, signal, resolve: (body) => resolve(new Response(JSON.stringify(body), { status: 200 })) });
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("useApi request cancelling", () => {
  it("aborts the request in flight when the path changes, and a late answer never replaces the newer one", async () => {
    const calls = mockFetch();
    const { result, rerender } = renderHook(({ path }) => useApi<{ q: string }>(path), { initialProps: { path: "/admin/users?q=ra" } });
    await waitFor(() => expect(calls).toHaveLength(1));

    rerender({ path: "/admin/users?q=rahman" });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(calls[1]!.signal.aborted).toBe(false);

    calls[1]!.resolve({ q: "rahman" });
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: { q: "rahman" } }));
    // The aborted request's answer arriving late changes nothing.
    calls[0]!.resolve({ q: "ra" });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.state).toEqual({ status: "ready", data: { q: "rahman" } });
    expect(result.current.stale).toBe(false);
  });

  it("aborts on unmount without reporting an error", async () => {
    const calls = mockFetch();
    const { result, unmount } = renderHook(() => useApi("/admin/bookings?q=x"));
    await waitFor(() => expect(calls).toHaveLength(1));
    unmount();
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(result.current.state).toEqual({ status: "loading" });
  });
});
