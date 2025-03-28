import { LngLatLike } from '@maptiler/sdk';
import {
  HistoryStates,
  HomeAssistant,
  isComponentLoaded,
  LovelaceCard,
  LovelaceGridOptions,
  subscribeHistoryStatesTimeWindow,
} from '@types';
import { computeDomain, computeStateDomain } from 'custom-card-helpers';
import { LitElement, html, css, TemplateResult, nothing, PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import memoizeOne from 'memoize-one';
import { ExtraMapCardConfig, HaMapEntity, HaMapPathPoint, HaMapPaths, MapEntityConfig } from 'types/config';
import { getColorByIndex } from 'utilities/colors';
import { computeStateName } from 'utilities/compute_state_name';
import { findEntities } from 'utilities/find-entities';
import { hasConfigChanged, hasConfigOrEntitiesChanged } from 'utilities/has-changed';
import parseAspectRatio from 'utilities/parse-aspect-ratio';
import { processConfigEntities } from 'utilities/process-config-entities';

import './components/emc-map';
import { EmcMap } from './components/emc-map';

export const DEFAULT_HOURS_TO_SHOW = 0;
export const DEFAULT_ZOOM = 14;

@customElement('extra-map-card')
export class ExtraMapCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: ExtraMapCardConfig;

  private _configEntities?: MapEntityConfig[];
  @state() private _mapEntities: HaMapEntity[] = [];

  private _colorDict: Record<string, string> = {};
  private _colorIndex = 0;

  @state() private _error?: { code: string; message: string };

  private _subscribed?: Promise<(() => Promise<void>) | undefined>;
  @state() private _stateHistory?: HistoryStates;

  @query('emc-map') private _mapTiler?: EmcMap;

  private _getAllEntities(): string[] {
    const hass = this.hass!;
    const personSources = new Set<string>();
    const locationEntities: string[] = [];
    Object.values(hass.states).forEach((entity) => {
      if (!('latitude' in entity.attributes) || !('longitude' in entity.attributes)) {
        return;
      }
      locationEntities.push(entity.entity_id);
      if (computeStateDomain(entity) === 'person' && entity.attributes.source) {
        personSources.add(entity.attributes.source);
      }
    });

    return locationEntities.filter((entity) => !personSources.has(entity));
  }

  public static getStubConfig(hass: HomeAssistant, entities: string[], entitiesFallback: string[]): ExtraMapCardConfig {
    const includeDomains = ['device_tracker'];
    const maxEntities = 2;
    const foundEntities = findEntities(hass, maxEntities, entities, entitiesFallback, includeDomains);

    return { type: 'custom:extra-map-card', entities: foundEntities, theme_mode: 'auto' };
  }

  public setConfig(config: ExtraMapCardConfig): void {
    if (!config) {
      throw new Error('Invalid configuration');
    }

    if (!config.show_all && !config.entities?.length) {
      throw new Error('Either entities or show_all is required');
    }

    if (config.entities && !Array.isArray(config.entities)) {
      throw new Error('Entities need to be an array');
    }

    if (!config.api_key) {
      this._error = { code: 'no_api_key', message: 'API key is required' };
    }
    if (config.show_all && config.entities) {
      throw new Error('Cannot specify show_all and entities at the same time');
    }

    this._config = { ...config };

    if (this.hass && config.show_all) {
      this._config.entities = this._getAllEntities();
    }

    this._configEntities = this._config.entities ? processConfigEntities<MapEntityConfig>(this._config.entities) : [];

    this._mapEntities = this._getMapEntities();
  }

  public getCardSize(): number {
    if (!this._config?.aspect_ratio) {
      return 7;
    }
    const ratio = parseAspectRatio(this._config.aspect_ratio);
    const ar = ratio && ratio.w > 0 && ratio.h > 0 ? `${((100 * ratio.h) / ratio.w).toFixed(2)}` : '100';

    return 1 + Math.floor(Number(ar) / 25) || 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: 'full',
      rows: 4,
      min_columns: 6,
      min_rows: 2,
    };
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) {
      return nothing;
    }
    if (this._error) {
      return html`<ha-alert alert-type="error">
        ${this.hass.localize('ui.components.map.error')}: ${this._error.message} (${this._error.code})
      </ha-alert>`;
    }

    // const isDarkMode =
    //   this._config.dark_mode || this._config.theme_mode === 'dark'
    //     ? true
    //     : this._config.theme_mode === 'light'
    //     ? false
    //     : this.hass.themes.darkMode;

    const themeMode = this._config.theme_mode || (this._config.dark_mode ? 'dark' : 'auto');
    const customStyles = this._config.custom_styles || {};

    return html`
      <ha-card id="card" .header=${this._config.title}>
        <div id="root">
          <emc-map
            .hass=${this.hass}
            .entities=${this._mapEntities}
            .paths=${this._getHistoryPaths(this._config, this._stateHistory)}
            .autoFit=${this._config.auto_fit}
            .fitZones=${this._config.fit_zones}
            .zoom=${this._config.default_zoom ?? DEFAULT_ZOOM}
            .themeMode=${themeMode}
            .apiKey=${this._config.api_key}
            .blockMoreInfo=${this._config.block_more_info ?? false}
            .customStyles=${customStyles}
          ></emc-map>
        </div>
      </ha-card>
    `;
  }

  protected shouldUpdate(changedProps: PropertyValues) {
    if (!changedProps.has('hass') || changedProps.size > 1) {
      return true;
    }

    const oldHass = changedProps.get('hass') as HomeAssistant | undefined;

    if (!oldHass || !this._configEntities) {
      return true;
    }

    if (oldHass.themes.darkMode !== this.hass.themes.darkMode) {
      return true;
    }

    if (changedProps.has('_stateHistory')) {
      return true;
    }

    return this._config?.entities
      ? hasConfigOrEntitiesChanged(this, changedProps)
      : hasConfigChanged(this, changedProps);
  }

  protected willUpdate(changedProps: PropertyValues): void {
    super.willUpdate(changedProps);
    if (this._config?.show_all && !this._config?.entities && this.hass && changedProps.has('hass')) {
      this._config.entities = this._getAllEntities();
      this._configEntities = processConfigEntities<MapEntityConfig>(this._config.entities);
      this._mapEntities = this._getMapEntities();
    }
  }

  public connectedCallback() {
    super.connectedCallback();
    window.ExtraMapCard = this;
    if (this.hasUpdated && this._configEntities?.length) {
      this._subscribeHistory();
    }
  }
  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeHistory();
  }

  private _subscribeHistory() {
    if (
      !isComponentLoaded(this.hass!, 'history') ||
      this._subscribed ||
      !(this._config?.hours_to_show ?? DEFAULT_HOURS_TO_SHOW)
    ) {
      return;
    }
    this._subscribed = subscribeHistoryStatesTimeWindow(
      this.hass!,
      (combinedHistory) => {
        if (!this._subscribed) {
          // Message came in before we had a chance to unload
          return;
        }
        this._stateHistory = combinedHistory;
      },
      this._config!.hours_to_show ?? DEFAULT_HOURS_TO_SHOW,
      (this._configEntities || []).map((entity) => entity.entity)!,
      false,
      false,
      false
    ).catch((err) => {
      this._subscribed = undefined;
      this._error = err;
      return undefined;
    });
  }

  private _unsubscribeHistory() {
    if (this._subscribed) {
      this._subscribed.then((unsub) => unsub?.());
      this._subscribed = undefined;
    }
  }

  protected updated(changedProps: PropertyValues): void {
    if (this._configEntities?.length) {
      if (!this._subscribed || changedProps.has('_config')) {
        this._unsubscribeHistory();
        this._subscribeHistory();
      }
    } else {
      this._unsubscribeHistory();
    }
    if (changedProps.has('_config')) {
      this._computePadding();
    }
  }

  private _computePadding(): void {
    const root = this.shadowRoot!.getElementById('root');

    const ignoreAspectRatio = this.layout === 'panel' || this.layout === 'grid';
    if (!this._config || ignoreAspectRatio || !root) {
      return;
    }

    if (!this._config.aspect_ratio) {
      root.style.paddingBottom = '100%';
      return;
    }

    root.style.height = 'auto';

    const ratio = parseAspectRatio(this._config.aspect_ratio);

    root.style.paddingBottom =
      ratio && ratio.w > 0 && ratio.h > 0
        ? `${((100 * ratio.h) / ratio.w).toFixed(2)}%`
        : (root.style.paddingBottom = '100%');
  }

  private _getColor(entityId: string): string {
    let color = this._colorDict[entityId];
    if (color) {
      return color;
    }
    color = getColorByIndex(this._colorIndex);
    this._colorIndex++;
    this._colorDict[entityId] = color;
    return color;
  }

  private _getMapEntities(): HaMapEntity[] {
    return [
      ...(this._configEntities || []).map((entityConf) => ({
        entity_id: entityConf.entity,
        color: this._getColor(entityConf.entity),
        label_mode: entityConf.label_mode,
        attribute: entityConf.attribute,
        focus: entityConf.focus,
        name: entityConf.name,
      })),
    ];
  }

  private _getHistoryPaths = memoizeOne(
    (config: ExtraMapCardConfig, history?: HistoryStates): HaMapPaths[] | undefined => {
      if (!history || !(config.hours_to_show ?? DEFAULT_HOURS_TO_SHOW)) {
        return undefined;
      }

      const paths: HaMapPaths[] = [];

      for (const entityId of Object.keys(history)) {
        if (computeDomain(entityId) === 'zone') {
          continue;
        }
        const entityStates = history[entityId];
        if (!entityStates?.length) {
          continue;
        }
        // filter location data from states and remove all invalid locations
        const points: HaMapPathPoint[] = [];
        for (const entityState of entityStates) {
          const latitude = entityState.a.latitude;
          const longitude = entityState.a.longitude;
          if (!latitude || !longitude) {
            continue;
          }
          const p = {} as HaMapPathPoint;
          p.point = [longitude, latitude] as LngLatLike;
          p.timestamp = new Date(entityState.lu * 1000);
          points.push(p);
        }

        const entityConfig = this._configEntities?.find((e) => e.entity === entityId);
        const name =
          entityConfig?.name ??
          (entityId in this.hass.states ? computeStateName(this.hass.states[entityId]) : entityId);

        paths.push({
          points,
          name,
          fullDatetime: (config.hours_to_show ?? DEFAULT_HOURS_TO_SHOW) >= 144,
          color: this._getColor(entityId),
          gradualOpacity: 0.8,
        });
      }
      return paths;
    }
  );

  static styles = css`
    ha-card {
      overflow: hidden;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    #root {
      position: relative;
      height: 100%;
    }
  `;
}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  description: 'Extra Map Card using MapTiler',
  name: 'Extra Map Card',
  preview: false,
  type: 'extra-map-card',
});

declare global {
  interface HTMLElementTagNameMap {
    'extra-map-card': ExtraMapCard;
  }
  interface Window {
    ExtraMapCard: ExtraMapCard;
  }
}
