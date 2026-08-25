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
        <p className="eyebrow">Before you run it</p>
        <h2>Provide two environment variables</h2>
        <p className="section-copy">
          KnownPath never writes secret values into agent configuration. Launch agents from a shell
          that supplies both variables.
        </p>
        <div className="env-grid">
          <div>
            <code>KNOWNPATH_API_URL</code>
            <p>The URL of your trusted KnownPath API deployment.</p>
          </div>
          <div>
            <code>KNOWNPATH_API_KEY</code>
            <p>A scoped key created in this dashboard. Use knowledge:read for retrieval.</p>
          </div>
        </div>
      </section>
      <section className="section-block">
        <p className="eyebrow">Supported clients</p>
        <h2>One installer, four agents</h2>
        <div className="client-grid">
          {["OpenAI Codex CLI", "Claude Code", "Cursor", "Gemini CLI"].map((client) => (
            <div key={client}>
              <strong>{client}</strong>
              <span>Detection · MCP · skill</span>
            </div>
          ))}
        </div>
        <p className="section-copy">
          Run <code>npx knownpath doctor</code> after installation to check the API URL, key, MCP
          configuration, and installed skill version.
        </p>
      </section>
    </>
  );
}
