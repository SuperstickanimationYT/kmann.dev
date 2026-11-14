import { length, mass, orderOfMagnitude, significant } from './life.js';

const KELVIN_AT_ZERO_CELSIUS = 273.15;
const EARTH_TROPICS_FOOD_W_M2 = 0.44;
const EARTH_SURFACE_LIGHT_W_M2 = 230;
const EYE_LIMIT_NM = 750;
const EARTH_EYES_NM = 555;
const SUN_PEAK_NM = 502;

const VERDICT_TONES = { likely: 'good', possible: undefined, unlikely: 'warn', 'ruled out': 'off' };

const STATE_TEXT = {
  liquid: (solvent) => `Liquid ${solvent}`,
  frozen: (solvent) => `Frozen ${solvent}`,
  boiling: (solvent) => `Too hot: ${solvent} boils away`,
  none: (solvent) => `Air too thin for liquid ${solvent} at any temperature`,
};

function celsius(kelvin) {
  return `${Math.round(kelvin - KELVIN_AT_ZERO_CELSIUS).toLocaleString('en')} °C`;
}

function power(wattsPerSquareMetre) {
  if (wattsPerSquareMetre === 0) return '0';
  if (wattsPerSquareMetre >= 0.01) return `${significant(wattsPerSquareMetre, 2)} W/m²`;
  return `${significant(wattsPerSquareMetre * 1000, 2)} mW/m²`;
}

function foodChain(levels) {
  if (levels === 0) return 'None';
  if (levels === 1) return '1 level: producers only';
  if (levels === 2) return '2 levels: producers and grazers';
  const hunters = levels - 2;
  return `${levels} levels: producers, grazers and ${hunters} ${hunters === 1 ? 'level' : 'levels'} of hunters`;
}

function pace(value) {
  if (value >= 0.1) return `${Math.round(value * 100)}% of Earth's warmest`;
  if (value === 0) return 'Stopped';
  return `About ${orderOfMagnitude(1 / value)} times slower than Earth's warmest`;
}

function glanceSection(name, world, life) {
  const solvent = life.solvent.name.toLowerCase();
  const rows = [
    {
      label: 'Liquid',
      value: life.range
        ? `${life.solvent.name}, liquid from ${celsius(life.range.meltK)} to ${celsius(life.range.boilK)} at this pressure`
        : `${life.solvent.name} cannot stay liquid at this pressure`,
      note: life.autoSolvent ? `Picked because ${solvent} stays liquid over the most area. Change it under Surface.` : undefined,
      tone: life.range ? undefined : 'warn',
    },
    {
      label: 'Richest zone',
      value: life.richest.foodWm2 > 0 ? `${life.richest.name}: ${power(life.richest.foodWm2)} of food made` : 'Nowhere makes food',
      note: `Earth's tropics make about ${power(EARTH_TROPICS_FOOD_W_M2)}, counting sea and land.`,
    },
    { label: 'Longest food chain', value: foodChain(life.richest.levels), note: 'Each step up keeps about a tenth of the energy, less without oxygen.' },
    {
      label: 'Starlight pigments can use',
      value: `${Math.round(life.usableShare * 100)}%`,
      note: 'Share of the star’s light between 350 and 1100 nm, a generous window for light-driven chemistry. The Sun gives 70%.',
    },
  ];
  const { clock } = life;
  const clockTone = clock.ageGyr < clock.microbesAfterGyr ? 'warn' : undefined;
  rows.push({
    label: 'Time so far',
    value: `${significant(clock.ageGyr, 2)} billion years, ${clock.remainingGyr > 0 ? `${significant(clock.remainingGyr, 2)} billion left before the star changes` : 'and the star is already past its stable life'}`,
    note: `Earth had microbes within ${clock.microbesAfterGyr} billion years and big animals only after ${clock.animalsAfterGyr}. One planet is not a pattern.`,
    tone: clock.remainingGyr <= 0 ? 'warn' : clockTone,
  });
  if (life.leaks.mainGas) {
    rows.push({ label: 'Air check', value: `This planet can't hold on to ${life.gas.name.toLowerCase()} for billions of years`, tone: 'warn' });
  }
  if (life.leaks.oxygen) {
    rows.push({ label: 'Oxygen check', value: 'Oxygen would leak to space faster than life could replace it', tone: 'warn' });
  }
  return { title: name, rows };
}

