const ALL_EIGHT = [
  { swap: false, flipX: false, flipY: false, name: '' },
  { swap: false, flipX: true, flipY: false, name: 'mirrored left to right' },
  { swap: false, flipX: false, flipY: true, name: 'flipped upside down' },
  { swap: false, flipX: true, flipY: true, name: 'turned 180°' },
  { swap: true, flipX: false, flipY: false, name: 'mirrored along a diagonal' },
  { swap: true, flipX: true, flipY: false, name: 'turned 90°' },
  { swap: true, flipX: false, flipY: true, name: 'turned 90° the other way' },
  { swap: true, flipX: true, flipY: true, name: 'mirrored along the other diagonal' },
];

const UPRIGHT_ONLY = ALL_EIGHT.filter(({ swap }) => !swap);

export const symmetriesFor = (keepsUpright) => (keepsUpright ? UPRIGHT_ONLY : ALL_EIGHT);

export function sourceIndex(index, size, { swap, flipX, flipY }) {
  let column = index % size;
  let row = Math.floor(index / size);
  if (flipX) column = size - 1 - column;
  if (flipY) row = size - 1 - row;
  return swap ? column * size + row : row * size + column;
}

export function transformPicture(picture, symmetry) {
  const { size, rgb } = picture;
  const turned = new Uint8Array(rgb.length);
  for (let i = 0; i < size * size; i++) {
    const from = sourceIndex(i, size, symmetry) * 3;
    turned[i * 3] = rgb[from];
    turned[i * 3 + 1] = rgb[from + 1];
    turned[i * 3 + 2] = rgb[from + 2];
  }
  return { ...picture, rgb: turned };
}

export const withSymmetries = (pictures, symmetries) => pictures.flatMap((picture) => symmetries.map((symmetry) => transformPicture(picture, symmetry)));

export function sharedPixels(a, b, size, symmetry) {
  let same = 0;
  let counted = 0;
  for (let i = 0; i < size * size; i++) {
    const other = b[sourceIndex(i, size, symmetry)];
    if (a[i] === 0 && other === 0) continue;
    counted++;
    if (a[i] === other) same++;
  }
  return counted ? same / counted : 0;
}

export function transformIndices(indices, size, symmetry) {
  const turned = new Uint8Array(indices.length);
  for (let i = 0; i < turned.length; i++) turned[i] = indices[sourceIndex(i, size, symmetry)];
  return turned;
}
