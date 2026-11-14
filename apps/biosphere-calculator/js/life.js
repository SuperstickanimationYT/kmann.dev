import { GASES } from './physics.js';

const SOLAR_CONSTANT_W_M2 = 1361;
const GAS_CONSTANT = 8.314;
const SECOND_RADIATION_CONSTANT_M_K = 1.4388e-2;
const WIEN_NM_K = 2.898e6;
const EARTH_SURFACE_LIGHT_W_M2 = 230;
const EARTH_AIR_KG_M3 = 1.225;

const LIGHT_LOST_PER_EARTH_AIR_COLUMN = 0.036;
const PIGMENT_WINDOW_NM = [350, 1100];
const LIGHT_TO_FOOD_EFFICIENCY = 0.0065;
const OPEN_WATER_NUTRIENT_SHARE = 0.3;
const DRY_LAND_GROWTH_SHARE = 0.4;
const HEAT_TRANSPORT_AT_ONE_BAR = 0.6;
const LOCKED_WORLD_EXTRA_TRANSPORT = 2.5;
const ZERO_TILT_POLE_TO_EQUATOR_CONTRAST = 0.625;

const ACTIVATION_ENERGY_J_PER_MOL = 50e3;
const CHEMISTRY_REFERENCE_K = 298;
const WATER_LIFE_COMFORT_LIMIT_K = 330;
const WATER_LIFE_HOTTEST_K = 395;
const GLACIAL_CHEMISTRY_PACE = 1e-6;
const SLOW_CHEMISTRY_PACE = 0.01;

const EARTH_HEAT_FLOW_W_M2 = 0.087;
const EARTH_AGE_GYR = 4.6;
const RADIOGENIC_FADE_GYR = 4;
const VENT_FOOD_SHARE_OF_HEAT = 0.001;

const THINNEST_TOP_PREDATOR_FOOD_W_M2 = 1e-4;
const AEROBIC_TRANSFER = 0.1;
const ANAEROBIC_TRANSFER = 0.02;
const OXYGEN_FOR_FULL_AEROBIC_BAR = 0.1;
const OXYGEN_FOR_LARGE_ANIMALS_BAR = 0.05;
const SMALL_ANIMAL_CEILING_KG = 0.01;

const EARTH_HEAVIEST_WALKER_KG = 8e4;
const EARTH_HEAVIEST_SWIMMER_KG = 1.9e5;
const EARTH_HEAVIEST_FLIER_KG = 200;
const LIGHTEST_EARTH_FLIER_KG = 2.5e-8;
const EARTH_TALLEST_TREE_M = 115;
const WALKER_MASS_GRAVITY_EXPONENT = -3;
const FLIER_MASS_GRAVITY_EXPONENT = -9;
const FLIER_MASS_AIR_EXPONENT = 3;

const BAG_SKIN_KG_PER_M2 = 0.05;
const BAG_PAYLOAD_KG = 1;
const HOT_BAG_WARMING_K = 20;
const LIFTING_GAS_MOLAR_MASS = 2;
const EASY_BAG_RADIUS_M = 0.3;
const WORKABLE_BAG_RADIUS_M = 1.5;

const STRONG_SEASON_TILT_DEG = 35;
const STRONG_SEASON_ECCENTRICITY = 0.15;
const LONG_NIGHT_EARTH_DAYS = 10;
const FLARE_STAR_BELOW_K = 3900;
const EARTH_MICROBES_AFTER_GYR = 0.7;
const EARTH_ANIMALS_AFTER_GYR = 4;
const DARK_PIGMENT_BELOW_K = 3800;
const DIM_FOR_EYES_EARTH_SHARE = 1e-4;
const LIKELY_LAND_GROWTH_W_M2 = 0.1;
const MINIMUM_GROWTH_W_M2 = 0.01;
const MINIMUM_SEA_GROWTH_W_M2 = 0.005;

