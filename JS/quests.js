import { chapters, sideQuests, companions, equipment, items } from './content.js';

const personalBosses = { maelis: 'root-mother', oren: 'king-nacre', ysold: 'sky-eater', oru: 'drowned-saint', nima: 'glass-oracle', serik: 'red-commander' };
const bossNames = { 'root-mother': 'A Mãe sob as Raízes', 'king-nacre': 'O Rei sem Nome', 'sky-eater': 'A Boca da Montanha', 'drowned-saint': 'a Santa das Águas Mortas', 'glass-oracle': 'o Oráculo de Vidro', 'red-commander': 'o Marechal Veyr' };

export function initialQuestState() {
  return { main: { 'prologue': 'active' }, side: Object.fromEntries(sideQuests.map(quest => [quest.id, 'available'])), personal: {}, chapterIndex: 0, sceneIndex: 0, completed: [] };
}

export function activeChapter(state) { return chapters[state.quests.chapterIndex] ?? null; }

export function chooseScene(state, choiceIndex) {
  const chapter = activeChapter(state);
  const scene = chapter?.scenes[state.quests.sceneIndex];
  const choice = scene?.choices[choiceIndex];
  if (!choice) return { ok: false, message: 'Essa escolha não está disponível.' };
  state.choices[choice.key] = choice.value;
  if (choice.key === 'trustedMaelis') state.party.maelis.affinity += 2;
  if (choice.key === 'hidMark') state.party.maelis.affinity -= 1;
  if (choice.key === 'savedDain') { state.flags.dainAlive = true; state.reputation += 1; }
  if (choice.key === 'savedRefugees') { state.flags.refugeesSaved = true; state.reputation += 2; state.inventory.items['poção vital'] = (state.inventory.items['poção vital'] ?? 0) + 1; }
  if (choice.key === 'defiedWarden') state.flags.firstSealResolve = true;
  if (choice.key === 'sparedWarden') state.reputation += 1;
  if (choice.key === 'gaveMemory') { state.party.maelis.affinity += 2; state.flags.memoryLost = true; }
  if (choice.key === 'soughtRootWay') state.flags.rootSecret = true;
  if (choice.key === 'protectedOren') state.party.oren.affinity += 2;
  if (choice.key === 'exposedOren') state.reputation += 1;
  if (choice.key === 'comfortedYsold') state.party.ysold.affinity += 2;
  if (choice.key === 'searchedBrother') state.flags.brotherSearched = true;
  if (choice.key === 'rangSargaBell') state.party.oru.affinity += 2;
  if (choice.key === 'curedSarga') state.flags.oruInfected = true;
  if (choice.key === 'savedCaravans') state.party.nima.affinity += 2;
  if (choice.key === 'savedLighthouse') state.flags.lighthouseLit = true;
  if (choice.key === 'judgedVeyr') { state.party.serik.affinity += 2; state.flags.kharadReinforcements = true; }
  if (choice.key === 'sparedVeyr') state.flags.veyrAlly = true;
  if (choice.key === 'endingDawn') { state.ending = 'Aurora'; state.reputation += 2; }
  if (choice.key === 'endingDusk') { state.ending = 'Crepúsculo'; state.reputation += 1; }
  if (choice.key === 'endingVoid') {
    state.ending = 'Retorno';
    const lost = state.partyOrder.map(id => state.party[id]).sort((a, b) => b.affinity - a.affinity)[0];
    if (lost) { lost.recruited = false; state.partyOrder = state.partyOrder.filter(id => id !== lost.id); state.flags.lostCompanion = lost.id; }
  }
  const consequence = choice.consequence;
  state.quests.sceneIndex += 1;
  if (state.quests.sceneIndex >= chapter.scenes.length) state.flags.sceneDone = true;
  return { ok: true, message: consequence };
}

export function completeChapter(state, chapterId) {
  const chapter = chapters.find(item => item.id === chapterId);
  if (!chapter || state.quests.completed.includes(chapterId)) return false;
  if (activeChapter(state)?.id !== chapterId) return false;
  state.quests.completed.push(chapterId);
  state.quests.main[chapterId] = 'completed';
  state.quests.chapterIndex += 1;
  state.quests.sceneIndex = 0;
  state.flags.sceneDone = false;
  const next = activeChapter(state);
  if (next) state.quests.main[next.id] = 'active';
  return true;
}

export function acceptQuest(state, questId) {
  if (!(questId in state.quests.side) || state.quests.side[questId] !== 'available') return false;
  const quest = sideQuests.find(item => item.id === questId);
  if (quest.region !== state.currentRegion) return false;
  state.quests.side[questId] = 'active';
  return true;
}

export function finishQuest(state, questId) {
  const quest = sideQuests.find(item => item.id === questId);
  if (!quest || state.quests.side[questId] !== 'active' || state.quests.completed.includes(questId)) return false;
  state.quests.side[questId] = 'completed';
  state.quests.completed.push(questId);
  state.gold += quest.gold;
  state.reputation += 1;
  if (quest.reward in items) state.inventory.items[quest.reward] = (state.inventory.items[quest.reward] ?? 0) + 1;
  else {
    const gear = equipment.find(item => item.name === quest.reward);
    if (gear && !state.inventory.gear.includes(gear.id) && !Object.values(state.equipment).some(slots => Object.values(slots).includes(gear.id))) state.inventory.gear.push(gear.id);
    else state.inventory.items[quest.reward] = (state.inventory.items[quest.reward] ?? 0) + 1;
    state.flags.rewards ??= [];
    state.flags.rewards.push(quest.reward);
  }
  return true;
}

export function unlockPersonalQuest(state, companionId) {
  const companion = companions.find(item => item.id === companionId);
  if (!companion || !state.party[companionId]?.recruited) return false;
  const id = `personal-${companionId}`;
  if (state.quests.personal[id]) return false;
  const targetBoss = personalBosses[companionId];
  state.quests.personal[id] = { name: companion.personalQuest, objective: `Ajude ${companion.name} a encarar ${bossNames[targetBoss]}; vença o confronto com essa história conhecida.`, state: 'active', companionId, targetBoss };
  return true;
}

export function completePersonalQuests(state, bossId) {
  const completed = [];
  for (const quest of Object.values(state.quests.personal)) {
    const companion = state.party[quest.companionId];
    if (quest.state !== 'active' || quest.targetBoss !== bossId || !companion?.recruited) continue;
    quest.state = 'completed';
    companion.affinity += 2;
    state.quests.completed.push(`personal-${quest.companionId}`);
    state.progress.completedPersonal.push(quest.companionId);
    state.gold += 35;
    completed.push(`${quest.name}: ${companion.name} confia mais em você. +35 moedas.`);
  }
  return completed;
}