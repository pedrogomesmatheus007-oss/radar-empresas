"use strict";

/* =========================================================================
 * RADAR DE EMPRESAS — FRONTEND DA VERSÃO COMPLETA
 * =========================================================================
 * Este arquivo NÃO gera nenhum dado. Toda empresa, URL, domínio, CNPJ e
 * status de conformidade mostrados aqui vêm de chamadas reais a este mesmo
 * servidor (mesma origem — sem CORS), que por sua vez:
 *   1) usa a API da Anthropic (com busca na web) para ENCONTRAR candidatos,
 *   2) verifica de verdade se a URL responde (HTTP real),
 *   3) valida o CNPJ numa fonte pública oficial (BrasilAPI/ReceitaWS),
 *   4) aplica as regras obrigatórias (marca excluída, órgão público, MEI,
 *      nome de pessoa física, política do Google Ads, não-repetição),
 *   5) só então salva no banco de dados e devolve para esta tela.
 * Quando algo não pode ser confirmado, o servidor diz isso explicitamente —
 * este arquivo nunca "completa" um dado que não veio do servidor.
 * ========================================================================= */

const API_BASE = ""; // mesma origem — o backend serve este próprio arquivo

// ---------------------------------------------------------------------------
// Estado local (apenas o necessário para a UI — nunca é a fonte da verdade)
// ---------------------------------------------------------------------------

const state = {
  currentUrlResults: [],
  currentCnpjResults: [],
  excludedBrands: [],
  retentionDays: null,
  settings: {
    defaultQuantity: 10,
    hideManualReview: false,
  },
};

// ---------------------------------------------------------------------------
// Cliente HTTP fino — trata erros do backend de forma uniforme
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function apiFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (networkErr) {
    throw new ApiError(
      "Não foi possível conectar ao servidor local. Verifique se o backend ainda está rodando (npm run dev) nesta mesma máquina.",
      0
    );
  }

  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const message = (body && body.error) || `Erro do servidor (HTTP ${res.status}).`;
    throw new ApiError(message, res.status, body && body.details);
  }

  return body;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function normalizeBrand(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDatePtBr(isoOrDateKey) {
  const date = isoOrDateKey.length === 10 ? new Date(`${isoOrDateKey}T00:00:00`) : new Date(isoOrDateKey);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function formatTimePtBr(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function complianceLabel(status) {
  return status === "PASS_REVIEW" ? "APTO PARA REVISÃO" : "REVISÃO NECESSÁRIA";
}

const NAO_VERIFICADO = "Não foi possível verificar este dado.";

// ---------------------------------------------------------------------------
// Clipboard com fallback
// ---------------------------------------------------------------------------

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  return legacyCopy(text);
}

function legacyCopy(text) {
  return new Promise((resolve, reject) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      ok ? resolve() : reject(new Error("execCommand falhou"));
    } catch (err) {
      document.body.removeChild(textarea);
      reject(err);
    }
  });
}

let toastTimeout = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2600);
}

function copyAndToast(text, successMessage) {
  copyToClipboard(text)
    .then(() => showToast(successMessage))
    .catch(() => showToast("Não foi possível copiar automaticamente. Selecione o texto manualmente."));
}

function setFormLoading(form, loading, loadingLabel) {
  const btn = form.querySelector("button[type=submit]");
  if (!btn) return;
  if (loading) {
    btn.dataset.originalLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = loadingLabel;
  } else {
    btn.disabled = false;
    if (btn.dataset.originalLabel) btn.innerHTML = btn.dataset.originalLabel;
  }
}

// ---------------------------------------------------------------------------
// Health check do backend (mostra na sidebar se a API está configurada)
// ---------------------------------------------------------------------------

