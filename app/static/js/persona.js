(function () {
  const body = document.body;
  const apiKey = body.dataset.apiKey || "";
  const defaultMaxNewTokens = Number(body.dataset.defaultMaxNewTokens || 220);
  const defaultTemperature = Number(body.dataset.defaultTemperature || 0.7);
  const defaultTopP = Number(body.dataset.defaultTopP || 0.9);
  const defaultDoSample = String(body.dataset.defaultDoSample || "true") === "true";
  const storageKey = "hushgpt-persona-state";
  const clientStorageKey = "hushgpt-client-id";
  const recognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mouthYRange = { min: 18, max: 92 };

  const refs = {
    avatar: document.getElementById("persona-avatar"),
    portraitShell: document.getElementById("persona-portrait-shell"),
    portrait: document.getElementById("persona-portrait"),
    portraitVideo: document.getElementById("persona-portrait-video"),
    mouthAnchor: document.getElementById("avatar-mouth-anchor"),
    mouth: document.getElementById("avatar-mouth"),
    mouthImage: document.getElementById("avatar-mouth-image"),
    mouthVideo: document.getElementById("avatar-mouth-video"),
    displayName: document.getElementById("persona-display-name"),
    displayRole: document.getElementById("persona-display-role"),
    speakingPill: document.getElementById("persona-speaking-pill"),
    listeningPill: document.getElementById("persona-listening-pill"),
    languagePill: document.getElementById("persona-language-pill"),
    personaName: document.getElementById("persona-name"),
    personaPreset: document.getElementById("persona-preset"),
    personaMotion: document.getElementById("persona-motion"),
    personaRole: document.getElementById("persona-role"),
    personaStyle: document.getElementById("persona-style"),
    personaLanguage: document.getElementById("persona-language"),
    personaVoice: document.getElementById("persona-voice"),
    personaRate: document.getElementById("persona-rate"),
    personaPitch: document.getElementById("persona-pitch"),
    personaAvatarFile: document.getElementById("persona-avatar-file"),
    personaAccent: document.getElementById("persona-accent"),
    personaZoom: document.getElementById("persona-zoom"),
    personaMouthX: document.getElementById("persona-mouth-x"),
    personaMouthY: document.getElementById("persona-mouth-y"),
    personaMouthWidth: document.getElementById("persona-mouth-width"),
    personaMouthHeight: document.getElementById("persona-mouth-height"),
    personaCalibrateBtn: document.getElementById("persona-calibrate-btn"),
    autoSpeak: document.getElementById("auto-speak"),
    useWeb: document.getElementById("use-web"),
    deepWeb: document.getElementById("deep-web"),
    micBtn: document.getElementById("persona-mic-btn"),
    voiceChatBtn: document.getElementById("persona-voice-chat-btn"),
    stopBtn: document.getElementById("persona-stop-btn"),
    testVoiceBtn: document.getElementById("persona-test-voice-btn"),
    clearChatBtn: document.getElementById("clear-persona-chat-btn"),
    resetBtn: document.getElementById("reset-persona-btn"),
    form: document.getElementById("persona-form"),
    prompt: document.getElementById("persona-prompt"),
    chatLog: document.getElementById("persona-chat-log"),
    helper: document.getElementById("persona-helper"),
    error: document.getElementById("persona-error"),
    panelButtons: Array.from(document.querySelectorAll(".panel-switcher-btn")),
    panelSections: Array.from(document.querySelectorAll(".workbench-panel")),
  };

  const presetMap = {
    companion: {
      role: "A multilingual AI companion for natural chat and voice conversation.",
      style: "Warm, clear, emotionally steady, and naturally conversational.",
      name: "Nova",
    },
    mentor: {
      role: "A thoughtful multilingual mentor who explains clearly and keeps the user focused.",
      style: "Calm, sharp, supportive, and practical.",
      name: "Astra",
    },
    tutor: {
      role: "A multilingual tutor who teaches step by step and checks understanding naturally.",
      style: "Clear, patient, organized, and easy to follow.",
      name: "Rhea",
    },
    interviewer: {
      role: "A professional multilingual interviewer who asks focused questions and responds precisely.",
      style: "Direct, polished, concise, and confident.",
      name: "Kian",
    },
    creative: {
      role: "A multilingual creative partner for brainstorming, writing, and expressive ideas.",
      style: "Imaginative, fluid, upbeat, and visually descriptive.",
      name: "Lyra",
    },
  };

  const state = {
    voices: [],
    recognition: null,
    voiceLoop: false,
    isListening: false,
    isSpeaking: false,
    lipSyncTimer: null,
    isCalibrating: false,
    dragMode: null,
    history: [],
    persona: {
      name: "Nova",
      preset: "companion",
      motion: "float",
      role: presetMap.companion.role,
      style: presetMap.companion.style,
      language: "auto",
      avatarSrc: "/static/img/persona-default.avif",
      avatarMediaType: "image",
      accent: "#7bf2df",
      zoom: 1.06,
      mouthX: 50,
      mouthY: 74,
      mouthWidth: 72,
      mouthHeight: 30,
      voiceName: "",
      rate: 0.95,
      pitch: 1,
      autoSpeak: true,
      useWeb: false,
      deepWeb: false,
    },
  };

  function getClientId() {
    let clientId = localStorage.getItem(clientStorageKey);
    if (!clientId) {
      clientId = `persona-${crypto.randomUUID()}`;
      localStorage.setItem(clientStorageKey, clientId);
    }
    return clientId;
  }

  function showError(message) {
    refs.error.textContent = message;
    refs.error.classList.remove("d-none");
  }

  function clearError() {
    refs.error.textContent = "";
    refs.error.classList.add("d-none");
  }

  function isCompactViewport() {
    return window.innerWidth <= 760;
  }

  function setActivePanel(name, shouldScroll = false) {
    refs.panelButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.panelTarget === name);
    });
    refs.panelSections.forEach((section) => {
      section.classList.toggle("is-active", section.dataset.panelName === name);
    });
    if (shouldScroll && isCompactViewport()) {
      const section = refs.panelSections.find((item) => item.dataset.panelName === name);
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function syncPanelVisibility() {
    const active = refs.panelButtons.find((button) => button.classList.contains("is-active"))?.dataset.panelTarget || "setup";
    setActivePanel(active, false);
  }

  function saveState() {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        history: state.history.slice(-24),
        persona: state.persona,
      }),
    );
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      if (Array.isArray(saved.history)) {
        state.history = saved.history.filter((item) => item && item.role && item.content);
      }
      if (saved.persona && typeof saved.persona === "object") {
        state.persona = { ...state.persona, ...saved.persona };
      }
    } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderMessages() {
    refs.chatLog.innerHTML = "";
    if (!state.history.length) {
      refs.chatLog.innerHTML = `
        <div class="persona-message assistant">
          <div class="persona-message-meta">
            <span>Persona</span>
          </div>
          <p class="persona-message-copy">Start typing or use voice chat. This persona module keeps its own session and does not affect the main workspace.</p>
        </div>
      `;
      return;
    }

    for (const item of state.history) {
      const wrapper = document.createElement("article");
      wrapper.className = `persona-message ${item.role}`;
      wrapper.innerHTML = `
        <div class="persona-message-meta">
          <span>${item.role === "assistant" ? escapeHtml(state.persona.name || "Persona") : "You"}</span>
          ${item.role === "assistant" ? `<div class="persona-message-actions"><button class="message-action" type="button">Speak</button></div>` : ""}
        </div>
        <p class="persona-message-copy">${escapeHtml(item.content)}</p>
      `;
      if (item.role === "assistant") {
        wrapper.querySelector(".message-action").addEventListener("click", () => {
          speakText(item.content).catch((error) => showError(error.message || "Speech playback failed in this browser."));
        });
      }
      refs.chatLog.appendChild(wrapper);
    }
    refs.chatLog.scrollTop = refs.chatLog.scrollHeight;
  }

  function syncInputsFromState() {
    refs.personaName.value = state.persona.name;
    refs.personaPreset.value = state.persona.preset;
    refs.personaMotion.value = state.persona.motion || "float";
    refs.personaRole.value = state.persona.role;
    refs.personaStyle.value = state.persona.style;
    refs.personaLanguage.value = state.persona.language;
    refs.personaAccent.value = state.persona.accent;
    refs.personaZoom.value = String(state.persona.zoom);
    refs.personaMouthX.value = String(state.persona.mouthX);
    refs.personaMouthY.value = String(mouthYRange.min + mouthYRange.max - state.persona.mouthY);
    refs.personaMouthWidth.value = String(state.persona.mouthWidth);
    refs.personaMouthHeight.value = String(state.persona.mouthHeight);
    refs.personaRate.value = String(state.persona.rate);
    refs.personaPitch.value = String(state.persona.pitch);
    refs.autoSpeak.checked = !!state.persona.autoSpeak;
    refs.useWeb.checked = !!state.persona.useWeb;
    refs.deepWeb.checked = !!state.persona.deepWeb;
  }

  function applyPersonaVisuals() {
    refs.displayName.textContent = state.persona.name || "Nova";
    refs.displayRole.textContent = state.persona.role || presetMap.companion.role;
    refs.avatar.classList.remove("motion-float", "motion-cinematic", "motion-hologram", "motion-still");
    refs.avatar.classList.add(`motion-${state.persona.motion || "float"}`);
    refs.avatar.style.setProperty("--persona-accent-color", state.persona.accent);
    refs.avatar.style.setProperty("--portrait-scale", String(state.persona.zoom));
    refs.avatar.style.setProperty("--mouth-x", `${state.persona.mouthX}%`);
    refs.avatar.style.setProperty("--mouth-y", `${state.persona.mouthY}%`);
    refs.avatar.style.setProperty("--mouth-width", `${state.persona.mouthWidth}px`);
    refs.avatar.style.setProperty("--mouth-height", `${state.persona.mouthHeight}px`);
    const avatarSrc = state.persona.avatarSrc || "/static/img/persona-default.avif";
    const useVideo = state.persona.avatarMediaType === "video";
    refs.portrait.classList.toggle("d-none", useVideo);
    refs.portraitVideo.classList.toggle("d-none", !useVideo);
    refs.mouthImage.classList.toggle("d-none", useVideo);
    refs.mouthVideo.classList.toggle("d-none", !useVideo);
    if (useVideo) {
      refs.portraitVideo.src = avatarSrc;
      refs.mouthVideo.src = avatarSrc;
      refs.portraitVideo.play().catch(() => {});
      refs.mouthVideo.play().catch(() => {});
    } else {
      refs.portrait.src = avatarSrc;
      refs.mouthImage.src = avatarSrc;
      refs.portraitVideo.pause();
      refs.mouthVideo.pause();
      refs.portraitVideo.removeAttribute("src");
      refs.mouthVideo.removeAttribute("src");
      refs.portraitVideo.load();
      refs.mouthVideo.load();
    }
    updateMouthMediaWindow();
    const selectedVoice = state.voices.find((voice) => voice.name === state.persona.voiceName);
    refs.languagePill.textContent = state.persona.language === "auto"
      ? (selectedVoice?.lang || "Auto Language")
      : state.persona.language;
  }

  function updatePersonaFromInputs() {
    state.persona.name = refs.personaName.value.trim() || "Nova";
    state.persona.preset = refs.personaPreset.value;
    state.persona.motion = refs.personaMotion.value || "float";
    state.persona.role = refs.personaRole.value.trim() || presetMap.companion.role;
    state.persona.style = refs.personaStyle.value.trim() || presetMap.companion.style;
    state.persona.language = refs.personaLanguage.value;
    state.persona.accent = refs.personaAccent.value;
    state.persona.zoom = Number(refs.personaZoom.value || 1.06);
    state.persona.mouthX = Number(refs.personaMouthX.value || 50);
    state.persona.mouthY = mouthYRange.min + mouthYRange.max - Number(refs.personaMouthY.value || 74);
    state.persona.mouthWidth = Number(refs.personaMouthWidth.value || 72);
    state.persona.mouthHeight = Number(refs.personaMouthHeight.value || 30);
    state.persona.rate = Number(refs.personaRate.value || 0.95);
    state.persona.pitch = Number(refs.personaPitch.value || 1);
    state.persona.autoSpeak = refs.autoSpeak.checked;
    state.persona.useWeb = refs.useWeb.checked;
    state.persona.deepWeb = refs.deepWeb.checked;
    state.persona.voiceName = refs.personaVoice.value || "";
    applyPersonaVisuals();
    saveState();
  }

  function applyPreset(presetName) {
    const preset = presetMap[presetName];
    if (!preset) return;
    state.persona.preset = presetName;
    state.persona.name = preset.name;
    state.persona.role = preset.role;
    state.persona.style = preset.style;
    syncInputsFromState();
    updatePersonaFromInputs();
  }

  function addMessage(role, content) {
    state.history.push({ role, content });
    state.history = state.history.slice(-30);
    saveState();
    renderMessages();
  }

  function detectTextLanguage(text) {
    if (/[\u0600-\u06FF]/.test(text)) return "ur-PK";
    if (/[\u0750-\u077F]/.test(text)) return "ar-SA";
    if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
    if (state.persona.language && state.persona.language !== "auto") return state.persona.language;
    return "en-US";
  }

  function setSpeaking(active) {
    state.isSpeaking = active;
    refs.avatar.classList.toggle("speaking", active);
    refs.speakingPill.textContent = active ? "Speaking" : "Idle";
    refs.speakingPill.classList.toggle("status-pill-muted", !active);
    if (!active) refs.mouth.className = "avatar-mouth mouth-rest";
  }

  function setListening(active) {
    state.isListening = active;
    refs.listeningPill.textContent = active ? "Listening" : "Mic Off";
    refs.listeningPill.classList.toggle("status-pill-muted", !active);
  }

  function loadVoices() {
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    state.voices = voices;
    const current = state.persona.voiceName || "";
    refs.personaVoice.innerHTML = `<option value="">Browser Default</option>`;
    voices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      option.selected = voice.name === current;
      refs.personaVoice.appendChild(option);
    });
  }

  function resolveVoice(text) {
    const desiredLang = detectTextLanguage(text);
    const byName = state.voices.find((voice) => voice.name === state.persona.voiceName);
    if (byName) {
      return byName;
    }
    return (
      state.voices.find((voice) => voice.lang.toLowerCase() === desiredLang.toLowerCase()) ||
      state.voices.find((voice) => voice.lang.toLowerCase().startsWith(desiredLang.toLowerCase().slice(0, 2))) ||
      byName ||
      null
    );
  }

  function stopSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (state.lipSyncTimer) {
      clearInterval(state.lipSyncTimer);
      state.lipSyncTimer = null;
    }
    setSpeaking(false);
  }

  function setCalibration(active) {
    state.isCalibrating = active;
    refs.avatar.classList.toggle("calibrating", active);
    refs.personaCalibrateBtn.textContent = active ? "Disable Drag Calibration" : "Enable Drag Calibration";
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function updateMouthMediaWindow() {
    const shell = refs.portraitShell;
    if (!shell) return;
    const shellWidth = shell.clientWidth || 0;
    const shellHeight = shell.clientHeight || 0;
    if (!shellWidth || !shellHeight) return;

    const mouthWidth = state.persona.mouthWidth;
    const mouthHeight = state.persona.mouthHeight;
    const mouthCenterX = (state.persona.mouthX / 100) * shellWidth;
    const mouthCenterY = (state.persona.mouthY / 100) * shellHeight;
    const left = -(mouthCenterX - mouthWidth / 2);
    const top = -(mouthCenterY - mouthHeight / 2);

    refs.avatar.style.setProperty("--mouth-media-width", `${shellWidth}px`);
    refs.avatar.style.setProperty("--mouth-media-height", `${shellHeight}px`);
    refs.avatar.style.setProperty("--mouth-media-left", `${left}px`);
    refs.avatar.style.setProperty("--mouth-media-top", `${top}px`);
  }

  function syncMouthControlsFromState() {
    refs.personaMouthX.value = String(Math.round(state.persona.mouthX));
    refs.personaMouthY.value = String(Math.round(mouthYRange.min + mouthYRange.max - state.persona.mouthY));
    refs.personaMouthWidth.value = String(Math.round(state.persona.mouthWidth));
    refs.personaMouthHeight.value = String(Math.round(state.persona.mouthHeight));
  }

  function updateFromPointer(clientX, clientY, resize = false) {
    const rect = refs.portraitShell.getBoundingClientRect();
    const relativeX = ((clientX - rect.left) / rect.width) * 100;
    const relativeY = ((clientY - rect.top) / rect.height) * 100;

    if (resize) {
      const anchorRect = refs.mouthAnchor.getBoundingClientRect();
      const dx = Math.abs(clientX - (anchorRect.left + anchorRect.width / 2));
      const dy = Math.abs(clientY - (anchorRect.top + anchorRect.height / 2));
      state.persona.mouthWidth = clamp(Math.round(dx * 2), 44, 140);
      state.persona.mouthHeight = clamp(Math.round(dy * 1.3), 16, 76);
    } else {
      state.persona.mouthX = clamp(Math.round(relativeX), 18, 82);
      state.persona.mouthY = clamp(Math.round(relativeY), 18, 92);
    }

    syncMouthControlsFromState();
    applyPersonaVisuals();
    saveState();
  }

  function bindCalibrationDrag() {
    const onPointerMove = (event) => {
      if (!state.dragMode) return;
      updateFromPointer(event.clientX, event.clientY, state.dragMode === "resize");
    };

    const onPointerUp = () => {
      state.dragMode = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    refs.mouthAnchor.addEventListener("pointerdown", (event) => {
      if (!state.isCalibrating) return;
      event.preventDefault();
      state.dragMode = event.target.classList.contains("avatar-mouth-handle") ? "resize" : "move";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    });

    refs.portraitShell.addEventListener("pointerdown", (event) => {
      if (!state.isCalibrating) return;
      if (event.target.closest("#avatar-mouth-anchor")) return;
      event.preventDefault();
      state.dragMode = "move";
      updateFromPointer(event.clientX, event.clientY, false);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    });
  }

  async function speakText(text) {
    if (!window.speechSynthesis) {
      throw new Error("Speech synthesis is not available in this browser.");
    }

    stopSpeech();
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = resolveVoice(text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice ? voice.lang : detectTextLanguage(text);
      utterance.rate = state.persona.rate;
      utterance.pitch = state.persona.pitch;

      let mouthIndex = 0;
      const mouthFrames = ["mouth-1", "mouth-2", "mouth-3", "mouth-4"];

      utterance.onstart = () => {
        clearError();
        setSpeaking(true);
        state.lipSyncTimer = setInterval(() => {
          mouthIndex = (mouthIndex + 1) % mouthFrames.length;
          refs.mouth.className = `avatar-mouth ${mouthFrames[mouthIndex]}`;
        }, 110);
      };
      utterance.onboundary = () => {
        mouthIndex = (mouthIndex + 1) % mouthFrames.length;
        refs.mouth.className = `avatar-mouth ${mouthFrames[mouthIndex]}`;
      };
      utterance.onend = () => {
        if (state.lipSyncTimer) {
          clearInterval(state.lipSyncTimer);
          state.lipSyncTimer = null;
        }
        setSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        if (state.lipSyncTimer) {
          clearInterval(state.lipSyncTimer);
          state.lipSyncTimer = null;
        }
        setSpeaking(false);
        reject(new Error("Speech playback failed in this browser."));
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch (_) {
        reject(new Error("Speech playback failed in this browser."));
      }
    });
  }

  function buildPayload(prompt, voiceMode = false) {
    return {
      prompt,
      history: state.history.slice(-12),
      persona: {
        name: state.persona.name,
        role: state.persona.role,
        style: state.persona.style,
        language: state.persona.language,
        energy: voiceMode ? "spoken" : "balanced",
      },
      use_web: state.persona.useWeb,
      deep_web: state.persona.deepWeb,
      voice_mode: voiceMode,
      options: {
        max_new_tokens: voiceMode ? 96 : Math.min(defaultMaxNewTokens, 180),
        temperature: voiceMode ? 0.35 : Math.min(defaultTemperature, 0.55),
        top_p: voiceMode ? 0.85 : Math.min(defaultTopP, 0.9),
        do_sample: voiceMode ? false : defaultDoSample,
      },
    };
  }

  function bindAvatarUpload() {
    refs.personaAvatarFile.addEventListener("change", () => {
      const file = refs.personaAvatarFile.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.persona.avatarSrc = String(reader.result || "");
        state.persona.avatarMediaType = file.type.startsWith("video/") ? "video" : "image";
        applyPersonaVisuals();
        saveState();
      };
      reader.readAsDataURL(file);
    });
  }

  function bindResizeSync() {
    window.addEventListener("resize", () => {
      updateMouthMediaWindow();
      syncPanelVisibility();
    });
  }

  async function sendPrompt(prompt, voiceMode = false) {
    const cleanPrompt = String(prompt || "").trim();
    if (!cleanPrompt) return;
    clearError();
    addMessage("user", cleanPrompt);
    refs.helper.textContent = "Thinking...";
    refs.prompt.value = "";
    if (isCompactViewport()) {
      setActivePanel("chat");
    }

    try {
      const response = await fetch("/api/persona/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
          "X-Client-Id": getClientId(),
        },
        body: JSON.stringify(buildPayload(cleanPrompt, voiceMode)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Persona chat failed.");
      }
      addMessage("assistant", data.reply || "");
      refs.helper.textContent = data.used_web
        ? "Reply generated with web-assisted context."
        : "Reply generated locally.";
      if (state.persona.autoSpeak || state.voiceLoop) {
        await speakText(data.reply || "");
      }
    } catch (error) {
      refs.helper.textContent = "Ready.";
      showError(error.message || "Persona request failed.");
      throw error;
    } finally {
      refs.helper.textContent = state.voiceLoop
        ? "Voice chat is active. Speak when you are ready."
        : "Speak naturally. The persona will answer in your language and can talk back.";
    }
  }

  function stopRecognition() {
    if (state.recognition) {
      try {
        state.recognition.onend = null;
        state.recognition.stop();
      } catch (_) {}
    }
    setListening(false);
  }

  function beginRecognition(loopMode = false) {
    if (!recognitionApi) {
      showError("Speech recognition is not available in this browser.");
      return;
    }
    stopRecognition();
    state.voiceLoop = loopMode;
    const recognition = new recognitionApi();
    state.recognition = recognition;
    recognition.lang = state.persona.language === "auto" ? "en-US" : state.persona.language;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      clearError();
      setListening(true);
      refs.helper.textContent = loopMode ? "Voice chat is active. Listening..." : "Listening...";
    };

    recognition.onresult = async (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      setListening(false);
      if (!transcript) return;
      try {
        await sendPrompt(transcript, true);
      } catch (_) {}
      if (state.voiceLoop) {
        setTimeout(() => beginRecognition(true), 250);
      }
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error !== "aborted") {
        showError(`Voice input failed: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setListening(false);
      if (state.voiceLoop && !state.isSpeaking) {
        setTimeout(() => beginRecognition(true), 250);
      }
    };

    try {
      recognition.start();
    } catch (_) {
      showError("Voice input could not start.");
    }
  }

  function stopAllVoice() {
    state.voiceLoop = false;
    stopRecognition();
    stopSpeech();
    refs.helper.textContent = "Voice stopped.";
  }

  function bindEvents() {
    [
      refs.personaName,
      refs.personaRole,
      refs.personaStyle,
      refs.personaMotion,
      refs.personaLanguage,
      refs.personaVoice,
      refs.personaRate,
      refs.personaPitch,
      refs.personaAccent,
      refs.personaZoom,
      refs.personaMouthX,
      refs.personaMouthY,
      refs.personaMouthWidth,
      refs.personaMouthHeight,
      refs.autoSpeak,
      refs.useWeb,
      refs.deepWeb,
    ].forEach((element) => {
      element.addEventListener("input", updatePersonaFromInputs);
      element.addEventListener("change", updatePersonaFromInputs);
    });

    refs.personaPreset.addEventListener("change", () => applyPreset(refs.personaPreset.value));
    refs.personaVoice.addEventListener("change", updatePersonaFromInputs);
    refs.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await sendPrompt(refs.prompt.value, false);
      } catch (_) {}
    });
    refs.prompt.addEventListener("keydown", async (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        try {
          await sendPrompt(refs.prompt.value, false);
        } catch (_) {}
      }
    });
    refs.micBtn.addEventListener("click", () => beginRecognition(false));
    refs.voiceChatBtn.addEventListener("click", () => {
      state.voiceLoop = true;
      if (isCompactViewport()) {
        setActivePanel("voice", true);
      }
      beginRecognition(true);
    });
    refs.stopBtn.addEventListener("click", stopAllVoice);
    refs.personaCalibrateBtn.addEventListener("click", () => {
      setCalibration(!state.isCalibrating);
    });
    refs.testVoiceBtn.addEventListener("click", () => {
      speakText(`Hello, I am ${state.persona.name}. You can speak with me in multiple languages.`)
        .catch((error) => showError(error.message || "Speech playback failed in this browser."));
    });
    refs.clearChatBtn.addEventListener("click", () => {
      state.history = [];
      saveState();
      renderMessages();
    });
    refs.resetBtn.addEventListener("click", () => {
      state.persona = {
        ...state.persona,
        preset: "companion",
        name: "Nova",
        role: presetMap.companion.role,
        style: presetMap.companion.style,
        motion: "float",
        language: "auto",
        avatarSrc: "/static/img/persona-default.avif",
        avatarMediaType: "image",
        accent: "#7bf2df",
        zoom: 1.06,
        mouthX: 50,
        mouthY: 74,
        mouthWidth: 72,
        mouthHeight: 30,
        voiceName: "",
        rate: 0.95,
        pitch: 1,
        autoSpeak: true,
        useWeb: false,
        deepWeb: false,
      };
      syncInputsFromState();
      updatePersonaFromInputs();
    });

    document.querySelectorAll("[data-persona-prompt]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (isCompactViewport()) {
          setActivePanel("chat", true);
        }
        try {
          await sendPrompt(button.dataset.personaPrompt || "", false);
        } catch (_) {}
      });
    });

    refs.prompt.addEventListener("focus", () => {
      if (isCompactViewport()) {
        setActivePanel("chat", false);
      }
    });

    refs.panelButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setActivePanel(button.dataset.panelTarget || "setup", true);
      });
    });

    bindAvatarUpload();
    bindCalibrationDrag();
    bindResizeSync();
  }

  function init() {
    loadState();
    syncInputsFromState();
    applyPersonaVisuals();
    renderMessages();
    loadVoices();
    bindEvents();
    syncPanelVisibility();
    setCalibration(false);
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  init();
})();
