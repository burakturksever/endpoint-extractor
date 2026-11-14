import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import type { File } from "@babel/types";
import type { EndpointCandidate } from "@/lib/extract/endpoint-normalizer";

interface ScopeContext {
  baseUrls: Map<string, string>;
}

export function extractStaticCandidates(jsCode: string): EndpointCandidate[] {
  const endpoints: EndpointCandidate[] = [];
  const context: ScopeContext = { baseUrls: new Map() };
  const ast = safeParse(jsCode);
  if (!ast) {
    return extractPathCandidatesByRegex(jsCode);
  }

  traverse(ast, {
    VariableDeclarator(path) {
      if (path.node.id.type !== "Identifier") {
        return;
      }
      const name = path.node.id.name;
      const init = path.node.init;
      if (init?.type === "StringLiteral" && /^https?:\/\//.test(init.value)) {
        context.baseUrls.set(name, init.value);
      }
    },
    CallExpression(path) {
      const callee = path.get("callee");
      const endpoint = extractFromCall(path.node, context.baseUrls);
      if (!endpoint) {
        return;
      }
      endpoints.push({
        sourceType: "static",
        confidence: endpoint.confidence,
        method: endpoint.method,
        rawExpression: jsCode.slice(path.node.start ?? 0, path.node.end ?? 0),
        resolvedUrl: endpoint.url,
        inferredParams: endpoint.params,
        inferenceTrail: endpoint.trail
      });
    },
    NewExpression(path) {
      const callee = path.get("callee");
      if (!callee.isIdentifier({ name: "XMLHttpRequest" })) {
        return;
      }
      endpoints.push({
        sourceType: "static",
        confidence: "low",
        method: "UNKNOWN",
        rawExpression: "new XMLHttpRequest()",
        resolvedUrl: "[xhr-open-unresolved]",
        inferredParams: [],
        inferenceTrail: "Detected XMLHttpRequest usage; endpoint likely configured via open()."
      });
    }
  });

  return [...endpoints, ...extractPathCandidatesByRegex(jsCode)];
}

function extractFromCall(
  node: any,
  baseUrls: Map<string, string>
): { url: string; method: "GET" | "POST" | "UNKNOWN"; confidence: "medium" | "low"; params: string[]; trail: string } | null {
  const callee = node.callee;
  const firstArg = node.arguments?.[0];
  if (!firstArg) {
    return null;
  }
  if (callee?.type === "Identifier" && callee.name === "fetch") {
    return resolveExpression(firstArg, baseUrls);
  }
  if (callee?.type === "MemberExpression" && callee.property?.type === "Identifier") {
    const methodName = callee.property.name.toLowerCase();
    if (["get", "post", "put", "patch", "delete"].includes(methodName)) {
      const resolved = resolveExpression(firstArg, baseUrls);
      if (!resolved) {
        return null;
      }
      return {
        ...resolved,
        method: methodName.toUpperCase() as "GET" | "POST"
      };
    }
  }
  return null;
}

function resolveExpression(
  expression: File["program"]["body"][number] | any,
  baseUrls: Map<string, string>
): { url: string; method: "GET" | "POST" | "UNKNOWN"; confidence: "medium" | "low"; params: string[]; trail: string } | null {
  if (expression.type === "StringLiteral") {
    return { url: expression.value, method: "GET", confidence: "medium", params: [], trail: "Resolved from static string literal." };
  }

  if (expression.type === "TemplateLiteral") {
    const combined = expression.quasis.map((q: any) => q.value.cooked).join("{expr}");
    return { url: combined, method: "UNKNOWN", confidence: "low", params: [], trail: "Resolved from template literal with dynamic segments." };
  }

  if (expression.type === "BinaryExpression" && expression.operator === "+") {
    const left = expression.left;
    const right = expression.right;
    if (left.type === "Identifier" && right.type === "StringLiteral" && baseUrls.has(left.name)) {
      return {
        url: `${baseUrls.get(left.name)}${right.value}`,
        method: "GET",
        confidence: "medium",
        params: [],
        trail: `Resolved from base URL variable '${left.name}'.`
      };
    }
    if (left.type === "StringLiteral" && right.type === "StringLiteral") {
      return {
        url: `${left.value}${right.value}`,
        method: "GET",
        confidence: "medium",
        params: [],
        trail: "Resolved from string concatenation."
      };
    }
    return {
      url: "[dynamic-concat]",
      method: "UNKNOWN",
      confidence: "low",
      params: [],
      trail: "Detected unresolved dynamic string concatenation."
    };
  }

  if (expression.type === "Identifier" && baseUrls.has(expression.name)) {
    return {
      url: baseUrls.get(expression.name)!,
      method: "GET",
      confidence: "medium",
      params: [],
      trail: `Resolved from known base URL identifier '${expression.name}'.`
    };
  }

  return null;
}

function safeParse(jsCode: string): File | null {
  try {
    return parse(jsCode, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx"]
    }) as File;
  } catch {
    return null;
  }
}

function extractPathCandidatesByRegex(jsCode: string): EndpointCandidate[] {
  const matches = jsCode.matchAll(/["'`]((?:\/api|\/v\d+\/|https?:\/\/)[A-Za-z0-9/_\-.:?=&%]+)["'`]/g);
  const unique = new Set<string>();
  const endpoints: EndpointCandidate[] = [];
  for (const match of matches) {
    const path = match[1];
    if (!path || unique.has(path)) {
      continue;
    }
    unique.add(path);
    endpoints.push({
      sourceType: "static",
      confidence: "low",
      method: "UNKNOWN",
      rawExpression: match[0] ?? path,
      resolvedUrl: path,
      inferredParams: [],
      inferenceTrail: "Extracted from JS string literal path pattern."
    });
  }
  return endpoints;
}
