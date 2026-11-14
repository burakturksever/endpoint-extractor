import { z } from "zod";
import { normalizeHttpUrlForRepeater } from "@/lib/repeater/request-normalization";

/** Zod string that accepts raw URLs and normalizes via normalizeHttpUrlForRepeater. */
export const repeaterUrlSchema = z
  .string()
  .superRefine((val, ctx) => {
    const r = normalizeHttpUrlForRepeater(val);
    if (!r.ok) {
      ctx.addIssue({ code: "custom", message: r.error });
    }
  })
  .transform((val) => {
    const r = normalizeHttpUrlForRepeater(val);
    if (!r.ok) {
      throw new Error("URL normalization failed after refine.");
    }
    return r.url;
  });
