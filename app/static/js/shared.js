
const body = document.body;
const apiKey = body.dataset.apiKey;
const model = body.dataset.model;
const modelProvider = body.dataset.modelProvider || "huggingface";
const defaultMaxNewTokens = Number(body.dataset.defaultMaxNewTokens || "1024");
const defaultTemperature = Number(body.dataset.defaultTemperature || "0.7");
const defaultTopP = Number(body.dataset.defaultTopP || "0.9");
const defaultDoSample = body.dataset.defaultDoSample !== "false";

const modelName = document.getElementById("model-name");
const heroModelName = document.getElementById("hero-model-name");
const providerBadgeEl = document.getElementById("provider-badge");
const messagesEl = document.getElementById("messages");
const emptyStateEl = document.getElementById("empty-state");
const convoListEl = document.getElementById("conversation-list");
const conversationSearchEl = document.getElementById("conversation-search");
const form = document.getElementById("chat-form");
const promptEl = document.getElementById("prompt");
const newChatBtn = document.getElementById("new-chat-btn");
const retryChatBtn = document.getElementById("retry-chat-btn");
const duplicateChatBtn = document.getElementById("duplicate-chat-btn");
const branchChatBtn = document.getElementById("branch-chat-btn");
const pinChatBtn = document.getElementById("pin-chat-btn");
const renameChatBtn = document.getElementById("rename-chat-btn");
const exportChatBtn = document.getElementById("export-chat-btn");
const deleteChatBtn = document.getElementById("delete-chat-btn");
const template = document.getElementById("message-template");
const emojiBtn = document.getElementById("emoji-btn");
const emojiStrip = document.getElementById("emoji-strip");
const chatModeEl = document.getElementById("chat-mode");
const imageReaderFile = document.getElementById("image-reader-file");
const fileInput = document.getElementById("file-input");
const fileInputSecondary = document.getElementById("file-input-secondary");
const parserSelectEl = document.getElementById("parser-select");
const fileFormatEl = document.getElementById("file-format");
const chatSidebarEl = document.getElementById("chat-sidebar");
const micBtn = document.getElementById("mic-btn");
const voiceChatBtn = document.getElementById("voice-chat-btn");
const voiceStopBtn = document.getElementById("voice-stop-btn");
const voiceSelectEl = document.getElementById("voice-select");
const voiceRateEl = document.getElementById("voice-rate");
const voicePitchEl = document.getElementById("voice-pitch");
const autoSpeakToggleEl = document.getElementById("auto-speak-toggle");
const voiceLanguageSelectEl = document.getElementById("voice-language-select");
const transcriptPreviewToggleEl = document.getElementById("transcript-preview-toggle");
const providerSelectEl = document.getElementById("provider-select");
const modelSelectEl = document.getElementById("model-select");
const responsePresetEl = document.getElementById("response-preset");
const useWebToggleEl = document.getElementById("use-web-toggle");
const deepWebToggleEl = document.getElementById("deep-web-toggle");
const backgroundJobsToggleEl = document.getElementById("background-jobs-toggle");
const conciseToggleEl = document.getElementById("concise-toggle");
const maxTokensInputEl = document.getElementById("max-tokens-input");
const temperatureRangeEl = document.getElementById("temperature-range");
const temperatureValueEl = document.getElementById("temperature-value");
const topPRangeEl = document.getElementById("top-p-range");
const topPValueEl = document.getElementById("top-p-value");
const samplingToggleEl = document.getElementById("sampling-toggle");
const refreshStatusBtn = document.getElementById("refresh-status-btn");
const statusChatEl = document.getElementById("status-chat");
const statusImageEl = document.getElementById("status-image");
const statusOcrEl = document.getElementById("status-ocr");
const statusPresetEl = document.getElementById("status-preset");
const adminSummaryEl = document.getElementById("admin-summary");
const authStateBadgeEl = document.getElementById("auth-state-badge");
const authStatusEl = document.getElementById("auth-status");
const authUsernameEl = document.getElementById("auth-username");
const authPasswordEl = document.getElementById("auth-password");
const loginBtn = document.getElementById("login-btn");
const registerBtn = document.getElementById("register-btn");
const logoutBtn = document.getElementById("logout-btn");
const jobsListEl = document.getElementById("jobs-list");
const jobsItemTemplate = document.getElementById("jobs-item-template");
const memoryListEl = document.getElementById("memory-list");
const memoryScopeFilterEl = document.getElementById("memory-scope-filter");
const toolContextEl = document.getElementById("tool-context");
const attachmentTrayEl = document.getElementById("attachment-tray");
const dropZoneEl = document.getElementById("drop-zone");
const slashHintEl = document.getElementById("slash-hint");
const promptTemplatesEl = document.getElementById("prompt-templates");
const sendOnEnterToggleEl = document.getElementById("send-on-enter-toggle");
const sendOnEnterToggleModalEl = document.getElementById("send-on-enter-toggle-modal");
const appToastEl = document.getElementById("app-toast");
const appToastBodyEl = document.getElementById("app-toast-body");
const statusChatModalEl = document.getElementById("status-chat-modal");
const statusImageModalEl = document.getElementById("status-image-modal");
const statusOcrModalEl = document.getElementById("status-ocr-modal");
const statusPresetModalEl = document.getElementById("status-preset-modal");

