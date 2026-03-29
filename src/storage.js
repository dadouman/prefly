// =====================================================================
// STORAGE LAYER — Pre-built lists & Admin
// =====================================================================
// Source of truth: Supabase `prebuilt_lists` table (shared across all users).
// Fallback: /lists.json (static file in public/) when Supabase is not
// configured or unreachable.
// =====================================================================

import { supabase } from "./supabaseClient";

const ADMIN_KEY = "arena_admin_pin";

// ── Supabase helpers ────────────────────────────────────────────────

// Convert a Supabase row to the app list shape
function rowToList(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    ...(row.format ? { format: row.format } : {}),
    items: row.items || [],
    ...(row.item_attributes && Object.keys(row.item_attributes).length > 0
      ? { itemAttributes: row.item_attributes }
      : {}),
  };
}

// Convert an app list to a Supabase row
function listToRow(list) {
  return {
    id: list.id,
    name: list.name,
    description: list.description || "",
    format: list.format || "",
    items: list.items || [],
    item_attributes: list.itemAttributes || {},
    updated_at: new Date().toISOString(),
  };
}

// ── Fetch lists (Supabase → fallback to static JSON) ────────────────

async function fetchFromSupabase() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("prebuilt_lists")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return null;
    return data.map(rowToList);
  } catch {
    return null;
  }
}

async function fetchRemoteLists() {
  try {
    const res = await fetch("/lists.json");
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// Seed Supabase from the static lists.json if the table is empty
async function seedSupabaseIfEmpty() {
  if (!supabase) return;
  try {
    const { count } = await supabase
      .from("prebuilt_lists")
      .select("id", { count: "exact", head: true });
    if (count > 0) return;
    const staticLists = await fetchRemoteLists();
    if (staticLists.length === 0) return;
    const rows = staticLists.map((l, i) => ({ ...listToRow(l), sort_order: i }));
    await supabase.from("prebuilt_lists").upsert(rows);
  } catch { /* silent */ }
}

// Returns the shared lists from Supabase (or static JSON as fallback).
export async function getPrebuiltLists() {
  // Try Supabase first
  const sbLists = await fetchFromSupabase();
  if (sbLists !== null) {
    if (sbLists.length === 0) {
      // Table exists but is empty — seed from static file
      await seedSupabaseIfEmpty();
      const seeded = await fetchFromSupabase();
      return seeded || await fetchRemoteLists();
    }
    return sbLists;
  }
  // Supabase not available — fall back to static file
  return await fetchRemoteLists();
}

// ── Admin CRUD (writes to Supabase) ─────────────────────────────────

export async function addPrebuiltList(list) {
  const newList = { ...list, id: crypto.randomUUID() };
  if (supabase) {
    const row = listToRow(newList);
    await supabase.from("prebuilt_lists").insert(row);
  }
  return await getPrebuiltLists();
}

export async function updatePrebuiltList(id, updates) {
  if (supabase) {
    const existing = (await getPrebuiltLists()).find((l) => l.id === id);
    if (existing) {
      const merged = { ...existing, ...updates, id };
      const row = listToRow(merged);
      await supabase.from("prebuilt_lists").update(row).eq("id", id);
    }
  }
  return await getPrebuiltLists();
}

export async function deletePrebuiltList(id) {
  if (supabase) {
    await supabase.from("prebuilt_lists").delete().eq("id", id);
  }
  return await getPrebuiltLists();
}

// Reset — re-seed from static lists.json
export async function resetToRemoteLists() {
  if (supabase) {
    await supabase.from("prebuilt_lists").delete().neq("id", "");
    await seedSupabaseIfEmpty();
  }
}

// Export current lists as a downloadable JSON file
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

// =====================================================================
// IMAGE SOURCE PREFERENCE — Wikipedia / TMDb
// =====================================================================
const IMG_SOURCE_KEY = "arena_image_source";

export function getImageSourcePref() {
  return localStorage.getItem(IMG_SOURCE_KEY) || "wikipedia";
}

export function setImageSourcePref(source) {
  localStorage.setItem(IMG_SOURCE_KEY, source);
}
