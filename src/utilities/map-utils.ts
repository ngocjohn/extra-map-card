import { HomeAssistant } from '@types';
import memoizeOne from 'memoize-one';
import { HaMapEntity } from 'types/config';
import { FrontendLocaleData, TimeFormat, TimeZone } from 'types/ha-frontend/data/frontend-local-data';

export interface Address {
  streetNumber: string;
  streetName: string;
  sublocality: string;
  city: string;
}

export const getEntityId = (entity: string | HaMapEntity): string =>
  typeof entity === 'string' ? entity : entity.entity_id;

export const getAddress = memoizeOne(async (lat: number, lng: number, apiKey: string): Promise<Address | null> => {
  const filterParams: Record<string, keyof Address> = {
    address: 'streetName', // Street name
    locality: 'sublocality', // Sublocality
    municipality: 'city', // City
  };
  const url = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch address from MapTiler');
    }

    const data = await response.json();
    if (data && data.features && data.features.length > 0) {
      let address: Partial<Address> = {};

      // Iterate through each feature
      data.features.forEach((feature: any) => {
        const placeType = feature.place_type[0]; // e.g. "address", "locality", "municipality"
        if (filterParams[placeType]) {
          const key = filterParams[placeType];
          const text = feature.text;

          // Check if the place type is an address and street number is available
          if (placeType === 'address') {
            address.streetNumber = feature.address ? `${feature.address}` : '';
          }
          // Assign filtered data to the corresponding property in the address object
          address[key] = `${text}`;
          // console.log(`Found ${key}:`, address[key], 'from', placeType);
        }
      });

      // Validate if the necessary parts of the address were found
      if (address.streetName && address.city) {
        return address as Address;
      }
    }

    return null;
  } catch (error) {
    console.warn('Error fetching address from MapTiler:', error);
    return null;
  }
});

const RESOLVED_TIME_ZONE = Intl.DateTimeFormat?.().resolvedOptions?.().timeZone;

// Browser time zone can be determined from Intl, with fallback to UTC for polyfill or no support.
export const LOCAL_TIME_ZONE = RESOLVED_TIME_ZONE ?? 'UTC';

// Pick time zone based on user profile option.  Core zone is used when local cannot be determined.
export const resolveTimeZone = (option: TimeZone, serverTimeZone: string) =>
  option === TimeZone.local && RESOLVED_TIME_ZONE ? LOCAL_TIME_ZONE : serverTimeZone;

export const useAmPm = memoizeOne((locale: FrontendLocaleData): boolean => {
  if (locale.time_format === TimeFormat.language || locale.time_format === TimeFormat.system) {
    const testLanguage = locale.time_format === TimeFormat.language ? locale.language : undefined;
    const test = new Date('January 1, 2023 22:00:00').toLocaleString(testLanguage);
    return test.includes('10');
  }

  return locale.time_format === TimeFormat.am_pm;
});

// Tuesday 7:00 PM || Tuesday 19:00
export const formatTimeWeekday = (dateObj: Date, locale: FrontendLocaleData, config: HomeAssistant['config']) =>
  formatTimeWeekdayMem(locale, config.time_zone).format(dateObj);

const formatTimeWeekdayMem = memoizeOne(
  (locale: FrontendLocaleData, serverTimeZone: string) =>
    new Intl.DateTimeFormat(locale.language, {
      weekday: 'long',
      hour: useAmPm(locale) ? 'numeric' : '2-digit',
      minute: '2-digit',
      hour12: useAmPm(locale),
      timeZone: resolveTimeZone(locale.time_zone, serverTimeZone),
    })
);
