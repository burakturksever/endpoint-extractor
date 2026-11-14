import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppSettings, patchAppSettings } from "@/lib/runner/run-store";
import { validateLmStudioBaseUrl } from "@/lib/settings/validate-lm-studio-base-url";

export async function GET(): Promise<NextResponse> {
  const settings = await getAppSettings();
  return NextResponse.json({ settings });
}

const patchSchema = z.object({
  llmEnabled: z.boolean().optional(),
  lmStudioBaseUrl: z.string().optional(),
  lmStudioModel: z.string().min(1).optional(),
  lmStudioApiKey: z.union([z.string(), z.null()]).optional()
});

export async function PATCH(request: Request): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.lmStudioBaseUrl !== undefined) {
    const check = validateLmStudioBaseUrl(parsed.data.lmStudioBaseUrl);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    parsed.data.lmStudioBaseUrl = check.normalized;
  }
  const nextKey = parsed.data.lmStudioApiKey;
  const normalizedKey = nextKey === "" ? null : nextKey;
  const settings = await patchAppSettings({
    llmEnabled: parsed.data.llmEnabled,
    lmStudioBaseUrl: parsed.data.lmStudioBaseUrl,
    lmStudioModel: parsed.data.lmStudioModel,
    ...(normalizedKey !== undefined ? { lmStudioApiKey: normalizedKey } : {})
  });
  return NextResponse.json({ settings });
}
