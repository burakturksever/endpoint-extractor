import { afterEach, describe, expect, it } from "vitest";
import { shouldCaptureNetworkRequest } from "@/lib/runner/network-capture-policy";

describe("shouldCaptureNetworkRequest", () => {
  const prev = process.env.ENDPOINT_CAPTURE_RESOURCE_TYPES;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.ENDPOINT_CAPTURE_RESOURCE_TYPES;
    } else {
      process.env.ENDPOINT_CAPTURE_RESOURCE_TYPES = prev;
    }
  });

  it("defaults to xhr and fetch only", () => {
    delete process.env.ENDPOINT_CAPTURE_RESOURCE_TYPES;
    expect(shouldCaptureNetworkRequest("xhr")).toBe(true);
    expect(shouldCaptureNetworkRequest("fetch")).toBe(true);
    expect(shouldCaptureNetworkRequest("image")).toBe(false);
  });

  it("allows * for all resource types", () => {
    process.env.ENDPOINT_CAPTURE_RESOURCE_TYPES = "*";
    expect(shouldCaptureNetworkRequest("image")).toBe(true);
  });

  it("respects explicit allowlist", () => {
    process.env.ENDPOINT_CAPTURE_RESOURCE_TYPES = "websocket, xhr";
    expect(shouldCaptureNetworkRequest("websocket")).toBe(true);
    expect(shouldCaptureNetworkRequest("fetch")).toBe(false);
  });
});
