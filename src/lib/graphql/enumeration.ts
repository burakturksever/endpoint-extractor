import { parseRawHeaders, truncateForStorage } from "@/lib/repeater/http";
import { normalizeHttpUrlForRepeater } from "@/lib/repeater/request-normalization";
import type { GraphqlEnumerationResponse, GraphqlSchemaSummary } from "@/lib/types/endpoints";

const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types { name }
  }
}`.trim();

function extractSchemaSummary(payload: unknown): GraphqlSchemaSummary | undefined {
  const root = payload as { data?: { __schema?: unknown } };
  const schema = root.data?.__schema as
    | {
        queryType?: { name?: string };
        mutationType?: { name?: string };
        subscriptionType?: { name?: string };
        types?: Array<{ name?: string }>;
      }
    | undefined;
  if (!schema) {
    return undefined;
  }
  const typeNames = (schema.types ?? [])
    .map((t) => t.name?.trim() ?? "")
    .filter((name) => name.length > 0)
    .slice(0, 300);
  return {
    queryType: schema.queryType?.name,
    mutationType: schema.mutationType?.name,
    subscriptionType: schema.subscriptionType?.name,
    typeNames
  };
}

export async function enumerateGraphqlEndpoint(input: {
  endpointUrl: string;
  headers?: string;
  authToken?: string;
  operation?: string;
  variablesJson?: string;
}): Promise<GraphqlEnumerationResponse> {
  const normalized = normalizeHttpUrlForRepeater(input.endpointUrl);
  if (!normalized.ok) {
    return {
      ok: false,
      endpointUrl: input.endpointUrl,
      durationMs: 0,
      introspectionAvailable: false,
      typenameProbeOk: false,
      errors: [normalized.error],
      responsePreview: ""
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(parseRawHeaders(input.headers ?? "") as Record<string, string>)
  };
  if (input.authToken && input.authToken.trim().length > 0) {
    headers.Authorization = `Bearer ${input.authToken.trim()}`;
  }

  const started = Date.now();
  const errors: string[] = [];
  let status = 0;
  let introspectionAvailable = false;
  let typenameProbeOk = false;
  let schema: GraphqlSchemaSummary | undefined;
  let responsePreview = "";

  if (input.operation && input.operation.trim().length > 0) {
    let variables: unknown = {};
    if (input.variablesJson && input.variablesJson.trim().length > 0) {
      try {
        variables = JSON.parse(input.variablesJson);
      } catch {
        errors.push("Variables JSON is invalid; ignored.");
      }
    }
    const customResponse = await fetch(normalized.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: input.operation, variables })
    }).catch((err) => err as Error);
    if (!(customResponse instanceof Error)) {
      const txt = await customResponse.text();
      responsePreview = truncateForStorage(txt, 1200);
    } else {
      errors.push(customResponse.message);
    }
  }

  const introspectionResponse = await fetch(normalized.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: INTROSPECTION_QUERY, variables: {} })
  }).catch((err) => err as Error);

  if (introspectionResponse instanceof Error) {
    errors.push(introspectionResponse.message);
    return {
      ok: false,
      endpointUrl: normalized.url,
      durationMs: Date.now() - started,
      introspectionAvailable,
      typenameProbeOk,
      errors,
      responsePreview
    };
  }

  status = introspectionResponse.status;
  const introspectionText = await introspectionResponse.text();
  responsePreview = truncateForStorage(introspectionText, 1200);
  try {
    const introspectionJson = JSON.parse(introspectionText) as { data?: unknown; errors?: Array<{ message?: string }> };
    const summary = extractSchemaSummary(introspectionJson);
    if (summary) {
      introspectionAvailable = true;
      schema = summary;
    } else if (Array.isArray(introspectionJson.errors) && introspectionJson.errors.length > 0) {
      errors.push(...introspectionJson.errors.map((e) => e.message ?? "Introspection failed"));
    }
  } catch {
    errors.push("Failed to parse introspection response JSON.");
  }

  const typenameResponse = await fetch(normalized.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: "query { __typename }", variables: {} })
  }).catch((err) => err as Error);

  if (!(typenameResponse instanceof Error)) {
    const txt = await typenameResponse.text();
    try {
      const parsed = JSON.parse(txt) as { data?: { __typename?: string }; errors?: Array<{ message?: string }> };
      if (parsed.data?.__typename) {
        typenameProbeOk = true;
      } else if (Array.isArray(parsed.errors)) {
        errors.push(...parsed.errors.map((e) => e.message ?? "Typename probe failed"));
      }
      if (!responsePreview) {
        responsePreview = truncateForStorage(txt, 1200);
      }
    } catch {
      errors.push("Failed to parse typename probe response JSON.");
    }
  } else {
    errors.push(typenameResponse.message);
  }

  return {
    ok: introspectionAvailable || typenameProbeOk,
    endpointUrl: normalized.url,
    status,
    durationMs: Date.now() - started,
    introspectionAvailable,
    typenameProbeOk,
    schema,
    errors,
    responsePreview
  };
}
