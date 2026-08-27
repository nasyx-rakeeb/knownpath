"use client";

import type { ApiKeyScope } from "@knownpath/domain";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import { useState, type FormEvent } from "react";

import { clientJson } from "../lib/client-api";
import type { ApiKeyMetadata, WorkspaceDetail, WorkspaceList } from "../lib/contracts";
import { formatDate } from "../lib/format";
import { StatusBadge } from "./page-heading";

type Workspace = WorkspaceList["workspaces"][number];
type Invitation = WorkspaceList["pendingInvitations"][number];
type Issued = { apiKey: ApiKeyMetadata; plaintext: string; warning: string };
const keyScopes: readonly ApiKeyScope[] = [
  "account:read",
  "knowledge:read",
  "knowledge:contribute",
  "knowledge:outcome",
];

export function WorkspaceManager({ initial }: { initial: WorkspaceList }) {
  const [workspaces, setWorkspaces] = useState(initial.workspaces);
  const [invitations, setInvitations] = useState(initial.pendingInvitations);
  const [detail, setDetail] = useState<WorkspaceDetail>();
  const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
  const [issued, setIssued] = useState<Issued>();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workspace action failed");
    } finally {
      setPending(false);
    }
  }

  async function select(workspace: Workspace) {
    await run(async () => {
      const selected = await clientJson<WorkspaceDetail>(`workspaces/${workspace.id}`);
      setDetail(selected);
      if (workspace.role === "owner" || workspace.role === "admin") {
        const response = await clientJson<{ apiKeys: ApiKeyMetadata[] }>(
          `workspaces/${workspace.id}/api-keys`,
        );
        setKeys(response.apiKeys);
      } else setKeys([]);
    });
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(async () => {
      const response = await clientJson<{ workspace: Workspace }>("workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          description: data.get("description") || undefined,
          defaultContributionScope: data.get("defaultContributionScope"),
        }),
      });
      setWorkspaces((current) => [response.workspace, ...current]);
      form.reset();
      await select(response.workspace);
    });
  }

  async function respond(invitation: Invitation, action: "accept" | "reject") {
    await run(async () => {
      await clientJson(`workspace-invitations/${invitation.id}/${action}`, { method: "POST" });
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      if (action === "accept") {
        const refreshed = await clientJson<WorkspaceList>("workspaces");
        setWorkspaces(refreshed.workspaces);
      }
    });
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (detail === undefined) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(async () => {
      const response = await clientJson<{
        invitation: WorkspaceDetail["invitations"][number];
      }>(`workspaces/${detail.workspace.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email: data.get("email"), role: data.get("role") }),
      });
      setDetail((current) =>
        current === undefined
          ? current
          : { ...current, invitations: [response.invitation, ...current.invitations] },
      );
      form.reset();
    });
  }

  async function revokeInvitation(invitationId: string) {
    await run(async () => {
      await clientJson(`workspace-invitations/${invitationId}/revoke`, { method: "POST" });
      setDetail((current) =>
        current === undefined
          ? current
          : {
              ...current,
              invitations: current.invitations.filter((item) => item.id !== invitationId),
            },
      );
    });
  }

  async function updateDefaultScope(scope: "private" | "team") {
    if (detail === undefined) return;
    await run(async () => {
      const response = await clientJson<{ workspace: Workspace }>(
        `workspaces/${detail.workspace.id}`,
        { method: "PATCH", body: JSON.stringify({ defaultContributionScope: scope }) },
      );
      setDetail((current) =>
        current === undefined ? current : { ...current, workspace: response.workspace },
      );
      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === response.workspace.id ? response.workspace : workspace,
        ),
      );
    });
  }

  async function changeRole(userId: string, role: "admin" | "member") {
    if (detail === undefined) return;
    await run(async () => {
      await clientJson(`workspaces/${detail.workspace.id}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setDetail((current) =>
        current === undefined
          ? current
          : {
              ...current,
              members: current.members.map((member) =>
                member.userId === userId ? { ...member, role } : member,
              ),
            },
      );
    });
  }

  async function removeMember(userId: string) {
    if (detail === undefined) return;
    await run(async () => {
      await clientJson(`workspaces/${detail.workspace.id}/members/${userId}/remove`, {
        method: "POST",
      });
      setDetail((current) =>
        current === undefined
          ? current
          : { ...current, members: current.members.filter((member) => member.userId !== userId) },
      );
    });
  }

  async function issueKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (detail === undefined) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(async () => {
      const scopes = keyScopes.filter((scope) => data.getAll("scopes").includes(scope));
      const response = await clientJson<Issued>(`workspaces/${detail.workspace.id}/api-keys`, {
        method: "POST",
        body: JSON.stringify({ name: data.get("name"), scopes }),
      });
      setKeys((current) => [response.apiKey, ...current]);
      setIssued(response);
      setSaved(false);
      form.reset();
    });
  }

  async function revokeKey(key: ApiKeyMetadata) {
    if (detail === undefined) return;
    await run(async () => {
      const response = await clientJson<{ apiKey: ApiKeyMetadata }>(
        `workspaces/${detail.workspace.id}/api-keys/${key.id}/revoke`,
        { method: "POST" },
      );
      setKeys((current) => current.map((item) => (item.id === key.id ? response.apiKey : item)));
    });
  }

  const canAdmin = detail?.workspace.role === "owner" || detail?.workspace.role === "admin";
  return (
    <>
      {invitations.length === 0 ? null : (
        <section className="workspace-invites" aria-labelledby="pending-invitations">
          <p className="eyebrow">Action required</p>
          <h2 id="pending-invitations">Workspace invitations</h2>
          {invitations.map((invitation) => (
            <article key={invitation.id}>
              <div>
                <strong>{invitation.workspaceName}</strong>
                <small>
                  {invitation.inviterDisplayName} invited you as {invitation.role} · expires{" "}
                  {formatDate(invitation.expiresAt)}
                </small>
              </div>
              <div className="row-actions">
                <button
                  className="button"
                  disabled={pending}
                  onClick={() => respond(invitation, "accept")}
                >
                  Accept
                </button>
                <button
                  className="quiet-button"
                  disabled={pending}
                  onClick={() => respond(invitation, "reject")}
                >
                  Reject
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      <div className="workspace-layout">
        <section className="workspace-index">
          <p className="eyebrow">Memberships</p>
          <h2>Your workspaces</h2>
          <div className="workspace-list">
            {workspaces.map((workspace) => (
              <button
                aria-pressed={detail?.workspace.id === workspace.id}
                key={workspace.id}
                onClick={() => select(workspace)}
                type="button"
              >
                <span>
                  <strong>{workspace.name}</strong>
                  <small>
                    {workspace.memberCount} members · {workspace.role}
                  </small>
                </span>
                <StatusBadge tone={workspace.status === "active" ? "good" : "neutral"}>
                  {workspace.status}
                </StatusBadge>
              </button>
            ))}
          </div>
          <form className="stack-form" onSubmit={create}>
            <h3>Create workspace</h3>
            <label>
              Name
              <input maxLength={256} name="name" required />
            </label>
            <label>
              Description
              <textarea maxLength={1000} name="description" rows={3} />
            </label>
            <label>
              Default contribution scope
              <select defaultValue="team" name="defaultContributionScope">
                <option value="team">Team workspace</option>
                <option value="private">Personal private</option>
              </select>
            </label>
            <button className="button" disabled={pending}>
              Create workspace
            </button>
          </form>
        </section>
        <section className="workspace-detail">
          {detail === undefined ? (
            <div className="empty-state">
              <h2>Select a workspace</h2>
              <p>Inspect members, invitations, defaults, and scoped agent credentials.</p>
            </div>
          ) : (
            <WorkspaceDetailPanel
              canAdmin={canAdmin}
              changeRole={changeRole}
              detail={detail}
              invite={invite}
              issueKey={issueKey}
              keys={keys}
              pending={pending}
              removeMember={removeMember}
              revokeInvitation={revokeInvitation}
              revokeKey={revokeKey}
              updateDefaultScope={updateDefaultScope}
            />
          )}
        </section>
      </div>
      {error === undefined ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <SecretDialog issued={issued} saved={saved} setIssued={setIssued} setSaved={setSaved} />
    </>
  );
}

interface DetailPanelProps {
  canAdmin: boolean;
  changeRole: (userId: string, role: "admin" | "member") => void;
  detail: WorkspaceDetail;
  invite: (event: FormEvent<HTMLFormElement>) => void;
  issueKey: (event: FormEvent<HTMLFormElement>) => void;
  keys: ApiKeyMetadata[];
  pending: boolean;
  removeMember: (userId: string) => void;
  revokeInvitation: (invitationId: string) => void;
  revokeKey: (key: ApiKeyMetadata) => void;
  updateDefaultScope: (scope: "private" | "team") => void;
}

function WorkspaceDetailPanel(properties: DetailPanelProps) {
  const { detail } = properties;
  return (
    <>
      <div className="record-top">
        <div>
          <p className="eyebrow">{detail.workspace.slug}</p>
          <h2>{detail.workspace.name}</h2>
          <p className="muted">{detail.workspace.description ?? "No description"}</p>
        </div>
        <StatusBadge tone="good">{detail.workspace.role}</StatusBadge>
      </div>
      <div className="scope-note">
        <strong>Tenant boundary</strong>
        <p>
          Workspace agents can search this workspace and public knowledge. Team records never enter
          public results or public outcome aggregates.
        </p>
      </div>
      <section className="section-block">
        <p className="eyebrow">Authorized people</p>
        <h2>Members</h2>
        <div className="data-list">
          {detail.members.map((member) => (
            <article key={member.userId}>
              <div>
                <h3>{member.displayName}</h3>
                <small>
                  {member.email} · joined {formatDate(member.joinedAt)}
                </small>
              </div>
              <div className="row-actions">
                <StatusBadge tone={member.role === "owner" ? "good" : "neutral"}>
                  {member.role}
                </StatusBadge>
                {properties.canAdmin && member.role !== "owner" ? (
                  <>
                    <select
                      aria-label={`Role for ${member.displayName}`}
                      onChange={(event) =>
                        properties.changeRole(
                          member.userId,
                          event.target.value as "admin" | "member",
                        )
                      }
                      value={member.role}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <ConfirmButton
                      label="Remove"
                      message={`Remove ${member.displayName} and revoke their workspace keys?`}
                      onConfirm={() => properties.removeMember(member.userId)}
                    />
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
      {!properties.canAdmin ? null : <WorkspaceAdminPanel {...properties} />}
    </>
  );
}

function WorkspaceAdminPanel(properties: DetailPanelProps) {
  return (
    <>
      <section className="section-block">
        <p className="eyebrow">Privacy default</p>
        <h2>Agent contribution scope</h2>
        <label>
          Default for this workspace
          <select
            onChange={(event) =>
              properties.updateDefaultScope(event.target.value as "private" | "team")
            }
            value={properties.detail.workspace.defaultContributionScope}
          >
            <option value="team">Team workspace</option>
            <option value="private">Personal private</option>
          </select>
        </label>
      </section>
      <form className="stack-form section-block" onSubmit={properties.invite}>
        <p className="eyebrow">Existing users only</p>
        <h2>Invite member</h2>
        <p className="muted">
          No email is sent. The account matching this address sees the invitation in its dashboard
          and must accept it.
        </p>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Role
          <select defaultValue="member" name="role">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button className="button" disabled={properties.pending}>
          Create invitation
        </button>
      </form>
      {properties.detail.invitations.filter((item) => item.status === "pending").length ===
      0 ? null : (
        <div className="data-list">
          {properties.detail.invitations
            .filter((item) => item.status === "pending")
            .map((invitation) => (
              <article key={invitation.id}>
                <div>
                  <h3>{invitation.invitedEmail}</h3>
                  <small>
                    {invitation.role} · expires {formatDate(invitation.expiresAt)}
                  </small>
                </div>
                <ConfirmButton
                  label="Revoke invite"
                  message={`Revoke the pending invitation for ${invitation.invitedEmail}?`}
                  onConfirm={() => properties.revokeInvitation(invitation.id)}
                />
              </article>
            ))}
        </div>
      )}
      <form className="stack-form section-block" onSubmit={properties.issueKey}>
        <p className="eyebrow">Scoped MCP access</p>
        <h2>Issue workspace key</h2>
        <label>
          Key name
          <input maxLength={256} name="name" required />
        </label>
        <fieldset>
          <legend>Capabilities</legend>
          {keyScopes.map((scope) => (
            <label className="check-row" key={scope}>
              <input
                defaultChecked={scope === "account:read" || scope === "knowledge:read"}
                name="scopes"
                type="checkbox"
                value={scope}
              />
              <span>{scope}</span>
            </label>
          ))}
        </fieldset>
        <button className="button" disabled={properties.pending}>
          Create workspace key
        </button>
      </form>
      <div className="data-list">
        {properties.keys.map((key) => (
          <article key={key.id}>
            <div>
              <h3>{key.name}</h3>
              <small>
                <code>{key.prefix}••••••••</code> · {key.scopes.join(", ")}
              </small>
            </div>
            <div className="row-actions">
              <StatusBadge tone={key.status === "active" ? "good" : "neutral"}>
                {key.status}
              </StatusBadge>
              {key.status === "active" ? (
                <ConfirmButton
                  label="Revoke"
                  message={`Revoke ${key.name}?`}
                  onConfirm={() => properties.revokeKey(key)}
                />
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function ConfirmButton(properties: { label: string; message: string; onConfirm: () => void }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <button className="danger-button" type="button">
          {properties.label}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-panel">
          <AlertDialog.Title>Confirm workspace change</AlertDialog.Title>
          <AlertDialog.Description>{properties.message}</AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button className="quiet-button">Cancel</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="danger-button" onClick={properties.onConfirm}>
                Confirm
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function SecretDialog(properties: {
  issued: Issued | undefined;
  saved: boolean;
  setIssued: (issued: Issued | undefined) => void;
  setSaved: (saved: boolean) => void;
}) {
  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open && properties.saved) properties.setIssued(undefined);
      }}
      open={properties.issued !== undefined}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-panel secret-dialog"
          onEscapeKeyDown={(event) => {
            if (!properties.saved) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!properties.saved) event.preventDefault();
          }}
        >
          <Dialog.Title>Save this workspace key now</Dialog.Title>
          <Dialog.Description>
            {properties.issued?.warning} Its workspace binding cannot be changed.
          </Dialog.Description>
          <div className="secret-value">
            <code>{properties.issued?.plaintext}</code>
            <button
              className="quiet-button"
              onClick={() =>
                properties.issued === undefined
                  ? undefined
                  : navigator.clipboard.writeText(properties.issued.plaintext)
              }
              type="button"
            >
              Copy
            </button>
          </div>
          <label className="check-row">
            <input
              checked={properties.saved}
              onChange={(event) => properties.setSaved(event.target.checked)}
              type="checkbox"
            />
            <span>I saved this key securely</span>
          </label>
          <Dialog.Close asChild>
            <button className="button" disabled={!properties.saved}>
              Close
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
