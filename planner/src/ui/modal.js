// Custom modal component Replaces every native
// confirm() / alert() / prompt() in the app. The whole rationale for
// rolling this by hand instead of using a library is the project's
// "zero dependencies" rule and the modest API surface — three call
// shapes (showModal, showModalAlert, showModalPrompt) cover every
// existing dialog in the codebase.
//
// The DOM container is created on first invocation and reused. Only
// one modal is open at a time; calling showModal while one is open
// implicitly cancels the previous one (calls its onCancel) and
// replaces it.
//
// Pure-helper testability: the rendering helpers (buildModalHtml,
// buildPromptHtml) are exported separately for unit tests; the
// imperative show* functions touch the DOM directly and are exercised
// in the manual walkthrough.

// --- Pure: HTML builders ------------------------------------------

export function buildModalHtml({ title, body, buttons }) {
  const buttonHtml = (buttons || []).map((b, i) => {
    const cls = "mdl-btn mdl-btn-" + (b.style === "primary" ? "primary" :
                                       b.style === "danger" ? "danger" : "secondary");
    return `<button type="button" class="${cls}" data-mdl-button="${i}">${escHtml(b.label)}</button>`;
  }).join("");
  return `<div class="mdl-card" role="dialog" aria-modal="true" aria-labelledby="mdl-title">
    <h2 class="mdl-title" id="mdl-title">${escHtml(title || "")}</h2>
    <div class="mdl-body">${bodyHtml(body)}</div>
    <div class="mdl-footer">${buttonHtml}</div>
  </div>`;
}

