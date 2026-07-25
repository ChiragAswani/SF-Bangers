// Painted Ladies palette — warm cream "fog light" backdrop with the vivid,
// clashing-on-purpose trim colors you see on the Victorians on Steiner St.
export const colors = {
  bg: '#FBF1E2',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF7EA',
  ink: '#2B2333',
  muted: '#6E6275',
  muted2: '#9C90A2',
  border: 'rgba(43, 35, 51, 0.14)',
  borderStrong: 'rgba(43, 35, 51, 0.22)',
  danger: '#E8492B',

  // reserved specifically for literal Spotify branding — everything else
  // pulls from the house palette below
  spotify: '#1DB954',
  spotifyDark: '#0B3D1F',

  primary: '#FF6F59', // coral front door
  primaryInk: '#2B2333',
};

// The rotating "trim" palette — pick a color by index so neighboring cards
// never repeat, the way a row of painted ladies never quite matches.
export const house = [
  { bg: '#FF6F59', on: '#2B2333', name: 'coral' }, // coral
  { bg: '#1FB6A6', on: '#FFFFFF', name: 'teal' }, // teal
  { bg: '#FFC145', on: '#2B2333', name: 'mustard' }, // mustard
  { bg: '#7B6FD1', on: '#FFFFFF', name: 'violet' }, // violet
  { bg: '#FF7FA6', on: '#2B2333', name: 'rose' }, // rose
  { bg: '#6FB56A', on: '#FFFFFF', name: 'sage' }, // sage
];

export function houseColor(index = 0) {
  return house[((index % house.length) + house.length) % house.length];
}

// Deterministic color-per-name so the same artist always gets the same trim
// color across screens, without every caller having to thread an index.
export function houseColorForName(name) {
  const str = name || '?';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return houseColor(hash);
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  sm: 12,
  md: 18,
  lg: 24,
  pill: 999,
};

// Fredoka for anything shouty (headlines, buttons); Quicksand for anything
// you actually have to read — both rounded so they read as one family.
export const fonts = {
  displayBold: 'Fredoka_700Bold',
  displaySemibold: 'Fredoka_600SemiBold',
  bodyBold: 'Quicksand_700Bold',
  bodySemibold: 'Quicksand_600SemiBold',
  bodyMedium: 'Quicksand_500Medium',
};
