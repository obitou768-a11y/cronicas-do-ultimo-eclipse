import { bosses, enemies, skills, statusDescriptions } from './content.js';
import { effectiveStats, gainExperience } from './character.js';
import { addItem, equipItem } from './inventory.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function damageFormula({ attack, defense, power = 1, weakness = false, resistance = false, critical = false, roll = 1 }) {
  const base = Math.max(1, attack * power - defense * 0.55);
  return Math.max(1, Math.floor(base * (weakness ? 1.5 : resistance ? 0.55 : 1) * (critical ? 1.5 : 1) * clamp(roll, 0.9, 1.1)));
}

export function healingFormula(magic, power = 1) { return Math.max(1, Math.floor(magic * power + 7)); }

function actorById(state, id) { return id === 'hero' ? state.character : state.party[id]; }
function isBoss(state) { return state.battle?.bossId ? bosses.find(item => item.id === state.battle.bossId) : null; }
function enemyAlive(enemy) { return enemy.hp > 0; }

export function startBattle(state, enemyId, { boss = false, random = Math.random } = {}) {
  if (state.battle && !state.battle.finished) return { ok: false, message: 'Já existe um combate em andamento.' };
  const template = boss ? bosses.find(item => item.id === enemyId) : enemies.find(item => item.id === enemyId);
  if (!template || template.region !== state.currentRegion) return { ok: false, message: 'Inimigo indisponível nesta região.' };
  if (boss && state.progress.completedBosses.includes(template.id)) return { ok: false, message: 'Esse chefe já foi derrotado.' };
  const scale = boss ? 1 : Math.max(0.75, 0.7 + state.character.level * 0.035);
  const foe = { id: template.id, name: template.name, hp: Math.floor(template.hp * scale), maxHp: Math.floor(template.hp * scale), atk: Math.floor(template.atk * scale), def: Math.floor(template.def * scale), spd: template.spd ?? Math.floor(template.atk * 0.72), weakness: template.weakness, resist: template.resist, element: template.element ?? 'shadow', move: template.move, ai: template.ai ?? 'tactical', statuses: [], guard: false, level: template.level ?? 1, xp: template.xp ?? 120, gold: template.gold ?? 60, drop: template.drop, turn: 0, phase: 0, boss };
  if (template.id === 'bell-warden' && state.choices.savedDain) foe.atk = Math.floor(foe.atk * 0.7);
  const actors = ['hero', ...state.partyOrder.filter(id => state.party[id]?.recruited && state.party[id].alive && state.party[id].hp > 0)];
  const queue = [...actors, 'enemy'].sort((a, b) => {
    const first = a === 'enemy' ? foe.spd : effectiveStats(actorById(state, a), state).spd;
    const second = b === 'enemy' ? foe.spd : effectiveStats(actorById(state, b), state).spd;
    return second - first;
  });
  state.battle = { enemy: foe, bossId: boss ? template.id : null, queue, turn: 0, round: 1, finished: false, result: null, log: [`${template.name} surge das sombras. ${boss ? template.story : template.move + ' prepara-se.'}`], lastElement: null, randomSeed: random() };
  state.encounters += 1;
  if (currentActor(state) === 'enemy') stepEnemies(state, random);
  return { ok: true, message: `Combate iniciado: ${template.name}.` };
}

function currentActor(state) { return state.battle.queue[state.battle.turn % state.battle.queue.length]; }
function advanceTurn(state) {
  state.battle.turn += 1;
  if (state.battle.turn % state.battle.queue.length === 0) {
    state.battle.round += 1;
    for (const id of ['hero', ...state.partyOrder]) {
      const actor = actorById(state, id);
      if (actor && (id === 'hero' || actor.recruited)) actor.vigor = Math.min(actor.stats.vigor, actor.vigor + 1);
    }
  }
}

function applyStatusTick(actor, log) {
  actor.statuses ??= [];
  let skip = false;
  for (const status of actor.statuses) {
    if (['burn','poison','bleed'].includes(status.id)) {
      const maxHp = actor.stats?.hp ?? actor.maxHp ?? 0;
      const damage = status.id === 'poison' ? Math.max(1, Math.floor(maxHp * 0.07)) : status.id === 'burn' ? Math.max(1, Math.floor(maxHp * 0.05)) : 4;
      actor.hp = Math.max(0, actor.hp - damage);
      log.push(`${actor.name ?? actor.id} ${statusDescriptions[status.id]}: -${damage} PV.`);
    }
    if (['freeze','stun'].includes(status.id)) skip = true;
    status.turns -= 1;
  }
  actor.statuses = actor.statuses.filter(status => status.turns > 0);
  return skip;
}

