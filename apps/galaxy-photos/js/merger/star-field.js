import { bindTextures, createFloatTexture, createProgram, createTarget, setUniforms } from '../gl.js';
import { densityScale, FIELD_GRID, MERGER_RMAX } from './density.js';

const SPLAT_VERTEX = `#version 300 es
layout(location = 0) in vec2 aPlace;
layout(location = 1) in float aGalaxy;
uniform float uRmax;
out float vGalaxy;
void main() {
  vGalaxy = aGalaxy;
  gl_Position = vec4(aPlace / uRmax, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;

const SPLAT_FRAGMENT = `#version 300 es
precision highp float;
in float vGalaxy;
out vec4 outCount;
void main() {
  outCount = vec4(1.0, 1.0 - vGalaxy, vGalaxy, 0.0);
}
`;

const BLUR_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uStep;
uniform float uSigma;
uniform float uGrid;
out vec4 outBlurred;
void main() {
  vec2 uv = gl_FragCoord.xy / uGrid;
  int reach = int(ceil(3.0 * uSigma));
  vec4 sum = vec4(0.0);
  float weight = 0.0;
  for (int i = -reach; i <= reach; i++) {
    float w = exp(-0.5 * float(i * i) / (uSigma * uSigma));
    sum += w * texture(uSource, uv + float(i) * uStep);
    weight += w;
  }
  outBlurred = sum / weight;
}
`;

const COMPOSE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uSmall;
uniform sampler2D uMedium;
uniform sampler2D uLarge;
uniform sampler2D uHeights;
uniform float uGrid;
uniform float uPerStarPerCell;
uniform float uSharpDensity;
uniform float uTrustedHeightShare;
uniform float uColdHeight;
layout(location = 0) out vec4 outLight;
layout(location = 1) out vec4 outMembers;
void main() {
  vec2 uv = gl_FragCoord.xy / uGrid;
  vec4 large = texture(uLarge, uv);
  float small = texture(uSmall, uv).r * uPerStarPerCell;
  float medium = texture(uMedium, uv).r * uPerStarPerCell;
  float largeDensity = large.r * uPerStarPerCell;
  float trusted = min(1.0, largeDensity / (uTrustedHeightShare * uSharpDensity));
  float height = uColdHeight + (texture(uHeights, uv).r - uColdHeight) * trusted;
  outLight = vec4(small, medium, largeDensity, height);
  outMembers = vec4(large.g, large.b, 0.0, 0.0);
}
`;

const FULLSCREEN_VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

export function createStarFieldBuilder(gl) {
  const splat = createProgram(gl, SPLAT_VERTEX, SPLAT_FRAGMENT);
  const blurProgram = createProgram(gl, FULLSCREEN_VERTEX, BLUR_FRAGMENT);
  const compose = createProgram(gl, FULLSCREEN_VERTEX, COMPOSE_FRAGMENT);
  const [counts, across, small, medium, large] = [0, 0, 0, 0, 0].map(() => createTarget(gl, FIELD_GRID, FIELD_GRID));
  const field = createTarget(gl, FIELD_GRID, FIELD_GRID, 2);
  let heights = null;
  let heightGrid = 0;

  const placeBuffer = gl.createBuffer();
  const galaxyBuffer = gl.createBuffer();
  const splatVao = gl.createVertexArray();
  gl.bindVertexArray(splatVao);
  for (const [location, buffer, size] of [[0, placeBuffer, 2], [1, galaxyBuffer, 1]]) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }
  const emptyVao = gl.createVertexArray();
  gl.bindVertexArray(null);

  function drawFullscreenInto(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, FIELD_GRID, FIELD_GRID);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function blurInto(source, target, sigmaCells) {
    gl.useProgram(blurProgram.program);
    for (const [from, to, step] of [[source, across, [1 / FIELD_GRID, 0]], [across, target, [0, 1 / FIELD_GRID]]]) {
      bindTextures(gl, blurProgram, { uSource: from.textures[0] });
      setUniforms(gl, blurProgram, { uStep: step, uSigma: sigmaCells, uGrid: FIELD_GRID });
      drawFullscreenInto(to);
    }
  }

  function uploadHeights(snapshot) {
    if (heightGrid !== snapshot.heightGrid) {
      heights = createFloatTexture(gl, snapshot.heightGrid, snapshot.heightGrid);
      heightGrid = snapshot.heightGrid;
    }
    gl.bindTexture(gl.TEXTURE_2D, heights);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, heightGrid, heightGrid, 0, gl.RGBA, gl.FLOAT, snapshot.heights);
  }

  function build(snapshot) {
    const scale = densityScale(snapshot.galaxies.length);
    gl.bindBuffer(gl.ARRAY_BUFFER, placeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, snapshot.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, galaxyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(snapshot.galaxies), gl.DYNAMIC_DRAW);

    gl.bindFramebuffer(gl.FRAMEBUFFER, counts.framebuffer);
    gl.viewport(0, 0, FIELD_GRID, FIELD_GRID);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(splat.program);
    setUniforms(gl, splat, { uRmax: MERGER_RMAX });
    gl.bindVertexArray(splatVao);
    gl.drawArrays(gl.POINTS, 0, snapshot.galaxies.length);
    gl.disable(gl.BLEND);

    blurInto(counts, small, scale.blurCells.small);
    blurInto(counts, medium, scale.blurCells.medium);
    blurInto(counts, large, scale.blurCells.large);
    uploadHeights(snapshot);

    gl.useProgram(compose.program);
    bindTextures(gl, compose, { uSmall: small.textures[0], uMedium: medium.textures[0], uLarge: large.textures[0], uHeights: heights });
    setUniforms(gl, compose, {
      uGrid: FIELD_GRID,
      uPerStarPerCell: scale.perStarPerCell,
      uSharpDensity: scale.sharpDensity,
      uTrustedHeightShare: scale.trustedHeightShare,
      uColdHeight: scale.coldHeight,
    });
    drawFullscreenInto(field);
    gl.bindVertexArray(null);
    return { light: field.textures[0], members: field.textures[1] };
  }

  return { build };
}
