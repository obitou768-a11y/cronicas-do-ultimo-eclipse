const PREFIX = 'ultimo-eclipse-slot-';
const VERSION = 1;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validState(state) {
  return isRecord(state) && state.version === VERSION
    && isRecord(state.character) && typeof state.character.name === 'string'
    && isRecord(state.character.stats) && Number.isFinite(state.character.hp)
    && isRecord(state.party) && Array.isArray(state.partyOrder)
    && isRecord(state.inventory) && Array.isArray(state.inventory.gear) && isRecord(state.inventory.items)
    && isRecord(state.equipment) && isRecord(state.quests)
    && Number.isInteger(state.quests.chapterIndex) && isRecord(state.quests.main)
    && isRecord(state.quests.side) && isRecord(state.quests.personal) && Array.isArray(state.quests.completed)
    && isRecord(state.choices) && isRecord(state.flags)
    && isRecord(state.progress) && Array.isArray(state.progress.completedBosses);
}

export function writeSave(slot, state, storage = localStorage) {
  if (![1, 2, 3].includes(Number(slot))) return { ok: false, message: 'Espaço de salvamento inválido.' };
  try {
    storage.setItem(`${PREFIX}${slot}`, JSON.stringify({ version: VERSION, savedAt: new Date().toISOString(), state }));
    return { ok: true, message: `Partida salva no espaço ${slot}.` };
  } catch (error) {
    return { ok: false, message: `Não foi possível salvar: ${error.message}` };
  }
}

export function readSave(slot, storage = localStorage) {
  if (![1, 2, 3].includes(Number(slot))) return { ok: false, message: 'Espaço de salvamento inválido.' };
  try {
    const raw = storage.getItem(`${PREFIX}${slot}`);
    if (!raw) return { ok: false, message: 'Esse espaço está vazio.' };
    const parsed = JSON.parse(raw);
    if (parsed.version !== VERSION || !validState(parsed.state)) return { ok: false, message: 'Salvamento incompatível ou corrompido.' };
    return { ok: true, state: parsed.state, savedAt: parsed.savedAt };
  } catch {
    return { ok: false, message: 'Salvamento inválido; a partida atual não foi alterada.' };
  }
}

export function listSaves(storage = localStorage) {
  return [1, 2, 3].map(slot => {
    try {
      const value = JSON.parse(storage.getItem(`${PREFIX}${slot}`) ?? 'null');
      return { slot, savedAt: value?.savedAt ?? null, name: value?.state?.character?.name ?? null, chapter: value?.state?.quests?.chapterIndex ?? null };
    } catch { return { slot, savedAt: null, name: null, chapter: null }; }
  });
}