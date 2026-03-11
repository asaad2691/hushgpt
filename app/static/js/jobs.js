async function queueJob(endpoint, buildBody, { multipart = false, onDone } = {}) {
  const loading = addTypingIndicator();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: multipart ? headers(false) : headers(),
    body: buildBody(),
  });
  const data = await readResponsePayload(response);
  if (!response.ok) {
    setMessageContent(loading, data.error || "Job start failed.");
    showToast(data.error || "Job start failed.", "error");
    return null;
  }
  setMessageContent(loading, `Job ${data.job_id} queued. Waiting for completion...`);
  await loadJobsDrawer();
  await pollJob(data.job_id, loading, onDone);
  return data.job_id;
}

async function pollJob(jobId, messageNode, onDone) {
  while (true) {
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    const res = await fetch(`/api/jobs/${jobId}`, { headers: headers(false) });
    const data = await readResponsePayload(res);
    if (!res.ok) {
      setMessageContent(messageNode, data.error || "Job polling failed.");
      showToast(data.error || "Job polling failed.", "error");
      return;
    }
    if (data.status === "failed" || data.status === "cancelled") {
      setMessageContent(messageNode, data.error || "Job failed.");
      showToast(data.error || "Job failed.", "error");
      await loadJobsDrawer();
      await loadSystemStatus();
      return;
    }
    if (data.status !== "done") {
      setMessageContent(messageNode, `Job ${jobId} running... ${data.progress}%`);
      await loadJobsDrawer();
      continue;
    }
    if (onDone) await onDone(data.result || {}, messageNode);
    await loadJobsDrawer();
    await loadSystemStatus();
    return;
  }
}

async function loadJobsDrawer() {
  if (!jobsListEl || !jobsItemTemplate) return;
  const res = await fetch("/api/jobs", { headers: headers(false) });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    jobsListEl.innerHTML = `<div class="small text-danger">${data.error || "Failed to load jobs."}</div>`;
    return;
  }
  jobsListEl.innerHTML = "";
  if (!data.length) {
    jobsListEl.innerHTML = `<div class="small text-secondary">No jobs yet.</div>`;
    return;
  }
  data.forEach((job) => {
    const node = jobsItemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".job-type").textContent = job.job_type;
    node.querySelector(".job-meta").textContent = `Job ${job.id} • ${new Date(job.created_at).toLocaleString()}`;
    node.querySelector(".job-status").textContent = job.status;
    const progressEl = node.querySelector(".progress");
    const barEl = node.querySelector(".progress-bar");
    progressEl.setAttribute("aria-valuenow", String(job.progress || 0));
    barEl.style.width = `${job.progress || 0}%`;
    barEl.textContent = `${job.progress || 0}%`;
    const actionsEl = node.querySelector(".job-actions");
    if (job.status === "failed") {
      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "btn btn-sm btn-outline-light";
      retryBtn.textContent = "Retry";
      retryBtn.onclick = async () => {
        const retryRes = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST", headers: headers(false) });
        const retryData = await readResponsePayload(retryRes);
        if (!retryRes.ok) {
          showToast(retryData.error || "Retry failed.", "error");
          return;
        }
        showToast(`Job ${job.id} re-queued.`, "success");
        await loadJobsDrawer();
      };
      actionsEl.appendChild(retryBtn);
    }
    if (job.status === "queued" || job.status === "running") {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-sm btn-outline-danger";
      cancelBtn.textContent = "Cancel";
      cancelBtn.onclick = async () => {
        const cancelRes = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST", headers: headers(false) });
        const cancelData = await readResponsePayload(cancelRes);
        if (!cancelRes.ok) {
          showToast(cancelData.error || "Cancel failed.", "error");
          return;
        }
        showToast(`Job ${job.id} cancelled.`, "success");
        await loadJobsDrawer();
      };
      actionsEl.appendChild(cancelBtn);
    }
    if (job.error) {
      const errorEl = document.createElement("div");
      errorEl.className = "small text-secondary";
      errorEl.textContent = job.error;
      node.appendChild(errorEl);
    }
    jobsListEl.appendChild(node);
  });
}

function startJobsPolling() {
  if (jobsRefreshTimer) {
    window.clearInterval(jobsRefreshTimer);
  }
  jobsRefreshTimer = window.setInterval(() => {
    loadJobsDrawer().catch(() => {});
  }, 4000);
}

