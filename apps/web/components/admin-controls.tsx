"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useMemo, useState } from "react";

type ControlKind = "queue" | "retry" | "source" | "moderation" | "user";

export function AdminControls() {
  const [kind, setKind] = useState<ControlKind>("queue");
  const [target, setTarget] = useState("control");
  const [operation, setOperation] = useState("pause");
  const [resource, setResource] = useState("contribution");
  const [expectedStatus, setExpectedStatus] = useState("unreviewed");
  const [reason, setReason] = useState("");
  const [phrase, setPhrase] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const action = useMemo(() => actionFor(kind, operation), [kind, operation]);
  const expectedPhrase = `CONFIRM ${action} ${target}`;

  function changeKind(next: ControlKind) {
    setKind(next);
    setPhrase("");
    setMessage("");
    if (next === "queue") {
      setTarget("control");
      setOperation("pause");
    }
    if (next === "retry") {
      setTarget("");
      setOperation("retry");
    }
    if (next === "source") {
      setTarget("");
      setOperation("sync");
    }
    if (next === "moderation") {
      setTarget("");
      setOperation("quarantine");
    }
    if (next === "user") {
      setTarget("");
      setOperation("suspend");
    }
  }

  async function execute() {
    setPending(true);
    setMessage("");
    const confirmation = { version: 1, action, target, reason, phrase };
    const request = requestFor(kind, operation, target, resource, expectedStatus, confirmation);
    try {
      const response = await fetch(`/api/knownpath/${request.path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body));
      setMessage(`Completed ${action}. The action and operator are recorded in audit history.`);
      setPhrase("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Administrator action failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="control-layout">
      <section className="control-form">
        <label>
          Control category
          <select onChange={(event) => changeKind(event.target.value as ControlKind)} value={kind}>
            <option value="queue">Queue pause or resume</option>
            <option value="retry">Retry failed pipeline step</option>
            <option value="source">Source registry operation</option>
            <option value="moderation">Moderation transition</option>
            <option value="user">User suspension or restore</option>
          </select>
        </label>
        {kind === "queue" ? (
          <>
            <label>
              Queue
              <select onChange={(event) => setTarget(event.target.value)} value={target}>
                {["control", "github", "sources", "ai", "knowledge", "feedback"].map((queue) => (
                  <option key={queue}>{queue}</option>
                ))}
              </select>
            </label>
            <label>
              Action
              <select onChange={(event) => setOperation(event.target.value)} value={operation}>
                <option value="pause">Pause</option>
                <option value="resume">Resume</option>
              </select>
            </label>
          </>
        ) : null}
        {kind === "retry" ? (
          <label>
            Failed or quarantined step ID
            <input
              onChange={(event) => setTarget(event.target.value.trim())}
              placeholder="UUID"
              value={target}
            />
          </label>
        ) : null}
        {kind === "source" ? (
          <>
            <label>
              Source registry ID
              <input
                onChange={(event) => setTarget(event.target.value.trim())}
                placeholder="UUID"
                value={target}
              />
            </label>
            <label>
              Action
              <select onChange={(event) => setOperation(event.target.value)} value={operation}>
                <option value="sync">Sync</option>
                <option value="enable">Enable</option>
                <option value="disable">Disable</option>
              </select>
            </label>
          </>
        ) : null}
        {kind === "moderation" ? (
          <>
            <label>
              Resource
              <select onChange={(event) => setResource(event.target.value)} value={resource}>
                <option value="contribution">Contribution</option>
                <option value="candidate">Candidate</option>
                <option value="known_path">KnownPath</option>
              </select>
            </label>
            <label>
              Record ID
              <input
                onChange={(event) => setTarget(event.target.value.trim())}
                placeholder="UUID"
                value={target}
              />
            </label>
            <label>
              Current status
              <input
                onChange={(event) => setExpectedStatus(event.target.value.trim())}
                value={expectedStatus}
              />
            </label>
            <label>
              Action
              <select onChange={(event) => setOperation(event.target.value)} value={operation}>
                <option value="approve">Approve</option>
                <option value="quarantine">Quarantine</option>
                <option value="reject">Reject</option>
                <option value="deprecate">Deprecate</option>
                <option value="restore">Restore</option>
              </select>
            </label>
          </>
        ) : null}
        {kind === "user" ? (
          <>
            <label>
              User ID
              <input
                onChange={(event) => setTarget(event.target.value.trim())}
                placeholder="UUID"
                value={target}
              />
            </label>
            <label>
              Current status
              <select
                onChange={(event) => setExpectedStatus(event.target.value)}
                value={expectedStatus}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <label>
              Action
              <select onChange={(event) => setOperation(event.target.value)} value={operation}>
                <option value="suspend">Suspend</option>
                <option value="restore">Restore</option>
              </select>
            </label>
          </>
        ) : null}
        <label>
          Operator reason
          <textarea
            maxLength={2000}
            minLength={8}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this action is necessary"
            required
            value={reason}
          />
        </label>
        <AlertDialog.Root>
          <AlertDialog.Trigger asChild>
            <button
              className="danger-button"
              disabled={target.length === 0 || reason.trim().length < 8}
              type="button"
            >
              Review exact confirmation
            </button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="dialog-overlay" />
            <AlertDialog.Content className="dialog-panel">
              <AlertDialog.Title>Confirm {action}</AlertDialog.Title>
              <AlertDialog.Description>
                The backend will independently verify your role, 30-minute session freshness,
                action, target, reason, and exact phrase.
              </AlertDialog.Description>
              <div className="confirmation-scope">
                <span>Target</span>
                <code>{target}</code>
                <span>Expected phrase</span>
                <code>{expectedPhrase}</code>
              </div>
              <label>
                Type the exact phrase
                <input
                  autoComplete="off"
                  onChange={(event) => setPhrase(event.target.value)}
                  value={phrase}
                />
              </label>
              <div className="row-actions">
                <AlertDialog.Cancel asChild>
                  <button className="quiet-button" type="button">
                    Cancel
                  </button>
                </AlertDialog.Cancel>
                <button
                  className="danger-button"
                  disabled={pending || phrase !== expectedPhrase}
                  onClick={execute}
                  type="button"
                >
                  {pending ? "Applying…" : "Apply sensitive action"}
                </button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
      </section>
      <aside>
        <h2>Operational safeguards</h2>
        <ul>
          <li>No hard deletion is exposed.</li>
          <li>Retries create a new durable reprocess run and preserve the failed step.</li>
          <li>Queue state lives in Valkey; product records remain in MongoDB.</li>
          <li>Stale sessions and mismatched targets fail without mutation.</li>
        </ul>
      </aside>
    </div>
  );
}

function actionFor(kind: ControlKind, operation: string) {
  if (kind === "queue") return `queue.${operation}`;
  if (kind === "retry") return "job.retry";
  if (kind === "source") return operation === "sync" ? "source.sync" : "source.update";
  if (kind === "moderation") return `moderation.${operation}`;
  return `user.${operation}`;
}

function requestFor(
  kind: ControlKind,
  operation: string,
  target: string,
  resource: string,
  expectedStatus: string,
  confirmation: object,
) {
  if (kind === "queue")
    return {
      path: "admin/queues/control",
      body: { queue: target, action: operation, confirmation },
    };
  if (kind === "retry") return { path: "admin/jobs/retry", body: { stepId: target, confirmation } };
  if (kind === "source")
    return {
      path: "admin/sources/action",
      body: { sourceRegistryId: target, action: operation, confirmation },
    };
  if (kind === "moderation")
    return {
      path: "admin/moderation",
      body: { resource, id: target, action: operation, expectedStatus, confirmation },
    };
  return {
    path: "admin/users/action",
    body: { userId: target, action: operation, expectedStatus, confirmation },
  };
}

function apiMessage(value: unknown) {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return "The administrator action failed";
}
