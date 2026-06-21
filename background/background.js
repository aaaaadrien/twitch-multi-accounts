// background.js — Twitch Multi-Account
//
// Principe :
//   Chaque "slot" de compte stocke un snapshot des cookies twitch.tv.
//   Quand un onglet Twitch assigné à un slot devient actif, on restaure
//   les cookies de ce slot dans le navigateur — l'autre compte est ainsi
//   "chargé" pour cet onglet.
//
// Limitation connue : les cookies sont globaux par domaine dans Chromium.
// Les deux onglets partagent donc toujours les mêmes cookies à l'instant T.
// Le swap se fait au moment où tu actives un onglet (onActivated).

const TWITCH_DOMAINS = ["twitch.tv", "www.twitch.tv", "passport.twitch.tv", "gql.twitch.tv", "id.twitch.tv", "static.twitchsvc.net"];
const SLOTS_KEY   = "slots";    // { slotId: { id, name, color, cookies: [...] } }
const TAB_MAP_KEY = "tabSlots"; // { tabId: slotId }

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getSlots() {
  const d = await chrome.storage.local.get(SLOTS_KEY);
  return d[SLOTS_KEY] || {};
}
async function saveSlots(s) {
  await chrome.storage.local.set({ [SLOTS_KEY]: s });
}
async function getTabMap() {
  const d = await chrome.storage.local.get(TAB_MAP_KEY);
  return d[TAB_MAP_KEY] || {};
}
async function saveTabMap(m) {
  await chrome.storage.local.set({ [TAB_MAP_KEY]: m });
}

function genId() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ── Lecture des cookies Twitch actuels ───────────────────────────────────────

async function captureCurrentCookies() {
  const all = [];
  for (const domain of TWITCH_DOMAINS) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      all.push(...cookies);
    } catch {}
  }
  // Dédupliquer par (name + domain + path)
  const seen = new Set();
  return all.filter(c => {
    const key = c.name + "|" + c.domain + "|" + c.path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Restauration des cookies d'un slot ───────────────────────────────────────

async function restoreCookies(cookies) {
  // 1. Supprimer tous les cookies Twitch actuels
  const current = await captureCurrentCookies();
  for (const c of current) {
    const url = `https://${c.domain.replace(/^\./, "")}${c.path}`;
    try { await chrome.cookies.remove({ url, name: c.name }); } catch {}
  }

  // 2. Réécrire les cookies du slot
  for (const c of cookies) {
    const url = `https://${c.domain.replace(/^\./, "")}${c.path}`;
    const details = {
      url,
      name:     c.name,
      value:    c.value,
      domain:   c.domain,
      path:     c.path,
      secure:   c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
    };
    // Ne pas forcer expirationDate si le cookie est de session
    if (c.expirationDate) details.expirationDate = c.expirationDate;
    try { await chrome.cookies.set(details); } catch {}
  }
}

// ── Swap au changement d'onglet actif ────────────────────────────────────────

// Garde trace du dernier onglet Twitch actif (pour sauvegarder ses cookies avant swap)
let lastActiveTwitchTabId = null;
let lastActiveSlotId      = null;
let swapping              = false; // éviter les re-entrances

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (swapping) return;

  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { return; }
  if (!tab.url || !tab.url.includes("twitch.tv")) {
    // Onglet non-Twitch : pas de swap, mais on note qu'on a quitté Twitch
    return;
  }

  const tabMap  = await getTabMap();
  const slotId  = tabMap[tabId];

  if (!slotId) return; // onglet Twitch sans slot assigné — on ne touche rien

  // Si c'est le même slot que le dernier, rien à faire
  if (slotId === lastActiveSlotId) {
    lastActiveTwitchTabId = tabId;
    return;
  }

  swapping = true;
  try {
    const slots = await getSlots();

    // Sauvegarder les cookies actuels dans le slot précédent (s'il existe)
    if (lastActiveSlotId && slots[lastActiveSlotId]) {
      slots[lastActiveSlotId].cookies = await captureCurrentCookies();
      await saveSlots(slots);
    }

    // Restaurer les cookies du nouveau slot
    if (slots[slotId] && slots[slotId].cookies && slots[slotId].cookies.length > 0) {
      await restoreCookies(slots[slotId].cookies);
      // Les cookies sont swappés — le rechargement est laissé à l'initiative de l'utilisateur
    }

    lastActiveTwitchTabId = tabId;
    lastActiveSlotId      = slotId;
  } finally {
    swapping = false;
  }
});