async function checkBackendHealth() {
  const pill = document.getElementById("backendStatusPill");
  try {
    await apiFetch("/api/health");
    pill.textContent = "BACKEND CONECTADO";
    pill.classList.remove("status-error");
    pill.classList.add("status-ok");
  } catch (err) {
    pill.textContent = "BACKEND INDISPONÍVEL";
    pill.classList.remove("status-ok");
    pill.classList.add("status-error");
    showToast("Não foi possível falar com o backend. Confira o terminal onde rodou 'npm run dev'.");
  }
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

async function searchUrls(niche, quantity) {
  return apiFetch("/api/urls/search", {
    method: "POST",
    body: JSON.stringify({ niche, quantity }),
  });
}

function renderUrlResults(outcome) {
  const { results, requestedQuantity, message } = outcome;
  const visible = state.settings.hideManualReview
    ? results.filter((r) => r.complianceStatus === "PASS_REVIEW")
    : results;

  state.currentUrlResults = visible;

  const grid = document.getElementById("urlResults");
  const empty = document.getElementById("urlEmptyState");
  const toolbar = document.getElementById("urlResultsToolbar");
  const messageEl = document.getElementById("urlResultMessage");

  grid.innerHTML = "";

  if (visible.length === 0) {
    empty.hidden = false;
    empty.querySelector("p").innerHTML =
      escapeHtml(message) +
      (results.length > visible.length
        ? " (alguns resultados foram ocultados pelo filtro \"revisão necessária\" em Configurações.)"
        : "");
    toolbar.hidden = true;
    return;
  }

  empty.hidden = true;
  toolbar.hidden = false;
  messageEl.textContent = message;

  for (const item of visible) {
    const card = document.createElement("div");
    card.className = "result-card";
    const badgeClass = item.complianceStatus === "PASS_REVIEW" ? "badge-success" : "badge-warning";

    const cnpjBlock = item.cnpjVerified
      ? `<div><span class="label">CNPJ:</span><span class="mono">${escapeHtml(item.cnpjFormatted)}</span></div>`
      : `<div><span class="label">CNPJ:</span><em>${NAO_VERIFICADO}</em></div>`;

    card.innerHTML = `
      <div class="result-card-header">
        <div>
          <div class="result-company">${escapeHtml(item.companyName)}</div>
        </div>
      </div>
      <div class="result-meta">
        <div><span class="label">URL:</span><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="mono">${escapeHtml(item.url)}</a></div>
        <div><span class="label">Domínio:</span><span class="mono">${escapeHtml(item.normalizedDomain)}</span></div>
        <div><span class="label">Nicho:</span>${escapeHtml(item.niche)}</div>
        ${cnpjBlock}
        ${item.sourceNote ? `<div><span class="label">Fonte:</span>${escapeHtml(item.sourceNote)}</div>` : ""}
      </div>
      <div class="result-status-row">
        <span class="badge badge-success">URL verificada (HTTP real)</span>
        <span class="badge ${badgeClass}">Triagem Google Ads: ${complianceLabel(item.complianceStatus)}</span>
      </div>
      <div class="result-actions">
        <a class="btn btn-ghost btn-small" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">ABRIR SITE</a>
        <button class="btn btn-ghost btn-small" data-copy-url="${escapeHtml(item.url)}">COPIAR URL</button>
        ${item.cnpjVerified ? `<button class="btn btn-ghost btn-small" data-copy-cnpj-formatted="${escapeHtml(item.cnpjFormatted)}">COPIAR CNPJ</button>` : ""}
      </div>
    `;
    grid.appendChild(card);
  }
}

// ---------------------------------------------------------------------------
// CNPJ
// ---------------------------------------------------------------------------

async function searchCnpjs(niche, quantity) {
  return apiFetch("/api/cnpj/search", {
    method: "POST",
    body: JSON.stringify({ niche, quantity }),
  });
}

function renderCnpjResults(outcome) {
  const { results, requestedQuantity, message } = outcome;
  state.currentCnpjResults = results;

  const tbody = document.getElementById("cnpjResults");
  const empty = document.getElementById("cnpjEmptyState");
  const toolbar = document.getElementById("cnpjResultsToolbar");
  const tableWrap = document.getElementById("cnpjTableWrap");
  const messageEl = document.getElementById("cnpjResultMessage");

  tbody.innerHTML = "";

  if (results.length === 0) {
    empty.hidden = false;
    empty.querySelector("p").textContent = message;
    tableWrap.hidden = true;
    toolbar.hidden = true;
    return;
  }

  empty.hidden = true;
  tableWrap.hidden = false;
  toolbar.hidden = false;
  messageEl.textContent = message;

  for (const item of results) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.companyName)}</td>
      <td class="mono">${escapeHtml(item.cnpjFormatted)}</td>
      <td class="mono">${escapeHtml(item.cnpj)}</td>
      <td><span class="badge badge-success">${escapeHtml(item.status)}</span></td>
      <td>${item.isMei ? "SIM" : "NÃO"}</td>
      <td>${escapeHtml(item.legalNature ?? NAO_VERIFICADO)}</td>
      <td>
        <div class="cnpj-actions">
          <button class="btn btn-ghost btn-small" data-copy-cnpj-formatted="${escapeHtml(item.cnpjFormatted)}">COPIAR COM PONTUAÇÃO</button>
          <button class="btn btn-ghost btn-small" data-copy-cnpj-plain="${escapeHtml(item.cnpj)}">COPIAR SEM PONTUAÇÃO</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// ---------------------------------------------------------------------------
