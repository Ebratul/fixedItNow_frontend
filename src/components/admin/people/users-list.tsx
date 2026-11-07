"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdminPage, ApiView, buildQuery, DataTable, type Column } from "@/components/admin/kit";
import { VirtualDataTable } from "@/components/admin/kit/virtual-data-table";
import { Pager } from "@/components/community/community-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { SelectInput } from "@/components/ui/select-input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { UserList, UserRow } from "./types";

/**
 * Rows per page. "All (1000+)" asks for one page of 2,000, which is the backend's only allowed size above 50
 * (USERS_ALL_PAGE_SIZE in backend users.controller.ts). It shows the whole performance data set (about 1,500
 * users) at once, as the un-virtualized baseline for table rendering.
 */
const PAGE_SIZES = [
  { value: "20", label: "20 per page" },
  { value: "50", label: "50 per page" },
  { value: "2000", label: "All (1000+)" },
] as const;
const DEFAULT_PAGE_SIZE = "20";
/**
 * Result sets longer than this render through VirtualDataTable: only the rows in view plus OVERSCAN on each side.
 * 20 and 50 per page keep the plain DataTable, unchanged.
 */
const VIRTUALIZE_ABOVE = 100;
const OVERSCAN = 10;
const rowKey = (u: UserRow) => u.id;

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

const columns: Column<UserRow>[] = [
  {
    key: "name",
    header: "User",
    cell: (u) => (
      <Link href={`/admin/users/${u.id}`} className="text-brand-800 underline-offset-2 hover:underline focus-visible:underline">
        {u.name || "(no name)"}
      </Link>
    ),
  },
  {
    key: "email",
    header: "Email",
    hideBelow: "md",
    cell: (u) => (
      <span className="break-all">
        {u.email}
        {!u.emailVerified && <span className="ml-2 text-xs text-ink-subtle">(not verified)</span>}
      </span>
    ),
  },
  { key: "kind", header: "Type", width: "12rem", cell: (u) => <UserBadges user={u} /> },
  { key: "status", header: "Status", width: "7rem", cell: (u) => (u.suspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>) },
  { key: "joined", header: "Joined", hideBelow: "lg", width: "8rem", cell: (u) => formatDate(u.createdAt) },
];

/** The filters the list is showing. `search` is the debounced, trimmed search text. */
type UserFilters = { search: string; role: string; status: string; kind: string; pageSize: string };
const NO_FILTERS: UserFilters = { search: "", role: "", status: "", kind: "", pageSize: DEFAULT_PAGE_SIZE };
/** Quiet time after the last key before a search is sent (the same as `useDebounced`). */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The filter form, with its own input state (state colocation). Typing re-renders only this form.
 * - A select reports its value straight away.
 * - The search text is reported once typing pauses for SEARCH_DEBOUNCE_MS.
 * The reports come from the event handlers themselves, not an effect, so the list re-renders once per change.
 */
function UsersFilterForm({ onChange }: { onChange: (change: Partial<UserFilters>) => void }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [pageSize, setPageSize] = useState<string>(DEFAULT_PAGE_SIZE);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onSearch = (value: string) => {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange({ search: value.trim() }), SEARCH_DEBOUNCE_MS);
  };
  const select = (set: (v: string) => void, key: keyof UserFilters) => (value: string) => {
    set(value);
    onChange({ [key]: value });
  };

  return (
    <form role="search" aria-label="Filter users" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
      <div className="sm:col-span-2 lg:col-span-4">
        <SearchInput id="user-search" label="Search by name, email or user id" placeholder="Name, email or id" value={q} maxLength={100} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <SelectInput id="user-role" label="Account role" placeholder="All roles" value={role} onChange={(e) => select(setRole, "role")(e.target.value)} options={[{ value: "USER", label: "Regular users" }, { value: "ADMIN", label: "Administrators" }]} />
      <SelectInput id="user-status" label="Status" placeholder="Any status" value={status} onChange={(e) => select(setStatus, "status")(e.target.value)} options={[{ value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }]} />
      <SelectInput id="user-kind" label="Profile" placeholder="Any profile" value={kind} onChange={(e) => select(setKind, "kind")(e.target.value)} options={[{ value: "customer", label: "Customers" }, { value: "worker", label: "Workers" }]} />
      <SelectInput id="user-page-size" label="Rows per page" placeholder={null} value={pageSize} onChange={(e) => select(setPageSize, "pageSize")(e.target.value)} options={PAGE_SIZES} />
    </form>
  );
}

/** Searchable, filterable, paginated list of every account (`GET /admin/users`). */
export function UsersList() {
  const [filters, setFilters] = useState<UserFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const { search, role, status, kind, pageSize } = filters;
  const path = `/admin/users${buildQuery({ q: search, role, status, kind, page, pageSize: Number(pageSize) })}`;
  const { state, reload, stale } = useApi<UserList>(path);
  const filtered = Boolean(search || role || status || kind);
  // A real change of the filters starts again at page 1 (a search that trims to the same text changes nothing).
  const applyFilters = (change: Partial<UserFilters>) => {
    const next = { ...filters, ...change };
    if ((Object.keys(next) as (keyof UserFilters)[]).every((k) => next[k] === filters[k])) return;
    setFilters(next);
    setPage(1);
  };

  return (
    <AdminPage title="Users" description="Every account on the platform. Open a user to see their activity and, with the right permission, suspend them or manage their admin access." permission="users.read">
      <UsersFilterForm onChange={applyFilters} />

      <ApiView state={state} reload={reload} skeleton={<Skeleton className="h-64" />}>
        {(data) =>
          data.users.length === 0 ? (
            <EmptyState icon={Users} title={filtered ? "No users match these filters" : "No users yet"} headingLevel={2}>
              {filtered ? "Try a different search term or clear a filter." : "Accounts appear here as people sign up."}
            </EmptyState>
          ) : (
            <section aria-label="Results" className="space-y-4">
              <p className="text-sm text-ink-muted" aria-live="polite">
                {data.total} {data.total === 1 ? "user" : "users"}
                {stale && " (updating…)"}
              </p>
              {data.users.length > VIRTUALIZE_ABOVE ? (
                <VirtualDataTable caption="Users" columns={columns} rows={data.users} rowKey={rowKey} busy={stale} overscan={OVERSCAN} />
              ) : (
                <DataTable caption="Users" columns={columns} rows={data.users} rowKey={rowKey} busy={stale} />
              )}
              <Pager page={data.page} totalPages={data.totalPages} onPage={setPage} label="Users pages" />
            </section>
          )
        }
      </ApiView>
    </AdminPage>
  );
}