// Nettoyer le tabMap quand un onglet est fermé
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const map = await getTabMap();
  if (map[tabId]) {
    delete map[tabId];
    await saveTabMap(map);
  }
  if (lastActiveTwitchTabId === tabId) {
    lastActiveTwitchTabId = null;
    lastActiveSlotId      = null;
  }
});

// ── Messages depuis le popup ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse).catch(e => sendResponse({ error: e.message }));
  return true;
});

async function handle(msg) {
  switch (msg.action) {

    // Lister les slots
    case "getSlots": {
      const slots = await getSlots();
      return Object.values(slots);
    }

    // Créer un slot et y capturer les cookies actuels
    case "createSlot": {
      const slots = await getSlots();
      const id    = genId();
      const cookies = await captureCurrentCookies();
      slots[id] = {
        id,
        name:    msg.name,
        color:   msg.color || "#9146ff",
        cookies,
        savedAt: Date.now(),
      };
      await saveSlots(slots);
      return slots[id];
    }

    // Mettre à jour le nom/couleur d'un slot
    case "updateSlot": {
      const slots = await getSlots();
      if (!slots[msg.id]) throw new Error("Slot introuvable");
      slots[msg.id] = { ...slots[msg.id], ...msg.data };
      await saveSlots(slots);
      return slots[msg.id];
    }

    // Rafraîchir les cookies d'un slot (re-snapshot depuis l'état actuel)
    case "refreshSlot": {
      const slots = await getSlots();
      if (!slots[msg.id]) throw new Error("Slot introuvable");
      slots[msg.id].cookies = await captureCurrentCookies();
      slots[msg.id].savedAt = Date.now();
      await saveSlots(slots);
      return slots[msg.id];
    }

    // Supprimer un slot
    case "deleteSlot": {
      const slots = await getSlots();
      delete slots[msg.id];
      await saveSlots(slots);
      // Désassigner les onglets liés
      const map = await getTabMap();
      for (const [tabId, slotId] of Object.entries(map)) {
        if (slotId === msg.id) delete map[tabId];
      }
      await saveTabMap(map);
      return true;
    }

    // Ouvrir un onglet Twitch assigné à un slot
    case "openTab": {
      const slots = await getSlots();
      if (!slots[msg.slotId]) throw new Error("Slot introuvable");

      // Sauvegarder l'état courant dans le slot actif avant de swapper
      if (lastActiveSlotId && slots[lastActiveSlotId]) {
        slots[lastActiveSlotId].cookies = await captureCurrentCookies();
        await saveSlots(slots);
      }

      // Restaurer les cookies du slot cible
      const slot = slots[msg.slotId];
      if (slot.cookies && slot.cookies.length > 0) {
        await restoreCookies(slot.cookies);
      }

      // Ouvrir l'onglet
      const tab = await chrome.tabs.create({ url: "https://www.twitch.tv/", active: true });

      // Assigner le slot à cet onglet
      const map = await getTabMap();
      map[tab.id] = msg.slotId;
      await saveTabMap(map);

      lastActiveTwitchTabId = tab.id;
      lastActiveSlotId      = msg.slotId;

      return { tabId: tab.id };
    }

    // Assigner l'onglet Twitch actif à un slot (sans swap)
    case "assignCurrentTab": {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("Aucun onglet actif");
      const map = await getTabMap();
      map[tab.id] = msg.slotId;
      await saveTabMap(map);
      return true;
    }

    // Quel slot est assigné à l'onglet actif ?
    case "getCurrentTabSlot": {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return null;
      const map = await getTabMap();
      return map[tab.id] || null;
    }

    default:
      throw new Error("Action inconnue : " + msg.action);
  }
}
