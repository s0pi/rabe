import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, isAuthorized, passcodeEnabled } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "Unlock · RABÉ" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only allow same-site relative redirects.
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!passcodeEnabled() || (await isAuthorized((await cookies()).get(AUTH_COOKIE)?.value))) {
    redirect(target);
  }
  return <LoginForm next={target} />;
}
