function getStarredConversations() {
  try {
    return JSON.parse(localStorage.getItem("ai.starredConversations") || "[]");
  } catch (err) {
    return [];
  }
}

function toggleStarredConversation(conversationId) {
  const items = getStarredConversations();
  const index = items.indexOf(conversationId);
  if (index >= 0) {
    items.splice(index, 1);
  } else {
    items.unshift(conversationId);
  }
  localStorage.setItem("ai.starredConversations", JSON.stringify(items.slice(0, 80)));
}

function groupConversationLabel(createdAt) {
  const created = new Date(createdAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (created >= today) return "Today";
  if (created >= yesterday) return "Yesterday";
  return "Older";
}

async function loadConversations() {
  const query = (conversationSearchEl.value || "").trim();
  const url = query
    ? `/api/conversations?q=${encodeURIComponent(query)}`
    : "/api/conversations";
  const res = await fetch(url, { headers: headers() });
  const data = await readResponsePayload(res);
  convoListEl.innerHTML = "";
  if (!res.ok) {
    showToast(data.error || "Failed to load conversations.", "error");
    return;
  }
  const starredIds = new Set(getStarredConversations());
  const groups = { Starred: [], Pinned: [], Today: [], Yesterday: [], Older: [] };
  data.forEach((conv) => {
    if (starredIds.has(conv.id)) {
      groups.Starred.push(conv);
    } else if (conv.pinned) {
      groups.Pinned.push(conv);
    } else {
      groups[groupConversationLabel(conv.created_at)].push(conv);
    }
  });

  Object.entries(groups).forEach(([label, rows]) => {
    if (!rows.length) return;
    const heading = document.createElement("div");
    heading.className = "conversation-group-label";
    heading.textContent = label;
    convoListEl.appendChild(heading);

    rows.forEach((conv) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "conversation-item";
      if (conv.id === activeConversationId) button.classList.add("active");
      if (conv.pinned) button.classList.add("pinned");
      if (starredIds.has(conv.id)) button.classList.add("starred");
      button.innerHTML = `
        <span class="conversation-item-title-row">
          <span class="conversation-item-title">${truncate(conv.title || `Conversation ${conv.id}`, 56)}</span>
          <span class="conversation-item-meta">${starredIds.has(conv.id) ? "Starred" : (conv.pinned ? "Pinned" : "")}</span>
        </span>
        <span class="conversation-item-summary">${truncate(conv.summary || "No summary yet.", 82)}</span>
      `;
      button.onclick = () => openConversation(conv.id);
      button.oncontextmenu = (event) => {
        event.preventDefault();
        toggleStarredConversation(conv.id);
        loadConversations().catch(() => {});
      };
      convoListEl.appendChild(button);
    });
  });
  setConversationActionState();
}

async function openConversation(conversationId) {
  const res = await fetch(`/api/conversations/${conversationId}`, { headers: headers() });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Failed to open conversation.", "error");
    return;
  }

  activeConversationId = data.id;
  history = data.messages.map((msg) => ({ role: msg.role, content: msg.content }));

  clearMessages();
  data.messages.forEach((msg) => createMessageNode(msg.role, msg.content));
  setConversationActionState();
  await loadConversations();
  hideSidebarOnMobile();
  if (typeof loadMemoryItems === "function") {
    await loadMemoryItems();
  }
}

async function syncConversationFromServer(conversationId) {
  if (!conversationId) return null;
  const res = await fetch(`/api/conversations/${conversationId}`, { headers: headers() });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    throw new Error(data.error || "Failed to sync conversation.");
  }
  activeConversationId = data.id;
  history = data.messages.map((msg) => ({ role: msg.role, content: msg.content }));
  return data;
}

async function streamChat(prompt) {
  createMessageNode("user", prompt);
  const assistantMessage = addTypingIndicator();
  let assistantText = "";
  let messageSources = [];

  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      prompt,
      conversation_id: activeConversationId,
      history,
      use_web: settings.useWeb,
      deep_web: settings.deepWeb,
      provider_override: settings.providerOverride,
      model_override: settings.modelOverride,
      response_preset: settings.responsePreset,
      options: buildChatOptions(),
    }),
  });

  if (!response.ok) {
    const data = await readResponsePayload(response);
    setMessageContent(assistantMessage, data.error || "Request failed.");
    showToast(data.error || "Request failed.", "error");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n\n")) {
      const idx = buffer.indexOf("\n\n");
      const eventText = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      let eventName = "message";
      let eventData = "";
      for (const line of eventText.split("\n")) {
        if (line.startsWith("event:")) {
          eventName = line.replace("event:", "").trim();
        } else if (line.startsWith("data:")) {
          eventData += line.replace("data:", "");
        }
      }

      if (eventName === "meta") {
        try {
          const meta = JSON.parse(eventData.trim());
          if (meta.conversation_id) {
            activeConversationId = Number(meta.conversation_id);
          }
          if (meta.model) {
            modelName.textContent = meta.model;
            if (heroModelName) heroModelName.textContent = meta.model;
          }
          setConversationActionState();
        } catch (err) {
          const id = Number(eventData.trim());
          if (!Number.isNaN(id)) {
            activeConversationId = id;
            setConversationActionState();
          }
        }
      } else if (eventName === "sources") {
        try {
          messageSources = JSON.parse(eventData.trim());
          setMessageSources(assistantMessage, messageSources);
        } catch (err) {
          // ignore malformed source payloads
        }
      } else if (eventName === "web") {
        // internal marker only
      } else if (eventName === "done") {
        setMessageContent(assistantMessage, assistantText.trim());
        setMessageSources(assistantMessage, messageSources);
      } else if (eventName === "error") {
        setMessageContent(assistantMessage, eventData.trim());
        showToast(eventData.trim() || "Request failed.", "error");
      } else {
        assistantText += eventData;
        setMessageContent(assistantMessage, assistantText);
      }
    }
  }

  history.push({ role: "user", content: prompt });
  history.push({ role: "assistant", content: assistantText.trim() });
  await loadConversations();

  if (voiceChatActive || settings.autoSpeak) {
    speakText(assistantText.trim(), {
      onEnd: () => {
        if (voiceChatActive) startRecognition("voice-chat");
      },
    });
  }
}

