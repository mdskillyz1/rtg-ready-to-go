export type Provider = "MANUAL" | "UBER_EATS" | "DELIVEROO";
export type OrderStatus = "NEW" | "PACKING" | "READY" | "COLLECTED";
export type Role = "ADMIN" | "MANAGER" | "STAFF" | "VIEWER";
export type EvidenceStage = "PACKED" | "SEALED" | "HANDOFF";
export interface Restaurant { id: string; name: string; }
export interface Location { id: string; restaurantId: string; name: string; address: string; }
export interface OrderItem { name: string; quantity: number; }
export interface Evidence {
  id: string; orderId: string; filename: string; mimeType: string; size: number;
  sha256: string; createdAt: string; capturedBy: string; stage: EvidenceStage; note: string;
  tenantId?: string; deviceCapturedAt?: string; clientCaptureId?: string;
  sealId?: string; handoverNote?: string; retentionUntil?: string;
}
export interface Order {
  id: string; tenantId: string; locationId: string; reference: string;
  provider: Provider; status: OrderStatus; items: OrderItem[];
  notes: string; placedAt: string; updatedAt: string; evidence: Evidence[];
  source: "manual" | "fixture";
  providerOrderId?: string; providerCreatedAt?: string; receivedAt?: string;
}
export interface AuditEvent {
  id: string; tenantId: string; locationId: string; orderId?: string;
  action: string; actor: string; createdAt: string; detail: string;
}
export interface Integration {
  provider: Provider; name: string; mode: "sandbox"; status: "FIXTURES_ONLY";
  description: string; liveEnabled: false;
}
export interface Session {
  userId: string; name: string; tenantId: string; locationId: string; role: Role;
}
export interface DashboardData {
  mode: "sandbox"; user: Session; activeLocationId: string;
  restaurants: Restaurant[]; locations: Location[]; orders: Order[];
  audit: AuditEvent[]; integrations: Integration[];
}
