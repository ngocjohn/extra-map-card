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
}