function finishBattle(state, victory) {
  const battle = state.battle;
  battle.finished = true;
  battle.result = victory ? 'victory' : 'defeat';
  if (!victory) {
    state.character.hp = Math.max(1, Math.floor(state.character.stats.hp * 0.2));
    state.character.mp = Math.max(0, Math.floor(state.character.stats.mp * 0.3));
    battle.log.push('O grupo recua para respirar. Nenhum item foi perdido.');
    return;
  }
  const template = battle.bossId ? bosses.find(item => item.id === battle.bossId) : enemies.find(item => item.id === battle.enemy.id);
  const xp = template?.xp ?? (70 + template?.hp * 0.55);
  const gold = template?.gold ?? (35 + template?.hp * 0.3);
  const earnedLevels = gainExperience(state.character, Math.floor(xp));
  for (const id of state.partyOrder) if (state.party[id]?.recruited) gainExperience(state.party[id], Math.floor(xp * 0.65));
  state.gold += Math.floor(gold);
  if (template?.drop) addItem(state, template.drop, 1);
  if (battle.bossId && !state.progress.completedBosses.includes(battle.bossId)) {
    state.progress.completedBosses.push(battle.bossId);
    state.flags.rewards.push(template.reward);
    state.inventory.items[template.reward] = (state.inventory.items[template.reward] ?? 0) + 1;
    const bossIndex = bosses.findIndex(item => item.id === battle.bossId);
    if (bossIndex + 1 < bosses.length) {
      const nextRegion = bosses[bossIndex + 1].region;
      if (!state.unlockedRegions.includes(nextRegion)) state.unlockedRegions.push(nextRegion);
    }
    if (battle.bossId === 'bell-warden') state.party.maelis.affinity += 1;
  }
  battle.log.push(`Vitória. +${Math.floor(xp)} EXP, +${Math.floor(gold)} moedas${earnedLevels.length ? `; nível ${earnedLevels.join(', ')}` : ''}.`);
}

function damageTarget(target, damage, log, label) {
  if (target.guard) {
    damage = Math.floor(damage * 0.5);
    target.guardTurns = Math.max(0, (target.guardTurns ?? 1) - 1);
    target.guard = target.guardTurns > 0;
  }
  target.hp = Math.max(0, target.hp - damage);
  log.push(`${label} sofre ${damage} de dano. (${target.hp}/${target.stats?.hp ?? target.maxHp} PV)`);
  return damage;
}

