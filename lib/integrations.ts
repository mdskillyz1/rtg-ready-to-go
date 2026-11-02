import { AppError } from "./errors";
export function parseProvider(value: string): "UBER_EATS" | "DELIVEROO" {
  if (["uber", "uber-eats", "uber_eats", "UBER_EATS"].includes(value)) return "UBER_EATS";
  if (["deliveroo", "DELIVEROO"].includes(value)) return "DELIVEROO";
  throw new AppError(404, "Unknown provider.");
}
