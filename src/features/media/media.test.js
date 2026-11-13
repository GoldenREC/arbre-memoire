import { describe, it, expect } from 'vitest';
import { yearOfPhoto, filterPhotosByYearRange } from './photoUtils.js';

describe('yearOfPhoto', () => {
  it('extrait l\'année d\'une date ISO', () => {
    expect(yearOfPhoto({ taken_at: '1987-06-12' })).toBe(1987);
  });
  it('retourne null sans date', () => {
    expect(yearOfPhoto({ taken_at: null })).toBeNull();
    expect(yearOfPhoto({})).toBeNull();
  });
});

describe('filterPhotosByYearRange', () => {
  const photos = [
    { id: 'a', taken_at: '1950-01-01' },
    { id: 'b', taken_at: '1990-01-01' },
    { id: 'c', taken_at: null }, // non datée
  ];

  it('sans plage, retourne tout', () => {
    expect(filterPhotosByYearRange(photos, null)).toHaveLength(3);
  });

  it('filtre par plage, mais garde toujours les photos non datées', () => {
    const result = filterPhotosByYearRange(photos, [1980, 2000]);
    expect(result.map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('exclut une photo datée hors plage', () => {
    const result = filterPhotosByYearRange(photos, [1960, 1970]);
    expect(result.map((p) => p.id)).toEqual(['c']);
  });
});