function enemyTurn(state, random) {
  const battle = state.battle;
  const foe = battle.enemy;
  if (!enemyAlive(foe)) return;
  if (applyStatusTick(foe, battle.log)) { battle.log.push(`${foe.name} perde a ação.`); return; }
  foe.turn += 1;
  const boss = isBoss(state);
  const living = ['hero', ...state.partyOrder].map(id => actorById(state, id)).filter(actor => actor?.recruited !== false && actor?.hp > 0);
  if (!living.length) { finishBattle(state, false); return; }
  if (boss?.id === 'root-mother' && foe.hp <= foe.maxHp * 0.5 && foe.phase < 1) {
    foe.phase = 1;
    battle.log.push('Fase II: a floração espalha esporos venenosos pela arena.');
    for (const actor of living) { damageTarget(actor, 4, battle.log, actor.name); actor.statuses.push({ id: 'poison', turns: 2 }); }
    return;
  }
  if (boss?.id === 'sky-eater' && foe.hp <= foe.maxHp * 0.7 && foe.phase < 1) {
    foe.phase = 1; foe.def += 5; foe.guard = true;
    battle.log.push('Fase II: placas de ardósia cobrem a Boca; fogo ainda atravessa a armadura.');
  }
  if (boss?.id === 'drowned-saint' && foe.hp <= foe.maxHp * 0.5 && foe.phase < 1) {
    foe.phase = 1;
    battle.log.push('Fase II: a água sobe até o peito. O sino submerso poderia quebrar o ciclo.');
  }
  if (boss?.id === 'glass-oracle' && foe.hp <= foe.maxHp * 0.5 && foe.phase < 1) {
    foe.phase = 1; foe.mirages = 2;
    battle.log.push('Fase II: duas miragens surgem; os próximos golpes físicos perdem metade da força.');
  }
  if (boss?.id === 'nharos' && foe.hp <= foe.maxHp * 0.65 && foe.phase < 1) {
    foe.phase = 1; foe.resist = battle.lastElement ?? 'shadow';
    battle.log.push(`Fase II: Nharos aprende a resistir a ${foe.resist}.`);
  }
  if (boss?.id === 'nharos' && foe.hp <= foe.maxHp * 0.25 && foe.phase < 2) {
    foe.phase = 2; foe.weakness = 'light'; foe.resist = battle.lastElement ?? 'shadow';
    battle.log.push('Fase III: Nharos oferece devolver Valdora. A primeira luz torna-se sua fraqueza.');
  }
  if (boss?.id === 'king-nacre' && foe.turn % 2 === 0 && battle.lastElement) {
    foe.resist = battle.lastElement;
    battle.log.push(`Odran copia a inscrição: agora resiste a ${battle.lastElement}.`);
  }
  if (boss?.id === 'drowned-saint' && foe.phase > 0 && !state.choices.rangSargaBell && foe.turn % 2 === 0) {
    foe.hp = Math.min(foe.maxHp, foe.hp + 12);
    battle.log.push('A Santa regenera 12 PV enquanto o sino permanece submerso.');
  }
  if (boss?.id === 'glass-oracle' && foe.phase > 0 && battle.lastElement && battle.lastElement === battle.predictedElement && foe.turn > 1) {
    battle.log.push(`O Oráculo prevê ${battle.lastElement}; repetir esse elemento fortalece sua réplica.`);
    foe.guard = true;
  }
  battle.predictedElement = battle.lastElement;
  if (boss?.id === 'red-commander' && foe.turn % 3 === 0 && !foe.statuses.some(status => status.id === 'silence')) {
    battle.log.push('Veyr ordena uma salva dos canhoneiros.');
    for (const actor of living) damageTarget(actor, Math.max(2, Math.floor(foe.atk * 0.45)), battle.log, actor.name);
  }
  if (boss?.id === 'sky-eater' && foe.phase > 0 && foe.turn % 3 === 0) {
    battle.log.push('O verme golpeia a mina inteira; defender reduz o impacto.');
    for (const actor of living) damageTarget(actor, Math.max(2, Math.floor(foe.atk * 0.6)), battle.log, actor.name);
  }
  if (!boss && foe.turn % (foe.ai === 'aggressive' ? 2 : 3) === 0 && foe.ai !== 'tactical') {
    const target = living[(foe.turn - 1) % living.length];
    const stateId = foe.ai === 'trickster' ? 'poison' : 'burn';
    target.statuses.push({ id: stateId, turns: 2 });
    battle.log.push(`${foe.name} usa ${foe.move}: ${target.name} sofre ${statusDescriptions[stateId]}.`);
  }
  if (boss?.id === 'bell-warden' && foe.hp <= foe.maxHp * 0.35 && foe.phase < 1) {
    foe.phase = 1;
    battle.log.push('Fase II: as cinzas da torre se erguem e cercam o grupo.');
    for (const actor of living) damageTarget(actor, Math.max(3, Math.floor(foe.atk * 0.7)), battle.log, actor.name);
  } else {
    const target = boss?.id === 'bell-warden' ? living.reduce((a, b) => a.hp / a.stats.hp < b.hp / b.stats.hp ? a : b) : living[(foe.turn - 1) % living.length];
    const stats = effectiveStats(target, state);
    const enraged = foe.boss && foe.hp < foe.maxHp * 0.5 ? 1.25 : 1;
    const raw = damageFormula({ attack: foe.atk * enraged, defense: stats.def, power: foe.element === 'physical' ? 1 : 0.9, roll: 0.9 + random() * 0.2, resistance: random() < stats.resistance });
    if (random() > 0.96 - stats.dodge) battle.log.push(`${target.name} esquiva de ${foe.move}.`);
    else {
      damageTarget(target, raw, battle.log, target.name);
      if (foe.boss && random() < 0.12) target.statuses.push({ id: 'bleed', turns: 2 });
    }
  }
  if (living.every(actor => actor.hp <= 0)) finishBattle(state, false);
}

