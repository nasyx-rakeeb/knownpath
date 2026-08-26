"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { AdminOverview } from "../lib/contracts";

const links = [
  ["Overview", "/admin"],
  ["Sources", "/admin/resources/sources"],
  ["Jobs", "/admin/resources/jobs"],
  ["Extraction", "/admin/resources/extractions"],
  ["Knowledge", "/admin/resources/known-paths"],
  ["Moderation", "/admin/resources/contributions"],
  ["Outcomes", "/admin/resources/outcomes"],
  ["Users", "/admin/resources/users"],
  ["Audit", "/admin/resources/audit"],
  ["Controls", "/admin/controls"],
] as const;

export function AdminShell({
  overview,
  children,
}: {
  overview: AdminOverview;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="admin-frame">
      <aside className="admin-sidebar">
        <div>
          <Link className="wordmark" href="/admin">
            KnownPath
          </Link>
          <p className="admin-label">Operations console</p>
        </div>
        <nav aria-label="Administration navigation">
          {links.map(([label, href]) => (
            <Link
              key={href}
              aria-current={
                pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`))
                  ? "page"
                  : undefined
              }
              href={href}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="admin-identity">
          <span>{overview.admin.displayName}</span>
          <small>Administrator · server authorized</small>
          <Link href="/app">Return to user dashboard</Link>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
