(function () {
  if (window.__sydChangeRequest) return;
  window.__sydChangeRequest = true;

  var OWNER_FLAG = "syd-change-owner";
  var OWNER_KEY = "syd-change-key";
  var MAX_SHOT = 3 * 1024 * 1024;

  function storageGet(name) {
    try {
      return localStorage.getItem(name);
    } catch (e) {
      return null;
    }
  }

  function storageSet(name, value) {
    localStorage.setItem(name, value);
  }

  function storageRemove(name) {
    try {
      localStorage.removeItem(name);
    } catch (e) {}
  }

  function isOwner() {
    return storageGet(OWNER_FLAG) === "1" && !!storageGet(OWNER_KEY);
  }

  function clearOwner() {
    storageRemove(OWNER_FLAG);
    storageRemove(OWNER_KEY);
  }

  function currentPageUrl() {
    var url = new URL(window.location.href);
    url.searchParams.delete("edit");
    return url.toString();
  }

  function stripEdit() {
    var url = new URL(window.location.href);
    if (!url.searchParams.has("edit")) return;
    url.searchParams.delete("edit");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  }

  var style = document.createElement("style");
  style.textContent = [
    ".syd-cr-launch{position:fixed;right:18px;bottom:max(18px,env(safe-area-inset-bottom));z-index:60;font-family:'DM Sans',system-ui,sans-serif;font-weight:700;font-size:.92rem;color:var(--ink);background:var(--card);border:3px solid var(--ink);border-radius:999px;padding:10px 16px;box-shadow:4px 4px 0 var(--ink);cursor:pointer;max-width:calc(100vw - 36px)}",
    ".syd-cr-launch:hover{background:#a8d4f5;color:#111;transform:translate(2px,2px);box-shadow:2px 2px 0 var(--ink)}",
    ".syd-cr-note{position:fixed;right:18px;bottom:max(18px,env(safe-area-inset-bottom));z-index:60;max-width:min(320px,calc(100vw - 36px));background:var(--card);color:var(--ink);border:3px solid var(--ink);border-radius:18px;box-shadow:4px 4px 0 var(--ink);padding:12px 14px;font-family:'DM Sans',system-ui,sans-serif;font-weight:700;font-size:.92rem}",
    ".syd-cr-note button{margin-top:8px;background:var(--ink);color:var(--bg);border:3px solid var(--ink);border-radius:999px;padding:6px 12px;font-weight:700;cursor:pointer}",
    ".syd-cr-modal{position:fixed;inset:0;z-index:80;display:flex;align-items:flex-end;justify-content:center;padding:16px}",
    "@media(min-width:700px){.syd-cr-modal{align-items:center}}",
    ".syd-cr-backdrop{position:absolute;inset:0;background:color-mix(in srgb,#111 45%,transparent);border:0;padding:0;cursor:pointer}",
    ".syd-cr-dialog{position:relative;z-index:1;width:min(440px,100%);max-height:min(40rem,calc(100dvh - 2rem));overflow:auto;background:var(--card);color:var(--ink);border:3px solid var(--ink);border-radius:22px;box-shadow:6px 6px 0 var(--ink);padding:22px;font-family:'DM Sans',system-ui,sans-serif}",
    ".syd-cr-dialog h2{font-family:'Bricolage Grotesque','Arial Black',sans-serif;font-weight:800;letter-spacing:-.03em;font-size:1.8rem;line-height:1;margin:0}",
    ".syd-cr-rule{margin-top:12px;height:.45em;width:72px;background:#a8d4f5;border-radius:6px;transform:rotate(-1.5deg)}",
    ".syd-cr-dialog label{display:block;margin-top:16px;font-weight:700}",
    ".syd-cr-dialog label span{font-weight:500;opacity:.7}",
    ".syd-cr-dialog textarea{width:100%;margin-top:8px;min-height:120px;border:3px solid var(--ink);border-radius:16px;background:var(--bg);color:var(--ink);font:inherit;padding:10px 12px;resize:vertical}",
    ".syd-cr-kicker{margin:16px 0 0;font-size:.75rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.7}",
    ".syd-cr-url{margin:4px 0 0;font-size:.92rem;word-break:break-all}",
    ".syd-cr-dialog input[type=file]{margin-top:8px;width:100%;font:inherit}",
    ".syd-cr-error{margin:12px 0 0;color:#9a3412;font-weight:700}",
    ".syd-cr-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}",
    ".syd-cr-cancel,.syd-cr-close{background:transparent;color:var(--ink);border:0;font:inherit;font-weight:700;cursor:pointer;padding:10px 12px}",
    ".syd-cr-submit,.syd-cr-close.syd-cr-solid{background:var(--ink);color:var(--bg);border:3px solid var(--ink);border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer;box-shadow:4px 4px 0 #a8d4f5}",
    ".syd-cr-submit:hover,.syd-cr-close.syd-cr-solid:hover{background:#a8d4f5;color:#111}",
    ".syd-cr-submit:disabled{opacity:.6;cursor:progress}",
    ".syd-cr-done p{margin:16px 0 0;font-size:1.15rem;font-weight:700}",
    ".syd-cr-launch[hidden],.syd-cr-note[hidden],.syd-cr-modal[hidden],.syd-cr-form[hidden],.syd-cr-done[hidden],.syd-cr-error[hidden]{display:none !important}",
    "html.syd-cr-on body{padding-bottom:76px}",
    "@media print{.syd-cr-launch,.syd-cr-note,.syd-cr-modal{display:none !important}}",
    "@media (prefers-color-scheme:dark){.syd-cr-error{color:#fdba74}}",
    ":root[data-theme=dark] .syd-cr-error{color:#fdba74}"
  ].join("");
  document.head.appendChild(style);

  var launch = document.createElement("button");
  launch.type = "button";
  launch.className = "syd-cr-launch";
  launch.textContent = "Request a change";
  launch.setAttribute("aria-haspopup", "dialog");
  launch.setAttribute("aria-expanded", "false");
  launch.hidden = true;

  var note = document.createElement("div");
  note.className = "syd-cr-note";
  note.setAttribute("role", "status");
  note.hidden = true;
  var noteText = document.createElement("p");
  noteText.style.margin = "0";
  var noteDismiss = document.createElement("button");
  noteDismiss.type = "button";
  noteDismiss.textContent = "Dismiss";
  note.appendChild(noteText);
  note.appendChild(noteDismiss);

  var modal = document.createElement("div");
  modal.className = "syd-cr-modal";
  modal.hidden = true;

  var backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "syd-cr-backdrop";
  backdrop.setAttribute("aria-label", "Close");

  var dialog = document.createElement("div");
  dialog.className = "syd-cr-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "syd-cr-title");

  var title = document.createElement("h2");
  title.id = "syd-cr-title";
  title.textContent = "Request a change";
  var rule = document.createElement("div");
  rule.className = "syd-cr-rule";
  rule.setAttribute("aria-hidden", "true");

  var form = document.createElement("form");
  form.className = "syd-cr-form";
  var label = document.createElement("label");
  label.htmlFor = "syd-cr-message";
  label.textContent = "What do you want to change?";
  var message = document.createElement("textarea");
  message.id = "syd-cr-message";
  message.name = "message";
  message.required = true;
  message.rows = 5;
  message.maxLength = 4000;
  var kicker = document.createElement("p");
  kicker.className = "syd-cr-kicker";
  kicker.textContent = "Page";
  var pageUrl = document.createElement("p");
  pageUrl.className = "syd-cr-url";
  var shotLabel = document.createElement("label");
  shotLabel.htmlFor = "syd-cr-shot";
  shotLabel.appendChild(document.createTextNode("Screenshot "));
  var optional = document.createElement("span");
  optional.textContent = "optional";
  shotLabel.appendChild(optional);
  var shot = document.createElement("input");
  shot.id = "syd-cr-shot";
  shot.name = "screenshot";
  shot.type = "file";
  shot.accept = "image/png,image/jpeg,image/webp,image/gif";
  var error = document.createElement("p");
  error.className = "syd-cr-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  var actions = document.createElement("div");
  actions.className = "syd-cr-actions";
  var cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "syd-cr-cancel";
  cancel.textContent = "Cancel";
  var submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "syd-cr-submit";
  submit.textContent = "Submit";
  actions.appendChild(cancel);
  actions.appendChild(submit);
  form.appendChild(label);
  form.appendChild(message);
  form.appendChild(kicker);
  form.appendChild(pageUrl);
  form.appendChild(shotLabel);
  form.appendChild(shot);
  form.appendChild(error);
  form.appendChild(actions);

  var done = document.createElement("div");
  done.className = "syd-cr-done";
  done.hidden = true;
  var doneText = document.createElement("p");
  doneText.textContent = "Sent! Your change is on the way.";
  var close = document.createElement("button");
  close.type = "button";
  close.className = "syd-cr-close syd-cr-solid";
  close.textContent = "Close";
  done.appendChild(doneText);
  done.appendChild(close);

  dialog.appendChild(title);
  dialog.appendChild(rule);
  dialog.appendChild(form);
  dialog.appendChild(done);
  modal.appendChild(backdrop);
  modal.appendChild(dialog);
  document.body.appendChild(launch);
  document.body.appendChild(note);
  document.body.appendChild(modal);

  function showError(text) {
    error.textContent = text;
    error.hidden = !text;
  }

  function showNote(text) {
    noteText.textContent = text;
    note.hidden = !text;
  }

  function sync() {
    var owner = isOwner();
    launch.hidden = !owner;
    document.documentElement.classList.toggle("syd-cr-on", owner);
    if (owner) note.hidden = true;
  }

  function closeModal() {
    modal.hidden = true;
    launch.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    if (!launch.hidden) launch.focus();
  }

  function openModal() {
    pageUrl.textContent = currentPageUrl();
    done.hidden = true;
    form.hidden = false;
    showError("");
    submit.disabled = false;
    submit.textContent = "Submit";
    modal.hidden = false;
    launch.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    message.focus();
  }

  launch.addEventListener("click", openModal);
  cancel.addEventListener("click", closeModal);
  close.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);
  noteDismiss.addEventListener("click", function () {
    note.hidden = true;
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = message.value.trim();
    if (!text) {
      showError("Write what you want changed.");
      return;
    }
    var file = shot.files && shot.files[0];
    if (file && file.size > MAX_SHOT) {
      showError("Screenshot must be under 3 MB.");
      return;
    }
    submit.disabled = true;
    submit.textContent = "Sending…";
    showError("");
    var body = new FormData();
    body.set("intent", "submit");
    body.set("key", storageGet(OWNER_KEY) || "");
    body.set("message", text);
    body.set("pageUrl", currentPageUrl());
    if (file) body.set("screenshot", file);

    fetch("/api/change-request", { method: "POST", body: body })
      .then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          return { response: response, data: data };
        });
      })
      .then(function (result) {
        if (!result.response.ok) {
          if (result.response.status === 401) clearOwner();
          showError((result.data && result.data.error) || "Couldn't send that. Try again.");
          sync();
          return;
        }
        message.value = "";
        shot.value = "";
        form.hidden = true;
        done.hidden = false;
        close.focus();
      })
      .catch(function () {
        showError("Couldn't send that. Try again.");
      })
      .then(function () {
        submit.disabled = false;
        submit.textContent = "Submit";
      });
  });

  function boot() {
    var params = new URLSearchParams(window.location.search);
    if (!params.has("edit")) {
      sync();
      return;
    }
    var key = params.get("edit") || "";
    stripEdit();
    if (key === "off") {
      clearOwner();
      sync();
      return;
    }
    if (!key) {
      sync();
      return;
    }
    fetch("/api/change-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "verify", key: key }),
    })
      .then(function (response) {
        return response.json().catch(function () { return null; }).then(function (data) {
          return { response: response, data: data };
        });
      })
      .then(function (result) {
        if (result.response.ok) {
          try {
            storageSet(OWNER_FLAG, "1");
            storageSet(OWNER_KEY, key);
          } catch (e) {
            showNote("This browser blocked saving the edit session.");
          }
          sync();
          return;
        }
        if (result.response.status !== 401) {
          showNote((result.data && result.data.error) || "Couldn't check that edit link.");
        }
        sync();
      })
      .catch(function () {
        sync();
      });
    sync();
  }

  boot();
})();
