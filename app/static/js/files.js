async function analyzeFileFromChat(prompt) {
  if (!fileInput.files.length) {
    createMessageNode("assistant", "Please select a file first.");
    return;
  }

  const picked = fileInput.files[0];
  createMessageNode("user", `[File Analyze] ${picked.name}\n${prompt}`);
  const formData = new FormData();
  formData.append("file", picked);
  formData.append("prompt", prompt);
  if (activeConversationId) formData.append("conversation_id", String(activeConversationId));
  if (settings.selectedCollectionId) formData.append("collection_id", String(settings.selectedCollectionId));

  if (settings.backgroundJobs) {
    await queueJob("/api/jobs/file-analyze", () => formData, {
      multipart: true,
      onDone: async (result, messageNode) => {
        const answer = result.analysis || "No analysis generated.";
        activeConversationId = result.conversation_id || activeConversationId;
        setConversationActionState();
        setMessageContent(messageNode, answer);
        history.push({ role: "user", content: `[File Analyze] ${picked.name}\n${prompt}` });
        history.push({ role: "assistant", content: answer });
        await loadConversations();
      },
    });
    return;
  }

  const loading = addTypingIndicator();
  const res = await fetch("/api/files/analyze", {
    method: "POST",
    headers: headers(false),
    body: formData,
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    setMessageContent(loading, data.error || "File analysis failed.");
    return;
  }

  activeConversationId = data.conversation_id || activeConversationId;
  setConversationActionState();
  setMessageContent(loading, data.analysis || "No analysis generated.");
  history.push({ role: "user", content: `[File Analyze] ${picked.name}\n${prompt}` });
  history.push({ role: "assistant", content: data.analysis || "" });
  await loadConversations();
}

async function parseFileFromChat(prompt) {
  if (!fileInput.files.length) {
    createMessageNode("assistant", "Please select a file first.");
    return;
  }

  const picked = fileInput.files[0];
  const parserType = parserSelectEl?.value || "table";
  createMessageNode("user", `[File Parse ${parserType}] ${picked.name}\n${prompt}`.trim());
  const formData = new FormData();
  formData.append("file", picked);
  formData.append("parser_type", parserType);
  if (prompt) formData.append("prompt", prompt);
  if (activeConversationId) formData.append("conversation_id", String(activeConversationId));
  if (settings.selectedCollectionId) formData.append("collection_id", String(settings.selectedCollectionId));

  const loading = addTypingIndicator();
  const res = await fetch("/api/files/parse", {
    method: "POST",
    headers: headers(false),
    body: formData,
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    setMessageContent(loading, data.error || "File parse failed.");
    showToast(data.error || "File parse failed.", "error");
    return;
  }

  activeConversationId = data.conversation_id || activeConversationId;
  setConversationActionState();
  const output = data.data ? JSON.stringify(data.data, null, 2) : (data.raw || JSON.stringify(data, null, 2));
  setMessageContent(loading, `\`\`\`json\n${output}\n\`\`\``);
  await loadConversations();
}

async function compareFilesFromChat(prompt) {
  if (!fileInput.files.length || !fileInputSecondary.files.length) {
    createMessageNode("assistant", "Please select both files to compare.");
    return;
  }

  const left = fileInput.files[0];
  const right = fileInputSecondary.files[0];
  createMessageNode("user", `[File Compare] ${left.name} vs ${right.name}\n${prompt}`);

  const formData = new FormData();
  formData.append("left_file", left);
  formData.append("right_file", right);
  formData.append("prompt", prompt);
  if (activeConversationId) formData.append("conversation_id", String(activeConversationId));
  if (settings.selectedCollectionId) formData.append("collection_id", String(settings.selectedCollectionId));

  const loading = addTypingIndicator();
  const res = await fetch("/api/files/compare", {
    method: "POST",
    headers: headers(false),
    body: formData,
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    setMessageContent(loading, data.error || "File comparison failed.");
    return;
  }

  activeConversationId = data.conversation_id || activeConversationId;
  setConversationActionState();
  setMessageContent(loading, data.comparison || "No comparison generated.");
  history.push({ role: "user", content: `[File Compare] ${left.name} vs ${right.name}\n${prompt}` });
  history.push({ role: "assistant", content: data.comparison || "" });
  await loadConversations();
}

async function generateFileFromChat(prompt) {
  const fmt = fileFormatEl.value;
  createMessageNode("user", `[File Generate ${fmt}] ${prompt}`);
  const loading = addTypingIndicator();
  const res = await fetch("/api/files/generate", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      prompt,
      target_format: fmt,
      conversation_id: activeConversationId,
    }),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    setMessageContent(loading, data.error || "File generation failed.");
    return;
  }

  activeConversationId = data.conversation_id || activeConversationId;
  setConversationActionState();
  const token = `[[file:${data.file_url}|${data.filename}]]`;
  setMessageContent(loading, token);
  history.push({ role: "user", content: `[File Generate ${fmt}] ${prompt}` });
  history.push({ role: "assistant", content: token });
  await loadConversations();
}

async function convertFileFromChat() {
  if (!fileInput.files.length) {
    createMessageNode("assistant", "Please select a file to convert.");
    return;
  }

  const fmt = fileFormatEl.value;
  const picked = fileInput.files[0];
  createMessageNode("user", `[File Convert] ${picked.name} -> ${fmt}`);

  const formData = new FormData();
  formData.append("file", picked);
  formData.append("target_format", fmt);
  if (activeConversationId) formData.append("conversation_id", String(activeConversationId));

  const loading = addTypingIndicator();
  const res = await fetch("/api/files/convert", {
    method: "POST",
    headers: headers(false),
    body: formData,
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    setMessageContent(loading, data.error || "File conversion failed.");
    return;
  }

  activeConversationId = data.conversation_id || activeConversationId;
  setConversationActionState();
  const token = `[[file:${data.file_url}|${data.filename}]]`;
  setMessageContent(loading, token);
  history.push({ role: "user", content: `[File Convert] ${picked.name} -> ${fmt}` });
  history.push({ role: "assistant", content: token });
  await loadConversations();
}
