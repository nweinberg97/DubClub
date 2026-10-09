// Creator photography from Unsplash (free under the Unsplash License: https://unsplash.com/license).
// Images are hot-linked from images.unsplash.com as Unsplash's guidelines ask, and credited in the footer.
// To swap a photo, change its id here. Use people only from photos you have the rights to use.

export interface Photo {
  id: string; // the part after "photo-" in an images.unsplash.com URL
  alt: string;
  by: string;
}

export const PHOTOS = {
  podcaster: { id: '1694881227503-ddc502d4b4cc', alt: 'A man in headphones talking into a microphone', by: 'Tim Mossholder' },
  selfie: { id: '1695408247109-3bf125ad0538', alt: 'A woman filming herself on her phone in a kitchen', by: 'Wesley Tingey' },
  vlogger: { id: '1630797160666-38e8c5ba44c1', alt: 'A man holding a camera outdoors', by: 'Andrés' },
  editor: { id: '1627244714766-94dab62ed964', alt: 'A person in headphones editing video in a dark room', by: 'Nubelson Fernandes' },
  hoodie: { id: '1692090383808-84faed4b35a5', alt: 'A man in an orange hoodie making a peace sign', by: 'Szabo Viktor' },
  voiceover: { id: '1526915303387-35900bc4ff33', alt: 'A man seated in front of a condenser microphone', by: 'Gianandrea Villa' },
  teacher: { id: '1673767298248-b128f17f89af', alt: 'A woman recording in front of a laptop', by: 'Videodeck .co' },
  glasses: { id: '1629204814140-42a737865119', alt: 'A man in glasses and a black shirt', by: 'Nubelson Fernandes' },
} satisfies Record<string, Photo>;

export function unsplash(p: Photo, w: number, h: number) {
  return `https://images.unsplash.com/photo-${p.id}?auto=format&fit=crop&crop=faces,center&w=${w}&h=${h}&q=72`;
}
