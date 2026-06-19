(function () {
  function runJiraWorklogBookmarklet() {
    "use strict";

    var INITIAL_JIRA_EMAIL = "";
    var INITIAL_JIRA_API_TOKEN = "";

    var ALLOWED_URL_PREFIX = "https://project-tools-santillana.atlassian.net";
    var TITLE_PREFIXES = [
      "Implementación Colegio:",
      "Análisis pseudo integración Tangerine"
    ];
    var COMMENT_REGEX = /\/rest\/api\/\d+\/issue\/([^/]+)\/comment(?:[/?#]|$)/i;
    var ISSUE_HEADING_SELECTOR = 'h1[data-testid="issue.views.issue-base.foundation.summary.heading"]';

    var GLOBAL_KEY = "__tedJiraWorklogBookmarklet";
    var STYLE_ID = "ted-jira-worklog-style";
    var MODAL_ID = "ted-jira-worklog-overlay";
    var TOAST_ID = "ted-jira-worklog-toast";
    var STORAGE_EMAIL_KEY = "ted_jira_worklog_email";
    var STORAGE_TOKEN_KEY = "ted_jira_worklog_token";

    var ACTIVITIES = [
      "Configuración Agente de Éxito",
      "Estandarización de plantillas",
      "Entrega de plantillas DOCENTES Coach/Farmer/Hunter",
      "Entrega de plantillas ESTUDIANTES Coach/Farmer/Hunter",
      "Pendiente información",
      "Integración LQL",
      "Integración RLP",
      "Integración Studio",
      "Integración LDB",
      "Integración WeMath",
      "Integración Pleno",
      "Entrega de plantillas Coach/Farmer/Hunter",
      "Integración Educa",
      "Configuración de colegio",
      "Configuración de docentes",
      "Configuración de estudiantes",
      "Validación colegio Payment",
      "Integración EDI"
    ];

    if (window[GLOBAL_KEY] && window[GLOBAL_KEY].installed) {
      showToast("Detector de actividad Jira reactivado.");
      window[GLOBAL_KEY].lastArmedAt = Date.now();
      return;
    }

    var state = {
      elements: null,
      lastTrigger: 0,
      issueKey: "",
      credentials: { email: "", token: "" },
      time: { weeks: 0, days: 0, hours: 0, minutes: 0 }
    };

    window[GLOBAL_KEY] = {
      installed: true,
      version: "1.0.0",
      lastArmedAt: Date.now(),
      open: function (issueKey) {
        openModal(issueKey || detectIssueKeyFromPage());
      }
    };

    seedCredentials();
    installInterceptors();
    ensureStyles();
    showToast(
      hasStoredCredentials()
        ? "Detector de actividad Jira activo. Registra un comentario para abrir el formulario."
        : "Detector activo, pero falta el API token de Jira. Configúralo en la web del equipo Ted."
    );

    function seedCredentials() {
      var email = INITIAL_JIRA_EMAIL || readStorage(STORAGE_EMAIL_KEY) || "";
      var token = INITIAL_JIRA_API_TOKEN || readStorage(STORAGE_TOKEN_KEY) || "";

      state.credentials.email = email;
      state.credentials.token = token;

      if (INITIAL_JIRA_EMAIL && INITIAL_JIRA_API_TOKEN) {
        writeStorage(STORAGE_EMAIL_KEY, INITIAL_JIRA_EMAIL);
        writeStorage(STORAGE_TOKEN_KEY, INITIAL_JIRA_API_TOKEN);
      }
    }

    function hasStoredCredentials() {
      return Boolean(state.credentials.email && state.credentials.token);
    }

    function readStorage(key) {
      try {
        return window.localStorage.getItem(key) || "";
      } catch (error) {
        return "";
      }
    }

    function writeStorage(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        logDebug("No se pudo guardar credencial en localStorage.", error);
      }
    }

    function installInterceptors() {
      patchFetch();
      patchXMLHttpRequest();
    }

    function patchFetch() {
      if (!window.fetch || window.fetch.__tedWorklogPatched) {
        return;
      }

      var originalFetch = window.fetch.bind(window);

      function patchedFetch(input, init) {
        var requestUrl = getFetchInputUrl(input);
        var method = getFetchMethod(input, init);
        var matchedKey = matchCommentRequest(requestUrl, method);

        var promise = originalFetch(input, init);

        if (matchedKey) {
          promise
            .then(function (response) {
              if (!response || response.ok || response.status === 0) {
                handleCommentDetected(matchedKey, response ? response.url : requestUrl);
              }
              return response;
            })
            .catch(function () {});
        }

        return promise;
      }

      Object.defineProperty(patchedFetch, "__tedWorklogPatched", { value: true });
      window.fetch = patchedFetch;
    }

    function patchXMLHttpRequest() {
      if (!window.XMLHttpRequest) {
        return;
      }

      var prototype = window.XMLHttpRequest.prototype;

      if (prototype.__tedWorklogPatched) {
        return;
      }

      var originalOpen = prototype.open;
      var originalSend = prototype.send;

      prototype.open = function (method, url) {
        this.__tedWorklogMethod = String(method || "GET");
        this.__tedWorklogUrl = String(url || "");
        return originalOpen.apply(this, arguments);
      };

      prototype.send = function () {
        var self = this;
        var matchedKey = matchCommentRequest(self.__tedWorklogUrl, self.__tedWorklogMethod);

        if (matchedKey) {
          self.addEventListener("load", function () {
            if (self.status >= 200 && self.status < 300) {
              handleCommentDetected(matchedKey, self.responseURL || self.__tedWorklogUrl);
            }
          });
        }

        return originalSend.apply(this, arguments);
      };

      Object.defineProperty(prototype, "__tedWorklogPatched", { value: true });
    }

    function matchCommentRequest(url, method) {
      if (!url || String(method || "").toUpperCase() !== "POST") {
        return "";
      }

      var match = String(url).match(COMMENT_REGEX);

      if (!match) {
        return "";
      }

      return decodeURIComponent(match[1]);
    }

    function handleCommentDetected(issueKey, sourceUrl) {
      var now = Date.now();

      if (now - state.lastTrigger < 1200) {
        return;
      }

      state.lastTrigger = now;

      if (!isAllowedUrl()) {
        logDebug("Comentario detectado pero la URL no coincide con la instancia permitida.");
        return;
      }

      if (!isAllowedTitle()) {
        logDebug("Comentario detectado pero el título del ticket no coincide.");
        return;
      }

      var resolvedKey = issueKey || extractIssueKeyFromUrl(sourceUrl) || detectIssueKeyFromPage();

      openModal(resolvedKey);
    }

    function isAllowedUrl() {
      return String(window.location.href).indexOf(ALLOWED_URL_PREFIX) === 0;
    }

    function getIssueTitle() {
      var heading = document.querySelector(ISSUE_HEADING_SELECTOR) || document.querySelector("h1");
      return heading ? asCleanText(heading.textContent) : "";
    }

    function isAllowedTitle() {
      var title = getIssueTitle();

      return TITLE_PREFIXES.some(function (prefix) {
        return title.indexOf(prefix) === 0;
      });
    }

    function extractIssueKeyFromUrl(url) {
      if (!url) {
        return "";
      }

      var match = String(url).match(COMMENT_REGEX);

      if (match) {
        return decodeURIComponent(match[1]);
      }

      var browseMatch = String(url).match(/[A-Z][A-Z0-9]+-\d+/);
      return browseMatch ? browseMatch[0] : "";
    }

    function detectIssueKeyFromPage() {
      var href = window.location.href;
      var patterns = [
        /[?&]selectedIssue=([A-Z][A-Z0-9]+-\d+)/i,
        /\/browse\/([A-Z][A-Z0-9]+-\d+)/i,
        /\/issues\/([A-Z][A-Z0-9]+-\d+)/i,
        /([A-Z][A-Z0-9]+-\d+)/
      ];

      for (var index = 0; index < patterns.length; index += 1) {
        var match = href.match(patterns[index]);

        if (match) {
          return match[1].toUpperCase();
        }
      }

      var heading = document.querySelector('[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"] a');
      if (heading) {
        var keyMatch = (heading.textContent || "").match(/[A-Z][A-Z0-9]+-\d+/);
        if (keyMatch) {
          return keyMatch[0];
        }
      }

      return "";
    }

    function openModal(issueKey) {
      var elements = ensureModal();
      state.issueKey = issueKey || "";

      resetForm();

      elements.issueLabel.textContent = state.issueKey
        ? "Ticket detectado: " + state.issueKey
        : "No se pudo detectar el ticket automáticamente.";
      elements.issueLabel.dataset.type = state.issueKey ? "ok" : "warn";

      updateDescription();
      setStatus("", "");

      elements.overlay.hidden = false;
      document.documentElement.style.setProperty("overflow", "hidden");

      window.setTimeout(function () {
        elements.activitySelect.focus();
      }, 30);
    }

    function closeModal() {
      if (!state.elements) {
        return;
      }

      state.elements.overlay.hidden = true;
      document.documentElement.style.removeProperty("overflow");
      resetForm();
    }

    function resetForm() {
      if (!state.elements) {
        return;
      }

      state.time = { weeks: 0, days: 0, hours: 0, minutes: 0 };
      state.elements.activitySelect.value = "";
      renderTime();
      updateDescription();
      setStatus("", "");
    }

    function ensureModal() {
      if (state.elements) {
        return state.elements;
      }

      ensureStyles();

      var overlay = document.createElement("div");
      overlay.id = MODAL_ID;
      overlay.hidden = true;

      var optionsHtml = ACTIVITIES.map(function (activity) {
        return '<option value="' + escapeHtml(activity) + '">' + escapeHtml(activity) + "</option>";
      }).join("");

      overlay.innerHTML = [
        '<div class="tjw-modal" role="dialog" aria-modal="true" aria-labelledby="tjw-title" tabindex="-1">',
        '  <div class="tjw-header">',
        '    <div>',
        '      <p class="tjw-kicker">Funciones equipo Ted</p>',
        '      <h2 id="tjw-title">Registrar actividad</h2>',
        '      <p class="tjw-help">Se detectó una actividad</p>',
        '    </div>',
        '    <button type="button" class="tjw-close" data-action="cancel" aria-label="Cerrar">&times;</button>',
        '  </div>',
        '  <p class="tjw-issue" data-type="warn"></p>',
        '  <label class="tjw-label" for="tjw-activity">Actividad <span class="tjw-req">*</span></label>',
        '  <select id="tjw-activity" class="tjw-select">',
        '    <option value="" disabled selected>Selecciona una actividad</option>',
        optionsHtml,
        "  </select>",
        '  <label class="tjw-label">Tiempo invertido <span class="tjw-req">*</span></label>',
        '  <div class="tjw-time" data-time-grid>',
        timeUnitHtml("weeks", "Semanas"),
        timeUnitHtml("days", "Días"),
        timeUnitHtml("hours", "Horas"),
        timeUnitHtml("minutes", "Minutos"),
        "  </div>",
        '  <p class="tjw-time-preview">Formato Jira: <strong data-time-preview>0m</strong></p>',
        '  <label class="tjw-label" for="tjw-description">Descripción</label>',
        '  <input id="tjw-description" class="tjw-input" type="text" readonly tabindex="-1" aria-readonly="true">',
        '  <div class="tjw-status" data-status hidden></div>',
        '  <div class="tjw-actions">',
        '    <button type="button" class="tjw-secondary" data-action="cancel">Cancelar</button>',
        '    <button type="button" class="tjw-primary" data-action="save">Guardar</button>',
        "  </div>",
        "</div>"
      ].join("");

      (document.body || document.documentElement).appendChild(overlay);

      state.elements = {
        overlay: overlay,
        dialog: overlay.querySelector(".tjw-modal"),
        issueLabel: overlay.querySelector(".tjw-issue"),
        activitySelect: overlay.querySelector("#tjw-activity"),
        description: overlay.querySelector("#tjw-description"),
        timePreview: overlay.querySelector("[data-time-preview]"),
        status: overlay.querySelector("[data-status]"),
        saveButton: overlay.querySelector('[data-action="save"]')
      };

      wireEvents();
      renderTime();

      return state.elements;
    }

    function timeUnitHtml(unit, label) {
      return [
        '<div class="tjw-time-unit">',
        '  <span class="tjw-time-label">' + label + "</span>",
        '  <div class="tjw-stepper">',
        '    <button type="button" class="tjw-step" data-step="dec" data-unit="' + unit + '" aria-label="Disminuir ' + label + '">&minus;</button>',
        '    <span class="tjw-step-value" data-unit-value="' + unit + '">0</span>',
        '    <button type="button" class="tjw-step" data-step="inc" data-unit="' + unit + '" aria-label="Aumentar ' + label + '">+</button>',
        "  </div>",
        "</div>"
      ].join("");
    }

    function wireEvents() {
      var elements = state.elements;

      elements.overlay.addEventListener("click", function (event) {
        if (event.target === elements.overlay) {
          closeModal();
        }
      });

      Array.prototype.forEach.call(elements.overlay.querySelectorAll('[data-action="cancel"]'), function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          closeModal();
        });
      });

      elements.saveButton.addEventListener("click", function (event) {
        event.preventDefault();
        handleSave();
      });

      elements.activitySelect.addEventListener("change", updateDescription);

      Array.prototype.forEach.call(elements.overlay.querySelectorAll("[data-step]"), function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          var unit = button.getAttribute("data-unit");
          var direction = button.getAttribute("data-step") === "inc" ? 1 : -1;
          stepTime(unit, direction);
        });
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && state.elements && !state.elements.overlay.hidden) {
          event.preventDefault();
          event.stopPropagation();
          closeModal();
        }
      }, true);
    }

    function stepTime(unit, direction) {
      var limits = { weeks: 99, days: 6, hours: 23, minutes: 59 };
      var current = state.time[unit] || 0;
      var next = current + direction;

      if (next < 0) {
        next = 0;
      }

      if (typeof limits[unit] === "number" && next > limits[unit]) {
        next = limits[unit];
      }

      state.time[unit] = next;
      renderTime();
    }

    function renderTime() {
      if (!state.elements) {
        return;
      }

      ["weeks", "days", "hours", "minutes"].forEach(function (unit) {
        var node = state.elements.overlay.querySelector('[data-unit-value="' + unit + '"]');
        if (node) {
          node.textContent = String(state.time[unit] || 0);
        }
      });

      state.elements.timePreview.textContent = buildJiraTime() || "0m";
    }

    function buildJiraTime() {
      var parts = [];

      if (state.time.weeks > 0) {
        parts.push(state.time.weeks + "w");
      }
      if (state.time.days > 0) {
        parts.push(state.time.days + "d");
      }
      if (state.time.hours > 0) {
        parts.push(state.time.hours + "h");
      }
      if (state.time.minutes > 0) {
        parts.push(state.time.minutes + "m");
      }

      return parts.join(" ");
    }

    function hasTime() {
      return state.time.weeks > 0 || state.time.days > 0 || state.time.hours > 0 || state.time.minutes > 0;
    }

    function updateDescription() {
      if (!state.elements) {
        return;
      }

      var activity = state.elements.activitySelect.value;
      state.elements.description.value = activity ? activity + " [" + formatDateDdMmYyyy(new Date()) + "]" : "";
    }

    function handleSave() {
      var activity = state.elements.activitySelect.value;

      if (!activity) {
        setStatus("Selecciona una actividad antes de guardar.", "error");
        state.elements.activitySelect.focus();
        return;
      }

      if (!hasTime()) {
        setStatus("Indica un tiempo mayor a 0 usando los controles.", "error");
        return;
      }

      if (!state.issueKey) {
        setStatus("No se pudo detectar el ticket. Abre el ticket en Jira e inténtalo de nuevo.", "error");
        return;
      }

      if (!hasStoredCredentials()) {
        setStatus("Falta el API token de Jira. Configúralo en la web del equipo Ted y reinstala el favorito.", "error");
        return;
      }

      var now = new Date();
      var commentText = activity + " [" + formatDateDdMmYyyy(now) + "]";
      var payload = {
        timeSpent: buildJiraTime(),
        started: formatStarted(now),
        comment: buildAdfComment(commentText)
      };

      submitWorklog(payload);
    }

    function submitWorklog(payload) {
      var url = window.location.origin + "/rest/api/3/issue/" + encodeURIComponent(state.issueKey) + "/worklog";

      state.elements.saveButton.disabled = true;
      setStatus("Registrando worklog en " + state.issueKey + "...", "info");

      var headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Atlassian-Token": "no-check"
      };

      headers.Authorization = "Basic " + toBase64(state.credentials.email + ":" + state.credentials.token);

      fetch(url, {
        method: "POST",
        credentials: "include",
        headers: headers,
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.text().then(function (text) {
            return { ok: response.ok, status: response.status, text: text };
          });
        })
        .then(function (result) {
          state.elements.saveButton.disabled = false;

          if (result.ok) {
            setStatus("Worklog registrado correctamente en " + state.issueKey + " (" + payload.timeSpent + ").", "success");
            window.setTimeout(closeModal, 1600);
            return;
          }

          setStatus("No se pudo registrar el worklog (" + result.status + "): " + readApiError(result.text), "error");
        })
        .catch(function (error) {
          state.elements.saveButton.disabled = false;
          setStatus("Error de red al registrar el worklog: " + (error && error.message ? error.message : String(error)), "error");
        });
    }

    function readApiError(text) {
      if (!text) {
        return "respuesta vacía del servidor.";
      }

      try {
        var json = JSON.parse(text);
        if (json.errorMessages && json.errorMessages.length) {
          return json.errorMessages.join(" ");
        }
        if (json.errors) {
          return Object.keys(json.errors).map(function (key) {
            return key + ": " + json.errors[key];
          }).join(" ");
        }
      } catch (error) {
        logDebug("No se pudo leer el error como JSON.", error);
      }

      return String(text).slice(0, 200);
    }

    function buildAdfComment(text) {
      return {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: text }]
          }
        ]
      };
    }

    function setStatus(message, type) {
      var status = state.elements.status;

      if (!message) {
        status.hidden = true;
        status.textContent = "";
        return;
      }

      status.hidden = false;
      status.textContent = message;
      status.dataset.type = type || "info";
    }

    function formatDateDdMmYyyy(date) {
      return pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1) + "/" + date.getFullYear();
    }

    function formatStarted(date) {
      var offsetMinutes = -date.getTimezoneOffset();
      var sign = offsetMinutes >= 0 ? "+" : "-";
      var absMinutes = Math.abs(offsetMinutes);

      return (
        date.getFullYear() +
        "-" + pad2(date.getMonth() + 1) +
        "-" + pad2(date.getDate()) +
        "T" + pad2(date.getHours()) +
        ":" + pad2(date.getMinutes()) +
        ":" + pad2(date.getSeconds()) +
        "." + pad3(date.getMilliseconds()) +
        sign + pad2(Math.floor(absMinutes / 60)) + pad2(absMinutes % 60)
      );
    }

    function toBase64(value) {
      try {
        return window.btoa(unescape(encodeURIComponent(value)));
      } catch (error) {
        return window.btoa(value);
      }
    }

    function pad2(value) {
      return value < 10 ? "0" + value : String(value);
    }

    function pad3(value) {
      if (value < 10) {
        return "00" + value;
      }
      if (value < 100) {
        return "0" + value;
      }
      return String(value);
    }

    function getFetchInputUrl(input) {
      if (typeof input === "string") {
        return input;
      }
      if (input && typeof input.url === "string") {
        return input.url;
      }
      return "";
    }

    function getFetchMethod(input, init) {
      if (init && init.method) {
        return init.method;
      }
      if (input && typeof input === "object" && input.method) {
        return input.method;
      }
      return "GET";
    }

    function showToast(message) {
      ensureStyles();

      var existing = document.getElementById(TOAST_ID);
      if (existing) {
        existing.parentNode.removeChild(existing);
      }

      var toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.textContent = message;
      (document.body || document.documentElement).appendChild(toast);

      window.setTimeout(function () {
        toast.dataset.visible = "true";
      }, 20);

      window.setTimeout(function () {
        toast.dataset.visible = "false";
        window.setTimeout(function () {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 400);
      }, 4200);
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function asCleanText(value) {
      return value === undefined || value === null ? "" : String(value).replace(/\s+/g, " ").trim();
    }

    function logDebug(message, detail) {
      if (window.console && typeof window.console.debug === "function") {
        window.console.debug("[Ted Jira Worklog] " + message, detail || "");
      }
    }

    function ensureStyles() {
      if (document.getElementById(STYLE_ID)) {
        return;
      }

      var style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = [
        "#" + MODAL_ID + "{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(15,23,42,0.55);font-family:'Segoe UI',system-ui,Arial,sans-serif;-webkit-font-smoothing:antialiased;}",
        "#" + MODAL_ID + "[hidden]{display:none !important;}",
        "#" + MODAL_ID + " *{box-sizing:border-box;}",
        "#" + MODAL_ID + " .tjw-modal{width:min(480px,100%);max-height:calc(100vh - 48px);overflow:auto;background:#ffffff;color:#0f172a;border-radius:16px;box-shadow:0 24px 70px rgba(15,23,42,0.35);padding:24px;}",
        "#" + MODAL_ID + " .tjw-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px;}",
        "#" + MODAL_ID + " .tjw-kicker{margin:0 0 6px;color:#2563eb;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;}",
        "#" + MODAL_ID + " h2{margin:0;font-size:22px;line-height:1.2;color:#0f172a;}",
        "#" + MODAL_ID + " .tjw-help{margin:6px 0 0;color:#64748b;font-size:14px;}",
        "#" + MODAL_ID + " .tjw-close{flex:none;width:34px;height:34px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;color:#475569;font-size:20px;line-height:1;cursor:pointer;}",
        "#" + MODAL_ID + " .tjw-close:hover{background:#eef2f7;}",
        "#" + MODAL_ID + " .tjw-issue{margin:0 0 16px;padding:8px 12px;border-radius:10px;font-size:13px;font-weight:600;}",
        "#" + MODAL_ID + " .tjw-issue[data-type='ok']{background:#ecfdf5;color:#047857;}",
        "#" + MODAL_ID + " .tjw-issue[data-type='warn']{background:#fff7ed;color:#b45309;}",
        "#" + MODAL_ID + " .tjw-label{display:block;margin:0 0 8px;color:#334155;font-size:13px;font-weight:700;}",
        "#" + MODAL_ID + " .tjw-req{color:#dc2626;}",
        "#" + MODAL_ID + " .tjw-select,#" + MODAL_ID + " .tjw-input{width:100%;min-height:44px;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:14px;color:#0f172a;background:#ffffff;margin-bottom:18px;}",
        "#" + MODAL_ID + " .tjw-select:focus,#" + MODAL_ID + " .tjw-input:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.15);}",
        "#" + MODAL_ID + " .tjw-input[readonly]{background:#f1f5f9;color:#475569;cursor:default;}",
        "#" + MODAL_ID + " .tjw-time{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px;}",
        "#" + MODAL_ID + " .tjw-time-unit{display:flex;flex-direction:column;align-items:center;gap:6px;border:1px solid #e2e8f0;border-radius:12px;padding:10px 6px;background:#f8fafc;}",
        "#" + MODAL_ID + " .tjw-time-label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;}",
        "#" + MODAL_ID + " .tjw-stepper{display:flex;align-items:center;gap:6px;}",
        "#" + MODAL_ID + " .tjw-step{width:28px;height:28px;border:1px solid #cbd5e1;border-radius:8px;background:#ffffff;color:#1e293b;font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}",
        "#" + MODAL_ID + " .tjw-step:hover{background:#2563eb;border-color:#2563eb;color:#ffffff;}",
        "#" + MODAL_ID + " .tjw-step-value{min-width:26px;text-align:center;font-size:16px;font-weight:700;color:#0f172a;}",
        "#" + MODAL_ID + " .tjw-time-preview{margin:0 0 18px;font-size:13px;color:#64748b;}",
        "#" + MODAL_ID + " .tjw-time-preview strong{color:#2563eb;font-family:'Segoe UI',system-ui,monospace;}",
        "#" + MODAL_ID + " .tjw-status{margin:0 0 16px;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.45;}",
        "#" + MODAL_ID + " .tjw-status[data-type='info']{background:#eff6ff;color:#1d4ed8;}",
        "#" + MODAL_ID + " .tjw-status[data-type='success']{background:#ecfdf5;color:#047857;}",
        "#" + MODAL_ID + " .tjw-status[data-type='error']{background:#fef2f2;color:#b91c1c;}",
        "#" + MODAL_ID + " .tjw-actions{display:flex;gap:10px;justify-content:flex-end;}",
        "#" + MODAL_ID + " .tjw-actions button{min-height:44px;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;border:0;}",
        "#" + MODAL_ID + " .tjw-secondary{background:#f1f5f9;color:#334155;border:1px solid #e2e8f0 !important;}",
        "#" + MODAL_ID + " .tjw-secondary:hover{background:#e2e8f0;}",
        "#" + MODAL_ID + " .tjw-primary{background:#2563eb;color:#ffffff;}",
        "#" + MODAL_ID + " .tjw-primary:hover{background:#1d4ed8;}",
        "#" + MODAL_ID + " .tjw-primary:disabled{opacity:0.6;cursor:not-allowed;}",
        "#" + TOAST_ID + "{position:fixed;left:50%;bottom:24px;transform:translate(-50%,12px);z-index:2147483647;max-width:min(440px,calc(100vw - 32px));background:#0f172a;color:#f8fafc;padding:12px 18px;border-radius:12px;font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:13px;line-height:1.4;box-shadow:0 16px 40px rgba(15,23,42,0.4);opacity:0;transition:opacity .35s ease,transform .35s ease;}",
        "#" + TOAST_ID + "[data-visible='true']{opacity:1;transform:translate(-50%,0);}",
        "@media (max-width:520px){#" + MODAL_ID + " .tjw-time{grid-template-columns:repeat(2,1fr);}#" + MODAL_ID + " .tjw-actions{flex-direction:column-reverse;}#" + MODAL_ID + " .tjw-actions button{width:100%;}}"
      ].join("\n");

      (document.head || document.documentElement).appendChild(style);
    }
  }

  function buildBookmarkletCode() {
    var options = arguments[0] || {};
    var email = options.email || "";
    var token = options.token || "";
    var source = "(" + runJiraWorklogBookmarklet.toString() + ")();";

    return source
      .replace('var INITIAL_JIRA_EMAIL = "";', "var INITIAL_JIRA_EMAIL = " + JSON.stringify(email) + ";")
      .replace('var INITIAL_JIRA_API_TOKEN = "";', "var INITIAL_JIRA_API_TOKEN = " + JSON.stringify(token) + ";");
  }

  function buildBookmarkletHref() {
    return "javascript:" + encodeURIComponent(buildBookmarkletCode(arguments[0]));
  }

  if (typeof window !== "undefined") {
    window.TedJiraWorklogInstaller = {
      buildCode: buildBookmarkletCode,
      buildHref: buildBookmarkletHref,
      run: runJiraWorklogBookmarklet
    };

    var currentScript = typeof document !== "undefined" ? document.currentScript : null;
    var isInstallHelper = currentScript && currentScript.hasAttribute("data-install-helper");

    if (!isInstallHelper) {
      runJiraWorklogBookmarklet();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildCode: buildBookmarkletCode,
      buildHref: buildBookmarkletHref
    };
  }
})();
