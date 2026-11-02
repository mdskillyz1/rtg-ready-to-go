import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const photo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=", "base64");
test("manual order → original photo → PDF export", async ({ page }) => {
  const reference = `DEMO-E2E-${randomUUID().slice(0, 6)}`;
  await page.goto("/console");
  await expect(page.getByRole("heading", { name: "Orders.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add order", exact: true }).click();
  await page.getByRole("textbox", { name: "Order reference" }).fill(reference);
  await page.getByLabel("Item 1 name", { exact: true }).fill("House burger");
  await page.getByLabel("Item 1 quantity", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Create manual order" }).click();
  await page.getByLabel("Search orders").fill(reference);
  await page.getByRole("button", { name: `#${reference}`, exact: true }).click();
  await page.getByLabel("Choose or take evidence photo").setInputFiles({ name: "sealed-demo.png", mimeType: "image/png", buffer: photo });
  await expect(page.getByAltText(`Photo preview for order ${reference}`)).toBeVisible();
  await page.getByRole("button", { name: `Save evidence for #${reference}`, exact: true }).click();
  await expect(page.getByText("1 captured", { exact: false })).toBeVisible();
  await expect(page.getByText("SHA-256", { exact: false }).first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export PDF" }).click();
  const bundle = await download;
  expect(bundle.suggestedFilename()).toMatch(/\.pdf$/);
  await bundle.saveAs("test-results/rtg-sample-evidence.pdf");
  await page.getByRole("button", { name: "Start packing" }).click();
  await page.getByRole("button", { name: "Mark ready" }).click();
  await expect(page.getByRole("button", { name: "Mark collected" })).toBeVisible();
  await page.screenshot({ path: "test-results/rtg-evidence.png", fullPage: true });
  await page.getByRole("button", { name: "Close order details", exact: true }).last().click();
  await page.getByLabel("Search orders").fill("");
  await expect(page.getByText("Order status updated.", { exact: true })).toBeHidden();
  await page.screenshot({ path: "test-results/rtg-dashboard.png", fullPage: true });
});

test("viewer access and location isolation", async ({ page }) => {
  await page.goto("/console");
  await expect(page.getByLabel("Select location")).toBeVisible();
  await page.getByLabel("Select location").selectOption("loc-camden");
  await expect(page.getByLabel("Select location")).toHaveValue("loc-camden");
  await page.getByRole("button", { name: "Organisation", exact: true }).click();
  await page.getByLabel("Current sandbox role").selectOption("VIEWER");
  await expect(page.getByLabel("Current sandbox role")).toHaveValue("VIEWER");
  await page.getByRole("button", { name: /^Orders/ }).click();
  await expect(page.getByRole("button", { name: "Add order", exact: true })).toBeDisabled();
});

test("mobile capture saves an offline draft and syncs it", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/capture");
  const select = page.getByLabel("Associate with an order");
  await expect(select.locator("option")).not.toHaveCount(1);
  await select.selectOption({ index: 1 });
  await context.setOffline(true);
  await page.getByLabel("Choose or take evidence photo").setInputFiles({ name: "offline-demo.png", mimeType: "image/png", buffer: photo });
  await page.getByRole("button", { name: /^Save evidence for/ }).click();
  await expect(page.getByText("1 unsynced capture", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Sync this location", exact: true }).click();
  await expect(page.getByText("1 unsynced capture", { exact: true })).not.toBeVisible();
});
