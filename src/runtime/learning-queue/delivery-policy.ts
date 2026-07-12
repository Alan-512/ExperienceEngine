import type {
  DeliveryState,
  ExperienceNode
} from "../../types/domain.js";
import {
  applyCustomShadowOnlyDeliveryCap
} from "../configuration/product-boundaries.js";

export const DEFAULT_NODE_DELIVERY_STATE_BY_LIFECYCLE: Record<
  ExperienceNode["state"],
  NonNullable<ExperienceNode["delivery_state"]>
> = {
  candidate: "shadow_only",
  priority_candidate: "conservative_only",
  active: "eligible",
  cooling: "conservative_only",
  retired: "quarantined"
};

export const resolveEffectiveNodeDeliveryState = (
  node: Pick<
    ExperienceNode,
    | "state"
    | "delivery_state"
    | "contains_unbenchmarked_origin"
    | "contains_revoked_profile_origin"
  >
): DeliveryState => applyCustomShadowOnlyDeliveryCap({
  containsUnbenchmarkedOrigin: Boolean(node.contains_unbenchmarked_origin),
  containsRevokedProfileOrigin: Boolean(node.contains_revoked_profile_origin),
  requestedDeliveryState:
    node.delivery_state ?? DEFAULT_NODE_DELIVERY_STATE_BY_LIFECYCLE[node.state]
}).delivery_state;

export const isNodeLiveDeliveryAllowed = (
  node: Parameters<typeof resolveEffectiveNodeDeliveryState>[0]
): boolean => {
  const deliveryState = resolveEffectiveNodeDeliveryState(node);
  return deliveryState === "eligible" || deliveryState === "conservative_only";
};

export const isCustomOriginRecordOnlyNode = (
  node: Pick<ExperienceNode, "contains_unbenchmarked_origin">
): boolean => Boolean(node.contains_unbenchmarked_origin);

