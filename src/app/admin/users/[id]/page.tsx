import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPage } from "@/components/admin/kit/admin-page";
import { UserDetail } from "@/components/admin/people/user-detail-server";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "User", robots: { index: false, follow: false } };

/** Better Auth ids are short alphanumeric strings (the API accepts the same shape). */
const USER_ID = /^[A-Za-z0-9_-]{8,64}$/;

export const instant = false; // renders after the admin sign-in check; see ../layout.tsx

/**
 * Server Component. The account facts, activity counts and recent admin actions render on the server
 * (UserDetail). Only the suspension and admin-access controls, with the role select, are a Client Component.
 */
export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  if (!USER_ID.test(id)) notFound();
  return (
    <AdminPage
      title="User"
      permission="users.read"
      description={<Link href="/admin/users" className="inline-flex items-center gap-1.5 font-semibold text-brand-800 hover:underline"><ArrowLeft className="size-4" aria-hidden />All users</Link>}
    >
      <Suspense fallback={<Skeleton className="h-72" />}>
        <UserDetail id={id} />
      </Suspense>
    </AdminPage>
  );
}
