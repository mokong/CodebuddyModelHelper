const KEEP_API_KEY = "__CODEBUDDY_MODELS_MANAGER_KEEP_API_KEY__";

const state = {
  configPath: "",
  readonly: false,
  exists: false,
  config: { models: [], availableModels: [] },
  selectedId: null,
  search: "",
  dirty: false,
};

const elements = {
  configPath: document.querySelector("#configPath"),
  status: document.querySelector("#status"),
  refreshBtn: document.querySelector("#refreshBtn"),
  saveBtn: document.querySelector("#saveBtn"),
  addBtn: document.querySelector("#addBtn"),
  deleteBtn: document.querySelector("#deleteBtn"),
  searchInput: document.querySelector("#searchInput"),
  modelCount: document.querySelector("#modelCount"),
  modelList: document.querySelector("#modelList"),
  modelForm: document.querySelector("#modelForm"),
  editorTitle: document.querySelector("#editorTitle"),
  applyBtn: document.querySelector("#applyBtn"),
  apiKeyHint: document.querySelector("#apiKeyHint"),
  showAllToggle: document.querySelector("#showAllToggle"),
  availableList: document.querySelector("#availableList"),
  emptyTemplate: document.querySelector("#emptyTemplate"),
};

function modelDefaults() {
  return {
    id: "",
    originalId: "",
    name: "",
    vendor: "",
    url: "",
    apiKey: "",
    maxInputTokens: 200000,
    maxOutputTokens: 8192,
    supportsToolCall: true,
    supportsImages: false,
    supportsReasoning: true,
  };
}

function showStatus(message, type = "info") {
  elements.status.hidden = false;
  elements.status.textContent = message;
  elements.status.classList.toggle("error", type === "error");
}

function hideStatus() {
  elements.status.hidden = true;
  elements.status.textContent = "";
  elements.status.classList.remove("error");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    const details = Array.isArray(payload.details) && payload.details.length ? `\n${payload.details.join("\n")}` : "";
    throw new Error(`${payload.error || "请求失败。"}${details}`);
  }
  return payload;
}

async function loadConfig() {
  hideStatus();
  const payload = await requestJson("/api/config");
  state.configPath = payload.path;
  state.readonly = payload.readonly;
  state.exists = payload.exists;
  state.config = payload.config;
  state.selectedId = state.config.models[0]?.id || null;
  state.dirty = false;
  render();
  showStatus(payload.exists ? "已读取现有 models.json。" : "尚未找到 models.json，保存时会新建文件。");
}

function filteredModels() {
  const keyword = state.search.trim().toLowerCase();
  if (!keyword) return state.config.models;
  return state.config.models.filter((model) =>
    [model.id, model.name, model.vendor, model.url].some((value) => String(value || "").toLowerCase().includes(keyword)),
  );
}

function selectedModel() {
  return state.config.models.find((model) => model.id === state.selectedId) || null;
}

function render() {
  elements.configPath.textContent = `${state.configPath}${state.readonly ? "（只读）" : ""}`;
  elements.saveBtn.disabled = state.readonly || !state.dirty;
  renderList();
  renderEditor();
  renderAvailableModels();
}

