import * as maptilersdk from '@maptiler/sdk';
import { helpers } from '@maptiler/sdk';
import mapstyle from '@maptiler/sdk/dist/maptiler-sdk.css';
import * as turf from '@turf/turf';
import { HomeAssistant } from '@types';
import { computeStateDomain, formatDateTimeNumeric, formatTimeWithSeconds } from 'custom-card-helpers';
import { isToday } from 'date-fns';
import { GeoJsonProperties, Feature, Polygon, LineString, Point } from 'geojson';
import { LitElement, html, css, unsafeCSS, PropertyValues, CSSResultGroup } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { CustomStyles, HaEntityMarker, HaMapEntity, HaMapPathPoint, HaMapPaths, ThemeMode } from 'types/config';
import { computeStateName } from 'utilities/compute_state_name';
import { loadMapCard } from 'utilities/loader';
import { getAddress, getEntityId, formatTimeWeekday } from 'utilities/map-utils';

const MAPTILER_STYLE = {
  dark: maptilersdk.MapStyle.STREETS.DARK,
  light: maptilersdk.MapStyle.STREETS.LIGHT,
  demo: 'https://demotiles.maplibre.org/style.json',
};

const MAPTILER_THEME = {
  backgroundColor: {
    light: '#fff',
    dark: '#222222',
  },
  fill: {
    light: '#333',
    dark: '#c1c1c1',
  },
  boxShadow: {
    light: '0 0 0 2px rgba(0, 0, 0, 0.1)',
    dark: '0 0 0 2px rgba(255, 255, 255, 0.1)',
  },
  borderTop: {
    light: '1px solid #ddd',
    dark: '1px solid #424242',
  },
  themeBtn: {
    light: `mdi:weather-sunny`,
    dark: `mdi:weather-night`,
  },
};

