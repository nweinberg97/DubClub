// Creator photography from Unsplash (free under the Unsplash License: https://unsplash.com/license).
// Each id below was checked on its unsplash.com photo page (free licence, photographer, description).
// Images are hot-linked from images.unsplash.com as Unsplash's guidelines ask, and credited in the footer.

export interface Photo {
  id: string; // the part after "photo-" in an images.unsplash.com URL
  page: string; // unsplash.com photo page, for credit + re-checking
  by: string;
}

export const PHOTOS = {
  // Hero thumbnail: young man, surprised, looking into camera, blue background
  surprised: { id: '1758523672207-bc370d350fd9', page: 'https://unsplash.com/photos/zaLewfWbwd4', by: 'Vitaly Gariev' },
  // Vertical short: man in sunglasses pointing up, sunny mountain
  pointing: { id: '1777227686162-efbea0b4f2b9', page: 'https://unsplash.com/photos/2YVqCTe8v0Y', by: 'Sanket Mishra' },
  // Feed
  camera: { id: '1589337068036-86d6826cd3a9', page: 'https://unsplash.com/photos/fBwNDRgig_w', by: 'Samantha Borges' },
  editor: { id: '1490810194309-344b3661ba39', page: 'https://unsplash.com/photos/VW2oU66mwbc', by: 'Mark Cruz' },
  excited: { id: '1758273707009-01b0da709bd6', page: 'https://unsplash.com/photos/4UhyK0H9evA', by: 'Vitaly Gariev' },
  podcaster: { id: '1593697909683-bccb1b9e68a4', page: 'https://unsplash.com/photos/n30_i7mx62o', by: 'Soundtrap' },
  presenter: { id: '1587050007609-d9686b217bd6', page: 'https://unsplash.com/photos/FJK2EY52jTw', by: 'Kyle Loftus' },
  curly: { id: '1713256449316-1a4067517c3b', page: 'https://unsplash.com/photos/klKIQ9vu6mw', by: 'Look Studio' },
} satisfies Record<string, Photo>;

export function unsplash(p: Photo, w: number, h: number) {
  return `https://images.unsplash.com/photo-${p.id}?auto=format&fit=crop&crop=faces,center&w=${w}&h=${h}&q=75`;
}
