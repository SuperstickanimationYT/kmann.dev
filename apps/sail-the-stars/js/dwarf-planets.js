import { DEGREES } from './milky-way.js';

const ECLIPTIC_POLE = [270, 66.56072];
const OBLIQUITY = 23.43928 * DEGREES;
const turnsEvery = (hours) => [0, (360 * 24) / hours];
const coldIce = (seed) => ({ seed, kelvin: 40 });

function poleOfOrbit(inclinationDegrees, nodeDegrees) {
  const [inclination, node] = [inclinationDegrees * DEGREES, nodeDegrees * DEGREES];
  const [x, y, z] = [Math.sin(node) * Math.sin(inclination), -Math.cos(node) * Math.sin(inclination), Math.cos(inclination)];
  const [c, s] = [Math.cos(OBLIQUITY), Math.sin(OBLIQUITY)];
  return [Math.atan2(y * c - z * s, x) / DEGREES, Math.asin(y * s + z * c) / DEGREES];
}

export const DWARF_ORBITS = {
  Ceres: [[2.7670809, -0.0000051], [0.07777568, -0.00042314], [10.595392, -0.01638558], [160.71858, 7819.4744], [153.104, 1.7457548], [80.550738, -1.4982992]],
  Pluto: [[39.485959, 0.00467279], [0.24901419, 0.00008423], [17.140303, -0.00008623], [238.88268, 145.1807], [224.09554, -0.00977944], [110.30646, -0.00902931]],
  Orcus: [[39.286957, -0.00045219], [0.22394178, 0.00000179], [20.566978, -0.00001333], [132.67261, 146.30124], [341.61195, -0.01601832], [268.58453, -0.00812785]],
  Haumea: [[43.111379, -0.00148172], [0.19528042, -0.00005851], [28.203379, 0.00051151], [192.32077, 127.28482], [1.8678912, 0.01318246], [121.95375, -0.0082323]],
  Quaoar: [[43.331265, -0.00009622], [0.03686151, -0.00000451], [7.9906392, 0.0005544], [251.60041, 126.3079], [346.84254, -0.02493445], [188.91521, -0.00952776]],
  Makemake: [[45.493736, -0.00056223], [0.16015702, -0.0000248], [29.004103, 0.00009222], [155.61867, 117.40046], [15.513767, 0.02380406], [79.443868, -0.00817951]],
  Gonggong: [[67.067184, -0.00009044], [0.50342177, -0.00000133], [30.802459, -0.00001595], [277.47902, 65.590789], [183.82478, 0.00192481], [336.84195, -0.00166541]],
  Eris: [[67.831562, -0.0037564], [0.43840523, -0.00003315], [43.992915, 0.00009497], [21.042913, 64.479962], [187.19453, -0.00264796], [35.976225, -0.00119388]],
  Sedna: [[506.43829, 0.00412137], [0.84955412, 0.00000128], [11.928581, 0.00001686], [93.280879, 3.1612382], [95.687072, 0.00043205], [144.40143, -0.00029751]],
};

export const DWARF_SATELLITE_ORBITS = {
  Charon: { laplacePole: ECLIPTIC_POLE, a: 19596, e: 0.00016, inclination: 112.889, node: 227.3909, periapsisLongitude: 39.8689, meanLongitude: 188.6397, degreesPerDay: 56.36253101, parentShare: 0.10854 },
  Styx: { aroundSharedCentre: true, laplacePole: ECLIPTIC_POLE, a: 43169, e: 0, inclination: 112.8871, node: 227.3871, meanLongitude: 75.1947, degreesPerDay: 17.85544192, parentShare: 0 },
  Nix: { aroundSharedCentre: true, laplacePole: ECLIPTIC_POLE, a: 49335, e: 0, inclination: 112.8894, node: 227.3892, meanLongitude: 336.6056, degreesPerDay: 14.48417202, parentShare: 0 },
  Kerberos: { aroundSharedCentre: true, laplacePole: ECLIPTIC_POLE, a: 58275, e: 0, inclination: 112.8141, node: 227.4091, meanLongitude: 152.4094, degreesPerDay: 11.191252, parentShare: 0 },
  Hydra: { aroundSharedCentre: true, laplacePole: ECLIPTIC_POLE, a: 65182, e: 0, inclination: 112.7642, node: 227.4109, meanLongitude: 117.5003, degreesPerDay: 9.42358664, parentShare: 0 },
  Dysnomia: { laplacePole: ECLIPTIC_POLE, a: 37274, e: 0.00611, inclination: 61.6099, node: 139.0981, periapsisLongitude: 294.6573, meanLongitude: 49.5488, degreesPerDay: 22.80515769, parentShare: 0.0084 },
  Vanth: { laplacePole: ECLIPTIC_POLE, a: 8975, e: 0.00148, inclination: 89.7823, node: 51.0398, periapsisLongitude: 297.4465, meanLongitude: 37.7267, degreesPerDay: 37.73918771, parentShare: 0.137 },
  Weywot: { laplacePole: ECLIPTIC_POLE, a: 13518, e: 0.25272, inclination: 154.3213, node: 330.9932, periapsisLongitude: 7.2803, meanLongitude: 195.2671, degreesPerDay: 30.80437954, parentShare: 0.0026 },
  "Hi'iaka": { laplacePole: ECLIPTIC_POLE, a: 49880, e: 0.0513, inclination: 126.356, node: 206.766, periapsisLongitude: 0.866, meanLongitude: 271.35, degreesPerDay: 7.27831, parentShare: 0.0045 },
  Namaka: { laplacePole: ECLIPTIC_POLE, a: 25657, e: 0.249, inclination: 113.013, node: 205.016, periapsisLongitude: 23.916, meanLongitude: 320.4, degreesPerDay: 19.69548, parentShare: 0.0004 },
};

