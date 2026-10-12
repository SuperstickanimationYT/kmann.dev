export const NX = 256;
export const NY = 128;
export const DOMAIN = { west: -100, east: -10, south: 5, north: 45 };

const METRES_PER_DEGREE = 111_000;
const MID_LATITUDE = (DOMAIN.south + DOMAIN.north) / 2;
const EARTH_SPIN = 7.292e-5;

export const DX = ((DOMAIN.east - DOMAIN.west) * METRES_PER_DEGREE * Math.cos((MID_LATITUDE * Math.PI) / 180)) / NX;
export const DY = ((DOMAIN.north - DOMAIN.south) * METRES_PER_DEGREE) / NY;

export const lonAt = (i) => DOMAIN.west + ((i + 0.5) * (DOMAIN.east - DOMAIN.west)) / NX;
export const latAt = (j) => DOMAIN.south + ((j + 0.5) * (DOMAIN.north - DOMAIN.south)) / NY;
export const latAtFace = (j) => DOMAIN.south + (j * (DOMAIN.north - DOMAIN.south)) / NY;
export const columnOf = (lon) => ((lon - DOMAIN.west) / (DOMAIN.east - DOMAIN.west)) * NX - 0.5;
export const rowOf = (lat) => ((lat - DOMAIN.south) / (DOMAIN.north - DOMAIN.south)) * NY - 0.5;
export const coriolis = (lat) => 2 * EARTH_SPIN * Math.sin((lat * Math.PI) / 180);
export const wrapColumn = (i) => ((i % NX) + NX) % NX;
