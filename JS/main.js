import { createGame } from './game.js';
import { chapters, equipment, items, skills, statusDescriptions } from './content.js';
import { activeChapter } from './quests.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const game = createGame();
let tab = 'world';
let selectedArchetype = 'sentinel';
let saveSlot = 1;
let toastTimer;
let soundContext;
let globalSettings = loadSettings();

function loadSettings() {
  try { return { volume: 55, reducedMotion: false, textSize: 100, ...JSON.parse(localStorage.getItem('eclipse-settings') ?? '{}') }; }
  catch { return { volume: 55, reducedMotion: false, textSize: 100 }; }
}
function saveSettings() {
  if (game.state) game.state.settings = { ...globalSettings };
  localStorage.setItem('eclipse-settings', JSON.stringify(globalSettings));
  document.documentElement.style.setProperty('--text-scale', String(globalSettings.textSize / 100));
  document.documentElement.style.setProperty('--motion', globalSettings.reducedMotion ? '0' : '1');
  document.documentElement.classList.toggle('animations-reduced', globalSettings.reducedMotion);
}
saveSettings();

function notify(message, error = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.style.borderColor = error ? 'var(--red)' : '';
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
  if (!error && globalSettings.volume > 0) playTone();
}
function playTone() {
  try {
    soundContext ??= new AudioContext();
    const oscillator = soundContext.createOscillator();
    const gain = soundContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 480;
    gain.gain.setValueAtTime(globalSettings.volume / 1000, soundContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, soundContext.currentTime + .08);
    oscillator.connect(gain).connect(soundContext.destination);
    oscillator.start(); oscillator.stop(soundContext.currentTime + .08);
  } catch { /* Áudio é opcional; indisponibilidade não afeta a partida. */ }
}
function showScreen(id) {
  for (const element of document.querySelectorAll('.modal-screen')) element.classList.add('hidden');
  if (id === 'title') { $('#title-screen').classList.remove('hidden'); return; }
  const screen = id === 'new-game' ? 'setup-screen' : id === 'continue' ? 'slots-screen' : 'info-screen';
  document.getElementById(screen).classList.remove('hidden');
  if (id === 'new-game') renderArchetypes();
  if (id === 'continue') renderSlots();
  if (id === 'settings') renderSettings();
  if (id === 'credits') renderCredits();
}
function renderArchetypes() {
  $('#archetype-list').innerHTML = Object.entries(game.data.archetypes).map(([id, archetype]) => `<button class="archetype-option ${id === selectedArchetype ? 'selected' : ''}" data-archetype="${id}"><strong>${esc(archetype.name)}</strong><span>${esc(archetype.desc)}</span></button>`).join('');
}
function renderSlots() {
  $('#save-slots').innerHTML = game.saves().map(slot => `<div class="slot-card"><div>${slot.name ? `<strong>${esc(slot.name)}</strong><p>ESPAÇO ${slot.slot} · ${slot.chapter !== null ? `CAPÍTULO ${Math.min(slot.chapter + 1, 8)}` : 'JORNADA'}</p><p>${esc(new Date(slot.savedAt).toLocaleString('pt-BR'))}</p>` : `<strong>Espaço ${slot.slot}</strong><p class="slot-empty">Nenhuma lembrança guardada</p>`}</div><button class="button ${slot.name ? 'button-primary' : ''}" data-load-slot="${slot.slot}" ${slot.name ? '' : 'disabled'}>${slot.name ? 'Carregar' : 'Vazio'}</button></div>`).join('');
}
function renderSettings() {
  $('#info-title').textContent = 'Configurações';
  $('#info-content').innerHTML = `<div class="setting-row"><label for="volume-setting">Volume de efeitos</label><input id="volume-setting" type="range" min="0" max="100" value="${globalSettings.volume}"></div><div class="setting-row"><label for="motion-setting">Reduzir animações</label><input id="motion-setting" type="checkbox" ${globalSettings.reducedMotion ? 'checked' : ''}></div><div class="setting-row"><label for="text-setting">Tamanho do texto</label><input id="text-setting" type="range" min="85" max="125" step="5" value="${globalSettings.textSize}"></div><p class="credit-copy">Atalhos: <strong>1–7</strong> trocam de painel, <strong>M</strong> abre o mapa, <strong>J</strong> abre missões e <strong>Ctrl+S</strong> salva.</p>`;
}
function renderCredits() {
  $('#info-title').textContent = 'Créditos';
  $('#info-content').innerHTML = `<p class="credit-copy"><strong>Crônicas do Último Eclipse</strong><br>Uma história original ambientada em Eryndor.<br><br>Concepção, narrativa e sistemas: equipe de desenvolvimento.<br>Tecnologia: HTML5, CSS3 e JavaScript moderno.<br>Feito para funcionar localmente, sem conta ou serviço externo.</p>`;
}
function setTab(next) {
  tab = next;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  render();
}
function progressPercent(value, max) { return Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100)); }
function fmtStats(stats) { return `ATQ ${Math.floor(stats.atk)} · MAG ${Math.floor(stats.mag)} · DEF ${Math.floor(stats.def)} · VEL ${Math.floor(stats.spd)}`; }
function actorName(id, state) { return id === 'hero' ? state.character.name : state.party[id]?.name ?? id; }
function currentActorId(state) { return state.battle.queue[state.battle.turn % state.battle.queue.length]; }

