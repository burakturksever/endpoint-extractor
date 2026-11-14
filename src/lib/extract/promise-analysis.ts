import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import type { EndpointCandidate } from "@/lib/extract/endpoint-normalizer";

export function extractPromiseCandidates(jsCode: string): EndpointCandidate[] {
  let ast;
  try {
    ast = parse(jsCode, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx"]
    });
  } catch {
    return [];
  }

  const candidates: EndpointCandidate[] = [];

  traverse(ast, {
    CallExpression(path) {
      const callee = path.get("callee");
      if (!callee.isMemberExpression()) {
        return;
      }
      const property = callee.get("property");
      if (!property.isIdentifier({ name: "then" }) && !property.isIdentifier({ name: "catch" })) {
        return;
      }
      const source = path.toString();
      const urlMatch = source.match(/https?:\/\/[^\s"'`)]*|\/(?:api|v\d+\/)[A-Za-z0-9/_-]*/);
      if (!urlMatch) {
        return;
      }
      const params = Array.from(source.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)).map((m) => m[1]);
      const inferredMethod = inferMethod(source);
      candidates.push({
        sourceType: "promise",
        confidence: "low",
        method: inferredMethod,
        rawExpression: source,
        resolvedUrl: urlMatch[0],
        inferredParams: params,
        inferenceTrail: "Extracted from promise chain and surrounding expression."
      });
    }
  ,
    AwaitExpression(path) {
      const source = path.toString();
      const urlMatch = source.match(/https?:\/\/[^\s"'`)]*|\/(?:api|v\d+\/)[A-Za-z0-9/_-]*/);
      if (!urlMatch) {
        return;
      }
      candidates.push({
        sourceType: "promise",
        confidence: "low",
        method: inferMethod(source),
        rawExpression: source,
        resolvedUrl: urlMatch[0],
        inferredParams: Array.from(source.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)).map((m) => m[1]),
        inferenceTrail: "Extracted from async/await request-like expression."
      });
    }
  });

  return candidates;
}

function inferMethod(source: string): "GET" | "POST" | "UNKNOWN" {
  const lower = source.toLowerCase();
  if (lower.includes("post")) {
    return "POST";
  }
  if (lower.includes("get") || lower.includes("fetch")) {
    return "GET";
  }
  return "UNKNOWN";
}
