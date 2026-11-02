import type { DashboardData, Order, OrderStatus, Provider } from "./types";

/** Public synthetic fixtures only. This module has no I/O, credentials or API calls. */
export function getReadOnlyDemo(locationId = "demo-soho"): DashboardData {
  const locations = [
    { id: "demo-soho", restaurantId: "demo-riverside", name: "Soho · demo", address: "Fictional London location" },
    { id: "demo-camden", restaurantId: "demo-riverside", name: "Camden · demo", address: "Fictional London location" },
  ];
  const activeLocationId = locations.some(location => location.id === locationId) ? locationId : locations[0].id;
  const statuses: OrderStatus[] = ["NEW", "NEW", "PACKING", "PACKING", "READY", "READY", "COLLECTED", "COLLECTED"];
  const providers: Provider[] = ["MANUAL", "UBER_EATS", "DELIVEROO"];
  const menu = ["House burger", "Halloumi bowl", "Roasted vegetable wrap", "Rosemary fries"];
  const orders: Order[] = statuses.map((status, index) => {
    const placedAt = new Date(Date.UTC(2026, 10, 2, 12, 45 - index * 4)).toISOString();
    return {
      id: `${activeLocationId}-order-${index + 1}`, tenantId: "public-synthetic-demo", locationId: activeLocationId,
      reference: `DEMO-${activeLocationId === "demo-soho" ? "S" : "C"}-${1048 - index}`,
      provider: providers[index % providers.length], status,
      items: [{ name: menu[index % menu.length], quantity: index % 2 + 1 }, { name: "House lemonade", quantity: 1 }],
      notes: "Synthetic read-only demonstration order. No provider connection or customer information.",
      placedAt, receivedAt: placedAt, updatedAt: placedAt, evidence: [], source: "fixture",
    };
  });
  return {
    mode: "sandbox", activeLocationId,
    user: { userId: "public-demo-viewer", name: "Read-only demo viewer", tenantId: "public-synthetic-demo", locationId: activeLocationId, role: "VIEWER" },
    restaurants: [{ id: "demo-riverside", name: "Riverside Kitchen · demo" }], locations, orders,
    audit: orders.map(order => ({ id: `${order.id}-fixture`, tenantId: order.tenantId, locationId: order.locationId, orderId: order.id, action: "DEMO_FIXTURE", actor: "Synthetic preview", createdAt: order.placedAt, detail: "Static demonstration record. No operational event occurred." })),
    integrations: [
      { provider: "UBER_EATS", name: "Uber Eats", mode: "sandbox", status: "FIXTURES_ONLY", liveEnabled: false, description: "Synthetic display fixtures only. No connection, credentials, or provider orders." },
      { provider: "DELIVEROO", name: "Deliveroo", mode: "sandbox", status: "FIXTURES_ONLY", liveEnabled: false, description: "Synthetic display fixtures only. No connection, credentials, or provider orders." },
    ],
  };
}
