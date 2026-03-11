async function registerUser() {
  const username = (authUsernameEl?.value || "").trim();
  const password = authPasswordEl?.value || "";
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ username, password }),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    if (authStatusEl) authStatusEl.textContent = data.error || "Registration failed.";
    return;
  }
  if (authStatusEl) authStatusEl.textContent = `Registered ${data.username}. You can log in now.`;
}

async function loginUser() {
  const username = (authUsernameEl?.value || "").trim();
  const password = authPasswordEl?.value || "";
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ username, password }),
  });
  const data = await readResponsePayload(res);
  if (!res.ok) {
    if (authStatusEl) authStatusEl.textContent = data.error || "Login failed.";
    return;
  }
  authToken = data.token || "";
  currentUsername = data.username || "";
  localStorage.setItem("ai.authToken", authToken);
  localStorage.setItem("ai.username", currentUsername);
  updateAuthUI();
  await loadSystemStatus();
}

async function logoutUser() {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: headers(false),
  }).catch(() => {});
  authToken = "";
  currentUsername = "";
  localStorage.removeItem("ai.authToken");
  localStorage.removeItem("ai.username");
  updateAuthUI();
}