let activeConversationId = null;
let history = [];
let jobsRefreshTimer = null;
let voiceChatActive = false;
let recognition = null;
let recognitionMode = null;
let isSpeaking = false;
let pendingVoiceSubmit = false;
let availableVoices = [];
let authToken = localStorage.getItem("ai.authToken") || "";
let currentUsername = localStorage.getItem("ai.username") || "";
let modelCatalog = null;

const settings = {
  providerOverride: localStorage.getItem("ai.providerOverride") || modelProvider,
  modelOverride: localStorage.getItem("ai.modelOverride") || model,
  voiceName: localStorage.getItem("ai.voiceName") || "",
  voiceLanguage: localStorage.getItem("ai.voiceLanguage") || "en-US",
  voiceRate: Number(localStorage.getItem("ai.voiceRate") || "1"),
  voicePitch: Number(localStorage.getItem("ai.voicePitch") || "1"),
  autoSpeak: localStorage.getItem("ai.autoSpeak") === "true",
  transcriptPreview: localStorage.getItem("ai.transcriptPreview") === "true",
  responsePreset: localStorage.getItem("ai.responsePreset") || "balanced",
  useWeb: localStorage.getItem("ai.useWeb") !== "false",
  deepWeb: localStorage.getItem("ai.deepWeb") === "true",
  backgroundJobs: localStorage.getItem("ai.backgroundJobs") === "true",
  concise: localStorage.getItem("ai.concise") !== "false",
  maxNewTokens: Number(localStorage.getItem("ai.maxNewTokens") || String(defaultMaxNewTokens)),
  temperature: Number(localStorage.getItem("ai.temperature") || String(defaultTemperature)),
  topP: Number(localStorage.getItem("ai.topP") || String(defaultTopP)),
  sendOnEnter: localStorage.getItem("ai.sendOnEnter") === "true",
  doSample: localStorage.getItem("ai.doSample")
    ? localStorage.getItem("ai.doSample") === "true"
    : defaultDoSample,
};

function getClientId() {
  let value = localStorage.getItem("ai.clientId");
  if (!value) {
    value = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("ai.clientId", value);
  }
  return value;
}

const clientId = getClientId();
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSupported = Boolean(window.speechSynthesis);
const recognitionSupported = Boolean(SpeechRecognitionCtor);

modelName.textContent = model;
if (heroModelName) heroModelName.textContent = model;
if (providerBadgeEl) providerBadgeEl.textContent = modelProvider;

