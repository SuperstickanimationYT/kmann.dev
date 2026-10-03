import { PIECES, describe, pieceById, planClear, planPut, related, supportOf } from './world.js';

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const RELATION_WORDS = { on: 'on', under: 'under', below: 'below', above: 'above', beside: 'next to', left_of: 'left of', right_of: 'right of' };

export const RANK = { done: 0, refused: 1, unresolved: 2 };

export function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function variables() {
  let n = 0;
  return () => `x${String(++n).split('').map((digit) => SUBSCRIPTS[digit]).join('')}`;
}

function predicates(sem, x, nextVar) {
  if (sem.pronoun) return [`${x} = it`];
  const parts = [`${sem.noun}(${x})`, ...sem.adjs.map((adj) => `${adj.value}(${x})`)];
  if (sem.pp) parts.push(`${sem.pp.prep}(${x}, ${term(sem.pp.np, nextVar)})`);
  return parts;
}

function term(sem, nextVar) {
  if (sem.pronoun) return 'it';
  if (sem.noun === 'table' && !sem.adjs.length && !sem.pp) return 'table';
  const x = nextVar();
  const quantifier = sem.det === 'the' && !sem.plural ? 'ι' : sem.det === 'a' ? '∃' : 'λ';
  return `${quantifier}${x}[${predicates(sem, x, nextVar).join(' ∧ ')}]`;
}

export function logicalForm(parse) {
  const nextVar = variables();
  const t = (name) => term(parse.sem[name], nextVar);
  const { sem } = parse;
  switch (parse.rule.act) {
    case 'put': return `put(${t('thing')}, ${t('target')})`;
    case 'take': return `put(${t('thing')}, table)${sem.source ? ` ⇐ on(it, ${t('source')})` : ''}`;
    case 'clear': return `clear(${t('thing')})`;
    case 'list': return `?λy[${sem.prep}(y, ${t('ground')})]`;
    case 'which': {
      const x = nextVar();
      return `?λ${x}[${[...predicates(sem.kind, x, nextVar), `${sem.prep}(${x}, ${t('ground')})`].join(' ∧ ')}]`;
    }
    case 'where': return `?λy[on(${t('thing')}, y)]`;
    case 'check': return `?${sem.prep}(${t('thing')}, ${t('ground')})`;
    case 'exists': return `?∃(${t('thing')})`;
    case 'count': return `?|${t('thing')}|`;
    case 'color': return `?color(${t('thing')})`;
    case 'property': return `?${sem.property.value}(${t('thing')})`;
    default: return '';
  }
}

function candidates(sem, world, ctx, steps) {
  if (sem.pronoun) {
    const ids = ctx.lastRefs.filter((id) => id === 'table' || pieceById[id]);
    if (!ids.length) return { ok: false, reason: `I don't know what "${sem.text}" refers to yet.` };
    steps.push({ kind: 'resolve', text: `"${sem.text}" → the last thing mentioned: ${joinList(ids.map(describe))}` });
    return { ok: true, ids };
  }
  let ids = sem.noun === 'table' ? ['table'] : PIECES.filter((piece) => sem.noun === 'block' || piece.shape === sem.noun).map((piece) => piece.id);
  for (const adj of sem.adjs) ids = ids.filter((id) => id !== 'table' && pieceById[id][adj.kind] === adj.value);
  if (sem.pp) {
    const ground = refer(sem.pp.np, world, ctx, steps);
    if (!ground.ok) return ground;
    ids = ids.filter((x) => ground.ids.some((z) => related(world, sem.pp.prep, x, z)));
  }
  return { ok: true, ids };
}

function refer(sem, world, ctx, steps) {
  const found = candidates(sem, world, ctx, steps);
  if (!found.ok || sem.pronoun) return found;
  if (!found.ids.length) return { ok: false, reason: `Nothing here matches "${sem.text}".` };
  if (sem.det === 'the' && !sem.plural && found.ids.length > 1) {
    return { ok: false, reason: `${sentence(NUMBERS[found.ids.length] ?? String(found.ids.length))} things match "${sem.text}": ${joinList(found.ids.map(describe))}. Which one?` };
  }
  steps.push({ kind: 'resolve', text: `"${sem.text}" → ${joinList(found.ids.map(describe))}` });
  return found;
}

function collect(sem, world, ctx, steps) {
  const found = candidates(sem, world, ctx, steps);
  if (found.ok) steps.push({ kind: 'resolve', text: `all "${sem.text}" → ${found.ids.length ? joinList(found.ids.map(describe)) : 'none'}` });
  return found;
}

const unresolved = (reason, steps) => ({ rank: RANK.unresolved, reply: reason, steps, refs: [] });
const answer = (reply, refs, steps) => ({ rank: RANK.done, reply, refs, steps });

function locationOf(world, id) {
  return supportOf(world, id) === 'table' ? 'on the table' : `on ${describe(supportOf(world, id))}`;
}

