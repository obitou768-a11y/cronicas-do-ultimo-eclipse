import { regions, archetypes, bosses, companions, enemies, equipment, items, recipes, skills, sideQuests, specializations as archetypesSpecializations } from './content.js';
import { createCharacter, createParty, effectiveStats, gainExperience, improveAttribute, chooseSpecialization } from './character.js';
import { addItem, buyItem, craft, dismantle, equipItem, removeItem, sellItem, unequipItem } from './inventory.js';
import { initialQuestState, activeChapter, acceptQuest, chooseScene, completeChapter, finishQuest, unlockPersonalQuest, completePersonalQuests } from './quests.js';
import { performAction, startBattle } from './combat.js';
import { listSaves, readSave, writeSave } from './save.js';

const initialGear = ['gear-1', 'gear-4', 'gear-5', 'gear-8', 'gear-10', 'gear-12', 'gear-14', 'gear-15'];
const initialEquipment = { hero: { weapon: 'gear-1', armor: 'gear-10' }, maelis: { weapon: 'gear-5' }, oren: {}, ysold: {}, oru: {}, nima: {}, serik: {} };

export function createNewGame({ name, archetype = 'sentinel' } = {}) {
  const character = createCharacter(archetype, name);
  const party = createParty();
  const state = {
    version: 1, createdAt: new Date().toISOString(), character, party, partyOrder: ['maelis'],
    equipment: structuredClone(initialEquipment),
    inventory: { gear: initialGear.filter(id => !Object.values(initialEquipment).some(slots => Object.values(slots).includes(id))), items: { 'poção vital': 4, 'tônico de éter': 2, 'erva-lua': 4, 'ferro velho': 3 } },
    gold: 48, reputation: 0, currentRegion: 'valdora', unlockedRegions: ['valdora'], visitedRegions: ['valdora'], discoveries: {},
    quests: initialQuestState(), choices: {}, flags: { sceneDone: false, rewards: [], secrets: [], eventChoices: [], defeatedEnemies: {}, questActions: {} },
    progress: { completedBosses: [], completedSide: [], completedPersonal: [] }, upgrades: {}, encounters: 0, battle: null,
    settings: { volume: 55, reducedMotion: false, textSize: 100 }
  };
  state.discoveries.valdora = [];
  unlockPersonalQuest(state, 'maelis');
  return state;
}

