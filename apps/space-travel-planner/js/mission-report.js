import { PLANET_LOOKS } from './planets.js';

const kg = (value) => `${Math.round(value).toLocaleString('en')} kg`;
const kmPerS = (value) => `${value.toFixed(2)} km/s`;
const COMPONENT_NAMES = { hydrogen: 'hydrogen', oxygen: 'oxygen' };
const HEAVY_BOILOFF_SHARE = 0.5;

function explainBoiloff(mission) {
  const heavy = mission.events
    .filter((event) => event.kind === 'cruise')
    .flatMap((event) => event.losses)
    .filter((loss) => loss.before > 0 && loss.lost / loss.before > HEAVY_BOILOFF_SHARE);
  if (!heavy.length) return null;
  const names = [...new Set(heavy.map((loss) => COMPONENT_NAMES[loss.component]))].join(' and ');
  return `Most of the ${names} boiled away during the cruise. Better insulation, such as the sunshade, or a storable propellant that doesn't boil, keeps it for the burns.`;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function headline(mission, transfer) {
  const target = PLANET_LOOKS[transfer.to].name;
  if (mission.ok) {
    return `Mission works. Reaches ${target} with ${kg(mission.arrivedMass)} and ${kmPerS(mission.spareDeltaV)} to spare.`;
  }
  if (mission.failure.kind === 'tooHeavy') {
    return `Too heavy to launch. The stack weighs ${kg(mission.failure.stackMass)}, but ${mission.failure.launcher} can send at most ${kg(mission.failure.capacity)} out of Earth's gravity.`;
  }
  return `The ${mission.failure.label.toLowerCase()} falls ${kmPerS(mission.failure.missing)} short.`;
}

function explainShortfall(failure) {
  if (failure.kind !== 'shortfall') return null;
  if (!failure.neededMassRatio) return `Nothing is left to fire: every stage was used up before the ${failure.label.toLowerCase()}. Add a stage that fires here.`;
  const ratio = failure.neededMassRatio;
  return `That burn needs ${kmPerS(failure.deltaV)}. With an engine at ${failure.isp} s, one stage would have to be ${(ratio - 1).toFixed(1)} kg of propellant for every kilogram of everything else (a mass ratio of ${ratio.toFixed(1)}). Each extra km/s multiplies that ratio again, which is why distant targets get so hard with chemical rockets.`;
}

function stepText(event, transfer) {
  const fromName = PLANET_LOOKS[transfer.from].name;
  if (event.kind === 'launch') {
    if (event.c3 === null) return `${event.launcher} can't lift the ${kg(event.stackMass)} stack.`;
    return `${event.launcher} sends the ${kg(event.stackMass)} stack off at C3 ${event.c3.toFixed(1)} km²/s².`;
  }
  if (event.kind === 'start') return `Starts in a ${Math.round(event.orbitAltitude).toLocaleString('en')} km orbit around ${fromName}, weighing ${kg(event.stackMass)}.`;
  if (event.kind === 'burn') return `${event.label}: ${kmPerS(event.deltaV)}, ${kg(event.startMass)} down to ${kg(event.endMass)}.`;
  if (event.kind === 'cruise') {
    const days = Math.round(event.days).toLocaleString('en');
    if (!event.losses.length) return `Cruise for ${days} days. Nothing on board boils off.`;
    const lost = event.losses.map((loss) => `${kg(loss.lost)} of ${COMPONENT_NAMES[loss.component]} (${Math.round((100 * loss.lost) / loss.before)}%)`);
    return `Cruise for ${days} days. Boils off ${lost.join(' and ')}.`;
  }
  if (event.kind === 'flyby') {
    const height = Math.round(event.periapsisAltitude).toLocaleString('en');
    const burn = event.deltaV > 0.0005 ? `, plus a ${kmPerS(event.deltaV)} burn at closest approach` : ' with no burn needed';
    return `Swings past ${PLANET_LOOKS[event.planet].name} ${height} km above it${burn}.`;
  }
  return event.goal === 'orbit' ? `In orbit around ${PLANET_LOOKS[transfer.to].name} with ${kg(event.mass)}.` : `Flies past ${PLANET_LOOKS[transfer.to].name} with ${kg(event.mass)}.`;
}

export function renderReport(container, verdict, mission, transfer) {
  const title = headline(mission, transfer);
  verdict.textContent = title;
  verdict.hidden = false;
  verdict.classList.toggle('stp-verdict-ok', mission.ok);

  const heading = element('p', title, mission.ok ? 'stp-report-ok' : 'stp-report-fail');
  const steps = element('ol', null, 'stp-steps');
  for (const event of mission.events) {
    const item = element('li', stepText(event, transfer));
    if (event.kind === 'burn' && event.parts.length) {
      const parts = element('ul');
      for (const part of event.parts) {
        const minutes = part.seconds >= 120 ? `${Math.round(part.seconds / 60)} min` : `${Math.round(part.seconds)} s`;
        parts.append(element('li', `${part.stage}: ${kg(part.propellant)} of propellant for ${kmPerS(part.deltaV)}, firing ${minutes}`));
      }
      item.append(parts);
    }
    steps.append(item);
  }
  const notes = element('ul', null, 'stp-notes');
  const explanation = explainShortfall(mission.failure ?? {});
  for (const text of [explainBoiloff(mission), explanation, ...mission.warnings].filter(Boolean)) notes.append(element('li', text));
  container.replaceChildren(heading, steps, notes);
}
