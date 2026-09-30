import { archetypes, companions, equipment } from './content.js';

export const xpToNext = level => 40 + level * 25 + Math.floor(level ** 1.45 * 4);

export function createCharacter(archetype = 'sentinel', name = 'A sobrevivente') {
  const chosen = archetypes[archetype] ? archetype : 'sentinel';
  const base = structuredClone(archetypes[chosen].stats);
  return { id: 'hero', name: name.trim().slice(0, 24) || 'A sobrevivente', archetype: chosen, specialization: null, level: 1, xp: 0, nextXp: xpToNext(1), skillPoints: 1, attributePoints: 0, stats: base, hp: base.hp, mp: base.mp, vigor: base.vigor, attributes: { might: 2, wit: 2, endurance: 2, agility: 2, luck: 2 }, skills: [...archetypes[chosen].skills], statuses: [], guard: false, alive: true };
}

export function createParty() {
  return Object.fromEntries(companions.map(companion => [companion.id, { id: companion.id, name: companion.name, role: companion.role, level: 1, xp: 0, stats: { ...companion.stats, mp: 8, vigor: 8 }, hp: companion.stats.hp, mp: 8, vigor: 8, skills: [companion.skill], statuses: [], affinity: 0, recruited: companion.id === 'maelis', alive: true, skillPoints: 0, attributePoints: 0 }]));
}

export function effectiveStats(actor, state) {
  const result = { ...actor.stats, crit: 0.05, accuracy: 0.88, dodge: 0.04, resistance: 0, luck: actor.attributes?.luck ?? 2 };
  for (const gearId of Object.values(state.equipment[actor.id] ?? {})) {
    const gear = equipment.find(item => item.id === gearId);
    if (!gear) continue;
    result.atk = (result.atk ?? 0) + gear.atk;
    result.mag = (result.mag ?? 0) + gear.mag;
    result.def = (result.def ?? 0) + gear.def;
    result.spd = (result.spd ?? 0) + gear.spd;
    if (gear.effect?.includes('Crítico')) result.crit += 0.05;
    if (gear.effect?.includes('Resistência')) result.resistance += 0.08;
    const upgrades = state.upgrades?.[gearId] ?? 0;
    result.atk += upgrades * 2;
    result.mag += upgrades * 2;
  }
  if (actor.attributes) {
    result.atk += actor.attributes.might * 0.7;
    result.mag += actor.attributes.wit * 0.7;
    result.def += actor.attributes.endurance * 0.65;
    result.spd += actor.attributes.agility * 0.5;
    result.dodge += actor.attributes.agility * 0.005;
    result.crit += actor.attributes.luck * 0.004;
    result.accuracy += actor.attributes.luck * 0.003;
  }
  const specializationBonuses = {
    bulwark: { def: 4 }, vanguard: { atk: 3 }, elementalist: { mag: 4 }, umbra: { resistance: 0.12 },
    pathfinder: { spd: 3, dodge: 0.05 }, deadeye: { crit: 0.12, accuracy: 0.05 }, healer: { mag: 2 }, stormcaller: { mag: 3 }
  }[actor.specialization] ?? {};
  for (const [key, value] of Object.entries(specializationBonuses)) result[key] = (result[key] ?? 0) + value;
  return result;
}

export function gainExperience(actor, amount) {
  actor.xp += amount;
  const gains = [];
  while (actor.level < 30 && actor.xp >= xpToNext(actor.level)) {
    actor.xp -= xpToNext(actor.level);
    actor.level += 1;
    actor.attributePoints = (actor.attributePoints ?? 0) + 2;
    actor.skillPoints = (actor.skillPoints ?? 0) + 1;
    actor.stats.hp += 5;
    actor.stats.mp += 2;
    actor.stats.vigor += 1;
    actor.stats.atk += 1;
    actor.stats.mag += 1;
    actor.stats.def += 1;
    actor.stats.vigor += 1;
    actor.hp = Math.min(actor.stats.hp, actor.hp + 5);
    actor.mp = Math.min(actor.stats.mp, actor.mp + 2);
    actor.vigor = Math.min(actor.stats.vigor, (actor.vigor ?? 0) + 1);
    gains.push(actor.level);
  }
  actor.nextXp = xpToNext(actor.level);
  return gains;
}

export function improveAttribute(actor, attribute) {
  if (!['might', 'wit', 'endurance', 'agility', 'luck'].includes(attribute) || actor.attributePoints < 1) return false;
  actor.attributes[attribute] += 1;
  actor.attributePoints -= 1;
  if (attribute === 'endurance') { actor.stats.hp += 3; actor.hp += 3; }
  if (attribute === 'wit') { actor.stats.mp += 2; actor.mp += 2; }
  return true;
}

export function chooseSpecialization(actor, specialization, choices) {
  if (!actor || actor.level < 5 || actor.specialization) return false;
  if (!choices[actor.archetype]?.some(choice => choice.id === specialization)) return false;
  actor.specialization = specialization;
  if (specialization === 'umbra') { actor.stats.mp += 6; actor.mp += 6; }
  if (specialization === 'healer') { actor.stats.mp += 3; actor.mp += 3; }
  return true;
}