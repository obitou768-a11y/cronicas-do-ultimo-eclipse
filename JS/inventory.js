import { equipment, items, recipes } from './content.js';

export function addItem(state, id, quantity = 1) {
  if (!items[id] || !Number.isInteger(quantity) || quantity < 1) return false;
  state.inventory.items[id] = (state.inventory.items[id] ?? 0) + quantity;
  return true;
}

export function removeItem(state, id, quantity = 1) {
  const have = state.inventory.items[id] ?? 0;
  if (!Number.isInteger(quantity) || quantity < 1 || have < quantity) return false;
  if (have === quantity) delete state.inventory.items[id];
  else state.inventory.items[id] = have - quantity;
  return true;
}

export function equipItem(state, gearId, actorId = 'hero') {
  if (!state.inventory.gear.includes(gearId)) return { ok: false, message: 'Esse equipamento não está no inventário.' };
  const gear = equipment.find(item => item.id === gearId);
  const actor = actorId === 'hero' ? state.character : state.party[actorId];
  if (!gear || !actor || (actorId !== 'hero' && !actor.recruited)) return { ok: false, message: 'Equipamento ou personagem inválido.' };
  if (gear.level > actor.level) return { ok: false, message: `Requer nível ${gear.level}.` };
  const previous = state.equipment[actorId][gear.slot];
  const previousGear = equipment.find(item => item.id === previous);
  if (previous) state.inventory.gear.push(previous);
  state.equipment[actorId][gear.slot] = gear.id;
  state.inventory.gear = state.inventory.gear.filter(id => id !== gearId);
  const hpChange = gear.hp - (previousGear?.hp ?? 0);
  const mpChange = gear.mp - (previousGear?.mp ?? 0);
  actor.stats.hp = Math.max(1, actor.stats.hp + hpChange);
  actor.stats.mp = Math.max(0, actor.stats.mp + mpChange);
  actor.hp = Math.min(actor.stats.hp, actor.hp + hpChange);
  actor.mp = Math.min(actor.stats.mp, actor.mp + mpChange);
  return { ok: true, message: `${gear.name} equipado.` };
}

export function unequipItem(state, slot, actorId = 'hero') {
  const gearId = state.equipment[actorId]?.[slot];
  if (!gearId) return false;
  const actor = actorId === 'hero' ? state.character : state.party[actorId];
  const gear = equipment.find(item => item.id === gearId);
  actor.stats.hp = Math.max(1, actor.stats.hp - (gear?.hp ?? 0));
  actor.stats.mp = Math.max(0, actor.stats.mp - (gear?.mp ?? 0));
  actor.hp = Math.min(actor.stats.hp, actor.hp);
  actor.mp = Math.min(actor.stats.mp, actor.mp);
  state.inventory.gear.push(gearId);
  delete state.equipment[actorId][slot];
  return true;
}

export function sellItem(state, gearId) {
  const gear = equipment.find(item => item.id === gearId);
  const index = state.inventory.gear.indexOf(gearId);
  if (!gear || index < 0) return { ok: false, message: 'O item não pode ser vendido.' };
  state.inventory.gear.splice(index, 1);
  const earned = Math.floor(gear.price * 0.45);
  state.gold += earned;
  return { ok: true, message: `${gear.name} vendido por ${earned} moedas.` };
}

export function buyItem(state, gearId) {
  const gear = equipment.find(item => item.id === gearId);
  if (!gear || gear.level > state.character.level) return { ok: false, message: 'Item indisponível para seu nível.' };
  if (state.gold < gear.price) return { ok: false, message: 'Moedas insuficientes.' };
  if (state.inventory.gear.includes(gearId) || Object.values(state.equipment).some(slots => Object.values(slots).includes(gearId))) return { ok: false, message: 'Você já possui esse exemplar único.' };
  state.gold -= gear.price;
  state.inventory.gear.push(gearId);
  return { ok: true, message: `${gear.name} comprado.` };
}

export function craft(state, recipeId) {
  const recipe = recipes.find(item => item.id === recipeId);
  if (!recipe || Object.entries(recipe.needs).some(([id, count]) => (state.inventory.items[id] ?? 0) < count)) return { ok: false, message: 'Materiais insuficientes.' };
  if (recipe.upgrade) {
    const gearId = state.equipment.hero.weapon;
    if (!gearId) return { ok: false, message: 'Equipe uma arma antes de aprimorá-la.' };
    for (const [id, count] of Object.entries(recipe.needs)) removeItem(state, id, count);
    const gear = equipment.find(item => item.id === gearId);
    state.upgrades[gearId] = (state.upgrades[gearId] ?? 0) + 1;
    return { ok: true, message: `${gear?.name ?? 'Arma'} aprimorada: ataque e magia +2.` };
  }
  for (const [id, count] of Object.entries(recipe.needs)) removeItem(state, id, count);
  addItem(state, recipe.makes, recipe.count);
  return { ok: true, message: `${recipe.name} fabricado.` };
}

export function dismantle(state, gearId) {
  const index = state.inventory.gear.indexOf(gearId);
  const gear = equipment.find(item => item.id === gearId);
  if (index < 0 || !gear) return { ok: false, message: 'Só é possível desmontar itens não equipados.' };
  state.inventory.gear.splice(index, 1);
  addItem(state, 'ferro velho', 1 + (gear.rarity === 'rare' || gear.rarity === 'epic' ? 1 : 0));
  if (['epic', 'legendary', 'mythic'].includes(gear.rarity)) addItem(state, 'pó de selo', 1);
  return { ok: true, message: `${gear.name} desmontado em materiais.` };
}