@customElement('emc-map')
export class EmcMap extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entities?: string[] | HaMapEntity[];

  @property({ attribute: false }) public paths?: HaMapPaths[];

  @property({ attribute: 'auto-fit', type: Boolean }) public autoFit = false;

  @property({ attribute: 'fit-zones', type: Boolean }) public fitZones = false;

  @property({ type: Number }) public zoom = 14;

  @property({ attribute: 'theme-mode', type: String }) public themeMode: ThemeMode = 'auto';

  @property({ type: String }) private apiKey!: string;

  @property({ type: Boolean }) private blockMoreInfo = false;

  @property({ type: Object }) private customStyles: CustomStyles | undefined;

  private _map?: maptilersdk.Map;

  private _mapItems: maptilersdk.Marker[] = [];

  private _zoneItems: maptilersdk.Marker[] = [];

  private _mapFocusZones: Polygon[] = [];

  private _mapFocusItems: maptilersdk.Marker[] = [];

  private _mapPaths: maptilersdk.LayerSpecification[] = [];

  private _mapHelper = helpers;

  private _fitBounds: maptilersdk.LngLatBounds | undefined;

  @state() private _loaded = false;

  private get _darkMode() {
    return this.themeMode === 'dark' || (this.themeMode === 'auto' && Boolean(this.hass.themes.darkMode));
  }

  protected render() {
    return html`
      <div class="maptiler-map">
        <div id="map"></div>
      </div>
    `;
  }

  protected async firstUpdated(): Promise<void> {
    void (await loadMapCard(this.entities!));
    await new Promise((resolve) => setTimeout(resolve, 0));
    this._initMap();
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (!this._loaded) {
      return;
    }

    let autoFitRequired = false;
    const oldHass = changedProps.get('hass') as HomeAssistant | undefined;

    if (changedProps.has('_loaded') || changedProps.has('entities')) {
      this._drawEntities();
      autoFitRequired = true;
    } else if (this._loaded && oldHass && this.entities) {
      // Check if any state has changed
      for (const entity of this.entities) {
        if (oldHass.states[getEntityId(entity)] !== this.hass!.states[getEntityId(entity)]) {
          this._drawEntities();
          autoFitRequired = true;
          break;
        }
      }
    }

    // if (changedProps.has('_loaded') || changedProps.has('paths')) {
    //   this._drawPaths();
    // }

    if (changedProps.has('_loaded') || (this.autoFit && autoFitRequired)) {
      this._fitMap();
    }

    if (changedProps.has('zoom')) {
      this._map!.setZoom(this.zoom);
    }

    if (changedProps.has('hass') && oldHass) {
      const oldDarkMode = oldHass.themes?.darkMode;
      const newDarkMode = this.hass.themes?.darkMode;
      if (oldDarkMode !== newDarkMode) {
        console.log('theme mode', this.themeMode, 'dark mode', this._darkMode);
        const changedStyle = this._getInitStyle();
        this._map!.setStyle(changedStyle, { diff: false });
      }
    }

    if (
      !changedProps.has('themeMode') &&
      (!changedProps.has('hass') || (oldHass && oldHass.themes?.darkMode === this.hass.themes?.darkMode))
    ) {
      return;
    }
  }

  private _drawEntities(): void {
    const hass = this.hass;
    const map = this._map;

    if (!map || !hass) {
      return;
    }

    if (this._mapItems.length) {
      this._mapItems.forEach((item) => item.remove());
      this._mapItems = [];
      this._mapFocusItems = [];
    }

    if (this._zoneItems.length) {
      this._zoneItems.forEach((item) => item.remove());
      this._zoneItems = [];
      this._mapFocusZones = [];
    }

    if (!this.entities) {
      return;
    }

    // console.log('draw entities', this.entities);
    const circleSegments: Feature<Polygon, GeoJsonProperties>[] = [];

    const computedStyles = getComputedStyle(this);
    const zoneColor = computedStyles.getPropertyValue('--accent-color');
    const passiveZoneColor = computedStyles.getPropertyValue('--secondary-text-color');

    const darkPrimaryColor = computedStyles.getPropertyValue('--dark-primary-color');

    const className = this._darkMode ? 'dark' : 'light';

    for (const entity of this.entities as HaMapEntity[]) {
      const stateObj = hass.states[getEntityId(entity)];
      if (!stateObj) {
        continue;
      }

      const customTitle = typeof entity !== 'string' ? entity.name : undefined;
      const title = customTitle ?? computeStateName(stateObj);

      const {
        latitude,
        longitude,
        passive,
        icon,
        radius,
        entity_picture: entityPicture,
        gps_accuracy: gpsAccuracy,
      } = stateObj.attributes;

      if (!(latitude && longitude)) {
        continue;
      }

      const position = [longitude, latitude] as [number, number];
      // Draw marker for zone and circle around
      if (computeStateDomain(stateObj) === 'zone') {
        // Draw zone marker
        let iconHTML = '';
        if (icon) {
          const el = document.createElement('ha-icon');
          el.setAttribute('icon', icon);
          iconHTML = el.outerHTML;
        } else {
          const el = document.createElement('span');
          el.innerHTML = title;
          iconHTML = el.outerHTML;
        }

        // Draw circle around entity
        const circle = turf.circle(position, radius, {
          steps: 200,
          units: 'meters',
          properties: {
            color: passive ? passiveZoneColor : zoneColor,
            title,
            opacity: passive ? 0.2 : 0.3,
          },
        }) as Feature<Polygon, GeoJsonProperties>;
        circleSegments.push(circle);

        const zoneMarkerEl = document.createElement('div');
        zoneMarkerEl.className = `marker ${className}`;
        zoneMarkerEl.innerHTML = iconHTML;
        zoneMarkerEl.title = title;

        const marker = new maptilersdk.Marker({
          element: zoneMarkerEl,
        })
          .setLngLat(position)
          .addTo(map);

        this._zoneItems.push(marker);
        if (this.fitZones && (typeof entity === 'string' || entity.focus !== false)) {
          this._mapFocusZones.push(circle.geometry);
        }
        continue;
      }

      // DRAW ENTITY MARKER AND CIRCLE

      // create icon
      const entityName =
        typeof entity !== 'string' && entity.label_mode === 'state'
          ? this.hass.formatEntityState(stateObj)
          : typeof entity !== 'string' && entity.label_mode === 'attribute' && entity.attribute !== undefined
          ? this.hass.formatEntityAttributeValue(stateObj, entity.attribute)
          : customTitle ??
            title
              .split(' ')
              .map((part) => part[0])
              .join('')
              .substring(0, 3);
      const entityMarker = document.createElement('ha-entity-marker') as HaEntityMarker;
      entityMarker.hass = this.hass;
      entityMarker.showIcon = typeof entity !== 'string' && entity.label_mode === 'icon';
      entityMarker.entityId = getEntityId(entity);
      entityMarker.entityName = entityName;
      entityMarker.entityPicture =
        entityPicture && (typeof entity === 'string' || !entity.label_mode) ? this.hass.hassUrl(entityPicture) : '';
      if (typeof entity !== 'string') {
        entityMarker.entityColor = entity.color;
      }

      // Stop propagation of click event to prevent opening entity popup
      if (this.blockMoreInfo) {
        entityMarker.addEventListener(
          'click',
          (ev) => {
            ev.stopImmediatePropagation();
            ev.preventDefault();
            console.log('click', entityMarker.entityId);
          },
          true
        );
      }
      const marker = new maptilersdk.Marker({
        element: entityMarker,
      })
        .setLngLat(position)
        .addTo(map);

      this._mapItems.push(marker);

      if (typeof entity === 'string' || entity.focus !== false) {
        this._mapFocusItems.push(marker);
      }

      if (gpsAccuracy) {
        const entityCircle = turf.circle(position, gpsAccuracy, {
          steps: 64,
          units: 'meters',
          properties: {
            color: darkPrimaryColor,
            title,
            opacity: 0.5,
          },
        }) as Feature<Polygon, GeoJsonProperties>;
        circleSegments.push(entityCircle);
      }
    }

    const circleSource: maptilersdk.GeoJSONSourceSpecification = {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: circleSegments,
      },
    };

    // remove souces if they exist
    if (map.getSource('circles')) {
      map.removeSource('circles');
      map.removeLayer('circles');
      map.removeLayer('circles-stroke');
    }
    // add sources
    // console.log('add sources', circleSource);
    map.addSource('circles', circleSource);
    map.addLayer({
      id: 'circles',
      type: 'fill',
      source: 'circles',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['get', 'opacity'],
      },
    } as maptilersdk.FillLayerSpecification);

    map.addLayer({
      id: 'circles-stroke',
      type: 'line',
      source: 'circles',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2,
      },
    } as maptilersdk.LineLayerSpecification);
  }

  private _computePathTooltip(path: HaMapPaths, point: HaMapPathPoint): string {
    let formattedTime: string;
    if (path.fullDatetime) {
      formattedTime = formatDateTimeNumeric(point.timestamp, this.hass.locale);
    } else if (isToday(point.timestamp)) {
      formattedTime = formatTimeWithSeconds(point.timestamp, this.hass.locale);
    } else {
      formattedTime = formatTimeWeekday(point.timestamp, this.hass.locale, this.hass.config);
    }
    return `<b>${path.name}</b><br><i>${formattedTime}</i>`;
  }

  private _drawPaths(): void {
    const hass = this.hass;
    const map = this._map;
    if (!map || !hass) {
      return;
    }

    if (this._mapPaths.length) {
      this._mapPaths.forEach((item) => {
        map.removeLayer(item.id);
        // map.removeSource(item.id);
      });
      this._mapPaths = [];
    }

    if (!this.paths) {
      return;
    }

    // console.log('draw paths', this.paths);
    const darkPrimaryColor = getComputedStyle(this).getPropertyValue('--dark-primary-color');

    const lineSegments: Feature<LineString, GeoJsonProperties>[] = [];
    const pointsSegments: Feature<Point, GeoJsonProperties>[] = [];

    this.paths.forEach((path) => {
      if (!path.points || path.points.length < 2) {
        return;
      }
      let opacityStep: number;
      let baseOpacity: number;
      if (path.gradualOpacity) {
        opacityStep = path.gradualOpacity / (path.points.length - 2);
        baseOpacity = 1 - path.gradualOpacity;
      }

      for (let pointIndex = 0; pointIndex < path.points.length - 1; pointIndex++) {
        const start = path.points[pointIndex].point as maptilersdk.LngLatLike;
        const end = path.points[pointIndex + 1].point;

        const opacity = path.gradualOpacity ? baseOpacity! + pointIndex * opacityStep! : undefined;
        const popupContent = this._computePathTooltip(path, path.points[pointIndex]);
        const point = {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: start,
          },
          properties: {
            friendlyName: path.name,
            color: path.color || darkPrimaryColor,
            opacity,
            fillOpacity: opacity,
            lastUpdated: path.points[pointIndex].timestamp,
            popupContent,
          },
        } as Feature<Point, GeoJsonProperties>;
        pointsSegments.push(point);

        const line = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [start, end],
          },
          properties: {
            color: path.color || darkPrimaryColor,
            opacity,
            fillOpacity: opacity,
          },
        } as Feature<LineString, GeoJsonProperties>;
        lineSegments.push(line);
      }
    });

    const pointsSource: maptilersdk.GeoJSONSourceSpecification = {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: pointsSegments,
      },
    };

    const lineSource: maptilersdk.GeoJSONSourceSpecification = {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: lineSegments,
      },
    };

    // remove souces if they exist
    if (map.getSource('points')) {
      map.removeSource('points');
    }
    if (map.getSource('lines')) {
      map.removeSource('lines');
    }
    // add sources
    // console.log('add sources', pointsSource, lineSource);
    map.addSource('points', pointsSource);
    map.addSource('lines', lineSource);

    const lineLayer = {
      id: 'lines',
      type: 'line',
      source: 'lines',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2,
        'line-opacity': ['get', 'opacity'],
      },
    } as maptilersdk.LineLayerSpecification;

    const pointLayer = {
      id: 'points',
      type: 'circle',
      source: 'points',
      paint: {
        'circle-radius': 5,
        'circle-color': ['get', 'color'],
        'circle-opacity': ['get', 'fillOpacity'],
        'circle-stroke-width': 1,
        'circle-stroke-color': ['get', 'color'],
      },
    } as maptilersdk.CircleLayerSpecification;
    // Add layers to maps

    map.addLayer(lineLayer);
    map.addLayer(pointLayer);
    this._mapPaths.push(lineLayer, pointLayer);

    this._setupPointInteraction();
  }

  private _setupPointInteraction(): void {
    const map = this._map;
    if (!map) return;

    const pointPopup = new maptilersdk.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 8,
    });

    let currentPoint: string | undefined;

    map.on('mousemove', 'points', async (e: any) => {
      const minZoom = 10;
      if (map.getZoom() < minZoom) {
        map.getCanvas().style.cursor = '';
        pointPopup.remove();
        currentPoint = undefined;
        return;
      }
      const feature = e.features?.[0];
      if (!feature) return;

      const featureCoordinates = feature.geometry.coordinates.toString();
      if (currentPoint !== featureCoordinates) {
        currentPoint = featureCoordinates;
        map.getCanvas().style.cursor = 'pointer';

        const coordinates = e.features[0].geometry.coordinates.slice();

        const { popupContent } = feature.properties;

        // Adjust longitude for world wrap
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
          coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        pointPopup.setLngLat(coordinates).setHTML(popupContent).addTo(map);

        const address = await getAddress(coordinates[1], coordinates[0], this.apiKey);
        if (address) {
          const updatedContent = `${popupContent}<br>${address.streetName}`;
          if (pointPopup.isOpen()) {
            pointPopup.setHTML(updatedContent);
          }
        }
      }
    });

    map.on('mouseleave', 'points', () => {
      map.getCanvas().style.cursor = '';
      pointPopup.remove();
      currentPoint = undefined;
    });
  }

  public _fitMap(options?: { zoom?: number; pad?: number }): void {
    const map = this._map;
    if (!map) return;

    if (!this._mapFocusItems.length && !this._mapFocusZones.length) {
      console.log('no items to focus');
      this._map!.setCenter([this.hass.config.longitude, this.hass.config.latitude]);
      // this._map!.setZoom(options?.zoom ?? this.zoom);
      return;
    }

    let bounds = new maptilersdk.LngLatBounds();
    this._mapFocusItems?.forEach((item) => {
      bounds.extend(item.getLngLat());
    });

    this._mapFocusZones?.forEach((zone) => {
      const coordinates = zone.coordinates[0];
      coordinates.forEach((coordinate) => {
        bounds.extend([coordinate[0], coordinate[1]]);
      });
    });

    if (!bounds.isEmpty()) {
      // console.log('fit bounds', bounds);
      this._fitBounds = bounds;
      map.fitBounds(bounds, {
        padding: options?.pad ?? 50,
        maxZoom: options?.zoom ?? this.zoom,
        linear: true,
        animate: false,
      });
    }
  }

  private _initMap(): void {
    const { zoom, apiKey } = this;
    const cfgLngLat = [this.hass.config.longitude, this.hass.config.latitude] as maptilersdk.LngLatLike;

    const initStyle = this._getInitStyle();

    const mapEl = this.shadowRoot!.getElementById('map') as HTMLElement;

    maptilersdk.config.apiKey = apiKey;

    const mapOptions: maptilersdk.MapOptions = {
      geolocateControl: false,
      fullscreenControl: false,
      navigationControl: false,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: { antialias: true },
      maxZoom: 20,
      container: mapEl,
      zoom: zoom,
      style: initStyle,
      center: cfgLngLat,
    };

    console.log('map options', mapOptions);
    this._map = new maptilersdk.Map(mapOptions);

    this._map.on('load', async () => {
      this._loaded = true;
    });

    this._map.on('style.load', async () => {
      this._changeControlTheme();
      this._drawPaths();
    });

    const navControl = new maptilersdk.NavigationControl({ visualizePitch: true, visualizeRoll: true });
    this._map.addControl(navControl, 'top-right');
    this._map.on('styleimagemissing', (e) => {
      this._map?.addImage(e.id, {
        width: 0,
        height: 0,
        data: new Uint8Array(0),
      });
    });
  }

  private getModeColor = (key: string): string => {
    return this._darkMode ? MAPTILER_THEME[key].dark : MAPTILER_THEME[key].light;
  };

  private _getInitStyle(): maptilersdk.MapStyleVariant {
    const { light: light_style, dark: dark_style } = this.customStyles || {};
    const isDarkMode = this._darkMode;
    const selectedStyle = (select: string) => {
      const style = select.split('.');
      const mapTilerStyle =
        style.length === 2 ? maptilersdk.MapStyle[style[0]][style[1]] : maptilersdk.MapStyle[style[0]];
      return mapTilerStyle;
    };

    const stylePicked = isDarkMode
      ? dark_style
        ? selectedStyle(dark_style)
        : MAPTILER_STYLE.dark
      : light_style
      ? selectedStyle(light_style)
      : MAPTILER_STYLE.light;
    return stylePicked;
  }

  private _changeControlTheme() {
    const setTheme = (key: string) => this.getModeColor(key);
    const elements = Array.from(this.shadowRoot!.querySelectorAll('.maplibregl-ctrl'));

    for (const element of elements) {
      const buttons = Array.from(element.querySelectorAll('button'));
      for (const button of buttons) {
        const buttonEl = button as HTMLButtonElement;
        buttonEl.style.backgroundColor = setTheme('backgroundColor') as string;
        buttonEl.style.boxShadow = setTheme('boxShadow') as string;
        const spanEl = button.querySelector('span') as HTMLSpanElement;
        if (spanEl) {
          const computedStyle = window.getComputedStyle(spanEl);
          const backgroundImage = computedStyle.backgroundImage;
          if (backgroundImage.startsWith('url("data:image/svg+xml')) {
            const fillColor = this.getModeColor('fill') as string;
            const svgUri = backgroundImage.slice(5, -2);
            const decodedSvg = decodeURIComponent(svgUri.split(',')[1]);

            const updatedSvg = decodedSvg
              .replace(/fill:[^;"]*/g, `fill:${fillColor}`)
              .replace(/fill="[^"]*"/g, `fill="${fillColor}"`);

            const encodedSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(updatedSvg)}`;
            spanEl.style.backgroundImage = `url("${encodedSvg}")`;
          }
        }
      }
    }
  }

  static get styles(): CSSResultGroup {
    return [
      unsafeCSS(mapstyle),
      css`
        :host {
          --tooltip-color: rgba(80, 80, 80, 0.9);
        }
        .maptiler-map {
          height: 100%;
          width: 100%;
        }

        #map {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 100%;
        }

        .maplibregl-popup-content {
          padding: 8px;
          background: var(--tooltip-color) !important;
          color: white !important;
          border-radius: 4px;
          box-shadow: none !important;
          text-align: center;
          letter-spacing: 1px;
        }

        .maplibregl-popup-anchor-top .maplibregl-popup-tip,
        .maplibregl-popup-anchor-top-left .maplibregl-popup-tip,
        .maplibregl-popup-anchor-top-right .maplibregl-popup-tip {
          border-bottom-color: var(--tooltip-color) !important;
        }
        .maplibregl-popup-anchor-bottom .maplibregl-popup-tip,
        .maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip,
        .maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip {
          border-top-color: var(--tooltip-color) !important;
        }
        .maplibregl-popup-anchor-left .maplibregl-popup-tip {
          border-right-color: var(--tooltip-color) !important;
        }
        .maplibregl-popup-anchor-right .maplibregl-popup-tip {
          border-left-color: var(--tooltip-color) !important;
        }

        .maplibregl-ctrl-bottom-right > details,
        .maplibregl-ctrl-bottom-left > .maplibregl-ctrl:not(.maplibregl-map) {
          display: none !important;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'emc-map': EmcMap;
  }
}
