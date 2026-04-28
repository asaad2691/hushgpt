
(function () {
  const body = document.body;
  const apiKey = body.dataset.apiKey || "";
  const defaultMaxNewTokens = Number(body.dataset.defaultMaxNewTokens || 220);
  const defaultTemperature = Number(body.dataset.defaultTemperature || 0.7);
  const defaultTopP = Number(body.dataset.defaultTopP || 0.9);
  const defaultDoSample = String(body.dataset.defaultDoSample || "true") === "true";
  const storageKey = "hushgpt-persona-ui";
  const clientStorageKey = "hushgpt-client-id";
  const recognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mouthYRange = { min: 18, max: 92 };

  const refs = {
    avatar: document.getElementById("persona-avatar"),
    portraitShell: document.getElementById("persona-portrait-shell"),
    portrait: document.getElementById("persona-portrait"),
    portraitVideo: document.getElementById("persona-portrait-video"),
    generatedStage: document.getElementById("persona-generated-stage"),
    generatedCharacter: document.getElementById("generated-character"),
    generatedMouth: document.getElementById("generated-mouth"),
    modelStage: document.getElementById("persona-model-stage"),
    modelCanvas: document.getElementById("persona-model-canvas"),
    mouthAnchor: document.getElementById("avatar-mouth-anchor"),
    mouth: document.getElementById("avatar-mouth"),
    mouthImage: document.getElementById("avatar-mouth-image"),
    mouthVideo: document.getElementById("avatar-mouth-video"),
    displayName: document.getElementById("persona-display-name"),
    displayRole: document.getElementById("persona-display-role"),
    speakingPill: document.getElementById("persona-speaking-pill"),
    listeningPill: document.getElementById("persona-listening-pill"),
    languagePill: document.getElementById("persona-language-pill"),
    profileList: document.getElementById("persona-profile-list"),
    newProfileBtn: document.getElementById("persona-new-profile-btn"),
    saveProfileBtn: document.getElementById("persona-save-profile-btn"),
    duplicateProfileBtn: document.getElementById("persona-duplicate-profile-btn"),
    exportProfileBtn: document.getElementById("persona-export-profile-btn"),
    importProfileInput: document.getElementById("persona-import-profile-input"),
    deleteProfileBtn: document.getElementById("persona-delete-profile-btn"),
    presetChipRow: document.getElementById("persona-preset-chip-row"),
    starterGrid: document.getElementById("persona-starter-grid"),
    collections: document.getElementById("persona-collections"),
    refreshCollectionsBtn: document.getElementById("persona-refresh-collections-btn"),
    createCollectionBtn: document.getElementById("persona-create-collection-btn"),
    newCollectionName: document.getElementById("persona-new-collection-name"),
    collectionFileInput: document.getElementById("persona-collection-file-input"),
    uploadCollectionFilesBtn: document.getElementById("persona-upload-collection-files-btn"),
    collectionUrl: document.getElementById("persona-collection-url"),
    ingestCollectionUrlBtn: document.getElementById("persona-ingest-collection-url-btn"),
    bundleSummaryCount: document.getElementById("persona-bundle-summary-count"),
    bundleAssets: document.getElementById("persona-bundle-assets"),
    personaName: document.getElementById("persona-name"),
    personaPreset: document.getElementById("persona-preset"),
    personaMotion: document.getElementById("persona-motion"),
    personaScenario: document.getElementById("persona-scenario"),
    personaTone: document.getElementById("persona-tone"),
    personaRole: document.getElementById("persona-role"),
    personaStyle: document.getElementById("persona-style"),
    personaLanguage: document.getElementById("persona-language"),
    personaVoice: document.getElementById("persona-voice"),
    personaRate: document.getElementById("persona-rate"),
    personaPitch: document.getElementById("persona-pitch"),
    personaAvatarFile: document.getElementById("persona-avatar-file"),
    personaUseBuiltInBtn: document.getElementById("persona-use-built-in-btn"),
    personaAccent: document.getElementById("persona-accent"),
    personaAvatarPack: document.getElementById("persona-avatar-pack"),
    personaModelSelector: document.getElementById("persona-model-selector"),
    personaAvatarGender: document.getElementById("persona-avatar-gender"),
    personaAvatarFace: document.getElementById("persona-avatar-face"),
    personaAvatarHairStyle: document.getElementById("persona-avatar-hair-style"),
    personaAvatarAccessory: document.getElementById("persona-avatar-accessory"),
    personaAvatarOutfitStyle: document.getElementById("persona-avatar-outfit-style"),
    personaAvatarSkinTone: document.getElementById("persona-avatar-skin-tone"),
    personaAvatarHairColor: document.getElementById("persona-avatar-hair-color"),
    personaAvatarEyeColor: document.getElementById("persona-avatar-eye-color"),
    personaAvatarOutfitColor: document.getElementById("persona-avatar-outfit-color"),
    personaZoom: document.getElementById("persona-zoom"),
    personaMouthX: document.getElementById("persona-mouth-x"),
    personaMouthY: document.getElementById("persona-mouth-y"),
    personaMouthWidth: document.getElementById("persona-mouth-width"),
    personaMouthHeight: document.getElementById("persona-mouth-height"),
    personaCalibrateBtn: document.getElementById("persona-calibrate-btn"),
    personaBilingual: document.getElementById("persona-bilingual"),
    personaSpeakShorter: document.getElementById("persona-speak-shorter"),
    transcriptPreview: document.getElementById("persona-transcript-preview"),
    autoSpeak: document.getElementById("auto-speak"),
    useWeb: document.getElementById("use-web"),
    deepWeb: document.getElementById("deep-web"),
    micBtn: document.getElementById("persona-mic-btn"),
    pushTalkBtn: document.getElementById("persona-push-talk-btn"),
    voiceChatBtn: document.getElementById("persona-voice-chat-btn"),
    stopBtn: document.getElementById("persona-stop-btn"),
    testVoiceBtn: document.getElementById("persona-test-voice-btn"),
    micMeter: document.getElementById("persona-mic-meter"),
    conversationSearch: document.getElementById("persona-conversation-search"),
    conversationList: document.getElementById("persona-conversation-list"),
    clearChatBtn: document.getElementById("clear-persona-chat-btn"),
    resetBtn: document.getElementById("reset-persona-btn"),
    advancedPanel: document.getElementById("persona-advanced-panel"),
    form: document.getElementById("persona-form"),
    prompt: document.getElementById("persona-prompt"),
    chatLog: document.getElementById("persona-chat-log"),
    helper: document.getElementById("persona-helper"),
    error: document.getElementById("persona-error"),
    panelButtons: Array.from(document.querySelectorAll(".panel-switcher-btn")),
    panelSections: Array.from(document.querySelectorAll(".workbench-panel")),
  };

  const state = {
    presets: [], collections: [], profiles: [], conversations: [], history: [], voices: [],
    activeProfileId: null, activeConversationId: null, recognition: null, voiceLoop: false,
    isListening: false, isSpeaking: false, lipSyncTimer: null, isCalibrating: false, dragMode: null,
    speechQueue: [], speechQueueRunning: false, pendingSpeechText: "",
    model3d: { renderer: null, scene: null, camera: null, loader: null, root: null, mixer: null, clock: null, morphTargets: [], headBone: null, frameHandle: null, currentSrc: "", enabled: false, proceduralParts: null },
  };
  const uiState = JSON.parse(localStorage.getItem(storageKey) || "{}");
  const BUILT_IN_AVATAR_PREFIX = "avatar://built-in?";
  const builtInPalettes = {
    fair: { skin: "#f7d8c7", shade: "#e6b89e", blush: "rgba(255, 172, 174, 0.18)" },
    warm: { skin: "#efc1a6", shade: "#d49879", blush: "rgba(255, 154, 150, 0.16)" },
    tan: { skin: "#cc9a78", shade: "#9e6d54", blush: "rgba(214, 126, 112, 0.14)" },
    deep: { skin: "#8f604a", shade: "#653f31", blush: "rgba(170, 98, 94, 0.12)" }
  };
  const selectorDefaults = {
    "realistic-female": { model: "realistic-female", gender: "f", face: "soft", hairStyle: "long", accessory: "none", outfitStyle: "blazer", skinTone: "warm", hairColor: "#503a33", eyeColor: "#7089b3", outfitColor: "#24385f" },
    "realistic-male": { model: "realistic-male", gender: "m", face: "sharp", hairStyle: "short", accessory: "none", outfitStyle: "blazer", skinTone: "warm", hairColor: "#2c2727", eyeColor: "#6f89a8", outfitColor: "#1f2f4f" },
    "professional-female": { model: "professional-female", gender: "f", face: "sharp", hairStyle: "bob", accessory: "glasses", outfitStyle: "blazer", skinTone: "fair", hairColor: "#3f312d", eyeColor: "#7d96c7", outfitColor: "#2d4469" },
    "professional-male": { model: "professional-male", gender: "m", face: "sharp", hairStyle: "short", accessory: "glasses", outfitStyle: "blazer", skinTone: "tan", hairColor: "#2e2b31", eyeColor: "#7d96bf", outfitColor: "#263c61" }
  };
  const builtInPackDefaults = {
    realistic: { ...selectorDefaults["realistic-female"] },
    corporate: { ...selectorDefaults["professional-male"] },
    hologram: { ...selectorDefaults["professional-female"], accessory: "headset", hairColor: "#d9f7ff", eyeColor: "#8cf7ff", outfitColor: "#1d8aa4", skinTone: "fair" },
    "minimal-assistant": { ...selectorDefaults["professional-female"], accessory: "none", outfitStyle: "hoodie", hairStyle: "bob", outfitColor: "#4a5a89" }
  };

  function normalizeHex(value, fallback) {
    const raw = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
    if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
    return fallback;
  }

  function mixHex(hex, ratio) {
    const safe = normalizeHex(hex, "#7bf2df").slice(1);
    const amount = Math.max(-1, Math.min(1, Number(ratio) || 0));
    const channels = [0, 2, 4].map((index) => parseInt(safe.slice(index, index + 2), 16));
    const mixed = channels.map((channel) => {
      const target = amount >= 0 ? 255 : 0;
      return Math.round(channel + ((target - channel) * Math.abs(amount)));
    });
    return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function isBuiltInAvatarSource(value) {
    return String(value || "").startsWith(BUILT_IN_AVATAR_PREFIX);
  }

  function getBuiltInPackTheme(pack) {
    return builtInPackDefaults[pack] ? pack : "realistic";
  }

  function builtInAvatarDefaults(pack = "realistic") {
    return { ...(builtInPackDefaults[getBuiltInPackTheme(pack)] || builtInPackDefaults.realistic) };
  }

  function defaultSelectorForPack(pack = "realistic") {
    if (pack === "corporate") return "professional-male";
    if (pack === "hologram") return "professional-female";
    if (pack === "minimal-assistant") return "professional-female";
    return "realistic-female";
  }

  function parseBuiltInAvatarDescriptor(value) {
    if (!isBuiltInAvatarSource(value)) return null;
    const query = String(value).slice(BUILT_IN_AVATAR_PREFIX.length);
    const params = new URLSearchParams(query);
    return {
      model: params.get("m") || "realistic-female",
      gender: params.get("g") || "f",
      face: params.get("f") || "soft",
      hairStyle: params.get("hs") || "long",
      accessory: params.get("a") || "none",
      outfitStyle: params.get("os") || "blazer",
      skinTone: params.get("st") || "warm",
      hairColor: normalizeHex(params.get("hc"), "#503a33"),
      eyeColor: normalizeHex(params.get("ec"), "#7089b3"),
      outfitColor: normalizeHex(params.get("oc"), "#24385f")
    };
  }

  function buildBuiltInAvatarDescriptor(config, pack = "realistic") {
    const params = new URLSearchParams({
      p: getBuiltInPackTheme(pack),
      m: config.model || defaultSelectorForPack(pack),
      g: config.gender || "f",
      f: config.face || "soft",
      hs: config.hairStyle || "long",
      a: config.accessory || "none",
      os: config.outfitStyle || "blazer",
      st: config.skinTone || "warm",
      hc: normalizeHex(config.hairColor, "#503a33").slice(1),
      ec: normalizeHex(config.eyeColor, "#7089b3").slice(1),
      oc: normalizeHex(config.outfitColor, "#24385f").slice(1)
    });
    return `${BUILT_IN_AVATAR_PREFIX}${params.toString()}`;
  }

  function getBuiltInAvatarConfig(profile = activeProfile()) {
    const pack = getBuiltInPackTheme(profile.avatar_pack || "realistic");
    return { ...builtInAvatarDefaults(pack), ...(parseBuiltInAvatarDescriptor(profile.avatar_path) || {}) };
  }

  function getBuiltInAvatarConfigFromInputs() {
    return {
      model: refs.personaModelSelector?.value || defaultSelectorForPack(refs.personaAvatarPack?.value || "realistic"),
      gender: refs.personaAvatarGender?.value || "f",
      face: refs.personaAvatarFace?.value || "soft",
      hairStyle: refs.personaAvatarHairStyle?.value || "long",
      accessory: refs.personaAvatarAccessory?.value || "none",
      outfitStyle: refs.personaAvatarOutfitStyle?.value || "blazer",
      skinTone: refs.personaAvatarSkinTone?.value || "warm",
      hairColor: normalizeHex(refs.personaAvatarHairColor?.value, "#503a33"),
      eyeColor: normalizeHex(refs.personaAvatarEyeColor?.value, "#7089b3"),
      outfitColor: normalizeHex(refs.personaAvatarOutfitColor?.value, "#24385f")
    };
  }

  function shouldUseBuiltInAvatar(profile = activeProfile()) {
    const src = profile.avatar_path || "";
    return isBuiltInAvatarSource(src) || !src || src === "/static/img/persona-default.avif";
  }

  function syncGeneratedAvatarState() {
    if (!refs.generatedCharacter) return;
    refs.generatedCharacter.classList.toggle("is-speaking", !!state.isSpeaking);
    refs.generatedCharacter.classList.toggle("is-listening", !!state.isListening);
  }

  function setAnimatedMouthFrame(frameName) {
    if (refs.mouth) refs.mouth.className = `avatar-mouth ${frameName}`;
    if (refs.generatedMouth) refs.generatedMouth.className = `generated-mouth ${frameName}`;
  }

  function applyBuiltInAvatar() {}

  function defaultProfile() {
    const config = { ...selectorDefaults["realistic-female"] };
    return { name: "Nova", preset: "companion", motion: "float", scenario: "companion", tone: "calm", role: "A multilingual AI companion for natural chat and voice conversation.", style: "Warm, clear, emotionally steady, and naturally conversational.", language: "auto", voice_name: "", avatar_path: buildBuiltInAvatarDescriptor(config, "realistic"), avatar_pack: "realistic", accent: "#7bf2df", zoom: 1.06, mouth_x: 50, mouth_y: 74, mouth_width: 72, mouth_height: 30, speech_rate: 0.95, speech_pitch: 1, auto_speak: true, use_web: false, deep_web: false, bilingual: false, speak_shorter: false, collection_ids: [], starter_prompts: [] };
  }

  function getClientId() {
    let clientId = localStorage.getItem(clientStorageKey);
    if (!clientId) { clientId = `persona-${crypto.randomUUID()}`; localStorage.setItem(clientStorageKey, clientId); }
    return clientId;
  }
  function headers(isJson = true) {
    const output = { "X-API-Key": apiKey, "X-Client-Id": getClientId() };
    const authToken = localStorage.getItem("ai.authToken") || "";
    if (authToken) output["X-Auth-Token"] = authToken;
    if (isJson) output["Content-Type"] = "application/json";
    return output;
  }
  async function readPayload(response) {
    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) return response.json();
    const text = await response.text();
    try { return JSON.parse(text); } catch (_) { return { error: text }; }
  }
  function showError(message) { refs.error.textContent = message; refs.error.classList.remove("d-none"); }
  function clearError() { refs.error.textContent = ""; refs.error.classList.add("d-none"); }
  function setHelper(message) { refs.helper.textContent = message; }
  function isCompactViewport() { return window.innerWidth <= 760; }
  function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
  function activeProfile() { return state.profiles.find((item) => item.id === state.activeProfileId) || defaultProfile(); }
  function saveUiState() { localStorage.setItem(storageKey, JSON.stringify({ activeProfileId: state.activeProfileId, activeConversationId: state.activeConversationId, transcriptPreview: refs.transcriptPreview.checked })); }
  function syncPanel(name, scroll = false) {
    refs.panelButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.panelTarget === name));
    refs.panelSections.forEach((section) => section.classList.toggle("is-active", section.dataset.panelName === name));
    if (scroll && isCompactViewport()) refs.panelSections.find((s) => s.dataset.panelName === name)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectedCollectionIdsFromUi() {
    return [...(refs.collections?.selectedOptions || [])].map((option) => Number(option.value)).filter((value) => Number.isFinite(value) && value > 0);
  }

  function renderCollectionBundleSummary(assets = null) {
    if (!refs.bundleAssets || !refs.bundleSummaryCount) return;
    const selectedIds = selectedCollectionIdsFromUi();
    const selectedCollections = state.collections.filter((collection) => selectedIds.includes(Number(collection.id)));
    if (!selectedCollections.length) {
      refs.bundleSummaryCount.textContent = "No bundles selected";
      refs.bundleAssets.innerHTML = `<div class="persona-bundle-empty">Select a bundle to let this persona answer from its docs and websites.</div>`;
      return;
    }
    const rows = Array.isArray(assets) ? assets : [];
    refs.bundleSummaryCount.textContent = `${selectedCollections.length} bundle${selectedCollections.length === 1 ? "" : "s"} Â· ${rows.length} asset${rows.length === 1 ? "" : "s"}`;
    if (!rows.length) {
      refs.bundleAssets.innerHTML = `<div class="persona-bundle-empty">${selectedCollections.map((collection) => escapeHtml(collection.name)).join(", ")} selected. Upload files or ingest a site to make them useful here.</div>`;
      return;
    }
    refs.bundleAssets.innerHTML = rows.slice(0, 12).map((asset) => {
      const collectionName = asset.collection_name || state.collections.find((collection) => Number(collection.id) === Number(asset.collection_id))?.name || "Bundle";
      return `<article class="persona-bundle-asset"><div class="persona-bundle-asset-top"><span class="persona-bundle-asset-title">${escapeHtml(asset.title || asset.source_ref || "Asset")}</span><span class="persona-bundle-asset-meta">${escapeHtml(collectionName)}</span></div><div class="persona-bundle-asset-copy">${escapeHtml((asset.preview || asset.source_ref || "").slice(0, 180) || "No preview available.")}</div></article>`;
    }).join("");
  }

  async function refreshCollectionBundleSummary() {
    const selectedIds = selectedCollectionIdsFromUi();
    if (!selectedIds.length) {
      renderCollectionBundleSummary([]);
      return;
    }
    try {
      const payloads = await Promise.all(selectedIds.map(async (collectionId) => {
        const response = await fetch(`/api/collections/${collectionId}`, { headers: headers(false) });
        const data = await readPayload(response);
        if (!response.ok) throw new Error(data.error || "Failed to load bundle details.");
        return data;
      }));
      const assets = payloads.flatMap((collection) => (collection.assets || []).map((asset) => ({ ...asset, collection_name: collection.name, collection_id: collection.id })));
      renderCollectionBundleSummary(assets);
    } catch (_) {
      renderCollectionBundleSummary(activeProfile().assets || []);
    }
  }

  async function syncProfileCollections() {
    if (!state.activeProfileId) {
      renderCollectionBundleSummary([]);
      return;
    }
    try {
      await saveActiveProfile();
      await refreshCollectionBundleSummary();
      setHelper("Persona bundles updated.");
    } catch (error) {
      showError(error.message || "Failed to update persona bundles.");
    }
  }

  function updateCollectionsSelect() {
    if (!refs.collections) return;
    const profile = activeProfile();
    refs.collections.innerHTML = state.collections.map((collection) => `<option value="${collection.id}">${escapeHtml(collection.name)}</option>`).join("");
    [...refs.collections.options].forEach((option) => { option.selected = (profile.collection_ids || []).includes(Number(option.value)); });
    renderCollectionBundleSummary(profile.assets || []);
  }

  function renderPresetChips() {
    refs.presetChipRow.innerHTML = state.presets.map((preset) => `<button class="persona-preset-chip ${activeProfile().preset === preset.key ? "is-active" : ""}" type="button" data-preset-key="${preset.key}">${escapeHtml(preset.key)}</button>`).join("");
    refs.presetChipRow.querySelectorAll("[data-preset-key]").forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.presetKey)));
  }

  function renderStarterPrompts() {
    const profile = activeProfile();
    const prompts = (profile.starter_prompts && profile.starter_prompts.length) ? profile.starter_prompts : [
      "Introduce yourself in a warm multilingual way and explain how I can use this persona mode.",
      "Talk to me in Urdu and English mixed naturally about how this project works.",
      "Explain Flask background jobs in a simple, spoken style with short sentences.",
    ];
    refs.starterGrid.innerHTML = prompts.map((prompt, index) => `<button class="starter-card" type="button" data-starter-index="${index}"><span class="starter-title">${escapeHtml((prompt.split(" ").slice(0, 3).join(" ")) || "Prompt")}</span><span class="starter-copy">${escapeHtml(prompt)}</span></button>`).join("");
    refs.starterGrid.querySelectorAll("[data-starter-index]").forEach((button) => button.addEventListener("click", () => { refs.prompt.value = prompts[Number(button.dataset.starterIndex)] || ""; if (isCompactViewport()) syncPanel("chat", true); }));
  }

  function renderProfiles() {
    refs.profileList.innerHTML = state.profiles.map((profile) => `<button class="persona-profile-item ${profile.id === state.activeProfileId ? "is-active" : ""}" type="button" data-profile-id="${profile.id}"><span class="persona-profile-title">${escapeHtml(profile.name)}</span><span class="persona-profile-copy">${escapeHtml(profile.scenario || profile.preset || "companion")} Â· ${escapeHtml(((profile.collection_names || []).slice(0, 2).join(", ")) || "No bundles")}</span></button>`).join("");
    refs.profileList.querySelectorAll("[data-profile-id]").forEach((button) => button.addEventListener("click", async () => {
      state.activeProfileId = Number(button.dataset.profileId);
      state.activeConversationId = null;
      saveUiState();
      syncInputsFromProfile();
      await loadConversations();
      renderProfiles();
    }));
  }

  function renderConversations() {
    const query = (refs.conversationSearch?.value || "").trim().toLowerCase();
    const rows = state.conversations.filter((item) => !query || `${item.title} ${item.summary} ${item.last_message}`.toLowerCase().includes(query));
    refs.conversationList.innerHTML = rows.map((item) => `<button class="persona-conversation-item ${item.id === state.activeConversationId ? "is-active" : ""}" type="button" data-conversation-id="${item.id}"><span class="persona-conversation-title">${escapeHtml(item.title || "Persona session")}</span><span class="persona-conversation-copy">${escapeHtml(item.last_message || item.summary || "No messages yet")}</span></button>`).join("");
    refs.conversationList.querySelectorAll("[data-conversation-id]").forEach((button) => button.addEventListener("click", () => loadConversation(Number(button.dataset.conversationId)).catch((error) => showError(error.message))));
  }

  function syncInputsFromProfile() {
    const profile = activeProfile();
    const builtInConfig = getBuiltInAvatarConfig(profile);
    refs.personaName.value = profile.name || "Nova";
    refs.personaPreset.value = profile.preset || "companion";
    refs.personaMotion.value = profile.motion || "float";
    refs.personaScenario.value = profile.scenario || "companion";
    refs.personaTone.value = profile.tone || "calm";
    refs.personaRole.value = profile.role || "";
    refs.personaStyle.value = profile.style || "";
    refs.personaLanguage.value = profile.language || "auto";
    refs.personaAccent.value = profile.accent || "#7bf2df";
    refs.personaAvatarPack.value = profile.avatar_pack || "realistic";
    if (refs.personaModelSelector) refs.personaModelSelector.value = builtInConfig.model || defaultSelectorForPack(profile.avatar_pack || "realistic");
    refs.personaAvatarGender.value = builtInConfig.gender || "f";
    refs.personaAvatarFace.value = builtInConfig.face || "soft";
    refs.personaAvatarHairStyle.value = builtInConfig.hairStyle || "long";
    refs.personaAvatarAccessory.value = builtInConfig.accessory || "none";
    refs.personaAvatarOutfitStyle.value = builtInConfig.outfitStyle || "blazer";
    refs.personaAvatarSkinTone.value = builtInConfig.skinTone || "warm";
    refs.personaAvatarHairColor.value = normalizeHex(builtInConfig.hairColor, "#503a33");
    refs.personaAvatarEyeColor.value = normalizeHex(builtInConfig.eyeColor, "#7089b3");
    refs.personaAvatarOutfitColor.value = normalizeHex(builtInConfig.outfitColor, "#24385f");
    refs.personaZoom.value = String(profile.zoom || 1.06);
    refs.personaMouthX.value = String(profile.mouth_x || 50);
    refs.personaMouthY.value = String(mouthYRange.min + mouthYRange.max - Number(profile.mouth_y || 74));
    refs.personaMouthWidth.value = String(profile.mouth_width || 72);
    refs.personaMouthHeight.value = String(profile.mouth_height || 30);
    refs.personaRate.value = String(profile.speech_rate || 0.95);
    refs.personaPitch.value = String(profile.speech_pitch || 1);
    refs.autoSpeak.checked = !!profile.auto_speak;
    refs.useWeb.checked = !!profile.use_web;
    refs.deepWeb.checked = !!profile.deep_web;
    refs.personaBilingual.checked = !!profile.bilingual;
    refs.personaSpeakShorter.checked = !!profile.speak_shorter;
    refs.personaVoice.value = profile.voice_name || "";
    updateCollectionsSelect();
    renderCollectionBundleSummary(profile.assets || []);
    applyPersonaVisuals();
    renderPresetChips();
    renderStarterPrompts();
  }

  function profileFromInputs() {
    const current = activeProfile();
    const nextPack = refs.personaAvatarPack.value || "realistic";
    const currentAvatarPath = current.avatar_path || "";
    let avatarPath = currentAvatarPath;
    const imageFallbackSelected = nextPack === "image-fallback";
    const currentLooksLikeMedia = /^(?:\/static\/uploads\/persona\/|https?:)/i.test(currentAvatarPath) || /\.(?:mp4|webm|glb|png|jpe?g|gif|webp|avif)$/i.test(currentAvatarPath);
    if (!imageFallbackSelected && (shouldUseBuiltInAvatar(current) || !currentLooksLikeMedia || /\.(?:png|jpe?g|gif|webp|avif)$/i.test(currentAvatarPath) || currentAvatarPath === "/static/img/persona-default.avif" || !currentAvatarPath)) {
      avatarPath = buildBuiltInAvatarDescriptor(getBuiltInAvatarConfigFromInputs(), nextPack);
    } else if (imageFallbackSelected && (shouldUseBuiltInAvatar(current) || !currentAvatarPath)) {
      avatarPath = "/static/img/persona-default.avif";
    }
    return { ...current, name: refs.personaName.value.trim() || "Nova", preset: refs.personaPreset.value || "companion", motion: refs.personaMotion.value || "float", scenario: refs.personaScenario.value || "companion", tone: refs.personaTone.value || "calm", role: refs.personaRole.value.trim() || defaultProfile().role, style: refs.personaStyle.value.trim() || defaultProfile().style, language: refs.personaLanguage.value || "auto", voice_name: refs.personaVoice.value || "", accent: refs.personaAccent.value || "#7bf2df", avatar_pack: nextPack, avatar_path: avatarPath, zoom: Number(refs.personaZoom.value || 1.06), mouth_x: Number(refs.personaMouthX.value || 50), mouth_y: mouthYRange.min + mouthYRange.max - Number(refs.personaMouthY.value || 74), mouth_width: Number(refs.personaMouthWidth.value || 72), mouth_height: Number(refs.personaMouthHeight.value || 30), speech_rate: Number(refs.personaRate.value || 0.95), speech_pitch: Number(refs.personaPitch.value || 1), auto_speak: refs.autoSpeak.checked, use_web: refs.useWeb.checked, deep_web: refs.deepWeb.checked, bilingual: refs.personaBilingual.checked, speak_shorter: refs.personaSpeakShorter.checked, collection_ids: [...refs.collections.selectedOptions].map((option) => Number(option.value)) };
  }

  function applyPersonaVisuals() {
    const profile = profileFromInputs();
    const avatarSrc = profile.avatar_path || "";
    const usePreset3D = shouldUseBuiltInAvatar(profile) && profile.avatar_pack !== "image-fallback";
    const useCustom3D = !usePreset3D && is3DAvatarSource(avatarSrc, profile);
    const use3D = usePreset3D || useCustom3D;
    const useVideo = !use3D && /\.(mp4|webm)$/i.test(avatarSrc);
    refs.displayName.textContent = profile.name;
    refs.displayRole.textContent = profile.role;
    refs.avatar.classList.remove("motion-float", "motion-cinematic", "motion-hologram", "motion-still");
    refs.avatar.classList.add(`motion-${profile.motion || "float"}`);
    refs.avatar.style.setProperty("--persona-accent-color", profile.accent);
    refs.avatar.style.setProperty("--portrait-scale", String(profile.zoom));
    refs.avatar.style.setProperty("--mouth-x", `${profile.mouth_x}%`);
    refs.avatar.style.setProperty("--mouth-y", `${profile.mouth_y}%`);
    refs.avatar.style.setProperty("--mouth-width", `${profile.mouth_width}px`);
    refs.avatar.style.setProperty("--mouth-height", `${profile.mouth_height}px`);
    refs.generatedStage?.classList.add("d-none");
    refs.modelStage?.classList.toggle("d-none", !use3D);
    refs.portrait.classList.toggle("d-none", use3D || useVideo);
    refs.portraitVideo.classList.toggle("d-none", use3D || !useVideo);
    refs.mouthAnchor.classList.toggle("d-none", use3D);
    refs.mouthImage.classList.toggle("d-none", use3D || useVideo);
    refs.mouthVideo.classList.toggle("d-none", use3D || !useVideo);
    refs.advancedPanel?.classList.toggle("d-none", use3D);
    if (usePreset3D) {
      loadProceduralAvatar(getBuiltInAvatarConfig(profile), profile.avatar_pack);
    } else if (useCustom3D) {
      load3DAvatar(avatarSrc);
    } else if (useVideo) {
      state.model3d.enabled = false;
      clear3DScene();
      refs.portraitVideo.src = avatarSrc;
      refs.mouthVideo.src = avatarSrc;
      refs.portraitVideo.play().catch(() => {});
      refs.mouthVideo.play().catch(() => {});
    } else {
      state.model3d.enabled = false;
      clear3DScene();
      refs.portrait.src = avatarSrc || "/static/img/persona-default.avif";
      refs.mouthImage.src = avatarSrc || "/static/img/persona-default.avif";
    }
    updateMouthMediaWindow();
    refs.languagePill.textContent = use3D ? `${profile.language === "auto" ? "Auto" : profile.language} Â· Real 3D Avatar` : (profile.language === "auto" ? "Auto Language" : profile.language);
  }

  function updateMouthMediaWindow() {
    const shellWidth = refs.portraitShell.clientWidth || 0;
    const shellHeight = refs.portraitShell.clientHeight || 0;
    if (!shellWidth || !shellHeight) return;
    const profile = profileFromInputs();
    const mouthCenterX = (profile.mouth_x / 100) * shellWidth;
    const mouthCenterY = (profile.mouth_y / 100) * shellHeight;
    refs.avatar.style.setProperty("--mouth-media-width", `${shellWidth}px`);
    refs.avatar.style.setProperty("--mouth-media-height", `${shellHeight}px`);
    refs.avatar.style.setProperty("--mouth-media-left", `${-(mouthCenterX - profile.mouth_width / 2)}px`);
    refs.avatar.style.setProperty("--mouth-media-top", `${-(mouthCenterY - profile.mouth_height / 2)}px`);
    resizeModelStage();
  }

  function is3DAvatarSource(src, profile) {
    return /\.glb$/i.test(src || "");
  }

  function stop3DRenderLoop() {
    if (state.model3d.frameHandle) {
      cancelAnimationFrame(state.model3d.frameHandle);
      state.model3d.frameHandle = null;
    }
  }

  function clear3DScene() {
    stop3DRenderLoop();
    if (state.model3d.root && state.model3d.scene) {
      state.model3d.scene.remove(state.model3d.root);
    }
    state.model3d.root = null;
    state.model3d.mixer = null;
    state.model3d.morphTargets = [];
    state.model3d.headBone = null;
    state.model3d.currentSrc = "";
    state.model3d.proceduralParts = null;
  }

  function resizeModelStage() {
    if (!state.model3d.enabled || !refs.modelCanvas || !refs.modelStage || !state.model3d.renderer || !state.model3d.camera) return;
    const width = refs.modelStage.clientWidth || refs.portraitShell.clientWidth || 1;
    const height = refs.modelStage.clientHeight || refs.portraitShell.clientHeight || 1;
    state.model3d.renderer.setSize(width, height, false);
    state.model3d.camera.aspect = width / height;
    state.model3d.camera.updateProjectionMatrix();
  }

  function ensure3DStage() {
    if (!refs.modelCanvas || !window.THREE || !window.THREE.GLTFLoader) return false;
    if (state.model3d.renderer) return true;
    const THREE = window.THREE;
    const renderer = new THREE.WebGLRenderer({ canvas: refs.modelCanvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace || undefined;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    camera.position.set(0, 1.35, 3.6);
    const ambient = new THREE.AmbientLight(0xffffff, 1.9);
    const key = new THREE.DirectionalLight(0xbfe6ff, 2.2);
    key.position.set(1.4, 2.2, 2.4);
    const rim = new THREE.DirectionalLight(0x7cf0df, 1.15);
    rim.position.set(-1.4, 1.2, -2.2);
    const fill = new THREE.PointLight(0x4f83ff, 0.9, 12);
    fill.position.set(0, 0.4, 2.6);
    scene.add(ambient, key, rim, fill);
    state.model3d.renderer = renderer;
    state.model3d.scene = scene;
    state.model3d.camera = camera;
    state.model3d.loader = new THREE.GLTFLoader();
    state.model3d.clock = new THREE.Clock();
    resizeModelStage();
    return true;
  }

  function collect3DMotionTargets(root) {
    const targets = [];
    let headBone = null;
    root.traverse((node) => {
      if (!headBone && node.isBone && /head|neck/i.test(node.name || "")) headBone = node;
      if (!node.isMesh || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
      Object.entries(node.morphTargetDictionary).forEach(([name, index]) => {
        if (/(mouth|viseme|aa|oh|ou|ee|ih|jaw|open|a$|o$)/i.test(name || "")) {
          targets.push({ mesh: node, index });
        }
      });
    });
    state.model3d.morphTargets = targets;
    state.model3d.headBone = headBone;
  }

  function frame3DAvatar(root) {
    const THREE = window.THREE;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    root.position.y -= size.y * 0.36;
    const targetHeight = 2.45;
    const scale = targetHeight / Math.max(size.y || 1, 0.01);
    root.scale.setScalar(scale);
  }

  function createProceduralAvatar(config, pack) {
    const THREE = window.THREE;
    const theme = getBuiltInPackTheme(pack);
    const palette = builtInPalettes[config.skinTone] || builtInPalettes.warm;
    const skin = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.72, metalness: 0.02 });
    const skinShade = new THREE.MeshStandardMaterial({ color: palette.shade, roughness: 0.82, metalness: 0.01 });
    const hair = new THREE.MeshStandardMaterial({ color: normalizeHex(config.hairColor, "#503a33"), roughness: 0.55, metalness: 0.04 });
    const eyes = new THREE.MeshStandardMaterial({ color: normalizeHex(config.eyeColor, "#7089b3"), roughness: 0.18, metalness: 0.2, emissive: theme === "hologram" ? new THREE.Color(normalizeHex(config.eyeColor, "#8cf7ff")) : new THREE.Color("#000000"), emissiveIntensity: theme === "hologram" ? 0.55 : 0 });
    const outfit = new THREE.MeshStandardMaterial({ color: normalizeHex(config.outfitColor, "#24385f"), roughness: 0.68, metalness: theme === "hologram" ? 0.2 : 0.06, transparent: theme === "hologram", opacity: theme === "hologram" ? 0.86 : 1, emissive: theme === "hologram" ? new THREE.Color("#46d2df") : new THREE.Color("#000000"), emissiveIntensity: theme === "hologram" ? 0.18 : 0 });
    const outfitLight = new THREE.MeshStandardMaterial({ color: mixHex(config.outfitColor, 0.2), roughness: 0.7, metalness: 0.05, transparent: theme === "hologram", opacity: theme === "hologram" ? 0.74 : 1 });
    const lipMaterial = new THREE.MeshStandardMaterial({ color: config.gender === "m" ? "#875c58" : "#a86d73", roughness: 0.42, metalness: 0.02 });
    const glassMaterial = new THREE.MeshPhysicalMaterial({ color: "#c9e7ff", roughness: 0.1, metalness: 0.15, transmission: 0.6, transparent: true, opacity: 0.34 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: "#232735", roughness: 0.35, metalness: 0.55 });
    const root = new THREE.Group();
    root.position.y = -0.86;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.92, 1.74, 28), outfit);
    torso.position.set(0, 0.22, 0);
    root.add(torso);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.72, 32, 24), outfitLight);
    shoulders.scale.set(1.48, 0.52, 0.88);
    shoulders.position.set(0, 0.9, 0.03);
    root.add(shoulders);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.32, 22), skinShade);
    neck.position.set(0, 1.52, 0.14);
    root.add(neck);
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.88, 0.22);
    root.add(headPivot);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.54, 42, 38), skin);
    head.scale.set(config.face === "sharp" ? 0.95 : 1.02, config.gender === "m" ? 1.12 : 1.18, 0.96);
    head.position.y = 0.06;
    headPivot.add(head);
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.06, 0.18);
    headPivot.add(jaw);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.28, 28, 24), skinShade);
    chin.scale.set(config.face === "sharp" ? 1.08 : 1.16, 0.84, 0.92);
    chin.position.set(0, -0.26, 0.13);
    jaw.add(chin);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.24, 18), skinShade);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.02, 0.51);
    headPivot.add(nose);
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.078, 18, 16), eyes);
    const rightEye = leftEye.clone();
    leftEye.position.set(-0.18, 0.09, 0.49);
    rightEye.position.set(0.18, 0.09, 0.49);
    headPivot.add(leftEye, rightEye);
    const browGeo = new THREE.BoxGeometry(0.18, 0.028, 0.03);
    const browMat = new THREE.MeshStandardMaterial({ color: mixHex(config.hairColor, -0.22), roughness: 0.6, metalness: 0.02 });
    const leftBrow = new THREE.Mesh(browGeo, browMat);
    const rightBrow = leftBrow.clone();
    leftBrow.position.set(-0.18, 0.22, 0.48);
    rightBrow.position.set(0.18, 0.22, 0.48);
    leftBrow.rotation.z = 0.08;
    rightBrow.rotation.z = -0.08;
    headPivot.add(leftBrow, rightBrow);
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.11, 22, 16), lipMaterial);
    mouth.scale.set(1.34, 0.18, 0.32);
    mouth.position.set(0, -0.24, 0.5);
    jaw.add(mouth);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.57, 36, 32), hair);
    hairCap.scale.set(1.06, 1, 1.02);
    hairCap.position.set(0, 0.14, -0.02);
    headPivot.add(hairCap);
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.32, 0.18), hair);
    fringe.position.set(0, 0.33, 0.35);
    fringe.rotation.x = -0.24;
    headPivot.add(fringe);
    if (config.hairStyle === "long" || config.hairStyle === "ponytail") {
      const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1, 0.22), hair);
      backHair.position.set(0, -0.08, -0.28);
      backHair.rotation.x = 0.06;
      headPivot.add(backHair);
      if (config.hairStyle === "ponytail") {
        const pony = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.7, 18), hair);
        pony.position.set(0.18, -0.24, -0.46);
        pony.rotation.z = -0.28;
        headPivot.add(pony);
      }
    } else if (config.hairStyle === "bob") {
      const bob = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.62, 0.26), hair);
      bob.position.set(0, -0.02, -0.18);
      headPivot.add(bob);
    } else if (config.hairStyle === "wolf") {
      const wolf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.82, 0.22), hair);
      wolf.position.set(0, 0.02, -0.2);
      wolf.rotation.z = 0.04;
      headPivot.add(wolf);
    }
    if (config.accessory === "glasses") {
      const lensGeo = new THREE.TorusGeometry(0.1, 0.012, 12, 24);
      const leftLens = new THREE.Mesh(lensGeo, darkMetal);
      const rightLens = new THREE.Mesh(lensGeo, darkMetal);
      leftLens.position.set(-0.18, 0.09, 0.52);
      rightLens.position.set(0.18, 0.09, 0.52);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.012), darkMetal);
      bridge.position.set(0, 0.09, 0.52);
      const leftGlass = new THREE.Mesh(new THREE.CircleGeometry(0.085, 18), glassMaterial);
      const rightGlass = leftGlass.clone();
      leftGlass.position.copy(leftLens.position);
      rightGlass.position.copy(rightLens.position);
      headPivot.add(leftLens, rightLens, bridge, leftGlass, rightGlass);
    }
    if (config.accessory === "headset") {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.024, 12, 40, Math.PI), darkMetal);
      band.rotation.z = Math.PI;
      band.position.set(0, 0.18, -0.04);
      const earLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 18), darkMetal);
      const earRight = earLeft.clone();
      earLeft.rotation.z = Math.PI / 2;
      earRight.rotation.z = Math.PI / 2;
      earLeft.position.set(-0.48, 0.04, 0.02);
      earRight.position.set(0.48, 0.04, 0.02);
      headPivot.add(band, earLeft, earRight);
    }
    if (config.outfitStyle === "blazer") {
      const lapelLeft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.56, 0.08), outfitLight);
      const lapelRight = lapelLeft.clone();
      lapelLeft.position.set(-0.18, 0.64, 0.42);
      lapelRight.position.set(0.18, 0.64, 0.42);
      lapelLeft.rotation.z = 0.34;
      lapelRight.rotation.z = -0.34;
      root.add(lapelLeft, lapelRight);
    } else if (config.outfitStyle === "hoodie") {
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.1, 16, 42, Math.PI), outfitLight);
      hood.position.set(0, 1.2, -0.16);
      hood.rotation.x = 0.24;
      root.add(hood);
    } else if (config.outfitStyle === "dress") {
      torso.scale.set(1.02, 1.08, 0.98);
    }
    if (theme === "hologram") {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.02, 16, 52), new THREE.MeshBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: 0.26 }));
      rim.position.set(0, 1.16, -0.18);
      rim.rotation.x = Math.PI / 2;
      root.add(rim);
    }
    return { root, torso, shoulders, headPivot, jaw, mouth, leftEye, rightEye, leftBrow, rightBrow };
  }

  function loadProceduralAvatar(config, pack) {
    if (!ensure3DStage()) return;
    const cacheKey = `procedural:${buildBuiltInAvatarDescriptor(config, pack)}`;
    if (state.model3d.currentSrc === cacheKey && state.model3d.proceduralParts) {
      state.model3d.enabled = true;
      animate3DStage();
      return;
    }
    clear3DScene();
    state.model3d.enabled = true;
    const procedural = createProceduralAvatar(config, pack);
    state.model3d.scene.add(procedural.root);
    state.model3d.root = procedural.root;
    state.model3d.proceduralParts = procedural;
    state.model3d.currentSrc = cacheKey;
    animate3DStage();
  }

  function load3DAvatar(src) {
    if (!ensure3DStage()) return;
    if (state.model3d.currentSrc === src) {
      state.model3d.enabled = true;
      animate3DStage();
      return;
    }
    clear3DScene();
    state.model3d.enabled = true;
    state.model3d.loader.load(src, (gltf) => {
      const root = gltf.scene || gltf.scenes?.[0];
      if (!root) return;
      frame3DAvatar(root);
      state.model3d.scene.add(root);
      state.model3d.root = root;
      state.model3d.currentSrc = src;
      collect3DMotionTargets(root);
      if (gltf.animations?.length) {
        state.model3d.mixer = new window.THREE.AnimationMixer(root);
        const clip = gltf.animations[0];
        state.model3d.mixer.clipAction(clip).play();
      }
      animate3DStage();
    }, undefined, () => {
      state.model3d.enabled = false;
      refs.modelStage?.classList.add("d-none");
      refs.portrait.classList.remove("d-none");
      refs.mouthAnchor.classList.remove("d-none");
      showError("3D avatar could not be loaded. Use a valid GLB avatar model.");
    });
  }

  function setSpeaking(active) { state.isSpeaking = active; refs.avatar.classList.toggle("speaking", active); refs.avatar.classList.toggle("avatar-3d-speaking", active && state.model3d.enabled); refs.speakingPill.textContent = active ? "Speaking" : "Idle"; refs.speakingPill.classList.toggle("status-pill-muted", !active); syncGeneratedAvatarState(); if (!active) setAnimatedMouthFrame("mouth-rest"); }
  function setListening(active) { state.isListening = active; refs.listeningPill.textContent = active ? "Listening" : "Mic Off"; refs.listeningPill.classList.toggle("status-pill-muted", !active); refs.micMeter.style.width = active ? "40%" : "0%"; syncGeneratedAvatarState(); }
  function loadVoices() {
    state.voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    refs.personaVoice.innerHTML = `<option value="">Browser Default</option>`;
    state.voices.forEach((voice) => { const option = document.createElement("option"); option.value = voice.name; option.textContent = `${voice.name} (${voice.lang})`; refs.personaVoice.appendChild(option); });
    refs.personaVoice.value = activeProfile().voice_name || "";
  }
  function detectTextLanguage(text) {
    if (/[\u0600-\u06FF]/.test(text)) return "ur-PK";
    if (/[\u0750-\u077F]/.test(text)) return "ar-SA";
    if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
    return refs.personaLanguage.value === "auto" ? "en-US" : refs.personaLanguage.value;
  }
  function resolveVoice(text) {
    const targetLang = detectTextLanguage(text).toLowerCase();
    const namedVoice = state.voices.find((voice) => voice.name === refs.personaVoice.value);
    if (namedVoice && (namedVoice.lang || "").toLowerCase().startsWith(targetLang.split("-")[0])) return namedVoice;
    return namedVoice
      || state.voices.find((voice) => (voice.lang || "").toLowerCase().startsWith(targetLang))
      || state.voices.find((voice) => (voice.lang || "").toLowerCase().startsWith(targetLang.split("-")[0]))
      || null;
  }
  function primeSpeech() {
    if (!window.speechSynthesis) return;
    try { window.speechSynthesis.resume(); } catch (_) { return; }
    if (state.speechPrimed) return;
    state.speechPrimed = true;
    try {
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      window.speechSynthesis.speak(primer);
      window.setTimeout(() => {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }, 20);
    } catch (_) {}
  }
  function clearLipSync() { if (state.lipSyncTimer) clearInterval(state.lipSyncTimer); state.lipSyncTimer = null; setSpeaking(false); }
  function stopSpeech() { if (window.speechSynthesis) window.speechSynthesis.cancel(); clearLipSync(); state.speechQueue = []; state.speechQueueRunning = false; state.pendingSpeechText = ""; }
  function speakText(text) {
    const cleaned = String(text || "").trim();
    if (!window.speechSynthesis || !cleaned) return Promise.resolve();
    primeSpeech();
    stopSpeech();
    try { window.speechSynthesis.resume(); } catch (_) {}
    const selectedVoice = resolveVoice(cleaned);
    const fallbackLang = detectTextLanguage(cleaned);
    const attempts = [
      { voice: selectedVoice, lang: selectedVoice ? (selectedVoice.lang || fallbackLang) : fallbackLang },
      { voice: null, lang: fallbackLang },
      { voice: null, lang: "en-US" },
    ].filter((attempt, index, items) => attempt.lang && items.findIndex((item) => `${item.voice?.name || "default"}|${item.lang}` === `${attempt.voice?.name || "default"}|${attempt.lang}`) === index);
    return new Promise((resolve, reject) => {
      const mouthFrames = ["mouth-1", "mouth-2", "mouth-3", "mouth-4"];
      let mouthIndex = 0;
      let attemptIndex = 0;
      const finish = (error = null) => {
        clearLipSync();
        if (error) reject(error); else resolve();
      };
      const runAttempt = () => {
        const attempt = attempts[attemptIndex];
        if (!attempt) {
          finish(new Error("Speech playback failed in this browser."));
          return;
        }
        try {
          const utterance = new SpeechSynthesisUtterance(cleaned);
          if (attempt.voice) utterance.voice = attempt.voice;
          utterance.lang = attempt.lang;
          utterance.rate = Number(refs.personaRate.value || 0.95);
          utterance.pitch = Number(refs.personaPitch.value || 1);
          utterance.onstart = () => { setSpeaking(true); state.lipSyncTimer = setInterval(() => { mouthIndex = (mouthIndex + 1) % mouthFrames.length; setAnimatedMouthFrame(mouthFrames[mouthIndex]); }, 110); };
          utterance.onend = () => finish();
          utterance.onerror = () => {
            clearLipSync();
            attemptIndex += 1;
            try { window.speechSynthesis.cancel(); } catch (_) {}
            window.setTimeout(runAttempt, 60);
          };
          window.speechSynthesis.speak(utterance);
        } catch (_) {
          clearLipSync();
          attemptIndex += 1;
          window.setTimeout(runAttempt, 60);
        }
      };
      runAttempt();
    });
  }
  async function processSpeechQueue() { if (state.speechQueueRunning) return; state.speechQueueRunning = true; while (state.speechQueue.length) { const next = state.speechQueue.shift(); try { await speakText(next); } catch (error) { showError(error.message); } } state.speechQueueRunning = false; }
  function enqueueSpeechText(text, flush = false) { state.pendingSpeechText += text; const parts = state.pendingSpeechText.split(/(?<=[.!?])\s+/); if (parts.length > 1 || flush) { const ready = flush ? parts : parts.slice(0, -1); state.pendingSpeechText = flush ? "" : (parts[parts.length - 1] || ""); ready.map((item) => item.trim()).filter(Boolean).forEach((item) => state.speechQueue.push(item)); processSpeechQueue(); } }

  async function createProfile(payload) { const response = await fetch("/api/persona/profiles", { method: "POST", headers: headers(), body: JSON.stringify(payload) }); const data = await readPayload(response); if (!response.ok) throw new Error(data.error || "Failed to create persona."); return data; }
  async function loadPresets() { const response = await fetch("/api/persona/presets", { headers: headers(false) }); const data = await readPayload(response); if (!response.ok) throw new Error(data.error || "Failed to load presets."); state.presets = data; refs.personaPreset.innerHTML = data.map((preset) => `<option value="${preset.key}">${preset.key}</option>`).join(""); renderPresetChips(); }
  async function loadCollections() { const response = await fetch("/api/collections", { headers: headers(false) }); const data = await readPayload(response); if (response.ok && Array.isArray(data)) state.collections = data; updateCollectionsSelect(); await refreshCollectionBundleSummary(); }
  async function loadProfiles() { const response = await fetch("/api/persona/profiles", { headers: headers(false) }); const data = await readPayload(response); if (!response.ok) throw new Error(data.error || "Failed to load personas."); state.profiles = data; if (!state.profiles.length) state.profiles = [await createProfile(defaultProfile())]; state.activeProfileId = state.profiles.some((item) => item.id === uiState.activeProfileId) ? uiState.activeProfileId : state.profiles[0].id; renderProfiles(); syncInputsFromProfile(); }
  async function saveActiveProfile() { const payload = profileFromInputs(); if (!state.activeProfileId) { const created = await createProfile(payload); state.profiles.unshift(created); state.activeProfileId = created.id; } else { const response = await fetch(`/api/persona/profiles/${state.activeProfileId}`, { method: "PATCH", headers: headers(), body: JSON.stringify(payload) }); const data = await readPayload(response); if (!response.ok) throw new Error(data.error || "Failed to save persona."); state.profiles = state.profiles.map((item) => item.id === data.id ? data : item); } renderProfiles(); syncInputsFromProfile(); saveUiState(); setHelper("Persona saved."); }
  async function duplicateActiveProfile() { if (!state.activeProfileId) return; const response = await fetch(`/api/persona/profiles/${state.activeProfileId}/duplicate`, { method: "POST", headers: headers() }); const data = await readPayload(response); if (!response.ok) throw new Error(data.error || "Failed to duplicate persona."); state.profiles.unshift(data); state.activeProfileId = data.id; renderProfiles(); syncInputsFromProfile(); await loadConversations(); }
  async function deleteActiveProfile() { if (!state.activeProfileId) return; const response = await fetch(`/api/persona/profiles/${state.activeProfileId}`, { method: "DELETE", headers: headers(false) }); const data = await readPayload(response); if (!response.ok) throw new Error(data.error || "Failed to delete persona."); state.profiles = state.profiles.filter((item) => item.id !== state.activeProfileId); state.activeProfileId = state.profiles[0]?.id || null; state.activeConversationId = null; state.history = []; renderProfiles(); renderMessages(); if (state.activeProfileId) { syncInputsFromProfile(); await loadConversations(); } }
  function downloadJson(filename, payload) { const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
  async function exportActiveProfile() { if (!state.activeProfileId) return; const response = await fetch(`/api/persona/profiles/${state.activeProfileId}/export`, { headers: headers(false) }); const data = await readPayload(response); if (!response.ok) throw new Error(data.error || "Failed to export persona."); downloadJson(`${activeProfile().name || "persona"}.json`, data); }
  async function importProfile(file) { const text = await file.text(); const response = await fetch("/api/persona/profiles/import", { method: "POST", headers: headers(), body: text }); const data = await readPayload(response); if (!response.ok) throw new Error(data.error || "Failed to import persona."); state.profiles.unshift(data); state.activeProfileId = data.id; renderProfiles(); syncInputsFromProfile(); await loadConversations(); }
  async function uploadAvatar(file) { const formData = new FormData(); formData.append("avatar", file, file.name); const response = await fetch("/api/persona/avatar", { method: "POST", headers: headers(false), body: formData }); const data = await readPayload(response); if (!response.ok) throw new Error(data.error || "Failed to upload avatar."); const inferredPack = /\.glb$/i.test(data.avatar_path || "") ? "anime-3d" : "image-fallback"; state.profiles = state.profiles.map((item) => item.id === state.activeProfileId ? { ...item, avatar_path: data.avatar_path, avatar_pack: inferredPack } : item); syncInputsFromProfile(); await saveActiveProfile(); }
  function useBuiltInAvatar() { const pack = ["realistic", "corporate", "hologram", "minimal-assistant"].includes(refs.personaAvatarPack.value) ? refs.personaAvatarPack.value : "realistic"; const avatarPath = buildBuiltInAvatarDescriptor(getBuiltInAvatarConfigFromInputs(), pack); state.profiles = state.profiles.map((item) => item.id === state.activeProfileId ? { ...item, avatar_path: avatarPath, avatar_pack: pack } : item); syncInputsFromProfile(); applyPersonaVisuals(); }
  function requireSingleSelectedBundle() {
    const ids = selectedCollectionIdsFromUi();
    if (ids.length !== 1) throw new Error("Select exactly one bundle for file or website ingestion.");
    return ids[0];
  }
  async function createPersonaCollection() {
    const name = (refs.newCollectionName?.value || "").trim();
    if (!name) throw new Error("Bundle name is required.");
    const response = await fetch("/api/collections", { method: "POST", headers: headers(), body: JSON.stringify({ name, description: `${activeProfile().name || "Persona"} knowledge bundle` }) });
    const data = await readPayload(response);
    if (!response.ok) throw new Error(data.error || "Failed to create bundle.");
    refs.newCollectionName.value = "";
    await loadCollections();
    [...refs.collections.options].forEach((option) => { option.selected = Number(option.value) === Number(data.id); });
    await syncProfileCollections();
    setHelper("Knowledge bundle created and attached to this persona.");
  }
  async function ingestPersonaCollectionFiles() {
    const collectionId = requireSingleSelectedBundle();
    const files = [...(refs.collectionFileInput?.files || [])];
    if (!files.length) throw new Error("Choose one or more files first.");
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    const response = await fetch(`/api/collections/${collectionId}/files`, { method: "POST", headers: headers(false), body: formData });
    const data = await readPayload(response);
    if (!response.ok) throw new Error(data.error || "Failed to index files into this bundle.");
    refs.collectionFileInput.value = "";
    await loadCollections();
    await refreshCollectionBundleSummary();
    setHelper("Files indexed into the selected persona bundle.");
  }
  async function ingestPersonaCollectionWebsite() {
    const collectionId = requireSingleSelectedBundle();
    const url = (refs.collectionUrl?.value || "").trim();
    if (!url) throw new Error("Website URL is required.");
    const response = await fetch(`/api/collections/${collectionId}/websites`, { method: "POST", headers: headers(), body: JSON.stringify({ url }) });
    const data = await readPayload(response);
    if (!response.ok) throw new Error(data.error || "Failed to ingest website into this bundle.");
    refs.collectionUrl.value = "";
    await loadCollections();
    await refreshCollectionBundleSummary();
    setHelper("Website content added to the selected persona bundle.");
  }
  function applyPreset(presetKey) { const preset = state.presets.find((item) => item.key === presetKey); if (!preset) return; refs.personaPreset.value = preset.key; refs.personaName.value = preset.name || refs.personaName.value; refs.personaScenario.value = preset.scenario || refs.personaScenario.value; refs.personaTone.value = preset.tone || refs.personaTone.value; refs.personaAvatarPack.value = preset.avatar_pack || refs.personaAvatarPack.value; refs.personaRole.value = preset.role || refs.personaRole.value; refs.personaStyle.value = preset.style || refs.personaStyle.value; const defaults = builtInAvatarDefaults(refs.personaAvatarPack.value || "realistic"); refs.personaAvatarGender.value = defaults.gender; refs.personaAvatarFace.value = defaults.face; refs.personaAvatarHairStyle.value = defaults.hairStyle; refs.personaAvatarAccessory.value = defaults.accessory; refs.personaAvatarOutfitStyle.value = defaults.outfitStyle; refs.personaAvatarSkinTone.value = defaults.skinTone; refs.personaAvatarHairColor.value = normalizeHex(defaults.hairColor, "#503a33"); refs.personaAvatarEyeColor.value = normalizeHex(defaults.eyeColor, "#7089b3"); refs.personaAvatarOutfitColor.value = normalizeHex(defaults.outfitColor, "#24385f"); if (refs.personaModelSelector) refs.personaModelSelector.value = defaults.model || defaultSelectorForPack(refs.personaAvatarPack.value || "realistic"); if (shouldUseBuiltInAvatar(activeProfile())) useBuiltInAvatar(); renderPresetChips(); renderStarterPrompts(); applyPersonaVisuals(); }
  async function loadConversations() { if (!state.activeProfileId) return; const response = await fetch(`/api/persona/conversations?persona_profile_id=${state.activeProfileId}`, { headers: headers(false) }); const data = await readPayload(response); if (!response.ok) throw new Error(data.error || "Failed to load persona chats."); state.conversations = data; state.activeConversationId = state.conversations.some((item) => item.id === uiState.activeConversationId) ? uiState.activeConversationId : state.conversations[0]?.id || null; renderConversations(); if (state.activeConversationId) await loadConversation(state.activeConversationId); else { state.history = []; renderMessages(); } }
  async function loadConversation(conversationId) { const response = await fetch(`/api/persona/conversations/${conversationId}`, { headers: headers(false) }); const data = await readPayload(response); if (!response.ok) throw new Error(data.error || "Failed to load conversation."); state.activeConversationId = data.id; state.history = data.messages || []; saveUiState(); renderConversations(); renderMessages(); }
  function renderMessages() { refs.chatLog.innerHTML = state.history.length ? "" : `<div class="persona-message assistant"><div class="persona-message-meta"><span>${escapeHtml(activeProfile().name || "Persona")}</span></div><p class="persona-message-copy">Start typing or use voice chat. This persona session is now saved server-side per profile.</p></div>`; state.history.forEach((item) => { const wrapper = document.createElement("article"); wrapper.className = `persona-message ${item.role}`; wrapper.innerHTML = `<div class="persona-message-meta"><span>${item.role === "assistant" ? escapeHtml(activeProfile().name || "Persona") : "You"}</span>${item.role === "assistant" ? `<div class="persona-message-actions"><button class="message-action" data-action="speak" type="button">Speak</button><button class="message-action" data-action="remember" type="button">Remember</button><button class="message-action" data-action="star" type="button">${item.starred ? "Unstar" : "Star"}</button></div>` : ""}</div><p class="persona-message-copy">${escapeHtml(item.content)}</p>${item.role === "assistant" ? `<div class="message-feedback-row"><button class="message-action" data-feedback="up" type="button">Up</button><button class="message-action" data-feedback="down" type="button">Down</button><button class="message-action" data-feedback="too-long" type="button">Too Long</button><button class="message-action" data-feedback="wrong-language" type="button">Wrong Language</button><button class="message-action" data-feedback="voice-sounded-wrong" type="button">Voice</button><button class="message-action" data-feedback="broke-character" type="button">Character</button></div>` : ""}`; if (item.role === "assistant") { wrapper.querySelector('[data-action="speak"]').addEventListener("click", () => speakText(item.content).catch((error) => showError(error.message))); wrapper.querySelector('[data-action="remember"]').addEventListener("click", async () => { const response = await fetch(`/api/persona/messages/${item.id}/remember`, { method: "POST", headers: headers(), body: JSON.stringify({ scope: "persona" }) }); const data = await readPayload(response); if (!response.ok) return showError(data.error || "Failed to remember this reply."); setHelper("Saved to persona memory."); }); wrapper.querySelector('[data-action="star"]').addEventListener("click", async () => { const response = await fetch(`/api/persona/messages/${item.id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ starred: !item.starred }) }); const data = await readPayload(response); if (!response.ok) return showError(data.error || "Failed to update message."); state.history = state.history.map((message) => message.id === item.id ? data.message : message); renderMessages(); }); wrapper.querySelectorAll("[data-feedback]").forEach((button) => button.addEventListener("click", async () => { const response = await fetch(`/api/persona/messages/${item.id}/feedback`, { method: "POST", headers: headers(), body: JSON.stringify({ rating: button.dataset.feedback }) }); const data = await readPayload(response); if (!response.ok) return showError(data.error || "Failed to save feedback."); setHelper("Feedback saved."); })); } refs.chatLog.appendChild(wrapper); }); refs.chatLog.scrollTop = refs.chatLog.scrollHeight; }
  function addStreamingAssistantMessage() { const temp = { id: `temp-${Date.now()}`, role: "assistant", content: "", starred: false, sources: [] }; state.history.push(temp); renderMessages(); return temp; }
  function stopRecognition() { if (state.recognition) { try { state.recognition.onend = null; state.recognition.stop(); } catch (_) {} } setListening(false); }
  function beginRecognition(loopMode = false, previewOnly = false) { if (!recognitionApi) return showError("Speech recognition is not available in this browser."); stopRecognition(); state.voiceLoop = loopMode; state.recognition = new recognitionApi(); state.recognition.lang = refs.personaLanguage.value === "auto" ? "en-US" : refs.personaLanguage.value; state.recognition.interimResults = false; state.recognition.onstart = () => { clearError(); setListening(true); setHelper(loopMode ? "Voice chat is active. Listening..." : "Listening..."); }; state.recognition.onresult = async (event) => { const transcript = event.results?.[0]?.[0]?.transcript?.trim(); setListening(false); if (!transcript) return; const shouldPreview = previewOnly || (!loopMode && refs.transcriptPreview.checked); if (shouldPreview) { refs.prompt.value = transcript; if (isCompactViewport()) syncPanel("chat", true); setHelper("Transcript captured. Edit it or send it."); return; } await sendPrompt(transcript, true); if (state.voiceLoop) setTimeout(() => beginRecognition(true), 300); }; state.recognition.onerror = (event) => { if (event.error !== "aborted") showError(`Voice input failed: ${event.error}`); setListening(false); }; state.recognition.onend = () => { setListening(false); if (state.voiceLoop && !state.isSpeaking) setTimeout(() => beginRecognition(true), 300); }; try { state.recognition.start(); } catch (_) { showError("Voice input could not start."); } }
  function stopAllVoice() { state.voiceLoop = false; stopRecognition(); stopSpeech(); refs.micMeter.style.width = "0%"; setHelper("Voice stopped."); }
  async function sendPrompt(prompt, voiceMode = false) { const cleanPrompt = String(prompt || "").trim(); if (!cleanPrompt) return; clearError(); state.pendingSpeechText = ""; state.history.push({ role: "user", content: cleanPrompt }); renderMessages(); refs.prompt.value = ""; setHelper("Thinking..."); if (isCompactViewport()) syncPanel("chat", true); const temp = addStreamingAssistantMessage(); const useWebForPrompt = typeof isWebSearchReady === "function" && typeof shouldPromptUseWeb === "function" ? isWebSearchReady() && (refs.useWeb.checked || shouldPromptUseWeb(cleanPrompt)) : refs.useWeb.checked; const payload = { prompt: cleanPrompt, persona_profile_id: state.activeProfileId, conversation_id: state.activeConversationId, collection_ids: [...refs.collections.selectedOptions].map((option) => Number(option.value)), use_web: useWebForPrompt, deep_web: useWebForPrompt && refs.deepWeb.checked, voice_mode: voiceMode, options: { max_new_tokens: voiceMode ? 96 : Math.min(defaultMaxNewTokens, refs.personaSpeakShorter.checked ? 96 : 220), temperature: voiceMode ? 0.35 : Math.min(defaultTemperature, 0.55), top_p: voiceMode ? 0.85 : Math.min(defaultTopP, 0.9), do_sample: voiceMode ? false : defaultDoSample } };
    try { const response = await fetch("/api/persona/chat/stream", { method: "POST", headers: headers(), body: JSON.stringify(payload) }); if (!response.ok || !response.body) { const data = await readPayload(response); throw new Error(data.error || "Persona stream failed."); } const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const events = buffer.split("\n\n"); buffer = events.pop() || ""; for (const eventBlock of events) { const lines = eventBlock.split("\n"); const eventName = (lines.find((line) => line.startsWith("event:")) || "event: message").slice(6).trim(); const dataLine = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5)).join("\n"); if (!dataLine) continue; const eventData = JSON.parse(dataLine); if (eventName === "meta" && eventData.conversation_id) { state.activeConversationId = eventData.conversation_id; saveUiState(); } else if (eventName === "chunk") { temp.content += eventData.text || ""; renderMessages(); if ((refs.autoSpeak.checked || state.voiceLoop) && (!refs.transcriptPreview.checked || state.voiceLoop || voiceMode)) enqueueSpeechText(eventData.text || "", false); } else if (eventName === "saved") { temp.id = eventData.message_id || temp.id; } else if (eventName === "done") { if ((refs.autoSpeak.checked || state.voiceLoop) && (!refs.transcriptPreview.checked || state.voiceLoop || voiceMode)) enqueueSpeechText("", true); await loadConversations(); setHelper(state.voiceLoop ? "Voice chat is active. Speak when you are ready." : "Speak naturally. The persona will answer in your language and can talk back."); } else if (eventName === "error") { throw new Error(eventData.error || "Persona stream failed."); } } } } catch (error) { showError(error.message || "Persona request failed."); state.history = state.history.filter((item) => item.id !== temp.id); renderMessages(); } }
  function bindCalibrationDrag() { function updateFromPointer(clientX, clientY, resize = false) { const rect = refs.portraitShell.getBoundingClientRect(); const relativeX = ((clientX - rect.left) / rect.width) * 100; const relativeY = ((clientY - rect.top) / rect.height) * 100; if (resize) { const anchorRect = refs.mouthAnchor.getBoundingClientRect(); const dx = Math.abs(clientX - (anchorRect.left + anchorRect.width / 2)); const dy = Math.abs(clientY - (anchorRect.top + anchorRect.height / 2)); refs.personaMouthWidth.value = String(Math.min(140, Math.max(44, Math.round(dx * 2)))); refs.personaMouthHeight.value = String(Math.min(76, Math.max(16, Math.round(dy * 1.3)))); } else { refs.personaMouthX.value = String(Math.min(82, Math.max(18, Math.round(relativeX)))); refs.personaMouthY.value = String(Math.round(mouthYRange.min + mouthYRange.max - Math.min(92, Math.max(18, relativeY)))); } applyPersonaVisuals(); } const onPointerMove = (event) => { if (!state.dragMode) return; updateFromPointer(event.clientX, event.clientY, state.dragMode === "resize"); }; const onPointerUp = () => { state.dragMode = null; window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerUp); }; refs.mouthAnchor.addEventListener("pointerdown", (event) => { if (!state.isCalibrating) return; event.preventDefault(); state.dragMode = event.target.classList.contains("avatar-mouth-handle") ? "resize" : "move"; window.addEventListener("pointermove", onPointerMove); window.addEventListener("pointerup", onPointerUp); }); refs.portraitShell.addEventListener("pointerdown", (event) => { if (!state.isCalibrating || event.target.closest("#avatar-mouth-anchor")) return; event.preventDefault(); state.dragMode = "move"; updateFromPointer(event.clientX, event.clientY, false); window.addEventListener("pointermove", onPointerMove); window.addEventListener("pointerup", onPointerUp); }); }
  function bindEvents() { refs.panelButtons.forEach((button) => button.addEventListener("click", () => syncPanel(button.dataset.panelTarget, true))); refs.conversationSearch.addEventListener("input", renderConversations); refs.newProfileBtn.addEventListener("click", async () => { const created = await createProfile(defaultProfile()); state.profiles.unshift(created); state.activeProfileId = created.id; state.activeConversationId = null; renderProfiles(); syncInputsFromProfile(); renderMessages(); }); refs.saveProfileBtn.addEventListener("click", () => saveActiveProfile().catch((error) => showError(error.message))); refs.duplicateProfileBtn.addEventListener("click", () => duplicateActiveProfile().catch((error) => showError(error.message))); refs.exportProfileBtn.addEventListener("click", () => exportActiveProfile().catch((error) => showError(error.message))); refs.importProfileInput.addEventListener("change", () => { const file = refs.importProfileInput.files?.[0]; if (file) importProfile(file).catch((error) => showError(error.message)); }); refs.deleteProfileBtn.addEventListener("click", () => deleteActiveProfile().catch((error) => showError(error.message))); refs.personaAvatarFile.addEventListener("change", () => { const file = refs.personaAvatarFile.files?.[0]; if (file) uploadAvatar(file).catch((error) => showError(error.message)); }); refs.personaUseBuiltInBtn?.addEventListener("click", () => useBuiltInAvatar()); [refs.personaName, refs.personaPreset, refs.personaMotion, refs.personaScenario, refs.personaTone, refs.personaRole, refs.personaStyle, refs.personaLanguage, refs.personaVoice, refs.personaRate, refs.personaPitch, refs.personaAccent, refs.personaAvatarPack, refs.personaModelSelector, refs.personaAvatarGender, refs.personaAvatarFace, refs.personaAvatarHairStyle, refs.personaAvatarAccessory, refs.personaAvatarOutfitStyle, refs.personaAvatarSkinTone, refs.personaAvatarHairColor, refs.personaAvatarEyeColor, refs.personaAvatarOutfitColor, refs.personaZoom, refs.personaMouthX, refs.personaMouthY, refs.personaMouthWidth, refs.personaMouthHeight, refs.autoSpeak, refs.useWeb, refs.deepWeb, refs.personaBilingual, refs.personaSpeakShorter, refs.collections].forEach((element) => { element?.addEventListener("input", applyPersonaVisuals); element?.addEventListener("change", applyPersonaVisuals); }); refs.collections?.addEventListener("change", () => syncProfileCollections()); refs.refreshCollectionsBtn?.addEventListener("click", () => loadCollections().catch((error) => showError(error.message || "Failed to refresh bundles."))); refs.createCollectionBtn?.addEventListener("click", () => createPersonaCollection().catch((error) => showError(error.message))); refs.uploadCollectionFilesBtn?.addEventListener("click", () => ingestPersonaCollectionFiles().catch((error) => showError(error.message))); refs.ingestCollectionUrlBtn?.addEventListener("click", () => ingestPersonaCollectionWebsite().catch((error) => showError(error.message))); refs.personaPreset.addEventListener("change", () => applyPreset(refs.personaPreset.value)); refs.personaModelSelector?.addEventListener("change", () => { const preset = selectorDefaults[refs.personaModelSelector.value] || selectorDefaults["realistic-female"]; refs.personaAvatarGender.value = preset.gender; refs.personaAvatarFace.value = preset.face; refs.personaAvatarHairStyle.value = preset.hairStyle; refs.personaAvatarAccessory.value = preset.accessory; refs.personaAvatarOutfitStyle.value = preset.outfitStyle; refs.personaAvatarSkinTone.value = preset.skinTone; refs.personaAvatarHairColor.value = normalizeHex(preset.hairColor, "#503a33"); refs.personaAvatarEyeColor.value = normalizeHex(preset.eyeColor, "#7089b3"); refs.personaAvatarOutfitColor.value = normalizeHex(preset.outfitColor, "#24385f"); if (refs.personaAvatarPack.value !== "image-fallback") useBuiltInAvatar(); else applyPersonaVisuals(); }); refs.resetBtn.addEventListener("click", () => { syncInputsFromProfile(); applyPersonaVisuals(); }); refs.personaCalibrateBtn.addEventListener("click", () => { state.isCalibrating = !state.isCalibrating; refs.avatar.classList.toggle("calibrating", state.isCalibrating); refs.personaCalibrateBtn.textContent = state.isCalibrating ? "Disable Drag Calibration" : "Enable Drag Calibration"; }); refs.micBtn.addEventListener("click", () => beginRecognition(false)); refs.pushTalkBtn.addEventListener("pointerdown", () => beginRecognition(false, true)); refs.pushTalkBtn.addEventListener("pointerup", stopRecognition); refs.pushTalkBtn.addEventListener("pointerleave", stopRecognition); refs.voiceChatBtn.addEventListener("click", () => { state.voiceLoop = true; beginRecognition(true); }); refs.stopBtn.addEventListener("click", stopAllVoice); refs.testVoiceBtn.addEventListener("click", () => speakText(`Hello, I am ${activeProfile().name}. You can speak with me in multiple languages.`).catch((error) => showError(error.message))); refs.personaAvatarPack.addEventListener("change", () => { if (refs.personaAvatarPack.value === "image-fallback") return applyPersonaVisuals(); const nextDefaults = builtInAvatarDefaults(refs.personaAvatarPack.value || "realistic"); if (refs.personaModelSelector) refs.personaModelSelector.value = nextDefaults.model || defaultSelectorForPack(refs.personaAvatarPack.value || "realistic"); refs.personaAvatarGender.value = nextDefaults.gender; refs.personaAvatarFace.value = nextDefaults.face; refs.personaAvatarHairStyle.value = nextDefaults.hairStyle; refs.personaAvatarAccessory.value = nextDefaults.accessory; refs.personaAvatarOutfitStyle.value = nextDefaults.outfitStyle; refs.personaAvatarSkinTone.value = nextDefaults.skinTone; refs.personaAvatarHairColor.value = normalizeHex(nextDefaults.hairColor, "#503a33"); refs.personaAvatarEyeColor.value = normalizeHex(nextDefaults.eyeColor, "#7089b3"); refs.personaAvatarOutfitColor.value = normalizeHex(nextDefaults.outfitColor, "#24385f"); if (shouldUseBuiltInAvatar(activeProfile())) useBuiltInAvatar(); else applyPersonaVisuals(); }); refs.clearChatBtn.addEventListener("click", () => { state.activeConversationId = null; state.history = []; saveUiState(); renderMessages(); }); refs.form.addEventListener("submit", async (event) => { event.preventDefault(); await sendPrompt(refs.prompt.value, false); }); refs.prompt.addEventListener("keydown", async (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); await sendPrompt(refs.prompt.value, false); } }); window.addEventListener("resize", () => { updateMouthMediaWindow(); resizeModelStage(); }); if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices; bindCalibrationDrag(); }
  async function init() { refs.transcriptPreview.checked = !!uiState.transcriptPreview; await loadPresets(); await loadCollections(); await loadProfiles(); await loadConversations(); loadVoices(); bindEvents(); syncPanel(isCompactViewport() ? "chat" : "setup"); renderMessages(); setHelper("Persona ready."); }
  init().catch((error) => showError(error.message || "Persona failed to initialize."));
})();


