function renderHeader(state) {
  const region = game.data.regions.find(item => item.id === state.currentRegion);
  $('#top-location').textContent = region.name;
  $('#top-gold').textContent = `◈ ${state.gold}`;
  $('#top-level').textContent = `NV. ${state.character.level}`;
  $('#hero-name-label').textContent = state.character.name;
  $('#hero-class-label').textContent = `${game.data.archetypes[state.character.archetype].name} · Nv. ${state.character.level}`;
  $('#hp-label').textContent = `${state.character.hp} / ${state.character.stats.hp}`;
  $('#mp-label').textContent = `${state.character.mp} / ${state.character.stats.mp}`;
  $('#xp-label').textContent = `${state.character.xp} / ${state.character.nextXp}`;
  $('#hp-meter').style.width = `${progressPercent(state.character.hp, state.character.stats.hp)}%`;
  $('#mp-meter').style.width = `${progressPercent(state.character.mp, state.character.stats.mp)}%`;
  $('#xp-meter').style.width = `${progressPercent(state.character.xp, state.character.nextXp)}%`;
  const active = state.partyOrder.filter(id => state.party[id]?.recruited).slice(0, 3);
  $('#party-rail').innerHTML = active.map(id => {
    const member = state.party[id];
    return `<div class="party-member"><span class="party-glyph">${esc(member.name[0])}</span><strong>${esc(member.name)}</strong><small>${esc(member.role)} · Nv. ${member.level}</small><div class="party-hp"><i style="width:${progressPercent(member.hp, member.stats.hp)}%"></i></div></div>`;
  }).join('') || '<p class="empty-list">Ninguém caminha ao seu lado.</p>';
  const events = [...(state.battle?.log ?? []), ...state.flags.eventChoices, ...state.flags.rewards.map(reward => `Recompensa: ${reward}`)].slice(-4).reverse();
  $('#event-rail').innerHTML = events.map((event, index) => `<div class="rail-event"><time>${index === 0 ? 'AGORA' : `${index + 1} REGISTROS ATRÁS`}</time>${esc(event)}</div>`).join('') || '<div class="rail-event">O mundo aguarda sua primeira decisão.</div>';
}

