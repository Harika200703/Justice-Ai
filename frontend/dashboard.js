(() => {
  "use strict";

  const config = window.JUSTICE_AI_CONFIG || {};
  const API = (
    config.API_BASE_URL || "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");

  const TOKEN_KEY = "justice_ai_token";
  const token =
    sessionStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem(TOKEN_KEY);

  const resultArea = document.getElementById("resultArea");
  const uploadSection = document.getElementById("uploadSection");
  const reportSection = document.getElementById("reportSection");
  const message = document.getElementById("analysisMessage");
  const analyzeButton = document.getElementById("analyzeButton");
  const analyzeForm = document.getElementById("analyzeForm");
  const documentList = document.getElementById("documentList");
  const pageTitle = document.querySelector(".topbar-title");
  const pageHeading = document.querySelector(".section-intro h1");
  const pageDescription = document.querySelector(".section-intro p");
  const reportHeading = document.querySelector(".report-top h2");

  if (!token) {
    window.location.replace("login.html");
    return;
  }

  if (!resultArea || !reportSection || !uploadSection) {
    console.error("Justice AI: Required dashboard elements were not found.");
    return;
  }

  let reportMessage = document.getElementById("reportMessage");

  if (!reportMessage) {
    reportMessage = document.createElement("p");
    reportMessage.id = "reportMessage";
    reportMessage.setAttribute("role", "status");
    reportMessage.setAttribute("aria-live", "polite");
    reportMessage.style.cssText =
      "display:none;margin:16px 0;padding:12px 15px;" +
      "border-radius:7px;font-size:13px;line-height:1.6;" +
      "overflow-wrap:anywhere;";

    const reportTop = reportSection.querySelector(".report-top");

    if (reportTop) {
      reportTop.insertAdjacentElement("afterend", reportMessage);
    } else {
      reportSection.prepend(reportMessage);
    }
  }

  function setMessage(text, type = "") {
    if (!message) return;

    message.textContent = text;
    message.className = `form-message ${type}`;
  }

  function setReportMessage(text, type = "") {
    reportMessage.textContent = text;
    reportMessage.style.display = text ? "block" : "none";

    if (type === "error") {
      reportMessage.style.color = "#a52a2a";
      reportMessage.style.background = "#fff1ef";
      reportMessage.style.border = "1px solid #e8b7b1";
    } else if (type === "success") {
      reportMessage.style.color = "#17603a";
      reportMessage.style.background = "#edf8f0";
      reportMessage.style.border = "1px solid #c4e5ce";
    } else {
      reportMessage.style.color = "#36516e";
      reportMessage.style.background = "#f2f6fb";
      reportMessage.style.border = "1px solid #dce6f1";
    }
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function displayValue(
    value,
    fallback = "Not identified from available information."
  ) {
    if (Array.isArray(value)) {
      return value.length
        ? `<ul>${value.map(item =>
            `<li>${esc(
              typeof item === "string" ? item : JSON.stringify(item)
            )}</li>`
          ).join("")}</ul>`
        : `<p>${esc(fallback)}</p>`;
    }

    if (value && typeof value === "object") {
      return `<pre>${esc(JSON.stringify(value, null, 2))}</pre>`;
    }

    return `<p>${esc(value || fallback)}</p>`;
  }

  function renderSources(sources) {
    if (!Array.isArray(sources) || !sources.length) {
      return "<p>No source URLs returned. Verify legal claims against official sources.</p>";
    }

    return `<ul>${sources.map(source => {
      const title = esc(source.title || "Legal source");
      const url = String(source.url || "");
      const supports = esc(source.supports || "");

      let link = esc(url || "No URL supplied");

      try {
        const parsed = new URL(url);

        if (
          parsed.protocol === "https:" ||
          parsed.protocol === "http:"
        ) {
          link =
            `<a href="${esc(parsed.href)}" target="_blank" ` +
            `rel="noopener noreferrer">${esc(parsed.href)}</a>`;
        }
      } catch {
        // Invalid URLs are displayed as text.
      }

      return `<li><strong>${title}</strong>: ${link}` +
        `${supports ? ` — ${supports}` : ""}</li>`;
    }).join("")}</ul>`;
  }

  function renderIssue(issue, index) {
  const item = typeof issue === "string"
    ? { title: issue, description: issue }
    : (issue || {});

  const title =
    item.title ||
    item.issue ||
    "Issue requiring review";

  const legalContext =
    item.legal_context ||
    item.implied_acts_sections ||
    item.relevant_laws;

  const evidence = item.evidence;
  const description =
    item.description_analysis ||
    item.description;

  const recommendation = item.recommendation;

  const analysisParts = [
    description,
    evidence ? `Evidence from document: ${evidence}` : "",
    recommendation ? `Recommended next step: ${recommendation}` : ""
  ].filter(Boolean);

  const analysis = analysisParts.length
    ? analysisParts.join("\n\n")
    : "";

  const punishment =
    item.punishments_if_any ||
    item.potential_consequences;

  return `
    <article class="legal-issue">
      <h3>Issue ${index + 1} — ${esc(title)}</h3>

      <section class="issue-detail">
        <h4>Applicable Laws / Legal Context</h4>
        ${displayValue(legalContext)}
      </section>

      <section class="issue-detail">
        <h4>Punishments or Consequences, if Applicable</h4>
        ${displayValue(
          punishment,
          "No specific punishment or consequence was established by the analysis."
        )}
      </section>

      <section class="issue-detail">
        <h4>Description / Analysis</h4>
        ${displayValue(analysis)}
      </section>
    </article>
  `;
}

  function renderReport(report) {
    const r = report || {};
    const hasStructuredIssues =
      Array.isArray(r.issues) && r.issues.length > 0;

    let html = `
      <div class="analysis-output">
        <p><strong>Analysis mode:</strong> ${
          esc(r.analysis_mode || "AI-assisted")
        }</p>

        <header class="dispute-heading">
          <p class="section-eyebrow">DISPUTE ASSESSMENT</p>
          <h2>${esc(r.dispute_title || "Legal Dispute Analysis")}</h2>
          ${r.executive_summary
            ? `<p class="dispute-summary">${esc(r.executive_summary)}</p>`
            : ""}
        </header>

        <section class="report-section">
          <h3>Document Context</h3>
          ${
            r.document_context &&
            typeof r.document_context === "object"
              ? `<div class="document-context-grid">
                  <div class="context-item">
                    <span class="context-label">File name</span>
                    <strong>${esc(
                      r.document_context.filename || "Not provided"
                    )}</strong>
                  </div>
                  <div class="context-item">
                    <span class="context-label">Jurisdiction</span>
                    <strong>${esc(
                      r.document_context.selected_jurisdiction ||
                      r.document_context.state ||
                      "Not specified"
                    )}</strong>
                  </div>
                </div>`
              : `<p>${esc(
                  r.document_context ||
                  "Not identified from available information."
                )}</p>`
          }
        </section>
    `;

    if (hasStructuredIssues) {
      html += `
        <section class="report-section">
          <h2>Issues, Applicable Laws and Analysis</h2>
          <p class="help-text">
            Each issue is assessed separately. Candidate legal provisions
            and punishments must be verified against official sources.
          </p>
          ${r.issues.map((issue, index) =>
            renderIssue(issue, index)
          ).join("")}
        </section>
      `;
    } else {
      html += `
        <section class="report-section">
          <h2>Issues, Applicable Laws and Analysis</h2>
          <p class="help-text">
            This report does not contain structured issue-level analysis.
            The following information may be preliminary or in demo mode.
          </p>
          ${renderIssue({
            issue: "Preliminary issue identification",
            implied_acts_sections: r.relevant_laws,
            punishments_if_any: r.potential_consequences,
            description_analysis: r.key_facts_and_issues
          }, 0)}
        </section>
      `;
    }

    const otherSections = [
  ["Key Findings", r.key_points || r.findings],
  [
    "Constitutional Articles",
    r.constitutional_articles
  ],
  [
    "Rules and Regulations",
    r.rules_and_regulations
  ],
  [
    "Missing Evidence / Information",
    r.missing_evidence || r.missing_information
  ],
  [
    "Suggested Next Steps",
    r.next_steps || r.suggested_actions || r.recommendations
  ],
  [
    "Cautions and Uncertainties",
    r.cautions
  ]
];

    for (const [title, value] of otherSections) {
      html += `
        <section class="report-section">
          <h3>${esc(title)}</h3>
          ${displayValue(value)}
        </section>
      `;
    }

    html += `
        <section class="report-section">
          <h3>Sources to Verify</h3>
          ${renderSources(r.sources)}
        </section>

        <div class="notice">
          ${esc(
            r.disclaimer ||
            "Informational legal research only; not legal advice."
          )}
        </div>
      </div>
    `;

    resultArea.className = "";
    resultArea.innerHTML = html;
  }

  // Blockchain evidence panel with transaction metadata.
  function renderEvidenceIntegrity(documentData) {
    if (!documentData || !documentData.id) return;

    let panel = document.getElementById("evidenceIntegrityPanel");

    if (!panel) {
      panel = document.createElement("section");
      panel.id = "evidenceIntegrityPanel";
      panel.className = "evidence-integrity-panel";

      const caution = reportSection.querySelector(".report-caution");

      if (caution) {
        reportSection.insertBefore(panel, caution);
      } else {
        reportSection.appendChild(panel);
      }
    }

    const documentId = String(documentData.id);
    const hash = documentData.sha256_hash || "";
    const txHash = documentData.blockchain_tx_hash || "";
    const initialBlockchain = documentData.blockchain || {};

    panel.innerHTML = `
      <div class="evidence-heading">
        <div>
          <span class="section-kicker">BLOCKCHAIN EVIDENCE</span>
          <h3>Evidence integrity</h3>
          <p>
            Verify the document fingerprint and its registration
            on the configured blockchain.
          </p>
        </div>
        <span class="evidence-icon" aria-hidden="true">◇</span>
      </div>

      <div class="evidence-field">
        <span class="evidence-label">SHA-256 document fingerprint</span>
        <code class="evidence-hash" id="evidenceSha256">${
          esc(hash || "Fingerprint unavailable")
        }</code>
        <button
          type="button"
          class="evidence-button evidence-button-light"
          id="copyEvidenceHash"
          ${hash ? "" : "disabled"}
        >Copy SHA-256</button>
      </div>

      <div class="evidence-status-grid">
        <div class="evidence-status-card">
          <span class="evidence-label">Registration status</span>
          <strong id="evidenceRegistrationStatus">${
            esc(
              txHash
                ? "Transaction recorded"
                : "Not confirmed yet"
            )
          }</strong>
        </div>

        <div class="evidence-status-card">
          <span class="evidence-label">Integrity status</span>
          <strong id="evidenceVerificationStatus">${
            esc(
              initialBlockchain.checked && initialBlockchain.matches
                ? "Fingerprint found on-chain"
                : "Not checked yet"
            )
          }</strong>
        </div>
      </div>

      <div class="evidence-field">
        <span class="evidence-label">Blockchain transaction hash</span>
        <code class="evidence-hash" id="evidenceTxHash">${
          esc(
            txHash ||
            initialBlockchain.transaction_hash ||
            "No transaction hash available yet"
          )
        }</code>
        <button
          type="button"
          class="evidence-button evidence-button-light"
          id="copyEvidenceTx"
          ${
            txHash || initialBlockchain.transaction_hash
              ? ""
              : "disabled"
          }
        >Copy transaction hash</button>
      </div>

      <div class="evidence-status-grid">
        <div class="evidence-status-card">
          <span class="evidence-label">Block number</span>
          <strong id="evidenceBlockNumber">${
            esc(
              initialBlockchain.block_number != null
                ? initialBlockchain.block_number
                : "Available after lookup"
            )
          }</strong>
        </div>

        <div class="evidence-status-card">
          <span class="evidence-label">Registration time (UTC)</span>
          <strong id="evidenceRegisteredAt">${
            esc(
              initialBlockchain.registered_at_utc ||
              "Available after lookup"
            )
          }</strong>
        </div>
      </div>

      <div class="evidence-field">
        <span class="evidence-label">Registering wallet</span>
        <code class="evidence-hash" id="evidenceRegisteredBy">${
          esc(
            initialBlockchain.registered_by ||
            "Available after lookup"
          )
        }</code>
      </div>

      <div class="evidence-actions">
        <button
          type="button"
          class="evidence-button evidence-button-primary"
          id="registerEvidenceButton"
          ${hash ? "" : "disabled"}
        >Register Evidence</button>

        <button
          type="button"
          class="evidence-button evidence-button-secondary"
          id="verifyEvidenceButton"
        >Verify Integrity</button>
      </div>

      <p
        class="evidence-message"
        id="evidenceIntegrityMessage"
        role="status"
        aria-live="polite"
      ></p>

      <p class="evidence-disclaimer">
        A matching fingerprint supports file-integrity checking.
        It does not establish document truth, authorship, origin,
        or legal admissibility.
      </p>
    `;

    const registerButton =
      panel.querySelector("#registerEvidenceButton");
    const verifyButton =
      panel.querySelector("#verifyEvidenceButton");
    const copyButton =
      panel.querySelector("#copyEvidenceHash");
    const copyTxButton =
      panel.querySelector("#copyEvidenceTx");
    const status =
      panel.querySelector("#evidenceRegistrationStatus");
    const verification =
      panel.querySelector("#evidenceVerificationStatus");
    const txElement =
      panel.querySelector("#evidenceTxHash");
    const blockElement =
      panel.querySelector("#evidenceBlockNumber");
    const timeElement =
      panel.querySelector("#evidenceRegisteredAt");
    const walletElement =
      panel.querySelector("#evidenceRegisteredBy");
    const messageElement =
      panel.querySelector("#evidenceIntegrityMessage");

    function showEvidenceMessage(text, type = "") {
      messageElement.textContent = text;
      messageElement.className = `evidence-message ${type}`;
    }

    async function copyText(value, successText) {
      if (!value) return;

      try {
        await navigator.clipboard.writeText(value);
        showEvidenceMessage(successText, "success");
      } catch {
        showEvidenceMessage(
          "Clipboard access was blocked. Select and copy the value manually.",
          "error"
        );
      }
    }

    function updateMetadata(result) {
      const chain = result.blockchain || result;

      if (chain.transaction_hash) {
        txElement.textContent = chain.transaction_hash;
        copyTxButton.disabled = false;
      }

      if (result.blockchain_tx_hash) {
        txElement.textContent = result.blockchain_tx_hash;
        copyTxButton.disabled = false;
      }

      if (chain.block_number != null) {
        blockElement.textContent = String(chain.block_number);
      }

      if (chain.registered_at_utc) {
        timeElement.textContent = chain.registered_at_utc;
      } else if (chain.registered_at != null) {
        const timestamp = Number(chain.registered_at);

        if (Number.isFinite(timestamp)) {
          timeElement.textContent =
            new Date(timestamp * 1000).toISOString();
        }
      }

      if (chain.registered_by) {
        walletElement.textContent = chain.registered_by;
      }
    }

    async function refreshVerification() {
      const result = await fetchJSON(
        `/api/documents/${encodeURIComponent(documentId)}/verify-integrity`,
        { method: "POST" }
      );

      const chain = result.blockchain || {};
      updateMetadata(result);

      const localMatches =
        result.local_sha256_matches === true;
      const chainMatches =
        chain.checked === true && chain.matches === true;

      if (chainMatches) {
        status.textContent = "Registered on-chain";
      } else if (
        chain.checked === true &&
        chain.matches === false
      ) {
        status.textContent = "Not registered on-chain";
      } else {
        status.textContent = "Blockchain status unavailable";
      }

      if (!localMatches) {
        verification.textContent = "Local file mismatch";

        showEvidenceMessage(
          "Warning: the stored file does not match its saved SHA-256 fingerprint.",
          "error"
        );
      } else if (chainMatches) {
        verification.textContent = "Fingerprint found on-chain";

        showEvidenceMessage(
          "Verified: the local file matches its saved fingerprint, and that fingerprint is registered on the blockchain.",
          "success"
        );
      } else if (
        chain.checked === true &&
        chain.matches === false
      ) {
        verification.textContent = "Fingerprint not found on-chain";

        showEvidenceMessage(
          chain.reason ||
            "The fingerprint was not found on the configured blockchain.",
          "error"
        );
      } else {
        verification.textContent = "Blockchain check unavailable";

        showEvidenceMessage(
          chain.reason ||
            "The local fingerprint was checked, but blockchain verification could not be completed.",
          "error"
        );
      }

      return result;
    }

    if (copyButton) {
      copyButton.addEventListener("click", () => {
        copyText(hash, "SHA-256 fingerprint copied.");
      });
    }

    if (copyTxButton) {
      copyTxButton.addEventListener("click", () => {
        const transactionHash = txElement.textContent.trim();

        if (
          !transactionHash ||
          transactionHash === "No transaction hash available yet"
        ) {
          return;
        }

        copyText(transactionHash, "Transaction hash copied.");
      });
    }

    registerButton.addEventListener("click", async () => {
      registerButton.disabled = true;
      registerButton.textContent = "Registering…";

      showEvidenceMessage("Checking blockchain registration…");

      try {
        const result = await fetchJSON(
          `/api/documents/${encodeURIComponent(documentId)}/register-evidence`,
          { method: "POST" }
        );

        updateMetadata(result);

        if (result.registered) {
          status.textContent = "Registered successfully";

          showEvidenceMessage(
            "Evidence registered successfully. Retrieving transaction details…",
            "success"
          );
        } else if (result.already_registered) {
          status.textContent = "Already registered";

          showEvidenceMessage(
            "This fingerprint already exists on-chain. Retrieving its registration details…",
            "info"
          );
        } else {
          showEvidenceMessage(
            result.reason || "Evidence registration was not completed.",
            "error"
          );
          return;
        }

        // Retrieve the existing transaction details as well.
        await refreshVerification();
      } catch (error) {
        showEvidenceMessage(
          error.message || "Could not register the evidence.",
          "error"
        );
      } finally {
        registerButton.disabled = false;
        registerButton.textContent = "Register Evidence";
      }
    });

    verifyButton.addEventListener("click", async () => {
      verifyButton.disabled = true;
      verifyButton.textContent = "Verifying…";

      showEvidenceMessage(
        "Checking local file and blockchain integrity…"
      );

      try {
        await refreshVerification();
      } catch (error) {
        showEvidenceMessage(
          error.message || "Verification failed.",
          "error"
        );
      } finally {
        verifyButton.disabled = false;
        verifyButton.textContent = "Verify Integrity";
      }
    });
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
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      window.location.replace("login.html");

      throw new Error("Your session expired. Please sign in again.");
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.detail ||
        data.message ||
        `Request failed (${response.status}).`
      );
    }

    return data;
  }

  async function loadMe() {
    try {
      const user = await fetchJSON("/api/auth/me");
      const userEmail = document.getElementById("userEmail");

      if (userEmail) {
        userEmail.textContent = user.email || "Signed-in user";
      }
    } catch (error) {
      console.error("Could not load user details:", error);
    }
  }

  async function loadDocuments() {
    if (!documentList) return;

    try {
      const documents = await fetchJSON("/api/documents");

      if (!Array.isArray(documents) || !documents.length) {
        documentList.innerHTML =
          '<p class="help-text">No analyses yet. Saved documents appear here.</p>';
        return;
      }

      documentList.innerHTML = documents.map(document => `
        <div class="document-item">
          <div>
            <strong>${esc(document.filename || "Untitled document")}</strong>
            <span>${esc(document.created_at || "")} · ${
              esc(document.status || "Saved")
            }</span>
          </div>
          <button class="ghost-button" data-id="${esc(document.id)}">
            View
          </button>
        </div>
      `).join("");

      documentList.querySelectorAll("button[data-id]").forEach(button => {
        button.addEventListener("click", () => {
          loadDocument(button.dataset.id);
        });
      });
    } catch (error) {
      documentList.innerHTML =
        `<p class="help-text">${esc(error.message)}</p>`;
    }
  }

  function showReportMode(documentData) {
    uploadSection.hidden = true;
    uploadSection.style.display = "none";

    const filename = documentData.filename || "Saved document";

    if (pageTitle) {
      pageTitle.textContent = "Saved report";
    }

    if (pageHeading) {
      pageHeading.textContent = filename;
    }

    if (pageDescription) {
      pageDescription.textContent =
        "Review the saved legal analysis for this document.";
    }

    if (reportHeading) {
      reportHeading.textContent = "Saved legal analysis report";
    }

    let backButton = document.getElementById("backToHistoryButton");

    if (!backButton) {
      backButton = document.createElement("a");
      backButton.id = "backToHistoryButton";
      backButton.href = "history.html";
      backButton.textContent = "← Back to history";
      backButton.style.cssText =
        "display:inline-flex;align-items:center;justify-content:center;" +
        "gap:8px;margin:0 0 20px;padding:10px 15px;" +
        "border:1px solid #d9e1e9;border-radius:7px;" +
        "background:#fff;color:#102b49;text-decoration:none;" +
        "font-size:13px;font-weight:600;";

      reportSection.insertBefore(backButton, reportSection.firstChild);
    }

    reportSection.scrollIntoView({
      behavior: "auto",
      block: "start"
    });
  }

  async function loadDocument(id) {
    if (!id || !/^\d+$/.test(String(id))) {
      setReportMessage("The document ID in the URL is invalid.", "error");
      return;
    }

    uploadSection.hidden = true;
    uploadSection.style.display = "none";

    resultArea.className = "result-empty";
    resultArea.innerHTML = `
      <div>
        <div class="empty-symbol">…</div>
        <h3>Loading saved report</h3>
        <p>Retrieving the report saved with this document.</p>
      </div>
    `;

    setReportMessage("Loading saved report…");

    reportSection.scrollIntoView({
      behavior: "auto",
      block: "start"
    });

    try {
      const data = await fetchJSON(
        `/api/documents/${encodeURIComponent(id)}`
      );

      if (!data.report || typeof data.report !== "object") {
        throw new Error(
          "This saved document does not contain a readable analysis report."
        );
      }

      renderReport(data.report);
      renderEvidenceIntegrity(data);
      showReportMode(data);

      setReportMessage(
        `Loaded saved report: ${data.filename || "Untitled document"}. ` +
        "This is the previously saved analysis; no new analysis was run.",
        "success"
      );

      document.title = `${data.filename || "Saved Report"} | Justice AI`;
    } catch (error) {
      resultArea.className = "result-empty";

      resultArea.innerHTML = `
        <div>
          <div class="empty-symbol">!</div>
          <h3>Could not open saved report</h3>
          <p>${esc(error.message)}</p>
          <p>
            Return to Document History and try opening the document again.
          </p>
        </div>
      `;

      setReportMessage(error.message, "error");
    }
  }

  // Handle a fresh analysis submission.
  if (analyzeForm) {
    analyzeForm.addEventListener("submit", async event => {
      event.preventDefault();

      const fileInput = document.getElementById("documentFile");
      const file = fileInput?.files?.[0];

      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "state",
        document.getElementById("state")?.value || "Not specified"
      );

      analyzeButton.disabled = true;

      const buttonText = analyzeButton.querySelector(
        ".button-copy strong"
      );

      if (buttonText) {
        buttonText.textContent = "Analysing document";
      }

      resultArea.className = "result-empty";

      resultArea.innerHTML = `
        <div>
          <div class="empty-symbol">…</div>
          <h3>Reviewing your document</h3>
          <p>Extracting text and preparing the report.</p>
        </div>
      `;

      setMessage("Please keep this page open while analysis runs.");
      setReportMessage("");

      try {
        const data = await fetchJSON("/api/documents/analyze", {
          method: "POST",
          body: formData
        });

        const report = data.report || data;

        renderReport(report);
        renderEvidenceIntegrity(data);

        setMessage(
          report.analysis_mode === "demo"
            ? "Document saved, but this is a demo report—not real legal analysis."
            : "Analysis complete. Verify legal provisions and sources.",
          "success"
        );

        setReportMessage(
          "New analysis completed and the report was saved.",
          "success"
        );

        await loadDocuments();
      } catch (error) {
        resultArea.className = "result-empty";

        resultArea.innerHTML = `
          <div>
            <div class="empty-symbol">!</div>
            <h3>Could not complete analysis</h3>
            <p>${esc(error.message)}</p>
          </div>
        `;

        setMessage("Check the backend terminal for details.", "error");
      } finally {
        analyzeButton.disabled = false;

        if (buttonText) {
          buttonText.textContent = "Analyse document";
        }
      }
    });
  }

  const logoutButton = document.getElementById("logoutButton");

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = "login.html";
    });
  }

  loadMe();
  loadDocuments();

  // Automatically open a saved report when linked from history.
  const params = new URLSearchParams(window.location.search);
  const documentId = params.get("document_id");

  if (documentId) {
    loadDocument(documentId);
  }
})();