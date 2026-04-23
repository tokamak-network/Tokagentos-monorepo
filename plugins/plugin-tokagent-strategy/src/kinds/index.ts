import { registerKind } from "../kind-registry.js";
import { yieldAutoCompoundKind } from "./yield-auto-compound.js";
import { polymarketValueHuntKind } from "./polymarket-value-hunt.js";
import { perpFundingArbKind } from "./perp-funding-arb.js";

export { yieldAutoCompoundKind } from "./yield-auto-compound.js";
export { polymarketValueHuntKind } from "./polymarket-value-hunt.js";
export { perpFundingArbKind } from "./perp-funding-arb.js";

/** Register all built-in strategy kind implementations. Call once at plugin init. */
export function registerBuiltinKinds(): void {
  registerKind(yieldAutoCompoundKind);
  registerKind(polymarketValueHuntKind);
  registerKind(perpFundingArbKind);
}
