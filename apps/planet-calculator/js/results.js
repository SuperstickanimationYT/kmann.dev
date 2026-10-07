import { skyColor, starColor } from './color.js';
import { SUN_FROM_EARTH_DEG } from './physics.js';

const KELVIN_AT_ZERO_CELSIUS = 273.15;
const REFERENCE_PERSON_KG = 70;
const MOON_DISTANCE_KM = 384400;
const NOTICEABLE_ECCENTRICITY = 0.01;
const UNIVERSE_AGE_GYR = 13.8;

const KIND_NAMES = {
  rocky: 'Rocky, like Earth or Mars',
  neptune: 'Mini-Neptune: deep gas envelope, probably no solid surface',
  giant: 'Gas giant',
};

const ZONE_VERDICTS = {
  inside: ['Inside the habitable zone', 'good'],
  edge: ['On the edge of the habitable zone: liquid water needs the right air', 'warn'],
  'too-hot': ['Too close to its star: oceans would boil away', 'warn'],
  'too-cold': ['Too far from its star: water stays frozen without heavy greenhouse warming', 'warn'],
};

export function significant(value, digits = 3) {
  if (!Number.isFinite(value)) return '∞';
  if (value === 0) return '0';
  return Number(value.toPrecision(digits)).toLocaleString('en', { maximumFractionDigits: 12 });
}

function temperature(kelvin) {
  const celsius = kelvin - KELVIN_AT_ZERO_CELSIUS;
  const whole = (value) => Math.round(value).toLocaleString('en');
  return `${whole(celsius)} °C (${whole((celsius * 9) / 5 + 32)} °F)`;
}

function duration(years) {
  if (years >= 1e9) return `${significant(years / 1e9, 2)} billion years`;
  if (years >= 1e6) return `${significant(years / 1e6, 2)} million years`;
  return `${significant(years, 2)} years`;
}

function hours(value) {
  return value >= 48 ? `${significant(value / 24)} Earth days` : `${significant(value)} hours`;
}

function starSection({ star }) {
  const rows = [
    { label: 'Type', value: `${star.spectral}-type main-sequence star`, swatch: starColor(star.temperatureK) },
    { label: 'Mass', value: `${significant(star.massSun)} × the Sun` },
    { label: 'Radius', value: `${significant(star.radiusSun)} × the Sun` },
    { label: 'Luminosity', value: `${significant(star.luminositySun)} × the Sun` },
    { label: 'Surface temperature', value: `${Math.round(star.temperatureK).toLocaleString('en')} K` },
    {
      label: 'Main-sequence lifetime',
      value: duration(star.lifetimeGyr * 1e9),
      note: star.lifetimeGyr > UNIVERSE_AGE_GYR ? 'Longer than the universe has existed so far.' : undefined,
    },
  ];
  if (star.pastMainSequence) {
    rows.push({
      label: 'Age check',
      value: `At ${significant(star.ageGyr, 2)} billion years old, a star this heavy would already have swollen into a giant or died`,
      tone: 'warn',
    });
  }
  return { title: 'Primary star', rows };
}

function orbitSection({ orbit, zone, climate, spin }) {
  const rows = [{ label: 'Year', value: `${significant(orbit.yearDays)} Earth days (${significant(orbit.yearEarthYears)} Earth years)` }];
  if (Number.isFinite(spin.localDayDays)) {
    rows.push({ label: 'Year in local days', value: `${significant(orbit.yearDays / spin.localDayDays)} local days` });
  }
  if (orbit.eccentricity >= NOTICEABLE_ECCENTRICITY) {
    const [faintest, brightest] = orbit.starlightRange;
    rows.push({ label: 'Distance over the year', value: `${significant(orbit.nearestAu)} to ${significant(orbit.farthestAu)} AU` });
    rows.push({
      label: 'Starlight',
      value: `${significant(climate.starlightEarth)} × what Earth gets on average, from ${significant(faintest)} to ${significant(brightest)} over the year`,
    });
  } else {
    rows.push({ label: 'Starlight', value: `${significant(climate.starlightEarth)} × what Earth gets` });
  }
  const [verdict, tone] = ZONE_VERDICTS[zone.verdict];
  rows.push({
    label: 'Habitable zone',
    value: verdict,
    tone,
    note: `Conservative ${significant(zone.inner)}–${significant(zone.outer)} AU, optimistic ${significant(zone.optimisticInner)}–${significant(zone.optimisticOuter)} AU.${
      zone.outsideFit ? ' This star is outside the temperature range the zone formula was fitted to, so treat the edges as rough.' : ''
    }`,
  });
  return { title: 'Orbit', rows };
}