export const SOLVENTS = {
  water: { name: 'Water', meltK: 273.15, boilK: 373.15, vaporisationJ: 40.7e3, criticalK: 647, tripleBar: 0.00612 },
  ammonia: { name: 'Ammonia', meltK: 195.4, boilK: 239.8, vaporisationJ: 23.35e3, criticalK: 405.5, tripleBar: 0.0606 },
  ethane: { name: 'Ethane', meltK: 90.4, boilK: 184.6, vaporisationJ: 14.7e3, criticalK: 305.3, tripleBar: 1.1e-5 },
  methane: { name: 'Methane', meltK: 90.7, boilK: 111.7, vaporisationJ: 8.19e3, criticalK: 190.6, tripleBar: 0.117 },
};

const GAS_FORMULAS = { h2: 'H₂', he: 'He', h2o: 'H₂O', n2: 'N₂', o2: 'O₂', co2: 'CO₂' };
const HEAT_CAPACITY_RATIO_BY_ATOMS = { 1: 5 / 3, 2: 1.4, 3: 1.3 };
const ATOMS_PER_MOLECULE = { h2: 2, he: 1, h2o: 3, n2: 2, o2: 2, co2: 3 };

export const GAS_CHOICES = Object.entries(GAS_FORMULAS).map(([id, formula]) => {
  const gas = GASES.find((candidate) => candidate.formula === formula);
  return { id, ...gas };
});

const LATITUDE_ZONES = [
  { id: 'tropics', name: 'Tropics', fromDeg: 0, toDeg: 30 },
  { id: 'temperate', name: 'Mid-latitudes', fromDeg: 30, toDeg: 60 },
  { id: 'polar', name: 'Polar regions', fromDeg: 60, toDeg: 90 },
];

const LOCKED_ZONES = [
  { id: 'day', name: 'Day side', area: 0.25, light: 3 },
  { id: 'twilight', name: 'Twilight ring', area: 0.5, light: 0.5 },
  { id: 'night', name: 'Night side', area: 0.25, light: 0 },
];

const CLOUD_ZONE = { id: 'clouds', name: 'Cloud layer', area: 1, light: 1 };

export function liquidRange(solvent, pressureBar) {
  if (pressureBar < solvent.tripleBar) return null;
  const boilK = Math.min(
    solvent.criticalK,
    1 / (1 / solvent.boilK - (GAS_CONSTANT / solvent.vaporisationJ) * Math.log(pressureBar)),
  );
  return boilK > solvent.meltK ? { meltK: solvent.meltK, boilK } : null;
}

function shareOfStarlightPigmentsCanUse(temperatureK) {
  const [fromNm, toNm] = PIGMENT_WINDOW_NM;
  const steps = 400;
  const widthM = ((toNm - fromNm) / steps) * 1e-9;
  let inWindow = 0;
  for (let step = 0; step < steps; step += 1) {
    const wavelengthM = (fromNm + (step + 0.5) * ((toNm - fromNm) / steps)) * 1e-9;
    inWindow += widthM / (wavelengthM ** 5 * Math.expm1(SECOND_RADIATION_CONSTANT_M_K / (wavelengthM * temperatureK)));
  }
  const total = (Math.PI ** 4 / 15) * (temperatureK / SECOND_RADIATION_CONSTANT_M_K) ** 4;
  return inWindow / total;
}

const legendre2 = (x) => (3 * x * x - 1) / 2;

function latitudeZones(tiltDeg) {
  const contrast = -ZERO_TILT_POLE_TO_EQUATOR_CONTRAST * legendre2(Math.cos((tiltDeg * Math.PI) / 180));
  return LATITUDE_ZONES.map((zone) => {
    const from = Math.sin((zone.fromDeg * Math.PI) / 180);
    const to = Math.sin((zone.toDeg * Math.PI) / 180);
    const meanLegendre2 = ((to ** 3 - from ** 3) / 2 - (to - from) / 2) / (to - from);
    return { ...zone, area: to - from, light: 1 + contrast * meanLegendre2 };
  });
}

function zonesOf(world) {
  if (world.planet.kind !== 'rocky') return [CLOUD_ZONE];
  return world.spin.locked ? LOCKED_ZONES : latitudeZones(world.planet.tiltDeg);
}