// Pesquisas recentes
// ---------------------------------------------------------------------------

async function loadRecentSearches() {
  const data = await apiFetch("/api/searches");
  state.retentionDays = data.retentionDays;
  return data;
}

function renderRecentSearches(data) {
  document.getElementById("retentionDaysLabel").textContent = data.retentionDays;
  const retentionDisplay = document.getElementById("settingRetentionDaysDisplay");
  if (retentionDisplay) retentionDisplay.textContent = `${data.retentionDays} dias`;

  const container = document.getElementById("recentSearchesContainer");
  container.innerHTML = "";

  const note = document.createElement("div");
  note.className = "retention-note";
  note.textContent = `Somente pesquisas dos últimos ${data.retentionDays} dias aparecem nesta lista. Isso é só uma visualização definida pelo servidor: os domínios e CNPJs já encontrados continuam bloqueados para sempre contra repetição, mesmo depois de saírem daqui.`;
  container.appendChild(note);

  if (!data.groups || data.groups.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<p>Nenhuma pesquisa realizada ainda.</p>";
    container.appendChild(empty);
    return;
  }

  for (const group of data.groups) {
    const totalFound = group.items.reduce((sum, i) => sum + i.resultQuantity, 0);
    const groupEl = document.createElement("div");
    groupEl.className = "recent-group";
    groupEl.innerHTML = `<div class="recent-group-date">${formatDatePtBr(group.date)} <span class="count-pill">${group.items.length} pesquisa${group.items.length === 1 ? "" : "s"} · ${totalFound} resultado${totalFound === 1 ? "" : "s"}</span></div>`;

    const list = document.createElement("ul");
    list.className = "recent-list";

    for (const search of group.items) {
      const typeLabel = search.type === "urls" ? "URLs" : "CNPJ";
      const li = document.createElement("li");
      li.className = "recent-item";
      li.innerHTML = `
        <span class="recent-time">${formatTimePtBr(search.createdAt)}</span>
        <span class="recent-type-badge">${typeLabel}</span>
        <span class="recent-niche">${escapeHtml(search.query)}</span>
        <span class="recent-counts">${search.resultQuantity} de ${search.requestedQuantity} solicitado${search.requestedQuantity === 1 ? "" : "s"}</span>
      `;
      list.appendChild(li);
    }

    groupEl.appendChild(list);
    container.appendChild(groupEl);
  }
}

async function refreshRecentSearches() {
  try {
    const data = await loadRecentSearches();
    renderRecentSearches(data);
  } catch (err) {
    showToast(err.message);
  }
}

// ---------------------------------------------------------------------------
// Marcas excluídas
// ---------------------------------------------------------------------------

async function loadExcludedBrands() {
  const data = await apiFetch("/api/excluded-brands");
  state.excludedBrands = data.results;
  return data.results;
}

