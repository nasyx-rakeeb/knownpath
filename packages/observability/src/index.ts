import {
  SpanKind,
  SpanStatusCode,
  context,
  metrics,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const tracer = trace.getTracer("@knownpath/observability", "1.0.0");
const meter = metrics.getMeter("@knownpath/observability", "1.0.0");

const httpRequests = meter.createCounter("knownpath.http.requests", {
  description: "Completed HTTP requests",
});
const httpDuration = meter.createHistogram("knownpath.http.duration", {
  description: "HTTP request duration",
  unit: "ms",
});
const mcpTools = meter.createCounter("knownpath.mcp.tool.calls", {
  description: "Completed MCP tool calls",
});
const mcpDuration = meter.createHistogram("knownpath.mcp.tool.duration", {
  description: "MCP tool duration",
  unit: "ms",
});
const searches = meter.createCounter("knownpath.search.requests", {
  description: "Knowledge search requests and result classes",
});
const searchResults = meter.createHistogram("knownpath.search.results", {
  description: "Number of safe results returned by a knowledge search",
  unit: "{result}",
});
const dependencyChecks = meter.createCounter("knownpath.dependency.checks", {
  description: "Dependency health-check outcomes",
});
const securityDenials = meter.createCounter("knownpath.security.denials", {
  description: "Security policy denials by bounded reason category",
});
const queueDepth = meter.createHistogram("knownpath.queue.depth", {
  description: "Observed BullMQ queue depth by queue and state",
  unit: "{job}",
});
const ingestionItems = meter.createCounter("knownpath.ingestion.items", {
  description: "Source ingestion item transitions",
});
const providerEvents = meter.createCounter("knownpath.provider.events", {
  description: "External provider quota, rate-limit, and failure signals",
});
const contributions = meter.createCounter("knownpath.contributions", {
  description: "Contribution transitions by non-sensitive state and visibility",
});
const contributionQuality = meter.createCounter("knownpath.contribution.quality", {
  description: "Deterministic contribution quality decisions and relationship routes",
});
const contributionModeration = meter.createCounter("knownpath.contribution.moderation", {
  description: "Contribution moderation transitions",
});
const outcomes = meter.createCounter("knownpath.outcomes", {
  description: "Submitted outcome classifications",
});

export type TelemetryExporter = "console" | "none" | "otlp";

export interface ObservabilityOptions {
  readonly enabled: boolean;
  readonly exporter: TelemetryExporter;
  readonly exportIntervalMs: number;
  readonly otlpEndpoint?: string;
  readonly serviceName: string;
  readonly serviceVersion: string;
}

export interface ObservabilityRuntime {
  readonly shutdown: () => Promise<void>;
}

export async function startObservability(
  options: ObservabilityOptions,
): Promise<ObservabilityRuntime> {
  if (!options.enabled || options.exporter === "none") {
    return { shutdown: async () => undefined };
  }
  const endpoint = options.otlpEndpoint?.replace(/\/$/u, "");
  if (options.exporter === "otlp" && endpoint === undefined) {
    throw new Error("OTEL_EXPORTER_OTLP_ENDPOINT is required when OTEL_EXPORTER=otlp");
  }
  const traceExporter =
    options.exporter === "console"
      ? new ConsoleSpanExporter()
      : new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });
  const metricExporter =
    options.exporter === "console"
      ? new ConsoleMetricExporter()
      : new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` });
  const sdk = new NodeSDK({
    autoDetectResources: false,
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion,
      "deployment.environment.name": process.env["NODE_ENV"] ?? "development",
    }),
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: options.exportIntervalMs,
    }),
  });
  sdk.start();
  return { shutdown: async () => sdk.shutdown() };
}

export function startServerSpan(name: string, attributes: Attributes = {}): Span {
  return tracer.startSpan(name, { kind: SpanKind.SERVER, attributes });
}

export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  operation: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { kind: SpanKind.INTERNAL, attributes }, async (span) => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: safeErrorType(error) });
      span.setAttribute("error.type", safeErrorType(error));
      throw error;
    } finally {
      span.end();
    }
  });
}

export function runWithSpan<T>(span: Span, operation: () => T): T {
  return context.with(trace.setSpan(context.active(), span), operation);
}

export function activeTraceFields(): { traceId?: string; spanId?: string } {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (spanContext === undefined || !spanContext.traceId || !spanContext.spanId) return {};
  return { traceId: spanContext.traceId, spanId: spanContext.spanId };
}

export function finishServerSpan(
  span: Span,
  input: {
    readonly durationMs: number;
    readonly method: string;
    readonly route: string;
    readonly statusCode: number;
  },
): void {
  const statusClass = `${Math.floor(input.statusCode / 100)}xx`;
  const attributes = {
    "http.request.method": input.method,
    "http.route": input.route,
    "http.response.status_class": statusClass,
  };
  span.setAttributes({ ...attributes, "http.response.status_code": input.statusCode });
  span.setStatus({ code: input.statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK });
  httpRequests.add(1, attributes);
  httpDuration.record(input.durationMs, attributes);
  span.end();
}

export function recordMcpTool(input: {
  readonly durationMs: number;
  readonly outcome: "error" | "success";
  readonly tool: "alternatives" | "contribute" | "get" | "outcome" | "search" | "status";
}): void {
  const attributes = { "mcp.tool.name": input.tool, "knownpath.outcome": input.outcome };
  mcpTools.add(1, attributes);
  mcpDuration.record(input.durationMs, attributes);
}

export function recordSearch(input: {
  readonly backend: "atlas" | "local";
  readonly resultCount: number;
  readonly scope: "personal" | "public" | "team" | "team_public";
}): void {
  const attributes = {
    "knownpath.search.backend": input.backend,
    "knownpath.search.scope": input.scope,
    "knownpath.search.result_class": input.resultCount === 0 ? "empty" : "non_empty",
  };
  searches.add(1, attributes);
  searchResults.record(input.resultCount, attributes);
}

export function recordDependencyCheck(
  dependency: "mongodb" | "queue" | "rate_limiter" | "telemetry",
  state: "degraded" | "ok" | "unavailable",
): void {
  dependencyChecks.add(1, {
    "knownpath.dependency": dependency,
    "knownpath.dependency.state": state,
  });
}

export function recordSecurityDenial(
  reason: "abuse_limit" | "auth" | "origin" | "payload" | "rate_limit" | "ssrf" | "tenant",
  surface: "api" | "ingestion" | "installer" | "mcp",
): void {
  securityDenials.add(1, {
    "knownpath.security.reason": reason,
    "knownpath.security.surface": surface,
  });
}

export function recordQueueDepth(
  queue: "ai" | "control" | "feedback" | "github" | "knowledge" | "sources",
  state: "active" | "delayed" | "failed" | "waiting",
  count: number,
): void {
  queueDepth.record(count, { "messaging.destination.name": queue, "knownpath.job.state": state });
}

export function recordIngestionItems(
  adapter: "github" | "official_docs",
  state: "created" | "discovered" | "failed" | "unchanged" | "updated",
  count: number,
): void {
  if (count > 0)
    ingestionItems.add(count, {
      "knownpath.ingestion.adapter": adapter,
      "knownpath.ingestion.state": state,
    });
}

export function recordProviderEvent(
  provider: "gemini" | "github",
  event: "authentication" | "quota" | "rate_limit" | "transient_failure",
): void {
  providerEvents.add(1, { "knownpath.provider": provider, "knownpath.provider.event": event });
}

export function recordContribution(
  status: "pending" | "quarantined" | "rejected" | "accepted" | "superseded",
  visibility: "private" | "public" | "team",
): void {
  contributions.add(1, {
    "knownpath.contribution.status": status,
    "knownpath.visibility": visibility,
  });
}

export function recordContributionQuality(
  decision: "eligible" | "rejected" | "review",
  relationship: "novel" | "corroboration" | "variant" | "extension" | "correction" | "conflict",
): void {
  contributionQuality.add(1, {
    "knownpath.contribution.quality_decision": decision,
    "knownpath.contribution.relationship": relationship,
  });
}

export function recordContributionModeration(action: "approved" | "rejected"): void {
  contributionModeration.add(1, { "knownpath.contribution.moderation_action": action });
}

export function recordOutcome(
  outcome:
    | "solved"
    | "partially_helped"
    | "attempted_failed"
    | "incompatible_environment"
    | "stale_or_outdated"
    | "misleading_or_unsafe"
    | "not_used",
): void {
  outcomes.add(1, { "knownpath.outcome.class": outcome });
}

function safeErrorType(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u.test(error.name)) {
    return error.name;
  }
  return "Error";
}