function chemistryPace(temperatureK) {
  const pace = Math.exp(-(ACTIVATION_ENERGY_J_PER_MOL / GAS_CONSTANT) * (1 / temperatureK - 1 / CHEMISTRY_REFERENCE_K));
  return Math.min(1, pace);
}

function heatDamage(temperatureK, solventId) {
  if (solventId !== 'water' || temperatureK <= WATER_LIFE_COMFORT_LIMIT_K) return 1;
  return Math.max(0, (WATER_LIFE_HOTTEST_K - temperatureK) / (WATER_LIFE_HOTTEST_K - WATER_LIFE_COMFORT_LIMIT_K));
}

function zoneTemperatureK(zone, world, pressureBar) {
  if (world.planet.kind !== 'rocky') return world.climate.surfaceK;
  const lockedBoost = world.spin.locked ? LOCKED_WORLD_EXTRA_TRANSPORT : 1;
  const transport = HEAT_TRANSPORT_AT_ONE_BAR * lockedBoost * Math.sqrt(pressureBar);
  return world.climate.equilibriumK * ((transport + zone.light) / (1 + transport)) ** 0.25 + world.planet.greenhouseK;
}

function liquidState(temperatureK, range) {
  if (!range) return 'none';
  if (temperatureK < range.meltK) return 'frozen';
  if (temperatureK > range.boilK) return 'boiling';
  return 'liquid';
}

function pickSolvent(world, pressureBar) {
  const zones = zonesOf(world);
  let best = 'water';
  let bestArea = 0;
  for (const [id, solvent] of Object.entries(SOLVENTS)) {
    const range = liquidRange(solvent, pressureBar);
    const area = zones
      .filter((zone) => liquidState(zoneTemperatureK(zone, world, pressureBar), range) === 'liquid')
      .reduce((sum, zone) => sum + zone.area, 0);
    if (area > bestArea) {
      best = id;
      bestArea = area;
    }
  }
  return best;
}

function foodChainLevels(foodWm2, transfer) {
  if (foodWm2 <= 0) return 0;
  if (foodWm2 < THINNEST_TOP_PREDATOR_FOOD_W_M2) return 1;
  return 1 + Math.floor(Math.log(foodWm2 / THINNEST_TOP_PREDATOR_FOOD_W_M2) / Math.log(1 / transfer));
}

function airDensityKgM3(pressureBar, molarMassGrams, temperatureK) {
  return (pressureBar * 1e5 * molarMassGrams * 1e-3) / (GAS_CONSTANT * temperatureK);
}

function bagRadiusToLiftM(airKgM3, temperatureK, airMolarMass) {
  const hydrogenBag = airKgM3 * (1 - LIFTING_GAS_MOLAR_MASS / airMolarMass);
  const warmBag = airKgM3 * (HOT_BAG_WARMING_K / (temperatureK + HOT_BAG_WARMING_K));
  const liftKgM3 = Math.max(hydrogenBag, warmBag);
  if (liftKgM3 <= 0) return Infinity;
  let radius = 0.01;
  while (radius < 1e4) {
    const lift = (4 / 3) * Math.PI * radius ** 3 * liftKgM3;
    if (lift >= BAG_PAYLOAD_KG + BAG_SKIN_KG_PER_M2 * 4 * Math.PI * radius ** 2) return radius;
    radius *= 1.02;
  }
  return Infinity;
}

