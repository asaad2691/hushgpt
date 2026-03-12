function getSelectedCollectionId() {
  const raw = settings.selectedCollectionId || "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function setSelectedCollection(collectionId) {
  settings.selectedCollectionId = collectionId ? String(collectionId) : "";
  selectedCollection = knowledgeCollections.find((item) => String(item.id) === settings.selectedCollectionId) || null;
  if (collectionSelectEl) {
    collectionSelectEl.value = settings.selectedCollectionId || "";
  }
  saveSettings();
  updateToolContext();
  renderCollectionsList();
  renderSelectedCollectionSummary();
}

function renderCollectionOptions() {
  if (!collectionSelectEl) return;
  const currentValue = settings.selectedCollectionId || "";
  collectionSelectEl.innerHTML = `<option value="">No collection</option>`;
  knowledgeCollections.forEach((collection) => {
    const option = document.createElement("option");
    option.value = String(collection.id);
    option.textContent = `${collection.name} (${collection.asset_count})`;
    collectionSelectEl.appendChild(option);
  });
  collectionSelectEl.value = currentValue;
}

function renderSelectedCollectionSummary() {
  if (!selectedCollectionSummaryEl) return;
  if (!selectedCollection) {
    selectedCollectionSummaryEl.textContent = "No collection selected.";
    if (collectionAssetsEl) collectionAssetsEl.innerHTML = `<div class="small text-secondary">Select a collection to inspect its assets.</div>`;
    return;
  }
  selectedCollectionSummaryEl.innerHTML = `
    <div class="fw-semibold">${selectedCollection.name}</div>
    <div class="small text-secondary">${selectedCollection.description || "No description."}</div>
    <div class="small text-secondary mt-1">${selectedCollection.asset_count || 0} assets indexed</div>
  `;
}

function renderCollectionsList() {
  if (!collectionsListEl) return;
  collectionsListEl.innerHTML = "";
  if (!knowledgeCollections.length) {
    collectionsListEl.innerHTML = `<div class="small text-secondary">No collections yet.</div>`;
    renderSelectedCollectionSummary();
    return;
  }
  knowledgeCollections.forEach((collection) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "collection-card";
    if (String(collection.id) === String(settings.selectedCollectionId || "")) {
      row.classList.add("active");
    }
    row.innerHTML = `
      <div class="collection-card-top">
        <div class="collection-card-title">${collection.name}</div>
        <div class="collection-card-meta">${collection.asset_count || 0} docs</div>
      </div>
      <div class="collection-card-copy">${truncate(collection.description || "No description yet.", 110)}</div>
    `;
    row.addEventListener("click", async () => {
      await openCollection(collection.id);
    });
    collectionsListEl.appendChild(row);
  });
  renderSelectedCollectionSummary();
}

function renderCollectionAssets(assets = []) {
  if (!collectionAssetsEl) return;
  collectionAssetsEl.innerHTML = "";
  if (!assets.length) {
    collectionAssetsEl.innerHTML = `<div class="small text-secondary">No assets indexed in this collection yet.</div>`;
    return;
  }
  assets.forEach((asset) => {
    const item = document.createElement("div");
    item.className = "collection-asset-card";
    item.innerHTML = `
      <div class="collection-asset-title-row">
        <div class="collection-asset-title">${asset.title}</div>
        <div class="collection-asset-meta">${asset.source_type}</div>
      </div>
      <div class="collection-asset-copy">${truncate(asset.preview || "", 180)}</div>
    `;
    collectionAssetsEl.appendChild(item);
  });
}

async function loadCollections({ preserveSelection = true } = {}) {
  const res = await fetch("/api/collections", { headers: headers(false) });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Failed to load collections.", "error");
    return;
  }
  knowledgeCollections = data;
  renderCollectionOptions();
  const currentId = preserveSelection ? getSelectedCollectionId() : null;
  if (currentId && knowledgeCollections.some((item) => item.id === currentId)) {
    selectedCollection = knowledgeCollections.find((item) => item.id === currentId) || null;
  } else {
    setSelectedCollection("");
  }
  renderCollectionsList();
}

async function openCollection(collectionId) {
  const res = await fetch(`/api/collections/${collectionId}`, { headers: headers(false) });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Failed to open collection.", "error");
    return;
  }
  setSelectedCollection(collectionId);
  selectedCollection = data;
  renderCollectionsList();
  renderCollectionAssets(data.assets || []);
}

