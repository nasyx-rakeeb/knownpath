"use client";
import type { AccountSessionListResponse } from "@knownpath/domain";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { clientJson } from "../lib/client-api";
import type { Account } from "../lib/contracts";
import { formatDate } from "../lib/format";
import { StatusBadge } from "./page-heading";

export function SettingsManager({
  account,
  initialMode,
  initialSessions,
}: {
  account: Account;
  initialMode: "ask" | "disabled";
  initialSessions: AccountSessionListResponse["sessions"];
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [sessions, setSessions] = useState(initialSessions);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  async function profile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await perform(async () => {
      await clientJson("account/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: data.get("displayName") }),
      });
      router.refresh();
      return "Profile updated";
    });
  }
  async function privacy(next: "ask" | "disabled") {
    await perform(async () => {
      await clientJson("account/contribution-settings", {
        method: "PATCH",
        body: JSON.stringify({ contributionMode: next }),
      });
      setMode(next);
      return "Contribution preference updated";
    });
  }
  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await perform(async () => {
      await clientJson("auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
          revokeOtherSessions: true,
        }),
      });
      form.reset();
      return "Password changed and other sessions revoked";
    });
  }
  async function revoke(id: string, current: boolean) {
    await perform(async () => {
      await clientJson(`account/sessions/${id}/revoke`, { method: "POST" });
      if (current) {
        router.replace("/sign-in");
        router.refresh();
      } else setSessions((values) => values.filter((session) => session.id !== id));
      return "Session revoked";
    });
  }
  async function perform(action: () => Promise<string>) {
    setError(undefined);
    setMessage(undefined);
    try {
      setMessage(await action());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed");
    }
  }
  return (
    <>
      {message === undefined ? null : (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      {error === undefined ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="section-block">
        <p className="eyebrow">Profile</p>
        <h2>Account identity</h2>
        <form className="settings-form" onSubmit={profile}>
          <label>
            Display name
            <input
              defaultValue={account.user.displayName}
              maxLength={256}
              name="displayName"
              required
            />
          </label>
          <label>
            Email
            <input disabled value={account.user.email} />
          </label>
          <button className="button button-small">Save profile</button>
        </form>
      </section>
      <section className="section-block">
        <p className="eyebrow">Privacy</p>
        <h2>Contribution behavior</h2>
        <p className="section-copy">
          Public contribution always requires explicit consent. Private contribution remains inside
          KnownPath and is never sent to unpaid or public AI providers.
        </p>
        <div className="choice-grid">
          <button
            className={mode === "ask" ? "choice active" : "choice"}
            onClick={() => privacy("ask")}
            type="button"
          >
            <strong>Ask before contributing</strong>
            <span>
              The agent may propose a generalized lesson after success, but must get consent.
            </span>
          </button>
          <button
            className={mode === "disabled" ? "choice active" : "choice"}
            onClick={() => privacy("disabled")}
            type="button"
          >
            <strong>Disable contributions</strong>
            <span>
              Agents can still retrieve knowledge and report outcomes, but cannot submit lessons.
            </span>
          </button>
        </div>
      </section>
      <section className="section-block">
        <p className="eyebrow">Security</p>
        <h2>Change password</h2>
        <form className="settings-form" onSubmit={password}>
          <label>
            Current password
            <input
              autoComplete="current-password"
              minLength={12}
              name="currentPassword"
              required
              type="password"
            />
          </label>
          <label>
            New password
            <input
              autoComplete="new-password"
              minLength={12}
              name="newPassword"
              required
              type="password"
            />
          </label>
          <button className="button button-small">Change password</button>
        </form>
      </section>
      <section className="section-block">
        <p className="eyebrow">Sessions</p>
        <h2>Active sign-ins</h2>
        <div className="data-list">
          {sessions.map((session) => (
            <article key={session.id}>
              <div>
                <div className="result-title">
                  <h3>{session.userAgent ?? "Unknown browser"}</h3>
                  {session.current ? <StatusBadge tone="good">current</StatusBadge> : null}
                </div>
                <small>
                  Created {formatDate(session.createdAt)} · Expires {formatDate(session.expiresAt)}
                </small>
              </div>
              <button
                className="danger-button"
                onClick={() => revoke(session.id, session.current)}
                type="button"
              >
                Revoke
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
