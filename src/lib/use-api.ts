"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

export type ApiState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * GET a backend resource and expose loading / error / unauthenticated states.
 *
 * - `reload()` clears the screen to "loading" and refetches (use after a failure, "Try again").
 * - `refresh()` refetches WITHOUT clearing: the current data stays mounted, so unsaved form input,
 *   focus and scroll position survive (use after a small mutation on the same page).
 * - `stale` is true while `state` still holds the previous `path`'s data (paging, filtering) and the
 *   new response has not arrived, so lists can show a busy cue instead of silently showing old rows.
 * - Each request has its own AbortController. When `path` changes (the next debounced search) or the view unmounts,
 *   the request still in flight is aborted, so the browser and the API stop working on an answer nobody will see,
 *   and a slow old response can never overwrite a newer one.
 */
export function useApi<T>(path: string) {
  const [state, setState] = useState<ApiState<T>>({ status: "loading" });
  const [loadedPath, setLoadedPath] = useState(path);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const done = (next: ApiState<T>) => {
      if (controller.signal.aborted) return;
      setState(next);
      setLoadedPath(path);
    };
    api<T>(path, { signal: controller.signal })
      .then((data) => done({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          done({ status: "unauthenticated" });
        } else {
          done({
            status: "error",
            message: error instanceof Error ? error.message : "Something went wrong.",
          });
        }
      });
    return () => controller.abort();
  }, [path, version]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setVersion((v) => v + 1);
  }, []);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { state, reload, refresh, stale: loadedPath !== path };
}

export type Me = {
  user: { id: string; name: string; email: string; emailVerified: boolean; image: string | null };
  isAdmin: boolean;
  /** Convenience for hiding controls. The server decides on every request. */
  admin: { role: { key: string; name: string } | null; permissions: string[] } | null;
  customer: { onboarded: boolean; profile?: { displayName: string; preferredDivision: string | null } };
  worker: {
    started: boolean;
    approved: boolean;
    profile?: WorkerProfile;
  };
  /** Non-null only for a demo session (a shared, fictional identity). */
  demo?: { role: "customer" | "worker" | "admin" } | null;
};

export type WorkerService = {
  pricingModel: "FIXED" | "HOURLY" | "QUOTE";
  basePriceBdt: number | null;
  pricingNotes: string | null;
  category: { slug: string; name: string };
};

export type WorkerProfile = {
  id: string;
  onboardingStatus: "DRAFT" | "SUBMITTED";
  onboardingStep: number;
  displayName: string | null;
  headline: string | null;
  bio: string | null;
  experienceYears: number | null;
  languages: string[];
  serviceAreas: string[];
  submittedAt: string | null;
  verificationStatus:
    | "NOT_SUBMITTED"
    | "PENDING"
    | "VERIFIED"
    | "REJECTED"
    | "RESUBMISSION_REQUIRED";
  reviewNote: string | null;
  /** Public listing state. `slug` is set after the first publish. */
  slug: string | null;
  publishedAt: string | null;
  suspendedAt: string | null;
  startingPriceBdt: number | null;
  services: WorkerService[];
};

export const useMe = () => useApi<Me>("/me");
export const useAuthConfig = () =>
  useApi<{ googleEnabled: boolean; emailVerificationRequired: boolean; minPasswordLength: number }>(
    "/config/auth",
  );
