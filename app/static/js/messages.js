function updateEmptyState() {
  if (!emptyStateEl) return;
  emptyStateEl.classList.toggle("d-none", messagesEl.querySelector(".message-card") !== null);
}

function setConversationActionState() {
  const disabled = !activeConversationId;
  if (retryChatBtn) retryChatBtn.disabled = history.length === 0;
  if (duplicateChatBtn) duplicateChatBtn.disabled = disabled;
  if (branchChatBtn) branchChatBtn.disabled = disabled;
  if (pinChatBtn) {
    pinChatBtn.disabled = disabled;
    const activeButton = convoListEl.querySelector(".conversation-item.active");
    pinChatBtn.textContent = activeButton?.classList.contains("starred") ? "Unstar" : "Star";
  }
  if (renameChatBtn) renameChatBtn.disabled = disabled;
  if (exportChatBtn) exportChatBtn.disabled = disabled;
  if (deleteChatBtn) deleteChatBtn.disabled = disabled;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function autoResizeInput() {
  promptEl.style.height = "auto";
  promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
}

function plainTextFromContent(content = "") {
  return (content || "")
    .replace(/\[\[user_image:[^\]]+\]\]/g, "")
    .replace(/\[\[generated_image:[^\]]+\]\]/g, "")
    .replace(/\[\[edited_image:[^\]]+\]\]/g, "")
    .replace(/\[\[file:[^\]]+\]\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem("ai.favoriteMessages") || "[]");
  } catch (err) {
    return [];
  }
}

function toggleFavoriteMessage(content) {
  const normalized = plainTextFromContent(content);
  const items = getFavorites();
  const existingIndex = items.indexOf(normalized);
  if (existingIndex >= 0) {
    items.splice(existingIndex, 1);
  } else {
    items.unshift(normalized);
  }
  localStorage.setItem("ai.favoriteMessages", JSON.stringify(items.slice(0, 40)));
  showToast(existingIndex >= 0 ? "Removed from saved replies." : "Saved reply.", "success");
}

