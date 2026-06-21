// popup.js — Twitch Multi-Account

const COLORS = [
  "#9146ff","#e74c3c","#3498db","#2ecc71",
  "#f39c12","#1abc9c","#e91e63","#00bcd4",
  "#ff5722","#8bc34a","#ff9800","#607d8b"
];

const send = (action, extra = {}) => chrome.runtime.sendMessage({ action, ...extra });

let slots        = [];   // tableau de slots
let currentSlot  = null; // slotId de l'onglet actif
let pendingColor = COLORS[0];
let editingId    = null;
let editColor    = COLORS[0];

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  [slots, currentSlot] = await Promise.all([
    send("getSlots"),
    send("getCurrentTabSlot"),
  ]);
  renderMain();
  bindUI();
});

// ── Render principale ─────────────────────────────────────────────────────────

function renderMain() {
  const list   = document.getElementById("slots-list");
  const noSlot = document.getElementById("no-slots");
  const tabInfo = document.getElementById("current-tab-info");
  const tabText = document.getElementById("tab-info-text");

  list.innerHTML = "";

  if (!slots.length) {
    noSlot.classList.remove("hidden");
    tabInfo.classList.add("hidden");
    return;
  }
  noSlot.classList.add("hidden");

  // Info onglet actif
  if (currentSlot) {
    const active = slots.find(s => s.id === currentSlot);
    if (active) {
      tabText.textContent = `Cet onglet → ${active.name}`;
      tabInfo.classList.remove("hidden");
    }
  } else {
    tabInfo.classList.add("hidden");
  }

  slots.forEach(slot => list.appendChild(makeSlotRow(slot)));
}

function makeSlotRow(slot) {
  const isActive = slot.id === currentSlot;
  const saved    = slot.savedAt ? new Date(slot.savedAt).toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "";

  const row = document.createElement("div");
  row.className = "slot-row";
  row.innerHTML = `
    <div class="slot-dot" style="background:${slot.color}"></div>
    <div style="flex:1;min-width:0">
      <div class="slot-name">${esc(slot.name)}</div>
      ${saved ? `<div class="slot-meta">Saved on ${saved}</div>` : ""}
    </div>
    ${isActive ? `<span class="slot-active-badge">Actif</span>` : ""}
    <button class="slot-open-btn" data-id="${slot.id}" title="Ouvrir un onglet Twitch avec ce compte">Ouvrir</button>
    <button class="slot-btn" data-id="${slot.id}" title="Modifier">✎</button>
  `;

  // Ouvrir un onglet avec ce compte
  row.querySelector(".slot-open-btn").addEventListener("click", async e => {
    e.stopPropagation();
    await send("openTab", { slotId: slot.id });
    window.close();
  });

  // Modifier le slot
  row.querySelector(".slot-btn").addEventListener("click", e => {
    e.stopPropagation();
    openEdit(slot.id);
  });

  return row;
}

// ── Vue : nommer le nouveau compte ────────────────────────────────────────────

function showView(id) {
  ["view-main","view-name","view-edit"].forEach(v => {
    document.getElementById(v).classList.toggle("hidden", v !== id);
  });
}

document.getElementById("btn-add-slot").addEventListener("click", () => {
  pendingColor = COLORS[slots.length % COLORS.length];
  document.getElementById("input-name").value = "";
  renderColorPicker("color-picker", pendingColor, c => { pendingColor = c; });
  showView("view-name");
  document.getElementById("input-name").focus();
});

document.getElementById("btn-name-back").addEventListener("click", () => showView("view-main"));

document.getElementById("btn-name-save").addEventListener("click", async () => {
  const name = document.getElementById("input-name").value.trim();
  if (!name) { document.getElementById("input-name").focus(); return; }

  const slot = await send("createSlot", { name, color: pendingColor });
  slots.push(slot);
  showView("view-main");
  renderMain();
});

// ── Vue : éditer un slot ──────────────────────────────────────────────────────

function openEdit(slotId) {
  editingId = slotId;
  const slot = slots.find(s => s.id === slotId);
  editColor  = slot.color;

  document.getElementById("edit-title").textContent = esc(slot.name);
  document.getElementById("edit-input-name").value  = slot.name;
  renderColorPicker("edit-color-picker", editColor, c => { editColor = c; });
  showView("view-edit");
  document.getElementById("edit-input-name").focus();
}

document.getElementById("btn-edit-back").addEventListener("click", () => showView("view-main"));

document.getElementById("btn-edit-save").addEventListener("click", async () => {
  const name = document.getElementById("edit-input-name").value.trim();
  if (!name) { document.getElementById("edit-input-name").focus(); return; }

  const updated = await send("updateSlot", { id: editingId, data: { name, color: editColor } });
  const i = slots.findIndex(s => s.id === editingId);
  if (i >= 0) slots[i] = updated;

  showView("view-main");
  renderMain();
});

document.getElementById("btn-edit-delete").addEventListener("click", async () => {
  if (!confirm(`Supprimer le compte "${slots.find(s=>s.id===editingId)?.name}" ?`)) return;
  await send("deleteSlot", { id: editingId });
  slots = slots.filter(s => s.id !== editingId);
  showView("view-main");
  renderMain();
});

// ── Color picker ──────────────────────────────────────────────────────────────

function renderColorPicker(containerId, selected, onChange) {
  const grid = document.getElementById(containerId);
  grid.innerHTML = "";
  COLORS.forEach(color => {
    const el = document.createElement("div");
    el.className = "p-color" + (color === selected ? " sel" : "");
    el.style.background = color;
    el.title = color;
    el.addEventListener("click", () => {
      grid.querySelectorAll(".p-color").forEach(x => x.classList.remove("sel"));
      el.classList.add("sel");
      onChange(color);
    });
    grid.appendChild(el);
  });
}

// ── Bind global ───────────────────────────────────────────────────────────────

function bindUI() {
  // Entrée clavier dans les inputs
  document.getElementById("input-name").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("btn-name-save").click();
  });
  document.getElementById("edit-input-name").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("btn-edit-save").click();
  });
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
