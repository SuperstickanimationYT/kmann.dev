import { createByteTarget, createProgram, setUniforms } from './gl.js';
import { FULLSCREEN_VERTEX, INVENTED_COLOUR_WIDTH, INVENTED_GROUND_FRAGMENT } from './shaders.js';

const COLOUR_SIZE = [INVENTED_COLOUR_WIDTH, INVENTED_COLOUR_WIDTH / 2];
const SHAPE_SIZE = [2048, 1024];
const TILES = [8, 4];
const TILE_COUNT = TILES[0] * TILES[1];

const SEA_WORLD_CLOUDS = { mapped: true, baseKm: 1.5, topKm: 6.5, extinctionPerKm: 3, coverShift: 0 };
const EARTHLIKE_AIR = { tint: [0.28, 0.5, 1], scaleKm: 8, glow: [1, 0.95, 0.85], hazeKm: 80, sunset: [1, 0.45, 0.15] };
const SEA_WORLD = { roughness: 0.045, craters: 0, sea: true, lowKm: -2, rangeKm: 10, clouds: SEA_WORLD_CLOUDS, air: EARTHLIKE_AIR };
const ICE_WORLD = { roughness: 0.05, craters: 0.4, lowKm: -8, rangeKm: 16 };
const BARE_WORLD = { roughness: 0.06, craters: 1, lowKm: -8, rangeKm: 16 };
const LAVA_WORLD = { roughness: 0.04, craters: 0, lowKm: -8, rangeKm: 16 };

function groundKind(kelvin) {
  if (kelvin <= 175) return ICE_WORLD;
  if (kelvin < 300) return SEA_WORLD;
  return kelvin < 850 ? BARE_WORLD : LAVA_WORLD;
}

const twoChannels = (pixels, first) => Uint8Array.from({ length: pixels.length / 2 }, (_, k) => pixels[(k >> 1) * 4 + first + (k & 1)]);
const channel = (pixels, index) => Uint8Array.from({ length: pixels.length / 4 }, (_, texel) => pixels[texel * 4 + index]);

export function createInventedGround(gl, { emptyVao, latticeUnit, colourUnit, landUnit }) {
  let colourBuffer = null;
  let program = null;
  let baking = null;
  let baked = null;

  function prepare() {
    program = createProgram(gl, FULLSCREEN_VERTEX, INVENTED_GROUND_FRAGMENT);
    const colour = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + colourUnit);
    gl.bindTexture(gl.TEXTURE_2D, colour);
    gl.texStorage2D(gl.TEXTURE_2D, Math.log2(COLOUR_SIZE[0]) + 1, gl.RGBA8, ...COLOUR_SIZE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    gl.activeTexture(gl.TEXTURE0 + landUnit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texStorage2D(gl.TEXTURE_2D, Math.log2(SHAPE_SIZE[0]) + 1, gl.RG8, ...SHAPE_SIZE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    colourBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, colourBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colour, 0);
  }

  function draw(framebuffer, [width, height], body, sunLocal, shape) {
    const { lowKm, rangeKm } = groundKind(body.measured.kelvin);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(program.program);
    gl.uniform1i(program.uniforms.uLattice, latticeUnit);
    setUniforms(gl, program, {
      uInventedTint: body.tint,
      uInventedSun: sunLocal,
      uInventedPlanet: [body.invented.seed, body.measured.kelvin, body.tideLocked ? 1 : 0],
      uInventedShape: [shape ? 1 : 0, lowKm, rangeKm],
      uInventedFootprint: (2 * Math.PI) / width,
    });
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawColourTile(body, sunLocal, tile) {
    const [width, height] = COLOUR_SIZE.map((size, axis) => size / TILES[axis]);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor((tile % TILES[0]) * width, Math.floor(tile / TILES[0]) * height, width, height);
    draw(colourBuffer, COLOUR_SIZE, body, sunLocal, false);
    gl.disable(gl.SCISSOR_TEST);
  }

  function readShape(body, sunLocal) {
    const [width, height] = SHAPE_SIZE;
    const target = createByteTarget(gl, width, height);
    draw(target.framebuffer, SHAPE_SIZE, body, sunLocal, true);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    target.destroy();
    const kind = groundKind(body.measured.kelvin);
    const land = channel(pixels, 1);
    gl.activeTexture(gl.TEXTURE0 + landUnit);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RG, gl.UNSIGNED_BYTE, twoChannels(pixels, 1));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
    return {
      ...kind,
      invented: true,
      heights: { width, height, values: channel(pixels, 0) },
      land: kind.sea ? { width, height, values: land } : null,
    };
  }

  function groundOf(body, sunLocal) {
    if (baked?.name === body.name) return baked.ground;
    baked = null;
    if (!program) prepare();
    if (baking?.name !== body.name) baking = { name: body.name, tile: 0 };
    if (baking.tile < TILE_COUNT) {
      drawColourTile(body, sunLocal, baking.tile);
      baking.tile += 1;
      return null;
    }
    gl.activeTexture(gl.TEXTURE0 + colourUnit);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
    baked = { name: body.name, ground: readShape(body, sunLocal) };
    baking = null;
    return baked.ground;
  }

  const isPainted = (body) => body.name === baked?.name;

  function bind(target, shown) {
    if (target.uniforms.uInventedColour) gl.uniform1i(target.uniforms.uInventedColour, colourUnit);
    if (target.uniforms.uInventedLand) gl.uniform1i(target.uniforms.uInventedLand, landUnit);
    setUniforms(gl, target, { uInventedBody: { int: shown.findIndex(({ body }) => isPainted(body)) } });
  }

  return { groundOf, bind, isPainted };
}
