/** Limits which Playwright request.resourceType() values trigger DB writes. */
export function shouldCaptureNetworkRequest(resourceType: string): boolean {
  const raw = process.env.ENDPOINT_CAPTURE_RESOURCE_TYPES?.trim();
  if (raw === "*") {
    return true;
  }
  if (!raw) {
    return resourceType === "xhr" || resourceType === "fetch";
  }
  const allowed = new Set(raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  return allowed.has(resourceType.toLowerCase());
}