function surfaceSection({ planet, climate }) {
  const held = climate.gases.filter((gas) => gas.held);
  const lost = climate.gases.filter((gas) => !gas.held);
  const rows = [
    { label: 'Kind', value: KIND_NAMES[planet.kind] },
    {
      label: 'Gravity',
      value: `${significant(planet.gravityG)} g`,
      note: `A ${REFERENCE_PERSON_KG} kg person would feel like they weigh ${Math.round(planet.gravityG * REFERENCE_PERSON_KG)} kg.`,
    },
    { label: 'Density', value: `${significant(planet.densityGcc)} g/cm³`, note: 'Earth 5.5, Mars 3.9, Jupiter 1.3.' },
    { label: 'Escape velocity', value: `${significant(planet.escapeKms)} km/s` },
    {
      label: 'Average temperature',
      value: temperature(climate.surfaceK),
      note: planet.greenhouseK > 0 ? `${temperature(climate.equilibriumK)} before greenhouse warming.` : undefined,
    },
  ];
  if (climate.daySideK !== null) rows.push({ label: 'Under its star', value: `up to about ${temperature(climate.daySideK)}` });
  if (planet.kind === 'rocky') {
    rows.push({
      label: 'Liquid water',
      value: climate.liquidWater ? 'Yes, at Earth-like air pressure' : 'No, not at Earth-like air pressure',
      tone: climate.liquidWater ? 'good' : 'warn',
    });
  }
  rows.push({
    label: 'Air it can keep',
    value: held.length ? held.map((gas) => gas.formula).join(', ') : 'None of the common gases',
    note: lost.length ? `Leaks away over billions of years: ${lost.map((gas) => gas.name.toLowerCase()).join(', ')}.` : undefined,
  });
  return { title: 'Surface', rows };
}

function lockingVerdict(spin) {
  if (spin.resonanceLikely) return 'Tides have won: expect a spin–orbit resonance like Mercury’s rather than full locking';
  if (spin.tidesWon) return `Tides would lock it within ${duration(spin.lockYears)}, so one side faces its star forever`;
  return `Tides would take ${duration(spin.lockYears)} to lock it, so it can keep spinning`;
}

function lockingConflict(spin) {
  if (spin.tidesWon && !spin.locked && !spin.resonanceLikely) {
    return { tone: 'warn', note: 'You have it spinning freely. That takes a young system, a recent big impact, or a thick atmosphere pushing back.' };
  }
  if (!spin.tidesWon && spin.locked) {
    return { tone: 'warn', note: 'You have it locked, but its star is too weak or too far to have done that by now.' };
  }
  return {};
}

function daySection({ spin, planet }) {
  const rows = [{ label: 'Tidal locking', value: lockingVerdict(spin), ...lockingConflict(spin) }];
  if (spin.locked) {
    rows.push({ label: 'Day and night', value: 'None: permanent day on one side, permanent night on the other' });
  } else {
    rows.push({ label: 'Rotation', value: hours(spin.rotationHours) });
    rows.push({ label: 'Local day (noon to noon)', value: hours(spin.localDayDays * 24) });
  }
  if (planet.tiltDeg > 0) {
    rows.push({
      label: 'Seasons',
      value: `Tropics reach ${significant(spin.tropicsDeg)}° north and south; polar circles start at ${significant(spin.polarCirclesDeg)}°`,
    });
  } else {
    rows.push({ label: 'Seasons', value: 'No tilt, so no seasons from tilt' });
  }
  return { title: 'Day and seasons', rows };
}

function skySection({ star, sky }) {
  return {
    title: 'Sky',
    rows: [
      {
        label: 'Its star looks',
        value: `${significant(sky.starDiameterDeg)}° wide, ${significant(sky.starDiameterDeg / SUN_FROM_EARTH_DEG)} × the Sun from Earth`,
        swatch: starColor(star.temperatureK),
      },
      { label: 'Daytime sky colour', value: 'With Earth-like air', swatch: skyColor(star.temperatureK) },
    ],
  };
}

function moonSection({ moons }) {
  return {
    title: 'Moons',
    rows: [
      {
        label: 'Stable moons orbit within',
        value: `${significant(moons.stableMoonsWithinKm)} km`,
        note: `Earth’s Moon is ${MOON_DISTANCE_KM.toLocaleString('en')} km out. Beyond about ${significant(moons.hillKm)} km its star pulls moons away.`,
      },
    ],
  };
}

export function resultSections(world) {
  return [starSection(world), orbitSection(world), surfaceSection(world), daySection(world), skySection(world), moonSection(world)];
}

export function plainText(name, sections) {
  const lines = [name];
  for (const section of sections) {
    lines.push('', section.title.toUpperCase());
    for (const row of section.rows) {
      lines.push(`${row.label}: ${row.value}${row.swatch ? ` (${row.swatch})` : ''}`);
      if (row.note) lines.push(`  ${row.note}`);
    }
  }
  return lines.join('\n');
}