export const DWARF_PLANETS = [
  { name: 'Ceres', kind: 'rocky', dwarf: 'agreed', radiusKm: 469.7, pole: [291.418, 66.764], spin: [170.65, 952.1532], tint: [0.22, 0.215, 0.21], magnitude: 3.34, map: 'ceres', mapKmPerPixel: 2.9, roughness: 0.5, ground: { roughness: 0.06, craters: 1 } },
  { name: 'Pluto', kind: 'rocky', dwarf: 'agreed', radiusKm: 1188.3, pole: [132.993, -6.163], spin: [302.695, 56.3625225], tint: [0.8, 0.7, 0.58], magnitude: -0.55, map: 'pluto', mapKmPerPixel: 7.3, roughness: 0.25, haze: { gas: { depth: [0.004, 0.008, 0.016], scaleKm: 40 }, dust: { depth: [0.004, 0.005, 0.007], light: [0.006, 0.009, 0.015], scaleKm: 40, forwardness: 0.6, sunDimming: 0.1 } }, ground: { roughness: 0.04, craters: 0.25 } },
  { name: 'Charon', kind: 'rocky', parent: 'Pluto', synchronous: true, radiusKm: 606, tint: [0.55, 0.53, 0.51], magnitude: 1, map: 'charon', mapKmPerPixel: 3.7, roughness: 0.4, ground: { roughness: 0.05, craters: 0.6 } },
  { name: 'Styx', kind: 'rocky', parent: 'Pluto', synchronous: true, radiusKm: 5.2, tint: [0.65, 0.65, 0.65], magnitude: 11.5 },
  { name: 'Nix', kind: 'rocky', parent: 'Pluto', synchronous: true, radiusKm: 19, tint: [0.6, 0.57, 0.56], magnitude: 8.3 },
  { name: 'Kerberos', kind: 'rocky', parent: 'Pluto', synchronous: true, radiusKm: 6, tint: [0.6, 0.6, 0.6], magnitude: 11 },
  { name: 'Hydra', kind: 'rocky', parent: 'Pluto', synchronous: true, radiusKm: 18.3, tint: [0.8, 0.8, 0.82], magnitude: 8 },
  { name: 'Haumea', kind: 'rocky', dwarf: 'agreed', radiusKm: 798, flattening: 0.49, pole: poleOfOrbit(126.356, 206.766), spin: turnsEvery(3.915341), tint: [0.75, 0.75, 0.76], magnitude: 0.14 },
  { name: "Hi'iaka", kind: 'rocky', parent: 'Haumea', synchronous: true, radiusKm: 160, tint: [0.75, 0.76, 0.78], magnitude: 3.4 },
  { name: 'Namaka', kind: 'rocky', parent: 'Haumea', synchronous: true, radiusKm: 85, tint: [0.75, 0.76, 0.78], magnitude: 4.8 },
  { name: 'Makemake', kind: 'rocky', dwarf: 'agreed', radiusKm: 715, pole: ECLIPTIC_POLE, spin: turnsEvery(22.8266), tint: [0.85, 0.76, 0.67], magnitude: -0.25, invented: coldIce(11) },
  { name: 'Eris', kind: 'rocky', dwarf: 'agreed', radiusKm: 1163, pole: poleOfOrbit(61.6099, 139.0981), spin: [0, 22.80515769], tint: [0.9, 0.89, 0.87], magnitude: -1.26, invented: coldIce(23) },
  { name: 'Dysnomia', kind: 'rocky', parent: 'Eris', synchronous: true, radiusKm: 308, tint: [0.22, 0.21, 0.2], magnitude: 5.6 },
  { name: 'Orcus', kind: 'rocky', dwarf: 'likely', radiusKm: 455, pole: poleOfOrbit(89.7823, 51.0398), spin: [0, 37.73918771], tint: [0.5, 0.5, 0.5], magnitude: 2.13, invented: coldIce(31) },
  { name: 'Vanth', kind: 'rocky', parent: 'Orcus', synchronous: true, radiusKm: 221, tint: [0.3, 0.29, 0.28], magnitude: 4.9 },
  { name: 'Quaoar', kind: 'rocky', dwarf: 'likely', radiusKm: 545, pole: poleOfOrbit(154.3213, 330.9932), spin: turnsEvery(17.68), tint: [0.45, 0.39, 0.35], magnitude: 2.41, invented: coldIce(37) },
  { name: 'Weywot', kind: 'rocky', parent: 'Quaoar', synchronous: true, radiusKm: 85, tint: [0.22, 0.2, 0.18], magnitude: 8.3 },
  { name: 'Gonggong', kind: 'rocky', dwarf: 'likely', radiusKm: 615, pole: ECLIPTIC_POLE, spin: turnsEvery(22.4), tint: [0.5, 0.39, 0.32], magnitude: 1.82, invented: coldIce(43) },
  { name: 'Sedna', kind: 'rocky', dwarf: 'likely', radiusKm: 453, pole: ECLIPTIC_POLE, spin: turnsEvery(10.273), tint: [0.58, 0.45, 0.36], magnitude: 1.5, invented: coldIce(53) },
];