function saveSettings() {
  localStorage.setItem("ai.providerOverride", settings.providerOverride || modelProvider);
  localStorage.setItem("ai.modelOverride", settings.modelOverride || model);
  localStorage.setItem("ai.voiceName", settings.voiceName || "");
  localStorage.setItem("ai.voiceLanguage", settings.voiceLanguage || "en-US");
  localStorage.setItem("ai.voiceRate", String(settings.voiceRate));
  localStorage.setItem("ai.voicePitch", String(settings.voicePitch));
  localStorage.setItem("ai.autoSpeak", String(settings.autoSpeak));
  localStorage.setItem("ai.transcriptPreview", String(settings.transcriptPreview));
  localStorage.setItem("ai.responsePreset", settings.responsePreset);
  localStorage.setItem("ai.useWeb", String(settings.useWeb));
  localStorage.setItem("ai.deepWeb", String(settings.deepWeb));
  localStorage.setItem("ai.backgroundJobs", String(settings.backgroundJobs));
  localStorage.setItem("ai.concise", String(settings.concise));
  localStorage.setItem("ai.maxNewTokens", String(settings.maxNewTokens));
  localStorage.setItem("ai.temperature", String(settings.temperature));
  localStorage.setItem("ai.topP", String(settings.topP));
  localStorage.setItem("ai.sendOnEnter", String(settings.sendOnEnter));
  localStorage.setItem("ai.doSample", String(settings.doSample));
}

function populateVoiceOptions() {
  if (!speechSupported || !voiceSelectEl) return;
  availableVoices = window.speechSynthesis.getVoices() || [];
  voiceSelectEl.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Browser default";
  voiceSelectEl.appendChild(defaultOption);

  availableVoices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelectEl.appendChild(option);
  });

  voiceSelectEl.value = settings.voiceName;
}

function applySettingsToUI() {
  if (providerSelectEl) providerSelectEl.value = settings.providerOverride || modelProvider;
  if (voiceLanguageSelectEl) voiceLanguageSelectEl.value = settings.voiceLanguage;
  if (voiceRateEl) voiceRateEl.value = String(settings.voiceRate);
  if (voicePitchEl) voicePitchEl.value = String(settings.voicePitch);
  if (autoSpeakToggleEl) autoSpeakToggleEl.checked = settings.autoSpeak;
  if (transcriptPreviewToggleEl) transcriptPreviewToggleEl.checked = settings.transcriptPreview;
  if (responsePresetEl) responsePresetEl.value = settings.responsePreset;
  if (useWebToggleEl) useWebToggleEl.checked = settings.useWeb;
  if (deepWebToggleEl) deepWebToggleEl.checked = settings.deepWeb;
  if (backgroundJobsToggleEl) backgroundJobsToggleEl.checked = settings.backgroundJobs;
  if (conciseToggleEl) conciseToggleEl.checked = settings.concise;
  if (maxTokensInputEl) maxTokensInputEl.value = String(settings.maxNewTokens);
  if (temperatureRangeEl) temperatureRangeEl.value = String(settings.temperature);
  if (temperatureValueEl) temperatureValueEl.textContent = settings.temperature.toFixed(2);
  if (topPRangeEl) topPRangeEl.value = String(settings.topP);
  if (topPValueEl) topPValueEl.textContent = settings.topP.toFixed(2);
  if (samplingToggleEl) samplingToggleEl.checked = settings.doSample;
  const presetLabel = (settings.responsePreset || "balanced").replace(/^./, (char) => char.toUpperCase());
  if (statusPresetEl) statusPresetEl.textContent = presetLabel;
  if (statusPresetModalEl) statusPresetModalEl.textContent = presetLabel;
  if (sendOnEnterToggleEl) sendOnEnterToggleEl.checked = settings.sendOnEnter;
  if (sendOnEnterToggleModalEl) sendOnEnterToggleModalEl.checked = settings.sendOnEnter;
  populateVoiceOptions();
  populateModelOptions();
}

