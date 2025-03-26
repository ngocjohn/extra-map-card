import { HomeAssistant, LovelaceCard, LovelaceGridOptions } from '@types';
import { LitElement, html, css, TemplateResult, nothing, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ExtraMapCardConfig } from 'types/config';
import { findEntities } from 'utilities/find-entities';
import parseAspectRatio from 'utilities/parse-aspect-ratio';

@customElement('extra-map-card')
export class ExtraMapCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public layout?: string;
  @state() private _config?: ExtraMapCardConfig;

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

    if (!config.entities?.length) {
      throw new Error('At least one entity is required');
    }

    if (config.entities && !Array.isArray(config.entities)) {
      throw new Error('Entities need to be an array');
    }

    this._config = { ...config };
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

    return html`
      <ha-card id="card" .header=${this._config.title}>
        <div id="root">Test card</div>
      </ha-card>
    `;
  }

  public connectedCallback() {
    super.connectedCallback();
    window.ExtraMapCard = this;
  }
  public disconnectedCallback() {
    super.disconnectedCallback();
  }

  protected updated(changedProps: PropertyValues): void {
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