function carryOut(plan, refs, steps, doneText) {
  if (!plan.ok) {
    steps.push({ kind: 'physics', text: `${plan.refusal.rule}: ${plan.refusal.reason}` });
    return { rank: RANK.refused, reply: plan.refusal.reason, refs, steps };
  }
  for (const move of plan.moves) steps.push({ kind: 'plan', text: `move ${describe(move.id)} from column ${move.from + 1} to column ${move.to + 1}` });
  const extra = plan.moves.length - 1;
  const reply = plan.already ? doneText.already : extra > 0 ? `OK. I moved ${NUMBERS[extra]} block${extra > 1 ? 's' : ''} out of the way first.` : 'OK.';
  return { rank: RANK.done, reply, refs, steps, world: plan.world, snapshots: plan.snapshots };
}

export function interpret(parse, world, ctx) {
  const steps = [{ kind: 'rule', text: `${parse.rule.id}: ${parse.rule.shape}` }];
  const { sem } = parse;
  const need = (name) => refer(sem[name], world, ctx, steps);

  switch (parse.rule.act) {
    case 'put': {
      const thing = need('thing');
      if (!thing.ok) return unresolved(thing.reason, steps);
      const target = need('target');
      if (!target.ok) return unresolved(target.reason, steps);
      const [x, y] = [thing.ids[0], target.ids[0]];
      return carryOut(planPut(world, x, y), [x], steps, { already: `It's already ${locationOf(world, x)}.` });
    }
    case 'take': {
      const thing = need('thing');
      if (!thing.ok) return unresolved(thing.reason, steps);
      const x = thing.ids[0];
      if (sem.source) {
        const source = need('source');
        if (!source.ok) return unresolved(source.reason, steps);
        if (!related(world, 'on', x, source.ids[0])) return { rank: RANK.refused, reply: `It isn't on ${describe(source.ids[0])}, it's ${locationOf(world, x)}.`, refs: [x], steps };
      }
      return carryOut(planPut(world, x, 'table'), [x], steps, { already: "It's already on the table." });
    }
    case 'clear': {
      const thing = need('thing');
      if (!thing.ok) return unresolved(thing.reason, steps);
      return carryOut(planClear(world, thing.ids[0]), thing.ids.slice(0, 1), steps, { already: "There's nothing on it." });
    }
    case 'list':
    case 'which': {
      const ground = need('ground');
      if (!ground.ok) return unresolved(ground.reason, steps);
      let pool = PIECES.map((piece) => piece.id);
      if (sem.kind) {
        const kind = collect(sem.kind, world, ctx, steps);
        if (!kind.ok) return unresolved(kind.reason, steps);
        pool = kind.ids.filter((id) => id !== 'table');
      }
      const ids = pool.filter((x) => ground.ids.some((z) => related(world, sem.prep, x, z)));
      steps.push({ kind: 'resolve', text: `${RELATION_WORDS[sem.prep]} ${joinList(ground.ids.map(describe))} → ${ids.length ? joinList(ids.map(describe)) : 'none'}` });
      return answer(ids.length ? `${sentence(joinList(ids.map(describe)))}.` : 'Nothing.', ids, steps);
    }
    case 'where': {
      const thing = need('thing');
      if (!thing.ok) return unresolved(thing.reason, steps);
      const lines = thing.ids.map((id) => (thing.ids.length > 1 ? `${describe(id)} is ${locationOf(world, id)}` : locationOf(world, id)));
      return answer(`${sentence(lines.join('; '))}.`, thing.ids, steps);
    }
    case 'check': {
      const thing = need('thing');
      if (!thing.ok) return unresolved(thing.reason, steps);
      const ground = need('ground');
      if (!ground.ok) return unresolved(ground.reason, steps);
      const yes = thing.ids.some((x) => ground.ids.some((z) => related(world, sem.prep, x, z)));
      const x = thing.ids[0];
      return answer(yes ? 'Yes.' : `No, it's ${locationOf(world, x)}.`, [x], steps);
    }
    case 'exists': {
      const found = collect(sem.thing, world, ctx, steps);
      if (!found.ok) return unresolved(found.reason, steps);
      return answer(found.ids.length ? `Yes: ${joinList(found.ids.map(describe))}.` : 'No.', found.ids, steps);
    }
    case 'count': {
      const found = collect(sem.thing, world, ctx, steps);
      if (!found.ok) return unresolved(found.reason, steps);
      const n = found.ids.length;
      return answer(`${sentence(NUMBERS[n] ?? String(n))}.`, found.ids, steps);
    }
    case 'color': {
      const thing = sem.thing.plural ? collect(sem.thing, world, ctx, steps) : need('thing');
      if (!thing.ok) return unresolved(thing.reason, steps);
      const pieces = thing.ids.filter((id) => id !== 'table');
      if (!pieces.length) return answer('The table is just wood.', thing.ids, steps);
      return answer(`${sentence(joinList([...new Set(pieces.map((id) => pieceById[id].color))]))}.`, pieces, steps);
    }
    case 'property': {
      const thing = need('thing');
      if (!thing.ok) return unresolved(thing.reason, steps);
      const x = thing.ids[0];
      if (x === 'table') return answer('No, it is the table.', [x], steps);
      const actual = pieceById[x][sem.property.kind];
      return answer(actual === sem.property.value ? 'Yes.' : `No, it's ${actual}.`, [x], steps);
    }
    default:
      return unresolved("I don't know how to do that.", steps);
  }
}

