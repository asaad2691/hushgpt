function updateModeUI() {
  const mode = chatModeEl.value;
  const imageInputMode = mode === "analyze" || mode === "edit";
  const fileAnalyzeMode = mode === "file-analyze";
  const fileParseMode = mode === "file-parse";
  const fileCompareMode = mode === "file-compare";
  const fileConvertMode = mode === "file-convert";
  const fileGenerateMode = mode === "file-generate";
  const fileInputMode = fileAnalyzeMode || fileParseMode || fileConvertMode || fileCompareMode;

  imageReaderFile.classList.toggle("d-none", !imageInputMode);
  fileInput.classList.toggle("d-none", !fileInputMode);
  fileInputSecondary.classList.toggle("d-none", !fileCompareMode);
  parserSelectEl.classList.toggle("d-none", !fileParseMode);
  fileFormatEl.classList.toggle("d-none", !(fileGenerateMode || fileConvertMode));

  promptEl.placeholder = mode === "analyze"
    ? "Ask about the uploaded image..."
    : mode === "edit"
      ? "Describe the edit for this image..."
      : mode === "generate"
        ? "Describe image to generate..."
        : mode === "file-analyze"
          ? "Ask what to analyze in the uploaded file..."
          : mode === "file-parse"
            ? "Optional instruction for the selected parser..."
          : mode === "file-compare"
            ? "Describe what to compare across both files..."
            : mode === "file-generate"
              ? "Describe the file you want to generate..."
              : mode === "file-convert"
                ? "Optional note for conversion..."
                : "Message HushGPT...";
  updateToolContext();
  renderAttachmentTray();
}

function bindPromptBehaviors() {
  promptEl.addEventListener("input", () => {
    autoResizeInput();
    updateSlashHint();
  });
  autoResizeInput();
  updateSlashHint();

  promptEl.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    if (!settings.sendOnEnter || event.shiftKey) return;
    event.preventDefault();
    await submitCurrentModePrompt();
  });

  document.querySelectorAll(".emoji-item").forEach((item) => {
    item.addEventListener("click", () => {
      promptEl.value += item.textContent;
      promptEl.focus();
      autoResizeInput();
    });
  });

  document.querySelectorAll("[data-quick-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      promptEl.value = button.dataset.quickPrompt || "";
      promptEl.focus();
      autoResizeInput();
    });
  });
}

function bindComposerInputs() {
  chatModeEl.addEventListener("change", updateModeUI);
  [imageReaderFile, fileInput, fileInputSecondary].forEach((input) => {
    input?.addEventListener("change", renderAttachmentTray);
  });

  if (emojiBtn) {
    emojiBtn.addEventListener("click", () => {
      emojiStrip.classList.toggle("d-none");
    });
  }

  if (dropZoneEl) {
    ["dragenter", "dragover"].forEach((name) => {
      dropZoneEl.addEventListener(name, (event) => {
        event.preventDefault();
        dropZoneEl.classList.add("drop-zone-active");
      });
    });
    ["dragleave", "drop"].forEach((name) => {
      dropZoneEl.addEventListener(name, (event) => {
        event.preventDefault();
        dropZoneEl.classList.remove("drop-zone-active");
      });
    });
    dropZoneEl.addEventListener("drop", (event) => {
      const files = [...(event.dataTransfer?.files || [])];
      if (!files.length) return;
      const picked = files[0];
      if (picked.type.startsWith("image/")) {
        const transfer = new DataTransfer();
        transfer.items.add(picked);
        imageReaderFile.files = transfer.files;
      } else {
        const transfer = new DataTransfer();
        transfer.items.add(picked);
        fileInput.files = transfer.files;
      }
      renderAttachmentTray();
      updateModeUI();
    });
  }

  document.addEventListener("dragenter", (event) => {
    if (!dropZoneEl || !event.dataTransfer?.types?.includes("Files")) return;
    dropZoneEl.classList.remove("d-none");
  });
  document.addEventListener("dragleave", (event) => {
    if (!dropZoneEl || event.relatedTarget) return;
    dropZoneEl.classList.add("d-none");
  });
  document.addEventListener("drop", () => {
    if (dropZoneEl) dropZoneEl.classList.add("d-none");
  });
}