function assessZone(zone, context) {
  const { world, life, solventId, range, usableShare, ventFoodWm2 } = context;
  const rocky = world.planet.kind === 'rocky';
  const temperatureK = zoneTemperatureK(zone, world, life.pressureBar);
  const state = liquidState(temperatureK, range);
  const transmission = Math.exp((-LIGHT_LOST_PER_EARTH_AIR_COLUMN * life.pressureBar) / world.planet.gravityG);
  const lightWm2 =
    (SOLAR_CONSTANT_W_M2 / 4) * world.climate.starlightEarth * zone.light * (1 - world.planet.albedo) * transmission;
  const pace = chemistryPace(temperatureK) * heatDamage(temperatureK, solventId);
  const ocean = rocky ? life.oceanPercent / 100 : 0;
  const potentialWm2 = state === 'liquid' ? lightWm2 * usableShare * LIGHT_TO_FOOD_EFFICIENCY * pace : 0;
  const seaGrowthWm2 = potentialWm2 * OPEN_WATER_NUTRIENT_SHARE;
  const landGrowthWm2 = rocky ? potentialWm2 * (DRY_LAND_GROWTH_SHARE + (1 - DRY_LAND_GROWTH_SHARE) * ocean) : 0;
  const growthWm2 = rocky ? ocean * seaGrowthWm2 + (1 - ocean) * landGrowthWm2 : seaGrowthWm2;
  const underIce = rocky && state === 'frozen';
  const ventWm2 = rocky && (underIce || (state === 'liquid' && ocean > 0)) ? ventFoodWm2 * (underIce ? 1 : ocean) : 0;
  const foodWm2 = growthWm2 + ventWm2;
  const airKgM3 = airDensityKgM3(life.pressureBar, context.gas.mass, temperatureK);
  return {
    ...zone,
    temperatureK,
    state,
    underIce,
    lightWm2,
    pace,
    growthWm2,
    landGrowthWm2,
    seaGrowthWm2,
    ventWm2,
    foodWm2,
    levels: foodChainLevels(foodWm2, context.transfer),
    airKgM3,
  };
}

function bodyLimits(zone, world, gas) {
  const gravity = world.planet.gravityG;
  const airShare = zone.airKgM3 / EARTH_AIR_KG_M3;
  return {
    walkerKg: EARTH_HEAVIEST_WALKER_KG * gravity ** WALKER_MASS_GRAVITY_EXPONENT,
    swimmerKg: EARTH_HEAVIEST_SWIMMER_KG,
    flierKg: Math.min(
      EARTH_HEAVIEST_WALKER_KG * gravity ** WALKER_MASS_GRAVITY_EXPONENT,
      EARTH_HEAVIEST_FLIER_KG * gravity ** FLIER_MASS_GRAVITY_EXPONENT * airShare ** FLIER_MASS_AIR_EXPONENT,
    ),
    treeM: EARTH_TALLEST_TREE_M / gravity,
    bagRadiusM: bagRadiusToLiftM(zone.airKgM3, zone.temperatureK, gas.mass),
    earthBagRadiusM: bagRadiusToLiftM(EARTH_AIR_KG_M3, 288, 29),
  };
}

const names = (zones) => zones.map((zone) => zone.name);

function verdictByThresholds(value, likelyFrom, possibleFrom) {
  if (value >= likelyFrom) return 'likely';
  if (value >= possibleFrom) return 'possible';
  return 'unlikely';
}

function planCells({ zones, solvent }) {
  const wet = zones.filter((zone) => zone.state === 'liquid' || zone.underIce);
  if (!wet.length) {
    return { verdict: 'ruled out', reason: `No liquid ${solvent.name.toLowerCase()} anywhere at this pressure and temperature, on the surface or under ice.` };
  }
  const fastest = Math.max(...wet.map((zone) => zone.pace));
  if (fastest < GLACIAL_CHEMISTRY_PACE) {
    return {
      verdict: 'unlikely',
      where: names(wet),
      reason: `Liquid exists, but at these temperatures chemistry like Earth's runs about ${orderOfMagnitude(1 / fastest)} times slower. Life would need reactions that need far less energy to get going.`,
    };
  }
  return { verdict: 'likely', where: names(wet), reason: 'Liquid, an energy source and time are all life on Earth needed to start.' };
}

