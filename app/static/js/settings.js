const DEFAULT_PROMPT_TEMPLATES = [
  { title: "Portfolio HTML", text: "Generate a complete single-file HTML portfolio website using Bootstrap 5 only, with embedded CSS and JS in the same file. Make it modern, minimal, premium, responsive, and production-like. Return only full valid HTML." },
  { title: "Code Review", text: "/code Review this code, identify the bug, explain the root cause, and provide the fixed version." },
  { title: "Web Update", text: "/web Give me the latest update with sources and timestamps." },
  { title: "File Summary", text: "Summarize this file, extract the key points, risks, and recommended next steps." },
  { title: "Resume Parser", text: "Extract the key resume details from this file in structured JSON: name, headline, skills, experience, education, contact." },
  { title: "Invoice Parser", text: "Extract the invoice details from this file in structured JSON: vendor, invoice number, dates, totals, and line items." },
  { title: "Contract Review", text: "Review this contract and list parties, payment terms, termination terms, risks, and missing items." },
  { title: "Table Extraction", text: "Extract any tables from this file into a structured format and summarize the important rows." },
  { title: "Image OCR", text: "Explain what is written in this image and summarize the important points." },
];

async function loadMemoryItems() {
  if (!memoryListEl) return;
  const query = memoryScopeFilterEl?.value ? `?scope=${encodeURIComponent(memoryScopeFilterEl.value)}` : "";
  const res = await fetch(`/api/memory${query}`, { headers: headers(false) });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    memoryListEl.innerHTML = `<div class="small text-danger">${data.error || "Failed to load memory."}</div>`;
    return;
  }
  memoryListEl.innerHTML = "";
  if (!data.length) {
    memoryListEl.innerHTML = `<div class="small text-secondary">No saved memory yet.</div>`;
    return;
  }
  data.forEach((item) => {
    const card = document.createElement("div");
    card.className = "memory-card";
    card.innerHTML = `
      <div class="memory-card-top">
        <div>
          <div class="memory-title">${item.title}</div>
          <div class="memory-scope small text-secondary">${item.scope}</div>
        </div>
        <button class="btn btn-sm btn-outline-light" type="button">Delete</button>
      </div>
      <div class="small text-secondary">${item.content}</div>
    `;
    card.querySelector("button").onclick = async () => {
      const delRes = await fetch(`/api/memory/${item.id}`, { method: "DELETE", headers: headers(false) });
      const delData = await readResponsePayload(delRes);
      if (!delRes.ok) {
        showToast(delData.error || "Failed to delete memory.", "error");
        return;
      }
      showToast("Memory removed.", "success");
      await loadMemoryItems();
    };
    memoryListEl.appendChild(card);
  });
}

function renderPromptTemplates() {
  if (!promptTemplatesEl) return;
  promptTemplatesEl.innerHTML = "";
  DEFAULT_PROMPT_TEMPLATES.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-outline-light text-start prompt-template-btn";
    button.innerHTML = `<span class="prompt-template-title">${item.title}</span><span class="prompt-template-copy">${item.text}</span>`;
    button.onclick = () => {
      promptEl.value = item.text;
      promptEl.focus();
      autoResizeInput();
      if (typeof bootstrap !== "undefined") {
        const drawer = document.getElementById("templates-drawer");
        if (drawer) bootstrap.Offcanvas.getOrCreateInstance(drawer).hide();
      }
    };
    promptTemplatesEl.appendChild(button);
  });
}

function maybeShowOnboarding() {
  if (localStorage.getItem("ai.onboardingSeen") === "true" || typeof bootstrap === "undefined") return;
  const drawer = document.getElementById("help-drawer");
  if (!drawer) return;
  bootstrap.Offcanvas.getOrCreateInstance(drawer).show();
  localStorage.setItem("ai.onboardingSeen", "true");
}
