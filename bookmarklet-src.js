(function () {
  function runTangerineClassroomBookmarklet() {
    "use strict";

    const GOOGLE_CLIENT_ID = "170816593771-f59gg4ns3pbgnilsbod723hi1gobtuun.apps.googleusercontent.com";
    const INITIAL_ACCESS_TOKEN = "";
    const INITIAL_TOKEN_EXPIRES_AT = 0;
    const GOOGLE_SCOPES = [
      "https://www.googleapis.com/auth/classroom.courses.readonly",
      "https://www.googleapis.com/auth/classroom.coursework.students"
    ].join(" ");

    const LESSON_ITEMS_PATH = "/api/front/lesson-items/";
    const GLOBAL_KEY = "__tangerineClassroomBookmarklet";
    const STYLE_ID = "tc-bookmarklet-style";
    const MODAL_ID = "tc-bookmarklet-overlay";
    const SHARE_CARD_SELECTOR = ".lesson-item-card[data-item-guid]";
    const SHARE_MENU_SELECTOR = ".more-icon-menu";
    const SHARE_MENU_ITEM_CLASS = "tc-share-classroom-menu-item";
    const SHARE_MENU_HOOK_ATTR = "data-tc-share-classroom-hooked";
    const STORAGE_KEYS = {
      evaluation: "ultimaEvaluacion",
      token: "google_access_token",
      expiresAt: "google_access_token_expires_at"
    };

    if (window[GLOBAL_KEY] && typeof window[GLOBAL_KEY].open === "function") {
      window[GLOBAL_KEY].open();
      return;
    }

    const state = {
      courses: [],
      elements: null,
      evaluation: loadEvaluation(),
      activeMenuCard: null,
      mutationObserver: null,
      scanTimer: null,
      shareItem: null
    };

    window[GLOBAL_KEY] = {
      open: activateShareButtons,
      version: "1.0.0"
    };

    seedInitialAccessToken();
    installInterceptors();
    activateShareButtons();

    function installInterceptors() {
      patchFetch();
      patchXMLHttpRequest();
    }

    function activateShareButtons() {
      ensureStyles();
      injectShareButtons();

      if (state.mutationObserver || !window.MutationObserver) {
        return;
      }

      state.mutationObserver = new MutationObserver(function () {
        window.clearTimeout(state.scanTimer);
        state.scanTimer = window.setTimeout(injectShareButtons, 80);
      });

      state.mutationObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    function injectShareButtons() {
      const cards = document.querySelectorAll(SHARE_CARD_SELECTOR);

      cards.forEach(function (card) {
        hookShareMenu(card);
      });

      if (state.activeMenuCard) {
        injectShareItemIntoOpenMenus(state.activeMenuCard);
      }
    }

    function hookShareMenu(card) {
      const menu = card.querySelector(SHARE_MENU_SELECTOR);

      if (!menu || menu.getAttribute(SHARE_MENU_HOOK_ATTR) === "true") {
        return;
      }

      menu.setAttribute(SHARE_MENU_HOOK_ATTR, "true");

      ["click", "mousedown", "pointerdown"].forEach(function (eventName) {
        menu.addEventListener(eventName, function () {
          state.activeMenuCard = card;
          scheduleShareMenuInjection(card);
        }, true);
      });
    }

    function scheduleShareMenuInjection(card) {
      [0, 80, 180, 350].forEach(function (delay) {
        window.setTimeout(function () {
          injectShareItemIntoOpenMenus(card);
        }, delay);
      });
    }

    function injectShareItemIntoOpenMenus(card) {
      const menuContainers = findOpenMenuContainers(card);
      let injectedCount = 0;

      menuContainers.forEach(function (container) {
        const target = normalizeMenuContainer(container);

        if (!target || hasShareMenuItem(target, card)) {
          return;
        }

        target.appendChild(createShareMenuItem(card, target));
        injectedCount += 1;
      });

      if (injectedCount > 0) {
        logDebug("Opción Compartir en class agregada al menú abierto.");
      }
    }

    function findOpenMenuContainers(card) {
      const containers = [];
      const scopedSelectors = [
        ".dropdown ul",
        ".dropdown [role='menu']",
        ".dropdown .MuiList-root",
        ".dropdown .MuiMenu-list"
      ].join(",");
      const portalSelectors = [
        "ul[role='menu']",
        "[role='menu']",
        ".MuiMenu-list",
        ".MuiList-root",
        ".dropdown__lib ul",
        ".dropdown-menu",
        ".dropdown ul"
      ].join(",");

      Array.prototype.forEach.call(card.querySelectorAll(scopedSelectors), function (element) {
        addMenuContainer(containers, element, false);
      });

      if (state.activeMenuCard === card) {
        Array.prototype.forEach.call(document.querySelectorAll(portalSelectors), function (element) {
          addMenuContainer(containers, element, false);
        });
      }

      return containers;
    }

    function addMenuContainer(containers, element, allowEmptyScopedContainer) {
      if (!element || element.closest("#" + MODAL_ID)) {
        return;
      }

      if (!allowEmptyScopedContainer && !isVisibleElement(element)) {
        return;
      }

      if (!allowEmptyScopedContainer && !looksLikeMenuContainer(element)) {
        return;
      }

      if (containers.indexOf(element) === -1) {
        containers.push(element);
      }
    }

    function normalizeMenuContainer(container) {
      if (!container) {
        return null;
      }

      if (container.matches("ul, ol, [role='menu']")) {
        return container;
      }

      const nestedMenu = container.querySelector("ul, ol, [role='menu']");

      if (nestedMenu) {
        return nestedMenu;
      }

      return container;
    }

    function looksLikeMenuContainer(element) {
      return Boolean(
        element.matches("ul, ol, [role='menu'], .MuiMenu-list, .MuiList-root, .dropdown-menu") ||
        element.querySelector("li, [role='menuitem']")
      );
    }

    function isVisibleElement(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }

    function hasShareMenuItem(menuContainer, card) {
      const itemGuid = getCardItemGuid(card);
      return Boolean(menuContainer.querySelector("." + SHARE_MENU_ITEM_CLASS + "[data-item-guid='" + cssEscape(itemGuid) + "']"));
    }

    function createShareMenuItem(sourceElement, menuContainer) {
      const item = document.createElement("li");
      const templateItem = menuContainer && menuContainer.querySelector("li:not(." + SHARE_MENU_ITEM_CLASS + ")");
      const templateRole = templateItem ? templateItem.getAttribute("role") : "";

      item.className = templateItem && templateItem.className
        ? templateItem.className + " " + SHARE_MENU_ITEM_CLASS
        : SHARE_MENU_ITEM_CLASS;
      item.setAttribute("role", templateRole || "menuitem");
      item.setAttribute("data-item-guid", getCardItemGuid(sourceElement));
      item.tabIndex = 0;
      item.textContent = "Compartir en class";
      item.title = "Compartir este recurso en Google Classroom";

      ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach(function (eventName) {
        item.addEventListener(eventName, function (event) {
          event.preventDefault();
          event.stopPropagation();

          if (eventName === "click") {
            openShareModalFromElement(sourceElement);
          }
        });
      });

      item.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          openShareModalFromElement(sourceElement);
        }
      });

      return item;
    }

    function getCardItemGuid(card) {
      return asCleanText(card && card.getAttribute && card.getAttribute("data-item-guid"));
    }

    function cssEscape(value) {
      if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
      }

      return String(value).replace(/'/g, "\\'");
    }

    function openShareModalFromElement(element) {
      const shareItem = buildShareItemFromElement(element);

      if (!shareItem) {
        showModal("No pude preparar este recurso para Classroom. Vuelve a abrir el recurso en Tangerine e inténtalo otra vez.");
        return;
      }

      state.shareItem = shareItem;
      showModal("Recurso listo para compartir. Elige una clase, edita el mensaje y publica.");

      if (!state.courses.length && getStoredAccessToken().token) {
        runAction(loadCourses);
      }
    }

    function buildShareItemFromElement(element) {
      const wrapper = element.closest(".draggable-item-wrapper, .draggable-item-content, .lesson-item-card") || element.parentElement;
      const card =
        (wrapper && wrapper.matches && wrapper.matches(".lesson-item-card[data-item-guid]") ? wrapper : null) ||
        (wrapper ? wrapper.querySelector(".lesson-item-card[data-item-guid]") : null) ||
        element.closest(".lesson-item-card[data-item-guid]");

      const itemGuid =
        asCleanText(card && card.getAttribute("data-item-guid")) ||
        asCleanText(wrapper && wrapper.getAttribute && wrapper.getAttribute("data-rbd-draggable-id"));
      const lessonGuid = extractLessonGuid(element, itemGuid);
      const courseGuid = extractCourseGuidFromUrl();

      if (!itemGuid || !lessonGuid || !courseGuid) {
        return null;
      }

      const titleNode = card ? card.querySelector(".lesson-item-card__center-title") : null;
      const title = asCleanText(titleNode && titleNode.textContent) || getPageTitle({});
      const url = buildXapiResultUrl(courseGuid, itemGuid, lessonGuid);

      return {
        guid: itemGuid,
        lesson_guid: lessonGuid,
        course_guid: courseGuid,
        title: title,
        url: url,
        detectedAt: new Date().toISOString()
      };
    }

    function extractLessonGuid(element, itemGuid) {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("lesson_guid") || params.get("lessonGuid") || params.get("lesson");
      const withDataLesson = element.closest("[data-lesson-guid]");
      const fromDom = withDataLesson ? withDataLesson.getAttribute("data-lesson-guid") : "";
      const fromLink = extractLessonGuidFromLinks(element, itemGuid);
      const fromPath = extractLessonGuidFromUrlPath();
      const fromEvaluation = state.evaluation && state.evaluation.lesson_guid;

      return asCleanText(fromDom || fromUrl || fromLink || fromPath || fromEvaluation);
    }

    function extractLessonGuidFromLinks(element, itemGuid) {
      const root = element.closest(".lesson-item-card, .draggable-item-wrapper") || document;
      const links = Array.prototype.slice.call(root.querySelectorAll("a[href*='lesson_guid=']")).concat(
        Array.prototype.slice.call(document.querySelectorAll("a[href*='lesson_guid=']"))
      );

      for (let index = 0; index < links.length; index += 1) {
        const href = links[index].getAttribute("href") || "";

        if (itemGuid && href.indexOf(itemGuid) === -1 && root !== document) {
          continue;
        }

        try {
          const url = new URL(href, window.location.href);
          const lessonGuid = url.searchParams.get("lesson_guid") || url.searchParams.get("lessonGuid");

          if (lessonGuid) {
            return lessonGuid;
          }
        } catch (error) {
          logDebug("No se pudo leer lesson_guid desde un enlace.", error);
        }
      }

      return "";
    }

    function extractLessonGuidFromUrlPath() {
      const match = window.location.pathname.match(/\/lessons?\/([^/?#]+)/i);
      return match ? decodeURIComponent(match[1]) : asCleanText(state.evaluation && state.evaluation.course_guid);
    }

    function extractCourseGuidFromUrl() {
      const match = window.location.pathname.match(/\/course\/([^/?#]+)/);
      return match ? decodeURIComponent(match[1]) : "";
    }

    function buildXapiResultUrl(courseGuid, itemGuid, lessonGuid) {
      const url = new URL("/course/" + encodeURIComponent(courseGuid) + "/results-xapi/" + encodeURIComponent(itemGuid), window.location.origin);
      url.searchParams.set("lesson_guid", lessonGuid);
      return url.toString();
    }

    function patchFetch() {
      if (!window.fetch || window.fetch.__tcBookmarkletPatched) {
        return;
      }

      const originalFetch = window.fetch.bind(window);

      function patchedFetch(input, init) {
        const requestUrl = getFetchInputUrl(input);

        return originalFetch(input, init).then(function (response) {
          const responseUrl = response && response.url ? response.url : requestUrl;

          if (isLessonItemsRequest(requestUrl) || isLessonItemsRequest(responseUrl)) {
            inspectFetchResponse(response);
          }

          return response;
        });
      }

      Object.defineProperty(patchedFetch, "__tcBookmarkletPatched", {
        value: true
      });

      window.fetch = patchedFetch;
    }

    function patchXMLHttpRequest() {
      if (!window.XMLHttpRequest) {
        return;
      }

      const prototype = window.XMLHttpRequest.prototype;

      if (prototype.__tcBookmarkletPatched) {
        return;
      }

      const originalOpen = prototype.open;
      const originalSend = prototype.send;

      prototype.open = function (method, url) {
        this.__tcBookmarkletRequestUrl = String(url || "");
        return originalOpen.apply(this, arguments);
      };

      prototype.send = function () {
        this.addEventListener("load", function () {
          const responseUrl = this.responseURL || this.__tcBookmarkletRequestUrl;

          if (!isLessonItemsRequest(responseUrl)) {
            return;
          }

          inspectXMLHttpRequestResponse(this);
        });

        return originalSend.apply(this, arguments);
      };

      Object.defineProperty(prototype, "__tcBookmarkletPatched", {
        value: true
      });
    }

    function inspectFetchResponse(response) {
      if (!response || typeof response.clone !== "function") {
        return;
      }

      response
        .clone()
        .json()
        .then(function (json) {
          handleLessonItemsJson(json);
        })
        .catch(function (error) {
          logDebug("No se pudo leer JSON desde fetch.", error);
        });
    }

    function inspectXMLHttpRequestResponse(xhr) {
      try {
        if (xhr.responseType === "json") {
          handleLessonItemsJson(xhr.response);
          return;
        }

        if (xhr.responseType && xhr.responseType !== "text") {
          return;
        }

        if (!xhr.responseText) {
          return;
        }

        handleLessonItemsJson(JSON.parse(xhr.responseText));
      } catch (error) {
        logDebug("No se pudo leer JSON desde XMLHttpRequest.", error);
      }
    }

    function handleLessonItemsJson(response) {
      if (!response || response.status !== "success") {
        return;
      }

      const candidate = findObjectWithKeys(response, ["guid", "lesson_guid"]) || {};
      const guid = asCleanText(candidate.guid || findFirstStringByKey(response, "guid"));
      const lessonGuid = asCleanText(candidate.lesson_guid || findFirstStringByKey(response, "lesson_guid"));

      if (!guid || !lessonGuid) {
        logDebug("La respuesta fue success, pero no contiene guid y lesson_guid.", response);
        return;
      }

      const evaluation = {
        guid: guid,
        lesson_guid: lessonGuid,
        course_guid: asCleanText(candidate.course_guid || findFirstStringByKey(response, "course_guid") || extractCourseGuidFromUrl()),
        title: getPageTitle(candidate),
        url: window.location.href,
        detectedAt: new Date().toISOString()
      };

      state.evaluation = evaluation;
      saveEvaluation(evaluation);
      injectShareButtons();
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

    function isLessonItemsRequest(url) {
      if (!url) {
        return false;
      }

      const rawUrl = String(url);

      if (rawUrl.indexOf(LESSON_ITEMS_PATH) !== -1) {
        return true;
      }

      try {
        return new URL(rawUrl, window.location.href).pathname.indexOf(LESSON_ITEMS_PATH) !== -1;
      } catch (error) {
        return false;
      }
    }

    function findObjectWithKeys(value, keys, depth) {
      const currentDepth = depth || 0;

      if (!value || currentDepth > 8) {
        return null;
      }

      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          const found = findObjectWithKeys(value[index], keys, currentDepth + 1);

          if (found) {
            return found;
          }
        }

        return null;
      }

      if (typeof value === "object") {
        const hasAllKeys = keys.every(function (key) {
          return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== null && value[key] !== "";
        });

        if (hasAllKeys) {
          return value;
        }

        const objectKeys = Object.keys(value);

        for (let index = 0; index < objectKeys.length; index += 1) {
          const found = findObjectWithKeys(value[objectKeys[index]], keys, currentDepth + 1);

          if (found) {
            return found;
          }
        }
      }

      return null;
    }

    function findFirstStringByKey(value, targetKey, depth) {
      const currentDepth = depth || 0;

      if (!value || currentDepth > 8) {
        return "";
      }

      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          const found = findFirstStringByKey(value[index], targetKey, currentDepth + 1);

          if (found) {
            return found;
          }
        }

        return "";
      }

      if (typeof value === "object") {
        if (Object.prototype.hasOwnProperty.call(value, targetKey) && value[targetKey]) {
          return asCleanText(value[targetKey]);
        }

        const keys = Object.keys(value);

        for (let index = 0; index < keys.length; index += 1) {
          const found = findFirstStringByKey(value[keys[index]], targetKey, currentDepth + 1);

          if (found) {
            return found;
          }
        }
      }

      return "";
    }

    function getPageTitle(candidate) {
      const heading = document.querySelector("h1");
      const headingText = heading ? heading.textContent.trim() : "";

      return (
        headingText ||
        asCleanText(candidate.title) ||
        asCleanText(candidate.name) ||
        asCleanText(document.title) ||
        "Evaluación Tangerine"
      );
    }

    function saveEvaluation(evaluation) {
      setStorageValue(STORAGE_KEYS.evaluation, JSON.stringify(evaluation));
    }

    function loadEvaluation() {
      const rawValue = getStorageValue(STORAGE_KEYS.evaluation);

      if (!rawValue) {
        return null;
      }

      try {
        return JSON.parse(rawValue);
      } catch (error) {
        return null;
      }
    }

    function setStorageValue(key, value) {
      try {
        window.sessionStorage.setItem(key, value);
        return;
      } catch (sessionError) {
        logDebug("sessionStorage no disponible, usando localStorage para datos no sensibles.", sessionError);
      }

      try {
        window.localStorage.setItem(key, value);
      } catch (localError) {
        logDebug("No se pudo guardar la evaluación.", localError);
      }
    }

    function getStorageValue(key) {
      try {
        return window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
      } catch (error) {
        return null;
      }
    }

    function getSessionValue(key) {
      try {
        return window.sessionStorage.getItem(key);
      } catch (error) {
        return null;
      }
    }

    function setSessionValue(key, value) {
      window.sessionStorage.setItem(key, value);
    }

    function seedInitialAccessToken() {
      const expiresAt = Number(INITIAL_TOKEN_EXPIRES_AT || 0);

      if (!INITIAL_ACCESS_TOKEN || !expiresAt || Date.now() >= expiresAt - 60000) {
        return;
      }

      try {
        setSessionValue(STORAGE_KEYS.token, INITIAL_ACCESS_TOKEN);
        setSessionValue(STORAGE_KEYS.expiresAt, String(expiresAt));
      } catch (error) {
        logDebug("No se pudo guardar el token inicial en sessionStorage.", error);
      }
    }

    function ensureModal() {
      if (state.elements) {
        return state.elements;
      }

      ensureStyles();

      const overlay = document.createElement("div");
      overlay.id = MODAL_ID;
      overlay.hidden = true;
      overlay.innerHTML = [
        '<div class="tc-modal" role="dialog" aria-modal="true" aria-labelledby="tc-modal-title" tabindex="-1">',
        '  <div class="tc-modal-header">',
        '    <div>',
        '      <p class="tc-kicker">Tangerine + Google Classroom</p>',
        '      <h2 id="tc-modal-title" data-field="modalTitle">Compartir en Classroom</h2>',
        '      <p class="tc-help">Elige una clase y revisa el mensaje antes de publicar.</p>',
        '    </div>',
        '    <button type="button" class="tc-icon-button" data-action="close" aria-label="Cerrar">x</button>',
        '  </div>',
        '  <label class="tc-label" for="tc-course-select">Curso de Google Classroom</label>',
        '  <select id="tc-course-select" class="tc-select"></select>',
        '  <label class="tc-label" for="tc-classroom-title">Título</label>',
        '  <input id="tc-classroom-title" class="tc-input" type="text">',
        '  <label class="tc-label" for="tc-classroom-message">Descripción</label>',
        '  <textarea id="tc-classroom-message" class="tc-textarea" rows="7"></textarea>',
        '  <div class="tc-actions">',
        '    <button type="button" data-action="publish">Publicar en Classroom</button>',
        '    <button type="button" class="tc-secondary" data-action="close">Cerrar</button>',
        '  </div>',
        '  <div class="tc-status" data-type="info" role="status"></div>',
        '</div>'
      ].join("");

      const mountPoint = document.body || document.documentElement;
      mountPoint.appendChild(overlay);

      state.elements = {
        closeButtons: overlay.querySelectorAll('[data-action="close"]'),
        courseSelect: overlay.querySelector("#tc-course-select"),
        dialog: overlay.querySelector(".tc-modal"),
        messageInput: overlay.querySelector("#tc-classroom-message"),
        modalTitle: overlay.querySelector('[data-field="modalTitle"]'),
        overlay: overlay,
        publishButton: overlay.querySelector('[data-action="publish"]'),
        status: overlay.querySelector(".tc-status"),
        titleInput: overlay.querySelector("#tc-classroom-title")
      };

      wireModalEvents();
      renderCourses();

      return state.elements;
    }

    function ensureStyles() {
      if (document.getElementById(STYLE_ID)) {
        return;
      }

      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = [
        "#" + MODAL_ID + " {",
        "  position: fixed;",
        "  inset: 0;",
        "  z-index: 2147483647;",
        "  display: grid;",
        "  place-items: center;",
        "  padding: 24px;",
        "  background: rgba(22, 32, 51, 0.58);",
        "  font-family: Arial, Helvetica, sans-serif;",
        "}",
        "#" + MODAL_ID + "[hidden] { display: none !important; }",
        "#" + MODAL_ID + " .tc-modal {",
        "  width: min(720px, 100%);",
        "  max-height: min(760px, calc(100vh - 48px));",
        "  overflow: auto;",
        "  box-sizing: border-box;",
        "  border-radius: 8px;",
        "  background: #ffffff;",
        "  color: #152033;",
        "  box-shadow: 0 28px 80px rgba(16, 24, 40, 0.28);",
        "  padding: 24px;",
        "}",
        "#" + MODAL_ID + " .tc-modal-header {",
        "  display: flex;",
        "  align-items: flex-start;",
        "  justify-content: space-between;",
        "  gap: 16px;",
        "  margin-bottom: 18px;",
        "}",
        "#" + MODAL_ID + " .tc-kicker {",
        "  margin: 0 0 6px;",
        "  color: #0f766e;",
        "  font-size: 12px;",
        "  font-weight: 700;",
        "  text-transform: uppercase;",
        "}",
        "#" + MODAL_ID + " h2 {",
        "  margin: 0;",
        "  color: #152033;",
        "  font-size: 24px;",
        "  line-height: 1.2;",
        "}",
        "#" + MODAL_ID + " .tc-help {",
        "  margin: 8px 0 0;",
        "  color: #607086;",
        "  font-size: 14px;",
        "  line-height: 1.45;",
        "}",
        "#" + MODAL_ID + " .tc-icon-button {",
        "  width: 34px;",
        "  height: 34px;",
        "  border: 1px solid #cfd7e3;",
        "  border-radius: 8px;",
        "  background: #ffffff;",
        "  color: #334155;",
        "  cursor: pointer;",
        "  font-size: 18px;",
        "  line-height: 1;",
        "}",
        "#" + MODAL_ID + " .tc-data-grid {",
        "  display: grid;",
        "  gap: 10px;",
        "  margin-bottom: 18px;",
        "}",
        "#" + MODAL_ID + " .tc-data-grid > div {",
        "  display: grid;",
        "  grid-template-columns: 120px minmax(0, 1fr);",
        "  gap: 12px;",
        "  align-items: start;",
        "  border: 1px solid #d9e2dd;",
        "  border-radius: 8px;",
        "  padding: 10px 12px;",
        "  background: #f7fbf9;",
        "}",
        "#" + MODAL_ID + " span { color: #52637a; font-size: 13px; }",
        "#" + MODAL_ID + " strong,",
        "#" + MODAL_ID + " code,",
        "#" + MODAL_ID + " a {",
        "  min-width: 0;",
        "  color: #152033;",
        "  font-size: 14px;",
        "  overflow-wrap: anywhere;",
        "  word-break: break-word;",
        "}",
        "#" + MODAL_ID + " code {",
        "  font-family: Consolas, Monaco, monospace;",
        "}",
        "#" + MODAL_ID + " .tc-label {",
        "  display: block;",
        "  margin: 0 0 8px;",
        "  color: #334155;",
        "  font-size: 14px;",
        "  font-weight: 700;",
        "}",
        "#" + MODAL_ID + " .tc-select,",
        "#" + MODAL_ID + " .tc-input {",
        "  width: 100%;",
        "  box-sizing: border-box;",
        "  border: 1px solid #c9d6d0;",
        "  border-radius: 8px;",
        "  background: #ffffff;",
        "  color: #152033;",
        "  min-height: 42px;",
        "  padding: 8px 10px;",
        "  font-size: 14px;",
        "}",
        "#" + MODAL_ID + " .tc-input {",
        "  margin-bottom: 12px;",
        "}",
        "#" + MODAL_ID + " .tc-textarea {",
        "  width: 100%;",
        "  box-sizing: border-box;",
        "  border: 1px solid #c9d6d0;",
        "  border-radius: 8px;",
        "  background: #ffffff;",
        "  color: #152033;",
        "  min-height: 120px;",
        "  padding: 10px;",
        "  font-family: Arial, Helvetica, sans-serif;",
        "  font-size: 14px;",
        "  line-height: 1.45;",
        "  resize: vertical;",
        "}",
        "#" + MODAL_ID + " .tc-actions {",
        "  display: flex;",
        "  flex-wrap: wrap;",
        "  gap: 10px;",
        "  margin-top: 18px;",
        "}",
        "#" + MODAL_ID + " button {",
        "  border: 0;",
        "  border-radius: 8px;",
        "  background: #2563eb;",
        "  color: #ffffff;",
        "  min-height: 40px;",
        "  padding: 9px 13px;",
        "  font-size: 14px;",
        "  font-weight: 700;",
        "  cursor: pointer;",
        "}",
        "#" + MODAL_ID + " button:hover { filter: brightness(0.96); }",
        "#" + MODAL_ID + " button:disabled {",
        "  cursor: not-allowed;",
        "  opacity: 0.55;",
        "}",
        "#" + MODAL_ID + " .tc-secondary {",
        "  border: 1px solid #d6ded9;",
        "  background: #ffffff;",
        "  color: #334155;",
        "}",
        "#" + MODAL_ID + " .tc-status {",
        "  margin-top: 16px;",
        "  border-radius: 8px;",
        "  background: #eef7ff;",
        "  color: #1f4b82;",
        "  padding: 10px 12px;",
        "  font-size: 14px;",
        "  line-height: 1.45;",
        "}",
        "#" + MODAL_ID + " .tc-status[data-type='success'] { background: #dcf7f1; color: #0f766e; }",
        "#" + MODAL_ID + " .tc-status[data-type='warning'] { background: #fff7e6; color: #7a4b00; }",
        "#" + MODAL_ID + " .tc-status[data-type='error'] { background: #ffecec; color: #8a1f1f; }",
        "." + SHARE_MENU_ITEM_CLASS + " {",
        "  display: flex;",
        "  align-items: center;",
        "  box-sizing: border-box;",
        "  border-radius: 8px;",
        "  color: #17212f;",
        "  min-height: 36px;",
        "  padding: 10px 12px;",
        "  font-family: Arial, Helvetica, sans-serif;",
        "  font-size: 14px;",
        "  font-weight: 600;",
        "  line-height: 1.2;",
        "  cursor: pointer;",
        "  white-space: nowrap;",
        "}",
        "." + SHARE_MENU_ITEM_CLASS + ":hover,",
        "." + SHARE_MENU_ITEM_CLASS + ":focus {",
        "  outline: none;",
        "  background: #eef7ff;",
        "  color: #1d4ed8;",
        "}",
        "@media (max-width: 560px) {",
        "  #" + MODAL_ID + " { padding: 12px; }",
        "  #" + MODAL_ID + " .tc-modal { padding: 18px; }",
        "  #" + MODAL_ID + " .tc-data-grid > div { grid-template-columns: 1fr; }",
        "  #" + MODAL_ID + " .tc-actions button { width: 100%; }",
        "}"
      ].join("\n");

      (document.head || document.documentElement).appendChild(style);
    }

    function wireModalEvents() {
      const elements = state.elements;

      elements.publishButton.addEventListener("click", function () {
        runAction(publishCoursework);
      });

      elements.closeButtons.forEach(function (button) {
        button.addEventListener("click", hideModal);
      });

      elements.overlay.addEventListener("click", function (event) {
        if (event.target === elements.overlay) {
          hideModal();
        }
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && elements.overlay.hidden === false) {
          hideModal();
        }
      });
    }

    function showModal(message) {
      const elements = ensureModal();
      state.evaluation = loadEvaluation() || state.evaluation;

      renderEvaluation();
      renderCourses();
      setStatus(message || "Listo.", getCurrentShareItem() ? "success" : "info");

      if (!isProbablyTangerine()) {
        setStatus("Aviso: no parece ser una página de Tangerine. El bookmarklet funciona mejor dentro de Tangerine.", "warning");
      }

      if (!getStoredAccessToken().token) {
        setStatus("Este favorito no tiene una conexión Google válida. Conecta Google en la página principal y vuelve a instalarlo.", "error");
      }

      elements.overlay.hidden = false;
      elements.dialog.focus();
    }

    function hideModal() {
      ensureModal().overlay.hidden = true;
    }

    function renderEvaluation() {
      const elements = ensureModal();
      const item = getCurrentShareItem();
      const hasItem = Boolean(item && item.guid && item.lesson_guid && item.url);

      elements.modalTitle.textContent = state.shareItem ? "Compartir en Classroom" : "Evaluación detectada";
      elements.publishButton.disabled = !hasItem;

      if (hasItem) {
        const itemKey = item.guid + "|" + item.lesson_guid + "|" + item.url;

        if (elements.messageInput.dataset.itemKey !== itemKey) {
          elements.titleInput.value = item.title || "Actividad Tangerine";
          elements.messageInput.value = buildDefaultClassroomMessage(item);
          elements.messageInput.dataset.itemKey = itemKey;
        }
      } else {
        elements.titleInput.value = "";
        elements.messageInput.value = "";
        elements.messageInput.dataset.itemKey = "";
      }
    }

    function getCurrentShareItem() {
      return state.shareItem || state.evaluation || null;
    }

    function buildDefaultClassroomMessage(item) {
      return [
        "Hola, comparto esta actividad de Tangerine.",
        "",
        "Ingresa al material desde el enlace adjunto y desarrolla la actividad indicada."
      ].join("\n");
    }

    function renderCourses() {
      const elements = ensureModal();
      const select = elements.courseSelect;
      const selectedValue = select.value;

      select.innerHTML = "";

      if (!state.courses.length) {
        appendOption(select, "", getStoredAccessToken().token ? "Cargando cursos..." : "Sin conexión Google", true);
        select.disabled = true;
        elements.publishButton.disabled = true;
        return;
      }

      appendOption(select, "", "Selecciona un curso", true);

      state.courses.forEach(function (course) {
        const label = [course.name, course.section].filter(Boolean).join(" - ");
        appendOption(select, course.id, label || course.id, false);
      });

      select.disabled = false;
      elements.publishButton.disabled = !getCurrentShareItem();

      if (selectedValue) {
        select.value = selectedValue;
      }
    }

    function appendOption(select, value, label, disabled) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.disabled = Boolean(disabled);
      option.selected = value === "";
      select.appendChild(option);
    }

    function setStatus(message, type) {
      const elements = ensureModal();
      elements.status.textContent = message;
      elements.status.dataset.type = type || "info";
    }

    function runAction(action) {
      Promise.resolve()
        .then(action)
        .catch(function (error) {
          setStatus(toReadableError(error), "error");
        });
    }

    async function loadCourses() {
      const token = await requireAccessToken();

      if (!token) {
        return;
      }

      setStatus("Cargando cursos de Google Classroom...", "info");

      const courses = await fetchAllCourses(token);
      state.courses = courses.filter(function (course) {
        return !course.courseState || course.courseState === "ACTIVE";
      });

      renderCourses();

      if (!state.courses.length) {
        setStatus("No se encontraron cursos activos en Google Classroom.", "warning");
        return;
      }

      setStatus("Cursos cargados: " + state.courses.length + ". Selecciona uno para publicar.", "success");
    }

    async function fetchAllCourses(token) {
      const courses = [];
      let pageToken = "";

      do {
        const url =
          "https://classroom.googleapis.com/v1/courses?pageSize=100" +
          (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");

        const response = await fetch(url, {
          headers: {
            Authorization: "Bearer " + token
          }
        });

        const body = await readResponseBody(response);

        if (!response.ok) {
          throw new Error(formatGoogleApiError("No se pudieron cargar los cursos", response, body));
        }

        courses.push.apply(courses, Array.isArray(body.courses) ? body.courses : []);
        pageToken = body.nextPageToken || "";
      } while (pageToken);

      return courses;
    }

    async function publishCoursework() {
      const item = getCurrentShareItem();

      if (!item || !item.guid || !item.lesson_guid || !item.url) {
        setStatus("No hay un recurso de Tangerine listo para publicar.", "error");
        return;
      }

      const token = await requireAccessToken();

      if (!token) {
        return;
      }

      if (!state.courses.length) {
        setStatus("Los cursos aún se están cargando o no hay cursos disponibles.", "error");
        return;
      }

      const courseId = state.elements.courseSelect.value;

      if (!courseId) {
        setStatus("Selecciona un curso de Google Classroom.", "error");
        return;
      }

      const body = {
        title: state.elements.titleInput.value.trim() || item.title || "Actividad Tangerine",
        description: state.elements.messageInput.value.trim() || buildDefaultClassroomMessage(item),
        materials: [
          {
            link: {
              url: item.url,
              title: state.elements.titleInput.value.trim() || item.title || "Actividad Tangerine"
            }
          }
        ],
        workType: "ASSIGNMENT",
        state: "PUBLISHED"
      };

      setStatus("Publicando tarea en Google Classroom...", "info");

      const response = await fetch("https://classroom.googleapis.com/v1/courses/" + encodeURIComponent(courseId) + "/courseWork", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const responseBody = await readResponseBody(response);

      if (!response.ok) {
        throw new Error(formatGoogleApiError("No se pudo publicar la tarea", response, responseBody));
      }

      setStatus("Tarea publicada correctamente en Google Classroom.", "success");
    }

    async function requireAccessToken() {
      const tokenState = getStoredAccessToken();

      if (tokenState.token) {
        return tokenState.token;
      }

      if (tokenState.reason === "expired") {
        setStatus("El token expiró. Vuelve a la página principal, conecta Google y reinstala el favorito.", "error");
        return null;
      }

      setStatus("Primero conecta con Google Classroom desde la página principal y vuelve a instalar el favorito.", "error");
      return null;
    }

    function getStoredAccessToken() {
      const token = getSessionValue(STORAGE_KEYS.token);
      const expiresAt = Number(getSessionValue(STORAGE_KEYS.expiresAt) || 0);

      if (!token) {
        return { reason: "missing", token: "" };
      }

      if (!expiresAt || Date.now() >= expiresAt - 60000) {
        try {
          window.sessionStorage.removeItem(STORAGE_KEYS.token);
          window.sessionStorage.removeItem(STORAGE_KEYS.expiresAt);
        } catch (error) {
          logDebug("No se pudo limpiar token expirado.", error);
        }

        return { reason: "expired", token: "" };
      }

      return { reason: "valid", token: token };
    }

    async function readResponseBody(response) {
      const text = await response.text();

      if (!text) {
        return {};
      }

      try {
        return JSON.parse(text);
      } catch (error) {
        return { rawText: text };
      }
    }

    function formatGoogleApiError(prefix, response, body) {
      const apiMessage =
        body && body.error && body.error.message
          ? body.error.message
          : body && body.rawText
            ? body.rawText
            : response.statusText || "Error desconocido";

      return prefix + " (" + response.status + "): " + apiMessage;
    }

    function isProbablyTangerine() {
      const text = [window.location.hostname, window.location.pathname, document.title].join(" ");
      return /tangerine/i.test(text);
    }

    function asCleanText(value) {
      return value === undefined || value === null ? "" : String(value).trim();
    }

    function toReadableError(error) {
      if (!error) {
        return "Ocurrió un error desconocido.";
      }

      return error.message || String(error);
    }

    function logDebug(message, detail) {
      if (window.console && typeof window.console.debug === "function") {
        window.console.debug("[Tangerine Classroom Bookmarklet] " + message, detail || "");
      }
    }
  }

  function minifyBookmarkletSource(source) {
    return source
      .split("\n")
      .map(function (line) {
        return line.trim();
      })
      .filter(function (line) {
        return line && line.indexOf("//") !== 0;
      })
      .join(" ");
  }

  function buildBookmarkletCode() {
    const options = arguments[0] || {};
    const accessToken = options.accessToken || "";
    const expiresAt = Number(options.expiresAt || 0);
    const source = "(" + runTangerineClassroomBookmarklet.toString() + ")();";

    return minifyBookmarkletSource(
      source
        .replace(
          'const INITIAL_ACCESS_TOKEN = "";',
          "const INITIAL_ACCESS_TOKEN = " + JSON.stringify(accessToken) + ";"
        )
        .replace(
          "const INITIAL_TOKEN_EXPIRES_AT = 0;",
          "const INITIAL_TOKEN_EXPIRES_AT = " + JSON.stringify(expiresAt) + ";"
        )
    );
  }

  function buildBookmarkletHref() {
    return "javascript:" + encodeURIComponent(buildBookmarkletCode(arguments[0]));
  }

  function getGoogleClientIdFromSource() {
    const match = runTangerineClassroomBookmarklet
      .toString()
      .match(/const GOOGLE_CLIENT_ID = "([^"]+)";/);

    return match ? match[1] : "";
  }

  function getGoogleScopes() {
    return [
      "https://www.googleapis.com/auth/classroom.courses.readonly",
      "https://www.googleapis.com/auth/classroom.coursework.students"
    ].join(" ");
  }

  if (typeof window !== "undefined") {
    window.TangerineClassroomBookmarkletInstaller = {
      buildCode: buildBookmarkletCode,
      buildHref: buildBookmarkletHref,
      getClientId: getGoogleClientIdFromSource,
      getScopes: getGoogleScopes,
      run: runTangerineClassroomBookmarklet
    };

    const currentScript = typeof document !== "undefined" ? document.currentScript : null;
    const isInstallHelper = currentScript && currentScript.hasAttribute("data-install-helper");

    if (!isInstallHelper) {
      runTangerineClassroomBookmarklet();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildCode: buildBookmarkletCode,
      buildHref: buildBookmarkletHref,
      getClientId: getGoogleClientIdFromSource,
      getScopes: getGoogleScopes
    };
  }
})();