function planRootedLightCatchers({ zones, world, life, limits }) {
  if (world.planet.kind !== 'rocky') return { verdict: 'ruled out', reason: 'No solid surface to root in.' };
  if (life.oceanPercent >= 100) return { verdict: 'ruled out', reason: 'No land: the whole surface is ocean.' };
  const growing = zones.filter((zone) => zone.landGrowthWm2 >= MINIMUM_GROWTH_W_M2);
  if (!growing.length) return { verdict: 'unlikely', reason: 'No land zone gets enough usable light with liquid around to grow on.' };
  const best = Math.max(...growing.map((zone) => zone.landGrowthWm2));
  return {
    verdict: verdictByThresholds(best, LIKELY_LAND_GROWTH_W_M2, MINIMUM_GROWTH_W_M2),
    where: names(growing),
    reason: `The tallest could reach about ${length(limits.treeM)} (Earth's tallest tree: ${EARTH_TALLEST_TREE_M} m). Lifting fluid and staying upright both get harder as gravity rises.`,
  };
}

function planDriftingLightCatchers({ zones, world, life }) {
  const hasSea = world.planet.kind !== 'rocky' || life.oceanPercent > 0;
  if (!hasSea) return { verdict: 'ruled out', reason: 'No open liquid to drift in.' };
  const growing = zones.filter((zone) => zone.seaGrowthWm2 >= MINIMUM_SEA_GROWTH_W_M2);
  if (!growing.length) return { verdict: 'unlikely', reason: 'Too little usable light reaches liquid anywhere.' };
  return {
    verdict: 'likely',
    where: names(growing),
    reason: 'Tiny floating light-catchers need no structure at all, which is why they came first on Earth and still make half its food.',
  };
}

function bagReason(limits, purpose) {
  return `A gas bag ${length(limits.bagRadiusM * 2)} across ${purpose} 1 kg here (on Earth it takes ${length(limits.earthBagRadiusM * 2)}). Nothing on Earth lives this way, so even a good score is a bet evolution might never take.`;
}

function planFloatingCanopies({ zones, world, limits }) {
  const lit = zones.filter((zone) => zone.state === 'liquid' && zone.lightWm2 > 0);
  if (!lit.length) return { verdict: 'ruled out', reason: 'No lit zone with liquid to grow in.' };
  const noGround = world.planet.kind !== 'rocky';
  const verdict = verdictByThresholds(1 / limits.bagRadiusM, 1 / EASY_BAG_RADIUS_M, 1 / WORKABLE_BAG_RADIUS_M);
  return {
    verdict: noGround && verdict === 'unlikely' ? 'possible' : verdict,
    where: names(lit),
    reason: `${bagReason(limits, 'holds up')}${noGround ? ' With no ground to stand on, staying aloft is the only way to stay in the light.' : ''}`,
  };
}

function oxygenLimitedKg(physicalKg, oxygenBar) {
  return oxygenBar >= OXYGEN_FOR_LARGE_ANIMALS_BAR ? physicalKg : Math.min(physicalKg, SMALL_ANIMAL_CEILING_KG);
}

function animalReason(base, oxygenBar) {
  return oxygenBar >= OXYGEN_FOR_LARGE_ANIMALS_BAR
    ? base
    : `${base} Without much oxygen or another strong oxidiser, burning food yields far less energy, so active animals likely stay tiny.`;
}

function feedingZones(zones, minimumPace = SLOW_CHEMISTRY_PACE) {
  return zones.filter((zone) => zone.levels >= 3 && zone.pace >= minimumPace);
}

function planWalkers({ zones, world, life, limits }) {
  if (world.planet.kind !== 'rocky') return { verdict: 'ruled out', reason: 'No solid surface to walk on.' };
  if (life.oceanPercent >= 100) return { verdict: 'ruled out', reason: 'No land.' };
  const fed = feedingZones(zones.filter((zone) => zone.landGrowthWm2 > 0));
  if (!fed.length) return { verdict: 'unlikely', reason: 'No land zone has enough food for grazers and something that hunts them.' };
  const heaviest = oxygenLimitedKg(limits.walkerKg, life.oxygenBar);
  return {
    verdict: life.oxygenBar >= OXYGEN_FOR_LARGE_ANIMALS_BAR ? 'likely' : 'possible',
    where: names(fed),
    reason: animalReason(
      `Heaviest about ${mass(heaviest)} (Earth's: ~80 t sauropods). Bones carry weight that grows faster than their strength, so the limit falls with gravity cubed. Legs are only one answer: rolling, sliding and pulling bodies face the same limit.`,
      life.oxygenBar,
    ),
  };
}