function exportMessageText(content) {
  const blob = new Blob([plainTextFromContent(content)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "message.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function hideSidebarOnMobile() {
  if (window.innerWidth >= 992 || !chatSidebarEl || !window.bootstrap) return;
  const instance = window.bootstrap.Collapse.getOrCreateInstance(chatSidebarEl, { toggle: false });
  instance.hide();
}

function updateVoiceControls() {
  micBtn.classList.toggle("active-voice", recognitionMode === "mic");
  voiceChatBtn.classList.toggle("active-voice", voiceChatActive);
  voiceStopBtn.classList.toggle("d-none", !(recognitionMode || voiceChatActive || isSpeaking));
}

let speechPrimed = false;

function primeSpeechSynthesis() {
  if (!speechSupported) return;
  try {
    window.speechSynthesis.resume();
  } catch (err) {
    return;
  }
  if (speechPrimed) return;
  speechPrimed = true;
  try {
    const primer = new SpeechSynthesisUtterance(" ");
    primer.volume = 0;
    primer.rate = 1;
    primer.pitch = 1;
    window.speechSynthesis.speak(primer);
    window.setTimeout(() => {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        // ignore primer cancellation issues
      }
    }, 20);
  } catch (err) {
    // ignore primer errors and fall back to normal playback attempts
  }
}

function stopSpeaking() {
  if (!speechSupported) return;
  window.speechSynthesis.cancel();
  isSpeaking = false;
  updateVoiceControls();
}

function containsUrduText(text) {
  return /[\u0600-\u06FF]/.test(text || "");
}

function refreshAvailableVoices() {
  if (!speechSupported) return [];
  try {
    availableVoices = window.speechSynthesis.getVoices() || [];
  } catch (err) {
    availableVoices = [];
  }
  return availableVoices;
}

function resolveSpeechVoice(text) {
  refreshAvailableVoices();
  const wantsUrdu = containsUrduText(text) || (settings.voiceLanguage || "").toLowerCase().startsWith("ur");
  const preferredLangPrefix = wantsUrdu ? "ur" : (settings.voiceLanguage || "en-US").split("-")[0].toLowerCase();
  const namedVoice = availableVoices.find((voice) => voice.name === settings.voiceName);

  if (namedVoice && namedVoice.lang && namedVoice.lang.toLowerCase().startsWith(preferredLangPrefix)) {
    return namedVoice;
  }

  const languageVoice = availableVoices.find(
    (voice) => (voice.lang || "").toLowerCase().startsWith(preferredLangPrefix)
  );
  if (languageVoice) {
    return languageVoice;
  }

  return namedVoice || null;
}

function buildSpeechAttempts(cleaned) {
  const wantsUrdu = containsUrduText(cleaned);
  const attempts = [];
  const selectedVoice = resolveSpeechVoice(cleaned);

  if (selectedVoice) {
    attempts.push({
      voice: selectedVoice,
      lang: selectedVoice.lang || settings.voiceLanguage || (wantsUrdu ? "ur-PK" : "en-US"),
    });
  }

  attempts.push({
    voice: null,
    lang: wantsUrdu ? "ur-PK" : (settings.voiceLanguage || "en-US"),
  });

  if (!wantsUrdu) {
    attempts.push({ voice: null, lang: "en-US" });
  }

  return attempts.filter((attempt, index, arr) => {
    const key = `${attempt.voice?.name || "default"}|${attempt.lang}`;
    return arr.findIndex((item) => `${item.voice?.name || "default"}|${item.lang}` === key) === index;
  });
}

function playSpeechAttempt(cleaned, attempt, { onSuccess, onFailure }) {
  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.rate = settings.voiceRate;
  utterance.pitch = settings.voicePitch;
  utterance.lang = attempt.lang;
  if (attempt.voice) utterance.voice = attempt.voice;
  utterance.onend = onSuccess;
  utterance.onerror = onFailure;
  window.speechSynthesis.speak(utterance);
}

function speakText(text, { onEnd } = {}) {
  const cleaned = plainTextFromContent(text);
  if (!speechSupported || !cleaned) {
    if (!speechSupported) {
      showToast("Speech synthesis is not available in this browser.", "error");
    }
    if (onEnd) onEnd();
    return;
  }

  primeSpeechSynthesis();
  stopSpeaking();
  try {
    window.speechSynthesis.resume();
  } catch (err) {
    // continue even if resume is not supported
  }
  isSpeaking = true;
  updateVoiceControls();
  const attempts = buildSpeechAttempts(cleaned);
  let attemptIndex = 0;

  const finish = () => {
    isSpeaking = false;
    updateVoiceControls();
    if (onEnd) onEnd();
  };

  const runAttempt = () => {
    const attempt = attempts[attemptIndex];
    if (!attempt) {
      finish();
      if (containsUrduText(cleaned)) {
        showToast("Speech playback failed. Your browser or Windows install likely does not have a working Urdu TTS voice.", "error");
      } else {
        showToast("Speech playback failed in this browser.", "error");
      }
      return;
    }
    try {
      playSpeechAttempt(cleaned, attempt, {
        onSuccess: finish,
        onFailure: () => {
          attemptIndex += 1;
          try {
            window.speechSynthesis.cancel();
          } catch (err) {
            // ignore cancel issues between attempts
          }
          window.setTimeout(runAttempt, 50);
        },
      });
    } catch (err) {
      attemptIndex += 1;
      window.setTimeout(runAttempt, 50);
    }
  };

  runAttempt();
}

function stopRecognition() {
  if (recognition) {
    recognition.onend = null;
    recognition.stop();
  }
  recognition = null;
  recognitionMode = null;
  pendingVoiceSubmit = false;
  updateVoiceControls();
}

function startRecognition(mode) {
  if (!recognitionSupported) return;
  stopSpeaking();
  if (recognition) stopRecognition();

  recognition = new SpeechRecognitionCtor();
  recognition.lang = settings.voiceLanguage || "en-US";
  recognition.interimResults = mode === "mic";
  recognition.continuous = false;
  recognitionMode = mode;
  pendingVoiceSubmit = false;
  updateVoiceControls();

  recognition.onresult = async (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      transcript += event.results[i][0].transcript;
    }
    transcript = transcript.trim();
    if (!transcript) return;

    promptEl.value = transcript;
    autoResizeInput();

    if (settings.transcriptPreview && mode !== "voice-chat") {
      pendingVoiceSubmit = false;
      return;
    }

    const finalResult = event.results[event.results.length - 1];
    if (!finalResult.isFinal && mode === "mic") return;
    if (pendingVoiceSubmit) return;
    pendingVoiceSubmit = true;

    if (mode === "voice-chat") {
      chatModeEl.value = "chat";
      chatModeEl.dispatchEvent(new Event("change"));
    }
    stopRecognition();
    await submitCurrentModePrompt(transcript);
  };

  recognition.onend = () => {
    const shouldRestart = voiceChatActive && !isSpeaking && !pendingVoiceSubmit;
    recognition = null;
    recognitionMode = null;
    updateVoiceControls();
    if (shouldRestart) startRecognition("voice-chat");
  };

  recognition.onerror = () => {
    recognition = null;
    recognitionMode = null;
    updateVoiceControls();
  };

  recognition.start();
}

function extractImageToken(content, tokenName) {
  const re = new RegExp(`\\[\\[${tokenName}:([^\\]]+)\\]\\]`);
  const match = (content || "").match(re);
  return match ? match[1] : null;
}

function resolveAssetUrl(value) {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
}

