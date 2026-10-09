import type { AccentOption } from './types.ts';

/**
 * Display metadata for accents an engine *might* support.
 * Engines decide which of these they expose — this list is not a capability claim.
 */
export const ACCENT_CATALOG: Record<string, Omit<AccentOption, 'id'>> = {
  'en-GB': { label: 'British', place: 'London, UK', stampCode: 'GB' },
  'en-AU': { label: 'Australian', place: 'Sydney, AU', stampCode: 'AU' },
  'en-US': { label: 'General American', place: 'Ohio, US', stampCode: 'US' },
  'en-IE': { label: 'Irish', place: 'Dublin, IE', stampCode: 'IE' },
  'en-SCT': { label: 'Scottish', place: 'Glasgow, SCT', stampCode: 'SC' },
  'en-NZ': { label: 'New Zealand', place: 'Wellington, NZ', stampCode: 'NZ' },
  'en-ZA': { label: 'South African', place: 'Cape Town, ZA', stampCode: 'ZA' },
  'en-IN': { label: 'Indian English', place: 'Mumbai, IN', stampCode: 'IN' },
  'en-CA': { label: 'Canadian', place: 'Vancouver, CA', stampCode: 'CA' },
};

export function accentOption(id: string, extra?: Partial<AccentOption>): AccentOption {
  const meta = ACCENT_CATALOG[id] ?? { label: id, place: id, stampCode: id.slice(-2).toUpperCase() };
  return { id, ...meta, ...extra };
}
