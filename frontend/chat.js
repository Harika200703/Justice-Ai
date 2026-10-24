
(() => {
  "use strict";

  // ---------------------------------------------------------
  // CONFIGURATION
  // ---------------------------------------------------------

  const API_BASE_URL = (
    window.JUSTICE_AI_CONFIG?.API_BASE_URL ||
    window.API_BASE_URL ||
    "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");

  const $ = (id) => document.getElementById(id);

  const form = $("chatForm");
  const input = $("messageInput");
  const messages = $("messages");
  const welcome = $("welcome");
  const sendButton = $("sendButton");
  const status = $("chatStatus");
  const language = $("language");
  const state = $("state");

  const historyContainer = $("conversationHistory");
  const newChatButton = $("newChatButton");
  const sidebar = $("sidebar");
  const mobileMenu = $("mobileMenu");
  const mobileOverlay = $("mobileOverlay");

  if (
    !form || !input || !messages || !welcome ||
    !sendButton || !status || !language || !state
  ) {
    console.error("Justice AI: required chat elements are missing.");
    return;
  }

  let currentConversationId = null;
  let isSending = false;
  let isLoadingHistory = false;
  let historyItems = [];
  let attachedDocumentId = null;
let attachedDocumentFile = null;
let isUploadingChatDocument = false;

const chatFileInput = document.getElementById("chatFileInput");
const attachChatFile = document.getElementById("attachChatFile");
const chatAttachmentPreview = document.getElementById(
  "chatAttachmentPreview"
);
const chatAttachmentName = document.getElementById(
  "chatAttachmentName"
);
const removeChatAttachment = document.getElementById(
  "removeChatAttachment"
);
const chatUploadStatus = document.getElementById("chatUploadStatus");
  // ---------------------------------------------------------
// DOCUMENT SELECTOR FOR DOCUMENT-AWARE CHAT
// ---------------------------------------------------------

let documentSelect = null;

async function setupDocumentSelector() {
  // Prevent duplicate selectors if initialization runs again.
  if (document.getElementById("chatDocumentSelect")) {
    documentSelect = document.getElementById("chatDocumentSelect");
    return;
  }

  const toolbar = document.createElement("div");

  toolbar.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    flex-wrap: wrap;
  `;

  const label = document.createElement("label");
  label.textContent = "Ask about a document";
  label.htmlFor = "chatDocumentSelect";

  label.style.cssText = `
    font-size: 13px;
    font-weight: 600;
  `;

  const select = document.createElement("select");
  select.id = "chatDocumentSelect";

  select.style.cssText = `
    max-width: 100%;
    min-width: 220px;
    padding: 10px 12px;
    border: 1px solid #b9b2a5;
    border-radius: 8px;
    background: var(--surface, #ffffff);
    color: var(--text-primary, #222222);
    font: inherit;
  `;

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "General legal questions";

  select.appendChild(defaultOption);

  toolbar.append(label, select);

  // Place the selector immediately above the chat form.
  if (!form.parentElement) {
    console.error("Chat form has no parent element.");
    return;
  }

  form.parentElement.insertBefore(toolbar, form);

  documentSelect = select;

  try {
    select.disabled = true;
    defaultOption.textContent = "Loading your documents...";

    const documents = await apiRequest("/api/documents");

    if (!Array.isArray(documents)) {
      throw new Error("The document API did not return a list.");
    }

    defaultOption.textContent =
      "General legal questions";

    for (const doc of documents) {
      if (doc.id == null) continue;

      const option = document.createElement("option");

      option.value = String(doc.id);
      option.textContent =
        `${doc.filename || "Untitled document"} (ID: ${doc.id})`;

      select.appendChild(option);
    }

    if (documents.length === 0) {
      defaultOption.textContent =
        "No uploaded documents — general chat";
    }
  } catch (error) {
    console.error(
      "Could not load documents for chat:",
      error
    );

    defaultOption.textContent =
      "Documents unavailable — general chat";
  } finally {
    select.disabled = false;
  }
}
  // ---------------------------------------------------------
  // AUTHENTICATION AND API HELPERS
  // ---------------------------------------------------------

  function getToken() {
    const keys = [
      "justice_ai_token",
      "access_token",
      "token"
    ];

    for (const storage of [localStorage, sessionStorage]) {
      for (const key of keys) {
        const value = storage.getItem(key);
        if (value) return value;
      }
    }

    return "";
  }

  async function apiRequest(path, options = {}) {
    const token = getToken();

    if (!token) {
      throw new Error(
        "Your login session was not found. Please log in again."
      );
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

    if (response.status === 204) {
      if (!response.ok) {
        throw new Error("The request could not be completed.");
      }
      return null;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Your session may have expired. Please log in again."
        );
      }

      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : `Request failed with status ${response.status}.`
      );
    }

    return data;
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function setBusy(busy) {
    sendButton.disabled = busy;
    input.disabled = busy;
    isSending = busy;
  }

  function scrollToLatest() {
    requestAnimationFrame(() => {
      const conversation = $("conversation");

      if (conversation) {
        conversation.scrollTop = conversation.scrollHeight;
      }
    });
  }

  // ---------------------------------------------------------
  // MOBILE SIDEBAR
  // ---------------------------------------------------------

  function closeMobileMenu() {
    sidebar?.classList.remove("sidebar-open");
    mobileOverlay?.classList.remove("active");
    mobileMenu?.setAttribute("aria-expanded", "false");
  }

  mobileMenu?.addEventListener("click", () => {
    const isOpen = sidebar?.classList.contains("sidebar-open");

    if (isOpen) {
      closeMobileMenu();
    } else {
      sidebar?.classList.add("sidebar-open");
      mobileOverlay?.classList.add("active");
      mobileMenu?.setAttribute("aria-expanded", "true");
    }
  });

  mobileOverlay?.addEventListener("click", closeMobileMenu);

  document.querySelectorAll(".sidebar-nav a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });

  // ---------------------------------------------------------
  // SAFE MARKDOWN RENDERING
  // ---------------------------------------------------------

  function renderMarkdown(element, content) {
    const text = typeof content === "string" ? content : "";

    if (window.marked && window.DOMPurify) {
      const html = window.marked.parse(text, {
        breaks: true,
        gfm: true
      });

      element.innerHTML = window.DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true }
      });
    } else {
      element.textContent = text;
    }

    // Only allow HTTP and HTTPS links in rendered answers.
    element.querySelectorAll("a").forEach((link) => {
      try {
        const url = new URL(link.getAttribute("href"), location.href);

        if (!["http:", "https:"].includes(url.protocol)) {
          link.replaceWith(document.createTextNode(link.textContent));
          return;
        }

        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      } catch {
        link.replaceWith(document.createTextNode(link.textContent));
      }
    });
  }

  // ---------------------------------------------------------
  // COPY ANSWER
  // ---------------------------------------------------------

  async function copyAnswer(text, button) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");

        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        area.setAttribute("readonly", "");

        document.body.appendChild(area);
        area.select();

        const copied = document.execCommand("copy");
        area.remove();

        if (!copied) {
          throw new Error("Copy failed");
        }
      }

      const previous = button.textContent;

      button.textContent = "✓ Copied";
      button.disabled = true;

      window.setTimeout(() => {
        button.textContent = previous;
        button.disabled = false;
      }, 1400);
    } catch {
      setStatus(
        "Copy failed. Please select and copy the answer manually.",
        true
      );
    }
  }

  // ---------------------------------------------------------
  // RETRIEVED LEGAL SOURCE LINKS
  // ---------------------------------------------------------

  function createSources(sources) {
    if (!Array.isArray(sources) || sources.length === 0) {
      return null;
    }

    const validSources = [];
    const seenUrls = new Set();

    sources.forEach((source) => {
      if (
        !source ||
        typeof source.title !== "string" ||
        typeof source.url !== "string"
      ) {
        return;
      }

      try {
        const url = new URL(source.url);

        if (url.protocol !== "https:") return;
        if (seenUrls.has(url.href)) return;

        seenUrls.add(url.href);

        validSources.push({
          title: source.title,
          url: url.href
        });
      } catch {
        // Ignore malformed URLs.
      }
    });

    if (validSources.length === 0) {
      return null;
    }

    const section = document.createElement("section");
    section.className = "source-list";

    const heading = document.createElement("div");
    heading.className = "source-heading";

    const symbol = document.createElement("span");
    symbol.textContent = "§";

    const title = document.createElement("span");
    title.textContent = "Sources retrieved for this question";

    heading.append(symbol, title);

    const linkContainer = document.createElement("div");
    linkContainer.className = "source-links";

    validSources.forEach((source, index) => {
      const link = document.createElement("a");

      link.className = "source-link";
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const label = document.createElement("span");
      label.textContent = `[Source ${index + 1}] ${source.title}`;

      const arrow = document.createElement("span");
      arrow.textContent = "↗";

      link.append(label, arrow);
      linkContainer.appendChild(link);
    });

    const note = document.createElement("p");
    note.className = "source-note";
    note.textContent =
      "These links were retrieved for this question. Review the " +
      "original material to confirm the relevant law and its current " +
      "applicability. Retrieved sources do not guarantee that every " +
      "statement in the answer is verified.";

    section.append(heading, linkContainer, note);

    return section;
  }

  // ---------------------------------------------------------
  // RENDER CHAT MESSAGES
  // ---------------------------------------------------------

  function addMessage(role, content, options = {}) {
    const article = document.createElement("article");
    article.className = `message ${role}`;

    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = role === "user" ? "YOU" : "JUSTICE AI";

    const body = document.createElement("div");
    body.className = "message-body";

    
if (role === "assistant") {
  renderMarkdown(body, content);
} else {
  body.textContent = content;

  if (options.attachmentName) {
    const attachment = document.createElement("div");
    attachment.className = "sent-message-attachment";

    const icon = document.createElement("span");
    icon.className = "sent-attachment-icon";
    icon.textContent = "📄";

    const details = document.createElement("div");
    details.className = "sent-attachment-details";

    const filename = document.createElement("span");
    filename.className = "sent-attachment-name";
    filename.textContent = options.attachmentName;

    const label = document.createElement("span");
    label.className = "sent-attachment-label";
    label.textContent = "Attached document";

    details.append(filename, label);
    attachment.append(icon, details);
    body.appendChild(attachment);
  }
}


    article.append(label, body);

    if (role === "assistant") {
      const actions = document.createElement("div");
      actions.className = "message-actions";

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "copy-button";
      copyButton.textContent = "▢  Copy answer";

      copyButton.addEventListener("click", () => {
        copyAnswer(content, copyButton);
      });

      actions.appendChild(copyButton);
      article.appendChild(actions);

      const sourceSection = createSources(options.sources);

      if (sourceSection) {
        article.appendChild(sourceSection);
      }

      if (options.disclaimer) {
        const disclaimer = document.createElement("p");

        disclaimer.className = "answer-disclaimer";
        disclaimer.textContent = options.disclaimer;

        article.appendChild(disclaimer);
      }
    }

    messages.appendChild(article);
    scrollToLatest();

    return article;
  }

  function createLoading() {
    const wrapper = document.createElement("div");

    wrapper.className = "loading-indicator";
    wrapper.setAttribute("role", "status");

    const dots = document.createElement("span");
    dots.className = "loading-dots";

    for (let i = 0; i < 3; i++) {
      dots.appendChild(document.createElement("span"));
    }

    const label = document.createElement("span");
    label.textContent = "Researching legal sources…";

    wrapper.append(dots, label);
    messages.appendChild(wrapper);

    scrollToLatest();

    return wrapper;
  }

  function showConversationView(hasMessages) {
    welcome.hidden = hasMessages;
    messages.hidden = !hasMessages;
  }

  function clearRenderedMessages() {
    messages.replaceChildren();
  }

  // ---------------------------------------------------------
  // CREATE A CONVERSATION
  // ---------------------------------------------------------
  function makeConversationTitle(message) {
  const text = String(message || "").trim().replace(/\s+/g, " ");

  const rules = [
    [/legal risks?|risk assessment/i, "Document Legal Risks"],
    [/summari[sz]e|document review|analyse|analyze/i, "Document Review"],
    [/refund|recover money|return.*money/i, "Money Recovery"],
    [/\bFIR\b|police|register.*complaint/i, "Police & FIR Guidance"],
    [/contract|agreement|clause/i, "Contract Review"],
    [/blockchain|integrity|evidence/i, "Evidence Verification"],
    [/rights|legal options/i, "Legal Rights & Options"]
  ];

  for (const [pattern, title] of rules) {
    if (pattern.test(text)) return title;
  }

  return text.length > 36
    ? text.slice(0, 33).trimEnd() + "..."
    : text || "New Conversation";
}
  async function ensureConversation(initialMessage = "") {
    if (currentConversationId !== null) {
      return currentConversationId;
    }

    const data = await apiRequest("/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        title: makeConversationTitle(initialMessage),
        language: language.value,
        jurisdiction: state.value
      })
    });

    if (!data || data.id == null) {
      throw new Error(
        "The backend did not return a conversation ID."
      );
    }

    currentConversationId = data.id;

    await loadHistory(false);

    return currentConversationId;
  }

  // ---------------------------------------------------------
  // SAVE MESSAGES
  // ---------------------------------------------------------

  async function saveMessage(role, content, options = {}) {
    if (currentConversationId === null) {
      throw new Error("No active conversation to save to.");
    }

    return apiRequest(
      `/api/conversations/${currentConversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          role,
          content,
          sources: options.sources || [],
          disclaimer: options.disclaimer || ""
        })
      }
    );
  }

  // ---------------------------------------------------------
  // LOAD CONVERSATION HISTORY
  // ---------------------------------------------------------

  async function loadHistory(showStatus = true) {
    if (!historyContainer || isLoadingHistory) return;

    isLoadingHistory = true;

    try {
      const data = await apiRequest("/api/conversations");

      historyItems = Array.isArray(data.conversations)
        ? data.conversations
        : [];

      renderHistory();

      if (showStatus) {
        setStatus("Conversation history updated.");
      }
    } catch (error) {
      if (showStatus) {
        setStatus(
          `Could not load conversation history: ${error.message}`,
          true
        );
      }

      renderHistoryError();
    } finally {
      isLoadingHistory = false;
    }
  }

  function renderHistoryError() {
    if (!historyContainer) return;

    historyContainer.replaceChildren();

    const note = document.createElement("p");
    note.className = "history-empty";
    note.textContent = "History unavailable. Refresh to try again.";

    historyContainer.appendChild(note);
  }

  function renderHistory() {
    if (!historyContainer) return;

    historyContainer.replaceChildren();

    if (historyItems.length === 0) {
      const empty = document.createElement("p");

      empty.className = "history-empty";
      empty.textContent = "Your conversations will appear here.";

      historyContainer.appendChild(empty);
      return;
    }

    historyItems.forEach((conversation) => {
      const row = document.createElement("div");

      row.className = "history-row";
      row.style.display = "flex";
      row.style.minWidth = "0";
      row.style.gap = "4px";

      const openButton = document.createElement("button");

      openButton.type = "button";
      openButton.className = "history-item";
      openButton.style.flex = "1";
      openButton.style.minWidth = "0";

      if (
        String(conversation.id) === String(currentConversationId)
      ) {
        openButton.classList.add("selected");
      }

      const title = document.createElement("span");

      title.className = "history-item-title";
      title.textContent = makeConversationTitle(
  conversation.title || "New Conversation"
);

      openButton.appendChild(title);
      openButton.title = title.textContent;

      openButton.addEventListener("click", () => {
        openConversation(conversation.id);
      });

      const deleteButton = document.createElement("button");

      deleteButton.type = "button";
      deleteButton.className = "history-item-delete";
      deleteButton.textContent = "×";
      deleteButton.title = "Delete conversation";
      deleteButton.setAttribute(
        "aria-label",
        `Delete ${title.textContent}`
      );

      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteConversation(conversation.id, title.textContent);
      });

      row.append(openButton, deleteButton);
      historyContainer.appendChild(row);
    });
  }

  // ---------------------------------------------------------
  // OPEN AN EXISTING CONVERSATION
  // ---------------------------------------------------------

  async function openConversation(conversationId) {
    if (isSending) {
      setStatus(
        "Please wait for the current answer to finish.",
        true
      );
      return;
    }

    setStatus("Loading conversation…");

    try {
      const data = await apiRequest(
        `/api/conversations/${conversationId}`
      );

      currentConversationId = data.id;
      clearRenderedMessages();

      const savedMessages = Array.isArray(data.messages)
        ? data.messages
        : [];

      language.value = data.language || "English";
      state.value = data.jurisdiction || "India";

      if (savedMessages.length > 0) {
        showConversationView(true);

        savedMessages.forEach((message) => {
          const role = message.role === "user"
            ? "user"
            : "assistant";

          addMessage(role, message.content || "", {
            sources: message.sources || [],
            disclaimer: message.disclaimer || ""
          });
        });
      } else {
        showConversationView(false);
      }

      renderHistory();
      setStatus("Conversation loaded.");
      closeMobileMenu();
    } catch (error) {
      setStatus(
        `Could not open conversation: ${error.message}`,
        true
      );
    }
  }

  // ---------------------------------------------------------
  // START A NEW CHAT
  // ---------------------------------------------------------

  function startNewChat() {
    if (isSending) {
      setStatus(
        "Wait for the current answer before starting a new chat.",
        true
      );
      return;
    }

    currentConversationId = null;

    clearRenderedMessages();
    showConversationView(false);

    input.value = "";
    input.style.height = "auto";

    renderHistory();

    setStatus(
      "New chat ready. Your conversation will be saved when you send a question."
    );

    closeMobileMenu();
    input.focus();
  }

  newChatButton?.addEventListener("click", startNewChat);

  // ---------------------------------------------------------
  // DELETE A CONVERSATION
  // ---------------------------------------------------------

  async function deleteConversation(conversationId, title) {
    if (isSending) {
      setStatus(
        "Wait for the current answer before deleting a conversation.",
        true
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete "${title}" and its saved messages? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await apiRequest(`/api/conversations/${conversationId}`, {
        method: "DELETE"
      });

      if (
        String(currentConversationId) === String(conversationId)
      ) {
        currentConversationId = null;
        clearRenderedMessages();
        showConversationView(false);
      }

      await loadHistory(false);
      setStatus("Conversation deleted.");
    } catch (error) {
      setStatus(
        `Could not delete conversation: ${error.message}`,
        true
      );
    }
  }
function clearChatAttachment() {
  attachedDocumentId = null;
  attachedDocumentFile = null;

  if (chatFileInput) chatFileInput.value = "";
  if (chatAttachmentPreview) chatAttachmentPreview.hidden = true;
  if (chatAttachmentName) chatAttachmentName.textContent = "";

  if (chatUploadStatus) {
    chatUploadStatus.textContent =
      "Attach a document or ask a general legal question.";
  }

  if (attachChatFile) attachChatFile.disabled = false;
}

if (attachChatFile && chatFileInput) {
  attachChatFile.addEventListener("click", () => {
    if (!isUploadingChatDocument && !isSending) {
      chatFileInput.click();
    }
  });

  chatFileInput.addEventListener("change", async () => {
    const file = chatFileInput.files?.[0];
    if (!file) return;

    const allowedExtensions = [".pdf", ".docx", ".txt"];
    const extension = file.name
      .slice(file.name.lastIndexOf("."))
      .toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      clearChatAttachment();
      if (chatUploadStatus) {
        chatUploadStatus.textContent =
          "Unsupported file. Choose a PDF, DOCX, or TXT file.";
      }
      return;
    }

    const maxBytes = 12 * 1024 * 1024;

    if (file.size > maxBytes) {
      clearChatAttachment();
      if (chatUploadStatus) {
        chatUploadStatus.textContent =
          "The file exceeds 12 MB. Choose a smaller document.";
      }
      return;
    }

    if (file.size === 0) {
      clearChatAttachment();
      if (chatUploadStatus) {
        chatUploadStatus.textContent = "The selected file is empty.";
      }
      return;
    }

    if (!getToken()) {
      clearChatAttachment();
      if (chatUploadStatus) {
        chatUploadStatus.textContent = "Please log in again.";
      }
      return;
    }

    attachedDocumentId = null;
    attachedDocumentFile = file;
    isUploadingChatDocument = true;

    chatAttachmentPreview.hidden = false;
    chatAttachmentName.textContent = file.name;

    attachChatFile.disabled = true;
    chatFileInput.disabled = true;

    if (removeChatAttachment) {
      removeChatAttachment.disabled = true;
    }

    if (chatUploadStatus) {
      chatUploadStatus.textContent =
        "Uploading and analysing document…";
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("state", state?.value || "Not specified");

      const response = await fetch(
        `${API_BASE_URL}/api/documents/analyze`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getToken()}`
          },
          body: formData
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `Upload failed (${response.status}).`
        );
      }

      if (data.id == null) {
        throw new Error(
          "The server did not return a document ID."
        );
      }

      attachedDocumentId = Number(data.id);

      if (!Number.isInteger(attachedDocumentId) ||
          attachedDocumentId <= 0) {
        throw new Error("The server returned an invalid document ID.");
      }

      if (chatUploadStatus) {
        chatUploadStatus.textContent =
          "Document ready. Ask a question about " + file.name;
      }
    } catch (error) {
      attachedDocumentId = null;

      if (chatUploadStatus) {
        chatUploadStatus.textContent =
          `Upload failed: ${error.message}`;
      }

      console.error("Chat document upload failed:", error);
    } finally {
      isUploadingChatDocument = false;
      chatFileInput.disabled = false;
      attachChatFile.disabled = false;

      if (removeChatAttachment) {
        removeChatAttachment.disabled = false;
      }
    }
  });
}

if (removeChatAttachment) {
  removeChatAttachment.addEventListener("click", () => {
    if (isUploadingChatDocument || isSending) return;
    clearChatAttachment();
  });
}
  // ---------------------------------------------------------
  // SEND QUESTION AND SAVE ANSWER
  // ---------------------------------------------------------

  async function sendMessage(rawText) {
    const text = rawText.trim();

if (!text || isSending) return;

if (isUploadingChatDocument) {
  setStatus("Please wait until the document upload and analysis finish.");
  return;
}

    if (!getToken()) {
      setStatus(
        "Please log in first. Your session token was not found.",
        true
      );
      return;
    }

    // Preserve the attachment details for this question.

    // Capture the document BEFORE clearing the composer.
    const questionDocumentId = attachedDocumentId;
    const questionDocumentFile = attachedDocumentFile;

    const questionDocumentName =
      questionDocumentId && questionDocumentFile
        ? questionDocumentFile.name
        : null;

    setBusy(true);
    showConversationView(true);

    // Show the question and its attachment in the user bubble.
    addMessage("user", text, {
      attachmentName: questionDocumentName
    });

    // Remove the document from the composer only.
    // Keep questionDocumentId for the API request.
    clearChatAttachment();

    setStatus("Saving your question…");

    const loading = createLoading();
    let userMessageSaved = false;


    try {
      await ensureConversation(text);

      await saveMessage("user", text);
      userMessageSaved = true;

      setStatus("Researching your question…");

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({
  message: text,
  language: language.value,
  state: state.value,
document_id: questionDocumentId})
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            "Your session may have expired. Please log in again."
          );
        }

        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `The AI request failed (${response.status}).`
        );
      }

      const answer =
        typeof data.answer === "string" && data.answer.trim()
          ? data.answer
          : "The AI provider did not return a readable answer.";

      const sources = Array.isArray(data.sources)
        ? data.sources
        : [];

      const disclaimer =
        typeof data.disclaimer === "string"
          ? data.disclaimer
          : "";

      loading.remove();

      addMessage("assistant", answer, {
        sources,
        disclaimer
      });

      try {
        await saveMessage("assistant", answer, {
          sources,
          disclaimer
        });

        await loadHistory(false);
        setStatus("Answer received and conversation saved.");
      } catch (saveError) {
        setStatus(
          `Answer received, but saving it failed: ${saveError.message}`,
          true
        );
      }
    } catch (error) {
  attachedDocumentId = null;
  attachedDocumentFile = null;

  if (chatFileInput) {
    chatFileInput.value = "";
  }

  if (chatAttachmentPreview) {
    chatAttachmentPreview.hidden = true;
  }

  if (chatAttachmentName) {
    chatAttachmentName.textContent = "";
  }

  if (chatUploadStatus) {
    chatUploadStatus.textContent = `Upload failed: ${error.message}`;
  }

  console.error("Chat document upload failed:", error);
} finally {
      setBusy(false);
      input.focus();
    }
  }

  // ---------------------------------------------------------
  // FORM AND KEYBOARD EVENTS
  // ---------------------------------------------------------

  form.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = input.value.trim();

  if (!text || isSending) return;

  if (isUploadingChatDocument) {
    setStatus("Please wait until the document upload and analysis finish.");
    return;
  }

  input.value = "";
  input.style.height = "auto";

  sendMessage(text);
});

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (!isSending) {
        form.requestSubmit();
      }
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height =
      `${Math.min(input.scrollHeight, 130)}px`;
  });

  // ---------------------------------------------------------
  // SUGGESTED QUESTIONS
  // ---------------------------------------------------------

  document.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => {
      if (isSending) return;

      const question = button.dataset.question;

      if (question) {
        sendMessage(question);
      }
    });
  });

  // ---------------------------------------------------------
  // INITIALIZE
  // ---------------------------------------------------------

  async function initialize() {
  if (!getToken()) {
    setStatus(
      "Please log in to use Justice AI chat history.",
      true
    );
    return;
  }

  await loadHistory(false);
}

initialize();

 
})();