function planSwimmers({ zones, world, life, limits }) {
  if (world.planet.kind !== 'rocky' || life.oceanPercent <= 0) return { verdict: 'ruled out', reason: 'No ocean.' };
  const fed = feedingZones(zones.filter((zone) => zone.seaGrowthWm2 > 0 || zone.underIce));
  if (!fed.length) return { verdict: 'unlikely', reason: 'The seas are too poorly fed for hunters.' };
  const heaviest = oxygenLimitedKg(limits.swimmerKg, life.oxygenBar);
  return {
    verdict: life.oxygenBar >= OXYGEN_FOR_LARGE_ANIMALS_BAR ? 'likely' : 'possible',
    where: names(fed),
    reason: animalReason(
      `Water carries the weight, so gravity sets no size limit; food does. Earth's biggest swimmer is about ${mass(heaviest)}.`,
      life.oxygenBar,
    ),
  };
}

function planFliers({ zones, life, limits }) {
  const fed = feedingZones(zones.filter((zone) => zone.state === 'liquid'));
  if (!fed.length) return { verdict: 'unlikely', reason: 'Not enough food anywhere to pay for flight.' };
  if (limits.flierKg < LIGHTEST_EARTH_FLIER_KG) {
    return { verdict: 'ruled out', reason: 'Air too thin and gravity too strong for even the tiniest wing to work.' };
  }
  const heaviest = oxygenLimitedKg(limits.flierKg, life.oxygenBar);
  return {
    verdict: verdictByThresholds(heaviest, 0.01, LIGHTEST_EARTH_FLIER_KG),
    where: names(fed),
    reason: animalReason(
      `Heaviest about ${mass(heaviest)} (Earth's: ~200 kg pterosaurs). The power needed to fly rises with gravity to the 9th power and falls with air density cubed.`,
      life.oxygenBar,
    ),
  };
}

function planGasBagAnimals({ zones, limits, life }) {
  const fed = feedingZones(zones.filter((zone) => zone.state === 'liquid'));
  if (!fed.length) return { verdict: 'unlikely', reason: 'Not enough food anywhere for drifting hunters or grazers.' };
  return {
    verdict: verdictByThresholds(1 / limits.bagRadiusM, 1 / EASY_BAG_RADIUS_M, 1 / WORKABLE_BAG_RADIUS_M),
    where: names(fed),
    reason: animalReason(bagReason(limits, 'lifts'), life.oxygenBar),
  };
}

function planBurrowers({ zones, world, hazards }) {
  if (world.planet.kind !== 'rocky') return { verdict: 'ruled out', reason: 'No solid ground to dig into.' };
  const wet = zones.filter((zone) => zone.state === 'liquid' || zone.underIce);
  if (!wet.length) return { verdict: 'unlikely', reason: 'No liquid even below the surface in this model.' };
  return {
    verdict: 'likely',
    where: names(wet),
    reason: hazards.flares
      ? 'Rock blocks the flares and UV from this star, and evens out temperature swings. Expect much of life to live in or under the ground.'
      : 'Rock blocks UV and evens out temperature swings. Earth has more microbes underground than in its oceans.',
  };
}

function planUnderIce({ zones, heatFlowWm2 }) {
  const iced = zones.filter((zone) => zone.underIce);
  if (!iced.length) return { verdict: 'ruled out', reason: 'Nowhere is cold enough to freeze over a liquid layer.' };
  return {
    verdict: 'possible',
    where: names(iced),
    reason: `Ice traps the planet's own heat (${significant(heatFlowWm2 * 1000)} mW/m², Earth 87) to keep liquid below. With no light, food comes from chemistry at hot springs: enough for microbes and maybe grazers, rarely for big hunters.`,
  };
}

function planSleepers({ world, hazards }) {
  const triggers = [];
  if (hazards.strongSeasons) triggers.push('harsh seasons');
  if (hazards.longNights) triggers.push(`nights ${significant(world.spin.localDayDays / 2, 2)} Earth days long`);
  if (!triggers.length) return { verdict: 'possible', reason: 'Seasons and nights are mild, so shutting down to wait them out pays off only in the coldest places.' };
  return { verdict: 'likely', reason: `With ${triggers.join(' and ')}, shutting down to wait out the bad stretch, or migrating, beats staying active.` };
}