function populateModelOptions() {
  if (!providerSelectEl || !modelSelectEl) return;
  const provider = settings.providerOverride || modelProvider;
  const providerModels = modelCatalog?.providers?.[provider] || [{ name: provider === "ollama" ? body.dataset.model : model }];
  modelSelectEl.innerHTML = "";
  providerModels.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.name;
    option.textContent = item.name;
    modelSelectEl.appendChild(option);
  });
  if ([...modelSelectEl.options].some((option) => option.value === settings.modelOverride)) {
    modelSelectEl.value = settings.modelOverride;
  } else if (modelSelectEl.options.length) {
    settings.modelOverride = modelSelectEl.options[0].value;
    modelSelectEl.value = settings.modelOverride;
    saveSettings();
  }
}

function updateAuthUI() {
  if (authStateBadgeEl) authStateBadgeEl.textContent = currentUsername || "Guest";
  if (authStatusEl) {
    authStatusEl.textContent = currentUsername
      ? `Signed in as ${currentUsername}.`
      : "Sign in to sync sessions beyond the device token.";
  }
}

function setStatusChip(el, value, kind = "ok") {
  if (!el) return;
  el.textContent = value;
  el.classList.remove("ok", "warn", "error");
  el.classList.add(kind);
}

function setMirroredStatus(primary, secondary, value, kind) {
  setStatusChip(primary, value, kind);
  setStatusChip(secondary, value, kind);
}

function buildChatOptions() {
  let resolvedMaxTokens = settings.maxNewTokens;
  let temperature = settings.temperature;
  let topP = settings.topP;
  let doSample = settings.doSample;

  if (settings.responsePreset === "fast") {
    resolvedMaxTokens = Math.min(resolvedMaxTokens, 160);
    temperature = Math.min(temperature, 0.55);
    topP = Math.min(topP, 0.85);
  } else if (settings.responsePreset === "balanced") {
    resolvedMaxTokens = Math.min(resolvedMaxTokens, 320);
  } else if (settings.responsePreset === "detailed") {
    resolvedMaxTokens = Math.max(resolvedMaxTokens, 900);
    temperature = Math.max(temperature, 0.5);
  } else if (settings.responsePreset === "coding") {
    resolvedMaxTokens = Math.max(resolvedMaxTokens, 700);
    temperature = Math.min(temperature, 0.35);
    topP = Math.min(topP, 0.82);
    doSample = false;
  }

  if (settings.concise) {
    resolvedMaxTokens = Math.min(resolvedMaxTokens, 120);
  }

  return {
    temperature,
    top_p: topP,
    do_sample: doSample,
    max_new_tokens: resolvedMaxTokens,
  };
}

if (!recognitionSupported) {
  micBtn.disabled = true;
  voiceChatBtn.disabled = true;
}
if (!speechSupported) {
  voiceChatBtn.disabled = true;
}
applySettingsToUI();
if (speechSupported) {
  window.speechSynthesis.onvoiceschanged = () => populateVoiceOptions();
}

function headers(isJson = true) {
  const h = { "X-API-Key": apiKey, "X-Client-Id": clientId };
  if (authToken) h["X-Auth-Token"] = authToken;
  if (isJson) h["Content-Type"] = "application/json";
  return h;
}

async function readResponsePayload(response) {
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    return { error: text || `Request failed with status ${response.status}` };
  }
}

