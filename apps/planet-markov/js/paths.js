const luminance = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

function floorColors(palette) {
  const levels = palette.slice(1).map(luminance);
  const middle = (Math.min(...levels) + Math.max(...levels)) / 2;
  return palette.map((color, index) => index > 0 && luminance(color) > middle);
}

function labelRegions(indices, size, isFloor) {
  const region = new Int32Array(indices.length).fill(-1);
  const sizes = [];
  const queue = new Int32Array(indices.length);
  for (let start = 0; start < indices.length; start++) {
    if (region[start] >= 0 || !isFloor[indices[start]]) continue;
    const label = sizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    region[start] = label;
    while (head < tail) {
      const pixel = queue[head++];
      const column = pixel % size;
      const neighbors = [
        column > 0 ? pixel - 1 : -1,
        column < size - 1 ? pixel + 1 : -1,
        pixel - size,
        pixel + size,
      ];
      for (const next of neighbors) {
        if (next < 0 || next >= indices.length || region[next] >= 0 || !isFloor[indices[next]]) continue;
        region[next] = label;
        queue[tail++] = next;
      }
    }
    sizes.push(tail);
  }
  return { region, sizes };
}

export function findCutOff(indices, size, palette) {
  const { region, sizes } = labelRegions(indices, size, floorColors(palette));
  const floor = sizes.reduce((sum, count) => sum + count, 0);
  const main = sizes.indexOf(Math.max(...sizes));
  const cutOff = new Uint8Array(indices.length);
  for (let pixel = 0; pixel < indices.length; pixel++) cutOff[pixel] = region[pixel] >= 0 && region[pixel] !== main ? 1 : 0;
  return { cutOff, share: floor ? 1 - sizes[main] / floor : 0 };
}
