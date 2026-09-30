import test from 'node:test';
import assert from 'node:assert/strict';
import { damageFormula, healingFormula, startBattle } from '../js/combat.js';
import { createCharacter, effectiveStats, gainExperience, improveAttribute } from '../js/character.js';
import { addItem, craft, dismantle, equipItem, removeItem, unequipItem } from '../js/inventory.js';
import { createGame, createNewGame } from '../js/game.js';
import { completePersonalQuests, finishQuest } from '../js/quests.js';
import { readSave, writeSave } from '../js/save.js';
import { equipment } from '../js/content.js';

test('fórmula de dano respeita defesa, fraqueza, resistência e crítico', () => {
  const plain = damageFormula({ attack: 20, defense: 8, roll: 1 });
  assert.equal(plain, 15);
  assert.ok(damageFormula({ attack: 20, defense: 8, weakness: true, roll: 1 }) > plain);
  assert.ok(damageFormula({ attack: 20, defense: 8, resistance: true, roll: 1 }) < plain);
  assert.ok(damageFormula({ attack: 20, defense: 8, critical: true, roll: 1 }) > plain);
  assert.equal(healingFormula(10, 1.5), 22);
});

test('atributos afetam estatísticas e experiência concede pontos', () => {
  const state = createNewGame({ archetype: 'sentinel' });
  const before = effectiveStats(state.character, state).atk;
  assert.equal(improveAttribute(state.character, 'might'), false);
  const levels = gainExperience(state.character, 500);
  assert.ok(levels.length > 0);
  assert.equal(improveAttribute(state.character, 'might'), true);
  assert.ok(effectiveStats(state.character, state).atk > before);
  assert.equal(state.character.attributePoints, levels.length * 2 - 1);
  assert.equal(state.character.skillPoints, 1 + levels.length);
});

test('especialização só abre no nível 5 e aplica seu bônus de arquétipo', () => {
  const state = createNewGame({ archetype: 'sentinel' });
  const game = createGame(state);
  assert.equal(game.specialize('vanguard').ok, false);
  gainExperience(state.character, 1200);
  const attack = game.stats().atk;
  assert.equal(game.specialize('vanguard').ok, true);
  assert.equal(game.stats().atk, attack + 3);
  assert.equal(game.specialize('bulwark').ok, false);
});

test('inventário valida posse, equipamento, materiais e desmontagem', () => {
  const state = createNewGame({ archetype: 'sentinel' });
  const worn = Object.values(state.equipment).flatMap(slots => Object.values(slots));
  assert.ok(state.inventory.gear.every(id => !worn.includes(id)));
  assert.ok(state.inventory.gear.every(id => id !== 'gear-52'));
  assert.ok(equipment.find(item => item.id === state.equipment.hero.armor).level <= state.character.level);
  const baseSpeed = effectiveStats(state.character, state).spd;
  assert.equal(equipItem(state, 'gear-12').ok, true);
  assert.equal(effectiveStats(state.character, state).spd, baseSpeed + 1);
  assert.equal(unequipItem(state, 'boots'), true);
  const baseHealth = state.character.stats.hp;
  assert.equal(equipItem(state, 'gear-14').ok, true);
  assert.ok(state.character.stats.hp > baseHealth);
  assert.equal(unequipItem(state, 'accessory'), true);
  assert.equal(state.character.stats.hp, baseHealth);
  assert.equal(equipItem(state, 'gear-4').ok, true);
  assert.equal(state.equipment.hero.weapon, 'gear-4');
  assert.ok(state.inventory.gear.includes('gear-1'));
  assert.equal(equipItem(state, 'gear-4').ok, false);
  assert.equal(removeItem(state, 'erva-lua', 99), false);
  assert.equal(addItem(state, 'ferro velho', 2), true);
  assert.equal(addItem(state, 'pó de selo', 1), true);
  assert.equal(craft(state, 'recipe-bomb').ok, true);
  assert.equal(state.inventory.items['bomba de fuligem'], 1);
  state.inventory.gear.push('gear-3');
  assert.equal(dismantle(state, 'gear-3').ok, true);
  assert.ok(state.inventory.items['ferro velho'] >= 1);
});

test('missões recusam duplicação e exigem recursos verificáveis', () => {
  const state = createNewGame();
  const game = createGame(state, { random: () => 0.5 });
  assert.equal(game.acceptQuest('side-3').ok, true);
  assert.equal(game.questAction('side-3', 'collect').ok, true);
  assert.equal(game.state.quests.side['side-3'], 'completed');
  assert.equal(game.questAction('side-3', 'collect').ok, false);
  const gold = state.gold;
  assert.equal(finishQuest(state, 'side-3'), false);
  assert.equal(state.gold, gold);
  assert.equal(game.acceptQuest('side-4').ok, false);
});

test('missão pessoal concede recompensa uma única vez após o chefe associado', () => {
  const state = createNewGame();
  const gold = state.gold;
  state.partyOrder = [];
  assert.equal(completePersonalQuests(state, 'root-mother').length, 1);
  assert.equal(state.quests.personal['personal-maelis'].state, 'completed');
  assert.equal(state.party.maelis.affinity, 2);
  assert.equal(state.gold, gold + 35);
  assert.equal(completePersonalQuests(state, 'root-mother').length, 0);
});

test('salvamento local aceita três slots e isola dados inválidos', () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) ?? null };
  const state = createNewGame({ name: 'Eira' });
  assert.equal(writeSave(2, state, storage).ok, true);
  assert.equal(readSave(2, storage).state.character.name, 'Eira');
  assert.equal(writeSave(4, state, storage).ok, false);
  values.set('ultimo-eclipse-slot-1', '{ quebrado');
  assert.equal(readSave(1, storage).ok, false);
  values.set('ultimo-eclipse-slot-3', JSON.stringify({ version: 1, state: { character: {}, inventory: {}, quests: {} } }));
  assert.equal(readSave(3, storage).ok, false);
});

test('prólogo permite vencer o Vigia do Sino por turnos e abre Liria', () => {
  const game = createGame(null, { random: () => 0.5 });
  game.startNew({ name: 'Teste', archetype: 'sentinel' });
  for (let index = 0; index < 3; index += 1) assert.equal(game.choose(0).ok, true);
  assert.equal(game.beginBoss().ok, true);
  let remaining = 100;
  while (remaining-- > 0 && !game.state.battle.finished) {
    const battle = game.state.battle;
    const actor = battle.queue[battle.turn % battle.queue.length];
    const action = actor === 'enemy' ? {} : { type: 'attack' };
    game.action(action);
  }
  assert.equal(game.state.battle.result, 'victory');
  assert.ok(game.state.progress.completedBosses.includes('bell-warden'));
  assert.ok(game.state.unlockedRegions.includes('liria'));
  assert.ok(game.state.gold > 48);
  assert.ok(game.state.character.xp > 0);
  assert.equal(game.travel('liria').ok, true);
  assert.equal(game.state.currentRegion, 'liria');
  assert.ok(game.state.quests.personal['personal-maelis']);
});

test('um encontro não pode conceder vitória sem ações do grupo', () => {
  const state = createNewGame();
  assert.equal(startBattle(state, 'foe-1').ok, true);
  assert.equal(state.battle.finished, false);
  assert.equal(state.battle.enemy.hp, state.battle.enemy.maxHp);
});