export function createGame(initialState = null, options = {}) {
  let state = initialState ?? null;
  const random = options.random ?? Math.random;
  const storage = options.storage;
  const result = (ok, message, extra = {}) => ({ ok, message, ...extra });

  function ensureMainQuest() {
    const chapter = activeChapter(state);
    if (!chapter || chapter.region !== state.currentRegion || !state.flags.sceneDone) return false;
    const boss = bosses.find(item => item.region === chapter.region);
    if (boss && state.progress.completedBosses.includes(boss.id)) {
      const advanced = completeChapter(state, chapter.id);
      if (advanced) state.flags.eventChoices.push(`Capítulo concluído: ${chapter.title}`);
      return advanced;
    }
    return false;
  }

  return {
    get state() { return state; },
    get isStarted() { return Boolean(state); },
    startNew(options = {}) {
      state = createNewGame(options);
      return result(true, `${state.character.name} desperta nas cinzas de Valdora.`);
    },
    replaceState(nextState) {
      if (!nextState?.character || !nextState.inventory || !nextState.quests || nextState.version !== 1) return result(false, 'Partida inválida ou incompatível.');
      state = nextState;
      state.battle = null;
      return result(true, 'Partida carregada.');
    },
    save(slot) {
      if (!state) return result(false, 'Não há partida para salvar.');
      return writeSave(slot, state, storage);
    },
    load(slot) {
      const loaded = readSave(slot, storage);
      if (loaded.ok) state = loaded.state;
      return loaded;
    },
    saves() { return listSaves(storage); },
    choose(choiceIndex) {
      if (!state || state.battle && !state.battle.finished) return result(false, 'Não é possível escolher durante um combate.');
      const chapter = activeChapter(state);
      if (!chapter || chapter.region !== state.currentRegion) return result(false, 'Não há uma cena principal nesta região.');
      if (chapter.id === 'chapter-7' && !state.progress.completedBosses.includes('nharos')) return result(false, 'Nharos ainda precisa ser derrotado antes da escolha final.');
      const chosen = chooseScene(state, choiceIndex);
      if (chosen.ok) ensureMainQuest();
      return chosen;
    },
    travel(regionId) {
      if (!state || (state.battle && !state.battle.finished)) return result(false, 'Não é possível viajar durante um combate.');
      if (!state.unlockedRegions.includes(regionId)) return result(false, 'Essa região ainda não foi aberta pelos selos.');
      const region = regions.find(item => item.id === regionId);
      if (!region) return result(false, 'Região desconhecida.');
      state.currentRegion = region.id;
      if (!state.visitedRegions.includes(region.id)) state.visitedRegions.push(region.id);
      const recruitId = companionForRegion(region.id);
      const recruit = recruitId && !state.party[recruitId].recruited ? companions.find(item => item.id === recruitId) : null;
      if (recruit) {
        state.party[recruit.id].recruited = true;
        state.party[recruit.id].hp = state.party[recruit.id].stats.hp;
        state.party[recruit.id].affinity = 1;
        unlockPersonalQuest(state, recruit.id);
        if (state.partyOrder.length < 3) state.partyOrder.push(recruit.id);
      }
      const chapter = activeChapter(state);
      if (chapter?.region === region.id && !(chapter.id === 'chapter-7' && !state.progress.completedBosses.includes('nharos'))) state.flags.sceneDone = false;
      return result(true, `Você chegou a ${region.name}.${recruit ? ` ${recruit.name} se junta ao grupo e conta: “${recruit.greeting}”` : ''}`, { recruit: recruit?.id ?? null });
    },
    explore() {
      if (!state || (state.battle && !state.battle.finished)) return result(false, 'Finalize o combate antes de explorar.');
      const region = regions.find(item => item.id === state.currentRegion);
      const discovered = state.discoveries[state.currentRegion] ?? [];
      state.discoveries[state.currentRegion] = discovered;
      const undiscovered = region.points.filter(point => !discovered.includes(point));
      if (undiscovered.length && random() < 0.28) {
        const point = undiscovered[0];
        discovered.push(point);
        if (point === region.points.at(-1)) state.flags.secrets.push(`${region.id}:${region.secret}`);
        const resource = region.resources[Math.floor(random() * region.resources.length)];
        addItem(state, resource, 1 + (random() < 0.2 ? 1 : 0));
        return result(true, `Ponto descoberto: ${point}. Coletado: ${items[resource]?.name ?? resource}. ${point === region.points.at(-1) ? `Segredo: ${region.secret}` : ''}`);
      }
      const localFoes = enemies.filter(enemy => enemy.region === region.id);
      if (random() < 0.48) {
        const foe = localFoes[Math.floor(random() * localFoes.length)];
        const start = startBattle(state, foe.id, { random });
        if (start.ok) return result(true, `${region.event} Um encontro começa: ${foe.name}.`);
      }
      const resource = region.resources[Math.floor(random() * region.resources.length)];
      addItem(state, resource, 1);
      state.flags.eventChoices.push(`${region.name}: ${region.event}`);
      return result(true, `${region.event} Você coleta ${items[resource]?.name ?? resource}.`);
    },
    interact(point) {
      const region = regions.find(item => item.id === state?.currentRegion);
      if (!region?.points.includes(point)) return result(false, 'Esse ponto não existe nesta região.');
      state.discoveries[state.currentRegion] ??= [];
      if (state.discoveries[state.currentRegion].includes(point)) return result(false, 'Esse lugar já foi investigado.');
      state.discoveries[state.currentRegion].push(point);
      const secret = point === region.points.at(-1);
      if (secret) state.flags.secrets.push(`${region.id}:${region.secret}`);
      const reward = region.resources[0];
      addItem(state, reward, 1);
      for (const [questId, status] of Object.entries(state.quests.side)) {
        if (status === 'active' && sideQuests.find(q => q.id === questId)?.region === region.id) state.flags.questActions ??= {}, state.flags.questActions[questId] = (state.flags.questActions[questId] ?? 0) + 1;
      }
      return result(true, `${point} investigado. ${secret ? `Passagem oculta: ${region.secret}` : ''} Encontrado: ${items[reward]?.name ?? reward}.`);
    },
    beginBoss() {
      if (!state) return result(false, 'Comece uma nova partida.');
      const chapter = activeChapter(state);
      if (chapter?.region === state.currentRegion && !state.flags.sceneDone && chapter.id !== 'chapter-7') return result(false, 'Converse com seus aliados e decida como agir antes do confronto.');
      const boss = bosses.find(item => item.region === state.currentRegion);
      if (!boss) return result(false, 'Não há um chefe principal nesta região.');
      return startBattle(state, boss.id, { boss: true, random });
    },
    beginEncounter(enemyId) { return startBattle(state, enemyId, { random }); },
    action(action) {
      if (!state) return result(false, 'Comece uma nova partida.');
      const outcome = performAction(state, action, { random });
      if (state.battle?.finished && state.battle.result === 'victory') {
        for (const line of completePersonalQuests(state, state.battle.bossId)) state.battle.log.push(line);
        const defeated = state.battle.enemy.name;
        if (!state.battle.bossId) state.flags.defeatedEnemies[defeated] = (state.flags.defeatedEnemies[defeated] ?? 0) + 1;
        ensureMainQuest();
      }
      return outcome;
    },
    recruit(companionId) {
      if (!state || !state.unlockedRegions.length) return result(false, 'Partida indisponível.');
      const companion = companions.find(item => item.id === companionId);
      if (!companion || state.party[companionId].recruited || !state.visitedRegions.includes(companionRegion(companionId))) return result(false, 'Companheiro indisponível.');
      state.party[companionId].recruited = true;
      state.party[companionId].affinity += 1;
      if (state.partyOrder.length < 3) state.partyOrder.push(companionId);
      unlockPersonalQuest(state, companionId);
      return result(true, `${companion.name} entrou para o grupo. ${companion.greeting}`);
    },
    setParty(ids) {
      if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length || ids.some(id => !state.party[id]?.recruited)) return result(false, 'O grupo aceita até três companheiros recrutados.');
      state.partyOrder = [...ids];
      return result(true, 'Formação atualizada.');
    },
    improve(attribute) { return improveAttribute(state.character, attribute) ? result(true, `${attribute} aumentado.`) : result(false, 'Ponto insuficiente ou atributo inválido.'); },
    learn(skillId) {
      const actor = state.character;
      if (actor.skillPoints < 1 || actor.skills.includes(skillId) || !skills[skillId]) return result(false, 'Habilidade indisponível.');
      actor.skills.push(skillId);
      actor.skillPoints -= 1;
      return result(true, `${skills[skillId].name} aprendida.`);
    },
    specialize(specialization) {
      return chooseSpecialization(state.character, specialization, archetypesSpecializations) ? result(true, `Especialização ${specialization} escolhida.`) : result(false, 'A especialização exige nível 5 e ainda não pode ser trocada.');
    },
    acceptQuest(questId) { return acceptQuest(state, questId) ? result(true, 'Missão aceita.') : result(false, 'Missão indisponível nesta região.'); },
    questAction(questId, actionType) {
      const quest = sideQuests.find(item => item.id === questId);
      if (!quest || state.quests.side[questId] !== 'active' || quest.region !== state.currentRegion) return result(false, 'Missão não está ativa nesta região.');
      state.flags.questActions ??= {};
      const amount = state.flags.questActions[questId] ?? 0;
      if (actionType === 'collect') {
        const material = questId === 'side-14' ? 'seiva amarga' : regions.find(item => item.id === quest.region).resources[0];
        const count = ['side-3','side-10'].includes(questId) ? 2 : 1;
        if (!removeItem(state, material, count)) return result(false, `Reúna ${count} ${items[material]?.name ?? material} antes de entregar.`);
      }
      if (actionType === 'explore' && !state.discoveries[quest.region]?.length) return result(false, 'Investigue ao menos um ponto de interesse antes.');
      if (actionType === 'boss' && !state.progress.completedBosses.some(id => bosses.find(boss => boss.id === id)?.region === quest.region)) return result(false, 'Derrote o chefe desta região primeiro.');
      if (actionType === 'defeat' && (state.flags.defeatedEnemies?.['lobo de espinho'] ?? 0) < 2) return result(false, 'Derrote dois lobos de espinho na Floresta de Liria.');
      if (!['collect','explore','boss','defeat'].includes(actionType)) return result(false, 'Objetivo de missão inválido.');
      if (actionType === 'explore') state.flags.questActions[questId] = amount + 1;
      return finishQuest(state, questId) ? result(true, `Missão concluída: ${quest.name}. +${quest.gold} moedas.`) : result(false, 'A missão não pôde ser concluída.');
    },
    useItem(itemId) {
      const item = items[itemId];
      if (!item || item.kind !== 'consumable' || (state.inventory.items[itemId] ?? 0) < 1) return result(false, 'Consumível indisponível.');
      const actor = state.character;
      if (item.effect === 'heal') {
        if (actor.hp >= actor.stats.hp) return result(false, 'A vida já está cheia.');
        actor.hp = Math.min(actor.stats.hp, actor.hp + item.amount);
      }
      else if (item.effect === 'mana') {
        if (actor.mp >= actor.stats.mp) return result(false, 'A mana já está cheia.');
        actor.mp = Math.min(actor.stats.mp, actor.mp + item.amount);
      }
      else if (item.effect === 'cure') actor.statuses = actor.statuses.filter(status => !['poison','burn'].includes(status.id));
      else return result(false, 'Esse item só pode ser usado durante um combate.');
      removeItem(state, itemId, 1);
      return result(true, `${item.name} usado: ${item.desc}`);
    },
    dismissBattle() {
      if (!state?.battle?.finished) return result(false, 'O combate ainda não terminou.');
      state.battle = null;
      return result(true, 'O grupo retorna à jornada.');
    },
    equip(gearId, actorId) { return equipItem(state, gearId, actorId); },
    unequip(slot, actorId) { return unequipItem(state, slot, actorId) ? result(true, 'Equipamento removido.') : result(false, 'Espaço já está vazio.'); },
    sell(gearId) { return sellItem(state, gearId); },
    buy(gearId) { return buyItem(state, gearId); },
    dismantle(gearId) { return dismantle(state, gearId); },
    craft(recipeId) { return craft(state, recipeId); },
    rest() {
      if (!state || state.gold < 8) return result(false, 'A pousada custa 8 moedas.');
      state.gold -= 8;
      for (const id of ['hero', ...state.partyOrder]) { const actor = id === 'hero' ? state.character : state.party[id]; if (actor && (id === 'hero' || actor.recruited)) { actor.hp = actor.stats.hp; actor.mp = actor.stats.mp; actor.statuses = []; } }
      return result(true, 'O grupo descansa. Vida e mana restauradas por 8 moedas.');
    },
    stats(actorId = 'hero') { return effectiveStats(actorId === 'hero' ? state.character : state.party[actorId], state); },
    data: { regions, archetypes, bosses, companions, enemies, equipment, items, recipes, skills, sideQuests, specializations: archetypesSpecializations }
  };
}

function companionForRegion(regionId) { return ({ valdora: 'maelis', liria: 'maelis', nacre: 'oren', vhal: 'ysold', sarga: 'oru', azrakh: 'nima', bastiao: 'serik' })[regionId]; }
function companionRegion(id) { return ({ maelis: 'valdora', oren: 'nacre', ysold: 'vhal', oru: 'sarga', nima: 'azrakh', serik: 'bastiao' })[id]; }