import { HaMapEntity } from 'types/config';

const HELPERS = (window as any).loadCardHelpers ? (window as any).loadCardHelpers() : undefined;

// Hack to load ha-components needed for editor
export const loadHaComponents = () => {
  if (!customElements.get('ha-entity-marker')) {
    // Load the component by invoking a related component's method
    (customElements.get('hui-map-card') as any)?.getConfigElement();
  }
  if (!customElements.get('ha-form')) {
    (customElements.get('hui-button-card') as any)?.getConfigElement();
  }
  if (!customElements.get('ha-entity-picker')) {
    (customElements.get('hui-entities-card') as any)?.getConfigElement();
  }
  if (!customElements.get('ha-card-conditions-editor')) {
    (customElements.get('hui-conditional-card') as any)?.getConfigElement();
  }
  if (!customElements.get('ha-form-multi_select')) {
    // Load the component by invoking a related component's method
    (customElements.get('hui-entities-card') as any)?.getConfigElement();
  }
};

export const loadMapCard = async (entities: string[] | HaMapEntity[]): Promise<void> => {
  if (!customElements.get('ha-entity-marker')) {
    console.log('Loading ha-entity-marker');
    const mapConfig = { type: 'map', entities: entities, theme_mode: 'auto' };

    let helpers;
    if ((window as any).loadCardHelpers) {
      helpers = await (window as any).loadCardHelpers();
    } else if (HELPERS) {
      helpers = HELPERS;
    }

    // Check if helpers were loaded and if createCardElement exists
    if (!helpers || !helpers.createCardElement) {
      console.error('Card helpers or createCardElement not available.');
      return;
    }

    const card = await helpers.createCardElement(mapConfig);
    if (!card) {
      console.error('Failed to create card element.');
      return;
    }
  }
};
