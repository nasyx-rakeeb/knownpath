"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { useState, type ReactNode } from "react";
import type { Account } from "../lib/contracts";

const navigation = [
  ["Overview", "/app"],
  ["Explore", "/app/explore"],
  ["API keys", "/app/api-keys"],
  ["Install", "/app/install"],
  ["Workspaces", "/app/workspaces"],
  ["Contributions", "/app/contributions"],
  ["Outcomes", "/app/outcomes"],
  ["Settings", "/app/settings"],
] as const;
export function AppShell({ account, children }: { account: Account; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  async function signOut() {
    await fetch("/api/knownpath/auth/sign-out", { method: "POST" });
    router.replace("/sign-in");
    router.refresh();
  }
  const links = navigation.map(([label, href]) => (
    <Link
      key={href}
      aria-current={pathname === href ? "page" : undefined}
      href={href}
      onClick={() => setOpen(false)}
    >
      {label}
    </Link>
  ));
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="wordmark" href="/app">
          KnownPath
        </Link>
        <nav aria-label="Dashboard navigation">{links}</nav>
        <div className="account-chip">
          <span>{account.user.displayName}</span>
          <small>{account.user.email}</small>
        </div>
        <button className="quiet-button" onClick={signOut} type="button">
          Sign out
        </button>
      </aside>
      <header className="mobile-header">
        <Link className="wordmark" href="/app">
          KnownPath
        </Link>
        <Dialog.Root onOpenChange={setOpen} open={open}>
          <Dialog.Trigger asChild>
            <button className="quiet-button" type="button">
              Menu
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="mobile-menu">
              <div className="dialog-title-row">
                <Dialog.Title>Navigation</Dialog.Title>
                <Dialog.Close asChild>
                  <button aria-label="Close navigation" className="quiet-button">
                    Close
                  </button>
                </Dialog.Close>
              </div>
              <nav aria-label="Mobile dashboard navigation">{links}</nav>
              <button className="quiet-button" onClick={signOut} type="button">
                Sign out
              </button>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
