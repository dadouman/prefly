// =====================================================================
// STORAGE LAYER — Pre-built lists & Admin
// =====================================================================
// Source of truth: /lists.json (static file in public/)
// Admin edits are saved to localStorage as an overlay.
// To publish changes: use the "Exporter JSON" button in the admin panel
// and replace public/lists.json, then redeploy.
//
// Migration to Supabase/Firebase: replace fetchRemoteLists() and the
// save/add/update/delete functions with API calls. Everything else
// stays the same.
// =====================================================================

const LISTS_KEY = "arena_prebuilt_lists";
const ADMIN_KEY = "arena_admin_pin";
const LISTS_VERSION_KEY = "arena_lists_version";
// Bump this version string whenever public/lists.json changes.
// This invalidates the localStorage cache so visitors see the new data.
const LISTS_VERSION = "2";

// Fetch the static lists.json — this is what all visitors see
async function fetchRemoteLists() {
  try {
    const res = await fetch("/lists.json");
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// Returns admin-edited lists from localStorage, or fetches from the
// static JSON if no local overrides exist.
export async function getPrebuiltLists() {
  // Invalidate cache when the bundled lists version changes
  if (localStorage.getItem(LISTS_VERSION_KEY) !== LISTS_VERSION) {
    localStorage.removeItem(LISTS_KEY);
    localStorage.setItem(LISTS_VERSION_KEY, LISTS_VERSION);
  }
  try {
    const stored = localStorage.getItem(LISTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  // No local overrides — load from static file
  const remote = await fetchRemoteLists();
  return remote;
}

export function savePrebuiltLists(lists) {
  localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
}

export async function addPrebuiltList(list) {
  const lists = await getPrebuiltLists();
  lists.push({ ...list, id: crypto.randomUUID() });
  savePrebuiltLists(lists);
  return lists;
}

export async function updatePrebuiltList(id, updates) {
  const lists = await getPrebuiltLists();
  const idx = lists.findIndex((l) => l.id === id);
  if (idx !== -1) lists[idx] = { ...lists[idx], ...updates };
  savePrebuiltLists(lists);
  return lists;
}

export async function deletePrebuiltList(id) {
  const lists = (await getPrebuiltLists()).filter((l) => l.id !== id);
  savePrebuiltLists(lists);
  return lists;
}

// Reset local overrides — visitors will see the static lists.json again
export function resetToRemoteLists() {
  localStorage.removeItem(LISTS_KEY);
}

// Export current lists as a downloadable JSON file
// (to replace public/lists.json before redeploying)
export async function exportListsJSON() {
  const lists = await getPrebuiltLists();
  const json = JSON.stringify(lists, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lists.json";
  a.click();
  URL.revokeObjectURL(url);
}

// =====================================================================
// PAUSED SESSION — Save / Load / Clear
// =====================================================================
const PAUSED_KEY = "arena_paused_session";

export function savePausedSession(session) {
  localStorage.setItem(PAUSED_KEY, JSON.stringify({ ...session, timestamp: Date.now() }));
}

export function loadPausedSession() {
  try {
    const raw = localStorage.getItem(PAUSED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPausedSession() {
  localStorage.removeItem(PAUSED_KEY);
}

// Admin PIN — simple client-side gate
export function getAdminPin() {
  return localStorage.getItem(ADMIN_KEY);
}

export function setAdminPin(pin) {
  localStorage.setItem(ADMIN_KEY, pin);
}

export function verifyAdminPin(pin) {
  const stored = getAdminPin();
  if (!stored) return false;
  return stored === pin;
}

export function isAdminConfigured() {
  return !!getAdminPin();
}