function renderHeading(eyebrow, title, subtitle = '', actions = '') {
  return `<header class="page-heading"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</header>`;
}
function storyScene(state, chapter) {
  const scene = chapter?.scenes[state.quests.sceneIndex];
  if (!chapter || !scene || chapter.region !== state.currentRegion || state.flags.sceneDone) return '';
  if (chapter.id === 'chapter-7' && !state.progress.completedBosses.includes('nharos')) return '';
  return `<section class="story-card"><span class="eyebrow">${esc(chapter.title)} · ${esc(scene.speaker)}</span><p>“${esc(scene.text)}”</p><div class="choice-list">${scene.choices.map((choice, index) => `<button class="choice-button" data-choice="${index}">${esc(choice.text)} <span style="color:var(--muted)">· ${esc(choice.consequence)}</span></button>`).join('')}</div></section>`;
}
function renderBattle(state) {
  const battle = state.battle;
  if (battle.finished) {
    const victory = battle.result === 'victory';
    return `<section class="battle-outcome"><span class="eyebrow">${victory ? 'O CONFRONTO TERMINOU' : 'RECUO TÁTICO'}</span><h2>${victory ? 'Vitória' : battle.result === 'escaped' ? 'Fuga' : 'O grupo resiste'}</h2><p>${esc(battle.log.at(-1))}</p><div class="world-actions"><button class="button button-primary" data-dismiss-battle>Voltar à jornada</button><button class="button" data-tab="inventory">Inventário</button></div></section>`;
  }
  const enemy = battle.enemy;
  const actorId = currentActorId(state);
  const actor = actorId === 'hero' ? state.character : state.party[actorId];
  const isEnemyTurn = actorId === 'enemy';
  const switchControl = !isEnemyTurn && battle.round === 1 && battle.turn <= 1 && state.inventory.gear.length ? `<div class="skill-list"><select id="battle-equipment" aria-label="Equipamento para troca no primeiro turno">${state.inventory.gear.map(id => equipment.find(item => item.id === id)).filter(gear => gear && gear.level <= actor.level).map(gear => `<option value="${gear.id}">${esc(gear.name)} · ${esc(gear.slot)}</option>`).join('')}</select><button class="mini-button" data-switch-gear>Trocar equipamento</button></div>` : '';
  const skillButtons = !isEnemyTurn && actor.skills.map(id => {
    const skill = skills[id]; return `<button class="skill-button" title="${esc(skill.desc)}" data-skill="${id}" ${actor.mp < skill.cost ? 'disabled' : ''}>${esc(skill.name)}<small>${skill.cost} PM</small></button>`;
  }).join('');
  const consumables = Object.entries(state.inventory.items).filter(([id, count]) => count > 0 && items[id]?.kind === 'consumable').map(([id, count]) => `<button class="skill-button" title="${esc(items[id].desc)}" data-item="${esc(id)}">${esc(items[id].name)} ×${count}</button>`).join('');
  return `<section class="battle-panel"><div class="battle-heading"><div><span class="eyebrow">${battle.bossId ? 'CHEFE · COMBATE POR TURNOS' : 'ENCONTRO · COMBATE POR TURNOS'}</span><h2>${esc(enemy.name)}</h2></div>${battle.bossId ? '<span class="boss-tag">FRAGMENTO SELADO</span>' : `<span class="pill">NV. ${enemy.level}</span>`}</div><div class="enemy-vitals"><div class="vital-label"><span>VIDA DO INIMIGO</span><b>${enemy.hp} / ${enemy.maxHp}</b></div><div class="meter"><i class="meter-hp" style="width:${progressPercent(enemy.hp, enemy.maxHp)}%"></i></div></div><p class="boss-lore">${battle.bossId ? esc(game.data.bosses.find(item => item.id === battle.bossId)?.story) : `${esc(enemy.move)} · Fraqueza: ${esc(enemy.weakness)} · Resistência: ${esc(enemy.resist)}.`}</p><div class="actor-turn">${isEnemyTurn ? 'O inimigo age…' : `SUA VEZ · ${esc(actor.name)} · ${actor.hp}/${actor.stats.hp} PV · ${actor.mp}/${actor.stats.mp} PM · ${actor.vigor} VIG`}</div><div class="combat-controls"><button class="button button-primary" data-action="attack" ${isEnemyTurn ? 'disabled' : ''}>Atacar</button><button class="button" data-action="defend" ${isEnemyTurn ? 'disabled' : ''}>Defender</button>${!battle.bossId ? '<button class="button" data-action="run" title="Chance maior com velocidade alta">Fugir</button>' : ''}</div>${switchControl}${skillButtons ? `<div class="skill-list">${skillButtons}</div>` : ''}${consumables ? `<div class="skill-list">${consumables}</div>` : ''}<div class="combat-feed" aria-label="Registro de combate">${battle.log.slice(-8).map(line => `<div class="combat-line">${esc(line)}</div>`).join('')}</div><div class="vital-label"><span>RODADA ${battle.round} · TURNO DE ${esc(isEnemyTurn ? enemy.name : actor.name)}</span><span>ORDEM POR VELOCIDADE</span></div></section>`;
}
function renderWorld(state) {
  const region = game.data.regions.find(item => item.id === state.currentRegion);
  const chapter = activeChapter(state);
  const scene = storyScene(state, chapter);
  if (state.battle && !state.battle.finished) return renderHeading('A JORNADA CONTINUA', region.name, region.tone) + renderBattle(state);
  if (state.battle?.finished) return renderHeading('A JORNADA CONTINUA', region.name, region.tone) + renderBattle(state);
  const boss = game.data.bosses.find(item => item.region === region.id);
  const bossButton = boss && !state.progress.completedBosses.includes(boss.id) ? `<button class="button button-primary" data-begin-boss>${boss.id === 'bell-warden' ? 'Enfrentar o Vigia do Sino' : `Enfrentar ${esc(boss.name)}`}</button>` : '';
  const chapterLine = chapter?.region === region.id ? chapter.title : 'As estradas ainda lembram o caminho';
  const points = region.points.map((point, index) => `<button class="poi-button" data-interact="${esc(point)}" ${state.discoveries[region.id]?.includes(point) ? 'disabled' : ''}>${esc(point)}<small>${state.discoveries[region.id]?.includes(point) ? 'INVESTIGADO' : index === region.points.length - 1 ? 'POSSÍVEL SEGREDO' : 'INVESTIGAR'}</small></button>`).join('');
  const ending = state.ending ? `<section class="story-card"><span class="eyebrow">EPÍLOGO · FINAL ${esc(state.ending.toUpperCase())}</span><p>${esc(({ Aurora: 'Um sol novo nasce. O grupo regressa aos reinos; você permanece no céu para guardar a luz que escolheu.', Crepúsculo: 'Os sete reinos permanecem vivos sob o crepúsculo. Ninguém promete que o sol voltará, mas ninguém precisa enfrentá-lo sozinho.', Retorno: 'Valdora retorna ao lugar de onde foi apagada. O preço tem dois nomes; os que ficaram os guardam em voz alta.' })[state.ending])}</p></section>` : '';
  return `${renderHeading('A JORNADA CONTINUA', region.name, region.tone)}<section class="world-banner"><span class="eyebrow">${esc(region.kind)} · NÍVEL ${region.level}+</span><h2>${esc(region.name)}</h2><p>${esc(region.event)}</p><div class="world-meta"><span>${esc(region.people)}</span><span>${region.foes.length} ameaças conhecidas</span><span>${esc(region.resources.join(' · '))}</span></div></section>${ending}${scene}<div class="world-actions"><button class="button button-primary" data-explore>Explorar a região</button>${bossButton}<button class="button" data-rest>Pousada · 8 ◈</button><button class="button" data-tab="map">Ver mapa</button></div><div class="section-title"><h3>Pontos de interesse</h3><span>${state.discoveries[region.id]?.length ?? 0} / ${region.points.length} investigados</span></div><div class="poi-list">${points}</div>${chapter?.region === region.id && !state.flags.sceneDone ? `<p class="field-label">As escolhas da cena atual precisam ser tomadas antes do chefe.</p>` : ''}`;
}

