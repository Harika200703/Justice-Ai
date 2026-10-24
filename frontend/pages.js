
(() => {
  "use strict";

  const config = window.JUSTICE_AI_CONFIG || {};

  const API = (
    config.API_BASE_URL || "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");

  const token =
    sessionStorage.getItem("justice_ai_token") ||
    localStorage.getItem("justice_ai_token");

  if (!token) {
    location.replace("login.html");
    return;
  }

  const currentPage =
    location.pathname.split("/").pop() || "overview.html";

  // Shared navigation for the pages using pageNavigation.
  const navigation = [
    ["overview.html", "Overview"],
    ["dashboard.html", "New Analysis"],
    ["history.html", "Document History"],
    ["cases.html", "My Cases"],
    ["sources.html", "Legal Sources"],
    ["settings.html", "Settings"]
  ];

  const navHTML = navigation.map(([url, label]) => {
    const activeClass = currentPage === url ? "active" : "";

    return `
      <a href="${url}" class="${activeClass}" ${
        currentPage === url ? 'aria-current="page"' : ""
      }>
        ${label}
      </a>
    `;
  }).join("");

  const header = document.getElementById("pageNavigation");

  if (header) {
    header.innerHTML = `
      <header class="page-topbar">
        <a class="page-brand" href="overview.html">
          <img
            src="assets/justice-ai-logo.png"
            alt="Justice AI logo"
          >
          <span>
            <strong>JUSTICE<span>AI</span></strong>
            <small>LEGAL INTELLIGENCE</small>
          </span>
        </a>

        <nav class="page-nav" aria-label="Main navigation">
          ${navHTML}

          <a href="#" class="page-signout" id="pageSignout">
            Sign out ↗
          </a>
        </nav>
      </header>
    `;
  }

  // Sign out
  const signout = document.getElementById("pageSignout");

  if (signout) {
    signout.addEventListener("click", event => {
      event.preventDefault();

      sessionStorage.removeItem("justice_ai_token");
      localStorage.removeItem("justice_ai_token");

      location.replace("login.html");
    });
  }

  // Load account information
  const emailNode = document.getElementById("settingsEmail");

  if (emailNode) {
    emailNode.textContent = "Loading account…";
  }

  async function fetchJSON(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    if (response.status === 401) {
      sessionStorage.removeItem("justice_ai_token");
      localStorage.removeItem("justice_ai_token");

      location.replace("login.html");

      throw new Error("Your session expired. Please sign in again.");
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.detail || data.message || "Request failed."
      );
    }

    return data;
  }

  async function loadAccount() {
    try {
      const user = await fetchJSON("/api/auth/me");

      document.querySelectorAll("[data-user-email]").forEach(node => {
        node.textContent = user.email || "Signed-in user";
      });

      if (emailNode) {
        emailNode.textContent = user.email || "Signed-in user";
      }
    } catch (error) {
      if (emailNode) {
        emailNode.textContent = error.message;
      }
    }
  }

  // Load document history
  async function loadHistory() {
    const tbody = document.getElementById("historyRows");
    const message = document.getElementById("historyMessage");

    if (!tbody) return;

    if (message) {
      message.textContent = "";
      message.classList.remove("error", "success");
    }

    tbody.innerHTML = `
      <tr>
        <td colspan="4">Loading saved documents…</td>
      </tr>
    `;

    try {
      const documents = await fetchJSON("/api/documents");

      if (!Array.isArray(documents) || documents.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4">
              No saved documents yet. Start with New Analysis.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = documents.map(doc => `
        <tr>
          <td>
            <strong>
              ${escapeHTML(doc.filename || "Untitled document")}
            </strong>
          </td>

          <td>${escapeHTML(formatDate(doc.created_at))}</td>

          <td>${escapeHTML(doc.status || "Saved")}</td>

          <td>
            <div
              class="history-actions"
              style="
                display:flex;
                gap:8px;
                flex-wrap:wrap;
                align-items:center;
              "
            >
              <button
                type="button"
                data-open-document="${escapeHTML(doc.id)}"
              >
                Open report
              </button>

              <button
                type="button"
                data-delete-document="${escapeHTML(doc.id)}"
                style="
                  background:#fff1ef;
                  color:#a52a2a;
                  border:1px solid #e8b7b1;
                  border-radius:6px;
                  padding:8px 12px;
                  cursor:pointer;
                "
              >
                Delete
              </button>
            </div>
          </td>
        </tr>
      `).join("");

      // Open a saved report
      tbody.querySelectorAll("[data-open-document]").forEach(button => {
        button.addEventListener("click", () => {
          const id = button.getAttribute("data-open-document");

          location.href =
            `dashboard.html?document_id=${encodeURIComponent(id)}`;
        });
      });

      // Delete a saved document
      tbody.querySelectorAll("[data-delete-document]").forEach(button => {
        button.addEventListener("click", async () => {
          const id = button.getAttribute("data-delete-document");
          const row = button.closest("tr");

          const filename =
            row?.querySelector("td strong")?.textContent ||
            "this document";

          const confirmed = window.confirm(
            `Are you sure you want to permanently delete "${filename}"?\n\n` +
            "The saved analysis and report will be removed. " +
            "This action cannot be undone."
          );

          if (!confirmed) return;

          button.disabled = true;
          button.textContent = "Deleting…";

          if (message) {
            message.textContent = `Deleting "${filename}"…`;
            message.classList.remove("error", "success");
          }

          try {
            await fetchJSON(
              `/api/documents/${encodeURIComponent(id)}`,
              { method: "DELETE" }
            );

            await loadHistory();

            if (message) {
              message.textContent =
                `"${filename}" was deleted successfully.`;

              message.classList.remove("error");
              message.classList.add("success");
            }
          } catch (error) {
            button.disabled = false;
            button.textContent = "Delete";

            if (message) {
              message.textContent =
                `Could not delete "${filename}": ${error.message}`;

              message.classList.remove("success");
              message.classList.add("error");
            }
          }
        });
      });

    } catch (error) {
      if (message) {
        message.textContent = error.message;
        message.classList.add("error");
      }

      tbody.innerHTML = `
        <tr>
          <td colspan="4">Could not load document history.</td>
        </tr>
      `;
    }
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  loadAccount();
  loadHistory();
})();