async function createCollection() {
  const name = (collectionNameEl?.value || "").trim();
  const description = (collectionDescriptionEl?.value || "").trim();
  if (!name) {
    showToast("Collection name is required.", "error");
    return;
  }
  const res = await fetch("/api/collections", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, description }),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Collection creation failed.", "error");
    return;
  }
  if (collectionNameEl) collectionNameEl.value = "";
  if (collectionDescriptionEl) collectionDescriptionEl.value = "";
  await loadCollections({ preserveSelection: false });
  await openCollection(data.id);
  showToast("Collection created.", "success");
}

async function ingestCollectionFiles() {
  const collectionId = getSelectedCollectionId();
  if (!collectionId) {
    showToast("Select a collection first.", "error");
    return;
  }
  const files = [...(collectionFileInputEl?.files || [])];
  if (!files.length) {
    showToast("Choose files to upload first.", "error");
    return;
  }
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const res = await fetch(`/api/collections/${collectionId}/files`, {
    method: "POST",
    headers: headers(false),
    body: formData,
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Collection ingestion failed.", "error");
    return;
  }
  if (collectionFileInputEl) collectionFileInputEl.value = "";
  await loadCollections();
  await openCollection(collectionId);
  showToast("Files indexed into collection.", "success");
}

async function ingestCollectionWebsite() {
  const collectionId = getSelectedCollectionId();
  if (!collectionId) {
    showToast("Select a collection first.", "error");
    return;
  }
  const url = (collectionWebsiteUrlEl?.value || "").trim();
  if (!url) {
    showToast("Website URL is required.", "error");
    return;
  }
  const res = await fetch(`/api/collections/${collectionId}/websites`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ url }),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Website ingestion failed.", "error");
    return;
  }
  if (collectionWebsiteUrlEl) collectionWebsiteUrlEl.value = "";
  await loadCollections();
  await openCollection(collectionId);
  showToast("Website indexed into collection.", "success");
}

