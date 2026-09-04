"use client";
import { useEffect, useState } from "react";

const command = "npx knownpath install";
export function InstallGuide() {
  const [platform, setPlatform] = useState("your shell");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const value = navigator.userAgent.toLowerCase();
    setPlatform(
      value.includes("win")
        ? "Windows PowerShell"
        : value.includes("mac")
          ? "macOS Terminal"
          : "Linux shell",
    );
  }, []);
  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <>
      <section className="install-command">
        <p className="eyebrow">Run in {platform}</p>
        <div>
          <code>{command}</code>
          <button className="button button-small" onClick={copy} type="button">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p>
          The installer detects supported agents, previews every change, and configures MCP plus the
          canonical KnownPath skill.
        </p>
      </section>
      <section className="section-block">
        <p className="eyebrow">Hosted onboarding</p>
        <h2>Sign in once in your browser</h2>
        <p className="section-copy">
          The installer opens the official KnownPath authorization page, creates a scoped machine
          credential, and stores it in your operating system credential manager. No API URL or key
          setup is required for the hosted service.
        </p>
        <div className="env-grid">
          <div>
            <strong>Credentials stay private</strong>
            <p>The machine credential is never written to agent configuration or shell profiles.</p>
          </div>
          <div>
            <strong>Self-hosting stays explicit</strong>
            <p>
              Operators can select their own trusted API origin with <code>--api-url</code>.
            </p>
          </div>
        </div>
      </section>
      <section className="section-block">
        <p className="eyebrow">Supported clients</p>
        <h2>One installer, five agents</h2>
        <div className="client-grid">
          {["OpenAI Codex CLI", "Claude Code", "Cursor", "Gemini CLI", "OpenCode"].map((client) => (
            <div key={client}>
              <strong>{client}</strong>
              <span>Detection · MCP · skill</span>
            </div>
          ))}
        </div>
        <p className="section-copy">
          Run <code>npx knownpath doctor</code> after installation to check authentication, backend
          connectivity, MCP configuration, and the installed skill version.
        </p>
      </section>
    </>
  );
}