function renderBrandList() {
  const list = document.getElementById("brandList");
  list.innerHTML = "";
  document.getElementById("brandCountLabel").textContent = state.excludedBrands.length;

  for (const brand of state.excludedBrands) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="brand-name-cell">
        <span>${escapeHtml(brand.name)}</span>
      </div>
      <button class="btn btn-danger-outline btn-small" data-remove-brand="${brand.id}">Excluir</button>
    `;
    list.appendChild(li);
  }
}

async function refreshBrandList() {
  try {
    await loadExcludedBrands();
    renderBrandList();
  } catch (err) {
    showToast(err.message);
  }
}

// ---------------------------------------------------------------------------
// Navegação entre abas
// ---------------------------------------------------------------------------

const VIEW_TITLES = {
  urls: "URLs",
  cnpj: "CNPJ",
  recent: "Pesquisas recentes",
  brands: "Marcas excluídas",
  settings: "Configurações",
};

function switchView(viewName) {
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
  document.getElementById(`view-${viewName}`).classList.add("active");

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  document.getElementById("viewTitle").textContent = VIEW_TITLES[viewName] || viewName;

  if (viewName === "recent") refreshRecentSearches();
  if (viewName === "brands") refreshBrandList();

  closeSidebarMobile();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openSidebarMobile() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebarOverlay").classList.add("show");
}
function closeSidebarMobile() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("show");
}

// ---------------------------------------------------------------------------
// Exportar CSV — o backend já gera o arquivo pronto; basta navegar até a URL
// (mesma origem) que o navegador baixa sozinho, sem truque de Blob.
// ---------------------------------------------------------------------------

function downloadViaBackend(path) {
  const a = document.createElement("a");
  a.href = `${API_BASE}${path}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---------------------------------------------------------------------------
// Wiring de eventos
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  checkBackendHealth();
  refreshBrandList();
  refreshRecentSearches();

  // Preferências locais (não afetam regras de negócio, só conveniência de UI)
  const defaultQuantityInput = document.getElementById("settingDefaultQuantity");
  defaultQuantityInput.addEventListener("input", () => {
    const value = Math.max(1, Math.min(100, Number(defaultQuantityInput.value) || 1));
    state.settings.defaultQuantity = value;
    document.getElementById("urlQuantity").value = value;
    document.getElementById("cnpjQuantity").value = value;
  });
  document.getElementById("urlQuantity").value = state.settings.defaultQuantity;
  document.getElementById("cnpjQuantity").value = state.settings.defaultQuantity;

  document.getElementById("settingHideManualReview").addEventListener("change", (e) => {
    state.settings.hideManualReview = e.target.checked;
  });

  // Navegação
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.querySelectorAll("[data-view-link]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.viewLink));
  });
  document.getElementById("hamburger").addEventListener("click", openSidebarMobile);
  document.getElementById("sidebarClose").addEventListener("click", closeSidebarMobile);
  document.getElementById("sidebarOverlay").addEventListener("click", closeSidebarMobile);

  // Busca de URLs
  const urlForm = document.getElementById("urlForm");
  urlForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const niche = document.getElementById("urlNiche").value.trim();
    const quantity = Math.max(1, Math.min(100, Number(document.getElementById("urlQuantity").value) || 1));
    if (niche.length < 2) {
      showToast("Digite um nicho com pelo menos 2 caracteres.");
      return;
    }
    setFormLoading(urlForm, true, "Pesquisando (pode levar até 1 minuto)…");
    try {
      const outcome = await searchUrls(niche, quantity);
      renderUrlResults(outcome);
      refreshRecentSearches();
    } catch (err) {
      showToast(err.message);
    } finally {
      setFormLoading(urlForm, false);
    }
  });

  // Busca de CNPJ
  const cnpjForm = document.getElementById("cnpjForm");
  cnpjForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const niche = document.getElementById("cnpjNiche").value.trim();
    const quantity = Math.max(1, Math.min(100, Number(document.getElementById("cnpjQuantity").value) || 1));
    if (niche.length < 2) {
      showToast("Digite um nicho com pelo menos 2 caracteres.");
      return;
    }
    setFormLoading(cnpjForm, true, "Pesquisando (pode levar até 1 minuto)…");
    try {
      const outcome = await searchCnpjs(niche, quantity);
      renderCnpjResults(outcome);
      refreshRecentSearches();
    } catch (err) {
      showToast(err.message);
    } finally {
      setFormLoading(cnpjForm, false);
    }
  });

  // Cópia / ações — delegação de eventos (os cards são recriados a cada busca)
  document.getElementById("urlResults").addEventListener("click", (e) => {
    const copyUrlBtn = e.target.closest("[data-copy-url]");
    const copyCnpjBtn = e.target.closest("[data-copy-cnpj-formatted]");
    if (copyUrlBtn) copyAndToast(copyUrlBtn.dataset.copyUrl, "URL copiada!");
    if (copyCnpjBtn) copyAndToast(copyCnpjBtn.dataset.copyCnpjFormatted, "CNPJ copiado!");
  });

  document.getElementById("cnpjResults").addEventListener("click", (e) => {
    const copyFormatted = e.target.closest("[data-copy-cnpj-formatted]");
    const copyPlain = e.target.closest("[data-copy-cnpj-plain]");
    if (copyFormatted) copyAndToast(copyFormatted.dataset.copyCnpjFormatted, "CNPJ copiado (com pontuação)!");
    if (copyPlain) copyAndToast(copyPlain.dataset.copyCnpjPlain, "CNPJ copiado (sem pontuação)!");
  });

  document.getElementById("copyAllUrls").addEventListener("click", () => {
    if (state.currentUrlResults.length === 0) return;
    const text = state.currentUrlResults
      .map(
        (r) =>
          `Empresa: ${r.companyName}\nURL: ${r.url}\nDomínio: ${r.normalizedDomain}\nNicho: ${r.niche}\nCNPJ: ${r.cnpjVerified ? r.cnpjFormatted : NAO_VERIFICADO}\nTriagem Google Ads: ${complianceLabel(r.complianceStatus)}\n`
      )
      .join("\n");
    copyAndToast(text, "Todas as URLs foram copiadas!");
  });

  document.getElementById("copyAllCnpjs").addEventListener("click", () => {
    if (state.currentCnpjResults.length === 0) return;
    const text = state.currentCnpjResults
      .map(
        (r) =>
          `Empresa: ${r.companyName}\nCNPJ: ${r.cnpjFormatted}\nSem pontuação: ${r.cnpj}\nSituação: ${r.status}\nMEI: ${r.isMei ? "SIM" : "NÃO"}\nNatureza jurídica: ${r.legalNature ?? NAO_VERIFICADO}\n`
      )
      .join("\n");
    copyAndToast(text, "Todos os CNPJs foram copiados!");
  });

  document.getElementById("exportUrlsCsv").addEventListener("click", () => {
    if (state.currentUrlResults.length === 0) return;
    downloadViaBackend("/api/export/urls.csv");
  });

  document.getElementById("exportCnpjCsv").addEventListener("click", () => {
    if (state.currentCnpjResults.length === 0) return;
    downloadViaBackend("/api/export/cnpj.csv");
  });

  // Marcas excluídas
  const brandForm = document.getElementById("brandForm");
  brandForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("brandInput");
    const name = input.value.trim();
    if (!name) return;
    try {
      await apiFetch("/api/excluded-brands", { method: "POST", body: JSON.stringify({ name }) });
      input.value = "";
      await refreshBrandList();
      showToast("Marca adicionada à lista de exclusão.");
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById("brandList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove-brand]");
    if (!btn) return;
    const id = Number(btn.dataset.removeBrand);
    try {
      await apiFetch(`/api/excluded-brands/${id}`, { method: "DELETE" });
      await refreshBrandList();
      showToast("Marca removida da lista de exclusão.");
    } catch (err) {
      showToast(err.message);
    }
  });
});
