import { writeFileSync } from 'node:fs';

const MAGNITUDE_LIMIT = 6.5;
const PARALLAX_FLOOR_MAS = 1;
const RADIAL_VELOCITY_SPREAD = 15;
const KM_S_PER_MAS_YR_KPC = 4.74047;
const SUN_PECULIAR = [11.1, 12.24, 7.25];
const BYTES_PER_STAR = 24;
const DEGREES = Math.PI / 180;
const OUTPUT = new URL('../data/nearby-stars.bin', import.meta.url);
const NAMES_OUTPUT = new URL('../data/nearby-star-names.json', import.meta.url);
const NAMES = {
  32349: 'Sirius', 30438: 'Canopus', 71683: 'Alpha Centauri', 69673: 'Arcturus', 91262: 'Vega',
  24608: 'Capella', 24436: 'Rigel', 37279: 'Procyon', 27989: 'Betelgeuse', 7588: 'Achernar',
  97649: 'Altair', 21421: 'Aldebaran', 80763: 'Antares', 65474: 'Spica', 37826: 'Pollux',
  113368: 'Fomalhaut', 11767: 'Polaris', 68702: 'Hadar', 62434: 'Mimosa', 60718: 'Acrux',
  49669: 'Regulus', 36850: 'Castor', 26727: 'Alnitak', 26311: 'Alnilam', 25930: 'Mintaka',
  54061: 'Dubhe', 67301: 'Alkaid', 3179: 'Schedar', 677: 'Alpheratz', 15863: 'Mirfak',
};

const EQUATORIAL_TO_GALACTIC = [
  [-0.0548755604, -0.873437090, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

const query = new URLSearchParams({
  '-source': 'I/311/hip2',
  '-out.max': '20000',
  '-out': 'HIP,RArad,DErad,Plx,pmRA,pmDE,Hpmag,B-V',
  Hpmag: `<${MAGNITUDE_LIMIT}`,
  Plx: `>${PARALLAX_FLOOR_MAS}`,
});

const rotate = (vector) => EQUATORIAL_TO_GALACTIC.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);

function gaussianFromId(id) {
  let state = id * 2654435761;
  const next = () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return (state + 0.5) / 4294967296;
  };
  return Math.sqrt(-2 * Math.log(next())) * Math.cos(2 * Math.PI * next());
}

function toGalactic({ hip, ra, dec, parallax, pmRa, pmDec, magnitude, colour }) {
  const distance = 1000 / parallax;
  const along = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const east = [-Math.sin(ra), Math.cos(ra), 0];
  const north = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const radial = RADIAL_VELOCITY_SPREAD * gaussianFromId(hip);
  const eastSpeed = (KM_S_PER_MAS_YR_KPC * pmRa) / parallax;
  const northSpeed = (KM_S_PER_MAS_YR_KPC * pmDec) / parallax;
  const velocity = along.map((_, i) => radial * along[i] + eastSpeed * east[i] + northSpeed * north[i]);
  const position = rotate(along).map((component) => component * distance);
  const lsrVelocity = rotate(velocity).map((component, i) => component + SUN_PECULIAR[i]);
  return {
    hip,
    position,
    velocity: lsrVelocity,
    absolute: magnitude + 5 + 5 * Math.log10(parallax / 1000),
    colour,
  };
}

const response = await fetch(`https://vizier.cds.unistra.fr/viz-bin/asu-tsv?${query}`);
const rows = (await response.text())
  .split('\n')
  .filter((line) => line && !line.startsWith('#'))
  .slice(3)
  .map((line) => line.split('\t').map((cell) => cell.trim()))
  .filter((cells) => cells.length === 8 && cells.every((cell) => cell !== ''));

const stars = rows.map(([hip, ra, dec, parallax, pmRa, pmDec, magnitude, colour]) =>
  toGalactic({
    hip: Number(hip),
    ra: Number(ra) * DEGREES,
    dec: Number(dec) * DEGREES,
    parallax: Number(parallax),
    pmRa: Number(pmRa),
    pmDec: Number(pmDec),
    magnitude: Number(magnitude),
    colour: Number(colour),
  }),
);

const packed = new DataView(new ArrayBuffer(stars.length * BYTES_PER_STAR));
stars.forEach((star, i) => {
  const at = i * BYTES_PER_STAR;
  star.position.forEach((component, axis) => packed.setFloat32(at + 4 * axis, component, true));
  star.velocity.forEach((component, axis) => packed.setInt16(at + 12 + 2 * axis, Math.round(component * 10), true));
  packed.setInt16(at + 18, Math.round(star.absolute * 1000), true);
  packed.setInt16(at + 20, Math.round(star.colour * 1000), true);
});

writeFileSync(OUTPUT, Buffer.from(packed.buffer));
const names = Object.fromEntries(
  stars.flatMap((star, index) => (NAMES[star.hip] ? [[index, NAMES[star.hip]]] : [])),
);
writeFileSync(NAMES_OUTPUT, `${JSON.stringify(names, null, 2)}
`);
console.log(`${stars.length} stars written, ${Object.keys(names).length} named`);