function stepEnemies(state, random) {
  let safety = 0;
  while (!state.battle.finished && currentActor(state) === 'enemy' && safety++ < 8) {
    enemyTurn(state, random);
    if (state.battle.enemy.hp <= 0) finishBattle(state, true);
    if (!state.battle.finished) advanceTurn(state);
  }
}

export function performAction(state, action, options = {}) {
  const battle = state.battle;
  if (!battle || battle.finished) return { ok: false, message: 'Não há combate ativo.' };
  const random = options.random ?? Math.random;
  const actorId = currentActor(state);
  if (actorId === 'enemy') { stepEnemies(state, random); return { ok: true, message: 'O inimigo agiu.' }; }
  const actor = actorById(state, actorId);
  if (!actor || actor.hp <= 0) { advanceTurn(state); stepEnemies(state, random); return { ok: false, message: 'Esse aliado não pode agir.' }; }
  if (applyStatusTick(actor, battle.log)) { battle.log.push(`${actor.name} perde a ação pelo estado.`); advanceTurn(state); stepEnemies(state, random); return { ok: true, message: 'Turno perdido por estado.' }; }
  const foe = battle.enemy;
  const actorStats = effectiveStats(actor, state);
  const target = action.targetId ? (action.targetId === 'hero' ? state.character : state.party[action.targetId]) : foe;
  if (action.type === 'attack') {
    if (random() > actorStats.accuracy) battle.log.push(`${actor.name} erra o ataque.`);
    else {
      const crit = random() < actorStats.crit;
      const vigorRatio = actor.vigor / Math.max(1, actor.stats.vigor);
      let damage = damageFormula({ attack: actorStats.atk * (actor.statuses.some(item => item.id === 'weaken') ? 0.7 : 1) * (0.8 + vigorRatio * 0.2), defense: foe.def, weakness: foe.weakness === 'physical', resistance: foe.resist === 'physical', critical: crit, roll: 0.9 + random() * 0.2 });
      if (actor.specialization === 'vanguard' && foe.boss && !battle.openingStrike) { damage = Math.floor(damage * 1.15); battle.openingStrike = true; }
      actor.vigor = Math.max(0, actor.vigor - 1);
      if (foe.guard) { damage = Math.floor(damage * 0.5); foe.guard = false; }
      foe.hp = Math.max(0, foe.hp - damage);
      battle.log.push(`${actor.name} ataca ${foe.name}${crit ? ' (crítico)' : ''}: ${damage} dano. (${foe.hp}/${foe.maxHp} PV)`);
      battle.lastElement = 'physical';
    }
  } else if (action.type === 'defend') {
    actor.guard = true;
    actor.guardTurns = actor.specialization === 'bulwark' ? 2 : 1;
    actor.mp = Math.min(actor.stats.mp, actor.mp + 1);
    actor.vigor = Math.min(actor.stats.vigor, actor.vigor + 3);
    battle.log.push(`${actor.name} assume defesa e recupera 1 PM.`);
  } else if (action.type === 'skill') {
    const skill = skills[action.skillId];
    if (!skill || !actor.skills.includes(action.skillId)) return { ok: false, message: 'Habilidade não aprendida.' };
    if (actor.mp < skill.cost) return { ok: false, message: 'Mana insuficiente.' };
    if (actor.statuses.some(status => status.id === 'silence')) return { ok: false, message: 'Silêncio impede conjurar habilidades.' };
    actor.mp -= skill.cost;
    if (skill.effect === 'guard') { actor.guard = true; actor.guardTurns = actor.specialization === 'bulwark' ? 2 : 1; battle.log.push(`${actor.name} usa ${skill.name}; próximo dano reduzido.`); }
    else if (skill.effect === 'inspire') { for (const id of ['hero', ...state.partyOrder]) { const member = actorById(state, id); if (member?.hp > 0 && (id === 'hero' || member.recruited)) member.statuses.push({ id: 'inspired', turns: 2 }); } battle.log.push(`${actor.name} inspira o grupo: ataque +20% por dois turnos.`); }
    else if (skill.target === 'ally') {
      if (!target || target.hp <= 0) return { ok: false, message: 'Alvo inválido.' };
      const healingBonus = actor.specialization === 'healer' ? 1.25 : 1;
      const receivedBonus = target.specialization === 'healer' ? 1.25 : 1;
      const amount = Math.floor(healingFormula(actorStats[skill.scale], skill.power) * healingBonus * receivedBonus);
      const healed = Math.min(target.stats.hp - target.hp, amount);
      target.hp += healed;
      battle.log.push(`${actor.name} usa ${skill.name}: ${target.name} recupera ${healed} PV.`);
    } else {
      const weakness = skill.element && foe.weakness === skill.element;
      const resistance = skill.element && foe.resist === skill.element;
      const inspired = actor.statuses.some(status => status.id === 'inspired');
      const critical = random() < actorStats.crit;
      let damage = damageFormula({ attack: actorStats[skill.scale], defense: foe.def, power: skill.power, weakness, resistance, critical, roll: 0.9 + random() * 0.2 }) * (inspired ? 1.2 : 1);
      if (actor.specialization === 'elementalist' && weakness) damage *= 1.1;
      if (actor.specialization === 'stormcaller' && skill.element === 'lightning') damage *= 1.2;
      if (actor.specialization === 'vanguard' && foe.boss && !battle.openingStrike) { damage *= 1.15; battle.openingStrike = true; }
      if (foe.id === 'glass-oracle' && foe.mirages > 0 && skill.element === 'physical') { damage *= 0.5; foe.mirages -= 1; }
      if (skill.element === 'fire' && foe.id === 'root-mother' && foe.phase > 0) {
        foe.statuses = foe.statuses.filter(status => status.id !== 'poison');
        battle.log.push('O fogo interrompe a floração e dissipa os esporos.');
      }
      foe.hp = Math.max(0, foe.hp - Math.floor(damage));
      battle.log.push(`${actor.name} usa ${skill.name}${weakness ? ' (fraqueza)' : resistance ? ' (resistido)' : ''}: ${Math.floor(damage)} dano.`);
      battle.lastElement = skill.element;
      if (skill.status && random() < skill.chance) { foe.statuses.push({ id: skill.status, turns: skill.status === 'stun' || skill.status === 'freeze' ? 1 : 2 }); battle.log.push(`${foe.name} sofre ${statusDescriptions[skill.status]}.`); }
    }
  } else if (action.type === 'item') {
    const item = Object.values(itemsForImport).find(value => value.id === action.itemId);
    if (!item || item.kind !== 'consumable' || !(state.inventory.items[action.itemId] > 0)) return { ok: false, message: 'Consumível indisponível.' };
    if (item.effect === 'heal') { const healed = Math.min(actor.stats.hp - actor.hp, item.amount); actor.hp += healed; battle.log.push(`${actor.name} usa ${item.name} e recupera ${healed} PV.`); }
    else if (item.effect === 'mana') { const restored = Math.min(actor.stats.mp - actor.mp, item.amount); actor.mp += restored; battle.log.push(`${actor.name} recupera ${restored} PM.`); }
    else if (item.effect === 'cure') { actor.statuses = actor.statuses.filter(status => !['poison','burn'].includes(status.id)); battle.log.push(`${actor.name} usa ${item.name}; toxinas removidas.`); }
    else if (item.effect === 'bomb') { const damage = damageFormula({ attack: item.amount, defense: foe.def * 0.4, weakness: foe.weakness === 'fire', resistance: foe.resist === 'fire', roll: 1 }); foe.hp = Math.max(0, foe.hp - damage); battle.log.push(`${item.name} explode: ${damage} dano de fogo.`); }
    state.inventory.items[action.itemId] -= 1;
    if (!state.inventory.items[action.itemId]) delete state.inventory.items[action.itemId];
  } else if (action.type === 'run') {
    if (battle.bossId) return { ok: false, message: 'Não é possível fugir de um chefe.' };
    if (random() < 0.55 + actorStats.spd * 0.02) { battle.finished = true; battle.result = 'escaped'; battle.log.push('O grupo conseguiu fugir.'); return { ok: true, message: 'Fuga bem-sucedida.' }; }
    battle.log.push('A fuga falhou.');
  } else if (action.type === 'switch') {
    if (battle.round > 1 || battle.turn > 1) return { ok: false, message: 'Trocar equipamento só é permitido antes do segundo turno.' };
    const changed = equipItem(state, action.gearId, actorId);
    if (!changed.ok) return changed;
    battle.log.push(`${actor.name} troca equipamento: ${changed.message}`);
  } else return { ok: false, message: 'Ação desconhecida.' };

  if (foe.hp <= 0) finishBattle(state, true);
  if (!battle.finished) { advanceTurn(state); stepEnemies(state, random); }
  return { ok: true, message: battle.log.at(-1) };
}

import { items as itemsForImport } from './content.js';