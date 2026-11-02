import { describe, expect, it } from "vitest";
import { getReadOnlyDemo } from "../lib/read-only-demo";

describe("public read-only demonstration fixtures", () => {
  it("contains only scoped synthetic orders and a viewer identity", () => {
    const data = getReadOnlyDemo();
    expect(data.user.role).toBe("VIEWER");
    expect(data.orders.length).toBeGreaterThan(0);
    expect(data.orders.every(order => order.source === "fixture" && order.reference.startsWith("DEMO-") && order.tenantId === "public-synthetic-demo" && order.locationId === data.activeLocationId && order.evidence.length === 0)).toBe(true);
    expect(data.integrations.every(integration => integration.liveEnabled === false && integration.status === "FIXTURES_ONLY")).toBe(true);
  });
  it("creates independent deterministic data for allowlisted locations", () => {
    const first = getReadOnlyDemo();
    first.orders[0].notes = "A caller cannot mutate another visitor's demo.";
    expect(getReadOnlyDemo().orders[0].notes).not.toBe(first.orders[0].notes);
    expect(getReadOnlyDemo("demo-camden").orders.every(order => order.locationId === "demo-camden")).toBe(true);
    expect(getReadOnlyDemo("untrusted-location").activeLocationId).toBe("demo-soho");
  });
});