function zoneSection(zone, life) {
  const solvent = life.solvent.name.toLowerCase();
  const rows = [
    { label: 'Average temperature', value: celsius(zone.temperatureK) },
    {
      label: 'Surface',
      value: STATE_TEXT[zone.state](solvent),
      note: zone.underIce ? `Liquid may survive under the ice, warmed from below.` : undefined,
      tone: zone.state === 'liquid' ? 'good' : 'warn',
    },
    { label: 'Light at the surface', value: `${power(zone.lightWm2)} (${significant(zone.lightWm2 / EARTH_SURFACE_LIGHT_W_M2, 2)} × Earth’s average)` },
    { label: 'Chemistry speed', value: pace(zone.pace) },
    { label: 'Food made', value: power(zone.foodWm2), note: zone.ventWm2 > 0 && zone.growthWm2 === 0 ? 'All of it from hot springs, none from light.' : undefined },
    { label: 'Food chain', value: foodChain(zone.levels) },
  ];
  return { title: `${zone.name} · ${Math.round(zone.area * 100)}% of the surface`, rows };
}

function planSection(life) {
  return {
    title: 'Body plans',
    wide: true,
    rows: life.plans.map((plan) => ({
      label: plan.name,
      value: plan.verdict[0].toUpperCase() + plan.verdict.slice(1),
      note: plan.where.length ? `${plan.reason} Where: ${plan.where.join(', ')}.` : plan.reason,
      tone: VERDICT_TONES[plan.verdict],
    })),
  };
}

function sensesSection(life) {
  const { senses } = life;
  const peak = Math.round(senses.peakNm);
  const rows = [
    {
      label: 'Eyes would tune to',
      value: `About ${peak.toLocaleString('en')} nm${peak > EYE_LIMIT_NM ? ', infrared to us' : ''}`,
      note: `Where this star’s light peaks. The Sun peaks near ${SUN_PEAK_NM} nm and human eyes are most sensitive at ${EARTH_EYES_NM}.`,
    },
    {
      label: 'Brightest place',
      value: `${significant(senses.brightestShare, 2)} × Earth’s average daylight`,
    },
  ];
  if (senses.darkZones.length) {
    rows.push({
      label: 'Too dark for eyes',
      value: senses.darkZones.join(', '),
      note: 'Life here would hunt by sound, touch, smell, heat or electric fields instead.',
      tone: 'warn',
    });
  }
  rows.push({
    label: 'Sound',
    value: `${Math.round(senses.soundMs).toLocaleString('en')} m/s, carrying ${significant(senses.soundCarry, 2)} × as well as Earth air`,
    note: 'Denser air carries sound further, so hearing and calls pay off more.',
  });
  rows.push({
    label: 'Light-catcher colour',
    value: senses.darkPigments ? 'Probably dark, close to black' : 'Hard to guess',
    note: senses.darkPigments
      ? 'Light this dim and red is too scarce to reflect any of it.'
      : 'Earth plants waste much of the green light they get, for reasons tied to their history rather than physics.',
  });
  return { title: 'Senses and looks', rows };
}

function hazardSection(world, life) {
  const rows = [];
  const { hazards } = life;
  if (world.spin.locked) {
    rows.push({ label: 'Day and night', value: 'None: one side always faces the star', note: 'Light-catchers on the day side never need to rest.' });
  } else if (hazards.longNights) {
    rows.push({ label: 'Nights', value: `${significant(world.spin.localDayDays / 2, 2)} Earth days long`, tone: 'warn' });
  }
  if (hazards.strongSeasons) {
    rows.push({ label: 'Seasons', value: 'Harsh', note: 'Tilt or orbit swings change the light a lot over the year.', tone: 'warn' });
  }
  if (hazards.flares) {
    rows.push({
      label: 'Flares',
      value: 'This cool star flares often',
      note: 'Bursts of UV and particles favour life that shelters under water, rock or thick air.',
      tone: 'warn',
    });
  }
  rows.push({ label: 'Planet’s own heat', value: life.heatFlowWm2 > 0 ? `${significant(life.heatFlowWm2 * 1000, 2)} mW/m²` : 'Not modelled for gas worlds', note: 'Earth 87 mW/m². It feeds hot-spring chemistry and keeps under-ice oceans liquid.' });
  rows.push({
    label: 'Size limits here',
    value: `Walkers ${mass(life.limits.walkerKg)}, fliers ${mass(life.limits.flierKg)}, tallest growth ${length(life.limits.treeM)}`,
    note: 'From gravity and air density alone, before food and oxygen are counted.',
  });
  return { title: 'Hazards and limits', rows };
}

export function reportSections(name, world, life) {
  return [
    glanceSection(name, world, life),
    ...life.zones.map((zone) => zoneSection(zone, life)),
    planSection(life),
    sensesSection(life),
    hazardSection(world, life),
  ];
}

export function plainText(sections) {
  return sections
    .map((section) =>
      [section.title, ...section.rows.map((row) => `${row.label}: ${row.value}${row.note ? ` (${row.note})` : ''}`)].join('\n'),
    )
    .join('\n\n');
}
