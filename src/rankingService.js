import { supabase } from "./supabaseClient";

// =====================================================================
// RANKING SERVICE — Supabase CRUD + localStorage fallback
// =====================================================================

const LOCAL_RANKINGS_KEY = "arena_rankings";

// ─── LOCAL STORAGE FALLBACK ───
function getLocalRankings() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_RANKINGS_KEY) || "[]");
  } catch { return []; }
}

function saveLocalRankings(rankings) {
  localStorage.setItem(LOCAL_RANKINGS_KEY, JSON.stringify(rankings));
}

// ─── SAVE ───
export async function saveRanking({ userId, listName, listId, mode, items, result, comparisonsCount, durationSeconds }) {
  const record = {
    list_name: listName || "Sans titre",
    list_id: listId || null,
    mode,
    items,
    result,
    comparisons_count: comparisonsCount,
    duration_seconds: durationSeconds || null,
    is_public: true,
  };

  if (supabase && userId) {
    const { data, error } = await supabase
      .from("rankings")
      .insert({ ...record, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Local fallback
  const local = getLocalRankings();
  const entry = { ...record, id: crypto.randomUUID(), user_id: null, created_at: new Date().toISOString() };
  local.unshift(entry);
  saveLocalRankings(local);
  return entry;
}

// ─── GET USER RANKINGS ───
export async function getUserRankings(userId, { limit = 50, offset = 0 } = {}) {
  if (supabase && userId) {
    const { data, error } = await supabase
      .from("rankings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data || [];
  }

  // Local fallback
  return getLocalRankings().slice(offset, offset + limit);
}

// ─── GET SINGLE ───
export async function getRankingById(id, userId) {
  if (supabase && userId) {
    const { data, error } = await supabase
      .from("rankings")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  return getLocalRankings().find(r => r.id === id) || null;
}

// ─── GET RANKINGS FOR A SPECIFIC LIST (for comparison) ───
export async function getRankingsForList(userId, listName) {
  if (supabase && userId) {
    const { data, error } = await supabase
      .from("rankings")
      .select("*")
      .eq("user_id", userId)
      .eq("list_name", listName)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  return getLocalRankings().filter(r => r.list_name === listName);
}

// ─── DELETE ───
export async function deleteRanking(id, userId) {
  if (supabase && userId) {
    const { error } = await supabase
      .from("rankings")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }

  const local = getLocalRankings().filter(r => r.id !== id);
  saveLocalRankings(local);
}

// ─── GET RECENT PUBLIC RANKINGS (ALL USERS — ACTIVITY FEED) ───
export async function getRecentPublicRankings({ limit = 50, offset = 0 } = {}) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("rankings")
    .select("*, profiles(pseudo, avatar_url)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data || [];
}

// ─── MIGRATE LOCAL RANKINGS TO SUPABASE ───
export async function migrateLocalRankings(userId) {
  if (!supabase || !userId) return 0;
  const local = getLocalRankings();
  if (local.length === 0) return 0;

  let migrated = 0;
  for (const r of local) {
    const { error } = await supabase
      .from("rankings")
      .insert({
        user_id: userId,
        list_name: r.list_name,
        list_id: r.list_id,
        mode: r.mode,
        items: r.items,
        result: r.result,
        comparisons_count: r.comparisons_count,
        duration_seconds: r.duration_seconds,
        is_public: r.is_public ?? true,
        created_at: r.created_at,
      });
    if (!error) migrated++;
  }

  if (migrated > 0) {
    localStorage.removeItem(LOCAL_RANKINGS_KEY);
  }
  return migrated;
}