function appendFormattedText(contentEl, text) {
  const parts = (text || "").split(/```/);
  parts.forEach((part, index) => {
    if (!part) return;
    if (index % 2 === 1) {
      const lines = part.replace(/^\n+/, "").split("\n");
      const maybeLang = lines[0] && !lines[0].includes(" ") ? lines[0] : "";
      const code = maybeLang ? lines.slice(1).join("\n") : lines.join("\n");
      const pre = document.createElement("pre");
      pre.className = "code-block";
      const codeEl = document.createElement("code");
      codeEl.textContent = code;
      pre.appendChild(codeEl);
      contentEl.appendChild(pre);
    } else {
      const block = document.createElement("div");
      block.className = "message-text";
      block.textContent = part;
      contentEl.appendChild(block);
    }
  });
}

function renderContent(contentEl, content = "") {
  contentEl.innerHTML = "";
  const userImageUrl = extractImageToken(content, "user_image");
  const generatedImageUrl = extractImageToken(content, "generated_image");
  const editedImageUrl = extractImageToken(content, "edited_image");
  const fileMatch = (content || "").match(/\[\[file:([^\]|]+)\|([^\]]+)\]\]/);
  const fileUrl = fileMatch ? fileMatch[1] : null;
  const fileName = fileMatch ? fileMatch[2] : null;
  const textOnly = (content || "")
    .replace(/\[\[user_image:[^\]]+\]\]/g, "")
    .replace(/\[\[generated_image:[^\]]+\]\]/g, "")
    .replace(/\[\[edited_image:[^\]]+\]\]/g, "")
    .replace(/\[\[file:[^\]]+\]\]/g, "")
    .trim();

  const imageUrl = editedImageUrl || generatedImageUrl || userImageUrl;
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = resolveAssetUrl(imageUrl);
    img.alt = (generatedImageUrl || editedImageUrl) ? "Generated image" : "Uploaded image";
    img.className = "generated-image";
    contentEl.appendChild(img);

    if (generatedImageUrl || editedImageUrl) {
      const link = document.createElement("a");
      link.href = resolveAssetUrl(imageUrl);
      link.download = resolveAssetUrl(imageUrl).split("/").pop() || "generated-image.png";
      link.className = "btn btn-sm btn-outline-light mt-2";
      link.textContent = "Download";
      contentEl.appendChild(document.createElement("br"));
      contentEl.appendChild(link);
    }
  }

  if (textOnly) {
    if (imageUrl) contentEl.appendChild(document.createElement("br"));
    appendFormattedText(contentEl, textOnly);
  }

  if (fileUrl) {
    if (imageUrl || textOnly) contentEl.appendChild(document.createElement("br"));
    const fileLink = document.createElement("a");
    fileLink.href = fileUrl;
    fileLink.download = fileName || "file";
    fileLink.className = "btn btn-sm btn-outline-info mt-2";
    fileLink.textContent = `Download ${fileName || "file"}`;
    contentEl.appendChild(fileLink);
  }
}

function setMessageSources(messageNode, sources = []) {
  const sourcesEl = messageNode.querySelector(".sources");
  if (!sourcesEl) return;
  sourcesEl.innerHTML = "";

  if (!sources.length) {
    sourcesEl.classList.add("d-none");
    return;
  }

  sources.forEach((source) => {
    const link = document.createElement("a");
    link.className = "source-card";
    link.href = source.url || "#";
    link.target = "_blank";
    link.rel = "noreferrer noopener";

    const title = document.createElement("span");
    title.className = "source-title";
    title.textContent = source.title || source.url || "Source";

    const snippet = document.createElement("span");
    snippet.className = "source-snippet";
    snippet.textContent = source.snippet || "";

    const url = document.createElement("span");
    url.className = "source-url";
    url.textContent = source.url || "";

    link.appendChild(title);
    if (snippet.textContent) link.appendChild(snippet);
    if (url.textContent) link.appendChild(url);
    sourcesEl.appendChild(link);
  });

  sourcesEl.classList.remove("d-none");
}

function createMessageNode(role, content = "", sources = []) {
  emptyStateEl?.classList.add("d-none");
  const node = template.content.cloneNode(true);
  const card = node.querySelector(".message-card");
  card.classList.add(role);
  node.querySelector(".role").textContent = role;
  const actionsEl = node.querySelector(".message-actions");
  const contentEl = node.querySelector(".content");
  renderContent(contentEl, content);

  if (role === "user") {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-sm btn-outline-light";
    editBtn.textContent = "Edit";
    editBtn.onclick = () => {
      promptEl.value = plainTextFromContent(content);
      promptEl.focus();
      autoResizeInput();
    };
    actionsEl.appendChild(editBtn);
  }

  if (role === "assistant") {
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn-sm btn-outline-light copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(plainTextFromContent(content));
      showToast("Copied reply.", "success");
    };
    actionsEl.appendChild(copyBtn);

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "btn btn-sm btn-outline-light feedback-btn";
    upBtn.textContent = "Up";
    upBtn.onclick = () => sendMessageFeedback("up", content);
    actionsEl.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "btn btn-sm btn-outline-light feedback-btn";
    downBtn.textContent = "Down";
    downBtn.onclick = () => sendMessageFeedback("down", content);
    actionsEl.appendChild(downBtn);

    const dropdown = document.createElement("div");
    dropdown.className = "dropdown";
    dropdown.innerHTML = `
      <button class="btn btn-sm btn-outline-light dropdown-toggle message-menu-btn" type="button" data-bs-toggle="dropdown" aria-expanded="false">...</button>
      <div class="dropdown-menu dropdown-menu-dark dropdown-menu-end shadow-lg">
        <button class="dropdown-item action-save" type="button">Save</button>
        <button class="dropdown-item action-export" type="button">Export</button>
        <button class="dropdown-item action-speak" type="button">Speak</button>
        <button class="dropdown-item action-remember" type="button">Remember this</button>
        <button class="dropdown-item action-shorter" type="button">Regenerate shorter</button>
        <button class="dropdown-item action-detailed" type="button">Regenerate detailed</button>
        <button class="dropdown-item action-wrong" type="button">Wrong answer</button>
      </div>
    `;
    actionsEl.appendChild(dropdown);
  }

  messagesEl.appendChild(node);
  const messageNode = messagesEl.lastElementChild;
  bindAssistantMessageActions(messageNode, content);
  setMessageSources(messageNode, sources);
  scrollToBottom();
  updateEmptyState();
  return messageNode;
}

function setMessageContent(messageNode, content) {
  const contentEl = messageNode.querySelector(".content");
  renderContent(contentEl, content);
  bindAssistantMessageActions(messageNode, content);
  scrollToBottom();
}

function bindAssistantMessageActions(messageNode, content) {
  const copyBtn = messageNode.querySelector(".copy-btn");
  if (copyBtn) {
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(plainTextFromContent(content));
      showToast("Copied reply.", "success");
    };
  }
  const saveBtn = messageNode.querySelector(".action-save");
  if (saveBtn) saveBtn.onclick = () => toggleFavoriteMessage(content);
  const exportBtn = messageNode.querySelector(".action-export");
  if (exportBtn) exportBtn.onclick = () => exportMessageText(content);
  const speakBtn = messageNode.querySelector(".action-speak");
  if (speakBtn) speakBtn.onclick = () => speakText(content);
  const rememberBtn = messageNode.querySelector(".action-remember");
  if (rememberBtn) rememberBtn.onclick = () => rememberMessage(content);
  const shorterBtn = messageNode.querySelector(".action-shorter");
  if (shorterBtn) shorterBtn.onclick = () => requestRewrite(content, "shorter");
  const detailedBtn = messageNode.querySelector(".action-detailed");
  if (detailedBtn) detailedBtn.onclick = () => requestRewrite(content, "detailed");
  const wrongBtn = messageNode.querySelector(".action-wrong");
  if (wrongBtn) wrongBtn.onclick = () => sendMessageFeedback("wrong", content);
}

async function sendMessageFeedback(rating, content) {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      rating,
      note: plainTextFromContent(content).slice(0, 4000),
      conversation_id: activeConversationId,
    }),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Failed to save feedback.", "error");
    return;
  }
  showToast("Feedback saved.", "success");
}

async function rememberMessage(content) {
  const scope = window.prompt("Save memory scope: profile, project, or conversation", "project");
  if (!scope) return;
  const title = window.prompt("Memory title", "Saved preference");
  const res = await fetch("/api/memory", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      scope,
      title: title || "Memory",
      content: plainTextFromContent(content),
      conversation_id: activeConversationId,
    }),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Failed to save memory.", "error");
    return;
  }
  showToast("Memory saved.", "success");
  if (typeof loadMemoryItems === "function") {
    await loadMemoryItems();
  }
}

function requestRewrite(content, mode) {
  promptEl.value = mode === "shorter"
    ? `Make this answer shorter and more direct:\n\n${plainTextFromContent(content)}`
    : `Expand this answer with more detail and examples:\n\n${plainTextFromContent(content)}`;
  promptEl.focus();
  autoResizeInput();
  sendMessageFeedback(mode, content).catch(() => {});
}

function addTypingIndicator() {
  const message = createMessageNode("assistant", "");
  const contentEl = message.querySelector(".content");
  contentEl.innerHTML = `<span class="typing"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span><span class="thinking-label">Thinking...</span></span>`;
  return message;
}

function clearMessages() {
  messagesEl.innerHTML = "";
  updateEmptyState();
}

function truncate(text, length = 72) {
  if (!text) return "";
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

