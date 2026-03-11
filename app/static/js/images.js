async function analyzeFromChat(prompt) {
  const pickedImage = imageReaderFile.files[0];
  if (!pickedImage) {
    createMessageNode("assistant", "Please select an image first.");
    return;
  }

  const previewUrl = URL.createObjectURL(pickedImage);
  createMessageNode("user", `[[user_image:${previewUrl}]]\n[Image Analyze] ${prompt}`);

  const formData = new FormData();
  formData.append("image", pickedImage, pickedImage.name || "upload.png");
  formData.append("file", pickedImage, pickedImage.name || "upload.png");
  formData.append("prompt", prompt);
  if (activeConversationId) formData.append("conversation_id", String(activeConversationId));

  if (settings.backgroundJobs) {
    await queueJob("/api/jobs/image-analyze", () => formData, {
      multipart: true,
      onDone: async (result, messageNode) => {
        const extractedText = (result.ocr_text || "").trim();
        const textBlock = extractedText ? `Extracted text:\n${extractedText}\n\n` : "";
        const answer = `${textBlock}Image caption: ${result.caption}\n\nAnalysis:\n${result.analysis}`;
        activeConversationId = result.conversation_id || activeConversationId;
        setConversationActionState();
        setMessageContent(messageNode, answer);
        history.push({ role: "user", content: `[[user_image:${result.image_url || previewUrl}]]\n[Image Analyze] ${prompt}` });
        history.push({ role: "assistant", content: answer });
        await loadConversations();
      },
    });
    return;
  }

  const loading = addTypingIndicator();
  const res = await fetch("/api/images/analyze", {
    method: "POST",
    headers: headers(false),
    body: formData,
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    setMessageContent(loading, data.error || "Image analysis failed.");
    URL.revokeObjectURL(previewUrl);
    return;
  }

  activeConversationId = data.conversation_id || activeConversationId;
  setConversationActionState();
  const extractedText = (data.ocr_text || "").trim();
  const textBlock = extractedText ? `Extracted text:\n${extractedText}\n\n` : "";
  const answer = `${textBlock}Image caption: ${data.caption}\n\nAnalysis:\n${data.analysis}`;
  setMessageContent(loading, answer);
  history.push({ role: "user", content: `[[user_image:${data.image_url}]]\n[Image Analyze] ${prompt}` });
  history.push({ role: "assistant", content: answer });
  URL.revokeObjectURL(previewUrl);
  await loadConversations();
}

async function generateFromChat(prompt) {
  createMessageNode("user", `[Image Generate] ${prompt}`);
  if (settings.backgroundJobs) {
    await queueJob("/api/jobs/image-generate", () => JSON.stringify({ prompt, conversation_id: activeConversationId }), {
      multipart: false,
      onDone: async (result, messageNode) => {
        activeConversationId = result.conversation_id || activeConversationId;
        setConversationActionState();
        if (activeConversationId) {
          const conversation = await syncConversationFromServer(activeConversationId);
          const latestAssistant = [...conversation.messages].reverse().find((msg) => msg.role === "assistant");
          if (latestAssistant) {
            setMessageContent(messageNode, latestAssistant.content);
          } else {
            setMessageContent(messageNode, result.image_url ? `[[generated_image:${result.image_url}]]` : "Image generated.");
          }
        } else {
          setMessageContent(messageNode, result.image_url ? `[[generated_image:${result.image_url}]]` : "Image generated.");
        }
        await loadConversations();
      },
    });
    return;
  }
  const loading = addTypingIndicator();
  const res = await fetch("/api/images/generate", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      prompt,
      conversation_id: activeConversationId,
    }),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    setMessageContent(loading, data.error || "Image generation failed.");
    return;
  }

  activeConversationId = data.conversation_id || activeConversationId;
  setConversationActionState();
  setMessageContent(loading, `[[generated_image:${data.image_url}]]`);
  history.push({ role: "user", content: `[Image Generate] ${prompt}` });
  history.push({ role: "assistant", content: `[[generated_image:${data.image_url}]]` });
  await loadConversations();
}

async function editFromChat(prompt) {
  const pickedImage = imageReaderFile.files[0];
  if (!pickedImage) {
    createMessageNode("assistant", "Please select an image first.");
    return;
  }

  const previewUrl = URL.createObjectURL(pickedImage);
  createMessageNode("user", `[[user_image:${previewUrl}]]\n[Image Edit] ${prompt}`);

  const formData = new FormData();
  formData.append("image", pickedImage, pickedImage.name || "upload.png");
  formData.append("file", pickedImage, pickedImage.name || "upload.png");
  formData.append("prompt", prompt);
  if (activeConversationId) formData.append("conversation_id", String(activeConversationId));

  const loading = addTypingIndicator();
  const res = await fetch("/api/images/edit", {
    method: "POST",
    headers: headers(false),
    body: formData,
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    setMessageContent(loading, data.error || "Image edit failed.");
    URL.revokeObjectURL(previewUrl);
    return;
  }

  activeConversationId = data.conversation_id || activeConversationId;
  setConversationActionState();
  setMessageContent(loading, `[[edited_image:${data.edited_image_url}]]`);
  history.push({ role: "user", content: `[[user_image:${data.source_image_url}]]\n[Image Edit] ${prompt}` });
  history.push({ role: "assistant", content: `[[edited_image:${data.edited_image_url}]]` });
  URL.revokeObjectURL(previewUrl);
  await loadConversations();
}

