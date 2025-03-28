import { LngLatLike } from '@maptiler/sdk';
import { HomeAssistant } from '@types';

import { LovelaceCardConfig } from './ha-frontend/lovelace/lovelace';

export interface EntityConfig {
  entity: string;
  type?: string;
  name?: string;
  icon?: string;
  image?: string;
}

export interface MapEntityConfig extends EntityConfig {
  label_mode?: 'state' | 'attribute' | 'name';
  attribute?: string;
  focus?: boolean;
}

export interface HaMapEntity {
  entity_id: string;
  color: string;
  label_mode?: 'name' | 'state' | 'attribute' | 'icon';
  attribute?: string;
  name?: string;
  focus?: boolean;
}

export interface HaMapPathPoint {
  point: LngLatLike;
  timestamp: Date;
}

export interface HaMapPaths {
  points: HaMapPathPoint[];
  color?: string;
  name?: string;
  gradualOpacity?: number;
  fullDatetime?: boolean;
}

export interface HaEntityMarker extends HTMLElement {
  hass?: HomeAssistant;
  entityId?: string;
  entityName?: string;
  entityPicture?: string;
  entityColor?: string;
  showIcon?: boolean;
}

export interface CustomStyles {
  light?: string;
  dark?: string;
}

export type ThemeMode = 'auto' | 'light' | 'dark';

export interface ExtraMapCardConfig extends LovelaceCardConfig {
  type: 'custom:extra-map-card';
  title?: string;
  api_key?: string;
  aspect_ratio?: string;
  entities?: (EntityConfig | string)[];
  auto_fit?: boolean;
  fit_zones?: boolean;
  default_zoom?: number;
  hours_to_show?: number;
  theme_mode?: ThemeMode;
  light_theme?: string;
  dark_theme?: string;
  show_all?: boolean;
  block_more_info?: boolean;
  custom_styles?: CustomStyles;
}