function bindPrimaryActions() {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitCurrentModePrompt();
  });

  newChatBtn.addEventListener("click", () => {
    activeConversationId = null;
    history = [];
    clearMessages();
    setConversationActionState();
    hideSidebarOnMobile();
  });

  if (renameChatBtn) renameChatBtn.addEventListener("click", renameConversation);
  if (retryChatBtn) {
    retryChatBtn.addEventListener("click", async () => {
      const lastUserMessage = [...history].reverse().find((item) => item.role === "user");
      if (!lastUserMessage) return;
      await streamChat(lastUserMessage.content);
    });
  }
  if (duplicateChatBtn) duplicateChatBtn.addEventListener("click", duplicateConversation);
  if (branchChatBtn) branchChatBtn.addEventListener("click", branchConversation);
  if (pinChatBtn) {
    pinChatBtn.addEventListener("click", () => {
      if (!activeConversationId) return;
      toggleStarredConversation(activeConversationId);
      loadConversations().catch(() => {});
    });
  }
  if (exportChatBtn) exportChatBtn.addEventListener("click", exportConversation);
  if (deleteChatBtn) deleteChatBtn.addEventListener("click", deleteConversation);
  if (refreshStatusBtn) refreshStatusBtn.addEventListener("click", () => loadSystemStatus().catch(() => {}));

  if (conversationSearchEl) {
    conversationSearchEl.addEventListener("input", () => {
      loadConversations().catch((err) => {
        showToast(`Failed to search conversations: ${err}`, "error");
      });
    });
  }
}

function bindVoiceActions() {
  micBtn.addEventListener("click", () => {
    if (!recognitionSupported) return;
    if (recognitionMode === "mic") {
      stopRecognition();
      return;
    }
    voiceChatActive = false;
    startRecognition("mic");
  });

  voiceChatBtn.addEventListener("click", () => {
    if (!recognitionSupported || !speechSupported) return;
    primeSpeechSynthesis();
    if (voiceChatActive) {
      voiceChatActive = false;
      stopRecognition();
      stopSpeaking();
      updateVoiceControls();
      return;
    }
    voiceChatActive = true;
    chatModeEl.value = "chat";
    updateModeUI();
    startRecognition("voice-chat");
    updateVoiceControls();
  });

  voiceStopBtn.addEventListener("click", () => {
    voiceChatActive = false;
    stopRecognition();
    stopSpeaking();
    updateVoiceControls();
  });
}