export function buildPromptHtml({ title, body, defaultValue, placeholder, confirmLabel, cancelLabel }) {
  // body can be a plain string OR { html: '...' } for inline markup
  // (e.g., the "type DELETE to confirm" flow's bullet list).
  const hasBody = body != null && body !== "";
  return `<div class="mdl-card" role="dialog" aria-modal="true" aria-labelledby="mdl-title">
    <h2 class="mdl-title" id="mdl-title">${escHtml(title || "")}</h2>
    ${hasBody ? `<div class="mdl-body">${bodyHtml(body)}</div>` : ""}
    <div class="mdl-input-row">
      <input type="text" class="mdl-input" id="mdl-input"
             value="${escHtml(defaultValue || "")}"
             placeholder="${escHtml(placeholder || "")}" />
    </div>
    <div class="mdl-footer">
      <button type="button" class="mdl-btn mdl-btn-secondary" data-mdl-button="cancel">${escHtml(cancelLabel || "Cancel")}</button>
      <button type="button" class="mdl-btn mdl-btn-primary" data-mdl-button="confirm">${escHtml(confirmLabel || "Confirm")}</button>
    </div>
  </div>`;
}

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// `body` accepts either a plain string (escaped + line-broken) or
// pre-built HTML when the caller passes { html: '...' }. The HTML
// path is the rare exception — used for warnings that need bold/em.
function bodyHtml(body) {
  if (body == null) return "";
  if (typeof body === "string") {
    return body.split(/\n\n+/).map((p) => `<p>${escHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  }
  if (typeof body === "object" && typeof body.html === "string") return body.html;
  return escHtml(String(body));
}

// --- Imperative: DOM mounting and event wiring --------------------

let _backdrop = null;
let _activeOnCancel = null;
let _keydownHandler = null;
let _backdropClickHandler = null;

function _ensureBackdrop() {
  if (_backdrop) return _backdrop;
  _backdrop = document.createElement("div");
  _backdrop.className = "mdl-backdrop";
  _backdrop.setAttribute("hidden", "");
  document.body.appendChild(_backdrop);
  _backdropClickHandler = (e) => {
    if (e.target === _backdrop) _cancelActive();
  };
  _backdrop.addEventListener("click", _backdropClickHandler);
  _keydownHandler = (e) => {
    if (e.key === "Escape" && !_backdrop.hasAttribute("hidden")) _cancelActive();
  };
  document.addEventListener("keydown", _keydownHandler);
  return _backdrop;
}

function _cancelActive() {
  if (_activeOnCancel) {
    const fn = _activeOnCancel;
    _activeOnCancel = null;
    try { fn(); } catch (e) { console.error("modal cancel handler:", e); }
  }
  hideModal();
}

export function hideModal() {
  if (!_backdrop) return;
  _backdrop.setAttribute("hidden", "");
  _backdrop.innerHTML = "";
  _activeOnCancel = null;
}

// Standard 2+ button modal. `onCancel` defaults to a no-op and is
// invoked when the user dismisses via Escape, backdrop click, or any
// button whose action is undefined.
export function showModal({ title, body, buttons, onCancel } = {}) {
  // If another modal is open, cancel it first so its handler runs.
  if (_activeOnCancel) {
    const prev = _activeOnCancel;
    _activeOnCancel = null;
    try { prev(); } catch (e) { console.error("modal cancel handler:", e); }
  }
  const bd = _ensureBackdrop();
  bd.innerHTML = buildModalHtml({ title, body, buttons });
  bd.removeAttribute("hidden");
  // Stash cancel for esc / backdrop. The cancel button (style:secondary
  // with no action) also resolves through this.
  _activeOnCancel = typeof onCancel === "function" ? onCancel : (() => {});
  // Wire up button clicks.
  const card = bd.querySelector(".mdl-card");
  card.querySelectorAll("[data-mdl-button]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-mdl-button"));
      const def = (buttons || [])[i] || {};
      _activeOnCancel = null; // suppress double-fire
      hideModal();
      if (typeof def.action === "function") {
        try { def.action(); } catch (e) { console.error("modal action:", e); }
      } else if (typeof onCancel === "function") {
        onCancel();
      }
    });
  });
  // Focus the primary button (last) for keyboard flow.
  const primary = card.querySelector(".mdl-btn-primary");
  if (primary) setTimeout(() => primary.focus(), 0);
}

// Two-button informational modal. Single "OK" closes it.
export function showModalAlert({ title, body, okLabel } = {}) {
  return new Promise((resolve) => {
    showModal({
      title: title || "",
      body: body || "",
      buttons: [{ label: okLabel || "OK", style: "primary", action: () => resolve() }],
      onCancel: () => resolve(),
    });
  });
}

// Confirm modal. Resolves with true/false based on user choice.
export function showModalConfirm({ title, body, confirmLabel, cancelLabel, danger } = {}) {
  return new Promise((resolve) => {
    showModal({
      title: title || "",
      body: body || "",
      buttons: [
        { label: cancelLabel || "Cancel", style: "secondary", action: () => resolve(false) },
        {
          label: confirmLabel || "Confirm",
          style: danger ? "danger" : "primary",
          action: () => resolve(true),
        },
      ],
      onCancel: () => resolve(false),
    });
  });
}

// Prompt modal. Resolves with input value on confirm, null on cancel.
// `validator` (optional) is `(value) => string | null`; when it returns
// a non-null string, that string is shown as an inline error and the
// modal stays open.
export function showModalPrompt({ title, body, defaultValue, placeholder, confirmLabel, cancelLabel, validator } = {}) {
  return new Promise((resolve) => {
    if (_activeOnCancel) {
      const prev = _activeOnCancel;
      _activeOnCancel = null;
      try { prev(); } catch {}
    }
    const bd = _ensureBackdrop();
    bd.innerHTML = buildPromptHtml({ title, body, defaultValue, placeholder, confirmLabel, cancelLabel });
    bd.removeAttribute("hidden");
    _activeOnCancel = () => resolve(null);
    const card = bd.querySelector(".mdl-card");
    const input = card.querySelector(".mdl-input");
    const cancelBtn = card.querySelector('[data-mdl-button="cancel"]');
    const confirmBtn = card.querySelector('[data-mdl-button="confirm"]');
    const confirm = () => {
      const v = input.value;
      if (typeof validator === "function") {
        const err = validator(v);
        if (err) {
          // Render error inline and leave modal open.
          let errEl = card.querySelector(".mdl-error");
          if (!errEl) {
            errEl = document.createElement("div");
            errEl.className = "mdl-error";
            input.parentElement.appendChild(errEl);
          }
          errEl.textContent = err;
          input.focus();
          return;
        }
      }
      _activeOnCancel = null;
      hideModal();
      resolve(v);
    };
    const cancel = () => {
      _activeOnCancel = null;
      hideModal();
      resolve(null);
    };
    cancelBtn.addEventListener("click", cancel);
    confirmBtn.addEventListener("click", confirm);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); confirm(); }
    });
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

// Test-only helper: returns whether a modal is currently open.
export function isModalOpen() {
  return !!(_backdrop && !_backdrop.hasAttribute("hidden"));
}
