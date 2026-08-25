// Vinted "Dodaj ogłoszenie" auto-fill script — runs inside Safari via a
// Shortcuts "Run JavaScript on Webpage" action, in the user's own already
// logged-in tab. Not a standalone bot: this only drives the DOM of a page
// the user opened themselves in their own real browser session.
//
// STATUS: all form fields implemented against the real page structure
// (captured via Safari's JS console). NOT yet tested end-to-end as one run
// — next step is pasting a full fillListing() call into the console
// against a real draft and fixing whatever breaks. Photos are the one
// piece that can never be done from here — see the bottom of this file.

// React-controlled inputs ignore a plain `el.value = x` — the framework
// never sees it because it patches the value setter itself. Using the
// native HTMLInputElement/HTMLTextAreaElement setter directly, then firing
// a real "input" event, is what makes React's onChange actually fire.
function setReactInputValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value").set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function setTitle(text) {
  const el = document.querySelector('[data-testid="title--input"]');
  if (!el) throw new Error("title input not found");
  setReactInputValue(el, text);
}

function setDescription(text) {
  const el = document.querySelector('[data-testid="description--input"]');
  if (!el) throw new Error("description input not found");
  setReactInputValue(el, text);
}

function setPrice(zlotyString) {
  const el = document.querySelector('[data-testid="price-input--input"]');
  if (!el) throw new Error("price input not found");
  setReactInputValue(el, zlotyString);
}

// Generic "open a search-filtered picker, click the option whose visible
// name matches exactly" — confirmed against the brand picker
// (#brand-search-input + <div id="brand-NNN" aria-label="Nike">). Waits
// via polling since the option list renders asynchronously after typing.
async function pickFromSearchList(openTestId, searchInputSelector, optionText, { timeoutMs = 4000 } = {}) {
  const opener = document.querySelector(`[data-testid="${openTestId}"]`);
  if (!opener) throw new Error(`opener not found: ${openTestId}`);
  opener.click();

  const search = await waitFor(() => document.querySelector(searchInputSelector), timeoutMs);
  setReactInputValue(search, optionText);

  const option = await waitFor(() => {
    const candidates = [...document.querySelectorAll("div[aria-label], div[id^='brand-'], div[id*='-result'], div[role='option']")];
    return (
      candidates.find((el) => (el.getAttribute("aria-label") || "").trim() === optionText) ||
      // Category search results show a breadcrumb right under the name
      // (e.g. "Sneakersy, trampki i tenisówkiMężczyźni > Obuwie" as raw
      // textContent — there's no real newline, just CSS layout) — match on
      // the name being a prefix rather than requiring the full text to
      // match. When more than one category shares a name (Mężczyźni vs
      // Kobiety variants), this picks whichever appears first in the list.
      candidates.find((el) => (el.textContent || "").trim().startsWith(optionText)) ||
      null
    );
  }, timeoutMs);
  if (!option) throw new Error(`no option matched: ${optionText}`);
  option.click();
}

function selectCategory(name) {
  return pickFromSearchList("catalog-select-dropdown-input", "#catalog-search-input", name);
}

function selectBrand(name) {
  return pickFromSearchList("brand-select-dropdown-input", "#brand-search-input", name);
}

function waitFor(fn, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const result = fn();
      if (result) return resolve(result);
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

// Condition/color/size/material pickers don't have search boxes — they're
// static lists/grids of clickable rows once opened. The radio/checkbox
// element's own id (e.g. condition-radio-6) doesn't correspond to screen
// position (confirmed live: DOM order was 6,1,2,3,4 but on-screen order is
// "Nowy z metką, Nowy bez metki, Bardzo dobry, Dobry, ..."), so this
// matches by the row's own VISIBLE text instead of guessing an id. Clicks
// the nearest clickable ancestor (button/label/[role=button]/the input
// itself) rather than the text node, since the text is often just a
// heading inside a larger clickable row.
function clickRowByText(openTestId, exactText, { timeoutMs = 4000 } = {}) {
  const opener = document.querySelector(`[data-testid="${openTestId}"]`);
  if (!opener) throw new Error(`opener not found: ${openTestId}`);
  opener.click();

  return waitFor(() => {
    const all = [...document.querySelectorAll("div, li, span, label")];
    const match = all.find((el) => {
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent.trim())
        .join(" ")
        .trim();
      return ownText === exactText;
    });
    if (!match) return null;
    const clickable = match.closest("button, label, [role='button'], input") || match;
    clickable.click();
    return true;
  }, timeoutMs);
}

function selectCondition(text) {
  return clickRowByText("category-condition-single-list-input", text);
}

// Color/material pickers allow multiple selections and stay open after each
// click (confirmed: color picker's own testid input stays "Wybierz do 2
// kolorów" without auto-closing) — call once per color/material, the caller
// is responsible for closing the picker afterward (e.g. click elsewhere,
// or press Escape) since there's no visible "confirm" button captured yet.
async function selectColor(text) {
  await clickRowByText("color-select-dropdown-input", text);
}

async function selectMaterial(text) {
  await clickRowByText("category-material-multi-list-input", text);
}

// Size grid — plain buttons whose text is just the size value ("38"), no
// picker-opener testid captured separately from the input itself.
function selectSize(text) {
  return clickRowByText("category-size-single-grid-input", text);
}

// Package size — confirmed as plain radio inputs, no picker/modal at all
// (package_type_selector_1/2/3 = Mały/Średni/Duży in that order).
function selectPackageSize(sizeIndex) {
  const el = document.querySelector(`#package_type_selector_${sizeIndex}`);
  if (!el) throw new Error(`package size radio not found: ${sizeIndex}`);
  el.click();
}

function submit() {
  const el = document.querySelector('[data-testid="upload-form-save-button"]');
  if (!el) throw new Error("submit button not found");
  el.click();
}

// --- Not yet implemented ---
// - Photos: <input name="photos" data-testid="add-photos-input"> can't be
//   filled from page JS (browser security) — needs a separate AppleScript
//   step in the Shortcut that clicks "Dodaj zdjęcia" then types the file
//   path into the native macOS file-picker dialog that opens.
// - Full run order and the actual Shortcuts wiring (JS step + AppleScript
//   step + values coming from this app's already-generated Vinted draft)
//   — next step is assembling and testing this live against a real draft.
