"use client";
import type { ApiKeyScope } from "@knownpath/domain";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import { useState, type FormEvent } from "react";
import { clientJson } from "../lib/client-api";
import type { ApiKeyMetadata } from "../lib/contracts";
import { formatDate } from "../lib/format";
import { StatusBadge } from "./page-heading";

const availableScopes: readonly ApiKeyScope[] = [
  "account:read",
  "knowledge:read",
  "knowledge:contribute",
  "knowledge:outcome",
];
type Issued = { apiKey: ApiKeyMetadata; plaintext: string; warning: string };

export function ApiKeyManager({ initialKeys }: { initialKeys: ApiKeyMetadata[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [issued, setIssued] = useState<Issued>();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const scopes = availableScopes.filter((scope) => data.getAll("scopes").includes(scope));
    setPending(true);
    setError(undefined);
    try {
      const value = await clientJson<Issued>("api-keys", {
        method: "POST",
        body: JSON.stringify({ name: data.get("name"), scopes }),
      });
      setKeys((current) => [value.apiKey, ...current]);
      setIssued(value);
      setSaved(false);
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Key creation failed");
    } finally {
      setPending(false);
    }
  }
  async function rotate(id: string) {
    setPending(true);
    setError(undefined);
    try {
      const value = await clientJson<Issued>(`api-keys/${id}/rotate`, { method: "POST" });
      setKeys((current) => current.map((key) => (key.id === id ? value.apiKey : key)));
      setIssued(value);
      setSaved(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Key rotation failed");
    } finally {
      setPending(false);
    }
  }
  async function revoke(id: string) {
    setPending(true);
    setError(undefined);
    try {
      const value = await clientJson<{ apiKey: ApiKeyMetadata }>(`api-keys/${id}/revoke`, {
        method: "POST",
      });
      setKeys((current) => current.map((key) => (key.id === id ? value.apiKey : key)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Key revocation failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Issue access</p>
            <h2>Create an agent API key</h2>
          </div>
        </div>
        <p className="section-copy">
          Choose only the capabilities the agent needs. The full key appears once and is never
          stored in plaintext.
        </p>
        <form className="key-form" onSubmit={create}>
          <label>
            Key name
            <input maxLength={120} name="name" placeholder="Laptop Codex" required />
          </label>
          <fieldset>
            <legend>Capabilities</legend>
            {availableScopes.map((scope) => (
              <label className="check-row" key={scope}>
                <input
                  defaultChecked={scope === "account:read" || scope === "knowledge:read"}
                  name="scopes"
                  type="checkbox"
                  value={scope}
                />
                <span>
                  <b>{scope}</b>
                  <small>{scopeDescription(scope)}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <button className="button" disabled={pending}>
            Create API key
          </button>
          {error === undefined ? null : (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
      <section className="section-block">
        <p className="eyebrow">Credentials</p>
        <h2>Your API keys</h2>
        {keys.length === 0 ? (
          <p className="muted">No API keys created.</p>
        ) : (
          <div className="data-list">
            {keys.map((key) => (
              <article key={key.id}>
                <div>
                  <div className="result-title">
                    <h3>{key.name}</h3>
                    <StatusBadge tone={key.status === "active" ? "good" : "neutral"}>
                      {key.status}
                    </StatusBadge>
                  </div>
                  <code>{key.prefix}••••••••</code>
                  <small>
                    {key.credentialKind === "cli_device" ? "CLI device" : "Manual key"} · Created{" "}
                    {formatDate(key.createdAt)} · {key.scopes.join(", ")}
                  </small>
                </div>
                {key.status !== "active" ? null : (
                  <div className="row-actions">
                    {key.credentialKind === "manual" ? (
                      <button
                        className="quiet-button"
                        disabled={pending}
                        onClick={() => rotate(key.id)}
                        type="button"
                      >
                        Rotate
                      </button>
                    ) : null}
                    <AlertDialog.Root>
                      <AlertDialog.Trigger asChild>
                        <button className="danger-button" disabled={pending} type="button">
                          Revoke
                        </button>
                      </AlertDialog.Trigger>
                      <AlertDialog.Portal>
                        <AlertDialog.Overlay className="dialog-overlay" />
                        <AlertDialog.Content className="dialog-panel">
                          <AlertDialog.Title>Revoke {key.name}?</AlertDialog.Title>
                          <AlertDialog.Description>
                            Agents using this key will lose access immediately.
                          </AlertDialog.Description>
                          <div className="dialog-actions">
                            <AlertDialog.Cancel asChild>
                              <button className="quiet-button">Cancel</button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                              <button className="danger-button" onClick={() => revoke(key.id)}>
                                Revoke key
                              </button>
                            </AlertDialog.Action>
                          </div>
                        </AlertDialog.Content>
                      </AlertDialog.Portal>
                    </AlertDialog.Root>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <Dialog.Root
        onOpenChange={(open) => {
          if (!open && saved) setIssued(undefined);
        }}
        open={issued !== undefined}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-panel secret-dialog"
            onEscapeKeyDown={(event) => {
              if (!saved) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (!saved) event.preventDefault();
            }}
          >
            <Dialog.Title>Save this API key now</Dialog.Title>
            <Dialog.Description>{issued?.warning}</Dialog.Description>
            <div className="secret-value">
              <code>{issued?.plaintext}</code>
              <button
                className="quiet-button"
                onClick={() =>
                  issued === undefined ? undefined : navigator.clipboard.writeText(issued.plaintext)
                }
                type="button"
              >
                Copy
              </button>
            </div>
            <label className="check-row">
              <input
                checked={saved}
                onChange={(event) => setSaved(event.target.checked)}
                type="checkbox"
              />
              <span>I saved this key securely</span>
            </label>
            <Dialog.Close asChild>
              <button className="button" disabled={!saved}>
                Close
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
function scopeDescription(scope: ApiKeyScope): string {
  return (
    {
      "account:read": "Read safe account metadata",
      "api-keys:read": "Read API-key metadata",
      "api-keys:write": "Manage API keys",
      "knowledge:read": "Search and inspect KnownPaths",
      "knowledge:contribute": "Submit generalized successful lessons",
      "knowledge:outcome": "Report attempted solution outcomes",
    } as const
  )[scope];
}