function planTwilightDwellers({ zones, world }) {
  if (!world.spin.locked) return null;
  const twilight = zones.find((zone) => zone.id === 'twilight');
  if (twilight.state !== 'liquid') return { verdict: 'unlikely', reason: 'Even the twilight ring is outside the liquid range.' };
  return {
    verdict: 'likely',
    where: [twilight.name],
    reason: 'The star never moves in the sky, so the ring between scorching and frozen stays put. Life can settle there for good, with weather blowing in from both sides.',
  };
}

const canHostLife = (zone) => (zone.state === 'liquid' || zone.underIce) && zone.pace >= GLACIAL_CHEMISTRY_PACE;

const NOTHING_STARTS = { verdict: 'ruled out', reason: 'Nothing bigger can evolve where single cells cannot start.' };

const PLANS = [
  { id: 'cells', name: 'Single cells and mats', assess: planCells },
  { id: 'rooted', name: 'Rooted light-catchers', assess: planRootedLightCatchers },
  { id: 'drifting', name: 'Drifting light-catchers', assess: planDriftingLightCatchers },
  { id: 'canopy', name: 'Floating gas-bag light-catchers', assess: planFloatingCanopies },
  { id: 'walkers', name: 'Ground movers', assess: planWalkers },
  { id: 'swimmers', name: 'Swimmers', assess: planSwimmers },
  { id: 'fliers', name: 'Winged fliers', assess: planFliers },
  { id: 'bags', name: 'Gas-bag drifting animals', assess: planGasBagAnimals },
  { id: 'burrowers', name: 'Burrowers and rock-dwellers', assess: planBurrowers },
  { id: 'underIce', name: 'Under-ice ocean life', assess: planUnderIce },
  { id: 'twilight', name: 'Twilight-ring settlers', assess: planTwilightDwellers },
  { id: 'sleepers', name: 'Sleepers and migrants', assess: planSleepers },
];

function hazardsOf(world) {
  return {
    flares: world.star.temperatureK < FLARE_STAR_BELOW_K,
    strongSeasons:
      !world.spin.locked &&
      (world.planet.tiltDeg >= STRONG_SEASON_TILT_DEG || world.orbit.eccentricity >= STRONG_SEASON_ECCENTRICITY),
    longNights: !world.spin.locked && world.spin.localDayDays >= LONG_NIGHT_EARTH_DAYS,
  };
}

function sensesOf(world, zones, gas, life) {
  const lit = zones.reduce((best, zone) => (zone.lightWm2 > best.lightWm2 ? zone : best));
  const dark = zones.filter((zone) => zone.lightWm2 / EARTH_SURFACE_LIGHT_W_M2 < DIM_FOR_EYES_EARTH_SHARE);
  const atoms = ATOMS_PER_MOLECULE[gas.id];
  const meanK = zones.reduce((sum, zone) => sum + zone.temperatureK * zone.area, 0);
  return {
    peakNm: WIEN_NM_K / world.star.temperatureK,
    brightestShare: lit.lightWm2 / EARTH_SURFACE_LIGHT_W_M2,
    darkZones: names(dark),
    soundMs: Math.sqrt((HEAT_CAPACITY_RATIO_BY_ATOMS[atoms] * GAS_CONSTANT * meanK) / (gas.mass * 1e-3)),
    soundCarry: airDensityKgM3(life.pressureBar, gas.mass, meanK) / EARTH_AIR_KG_M3,
    darkPigments: world.star.temperatureK < DARK_PIGMENT_BELOW_K,
  };
}

function heatFlowOf(world) {
  return (
    EARTH_HEAT_FLOW_W_M2 *
    (world.planet.massEarth / world.planet.radiusEarth ** 2) *
    Math.exp(-(world.star.ageGyr - EARTH_AGE_GYR) / RADIOGENIC_FADE_GYR)
  );
}

