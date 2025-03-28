import type { HassEntity } from 'home-assistant-js-websocket';

/** Compute the object ID of a state. */
export const computeObjectId = (entityId: string): string => entityId.substr(entityId.indexOf('.') + 1);

export const computeStateNameFromEntityAttributes = (entityId: string, attributes: Record<string, any>): string =>
  attributes.friendly_name === undefined
    ? computeObjectId(entityId).replace(/_/g, ' ')
    : (attributes.friendly_name ?? '').toString();

export const computeStateName = (stateObj: HassEntity): string =>
  computeStateNameFromEntityAttributes(stateObj.entity_id, stateObj.attributes);