async function loadSystemStatus() {
  setMirroredStatus(statusChatEl, statusChatModalEl, "Ready", "ok");
  setMirroredStatus(
    statusPresetEl,
    statusPresetModalEl,
    (settings.responsePreset || "balanced").replace(/^./, (char) => char.toUpperCase()),
    "ok"
  );

  try {
    const res = await fetch("/api/health/details", { headers: headers(false) });
    const data = await readResponsePayload(res);
    if (!res.ok) {
      setMirroredStatus(statusImageEl, statusImageModalEl, "Unavailable", "error");
      setMirroredStatus(statusOcrEl, statusOcrModalEl, "Unavailable", "error");
      return;
    }

    const captionerReady = Boolean(data?.pipelines?.image_captioner?.ready);
    const ocrReady = Boolean(data?.pipelines?.image_ocr?.ready);
    setMirroredStatus(statusImageEl, statusImageModalEl, captionerReady ? "Ready" : "Loading", captionerReady ? "ok" : "warn");
    setMirroredStatus(statusOcrEl, statusOcrModalEl, ocrReady ? "Ready" : "Loading", ocrReady ? "ok" : "warn");
  } catch (err) {
    setMirroredStatus(statusImageEl, statusImageModalEl, "Offline", "error");
    setMirroredStatus(statusOcrEl, statusOcrModalEl, "Offline", "error");
  }

  try {
    const [adminRes, meRes] = await Promise.all([
      fetch("/api/admin/overview", { headers: headers(false) }),
      fetch("/api/auth/me", { headers: headers(false) }),
    ]);
    const adminData = await readResponsePayload(adminRes);
    const meData = await readResponsePayload(meRes);
    if (adminRes.ok && adminSummaryEl) {
      adminSummaryEl.textContent =
        `Users ${adminData.counts.users} | Conversations ${adminData.counts.conversations} | Messages ${adminData.counts.messages} | Jobs ${adminData.jobs.running} running`;
    }
    if (meRes.ok) {
      currentUsername = meData.username || "";
      if (!currentUsername) authToken = authToken || "";
      updateAuthUI();
    }
  } catch (err) {
    if (adminSummaryEl) adminSummaryEl.textContent = "Metrics unavailable.";
  }
}

function showToast(message, type = "info") {
  if (!appToastEl || !appToastBodyEl || typeof bootstrap === "undefined") {
    console[type === "error" ? "error" : "log"](message);
    return;
  }
  appToastBodyEl.textContent = message;
  appToastEl.classList.remove("toast-error", "toast-success");
  if (type === "error") appToastEl.classList.add("toast-error");
  if (type === "success") appToastEl.classList.add("toast-success");
  bootstrap.Toast.getOrCreateInstance(appToastEl, { delay: 2600 }).show();
}

function updateToolContext() {
  if (!toolContextEl) return;
  const mapping = {
    chat: "Chat: ask anything directly. Use detail only when needed.",
    analyze: "Image Analyze: upload one image and ask what to extract or explain.",
    edit: "Image Edit: upload one image and describe the exact visual change.",
    generate: "Image Generate: write a prompt with subject, style, lighting, and composition.",
    "file-analyze": "File Analyze: upload one file and describe what you want extracted or summarized.",
    "file-parse": "File Parse: upload one file and choose a parser such as table, resume, invoice, contract, or section summary.",
    "file-compare": "File Compare: upload two files and describe what to compare.",
    "file-generate": "File Generate: describe the target file and output format.",
    "file-convert": "File Convert: upload one file and choose the format to convert into.",
  };
  toolContextEl.textContent = mapping[chatModeEl?.value || "chat"] || mapping.chat;
}

function renderAttachmentTray() {
  if (!attachmentTrayEl) return;
  const attachments = [];
  if (imageReaderFile?.files?.length) attachments.push(`Image: ${imageReaderFile.files[0].name}`);
  if (fileInput?.files?.length) attachments.push(`File: ${fileInput.files[0].name}`);
  if (fileInputSecondary?.files?.length) attachments.push(`Compare: ${fileInputSecondary.files[0].name}`);
  attachmentTrayEl.innerHTML = attachments.map((item) => `<span class="attachment-pill">${item}</span>`).join("");
  attachmentTrayEl.classList.toggle("d-none", attachments.length === 0);
}

function updateSlashHint() {
  if (!slashHintEl || !promptEl) return;
  const text = (promptEl.value || "").trim();
  slashHintEl.classList.toggle("d-none", !text.startsWith("/"));
}

async function loadModelCatalog() {
  try {
    const res = await fetch("/api/models", { headers: headers(false) });
    const data = await readResponsePayload(res);
    if (!res.ok) return;
    modelCatalog = data;
    if (!settings.providerOverride) settings.providerOverride = data.active_provider || modelProvider;
    if (!settings.modelOverride) settings.modelOverride = data.active_model || model;
    populateModelOptions();
  } catch (err) {
    modelCatalog = null;
  }
}

