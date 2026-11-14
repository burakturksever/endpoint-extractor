import { test, expect } from "@playwright/test";

test("loads extractor UI", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Endpoint Extractor")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start batch" })).toBeVisible();
});