async function reindexSelectedCollection() {
  const collectionId = getSelectedCollectionId();
  if (!collectionId) {
    showToast("Select a collection first.", "error");
    return;
  }
  const res = await fetch(`/api/collections/${collectionId}/reindex`, {
    method: "POST",
    headers: headers(false),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Collection reindex failed.", "error");
    return;
  }
  await loadCollections();
  await openCollection(collectionId);
  showToast(`Reindexed ${data.reindexed_assets || 0} assets.`, "success");
}

async function clearSelectedCollection() {
  const collectionId = getSelectedCollectionId();
  if (!collectionId) {
    showToast("Select a collection first.", "error");
    return;
  }
  if (!window.confirm("Clear all assets from this collection?")) return;
  const res = await fetch(`/api/collections/${collectionId}/clear`, {
    method: "POST",
    headers: headers(false),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Collection clear failed.", "error");
    return;
  }
  await loadCollections();
  await openCollection(collectionId);
  showToast(`Removed ${data.removed_assets || 0} assets.`, "success");
}

async function deleteSelectedCollection() {
  const collectionId = getSelectedCollectionId();
  if (!collectionId) {
    showToast("Select a collection first.", "error");
    return;
  }
  if (!window.confirm("Delete this collection?")) return;
  const res = await fetch(`/api/collections/${collectionId}`, {
    method: "DELETE",
    headers: headers(false),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Collection deletion failed.", "error");
    return;
  }
  setSelectedCollection("");
  await loadCollections({ preserveSelection: false });
  renderCollectionAssets([]);
  showToast("Collection deleted.", "success");
}

function defaultCommandEntries() {
  return [
    { label: "New chat", description: "Start a fresh conversation", run: () => newChatBtn?.click() },
    { label: "Open jobs", description: "View queued and running background tasks", run: () => bootstrap.Offcanvas.getOrCreateInstance(document.getElementById("jobs-drawer")).show() },
    { label: "Open collections", description: "Manage knowledge bases and indexed assets", run: () => bootstrap.Offcanvas.getOrCreateInstance(document.getElementById("collections-drawer")).show() },
    { label: "Open prompt templates", description: "Insert reusable prompts", run: () => bootstrap.Offcanvas.getOrCreateInstance(document.getElementById("templates-drawer")).show() },
    { label: "Open memory", description: "Inspect saved memory items", run: () => bootstrap.Offcanvas.getOrCreateInstance(document.getElementById("memory-drawer")).show() },
    { label: "Open settings", description: "Adjust model and generation options", run: () => bootstrap.Modal.getOrCreateInstance(document.getElementById("settings-modal")).show() },
    { label: "Focus chat input", description: "Jump straight to the composer", run: () => promptEl?.focus() },
  ];
}

function renderCommandResults(items) {
  if (!commandResultsEl) return;
  commandResultsEl.innerHTML = "";
  if (!items.length) {
    commandResultsEl.innerHTML = `<div class="small text-secondary">No results.</div>`;
    return;
  }
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "command-result";
    button.innerHTML = `
      <div class="command-result-title">${item.label}</div>
      <div class="command-result-copy">${item.description || ""}</div>
    `;
    button.addEventListener("click", () => {
      bootstrap.Modal.getOrCreateInstance(commandModalEl).hide();
      item.run();
    });
    commandResultsEl.appendChild(button);
  });
}

async function searchWorkspace(query) {
  const clean = (query || "").trim();
  if (!clean) {
    renderCommandResults(defaultCommandEntries());
    return;
  }
  const res = await fetch(`/api/search?q=${encodeURIComponent(clean)}`, { headers: headers(false) });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    showToast(data.error || "Search failed.", "error");
    return;
  }
  const results = [];
  (data.results.conversations || []).forEach((item) => {
    results.push({
      label: `Chat: ${item.title || `Conversation ${item.id}`}`,
      description: item.summary || "Conversation result",
      run: () => openConversation(item.id),
    });
  });
  (data.results.collections || []).forEach((item) => {
    results.push({
      label: `Collection: ${item.name}`,
      description: item.description || "Knowledge base",
      run: async () => {
        bootstrap.Offcanvas.getOrCreateInstance(document.getElementById("collections-drawer")).show();
        await openCollection(item.id);
      },
    });
  });
  (data.results.assets || []).forEach((item) => {
    results.push({
      label: `Asset: ${item.title}`,
      description: item.preview || item.source_type,
      run: async () => {
        bootstrap.Offcanvas.getOrCreateInstance(document.getElementById("collections-drawer")).show();
        await openCollection(item.collection_id);
      },
    });
  });
  (data.results.memory || []).forEach((item) => {
    results.push({
      label: `Memory: ${item.title}`,
      description: item.content || item.scope,
      run: () => bootstrap.Offcanvas.getOrCreateInstance(document.getElementById("memory-drawer")).show(),
    });
  });
  (data.results.jobs || []).forEach((item) => {
    results.push({
      label: `Job: ${item.job_type} (#${item.id})`,
      description: `${item.status}${item.error ? ` - ${item.error}` : ""}`,
      run: () => bootstrap.Offcanvas.getOrCreateInstance(document.getElementById("jobs-drawer")).show(),
    });
  });
  renderCommandResults(results.slice(0, 20));
}

function bindCollectionsAndSearch() {
  collectionSelectEl?.addEventListener("change", async () => {
    const selectedId = collectionSelectEl.value || "";
    setSelectedCollection(selectedId);
    if (selectedId) {
      await openCollection(Number(selectedId));
    } else {
      renderCollectionAssets([]);
    }
  });
  createCollectionBtn?.addEventListener("click", () => createCollection().catch((err) => showToast(err.message || "Collection creation failed.", "error")));
  ingestCollectionFilesBtn?.addEventListener("click", () => ingestCollectionFiles().catch((err) => showToast(err.message || "Collection file ingestion failed.", "error")));
  ingestCollectionWebsiteBtn?.addEventListener("click", () => ingestCollectionWebsite().catch((err) => showToast(err.message || "Collection website ingestion failed.", "error")));
  reindexCollectionBtn?.addEventListener("click", () => reindexSelectedCollection().catch((err) => showToast(err.message || "Reindex failed.", "error")));
  clearCollectionBtn?.addEventListener("click", () => clearSelectedCollection().catch((err) => showToast(err.message || "Clear failed.", "error")));
  deleteCollectionBtn?.addEventListener("click", () => deleteSelectedCollection().catch((err) => showToast(err.message || "Delete failed.", "error")));

  commandInputEl?.addEventListener("input", () => {
    searchWorkspace(commandInputEl.value).catch((err) => showToast(err.message || "Search failed.", "error"));
  });
  commandModalEl?.addEventListener("shown.bs.modal", () => {
    if (commandInputEl) {
      commandInputEl.value = "";
      commandInputEl.focus();
    }
    renderCommandResults(defaultCommandEntries());
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      bootstrap.Modal.getOrCreateInstance(commandModalEl).show();
    }
  });
}