function renderList() {
  const models = filteredModels();
  elements.modelList.innerHTML = "";
  elements.modelCount.textContent = String(state.config.models.length);

  if (!models.length) {
    elements.modelList.append(elements.emptyTemplate.content.cloneNode(true));
    return;
  }

  for (const model of models) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `model-item${model.id === state.selectedId ? " active" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(model.id || "未命名模型")}</strong>
      <span>${escapeHtml(model.name || "-")} · ${escapeHtml(model.vendor || "-")}</span>
      <span>${model.hasApiKey ? "已配置密钥" : "未配置密钥"}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedId = model.id;
      render();
    });
    elements.modelList.append(button);
  }
}

function renderEditor() {
  const model = selectedModel();
  const disabled = !model;
  elements.editorTitle.textContent = model ? "编辑模型" : "选择一个模型";
  elements.deleteBtn.disabled = disabled || state.readonly;
  elements.applyBtn.disabled = disabled || state.readonly;

  const data = model || modelDefaults();
  for (const [key, value] of Object.entries(data)) {
    const field = elements.modelForm.elements[key];
    if (!field) continue;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else if (key === "apiKey") field.value = "";
    else field.value = value ?? "";
    field.disabled = disabled || state.readonly;
  }

  elements.apiKeyHint.textContent = model?.hasApiKey
    ? `已配置密钥：${model.apiKeyMasked}。留空会继续保留原密钥。`
    : "当前没有密钥。需要时请输入 API Key。";
}

function renderAvailableModels() {
  const showAll = state.config.availableModels.length === 0;
  elements.showAllToggle.checked = showAll;
  elements.showAllToggle.disabled = state.readonly;
  elements.availableList.innerHTML = "";

  for (const model of state.config.models) {
    const label = document.createElement("label");
    label.className = "available-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.disabled = showAll || state.readonly;
    checkbox.checked = showAll || state.config.availableModels.includes(model.id);
    checkbox.addEventListener("change", () => {
      const set = new Set(state.config.availableModels);
      if (checkbox.checked) set.add(model.id);
      else set.delete(model.id);
      state.config.availableModels = [...set];
      markDirty();
      render();
    });

    const text = document.createElement("span");
    text.textContent = model.id || "未命名模型";
    label.append(checkbox, text);
    elements.availableList.append(label);
  }
}

function readFormModel(previous) {
  const form = elements.modelForm;
  const apiKey = form.elements.apiKey.value.trim();
  return {
    ...(previous || {}),
    id: form.elements.id.value.trim(),
    originalId: previous?.originalId || previous?.id || "",
    name: form.elements.name.value.trim(),
    vendor: form.elements.vendor.value.trim(),
    url: form.elements.url.value.trim(),
    apiKey: apiKey || KEEP_API_KEY,
    maxInputTokens: Number(form.elements.maxInputTokens.value),
    maxOutputTokens: Number(form.elements.maxOutputTokens.value),
    supportsToolCall: form.elements.supportsToolCall.checked,
    supportsImages: form.elements.supportsImages.checked,
    supportsReasoning: form.elements.supportsReasoning.checked,
  };
}

async function saveModel(event) {
  event.preventDefault();
  const previous = selectedModel();
  if (!previous) return;

  const next = readFormModel(previous);
  const duplicate = state.config.models.some((model) => model.id === next.id && model.id !== previous.id);
  if (duplicate) {
    showStatus(`模型 ID 已存在：${next.id}`, "error");
    return;
  }

  const previousModels = state.config.models;
  const previousAvailableModels = state.config.availableModels;
  const previousSelectedId = state.selectedId;

  state.config.models = state.config.models.map((model) => (model.id === previous.id ? next : model));
  state.config.availableModels = state.config.availableModels.map((id) => (id === previous.id ? next.id : id));
  state.selectedId = next.id;
  state.dirty = true;
  render();
  showStatus("正在保存模型...");

  try {
    await saveConfig();
  } catch (error) {
    state.config.models = previousModels;
    state.config.availableModels = previousAvailableModels;
    state.selectedId = previousSelectedId;
    state.dirty = true;
    render();
    throw error;
  }
}

function addModel() {
  const base = "new-model";
  let id = base;
  let index = 1;
  const ids = new Set(state.config.models.map((model) => model.id));
  while (ids.has(id)) {
    index += 1;
    id = `${base}-${index}`;
  }

  const model = {
    ...modelDefaults(),
    id,
    originalId: id,
    name: "New Model",
    vendor: "Custom",
    url: "https://api.example.com/v1/chat/completions",
  };
  state.config.models = [model, ...state.config.models];
  state.selectedId = id;
  markDirty();
  render();
}

function deleteSelected() {
  const model = selectedModel();
  if (!model) return;
  const ok = window.confirm(`删除模型「${model.id}」并立即保存到本地配置？`);
  if (!ok) return;

  const previousModels = state.config.models;
  const previousAvailableModels = state.config.availableModels;
  const nextModels = state.config.models.filter((item) => item.id !== model.id);
  const nextAvailableModels = state.config.availableModels.filter((id) => id !== model.id);

  state.config.models = nextModels;
  state.config.availableModels = nextAvailableModels;
  state.selectedId = nextModels[0]?.id || null;
  state.dirty = true;
  render();
  showStatus("正在删除并保存...");

  saveConfig().catch((error) => {
    state.config.models = previousModels;
    state.config.availableModels = previousAvailableModels;
    state.selectedId = model.id;
    state.dirty = true;
    render();
    showStatus(error.message, "error");
  });
}

async function saveConfig() {
  hideStatus();
  const payload = await requestJson("/api/config", {
    method: "PUT",
    body: JSON.stringify({ config: state.config }),
  });
  state.config = payload.config;
  state.dirty = false;
  render();
  showStatus(payload.backupPath ? `已保存，并创建备份：${payload.backupPath}` : "已保存。CodeBuddy 通常会自动热重载。");
}

function markDirty() {
  state.dirty = true;
  elements.saveBtn.disabled = state.readonly || !state.dirty;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

elements.refreshBtn.addEventListener("click", () => {
  if (state.dirty && !window.confirm("当前有未保存修改，刷新会丢弃这些修改。继续？")) return;
  loadConfig().catch((error) => showStatus(error.message, "error"));
});

elements.saveBtn.addEventListener("click", () => {
  saveConfig().catch((error) => showStatus(error.message, "error"));
});

elements.addBtn.addEventListener("click", addModel);
elements.deleteBtn.addEventListener("click", deleteSelected);
elements.modelForm.addEventListener("submit", (event) => {
  saveModel(event).catch((error) => showStatus(error.message, "error"));
});
elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderList();
});

elements.showAllToggle.addEventListener("change", () => {
  state.config.availableModels = elements.showAllToggle.checked
    ? []
    : state.config.models.map((model) => model.id).filter(Boolean);
  markDirty();
  render();
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

loadConfig().catch((error) => showStatus(error.message, "error"));
