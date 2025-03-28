import { processConfigEntities } from './process-config-entities';

import type { HomeAssistant } from '@types';
import type { HassEntity } from 'home-assistant-js-websocket';
import type { PropertyValues } from 'lit';

type EntityCategory = 'config' | 'diagnostic';

export interface EntityRegistryDisplayEntry {
  entity_id: string;
  name?: string;
  icon?: string;
  device_id?: string;
  area_id?: string;
  labels: string[];
  hidden?: boolean;
  entity_category?: EntityCategory;
  translation_key?: string;
  platform?: string;
  display_precision?: number;
}

export function hasConfigChanged(element: any, changedProps: PropertyValues): boolean {
  if (changedProps.has('_config')) {
    return true;
  }

  if (!changedProps.has('hass')) {
    return false;
  }

  const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
  if (!oldHass) {
    return true;
  }

  if (
    oldHass.connected !== element.hass!.connected ||
    oldHass.themes !== element.hass!.themes ||
    oldHass.locale !== element.hass!.locale ||
    oldHass.localize !== element.hass.localize ||
    oldHass.formatEntityState !== element.hass.formatEntityState ||
    oldHass.formatEntityAttributeName !== element.hass.formatEntityAttributeName ||
    oldHass.formatEntityAttributeValue !== element.hass.formatEntityAttributeValue ||
    oldHass.config.state !== element.hass.config.state
  ) {
    return true;
  }
  return false;
}

function compareEntityState(oldHass: HomeAssistant, newHass: HomeAssistant, entityId: string) {
  const oldState = oldHass.states[entityId] as HassEntity | undefined;
  const newState = newHass.states[entityId] as HassEntity | undefined;

  return oldState !== newState;
}

function compareEntityDisplayEntry(oldHass: HomeAssistant, newHass: HomeAssistant, entityId: string) {
  const oldEntry = oldHass.entities[entityId] as EntityRegistryDisplayEntry | undefined;
  const newEntry = newHass.entities[entityId] as EntityRegistryDisplayEntry | undefined;

  return oldEntry?.display_precision !== newEntry?.display_precision;
}

// Check if config or Entity changed
export function hasConfigOrEntityChanged(element: any, changedProps: PropertyValues): boolean {
  if (hasConfigChanged(element, changedProps)) {
    return true;
  }

  if (!changedProps.has('hass')) {
    return false;
  }

  const oldHass = changedProps.get('hass') as HomeAssistant;
  const newHass = element.hass as HomeAssistant;

  return (
    compareEntityState(oldHass, newHass, element._config!.entity) ||
    compareEntityDisplayEntry(oldHass, newHass, element._config!.entity)
  );
}

// Check if config or Entities changed
export function hasConfigOrEntitiesChanged(element: any, changedProps: PropertyValues): boolean {
  if (hasConfigChanged(element, changedProps)) {
    return true;
  }

  if (!changedProps.has('hass')) {
    return false;
  }

  const oldHass = changedProps.get('hass') as HomeAssistant;
  const newHass = element.hass as HomeAssistant;

  const entities = processConfigEntities(element._config!.entities, false);

  return entities.some((entity) => {
    if (!('entity' in entity)) {
      return false;
    }

    return (
      compareEntityState(oldHass, newHass, entity.entity) || compareEntityDisplayEntry(oldHass, newHass, entity.entity)
    );
  });
}
