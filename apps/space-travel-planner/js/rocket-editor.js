import { ENGINES, PROPELLANTS, SOLID_MOTORS } from './parts.js';
import { INSULATION } from './boiloff.js';

const NEW_STAGE = {
  liquid: () => ({ kind: 'liquid', engine: 'aj10', engines: 1, propellant: 1000, insulation: 'sunshade' }),
  solid: () => ({ kind: 'solid', motor: 'star48bv' }),
};
const MAX_ENGINES = 6;

function field(labelText, control) {
  const label = document.createElement('label');
  label.className = 'stp-field';
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function select(name, options, value) {
  const control = document.createElement('select');
  control.name = name;
  control.append(...Object.entries(options).map(([key, option]) => new Option(option.name, key)));
  control.value = value;
  return control;
}

function numberInput(name, value, { min, max, step }) {
  const control = document.createElement('input');
  Object.assign(control, { type: 'number', name, value, min, max, step, required: true });
  return control;
}

function button(text, action, label) {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = text;
  control.dataset.action = action;
  control.setAttribute('aria-label', label);
  return control;
}

export function summarizeStage(stage) {
  if (stage.kind === 'solid') return `${SOLID_MOTORS[stage.motor].name} solid motor`;
  const engine = ENGINES[stage.engine];
  return `${stage.engines > 1 ? `${stage.engines}× ` : ''}${engine.name}, ${Math.round(stage.propellant).toLocaleString('en')} kg propellant`;
}

export function createRocketEditor(list, addButtons, onChange) {
  let stages = [];

  function stageFields(stage) {
    if (stage.kind === 'solid') return [field('Motor', select('motor', SOLID_MOTORS, stage.motor))];
    const fields = [
      field('Engine', select('engine', ENGINES, stage.engine)),
      field('Engines', numberInput('engines', stage.engines, { min: 1, max: MAX_ENGINES, step: 1 })),
      field('Propellant (kg)', numberInput('propellant', stage.propellant, { min: 1, max: 500000, step: 1 })),
    ];
    if (ENGINES[stage.engine].propellant === 'hydrolox') fields.push(field('Insulation', select('insulation', INSULATION, stage.insulation)));
    return fields;
  }

  function render() {
    list.replaceChildren(
      ...stages.map((stage, index) => {
        const item = document.createElement('li');
        item.className = 'stp-stage';
        item.dataset.index = index;
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = summarizeStage(stage);
        const body = document.createElement('div');
        body.className = 'stp-stage-body';
        const tools = document.createElement('div');
        tools.className = 'stp-stage-tools';
        tools.append(button('↑', 'up', 'Fire earlier'), button('↓', 'down', 'Fire later'), button('Remove', 'remove', 'Remove stage'));
        if (stage.kind === 'liquid') {
          const propellant = document.createElement('p');
          propellant.className = 'stp-hint';
          propellant.textContent = PROPELLANTS[ENGINES[stage.engine].propellant].name;
          body.append(...stageFields(stage), propellant, tools);
        } else {
          body.append(...stageFields(stage), tools);
        }
        details.append(summary, body);
        item.append(details);
        return item;
      }),
    );
  }

  function changed({ rerender }) {
    if (rerender) {
      const open = [...list.querySelectorAll('details')].map((details) => details.open);
      render();
      list.querySelectorAll('details').forEach((details, index) => {
        details.open = open[index] ?? false;
      });
    }
    onChange(stages);
  }

  list.addEventListener('input', (event) => {
    const item = event.target.closest('[data-index]');
    if (!item) return;
    const stage = stages[Number(item.dataset.index)];
    const { name, value } = event.target;
    const numeric = name === 'engines' || name === 'propellant';
    if (numeric && !(Number(value) > 0)) return;
    stage[name] = numeric ? Number(value) : value;
    item.querySelector('summary').textContent = summarizeStage(stage);
    changed({ rerender: name === 'engine' });
  });

  list.addEventListener('click', (event) => {
    const action = event.target.dataset?.action;
    const item = event.target.closest('[data-index]');
    if (!action || !item) return;
    const index = Number(item.dataset.index);
    if (action === 'remove') stages.splice(index, 1);
    const target = action === 'up' ? index - 1 : action === 'down' ? index + 1 : -1;
    if (target >= 0 && target < stages.length) [stages[index], stages[target]] = [stages[target], stages[index]];
    changed({ rerender: true });
  });

  for (const addButton of addButtons) {
    addButton.addEventListener('click', () => {
      stages.push(NEW_STAGE[addButton.dataset.addStage]());
      render();
      list.lastElementChild.querySelector('details').open = true;
      onChange(stages);
    });
  }

  return {
    set(nextStages) {
      stages = nextStages.map((stage) => ({ ...stage }));
      render();
    },
    get: () => stages,
  };
}