function renderCharacter(state) {
  const stats = game.stats();
  const attrs = [['might','Força','Ataque físico +0,7'],['wit','Intelecto','Ataque mágico +0,7'],['endurance','Vigor','Defesa +0,65; +3 PV ao investir'],['agility','Agilidade','Velocidade +0,5; esquiva +0,5%'],['luck','Sorte','Precisão +0,3%; crítico +0,4%']];
  const attributes = attrs.map(([id, label, desc]) => `<div class="attribute-row"><div><strong>${label} · ${state.character.attributes[id]}</strong><p>${desc}</p></div><button class="mini-button" data-attribute="${id}" ${state.character.attributePoints < 1 ? 'disabled' : ''}>+1</button></div>`).join('');
  return `${renderHeading('FICHA DO SOBREVIVENTE', state.character.name, `${game.data.archetypes[state.character.archetype].name} · nível ${state.character.level} · ${state.character.xp}/${state.character.nextXp} EXP`)}<div class="stat-grid">${[['PV',state.character.stats.hp],['PM',state.character.stats.mp],['VIGOR',state.character.stats.vigor],['ATAQUE',Math.floor(stats.atk)],['MAGIA',Math.floor(stats.mag)],['DEFESA',Math.floor(stats.def)],['VELOCIDADE',Math.floor(stats.spd)],['CRÍTICO',`${Math.round(stats.crit * 100)}%`],['PRECISÃO',`${Math.round(stats.accuracy * 100)}%`],['ESQUIVA',`${Math.round(stats.dodge * 100)}%`],['RESISTÊNCIA',`${Math.round(stats.resistance * 100)}%`],['SORTE',stats.luck]].map(([label,value]) => `<div class="stat-cell"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><div class="section-title"><h3>Atributos</h3><span>${state.character.attributePoints} pontos para distribuir</span></div>${attributes}<div class="section-title"><h3>Equipamento ativo</h3><span>Bônus incluídos nos atributos</span></div>${Object.entries(state.equipment.hero).map(([slot,id]) => { const gear = equipment.find(item => item.id === id); return `<div class="gear-row"><span class="gear-slot">${esc(slot)}</span><strong>${esc(gear?.name ?? 'Vazio')}</strong><span class="pill">${gear ? esc(fmtStats(game.stats())) : '—'}</span></div>`; }).join('') || '<div class="empty-state">Nenhum equipamento equipado.</div>'}`;
}

function renderMap(state) {
  const regions = game.data.regions.map((region, index) => {
    const unlocked = state.unlockedRegions.includes(region.id);
    const current = state.currentRegion === region.id;
    const completed = game.data.bosses.find(boss => boss.region === region.id && state.progress.completedBosses.includes(boss.id));
    return `<button class="region-card ${current ? 'current' : ''}" data-index="0${index + 1}" data-travel="${region.id}" ${unlocked && !current ? '' : 'disabled'}><span class="eyebrow">${esc(region.kind)} · Nv. ${region.level}+</span><strong>${esc(region.name)}</strong><p>${esc(region.tone)}</p><small>${current ? 'VOCÊ ESTÁ AQUI' : completed ? 'SELO ROMPIDO · VISITADA' : unlocked ? 'ROTA ABERTA' : '◈ ROTA SELADA'}</small></button>`;
  }).join('');
  return `${renderHeading('CARTOGRAFIA', 'O mapa de Eryndor', `${state.visitedRegions.length} regiões visitadas · ${state.unlockedRegions.length} rotas abertas`)}<div class="story-card"><span class="eyebrow">OS SETE FRAGMENTOS</span><p>Há trezentos anos, sete reinos selaram os fragmentos. Cada selo quebrado abre a estrada seguinte; as regiões ainda ocultas não podem ser alcançadas pela força.</p></div><div class="map-grid">${regions}</div>`;
}

function renderQuests(state) {
  const main = activeChapter(state);
  const mainView = main ? `<div class="quest-row"><div><span class="eyebrow">CAMPANHA PRINCIPAL · ${esc(main.title)}</span><strong>${esc(main.objective)}</strong><p>Região: ${esc(game.data.regions.find(item => item.id === main.region)?.name)}</p></div><span class="quest-status active">ATIVA</span></div>` : `<div class="quest-row"><div><span class="eyebrow">CAMPANHA PRINCIPAL</span><strong>O eclipse terminou. Os reinos lembram sua escolha.</strong><p>Final: ${esc(state.ending ?? 'ainda não escolhido')}</p></div><span class="quest-status completed">ENCERRADA</span></div>`;
  const sides = game.data.sideQuests.map(quest => {
    const status = state.quests.side[quest.id];
    const local = quest.region === state.currentRegion;
    const action = sideAction(quest.id);
    const canResolve = status === 'active' && local && questReady(state, quest.id, action);
    return `<div class="quest-row"><div><span class="eyebrow">${esc(game.data.regions.find(item => item.id === quest.region)?.name)} · SECUNDÁRIA</span><strong>${esc(quest.name)}</strong><p>${esc(quest.objective)}</p><p>Recompensa: ${esc(quest.reward)} · ${quest.gold} moedas</p></div><div class="inline-actions"><span class="quest-status ${status}">${status === 'available' ? 'DISPONÍVEL' : status === 'active' ? 'ATIVA' : 'CONCLUÍDA'}</span>${status === 'available' && local ? `<button class="mini-button" data-accept-quest="${quest.id}">Aceitar</button>` : ''}${canResolve ? `<button class="mini-button" data-resolve-quest="${quest.id}" data-quest-action="${action}">Concluir</button>` : ''}</div></div>`;
  }).join('');
  const personal = Object.values(state.quests.personal).map(quest => `<div class="quest-row"><div><span class="eyebrow">MISSÃO PESSOAL</span><strong>${esc(quest.name)}</strong><p>${esc(quest.objective)}</p></div><span class="quest-status active">${esc(quest.state.toUpperCase())}</span></div>`).join('');
  return `${renderHeading('DIÁRIO', 'Missões e promessas', `${state.quests.completed.length} objetivos concluídos`)}<div class="section-title"><h3>Campanha</h3><span>DECISÕES COM CONSEQUÊNCIAS</span></div>${mainView}<div class="section-title"><h3>Jornadas pessoais</h3><span>${Object.keys(state.quests.personal).length} / 6</span></div>${personal || '<div class="empty-state">Recrute aliados para conhecer suas histórias.</div>'}<div class="section-title"><h3>Missões secundárias</h3><span>20 HISTÓRIAS LOCAIS</span></div>${sides}`;
}
function sideAction(id) {
  const index = Number(id.split('-')[1]);
  if ([3,5,10,14].includes(index)) return 'collect';
  if ([2,9,15,20].includes(index)) return 'boss';
  if (index === 4) return 'defeat';
  return 'explore';
}
function questReady(state, questId, action) {
  const questIndex = Number(questId.split('-')[1]);
  const region = game.data.regions.find(item => item.id === game.data.sideQuests.find(quest => quest.id === questId)?.region);
  if (action === 'explore') return (state.discoveries[region.id]?.length ?? 0) > 0;
  if (action === 'collect') {
    const resource = region.resources[0];
    const count = [3,10,14].includes(questIndex) ? 2 : 1;
    return (state.inventory.items[resource] ?? 0) >= count;
  }
  if (action === 'boss') return state.progress.completedBosses.some(id => game.data.bosses.find(boss => boss.id === id)?.region === region.id);
  if (action === 'defeat') return (state.flags.defeatedEnemies?.['lobo de espinho'] ?? 0) >= 2;
  return false;
}

function renderInventory(state) {
  const owned = state.inventory.gear.map(id => equipment.find(item => item.id === id)).filter(Boolean);
  const gearList = owned.map(gear => {
    const current = equipment.find(item => item.id === state.equipment.hero[gear.slot]);
    const comparison = current ? `Comparado a ${esc(current.name)}: ATQ ${gear.atk-current.atk>=0?'+':''}${gear.atk-current.atk} · MAG ${gear.mag-current.mag>=0?'+':''}${gear.mag-current.mag} · DEF ${gear.def-current.def>=0?'+':''}${gear.def-current.def}` : 'Espaço livre';
    return `<div class="item-row"><span class="gear-slot">${esc(gear.slot)}</span><div class="item-detail"><strong class="rarity-${gear.rarity}">${esc(gear.name)}</strong><p>${fmtStats({ atk: gear.atk, mag: gear.mag, def: gear.def, spd: 0 })} · ${gear.effect ? esc(gear.effect) : 'Sem efeito adicional'} · ${comparison} · requer Nv. ${gear.level}</p></div><div class="inline-actions"><button class="mini-button" data-equip="${gear.id}" ${gear.level > state.character.level ? 'disabled' : ''}>Equipar</button><button class="mini-button" data-sell="${gear.id}" title="Vende por 45% do valor">Vender</button><button class="mini-button" data-dismantle="${gear.id}" title="Desmontar em materiais">Desmontar</button></div></div>`;
  }).join('');
  const equipped = Object.entries(state.equipment.hero).map(([slot,id]) => { const gear = equipment.find(item => item.id === id); return `<div class="item-row"><span class="gear-slot">${esc(slot)}</span><div class="item-detail"><strong class="rarity-${gear?.rarity ?? 'common'}">${esc(gear?.name ?? 'Vazio')}</strong><p>${gear ? `ATQ ${gear.atk} · MAG ${gear.mag} · DEF ${gear.def}` : 'Nenhum bônus'}</p></div>${gear ? `<button class="mini-button" data-unequip="${esc(slot)}">Desequipar</button>` : ''}</div>`; }).join('');
  const materials = Object.entries(state.inventory.items).map(([id,count]) => `<div class="item-row"><div class="item-detail"><strong>${esc(items[id]?.name ?? id)} ×${count}</strong><p>${esc(items[id]?.desc ?? 'Item de aventura.')}</p></div>${items[id]?.kind === 'consumable' ? `<button class="mini-button" data-use-item="${esc(id)}">Usar</button>` : ''}</div>`).join('');
  const recipes = game.data.recipes?.map(recipe => `<div class="list-row"><div><strong>${esc(recipe.name)}</strong><p>${Object.entries(recipe.needs).map(([id,count]) => `${esc(items[id]?.name ?? id)} ×${count}`).join(' · ')}</p></div><button class="mini-button" data-craft="${recipe.id}">Fabricar</button></div>`).join('') ?? '';
  return `${renderHeading('PERTENCES', 'Inventário', `${owned.length} equipamentos · ${Object.values(state.inventory.items).reduce((sum,count) => sum + count,0)} itens · ${state.gold} moedas`, '<button class="button" data-open-shop>Mercador e forja</button>')}<div class="section-title"><h3>Equipados</h3><span>PROTAGONISTA</span></div>${equipped}<div class="section-title"><h3>Arsenal</h3><span>${owned.length} PEÇAS</span></div>${gearList || '<div class="empty-state">Nenhum equipamento guardado.</div>'}<div class="section-title"><h3>Materiais e consumíveis</h3><span>ITENS COM EFEITO DESCRITO</span></div>${materials || '<div class="empty-state">A bolsa está vazia.</div>'}<div class="section-title"><h3>Receitas</h3><span>CRIAÇÃO E MELHORIA</span></div>${recipes}`;
}

function renderShop(state) {
  const available = equipment.filter(gear => gear.level <= state.character.level && !state.inventory.gear.includes(gear.id) && !Object.values(state.equipment).some(slots => Object.values(slots).includes(gear.id)));
  return `${renderHeading('MERCADO DE FRONTEIRA', 'Troca e forja', `${state.gold} moedas disponíveis`, '<button class="button" data-tab="inventory">Voltar ao inventário</button>')}<div class="section-title"><h3>Arsenal à venda</h3><span>PREÇO E ATRIBUTOS À VISTA</span></div>${available.map(gear => `<div class="item-row"><span class="gear-slot">${esc(gear.slot)}</span><div class="item-detail"><strong class="rarity-${gear.rarity}">${esc(gear.name)}</strong><p>${fmtStats({ atk: gear.atk, mag: gear.mag, def: gear.def, spd: 0 })} · ${gear.effect ? esc(gear.effect) : 'Sem efeito adicional'}</p></div><button class="mini-button" data-buy="${gear.id}" ${state.gold < gear.price ? 'disabled' : ''}>${gear.price} ◈</button></div>`).join('')}</div>`;
}

function renderCompanions(state) {
  const cards = game.data.companions.map(companion => {
    const member = state.party[companion.id];
    const recruited = member.recruited;
    const available = state.visitedRegions.includes(({maelis:'valdora',oren:'nacre',ysold:'vhal',oru:'sarga',nima:'azrakh',serik:'bastiao'})[companion.id]);
    const inParty = state.partyOrder.filter(id => state.party[id]?.recruited).slice(0,3).includes(companion.id);
    return `<article class="companion-card"><span class="companion-avatar">${esc(companion.name[0])}</span><div class="companion-copy"><span class="eyebrow">${esc(companion.role)} · ${recruited ? `Nv. ${member.level}` : available ? 'À SUA ESPERA' : 'AINDA NÃO ENCONTRADO'}</span><strong>${esc(companion.name)}</strong><p>${esc(companion.history)} ${recruited ? `“${esc(companion.greeting)}”` : ''}</p>${recruited ? `<p>Personalidade: ${esc(companion.personality)} · Habilidade: ${esc(skills[companion.skill].name)} · Afinidade: ${member.affinity}</p><div class="affinity-meter"><i style="width:${Math.min(100,Math.max(0,member.affinity*10+50))}%"></i></div><p>Missão: ${esc(companion.personalQuest)}</p>` : ''}</div><div class="inline-actions">${recruited ? `<button class="mini-button" data-party-toggle="${companion.id}">${inParty ? 'Retirar' : 'Adicionar'}</button>` : available ? `<button class="mini-button" data-recruit="${companion.id}">Conversar e recrutar</button>` : '<span class="pill">NÃO ENCONTRADO</span>'}</div></article>`;
  }).join('');
  return `${renderHeading('SEU GRUPO', 'Quem caminha com você', `${state.partyOrder.filter(id => state.party[id]?.recruited).slice(0,3).length} / 3 companheiros · o protagonista completa o grupo`)}<div class="story-card"><span class="eyebrow">UMA COMPANHIA, NÃO UM DESTINO</span><p>Companheiros acumulam experiência, têm habilidades próprias e lembram o que você escolheu. No combate, cada integrante ativo recebe seu próprio turno pela velocidade.</p></div>${cards}`;
}

function renderSkills(state) {
  const list = Object.entries(skills).map(([id,skill]) => {
    const learned = state.character.skills.includes(id);
    return `<div class="skill-row"><div><strong>${esc(skill.name)}</strong><p>${esc(skill.desc)} ${skill.cost ? `· ${skill.cost} PM` : ''} ${skill.element ? `· ${esc(skill.element)}` : ''}</p></div>${learned ? '<span class="pill">APRENDIDA</span>' : `<button class="mini-button" data-learn="${id}" ${state.character.skillPoints < 1 ? 'disabled' : ''}>Aprender</button>`}</div>`;
  }).join('');
  const options = game.data.specializations[state.character.archetype];
  const specialization = state.character.specialization ? `<div class="story-card"><span class="eyebrow">CAMINHO ESCOLHIDO</span><p>${esc(options.find(item => item.id === state.character.specialization)?.name)} · não pode ser trocado depois de aceito.</p></div>` : state.character.level >= 5 ? options.map(item => `<div class="skill-row"><div><strong>${esc(item.name)}</strong><p>${esc(item.desc)}</p></div><button class="mini-button" data-specialize="${item.id}">Especializar</button></div>`).join('') : `<div class="empty-state">A escolha permanente abre no nível 5. Seu nível atual: ${state.character.level}.</div>`;
  return `${renderHeading('DISCIPLINA', 'Habilidades e especializações', `${state.character.skillPoints} pontos de habilidade · o arquétipo define sua vantagem inicial`)}<div class="section-title"><h3>Árvore de habilidades</h3><span>ELEMENTOS · CONTROLE · SUPORTE</span></div>${list}<div class="section-title"><h3>Especialização</h3><span>NÍVEL 5 · ESCOLHA PERMANENTE</span></div>${specialization}`;
}
function renderJournal(state) {
  const completed = state.quests.completed.map(id => `<div class="log-entry">Missão registrada: ${esc(id.startsWith('side-') ? game.data.sideQuests.find(q => q.id === id)?.name : id)}</div>`).join('');
  const choices = Object.entries(state.choices).map(([key,value]) => `<div class="log-entry">Escolha: ${esc(key)} · ${value ? 'sim' : 'não'}</div>`).join('');
  const events = state.flags.eventChoices.map(value => `<div class="log-entry">${esc(value)}</div>`).join('');
  const secrets = state.flags.secrets.map(value => `<div class="log-entry">Segredo: ${esc(value.split(':').slice(1).join(':'))}</div>`).join('');
  const combat = (state.battle?.log ?? []).map(line => `<div class="log-entry">${esc(line)}</div>`).join('');
  return `${renderHeading('MEMÓRIA DE ERYNDOR', 'Crônica da jornada', `${Object.keys(state.choices).length} decisões registradas · ${state.encounters} encontros iniciados`)}<div class="section-title"><h3>Decisões</h3></div>${choices || '<div class="empty-list">Nenhuma escolha foi feita ainda.</div>'}<div class="section-title"><h3>Missões concluídas</h3></div>${completed || '<div class="empty-list">Nenhuma missão concluída.</div>'}<div class="section-title"><h3>Eventos e segredos</h3></div>${secrets}${events || '<div class="empty-list">Os lugares ainda não revelaram seus segredos.</div>'}<div class="section-title"><h3>Combate mais recente</h3></div>${combat || '<div class="empty-list">Nenhum combate registrado.</div>'}`;
}

function render() {
  if (!game.state) return;
  const state = game.state;
  renderHeader(state);
  const panel = $('#main-panel');
  const view = ({ world: renderWorld, character: renderCharacter, map: renderMap, quests: renderQuests, inventory: renderInventory, shop: renderShop, companions: renderCompanions, skills: renderSkills, journal: renderJournal })[tab] ?? renderWorld;
  panel.innerHTML = view(state);
}
function applyResult(result) {
  notify(result.message, !result.ok);
  render();
}
function openGame() {
  for (const element of document.querySelectorAll('.modal-screen')) element.classList.add('hidden');
  $('#title-screen').classList.add('hidden');
  $('#game-shell').classList.remove('hidden');
  tab = 'world';
  setTab('world');
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.screen) { showScreen(button.dataset.screen); return; }
  if (button.dataset.closeModal !== undefined) { $('#info-screen').classList.add('hidden'); return; }
  if (button.dataset.archetype) { selectedArchetype = button.dataset.archetype; renderArchetypes(); return; }
  if (button.id === 'start-adventure') {
    const outcome = game.startNew({ name: $('#hero-name').value, archetype: selectedArchetype });
    saveSlot = 1;
    applyResult(outcome); openGame(); return;
  }
  if (button.dataset.loadSlot) {
    const loaded = game.load(Number(button.dataset.loadSlot));
    if (!loaded.ok) { notify(loaded.message, true); return; }
    saveSlot = Number(button.dataset.loadSlot); applyResult({ ok:true, message:loaded.message }); openGame(); return;
  }
  if (button.dataset.tab) { setTab(button.dataset.tab); return; }
  if (button.id === 'save-button' || button.id === 'quick-save') { applyResult(game.save(saveSlot)); return; }
  if (button.id === 'settings-button') { showScreen('settings'); return; }
  if (button.dataset.choice !== undefined) { applyResult(game.choose(Number(button.dataset.choice))); return; }
  if (button.dataset.explore !== undefined) { applyResult(game.explore()); return; }
  if (button.dataset.beginBoss !== undefined) { applyResult(game.beginBoss()); return; }
  if (button.dataset.dismissBattle !== undefined) { game.dismissBattle(); render(); return; }
  if (button.dataset.action) { applyResult(game.action({ type:button.dataset.action })); return; }
  if (button.dataset.skill) { applyResult(game.action({ type:'skill', skillId:button.dataset.skill, targetId: button.dataset.skill === 'mend' ? 'hero' : undefined })); return; }
  if (button.dataset.item) { applyResult(game.action({ type:'item', itemId:button.dataset.item })); return; }
  if (button.dataset.travel) { applyResult(game.travel(button.dataset.travel)); setTab('world'); return; }
  if (button.dataset.interact) { applyResult(game.interact(button.dataset.interact)); return; }
  if (button.dataset.attribute) { applyResult(game.improve(button.dataset.attribute)); return; }
  if (button.dataset.acceptQuest) { applyResult(game.acceptQuest(button.dataset.acceptQuest)); return; }
  if (button.dataset.resolveQuest) { applyResult(game.questAction(button.dataset.resolveQuest, button.dataset.questAction)); return; }
  if (button.dataset.equip) { applyResult(game.equip(button.dataset.equip)); return; }
  if (button.dataset.unequip) { applyResult(game.unequip(button.dataset.unequip)); return; }
  if (button.dataset.useItem) { applyResult(game.useItem(button.dataset.useItem)); return; }
  if (button.dataset.sell) { applyResult(game.sell(button.dataset.sell)); return; }
  if (button.dataset.buy) { applyResult(game.buy(button.dataset.buy)); return; }
  if (button.dataset.dismantle) { applyResult(game.dismantle(button.dataset.dismantle)); return; }
  if (button.dataset.craft) { applyResult(game.craft(button.dataset.craft)); return; }
  if (button.dataset.openShop !== undefined) { tab = 'shop'; render(); return; }
  if (button.dataset.recruit) { applyResult(game.recruit(button.dataset.recruit)); return; }
  if (button.dataset.partyToggle) {
    const party = game.state.partyOrder.filter(id => game.state.party[id]?.recruited).slice(0,3);
    const next = party.includes(button.dataset.partyToggle) ? party.filter(id => id !== button.dataset.partyToggle) : [...party, button.dataset.partyToggle];
    applyResult(game.setParty(next)); return;
  }
  if (button.dataset.learn) { applyResult(game.learn(button.dataset.learn)); return; }
  if (button.dataset.specialize) { applyResult(game.specialize(button.dataset.specialize)); return; }
  if (button.dataset.switchGear !== undefined) { applyResult(game.action({ type:'switch', gearId:$('#battle-equipment')?.value })); return; }
  if (button.dataset.rest !== undefined) { applyResult(game.rest()); return; }
});

document.addEventListener('input', event => {
  if (event.target.id === 'volume-setting') { globalSettings.volume = Number(event.target.value); saveSettings(); }
  if (event.target.id === 'text-setting') { globalSettings.textSize = Number(event.target.value); saveSettings(); }
});
document.addEventListener('change', event => {
  if (event.target.id === 'motion-setting') { globalSettings.reducedMotion = event.target.checked; saveSettings(); }
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (game.state) applyResult(game.save(saveSlot)); return; }
  if (!game.state || event.target.matches('input,textarea,select')) return;
  const key = event.key.toLowerCase();
  const shortcut = ({ '1':'world','2':'character','3':'map','4':'quests','5':'inventory','6':'companions','7':'skills','8':'journal','m':'map','j':'quests' })[key];
  if (shortcut) { setTab(shortcut); event.preventDefault(); }
  if (key === 'escape') { setTab('world'); }
});

// As telas de entrada também funcionam sem conta ou configuração prévia.
$('#title-screen').classList.remove('hidden');