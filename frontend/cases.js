
(() => {
  "use strict";

  const API_BASE_URL = (
    window.JUSTICE_AI_CONFIG?.API_BASE_URL ||
    window.API_BASE_URL ||
    "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");

  const $ = (id) => document.getElementById(id);

  const form = $("caseForm");
  const titleInput = $("caseTitle");
  const typeInput = $("caseType");
  const descriptionInput = $("caseDescription");
  const createButton = $("createCaseButton");
  const totalElement = $("totalCases");
  const openElement = $("openCases");
  const progressElement = $("inProgressCases");
  const closedElement = $("closedCases");
  const caseList = $("caseList");
  const listStatus = $("listStatus");
  const formStatus = $("formStatus");
  const refreshButton = $("refreshCases");
  const searchInput = $("caseSearch");
  const statusFilter = $("statusFilter");
  const resultsCount = $("resultsCount");

  let busy = false;
  let casesCache = [];
  let loading = false;

  function getToken() {
    return (
      sessionStorage.getItem("justice_ai_token") ||
      localStorage.getItem("justice_ai_token") ||
      ""
    );
  }

  async function apiRequest(path, options = {}) {
    const token = getToken();

    if (!token) {
      window.location.replace("login.html");
      throw new Error("Please log in again.");
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    };

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      sessionStorage.removeItem("justice_ai_token");
      localStorage.removeItem("justice_ai_token");
      window.location.replace("login.html");

      throw new Error("Your session expired. Please log in again.");
    }

    if (!response.ok) {
      let message = `Request failed (${response.status}).`;

      if (typeof data.detail === "string") {
        message = data.detail;
      } else if (Array.isArray(data.detail)) {
        message = data.detail
          .map(item => item.msg || "Invalid input")
          .join(". ");
      } else if (typeof data.message === "string") {
        message = data.message;
      }

      throw new Error(message);
    }

    return data;
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = String(text);
    }

    return element;
  }

  function formatDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function getCaseId(item) {
    return item.case_id ||
      `CASE-${String(item.id).padStart(6, "0")}`;
  }

  function getStatusClass(status) {
    if (status === "Closed") return "closed";
    if (status === "In Progress") return "in-progress";
    return "";
  }

  function updateSummary(cases) {
    totalElement.textContent = String(cases.length);

    openElement.textContent = String(
      cases.filter(item => item.status === "Open").length
    );

    progressElement.textContent = String(
      cases.filter(item => item.status === "In Progress").length
    );

    closedElement.textContent = String(
      cases.filter(item => item.status === "Closed").length
    );
  }

  function getFilteredCases() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedStatus = statusFilter.value;

    return casesCache.filter(item => {
      const searchableText = [
        getCaseId(item),
        item.title,
        item.case_type,
        item.description,
        item.status
      ].join(" ").toLowerCase();

      const matchesSearch = !query || searchableText.includes(query);
      const matchesStatus =
        selectedStatus === "All" || item.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }

  function renderCases(cases) {
    caseList.replaceChildren();

    const filteredCases = getFilteredCases();

    resultsCount.textContent =
      `Showing ${filteredCases.length} of ${cases.length} case` +
      `${cases.length === 1 ? "" : "s"}`;

    if (filteredCases.length === 0) {
      const empty = createElement("div", "empty-state");
      const icon = createElement("div", "empty-state-icon", "▣");
      const heading = createElement(
        "h3",
        "",
        cases.length === 0
          ? "Your case register starts here"
          : "No matching cases"
      );

      const description = createElement(
        "p",
        "",
        cases.length === 0
          ? "Create your first case to keep its details and progress organised in one place."
          : "Try another search term or change the status filter."
      );

      empty.append(icon, heading, description);

      if (cases.length === 0) {
        const createLink = createElement(
          "a",
          "primary-button",
          "＋ Register your first case"
        );

        createLink.href = "#createCaseSection";
        empty.appendChild(createLink);
      } else {
        const clearButton = createElement(
          "button",
          "secondary-button",
          "Clear search and filters"
        );

        clearButton.type = "button";
        clearButton.addEventListener("click", () => {
          searchInput.value = "";
          statusFilter.value = "All";
          renderCases(casesCache);
        });

        empty.appendChild(clearButton);
      }

      caseList.appendChild(empty);
      return;
    }

    for (const item of filteredCases) {
      const card = createElement("article", "case-card");
      const top = createElement("div", "case-card-top");
      const info = createElement("div", "case-card-info");

      const caseId = createElement(
        "div",
        "case-id",
        getCaseId(item)
      );

      const title = createElement(
        "h3",
        "case-title",
        item.title || "Untitled case"
      );

      const meta = createElement("div", "case-meta");

      meta.appendChild(
        createElement(
          "span",
          "case-type-badge",
          item.case_type || "General"
        )
      );

      meta.appendChild(
        createElement(
          "span",
          `status-badge ${getStatusClass(item.status)}`,
          item.status || "Open"
        )
      );

      meta.appendChild(
        createElement(
          "span",
          "case-created",
          `Created ${formatDate(item.created_at)}`
        )
      );

      info.append(caseId, title, meta);
      top.appendChild(info);
      card.appendChild(top);

      if (item.description) {
        card.appendChild(
          createElement(
            "p",
            "case-description",
            item.description
          )
        );
      }

      const actions = createElement("div", "case-actions");

      const statusButton = createElement(
        "button",
        "secondary-button",
        "↻ Update status"
      );

      statusButton.type = "button";
      statusButton.addEventListener("click", () => changeStatus(item));

      const deleteButton = createElement(
        "button",
        "delete-button",
        "Delete case"
      );

      deleteButton.type = "button";
      deleteButton.addEventListener("click", () => deleteCase(item));

      actions.append(statusButton, deleteButton);
      card.appendChild(actions);
      caseList.appendChild(card);
    }
  }

  async function loadCases() {
    if (loading) return;

    loading = true;
    listStatus.textContent = "Loading your cases…";
    listStatus.classList.remove("error-text");
    refreshButton.disabled = true;

    try {
      const data = await apiRequest("/api/cases");

      // Support either a direct array or an object containing cases.
      let cases;

      if (Array.isArray(data)) {
        cases = data;
      } else if (Array.isArray(data.cases)) {
        cases = data.cases;
      } else if (Array.isArray(data.items)) {
        cases = data.items;
      } else {
        throw new Error(
          "The server response did not contain a case list."
        );
      }

      casesCache = cases;
      updateSummary(cases);
      renderCases(cases);

      listStatus.textContent =
        `${cases.length} case${cases.length === 1 ? "" : "s"} loaded.`;
    } catch (error) {
      listStatus.textContent =
        `Could not load cases: ${error.message}`;

      listStatus.classList.add("error-text");
    } finally {
      loading = false;
      refreshButton.disabled = false;
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (busy) return;

    const title = titleInput.value.trim();

    formStatus.classList.remove("error", "success");

    if (!title) {
      formStatus.textContent = "Please enter a case title.";
      formStatus.classList.add("error");
      titleInput.focus();
      return;
    }

    busy = true;
    createButton.disabled = true;
    formStatus.textContent = "Creating your case…";

    try {
      const created = await apiRequest("/api/cases", {
        method: "POST",
        body: JSON.stringify({
          title,
          case_type: typeInput.value,
          description: descriptionInput.value.trim()
        })
      });

      form.reset();

      formStatus.textContent =
        `Case created successfully: ${getCaseId(created)}.`;

      formStatus.classList.add("success");

      searchInput.value = "";
      statusFilter.value = "All";

      await loadCases();
    } catch (error) {
      formStatus.textContent =
        `Could not create case: ${error.message}`;

      formStatus.classList.add("error");
    } finally {
      busy = false;
      createButton.disabled = false;
    }
  });

  async function changeStatus(item) {
    const statuses = ["Open", "In Progress", "Closed"];
    const currentIndex = statuses.indexOf(item.status);
    const nextStatus = statuses[
      (currentIndex + 1) % statuses.length
    ];

    const confirmed = window.confirm(
      `Change ${getCaseId(item)}'s status from ` +
      `"${item.status || "Open"}" to "${nextStatus}"?`
    );

    if (!confirmed) return;

    listStatus.classList.remove("error-text");
    listStatus.textContent = `Updating ${getCaseId(item)}…`;

    try {
      await apiRequest(
        `/api/cases/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus })
        }
      );

      listStatus.textContent =
        `${getCaseId(item)} updated to ${nextStatus}.`;

      await loadCases();
    } catch (error) {
      listStatus.textContent =
        `Could not update case: ${error.message}`;

      listStatus.classList.add("error-text");
    }
  }

  async function deleteCase(item) {
    const confirmed = window.confirm(
      `Permanently delete ${getCaseId(item)} — ` +
      `"${item.title}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    listStatus.classList.remove("error-text");
    listStatus.textContent = `Deleting ${getCaseId(item)}…`;

    try {
      await apiRequest(
        `/api/cases/${encodeURIComponent(item.id)}`,
        { method: "DELETE" }
      );

      listStatus.textContent = `${getCaseId(item)} deleted.`;

      await loadCases();
    } catch (error) {
      listStatus.textContent =
        `Could not delete case: ${error.message}`;

      listStatus.classList.add("error-text");
    }
  }

  searchInput.addEventListener("input", () => {
    renderCases(casesCache);
  });

  statusFilter.addEventListener("change", () => {
    renderCases(casesCache);
  });

  refreshButton.addEventListener("click", loadCases);

  if (getToken()) {
    loadCases();
  } else {
    window.location.replace("login.html");
  }
})();