export function assessLife(world, life) {
  const gas = GAS_CHOICES.find((choice) => choice.id === life.mainGas) ?? GAS_CHOICES.find((choice) => choice.id === 'n2');
  const oxygenBar = Math.min(life.oxygenBar, life.pressureBar);
  const settled = { ...life, oxygenBar };
  const solventId = life.solvent in SOLVENTS ? life.solvent : pickSolvent(world, life.pressureBar);
  const solvent = SOLVENTS[solventId];
  const range = liquidRange(solvent, life.pressureBar);
  const heatFlowWm2 = world.planet.kind === 'rocky' ? heatFlowOf(world) : 0;
  const transfer = ANAEROBIC_TRANSFER + (AEROBIC_TRANSFER - ANAEROBIC_TRANSFER) * Math.min(1, oxygenBar / OXYGEN_FOR_FULL_AEROBIC_BAR);
  const context = {
    world,
    life: settled,
    gas,
    solventId,
    range,
    transfer,
    usableShare: shareOfStarlightPigmentsCanUse(world.star.temperatureK),
    ventFoodWm2: heatFlowWm2 * VENT_FOOD_SHARE_OF_HEAT,
  };
  const zones = zonesOf(world).map((zone) => assessZone(zone, context));
  const richest = zones.reduce((best, zone) => (zone.foodWm2 > best.foodWm2 ? zone : best));
  const limits = bodyLimits(richest, world, gas);
  const hazards = hazardsOf(world);
  const planContext = { zones, world, life: settled, solvent, limits, hazards, heatFlowWm2 };
  const lifeCanStart = zones.some(canHostLife);
  const plans = PLANS.map((plan) => {
    const result = plan.id === 'cells' || lifeCanStart ? plan.assess(planContext) : NOTHING_STARTS;
    return result && { id: plan.id, name: plan.name, where: [], ...result };
  }).filter(Boolean);
  const heldGases = new Set(world.climate.gases.filter((candidate) => candidate.held).map((candidate) => candidate.formula));
  return {
    gas,
    solvent,
    solventId,
    autoSolvent: !(life.solvent in SOLVENTS),
    range,
    transfer,
    usableShare: context.usableShare,
    heatFlowWm2,
    zones,
    richest,
    limits,
    hazards,
    plans,
    senses: sensesOf(world, zones, gas, settled),
    leaks: {
      mainGas: !heldGases.has(gas.formula),
      oxygen: oxygenBar > 0 && !heldGases.has('O₂'),
    },
    clock: {
      ageGyr: world.star.ageGyr,
      microbesAfterGyr: EARTH_MICROBES_AFTER_GYR,
      animalsAfterGyr: EARTH_ANIMALS_AFTER_GYR,
      remainingGyr: world.star.lifetimeGyr - world.star.ageGyr,
    },
  };
}

export function significant(value, digits = 3) {
  if (!Number.isFinite(value)) return '∞';
  if (value === 0) return '0';
  return Number(value.toPrecision(digits)).toLocaleString('en', { maximumFractionDigits: 12 });
}

export function orderOfMagnitude(value) {
  const exponent = Math.round(Math.log10(value));
  return exponent < 4 ? significant(value, 1) : `10${superscript(exponent)}`;
}

function superscript(number) {
  const digits = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  return String(number)
    .split('')
    .map((digit) => digits[Number(digit)])
    .join('');
}

export function mass(kg) {
  if (!Number.isFinite(kg)) return 'no limit';
  if (kg >= 1000) return `${significant(kg / 1000, 2)} t`;
  if (kg >= 1) return `${significant(kg, 2)} kg`;
  if (kg >= 1e-3) return `${significant(kg * 1000, 2)} g`;
  return `${significant(kg * 1e6, 2)} mg`;
}

export function length(metres) {
  if (!Number.isFinite(metres)) return 'more than 10 km';
  if (metres >= 1000) return `${significant(metres / 1000, 2)} km`;
  if (metres >= 1) return `${significant(metres, 2)} m`;
  return `${significant(metres * 100, 2)} cm`;
}
