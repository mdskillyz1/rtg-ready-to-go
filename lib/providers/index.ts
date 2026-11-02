import { AppError, assertSandbox } from "../errors";
import type { Integration, OrderItem, Provider } from "../types";

export interface ProviderOrder { reference: string; items: OrderItem[]; notes: string; }
export interface ProviderAdapter {
  provider: Exclude<Provider, "MANUAL">;
  validateWebhook(rawBody: string, headers: Headers): never;
  parseEvent(payload: unknown): { eventId: string; fixture: "order.created" };
  fetchOrder(providerOrderId: string): never;
  listStores(): { id: string; name: string; mode: "sandbox" }[];
  connectStore(): never;
  disconnectStore(): { revoked: true; liveEnabled: false };
  healthCheck(): { status: "sandbox"; liveConnected: false };
  capabilities(): { readOrders: false; acceptOrders: false; cancelOrders: false; fulfillOrders: false; fixtureOrders: true };
  fixture(eventId: string): ProviderOrder;
  fetchLiveOrders(): never;
  submitLiveEvidence(): never;
}
const blocked = (): never => { throw new AppError(403, "Live provider access is disabled. Official approval and a reviewed integration are required."); };
function adapter(provider: Exclude<Provider, "MANUAL">): ProviderAdapter {
  return {
    provider,
    validateWebhook: blocked,
    parseEvent(payload) {
      assertSandbox();
      if (!payload || typeof payload !== "object" || !("sandbox" in payload) || payload.sandbox !== true || !("eventId" in payload) || typeof payload.eventId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(payload.eventId)) throw new AppError(400, "Only explicitly labelled sandbox fixture events can be parsed.");
      return { eventId: payload.eventId, fixture: "order.created" };
    },
    fetchOrder: blocked,
    listStores: () => { assertSandbox(); return [{ id: "local-fixture-store", name: "RTG sandbox fixture store", mode: "sandbox" }]; },
    connectStore: blocked,
    disconnectStore: () => ({ revoked: true, liveEnabled: false }),
    healthCheck: () => ({ status: "sandbox", liveConnected: false }),
    capabilities: () => ({ readOrders: false, acceptOrders: false, cancelOrders: false, fulfillOrders: false, fixtureOrders: true }),
    fixture(eventId) {
      assertSandbox();
      return {
        reference: `${provider === "UBER_EATS" ? "UE" : "DL"}-${eventId.slice(-8).toUpperCase()}`,
        items: provider === "UBER_EATS"
          ? [{ name: "Truffle mushroom burger", quantity: 2 }, { name: "Rosemary fries", quantity: 1 }]
          : [{ name: "Grilled halloumi bowl", quantity: 1 }, { name: "House lemonade", quantity: 2 }],
        notes: "Sandbox fixture. No order was retrieved from the provider.",
      };
    },
    fetchLiveOrders: blocked,
    submitLiveEvidence: blocked,
  };
}
export const adapters: Record<Exclude<Provider, "MANUAL">, ProviderAdapter> = {
  UBER_EATS: adapter("UBER_EATS"), DELIVEROO: adapter("DELIVEROO"),
};
export const integrations: Integration[] = [
  { provider: "UBER_EATS", name: "Uber Eats", mode: "sandbox", status: "FIXTURES_ONLY", liveEnabled: false, description: "Fixture orders only. Official API approval and credentials are required for a live integration." },
  { provider: "DELIVEROO", name: "Deliveroo", mode: "sandbox", status: "FIXTURES_ONLY", liveEnabled: false, description: "Fixture orders only. No live order ingestion or evidence submission is enabled." },
];
