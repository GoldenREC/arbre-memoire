/** Fonctions pures de la galerie photo — extraites pour rester testables sans Supabase. */

export function yearOfPhoto(media) {
  return media?.taken_at ? Number(media.taken_at.slice(0, 4)) : null;
}

/** Une photo sans date connue n'est jamais exclue par le filtre (on préfère la montrer que la cacher à tort). */
export function filterPhotosByYearRange(photos, yearRange) {
  if (!yearRange) return photos;
  const [from, to] = yearRange;
  return photos.filter((p) => {
    const y = yearOfPhoto(p);
    return y == null || (y >= from && y <= to);
  });
}
