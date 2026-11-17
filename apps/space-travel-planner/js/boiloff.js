export const BOILOFF_SOURCES = {
  upperStage: 'Centaur system boil-off "slightly under 2% of propellant per day" (De Kruif and Kutter, AIAA 2007-5845)',
  improvedUpperStage: 'Same paper: thermal upgrades bring Centaur to about 1% per day',
  sunshade: '34-layer MLI on a liquid hydrogen tank with a 152 °R (84 K) warm boundary lost 0.2% per day (Stochl and Knoll, NASA TM 104476, 1991)',
  physics: 'Other propellants and tank sizes scale with heat leak per kilogram: tank area over mass, and heat of vaporization',
  sunlight: 'Assumed: three quarters of the heat leak at 1 au comes from sunlight, falling with the square of distance; the rest is the spacecraft\'s own heat',
};

const DENSITY = { hydrogen: 70.85, oxygen: 1141 };
const HEAT_OF_VAPORIZATION = { hydrogen: 445.6, oxygen: 213.1 };
const REFERENCE_HYDROGEN = 20830 / 6.5;
const REFERENCE_OXYGEN = 20830 - REFERENCE_HYDROGEN;
const SUNLIGHT_SHARE_AT_ONE_AU = 0.75;

export function oxygenOverHydrogenLoss(oxygenMass, hydrogenMass) {
  const sameMassRatio = (DENSITY.hydrogen / DENSITY.oxygen) ** (2 / 3) * (HEAT_OF_VAPORIZATION.hydrogen / HEAT_OF_VAPORIZATION.oxygen);
  return sameMassRatio * (hydrogenMass / oxygenMass) ** (1 / 3);
}

function hydrogenRateFromSystemRate(systemRate) {
  const oxygenShare = oxygenOverHydrogenLoss(REFERENCE_OXYGEN, REFERENCE_HYDROGEN);
  return (systemRate * (REFERENCE_HYDROGEN + REFERENCE_OXYGEN)) / (REFERENCE_HYDROGEN + oxygenShare * REFERENCE_OXYGEN);
}

export const INSULATION = {
  upperStage: { name: 'Upper-stage foam (Centaur today)', referenceHydrogenRate: hydrogenRateFromSystemRate(0.02) },
  improvedUpperStage: { name: 'Improved upper stage', referenceHydrogenRate: hydrogenRateFromSystemRate(0.01) },
  sunshade: { name: 'Multi-layer insulation behind a sunshade', referenceHydrogenRate: 0.002 },
};

export const boilsOff = (component) => component in DENSITY;

export function dailyLossFraction(component, mass, insulation, sunDistanceAu) {
  if (!boilsOff(component) || mass <= 0) return 0;
  const hydrogenRate = INSULATION[insulation].referenceHydrogenRate * (REFERENCE_HYDROGEN / mass) ** (1 / 3);
  const componentRate = component === 'hydrogen' ? hydrogenRate : hydrogenRate * oxygenOverHydrogenLoss(mass, mass);
  const sunlight = SUNLIGHT_SHARE_AT_ONE_AU / sunDistanceAu ** 2 + (1 - SUNLIGHT_SHARE_AT_ONE_AU);
  return componentRate * sunlight;
}

export function massAfterCruise(component, mass, insulation, distanceSamples, daysPerSample) {
  let remaining = mass;
  for (const distance of distanceSamples) {
    remaining *= Math.exp(-dailyLossFraction(component, remaining, insulation, distance) * daysPerSample);
  }
  return remaining;
}