async function submitCurrentModePrompt(forcedPrompt = null) {
  const mode = chatModeEl.value;
  const prompt = (forcedPrompt ?? promptEl.value).trim();
  const commandAdjusted = applySlashCommands(prompt);
  const finalPrompt = commandAdjusted.prompt;
  const promptRequiredModes = new Set(["chat", "analyze", "edit", "generate", "file-generate"]);
  if (promptRequiredModes.has(mode) && !finalPrompt) return;

  promptEl.value = "";
  autoResizeInput();

  if (mode === "chat") {
    await streamChat(finalPrompt);
  } else if (mode === "analyze") {
    await analyzeFromChat(finalPrompt);
  } else if (mode === "edit") {
    await editFromChat(finalPrompt);
  } else if (mode === "generate") {
    await generateFromChat(finalPrompt);
  } else if (mode === "file-analyze") {
    await analyzeFileFromChat(finalPrompt);
  } else if (mode === "file-parse") {
    await parseFileFromChat(finalPrompt);
  } else if (mode === "file-compare") {
    await compareFilesFromChat(finalPrompt);
  } else if (mode === "file-generate") {
    await generateFileFromChat(finalPrompt);
  } else if (mode === "file-convert") {
    await convertFileFromChat();
  }
}

function applySlashCommands(prompt) {
  let output = prompt || "";
  const commands = output.match(/^\/\w+(?:\s+\/\w+)*/);
  if (!commands) return { prompt: output };

  const tokens = commands[0].trim().split(/\s+/);
  tokens.forEach((token) => {
    if (token === "/web") settings.useWeb = true;
    if (token === "/noweb") settings.useWeb = false;
    if (token === "/fast") settings.responsePreset = "fast";
    if (token === "/balanced") settings.responsePreset = "balanced";
    if (token === "/detail") settings.responsePreset = "detailed";
    if (token === "/code") settings.responsePreset = "coding";
  });
  saveSettings();
  applySettingsToUI();
  output = output.slice(commands[0].length).trim();
  return { prompt: output };
}

async function renameConversation() {
  if (!activeConversationId) return;
  const title = window.prompt("Rename conversation:");
  if (!title) return;
  const res = await fetch(`/api/conversations/${activeConversationId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ title }),
  });
  if (res.ok) {
    await loadConversations();
  }
}

async function togglePinConversation() {
  if (!activeConversationId) return;
  const activeButton = convoListEl.querySelector(".conversation-item.active");
  const currentlyPinned = activeButton?.classList.contains("pinned") || false;
  const res = await fetch(`/api/conversations/${activeConversationId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ pinned: !currentlyPinned }),
  });
  if (res.ok) {
    await loadConversations();
    setConversationActionState();
  }
}

async function duplicateConversation() {
  if (!activeConversationId) return;
  const res = await fetch(`/api/conversations/${activeConversationId}/duplicate`, {
    method: "POST",
    headers: headers(),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    createMessageNode("assistant", data.error || "Conversation duplication failed.");
    return;
  }
  await loadConversations();
  await openConversation(data.id);
}

async function branchConversation() {
  if (!activeConversationId) return;
  const res = await fetch(`/api/conversations/${activeConversationId}/branch`, {
    method: "POST",
    headers: headers(),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    createMessageNode("assistant", data.error || "Conversation branch failed.");
    return;
  }
  await loadConversations();
  await openConversation(data.id);
}

function exportConversation() {
  if (!activeConversationId) return;
  fetch(`/api/conversations/${activeConversationId}/export?format=md`, {
    headers: headers(false),
  })
    .then(async (response) => {
      if (!response.ok) {
        const data = await readResponsePayload(response);
        throw new Error(data.error || "Export failed.");
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const filename = filenameMatch ? filenameMatch[1] : `conversation-${activeConversationId}.md`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    })
    .catch((err) => {
      showToast(`Export failed: ${err.message}`, "error");
    });
}

async function deleteConversation() {
  if (!activeConversationId) return;
  if (!window.confirm("Delete this conversation?")) return;
  const res = await fetch(`/api/conversations/${activeConversationId}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) return;
  activeConversationId = null;
  history = [];
  clearMessages();
  setConversationActionState();
  await loadConversations();
}