function bindSettings() {
  if (loginBtn) loginBtn.addEventListener("click", () => loginUser().catch((err) => showToast(`Login failed: ${err.message}`, "error")));
  if (registerBtn) registerBtn.addEventListener("click", () => registerUser().catch((err) => showToast(`Registration failed: ${err.message}`, "error")));
  if (logoutBtn) logoutBtn.addEventListener("click", () => logoutUser().catch(() => {}));

  voiceSelectEl.addEventListener("change", () => {
    settings.voiceName = voiceSelectEl.value;
    saveSettings();
  });
  providerSelectEl.addEventListener("change", () => {
    settings.providerOverride = providerSelectEl.value;
    populateModelOptions();
    saveSettings();
  });
  modelSelectEl.addEventListener("change", () => {
    settings.modelOverride = modelSelectEl.value;
    modelName.textContent = settings.modelOverride;
    if (heroModelName) heroModelName.textContent = settings.modelOverride;
    saveSettings();
  });
  voiceLanguageSelectEl.addEventListener("change", () => {
    settings.voiceLanguage = voiceLanguageSelectEl.value;
    const selectedVoice = availableVoices.find((voice) => voice.name === settings.voiceName);
    const langPrefix = (settings.voiceLanguage || "").split("-")[0].toLowerCase();
    if (selectedVoice && !(selectedVoice.lang || "").toLowerCase().startsWith(langPrefix)) {
      settings.voiceName = "";
      if (voiceSelectEl) voiceSelectEl.value = "";
    }
    saveSettings();
  });
  voiceRateEl.addEventListener("input", () => {
    settings.voiceRate = Number(voiceRateEl.value);
    saveSettings();
  });
  voicePitchEl.addEventListener("input", () => {
    settings.voicePitch = Number(voicePitchEl.value);
    saveSettings();
  });
  autoSpeakToggleEl.addEventListener("change", () => {
    settings.autoSpeak = autoSpeakToggleEl.checked;
    saveSettings();
  });
  transcriptPreviewToggleEl.addEventListener("change", () => {
    settings.transcriptPreview = transcriptPreviewToggleEl.checked;
    saveSettings();
  });
  responsePresetEl.addEventListener("change", () => {
    settings.responsePreset = responsePresetEl.value;
    saveSettings();
    applySettingsToUI();
  });
  useWebToggleEl.addEventListener("change", () => {
    settings.useWeb = useWebToggleEl.checked;
    saveSettings();
  });
  deepWebToggleEl.addEventListener("change", () => {
    settings.deepWeb = deepWebToggleEl.checked;
    saveSettings();
  });
  backgroundJobsToggleEl.addEventListener("change", () => {
    settings.backgroundJobs = backgroundJobsToggleEl.checked;
    saveSettings();
  });
  conciseToggleEl.addEventListener("change", () => {
    settings.concise = conciseToggleEl.checked;
    saveSettings();
  });
  maxTokensInputEl.addEventListener("change", () => {
    settings.maxNewTokens = Math.max(32, Math.min(4096, Number(maxTokensInputEl.value || defaultMaxNewTokens)));
    maxTokensInputEl.value = String(settings.maxNewTokens);
    saveSettings();
  });
  temperatureRangeEl.addEventListener("input", () => {
    settings.temperature = Number(temperatureRangeEl.value);
    temperatureValueEl.textContent = settings.temperature.toFixed(2);
    saveSettings();
  });
  topPRangeEl.addEventListener("input", () => {
    settings.topP = Number(topPRangeEl.value);
    topPValueEl.textContent = settings.topP.toFixed(2);
    saveSettings();
  });
  samplingToggleEl.addEventListener("change", () => {
    settings.doSample = samplingToggleEl.checked;
    saveSettings();
  });
  [sendOnEnterToggleEl, sendOnEnterToggleModalEl].forEach((toggle) => {
    toggle?.addEventListener("change", () => {
      settings.sendOnEnter = toggle.checked;
      if (sendOnEnterToggleEl) sendOnEnterToggleEl.checked = settings.sendOnEnter;
      if (sendOnEnterToggleModalEl) sendOnEnterToggleModalEl.checked = settings.sendOnEnter;
      saveSettings();
    });
  });
  memoryScopeFilterEl?.addEventListener("change", () => loadMemoryItems().catch(() => {}));
}

function initAdvancedPanels() {
  renderPromptTemplates();
  loadJobsDrawer().catch(() => {});
  startJobsPolling();
  loadMemoryItems().catch(() => {});
  loadCollections().catch(() => {});
  bindCollectionsAndSearch();
  maybeShowOnboarding();
}

setConversationActionState();
updateAuthUI();
bindPromptBehaviors();
bindComposerInputs();
bindPrimaryActions();
bindVoiceActions();
bindSettings();
initVoiceHotkeys();
updateModeUI();
loadConversations().catch((err) => {
  showToast(`Failed to load conversations: ${err}`, "error");
});
loadModelCatalog().catch(() => {});
loadSystemStatus().catch(() => {});
initAdvancedPanels();
