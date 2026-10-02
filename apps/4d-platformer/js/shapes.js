export function hypercubeEdges(n) {
  const edges = [];
  for (let i = 0; i < 1 << n; i++) {
    for (let bit = 0; bit < n; bit++) {
      const j = i ^ (1 << bit);
      if (i < j) edges.push([i, j]);
    }
  }
  return edges;
}

export function hypercubeVertices(center, half) {
  const vertices = [];
  for (let i = 0; i < 1 << center.length; i++) {
    vertices.push(center.map((c, axis) => c + ((i >> axis) & 1 ? half[axis] : -half[axis])));
  }
  return vertices;
}

export function boxSegments(center, half) {
  const vertices = hypercubeVertices(center, half);
  return hypercubeEdges(center.length).map(([i, j]) => [vertices[i], vertices[j]]);
}

function postSegments(center, half) {
  const [bottom, top] = [[...center], [...center]];
  bottom[1] -= half[1];
  top[1] += half[1];
  return [[bottom, top]];
}

export function box(center, half, extra = {}) {
  const segments = extra.hidden ? [] : extra.post ? postSegments(center, half) : boxSegments(center, half);
  return {
    center,
    half,
    marked: true,
    ...extra,
    min: center.map((c, axis) => c - half[axis]),
    max: center.map((c, axis) => c + half[axis]),
    segments,
  };
}
