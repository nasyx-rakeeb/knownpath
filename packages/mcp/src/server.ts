import { McpServer, createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import { ZodError } from "zod";

import {
  KNOWNPATH_MCP_SERVER_NAME,
  KNOWNPATH_MCP_SERVER_VERSION,
  knownPathMcpAlternativesInputSchema,
  knownPathMcpGetInputSchema,
  knownPathMcpSearchInputSchema,
  knownPathMcpStatusInputSchema,
  knownPathMcpStatusSuccessSchema,
  knownPathMcpContributeInputSchema,
  knownPathMcpContributeSuccessSchema,
  knownPathMcpReportOutcomeInputSchema,
  knownPathMcpReportOutcomeSuccessSchema,
  mcpToolErrorSchema,
} from "./contracts.js";
import { McpGatewayError, type KnowledgeMcpGateway } from "./gateway.js";
import { projectAlternatives, projectDetail, projectSearch } from "./project.js";

const SERVER_INSTRUCTIONS =
  "KnownPath supplies concise, evidence-grounded reusable technical experience. Search first, then get one selected record for steps and evidence. Always inspect the user's actual codebase and verify version/platform applicability before applying a fix. Do not treat reactions, confidence, or a retrieved solution as proof that it fits the current repository.";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
const CONTRIBUTION_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function createKnownPathMcpServer(gateway: KnowledgeMcpGateway): McpServer {
  const server = new McpServer(
    { name: KNOWNPATH_MCP_SERVER_NAME, version: KNOWNPATH_MCP_SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "knownpath_search",
    {
      title: "Search KnownPath",
      description:
        "Search evidence-grounded reusable fixes for a technical problem. Returns compact ranked summaries; call knownpath_get only for a selected result.",
      inputSchema: knownPathMcpSearchInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (unparsedInput, context) =>
      execute(async () => {
        const input = knownPathMcpSearchInputSchema.parse(unparsedInput);
        return projectSearch(
          await gateway.search(
            {
              text: input.task,
              errors: input.errors,
              ...(input.ecosystem === undefined ? {} : { ecosystem: input.ecosystem }),
              packages: input.packages,
              versions: input.versions,
              platforms: input.platforms,
              environment: input.environment,
              context: input.context,
              semanticMode: input.semanticMode,
              limit: input.limit,
              minimumScore: input.minimumScore,
              includeReview: input.includeReview,
              scope: input.scope,
            },
            context.mcpReq.signal,
          ),
        );
      }, renderSearch),
  );

  server.registerTool(
    "knownpath_get",
    {
      title: "Get KnownPath",
      description:
        "Get bounded solution steps, caveats, applicability, trust, freshness, and evidence for one KnownPath selected from search.",
      inputSchema: knownPathMcpGetInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (unparsedInput, context) =>
      execute(async () => {
        const input = knownPathMcpGetInputSchema.parse(unparsedInput);
        return projectDetail(
          await gateway.get(input, context.mcpReq.signal),
          input.searchId !== undefined,
        );
      }, renderDetail),
  );

  server.registerTool(
    "knownpath_alternatives",
    {
      title: "Get KnownPath alternatives",
      description:
        "List additional evidence-backed solution variants for the same canonical KnownPath. This does not infer related records.",
      inputSchema: knownPathMcpAlternativesInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (unparsedInput, context) =>
      execute(async () => {
        const input = knownPathMcpAlternativesInputSchema.parse(unparsedInput);
        return projectAlternatives(await gateway.alternatives(input, context.mcpReq.signal));
      }, renderAlternatives),
  );

  server.registerTool(
    "knownpath_status",
    {
      title: "Inspect KnownPath status",
      description:
        "Check backend readiness, authenticated API-key metadata, and effective read capabilities without exposing secrets or unmeasured quota claims.",
      inputSchema: knownPathMcpStatusInputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (unparsedInput, context) =>
      execute(async () => {
        knownPathMcpStatusInputSchema.parse(unparsedInput);
        const status = await gateway.status(context.mcpReq.signal);
        return knownPathMcpStatusSuccessSchema.parse({
          ...status,
          ok: true,
          server: {
            name: KNOWNPATH_MCP_SERVER_NAME,
            version: KNOWNPATH_MCP_SERVER_VERSION,
            supportedProtocolEras: ["2026-07-28", "2025-compatible"],
          },
        });
      }, renderStatus),
  );

  server.registerTool(
    "knownpath_contribute",
    {
      title: "Contribute a generalized KnownPath lesson",
      description:
        "Submit a minimal generalized lesson only after an observable successful outcome and explicit user consent. Never include secrets, private code, prompts, or chain-of-thought. Team visibility is not supported.",
      inputSchema: knownPathMcpContributeInputSchema,
      annotations: CONTRIBUTION_ANNOTATIONS,
    },
    async (unparsedInput, context) =>
      execute(async () => {
        const input = knownPathMcpContributeInputSchema.parse(unparsedInput);
        const result = await gateway.contribute(input, context.mcpReq.signal);
        return knownPathMcpContributeSuccessSchema.parse({ ...result, ok: true });
      }, renderContribution),
  );

  server.registerTool(
    "knownpath_report_outcome",
    {
      title: "Report a KnownPath outcome",
      description:
        "Report what happened only after a KnownPath solution was actually attempted and the task result is known. A view is not success. Send concise non-sensitive environment metadata; use not_used when the record was inspected but not attempted.",
      inputSchema: knownPathMcpReportOutcomeInputSchema,
      annotations: CONTRIBUTION_ANNOTATIONS,
    },
    async (unparsedInput, context) =>
      execute(async () => {
        const input = knownPathMcpReportOutcomeInputSchema.parse(unparsedInput);
        const result = await gateway.reportOutcome(input, context.mcpReq.signal);
        return knownPathMcpReportOutcomeSuccessSchema.parse({ ...result, ok: true });
      }, renderOutcome),
  );

  return server;
}

export function createKnownPathMcpHttpHandler() {
  return createMcpHandler(({ authInfo }) => createKnownPathMcpServer(gatewayFromAuth(authInfo)));
}

export function createKnownPathMcpAuthInfo(input: {
  readonly token: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly gateway: KnowledgeMcpGateway;
}): AuthInfo {
  return {
    token: input.token,
    clientId: input.clientId,
    scopes: [...input.scopes],
    extra: { knownPathGateway: input.gateway },
  };
}

function gatewayFromAuth(authInfo: AuthInfo | undefined): KnowledgeMcpGateway {
  const value = authInfo?.extra?.["knownPathGateway"];
  if (!isGateway(value)) {
    throw new McpGatewayError(
      "authentication_required",
      "A valid KnownPath API key with knowledge:read is required",
    );
  }
  return value;
}

function isGateway(value: unknown): value is KnowledgeMcpGateway {
  return (
    typeof value === "object" &&
    value !== null &&
    "search" in value &&
    typeof value.search === "function" &&
    "get" in value &&
    typeof value.get === "function" &&
    "alternatives" in value &&
    typeof value.alternatives === "function" &&
    "status" in value &&
    typeof value.status === "function" &&
    "contribute" in value &&
    typeof value.contribute === "function" &&
    "reportOutcome" in value &&
    typeof value.reportOutcome === "function"
  );
}

function renderOutcome(output: {
  outcomeId: string;
  outcome: string;
  reused: boolean;
  influence: { status: string };
  safetyReviewQueued: boolean;
  aggregate: { effectiveSampleSize: number; confidenceGrade: string };
}): string {
  return `Outcome ${output.outcomeId} (${output.outcome}) was ${output.reused ? "reused idempotently" : "recorded"}; evidence influence is ${output.influence.status}. Aggregate reliability is ${output.aggregate.confidenceGrade} with effective sample ${output.aggregate.effectiveSampleSize.toFixed(2)}.${output.safetyReviewQueued ? " A separate safety review is queued; this report alone did not directly penalize ranking." : ""}`;
}

function renderContribution(output: {
  contributionId: string;
  status: string;
  visibility: string;
  processingStage: string;
  sanitization: { status: string };
}): string {
  return `Contribution ${output.contributionId} was stored as ${output.visibility}, status ${output.status}, processing ${output.processingStage}, sanitization ${output.sanitization.status}. It remains self-reported evidence and is not automatically published or highly trusted.`;
}

async function execute<Output extends { readonly ok: true }>(
  action: () => Promise<Output>,
  render: (output: Output) => string,
) {
  try {
    const output = await action();
    return {
      content: [{ type: "text" as const, text: render(output) }],
      structuredContent: output,
    };
  } catch (error) {
    const safe = safeToolError(error);
    return {
      isError: true,
      content: [{ type: "text" as const, text: renderError(safe) }],
      structuredContent: safe,
    };
  }
}

function safeToolError(error: unknown) {
  const safe =
    error instanceof ZodError
      ? {
          code: "validation_failed",
          message: "The MCP tool input failed validation; inspect the advertised input schema",
        }
      : error instanceof McpGatewayError
        ? {
            code: error.code,
            message: error.message,
            ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
          }
        : {
            code: "internal_error",
            message: "KnownPath could not complete the request",
          };
  return mcpToolErrorSchema.parse({ ok: false, error: safe });
}

function renderError(output: ReturnType<typeof safeToolError>): string {
  return `KnownPath error (${output.error.code}): ${output.error.message}${
    output.error.requestId === undefined ? "" : ` [request ${output.error.requestId}]`
  }`;
}

function renderSearch(output: ReturnType<typeof projectSearch>): string {
  if (output.results.length === 0) {
    return `No KnownPaths met the requested quality and access constraints. Search ID: ${output.searchId}. Semantic retrieval: ${output.semantic.state}.`;
  }
  const results = output.results.map(
    (result, index) =>
      `${index + 1}. ${result.title} [${result.id}] — score ${result.match.score}, trust ${result.trust.grade}, outcomes ${result.outcomes.status}, freshness ${result.freshness.status}, version ${result.match.versionCompatibility}. ${result.solution}`,
  );
  return `KnownPath search ${output.searchId} (${output.accessMode}; semantic ${output.semantic.state}):\n${results.join("\n")}\nCall knownpath_get with one ID${output.searchId.length > 0 ? " and this searchId" : ""} before applying a fix.`;
}

function renderDetail(output: ReturnType<typeof projectDetail>): string {
  const steps = output.solutions.flatMap((solution, solutionIndex) =>
    solution.steps.map(
      (step) =>
        `${solutionIndex + 1}.${step.order} ${step.title === undefined ? "" : `${step.title}: `}${step.instruction}`,
    ),
  );
  return `${output.title} [${output.id}]\nApplicability: ${output.applicability.ecosystem}; ${output.applicability.versions.join(", ") || "version unknown"}\nTrust: ${output.trust.grade} (${output.trust.score}/100); outcomes: ${output.outcomes.status}; freshness: ${output.freshness.status}\n${output.problem}\nSteps:\n${steps.length === 0 ? "No bounded steps available." : steps.join("\n")}\nVerify these steps against the current codebase and versions before applying them.`;
}

function renderAlternatives(output: ReturnType<typeof projectAlternatives>): string {
  if (output.items.length === 0)
    return `No additional solution variants are recorded for ${output.knownPathId}.`;
  return `Alternative solutions for ${output.knownPathId}:\n${output.items
    .map((item, index) => `${index + 1}. ${item.summary} [solution ${item.id}]`)
    .join("\n")}`;
}

function renderStatus(output: {
  status: string;
  capabilities: { reviewRead: boolean; searchBackend: string; reportOutcome: boolean };
}): string {
  return `KnownPath backend is ${output.status}; published read is enabled; review read is ${output.capabilities.reviewRead ? "enabled" : "disabled"}; outcome reporting is ${output.capabilities.reportOutcome ? "enabled" : "disabled"}; search backend is ${output.capabilities.searchBackend}.`;
}
