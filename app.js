const CSV_PATH = "./expenses.csv";
const CATEGORIES_PATH = "./categories.csv";
const ACCOUNT_MAPPING_PATH = "./account-mapping.json";
const CONFIG = window.FINANCIAL_TRACKER_CONFIG || {};
const APP_STATE_PATH = CONFIG.appStateUrl || "./metadata/app-state.json";
const UPLOADED_CSV_KEY = "financial-tracker-uploaded-csv";
const CATEGORY_OVERRIDES_KEY = "financial-tracker-category-overrides";
const CATEGORY_STORE_KEY = "financial-tracker-managed-categories";
const AUTH_SESSION_KEY = "financial-tracker-authenticated";
const INDEXED_DB_NAME = "financial-tracker-cache";
const INDEXED_DB_VERSION = 1;
const CACHE_STORE_NAME = "app-cache";
const DATA_CACHE_KEY = "data";
const LOGIN_NAME = "mahmoud-alice";
const LOGIN_HASH = "d3c5dab4a47619c7a71bf97736c8c85b8e113b5f7b3a77ce160bc2252e4cd0f4";
const INITIAL_RENDER_LIMIT = 300;
const RESUME_REFRESH_AFTER_MS = 30_000;
let searchTimer = null;

const AURORA_WAKE_MESSAGES = [
  "Waking up Aurora database. It is currently finding its glasses.",
  "Aurora is putting its shoes on. Finance waits for no one, except serverless databases.",
  "The database is stretching. Excellent form, questionable urgency.",
  "Still waking Aurora. Somewhere, a query is doing tiny warm-up laps.",
];

const SAMPLE_CSV = `Date,Description,Amount,Category,Account
2026-06-29,Albert Heijn,-42.85,Groceries,Checking
2026-06-28,Salary,3150.00,Income,Checking
2026-06-27,NS International,-18.40,Transport,Checking
2026-06-26,Coffee,-4.20,Food,Checking
2026-06-24,Rent,-1280.00,Housing,Checking
2026-06-21,Freelance invoice,450.00,Income,Savings
2026-06-18,Spotify,-11.99,Subscriptions,Credit card`;

const CURRENCY = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "EUR",
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const salaryPeriodFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const state = {
  allTransactions: [],
  accountNames: {},
  categories: [],
  dataSource: "expenses.csv",
  selectedAccount: "all",
  selectedMonth: "all",
  selectedType: "all",
  selectedYear: "all",
  selectedView: "overview",
  categoryMode: "all",
  trendCategory: "",
  period: "salary",
  salaryMonthOffset: 0,
  search: "",
  authenticated: false,
  loading: false,
  serverState: null,
  lastLoadedAt: 0,
  lastResumeRefreshAt: 0,
  editingTransactionId: "",
  categorySearchTransactionId: "",
  openCategoryDialogName: "",
  categoryOverrides: CONFIG.apiBaseUrl ? {} : loadCategoryOverrides(),
};

const elements = {
  authView: document.querySelector("#authView"),
  appView: document.querySelector("#appView"),
  loginForm: document.querySelector("#loginForm"),
  loginName: document.querySelector("#loginName"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingTitle: document.querySelector("#loadingTitle"),
  loadingMessage: document.querySelector("#loadingMessage"),
  spentTotal: document.querySelector("#spentTotal"),
  incomeTotal: document.querySelector("#incomeTotal"),
  netTotal: document.querySelector("#netTotal"),
  needsTotal: document.querySelector("#needsTotal"),
  needsShare: document.querySelector("#needsShare"),
  wantsTotal: document.querySelector("#wantsTotal"),
  wantsShare: document.querySelector("#wantsShare"),
  investTotal: document.querySelector("#investTotal"),
  investShare: document.querySelector("#investShare"),
  savingsTotal: document.querySelector("#savingsTotal"),
  savingsShare: document.querySelector("#savingsShare"),
  transactionSearchField: document.querySelector("#transactionSearchField"),
  searchInput: document.querySelector("#searchInput"),
  statusPanel: document.querySelector("#statusPanel"),
  accountFilter: document.querySelector("#accountFilter"),
  yearFilter: document.querySelector("#yearFilter"),
  monthFilter: document.querySelector("#monthFilter"),
  typeFilter: document.querySelector("#typeFilter"),
  categoryRanking: document.querySelector("#categoryRanking"),
  categoryMode: document.querySelector("#categoryMode"),
  rankingScope: document.querySelector("#rankingScope"),
  expensePie: document.querySelector("#expensePie"),
  pieLegend: document.querySelector("#pieLegend"),
  pieScope: document.querySelector("#pieScope"),
  trendCategorySelect: document.querySelector("#trendCategorySelect"),
  trendChart: document.querySelector("#trendChart"),
  monthlyList: document.querySelector("#monthlyList"),
  overviewView: document.querySelector("#overviewView"),
  trendsView: document.querySelector("#trendsView"),
  accountsView: document.querySelector("#accountsView"),
  categoriesView: document.querySelector("#categoriesView"),
  uncategorizedView: document.querySelector("#uncategorizedView"),
  transactionsView: document.querySelector("#transactionsView"),
  fetchTransactionsButton: document.querySelector("#fetchTransactionsButton"),
  latestAccountsList: document.querySelector("#latestAccountsList"),
  latestAccountsScope: document.querySelector("#latestAccountsScope"),
  categoryCreateForm: document.querySelector("#categoryCreateForm"),
  categoryEditorList: document.querySelector("#categoryEditorList"),
  exportCategoriesButton: document.querySelector("#exportCategoriesButton"),
  categoryEditDialog: document.querySelector("#categoryEditDialog"),
  categoryEditTitle: document.querySelector("#categoryEditTitle"),
  editCategoryOriginalName: document.querySelector("#editCategoryOriginalName"),
  editCategoryName: document.querySelector("#editCategoryName"),
  editCategoryBucket: document.querySelector("#editCategoryBucket"),
  editCategoryType: document.querySelector("#editCategoryType"),
  editCategoryBudget: document.querySelector("#editCategoryBudget"),
  saveCategoryButton: document.querySelector("#saveCategoryButton"),
  deleteCategoryButton: document.querySelector("#deleteCategoryButton"),
  newCategoryName: document.querySelector("#newCategoryName"),
  newCategoryBucket: document.querySelector("#newCategoryBucket"),
  newCategoryType: document.querySelector("#newCategoryType"),
  newCategoryBudget: document.querySelector("#newCategoryBudget"),
  categoryDialog: document.querySelector("#categoryDialog"),
  categoryDialogBucket: document.querySelector("#categoryDialogBucket"),
  categoryDialogTitle: document.querySelector("#categoryDialogTitle"),
  categoryDialogSummary: document.querySelector("#categoryDialogSummary"),
  categoryDialogList: document.querySelector("#categoryDialogList"),
  categorySearchDialog: document.querySelector("#categorySearchDialog"),
  categorySearchTitle: document.querySelector("#categorySearchTitle"),
  categorySearchInput: document.querySelector("#categorySearchInput"),
  categorySearchList: document.querySelector("#categorySearchList"),
  categorySearchCloseButton: document.querySelector("#categorySearchCloseButton"),
  transactionEditDialog: document.querySelector("#transactionEditDialog"),
  transactionEditTitle: document.querySelector("#transactionEditTitle"),
  transactionEditSummary: document.querySelector("#transactionEditSummary"),
  transactionEditCategory: document.querySelector("#transactionEditCategory"),
  transactionEditShortDescription: document.querySelector("#transactionEditShortDescription"),
  transactionEditOverrideMonth: document.querySelector("#transactionEditOverrideMonth"),
  transactionEditTravelTag: document.querySelector("#transactionEditTravelTag"),
  saveTransactionCategoryButton: document.querySelector("#saveTransactionCategoryButton"),
  transactionCount: document.querySelector("#transactionCount"),
  transactionList: document.querySelector("#transactionList"),
  emptyState: document.querySelector("#emptyState"),
  uncategorizedCount: document.querySelector("#uncategorizedCount"),
  uncategorizedTotal: document.querySelector("#uncategorizedTotal"),
  uncategorizedList: document.querySelector("#uncategorizedList"),
  uncategorizedEmptyState: document.querySelector("#uncategorizedEmptyState"),
  downloadButton: document.querySelector("#downloadButton"),
  refreshButton: document.querySelector("#refreshButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  categoryEditCount: document.querySelector("#categoryEditCount"),
  csvMode: document.querySelector("#csvMode"),
  csvFileInput: document.querySelector("#csvFileInput"),
  csvRefreshButton: document.querySelector("#csvRefreshButton"),
  clearUploadButton: document.querySelector("#clearUploadButton"),
  resetCategoriesButton: document.querySelector("#resetCategoriesButton"),
  salaryPeriodNav: document.querySelector("#salaryPeriodNav"),
  salaryPeriodLabel: document.querySelector("#salaryPeriodLabel"),
  salaryPrevButton: document.querySelector("#salaryPrevButton"),
  salaryNextButton: document.querySelector("#salaryNextButton"),
  customDateFilters: document.querySelectorAll(".custom-date-filter"),
  periodButtons: document.querySelectorAll("[data-period]"),
  viewTabs: document.querySelectorAll("[data-view]"),
};

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const login = elements.loginName.value.trim().toLowerCase();
  const password = elements.loginPassword.value;

  if (await isValidLogin(login, password)) {
    localStorage.setItem(AUTH_SESSION_KEY, "yes");
    elements.loginPassword.value = "";
    elements.loginError.classList.add("hidden");
    startAuthenticatedApp();
    return;
  }

  elements.loginError.classList.remove("hidden");
  elements.loginPassword.select();
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value.trim().toLowerCase();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 120);
});

elements.viewTabs.forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedView = button.dataset.view;
    elements.viewTabs.forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

elements.periodButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.period = button.dataset.period;
    if (state.period === "salary") {
      state.selectedYear = "all";
      state.selectedMonth = "all";
      elements.yearFilter.value = "all";
      elements.monthFilter.value = "all";
    } else if (state.period === "custom" && (state.selectedYear === "all" || state.selectedMonth === "all")) {
      const now = new Date();
      state.selectedYear = String(now.getFullYear());
      state.selectedMonth = String(now.getMonth() + 1);
      elements.yearFilter.value = state.selectedYear;
      elements.monthFilter.value = state.selectedMonth;
    }
    elements.periodButtons.forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

elements.salaryPrevButton.addEventListener("click", () => {
  state.salaryMonthOffset -= 1;
  render();
});

elements.salaryNextButton.addEventListener("click", () => {
  state.salaryMonthOffset += 1;
  render();
});

[elements.accountFilter, elements.yearFilter, elements.monthFilter, elements.typeFilter].forEach((select) => {
  select.addEventListener("change", () => {
    state.selectedAccount = elements.accountFilter.value;
    state.selectedYear = elements.yearFilter.value;
    state.selectedMonth = elements.monthFilter.value;
    state.selectedType = elements.typeFilter.value;
    render();
  });
});

elements.trendCategorySelect.addEventListener("change", () => {
  state.trendCategory = elements.trendCategorySelect.value;
  renderTrends();
});

elements.categoryMode.addEventListener("change", () => {
  state.categoryMode = elements.categoryMode.value;
  renderOverview(getFilteredTransactions({ includeSearch: false }));
});

elements.categoryCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addCategoryFromForm();
});

elements.categoryEditorList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category-action]");
  if (!button) {
    return;
  }

  const item = button.closest("[data-category-name]");
  if (!item) {
    return;
  }

  if (button.dataset.categoryAction === "edit") {
    openCategoryEditor(item.dataset.categoryName);
  }
});

elements.categoryDialogList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-transaction-id]");
  if (!button) {
    return;
  }

  openTransactionCategoryDialog(button.dataset.transactionId);
});

elements.categorySearchInput.addEventListener("input", () => {
  renderCategorySearchOptions();
});

elements.categorySearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
  }
});

elements.categorySearchList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-category-name]");
  if (!button) {
    return;
  }

  await chooseCategoryFromSearch(button.dataset.categoryName);
});

elements.categorySearchCloseButton.addEventListener("click", () => {
  elements.categorySearchDialog.close();
});

elements.categorySearchDialog.addEventListener("close", () => {
  state.categorySearchTransactionId = "";
  elements.categorySearchInput.value = "";
});

if (elements.exportCategoriesButton) {
  elements.exportCategoriesButton.addEventListener("click", () => {
    downloadCategoriesCsv();
  });
}

elements.saveCategoryButton.addEventListener("click", async () => {
  await saveCategoryDialog();
});

elements.deleteCategoryButton.addEventListener("click", async () => {
  await deleteCategoryDialog();
});

elements.saveTransactionCategoryButton.addEventListener("click", async () => {
  await saveTransactionCategoryDialog();
});

elements.refreshButton.addEventListener("click", () => {
  loadAppData({
    title: "Checking for changes",
    message: "Peeking at the tiny S3 marker before bothering Aurora.",
  });
});

elements.fetchTransactionsButton.addEventListener("click", () => {
  setStatus("Fetch is ready for wiring, but not connected yet. Next stop: trigger the GoCardless sync safely.");
});

if (elements.downloadButton) {
  elements.downloadButton.addEventListener("click", () => {
    downloadCategorizedCsv();
  });
}

if (elements.settingsButton) {
  elements.settingsButton.addEventListener("click", () => {
    updateSettings();
    elements.settingsDialog.showModal();
  });
}

elements.csvRefreshButton.addEventListener("click", () => {
  loadAppData({ forceRefresh: true });
});

elements.clearUploadButton.addEventListener("click", () => {
  localStorage.removeItem(UPLOADED_CSV_KEY);
  elements.csvFileInput.value = "";
  loadTransactions();
  updateSettings();
});

elements.resetCategoriesButton.addEventListener("click", () => {
  if (CONFIG.apiBaseUrl) {
    setStatus("Category edits now live in the database. Use the Categories tab or transaction dropdowns to change them.");
    return;
  }

  state.categoryOverrides = {};
  saveCategoryOverrides();
  state.allTransactions = state.allTransactions.map((transaction) => ({
    ...transaction,
    category: transaction.originalCategory,
  }));
  render();
  updateSettings();
});

elements.csvFileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  const csv = await file.text();
  localStorage.setItem(UPLOADED_CSV_KEY, csv);
  state.dataSource = file.name;
  state.allTransactions = parseTransactions(csv);
  render();
  updateSettings();
  setStatus(`Loaded ${file.name} on this device.`);
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshAfterAppResume();
  }
});

window.addEventListener("focus", () => {
  refreshAfterAppResume();
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    refreshAfterAppResume(true);
  }
});

initializeAuth();

function initializeAuth() {
  if (localStorage.getItem(AUTH_SESSION_KEY) === "yes") {
    startAuthenticatedApp();
    return;
  }

  elements.authView.classList.remove("hidden");
  elements.appView.classList.add("hidden");
  elements.loginName.focus();
}

function startAuthenticatedApp() {
  state.authenticated = true;
  elements.authView.classList.add("hidden");
  elements.appView.classList.remove("hidden");
  loadAppData();
}

async function refreshAfterAppResume(force = false) {
  if (!CONFIG.apiBaseUrl || !state.authenticated || state.loading || document.visibilityState === "hidden") {
    return;
  }

  const now = Date.now();
  const appDataIsFresh = now - state.lastLoadedAt < RESUME_REFRESH_AFTER_MS;
  const resumeCheckIsFresh = now - state.lastResumeRefreshAt < RESUME_REFRESH_AFTER_MS;
  if (!force && (appDataIsFresh || resumeCheckIsFresh)) {
    return;
  }

  state.lastResumeRefreshAt = now;
  await loadAppData({
    title: "Checking the database",
    message: "Checking the tiny S3 note first, so Aurora can keep sleeping if nothing changed.",
  });
}

async function loadAppData(loadingCopy = {}) {
  await loadAccountNames();
  if (CONFIG.apiBaseUrl) {
    await loadApiBackedAppData(loadingCopy);
    return;
  }

  await loadCategories();
  await loadTransactions(loadingCopy);
}

async function loadApiBackedAppData(loadingCopy = {}) {
  setStatus("");
  const cachedData = await readCachedAppData();
  let serverState = null;

  try {
    serverState = await fetchAppState();
  } catch (error) {
    if (cachedData) {
      applyCachedAppData(cachedData, "Local cache");
      setStatus("Using local cache. Could not check the S3 freshness marker just now.");
      return;
    }
  }

  if (!loadingCopy.forceRefresh && cachedData && serverState && cacheMatchesServer(cachedData, serverState)) {
    state.serverState = serverState;
    applyCachedAppData(cachedData, "Local cache");
    return;
  }

  await loadCategories();
  await loadTransactions({
    title: loadingCopy.title || "Loading transactions",
    message: loadingCopy.message || "S3 says something changed, so Aurora gets a polite wake-up call.",
  });
  state.serverState = serverState || (await fetchAppState().catch(() => null));
  await writeCachedAppData();
}

async function fetchAppState() {
  const separator = APP_STATE_PATH.includes("?") ? "&" : "?";
  const response = await fetch(`${APP_STATE_PATH}${separator}t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Freshness marker failed with ${response.status}.`);
  }
  return response.json();
}

function cacheMatchesServer(cachedData, serverState) {
  return Boolean(cachedData?.metadata?.version && serverState?.version && cachedData.metadata.version === serverState.version);
}

function applyCachedAppData(cachedData, sourceLabel) {
  state.categories = cachedData.categories || [];
  state.allTransactions = normalizeCachedTransactions(cachedData.transactions || []);
  state.serverState = cachedData.metadata || state.serverState;
  state.dataSource = sourceLabel;
  populateFilters();
  render();
  state.lastLoadedAt = Date.now();
  updateSettings();
}

function normalizeCachedTransactions(transactions) {
  return transactions.map((transaction) => {
    const date = transaction.date instanceof Date ? transaction.date : parseDate(transaction.date);
    const overrideMonth = normalizeOverrideMonth(transaction.overrideMonth || "");
    const effectiveDate = getEffectiveDate(date, overrideMonth);
    return {
      ...transaction,
      date,
      dateValue: date ? date.getTime() : transaction.dateValue || 0,
      overrideMonth,
      effectiveDate,
      effectiveDateValue: effectiveDate ? effectiveDate.getTime() : date ? date.getTime() : transaction.effectiveDateValue || 0,
    };
  });
}

async function writeCachedAppData(metadata = state.serverState) {
  if (!CONFIG.apiBaseUrl || !metadata?.version) {
    return;
  }

  await writeCacheRecord(DATA_CACHE_KEY, {
    metadata,
    cachedAt: new Date().toISOString(),
    categories: state.categories,
    transactions: state.allTransactions,
  });
}

async function readCachedAppData() {
  return readCacheRecord(DATA_CACHE_KEY);
}

function openAppCacheDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(CACHE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCacheRecord(key) {
  const db = await openAppCacheDb();
  if (!db) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CACHE_STORE_NAME, "readonly");
    const request = transaction.objectStore(CACHE_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function writeCacheRecord(key, value) {
  const db = await openAppCacheDb();
  if (!db) {
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CACHE_STORE_NAME, "readwrite");
    transaction.objectStore(CACHE_STORE_NAME).put(value, key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function updateLocalCacheFromWrite(metadata) {
  if (!metadata?.version) {
    state.serverState = await fetchAppState().catch(() => state.serverState);
  } else {
    state.serverState = metadata;
  }
  await writeCachedAppData();
}

async function loadAccountNames() {
  try {
    const response = await fetch(ACCOUNT_MAPPING_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}.`);
    }

    state.accountNames = normalizeAccountMapping(await response.json());
  } catch (error) {
    state.accountNames = {};
  }
}

function normalizeAccountMapping(mapping) {
  if (Array.isArray(mapping)) {
    return mapping.reduce((accounts, account) => {
      const id = account.id || account.accountId || account.account_id;
      const name = account.name || account.displayName || account.label;
      if (id && name) {
        accounts[id] = name;
      }
      return accounts;
    }, {});
  }

  if (!mapping || typeof mapping !== "object") {
    return {};
  }

  return Object.entries(mapping).reduce((accounts, [id, account]) => {
    if (typeof account === "string") {
      accounts[id] = account;
    } else if (account?.name || account?.displayName || account?.label) {
      accounts[id] = account.name || account.displayName || account.label;
    }
    return accounts;
  }, {});
}

function getAccountName(accountId) {
  if (!accountId) {
    return "Unmapped historical account";
  }
  if (accountId === "dry-run-account") {
    return "Dry run account";
  }
  return state.accountNames[accountId] || accountId;
}

function getTransactionAccountName(transaction) {
  return state.accountNames[transaction.account] || transaction.accountFriendlyName || getAccountName(transaction.account);
}

async function loadTransactions(loadingCopy = {}) {
  setStatus("");
  state.loading = true;
  setLoading(
    true,
    loadingCopy.title || "Loading transactions",
    loadingCopy.message || "Asking the database for your money diary."
  );
  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = "Loading";

  try {
    if (CONFIG.apiBaseUrl) {
      state.dataSource = "AWS database";
      state.allTransactions = await fetchApiTransactionsWithWakeRetry();
    } else {
      const uploadedCsv = localStorage.getItem(UPLOADED_CSV_KEY);
      const csv = uploadedCsv || (await fetchCsvFile());
      state.dataSource = uploadedCsv ? "Uploaded CSV" : "expenses.csv";
      state.allTransactions = parseTransactions(csv);
    }
    populateFilters();
    render();
    state.lastLoadedAt = Date.now();
  } catch (error) {
    if (isAuroraWakingError(error)) {
      setStatus("Aurora is taking longer than expected to wake up. Tap Refresh in a moment and it should be ready.");
    } else {
      state.dataSource = "Sample data";
      state.allTransactions = parseTransactions(SAMPLE_CSV);
      render();
      setStatus(`Could not load transactions yet. Showing sample data. ${error.message}`);
    }
  } finally {
    state.loading = false;
    setLoading(false);
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = "Refresh";
    updateSettings();
  }
}

async function fetchApiTransactionsWithWakeRetry() {
  return withAuroraWakeRetry(fetchApiTransactions);
}

async function withAuroraWakeRetry(operation) {
  const retryDelays = [2500, 4000, 6000, 8000, 10000];
  let lastError = null;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isAuroraWakingError(error)) {
        throw error;
      }

      lastError = error;
      if (attempt === retryDelays.length) {
        break;
      }

      setLoading(
        true,
        "Waking up Aurora database",
        AURORA_WAKE_MESSAGES[Math.min(attempt, AURORA_WAKE_MESSAGES.length - 1)]
      );
      await delay(retryDelays[attempt]);
    }
  }

  throw lastError;
}

async function fetchApiTransactions() {
  const transactions = [];
  let offset = 0;
  const limit = 1000;

  for (let page = 0; page < 30; page += 1) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const payload = await apiRequest(`/transactions?${params.toString()}`);
    transactions.push(...payload.transactions.map(apiTransactionToAppTransaction));
    if (payload.nextOffset === null || payload.nextOffset === undefined) {
      break;
    }
    offset = payload.nextOffset;
  }

  return transactions;
}

async function apiRequest(path, options = {}) {
  const url = new URL(`${CONFIG.apiBaseUrl.replace(/\/$/, "")}${path}`);
  const headers = {};
  if (CONFIG.apiKey) {
    headers["x-api-key"] = CONFIG.apiKey;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    cache: "no-store",
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with ${response.status}.`);
    error.type = payload.type || "";
    throw error;
  }
  return payload;
}

function apiTransactionToAppTransaction(transaction) {
  const date = parseDate(transaction.date);
  const effectiveDate = getEffectiveDate(date, transaction.overrideMonth);
  const rawCategory = transaction.category || "Uncategorized";
  const originalCategory = transaction.originalCategory || rawCategory;
  const category = getDisplayCategory(rawCategory, transaction.categoryOverride);
  const id = String(transaction.id || transaction.transactionId || `${transaction.date}-${transaction.description}`);

  return {
    id,
    date,
    dateValue: date ? date.getTime() : 0,
    effectiveDate,
    effectiveDateValue: effectiveDate ? effectiveDate.getTime() : date ? date.getTime() : 0,
    description: transaction.description || "Untitled transaction",
    shortDescription: transaction.shortDescription || "",
    overrideMonth: normalizeOverrideMonth(transaction.overrideMonth || ""),
    travelTag: transaction.travelTag || "",
    accountFriendlyName: transaction.accountFriendlyName || "",
    originalCategory,
    category: category,
    account: transaction.account || "",
    type: getCategoryMeta(category).type || "",
    amount: Number(transaction.amount) || 0,
  };
}

function getDisplayCategory(category, categoryOverride) {
  if (categoryOverride) {
    return category;
  }

  if (getCategoryMeta(category).name) {
    return category;
  }

  return "Uncategorized";
}

async function loadCategories() {
  try {
    if (CONFIG.apiBaseUrl) {
      state.categories = await fetchApiCategoriesWithWakeRetry();
    } else {
      const response = await fetch(CATEGORIES_PATH, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}.`);
      }
      const csv = await response.text();
      state.categories = loadManagedCategories(parseCategories(csv));
    }
  } catch (error) {
    state.categories = loadManagedCategories([]);
    setStatus(`Could not load categories.csv yet. ${error.message}`);
  }
}

async function fetchApiCategoriesWithWakeRetry() {
  return withAuroraWakeRetry(fetchApiCategories);
}

async function fetchApiCategories() {
  const payload = await apiRequest("/categories");
  return payload.categories || [];
}

async function fetchCsvFile() {
  const response = await fetch(CSV_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}.`);
  }
  return response.text();
}

function parseTransactions(csv) {
  const rows = parseCsv(csv).filter((row) => row.some((value) => value.trim()));
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map(normalizeHeader);
  return rows
    .slice(1)
    .map((row, index) => rowToTransaction(row, headers, index))
    .filter((transaction) => transaction.date || transaction.description || transaction.amount !== 0)
    .sort((a, b) => b.dateValue - a.dateValue);
}

function rowToTransaction(row, headers, index) {
  const get = (...names) => {
    const targetIndex = headers.findIndex((header) => names.includes(header));
    return targetIndex >= 0 ? row[targetIndex]?.trim() || "" : "";
  };

  const dateRaw = get("date", "transactiondate", "bookdate", "posteddate");
  const description =
    get("description", "longdescription", "shortdescription", "merchant", "name", "counterparty", "payee", "details") ||
    "Untitled transaction";
  const category = get("category", "uncategorizedtransactions011634", "type", "label") || "Uncategorized";
  const account = get("account", "accountnumber", "bank", "wallet") || "";
  const amount = parseAmount(get("amount", "value", "transactionamount", "debitcredit"));
  const date = parseDate(dateRaw);
  const overrideMonth = get("overridemonth");
  const effectiveDate = getEffectiveDate(date, overrideMonth);

  const id = `${dateRaw}-${description}-${amount}-${index}`;
  return {
    id: `${dateRaw}-${description}-${amount}-${index}`,
    date,
    dateValue: date ? date.getTime() : 0,
    effectiveDate,
    effectiveDateValue: effectiveDate ? effectiveDate.getTime() : date ? date.getTime() : 0,
    description,
    shortDescription: get("shortdescription"),
    overrideMonth: normalizeOverrideMonth(overrideMonth),
    travelTag: get("traveltag"),
    accountFriendlyName: get("accountfriendlyname"),
    originalCategory: category,
    category: state.categoryOverrides[id] || category,
    account,
    type: getCategoryMeta(state.categoryOverrides[id] || category).type || "",
    amount,
  };
}

function parseCategories(csv) {
  const rows = parseCsv(csv).filter((row) => row.some((value) => value.trim()));
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map(normalizeHeader);
  const categoryIndex = headers.indexOf("category");
  const bucketIndex = headers.indexOf("bucket");
  const typeIndex = headers.indexOf("type");
  let currentBucket = "Other";

  return rows
    .slice(1)
    .map((row) => {
      if (bucketIndex >= 0 && row[bucketIndex]?.trim()) {
        currentBucket = row[bucketIndex].trim();
      }

      return {
        name: categoryIndex >= 0 ? row[categoryIndex]?.trim() || "" : "",
        bucket: currentBucket,
        type: typeIndex >= 0 ? row[typeIndex]?.trim() || "" : "",
        actualExpense: getByHeader(row, headers, "actualexpense"),
        regularExpense: getByHeader(row, headers, "regularexpense"),
        frequency: getByHeader(row, headers, "frequencyforregularexpenseonly"),
        monthlyBudget: parseAmount(getByHeader(row, headers, "monthlybudget")),
      };
    })
    .filter((category) => category.name)
    .filter((category, index, categories) => categories.findIndex((item) => item.name === category.name) === index);
}

function getByHeader(row, headers, name) {
  const index = headers.indexOf(name);
  return index >= 0 ? row[index]?.trim() || "" : "";
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseAmount(value) {
  if (!value) {
    return 0;
  }

  const cleaned = value.replace(/[^\d,.-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = cleaned.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    normalized = normalizeSingleSeparatorAmount(cleaned, ",");
  } else if (lastDot >= 0) {
    normalized = normalizeSingleSeparatorAmount(cleaned, ".");
  }

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeSingleSeparatorAmount(value, separator) {
  const escaped = separator === "." ? "\\." : separator;
  const thousandsPattern = new RegExp(`^-?\\d{1,3}(${escaped}\\d{3})+$`);

  if (thousandsPattern.test(value)) {
    return value.split(separator).join("");
  }

  return value.replace(separator, ".");
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  const compactDateMatch = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const europeanMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);

  if (compactDateMatch) {
    return new Date(Number(compactDateMatch[1]), Number(compactDateMatch[2]) - 1, Number(compactDateMatch[3]));
  }

  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  if (europeanMatch) {
    return new Date(Number(europeanMatch[3]), Number(europeanMatch[2]) - 1, Number(europeanMatch[1]));
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeOverrideMonth(value) {
  const text = String(value || "").trim();
  if (/^\d{4}\/\d{2}$/.test(text)) {
    return text.replace("/", "-");
  }
  return /^\d{4}-\d{2}$/.test(text) ? text : "";
}

function getEffectiveDate(date, overrideMonth) {
  const normalized = normalizeOverrideMonth(overrideMonth);
  if (!normalized) {
    return date;
  }

  const [year, month] = normalized.split("-").map(Number);
  const day = date?.getDate?.() || 1;
  return new Date(year, month - 1, Math.min(day, daysInMonth(year, month)));
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getTransactionPeriodDate(transaction) {
  return transaction.effectiveDate || transaction.date;
}

function populateFilters() {
  const years = [...new Set(state.allTransactions.map((transaction) => transaction.date?.getFullYear()).filter(Boolean))]
    .sort((a, b) => b - a);
  const accounts = [...new Set(state.allTransactions.map((transaction) => transaction.account).filter(Boolean))]
    .sort((a, b) => getAccountName(a).localeCompare(getAccountName(b)));

  syncOptions(elements.accountFilter, [["all", "All accounts"], ...accounts.map((account) => [account, getAccountName(account)])], state.selectedAccount);
  syncOptions(elements.yearFilter, [["all", "All years"], ...years.map((year) => [String(year), String(year)])], state.selectedYear);
  syncOptions(
    elements.monthFilter,
    [
      ["all", "All months"],
      ["1", "Jan"],
      ["2", "Feb"],
      ["3", "Mar"],
      ["4", "Apr"],
      ["5", "May"],
      ["6", "Jun"],
      ["7", "Jul"],
      ["8", "Aug"],
      ["9", "Sep"],
      ["10", "Oct"],
      ["11", "Nov"],
      ["12", "Dec"],
    ],
    state.selectedMonth
  );
  populateTrendCategories();
}

function syncOptions(select, options, selectedValue) {
  const previousValue = options.some(([value]) => value === selectedValue) ? selectedValue : "all";
  select.innerHTML = "";
  options.forEach(([value, label]) => {
    select.append(new Option(label, value));
  });
  select.value = previousValue;
}

function populateTrendCategories() {
  const categories = getCategorySummaries(getFilteredTransactions({ includeSearch: false }))
    .filter((category) => category.total !== 0)
    .map((category) => category.name);

  const fallbackCategories = state.categories.map((category) => category.name);
  const options = [...new Set(categories.length ? categories : fallbackCategories)].sort();
  elements.trendCategorySelect.innerHTML = "";
  options.forEach((category) => {
    elements.trendCategorySelect.append(new Option(category, category));
  });

  if (!state.trendCategory || !options.includes(state.trendCategory)) {
    state.trendCategory = options[0] || "";
  }
  elements.trendCategorySelect.value = state.trendCategory;
}

function render() {
  renderActiveView();
  updateSalaryPeriodControls();
  const transactions = getFilteredTransactions({ includeSearch: false });
  const searchedTransactions = getFilteredTransactions({ includeSearch: state.selectedView === "transactions" });
  renderSummary(transactions);
  renderOverview(transactions);
  populateTrendCategories();
  renderTrends();
  renderLatestAccounts();
  renderCategoryEditor();
  renderUncategorizedTransactions(transactions);
  renderTransactions(searchedTransactions);
}

function renderActiveView() {
  elements.transactionSearchField.classList.toggle("hidden", state.selectedView !== "transactions");
  elements.overviewView.classList.toggle("hidden", state.selectedView !== "overview");
  elements.trendsView.classList.toggle("hidden", state.selectedView !== "trends");
  elements.accountsView.classList.toggle("hidden", state.selectedView !== "accounts");
  elements.categoriesView.classList.toggle("hidden", state.selectedView !== "categories");
  elements.uncategorizedView.classList.toggle("hidden", state.selectedView !== "uncategorized");
  elements.transactionsView.classList.toggle("hidden", state.selectedView !== "transactions");
}

function getFilteredTransactions({ includeSearch }) {
  const salaryPeriod = getSalaryPeriod(state.salaryMonthOffset);

  return state.allTransactions.filter((transaction) => {
    const searchable = [
      transaction.description,
      transaction.shortDescription,
      transaction.category,
      transaction.travelTag,
      transaction.account,
      transaction.accountFriendlyName,
      getTransactionAccountName(transaction),
    ]
      .join(" ")
      .toLowerCase();
    const periodDate = getTransactionPeriodDate(transaction);
    const matchesSearch = !includeSearch || !state.search || searchable.includes(state.search);
    const matchesPeriod =
      state.period !== "salary" || (periodDate >= salaryPeriod.start && periodDate < salaryPeriod.endExclusive);
    const matchesAccount = state.selectedAccount === "all" || transaction.account === state.selectedAccount;
    const matchesYear =
      state.period !== "custom" || state.selectedYear === "all" || periodDate?.getFullYear() === Number(state.selectedYear);
    const matchesMonth =
      state.period !== "custom" || state.selectedMonth === "all" || periodDate?.getMonth() + 1 === Number(state.selectedMonth);
    const type = getTransactionType(transaction);
    const matchesType = state.selectedType === "all" || type === state.selectedType;

    return matchesSearch && matchesPeriod && matchesAccount && matchesYear && matchesMonth && matchesType;
  });
}

function getSalaryPeriod(offset = 0) {
  const today = new Date();
  const baseMonth = today.getDate() >= 24 ? today.getMonth() : today.getMonth() - 1;
  const start = new Date(today.getFullYear(), baseMonth + offset, 24);
  const endInclusive = new Date(start.getFullYear(), start.getMonth() + 1, 23);
  const endExclusive = new Date(start.getFullYear(), start.getMonth() + 1, 24);
  return { start, endInclusive, endExclusive };
}

function updateSalaryPeriodControls() {
  const isSalaryPeriod = state.period === "salary";
  elements.salaryPeriodNav.classList.toggle("hidden", !isSalaryPeriod);
  elements.customDateFilters.forEach((element) => {
    element.classList.toggle("hidden", state.period !== "custom");
  });
  if (!isSalaryPeriod) {
    return;
  }

  const period = getSalaryPeriod(state.salaryMonthOffset);
  const start = salaryPeriodFormatter.format(period.start);
  const end = salaryPeriodFormatter.format(period.endInclusive);
  const year = period.endInclusive.getFullYear();
  elements.salaryPeriodLabel.textContent = `${start} - ${end}, ${year}`;
  elements.salaryNextButton.disabled = state.salaryMonthOffset >= 0;
}

function renderSummary(transactions) {
  const income = transactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((total, transaction) => total + transaction.amount, 0);
  const spent = transactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
  const net = income - spent;

  elements.spentTotal.textContent = CURRENCY.format(spent);
  elements.incomeTotal.textContent = CURRENCY.format(income);
  elements.netTotal.textContent = CURRENCY.format(net);
}

function renderOverview(transactions = getFilteredTransactions({ includeSearch: true })) {
  const spent = transactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
  const income = transactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((total, transaction) => total + transaction.amount, 0);
  const needs = totalByType(transactions, "Need");
  const wants = totalByType(transactions, "Want");
  const invest = totalByType(transactions, "Invest");
  const savings = income - spent;

  setInsight(elements.needsTotal, elements.needsShare, needs, spent);
  setInsight(elements.wantsTotal, elements.wantsShare, wants, spent);
  setInsight(elements.investTotal, elements.investShare, invest, spent);
  setInsight(elements.savingsTotal, elements.savingsShare, savings, income);
  const summaries = getCategorySummaries(transactions);
  renderExpensePie(summaries);
  renderCategoryRanking(summaries);
}

function totalByType(transactions, type) {
  return transactions
    .filter((transaction) => getTransactionType(transaction) === type)
    .reduce((total, transaction) => total + Math.abs(Math.min(transaction.amount, 0)), 0);
}

function setInsight(totalElement, shareElement, value, denominator) {
  totalElement.textContent = CURRENCY.format(value);
  shareElement.textContent = denominator > 0 ? `${Math.round((Math.abs(value) / denominator) * 100)}%` : "0%";
}

function renderExpensePie(summaries) {
  const colors = ["#22c7ad", "#f2b84b", "#b9a7ff", "#ff6b5f", "#55d98f", "#6ea8ff", "#f77fb3"];
  const expenseRows = summaries
    .map((summary) => ({
      name: summary.name,
      value: Math.abs(Math.min(summary.total, 0)),
    }))
    .filter((summary) => summary.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = expenseRows.reduce((sum, row) => sum + row.value, 0);

  elements.pieScope.textContent = `${expenseRows.length} expense categor${expenseRows.length === 1 ? "y" : "ies"}`;
  elements.pieLegend.innerHTML = "";

  if (!total) {
    elements.expensePie.style.background = "";
    elements.expensePie.innerHTML = `
      <div class="pie-center">
        <strong>${CURRENCY.format(0)}</strong>
        <small>spent</small>
      </div>
    `;
    elements.pieLegend.innerHTML = '<li class="empty-inline">No expenses in this period.</li>';
    return;
  }

  const topRows = expenseRows.slice(0, 6);
  const otherValue = expenseRows.slice(6).reduce((sum, row) => sum + row.value, 0);
  const chartRows = otherValue > 0 ? [...topRows, { name: "Other", value: otherValue }] : topRows;
  let cursor = 0;
  const segments = chartRows.map((row, index) => {
    const start = cursor;
    const end = cursor + (row.value / total) * 100;
    cursor = end;
    return `${colors[index % colors.length]} ${start}% ${end}%`;
  });

  elements.expensePie.style.background = `conic-gradient(${segments.join(", ")})`;
  elements.expensePie.innerHTML = `
    <div class="pie-center">
      <strong>${CURRENCY.format(total)}</strong>
      <small>spent</small>
    </div>
  `;

  const fragment = document.createDocumentFragment();
  chartRows.forEach((row, index) => {
    const item = document.createElement("li");
    const percent = Math.round((row.value / total) * 100);
    item.innerHTML = `
      <span class="legend-dot"></span>
      <span class="pie-legend-name"></span>
      <span class="pie-legend-values">
        <strong></strong>
        <small></small>
      </span>
    `;
    item.querySelector(".legend-dot").style.background = colors[index % colors.length];
    item.querySelector(".pie-legend-name").textContent = row.name;
    item.querySelector("strong").textContent = CURRENCY.format(row.value);
    item.querySelector("small").textContent = `${percent}%`;
    fragment.append(item);
  });
  elements.pieLegend.append(fragment);
}

function getCategorySummaries(transactions) {
  const summaries = new Map();
  transactions.forEach((transaction) => {
    const category = transaction.category || "Uncategorized";
    if (!summaries.has(category)) {
      const meta = getCategoryMeta(category);
      summaries.set(category, {
        name: category,
        bucket: meta.bucket || "Other",
        type: meta.type || "",
        actualExpense: meta.actualExpense || "",
        regularExpense: meta.regularExpense || "",
        frequency: meta.frequency || "",
        budget: meta.monthlyBudget || 0,
        total: 0,
        count: 0,
      });
    }

    const summary = summaries.get(category);
    summary.total += transaction.amount;
    summary.count += 1;
  });

  return [...summaries.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

function renderCategoryRanking(summaries) {
  const filteredSummaries = filterCategorySummaries(summaries);
  elements.rankingScope.textContent = `${filteredSummaries.length} of ${summaries.length} categories`;
  elements.categoryRanking.innerHTML = "";

  if (!filteredSummaries.length) {
    elements.categoryRanking.innerHTML = '<li class="empty-inline">No categories match this lens.</li>';
    return;
  }

  const fragment = document.createDocumentFragment();
  filteredSummaries.slice(0, 40).forEach((summary, index) => {
    const spent = Math.abs(Math.min(summary.total, 0));
    const budget = summary.budget;
    const ratio = budget > 0 ? spent / budget : 0;
    const item = document.createElement("li");
    item.className = "category-row";
    item.innerHTML = `
      <button class="category-row-button" type="button">
        <span class="rank">${index + 1}</span>
        <span class="category-row-main">
          <strong></strong>
          <small></small>
          <span class="budget-bar"><span></span></span>
        </span>
        <span class="category-row-amount"></span>
      </button>
    `;

    item.querySelector("strong").textContent = summary.name;
    const labels = [summary.bucket, summary.type, summary.frequency].filter(Boolean).join(" - ");
    item.querySelector("small").textContent = budget
      ? `${labels} - ${Math.round(ratio * 100)}% of ${CURRENCY.format(budget)}`
      : `${labels || "Other"} - no budget`;
    item.querySelector(".budget-bar span").style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
    item.querySelector(".budget-bar").classList.toggle("over-budget", ratio > 1);
    item.querySelector(".category-row-amount").textContent = CURRENCY.format(summary.total);
    item.querySelector("button").addEventListener("click", () => openCategoryDialog(summary.name));
    fragment.append(item);
  });

  elements.categoryRanking.append(fragment);
}

function filterCategorySummaries(summaries) {
  if (state.categoryMode === "all") {
    return summaries;
  }

  return summaries.filter((summary) => {
    const spent = Math.abs(Math.min(summary.total, 0));
    if (state.categoryMode === "overBudget") {
      return summary.budget > 0 && spent > summary.budget;
    }
    if (state.categoryMode === "noBudget") {
      return summary.budget <= 0 && spent > 0;
    }
    if (state.categoryMode === "regular") {
      return summary.regularExpense === "Yes";
    }
    if (state.categoryMode === "irregular") {
      return summary.regularExpense === "No";
    }
    if (state.categoryMode === "actual") {
      return summary.actualExpense === "Yes";
    }
    if (state.categoryMode === "needs") {
      return summary.type === "Need";
    }
    if (state.categoryMode === "wants") {
      return summary.type === "Want";
    }
    if (state.categoryMode === "income") {
      return summary.type === "Income";
    }
    if (state.categoryMode === "invest") {
      return summary.type === "Invest";
    }
    return true;
  });
}

function renderTrends() {
  if (!state.trendCategory) {
    elements.trendChart.innerHTML = "";
    elements.monthlyList.innerHTML = "";
    return;
  }

  const meta = getCategoryMeta(state.trendCategory);
  const budget = meta.monthlyBudget || 0;
  const rows = getMonthlyCategoryRows(state.trendCategory);
  elements.trendChart.innerHTML = "";
  elements.monthlyList.innerHTML = "";

  if (!rows.length) {
    elements.trendChart.innerHTML = '<p class="empty-inline">No trend data for this category.</p>';
    return;
  }

  const max = Math.max(...rows.map((row) => Math.abs(row.total)), 1);
  const chart = document.createElement("div");
  chart.className = "bar-chart";
  rows.slice(-18).forEach((row) => {
    const spent = Math.abs(Math.min(row.total, 0));
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.classList.toggle("over-budget", budget > 0 && spent > budget);
    bar.style.height = `${Math.max(6, (Math.abs(row.total) / max) * 100)}%`;
    bar.title = `${row.label}: ${CURRENCY.format(row.total)}`;
    bar.innerHTML = `<span>${row.shortLabel}</span>`;
    chart.append(bar);
  });
  elements.trendChart.append(chart);

  const fragment = document.createDocumentFragment();
  rows.slice().reverse().forEach((row) => {
    const spent = Math.abs(Math.min(row.total, 0));
    const budgetDelta = budget - spent;
    const item = document.createElement("li");
    item.className = "monthly-row";
    item.innerHTML = `
      <span></span>
      <strong></strong>
      <small></small>
    `;
    item.querySelector("span").textContent = row.label;
    item.querySelector("strong").textContent = CURRENCY.format(row.total);
    item.querySelector("small").textContent = budget
      ? `${row.count} item${row.count === 1 ? "" : "s"} - ${budgetDelta >= 0 ? "under" : "over"} ${CURRENCY.format(Math.abs(budgetDelta))}`
      : `${row.count} item${row.count === 1 ? "" : "s"}`;
    fragment.append(item);
  });
  elements.monthlyList.append(fragment);
}

function renderLatestAccounts() {
  const accounts = new Map();
  state.allTransactions.forEach((transaction) => {
    const key = transaction.account || "";
    const current = accounts.get(key);
    if (!current || transaction.dateValue > current.dateValue) {
      accounts.set(key, {
        accountId: key,
        date: transaction.date,
        dateValue: transaction.dateValue || 0,
        amount: transaction.amount,
        description: transaction.description,
        category: transaction.category,
        accountFriendlyName: transaction.accountFriendlyName,
        count: (current?.count || 0) + 1,
      });
    } else if (current) {
      current.count += 1;
    }
  });

  const rows = [...accounts.values()].sort((a, b) => b.dateValue - a.dateValue || getAccountName(a.accountId).localeCompare(getAccountName(b.accountId)));
  elements.latestAccountsScope.textContent = `${rows.length} account${rows.length === 1 ? "" : "s"}`;
  elements.latestAccountsList.innerHTML = "";

  if (!rows.length) {
    elements.latestAccountsList.innerHTML = '<li class="empty-inline">No accounts loaded yet.</li>';
    return;
  }

  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    const item = document.createElement("li");
    item.className = "account-latest-item";
    item.innerHTML = `
      <div class="account-latest-main">
        <strong></strong>
        <small></small>
      </div>
      <div class="account-latest-date">
        <span></span>
        <small></small>
      </div>
    `;
    item.querySelector(".account-latest-main strong").textContent = getTransactionAccountName({
      account: row.accountId,
      accountFriendlyName: row.accountFriendlyName,
    });
    item.querySelector(".account-latest-main small").textContent = `${row.count} transaction${row.count === 1 ? "" : "s"} - ${row.category || "Uncategorized"}`;
    item.querySelector(".account-latest-date span").textContent = row.date ? dateFormatter.format(row.date) : "No date";
    item.querySelector(".account-latest-date small").textContent = CURRENCY.format(row.amount || 0);
    fragment.append(item);
  });

  elements.latestAccountsList.append(fragment);
}

function getMonthlyCategoryRows(category) {
  const rows = new Map();
  state.allTransactions
    .filter((transaction) => transaction.category === category && getTransactionPeriodDate(transaction))
    .forEach((transaction) => {
      const periodDate = getTransactionPeriodDate(transaction);
      const year = periodDate.getFullYear();
      const month = periodDate.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;
      if (!rows.has(key)) {
        rows.set(key, {
          key,
          label: `${year}/${String(month).padStart(2, "0")}`,
          shortLabel: `${String(month).padStart(2, "0")}/${String(year).slice(2)}`,
          total: 0,
          count: 0,
        });
      }
      const row = rows.get(key);
      row.total += transaction.amount;
      row.count += 1;
    });

  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function openCategoryDialog(category) {
  state.openCategoryDialogName = category;
  const meta = getCategoryMeta(category);
  const transactions = getFilteredTransactions({ includeSearch: false }).filter((transaction) => transaction.category === category);
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const budget = meta.monthlyBudget || 0;

  elements.categoryDialogBucket.textContent = meta.bucket || "Category";
  elements.categoryDialogTitle.textContent = category;
  elements.categoryDialogSummary.innerHTML = `
    <article>
      <span>Total</span>
      <strong>${CURRENCY.format(total)}</strong>
    </article>
    <article>
      <span>Budget</span>
      <strong>${budget ? CURRENCY.format(budget) : "No budget"}</strong>
    </article>
    <article>
      <span>Type</span>
      <strong>${meta.type || "Unknown"}</strong>
    </article>
    <article>
      <span>Items</span>
      <strong>${transactions.length}</strong>
    </article>
  `;
  elements.categoryDialogList.innerHTML = "";

  const fragment = document.createDocumentFragment();
  transactions.slice(0, 80).forEach((transaction) => {
    const item = document.createElement("li");
    item.className = "transaction-item compact";
    item.innerHTML = `
      <button class="transaction-compact-button" type="button" data-transaction-id="${transaction.id}">
        <span class="transaction-main">
          <span class="transaction-title"></span>
          <span class="transaction-date"></span>
        </span>
        <span class="transaction-amount ${transaction.amount < 0 ? "expense" : "income"}"></span>
      </button>
    `;
    item.querySelector(".transaction-title").textContent = getTransactionTitle(transaction);
    item.querySelector(".transaction-date").textContent = formatTransactionDateLabel(transaction);
    item.querySelector(".transaction-amount").textContent = CURRENCY.format(transaction.amount);
    fragment.append(item);
  });
  elements.categoryDialogList.append(fragment);
  if (!elements.categoryDialog.open) {
    elements.categoryDialog.showModal();
  }
}

function openTransactionCategoryDialog(transactionId) {
  const transaction = state.allTransactions.find((item) => item.id === transactionId);
  if (!transaction) {
    setStatus("Could not find that transaction anymore. Refresh and try again.");
    return;
  }

  state.editingTransactionId = transaction.id;
  elements.transactionEditTitle.textContent = getTransactionTitle(transaction);
  elements.transactionEditSummary.innerHTML = `
    <article>
      <span>Date</span>
      <strong>${formatTransactionDateLabel(transaction)}</strong>
    </article>
    <article>
      <span>Amount</span>
      <strong>${CURRENCY.format(transaction.amount)}</strong>
    </article>
    <article>
      <span>Current</span>
      <strong>${transaction.category || "Uncategorized"}</strong>
    </article>
  `;
  populateTransactionCategorySelect(elements.transactionEditCategory, transaction.category || "Uncategorized");
  elements.transactionEditShortDescription.value = transaction.shortDescription || "";
  elements.transactionEditOverrideMonth.value = transaction.overrideMonth || "";
  elements.transactionEditTravelTag.value = transaction.travelTag || "";
  if (elements.categoryDialog.open) {
    elements.categoryDialog.close();
  }
  elements.transactionEditDialog.showModal();
}

function populateTransactionCategorySelect(select, currentCategory) {
  select.innerHTML = "";
  if (CONFIG.apiBaseUrl && currentCategory !== "Uncategorized") {
    select.append(new Option("Uncategorized", "Uncategorized"));
  }

  if (!state.categories.some((category) => category.name === currentCategory)) {
    select.append(new Option(currentCategory, currentCategory));
  }

  let currentGroup = "";
  let group = null;
  state.categories.forEach((category) => {
    if (category.bucket !== currentGroup) {
      currentGroup = category.bucket;
      group = document.createElement("optgroup");
      group.label = currentGroup;
      select.append(group);
    }
    group.append(new Option(category.name, category.name));
  });
  select.value = currentCategory;
}

async function saveTransactionCategoryDialog() {
  const transaction = state.allTransactions.find((item) => item.id === state.editingTransactionId);
  if (!transaction) {
    return;
  }

  const nextCategory = elements.transactionEditCategory.value;
  const previousCategory = transaction.category;
  const previousDetails = {
    shortDescription: transaction.shortDescription,
    overrideMonth: transaction.overrideMonth,
    travelTag: transaction.travelTag,
    accountFriendlyName: transaction.accountFriendlyName,
    effectiveDate: transaction.effectiveDate,
    effectiveDateValue: transaction.effectiveDateValue,
  };
  try {
    await saveTransactionDetails(transaction, {
      category: nextCategory,
      shortDescription: elements.transactionEditShortDescription.value,
      overrideMonth: elements.transactionEditOverrideMonth.value,
      travelTag: elements.transactionEditTravelTag.value,
      accountFriendlyName: transaction.accountFriendlyName || getAccountName(transaction.account),
    });
    elements.transactionEditDialog.close();
  } catch (error) {
    transaction.category = previousCategory;
    Object.assign(transaction, previousDetails);
    setStatus(`Could not save category change. ${error.message}`);
  }
}

async function saveTransactionDetails(transaction, details) {
  const nextCategory = details.category || "Uncategorized";
  transaction.category = nextCategory;
  transaction.shortDescription = details.shortDescription.trim();
  transaction.overrideMonth = normalizeOverrideMonth(details.overrideMonth);
  transaction.travelTag = details.travelTag.trim();
  transaction.accountFriendlyName = details.accountFriendlyName.trim();
  transaction.effectiveDate = getEffectiveDate(transaction.date, transaction.overrideMonth);
  transaction.effectiveDateValue = transaction.effectiveDate ? transaction.effectiveDate.getTime() : transaction.dateValue;

  if (CONFIG.apiBaseUrl) {
    const payload = await apiRequest(`/transactions/${encodeURIComponent(transaction.id)}/details`, {
      method: "PUT",
      body: {
        category: nextCategory,
        originalCategory: transaction.originalCategory,
        shortDescription: transaction.shortDescription,
        overrideMonth: transaction.overrideMonth,
        travelTag: transaction.travelTag,
        accountFriendlyName: transaction.accountFriendlyName,
      },
    });
    await updateLocalCacheFromWrite(payload?.metadata);
  } else {
    if (nextCategory === transaction.originalCategory) {
      delete state.categoryOverrides[transaction.id];
    } else {
      state.categoryOverrides[transaction.id] = nextCategory;
    }
    saveCategoryOverrides();
  }

  render();
}

function getCategoryMeta(category) {
  return state.categories.find((item) => item.name === category) || {};
}

function getTransactionType(transaction) {
  const meta = getCategoryMeta(transaction.category);
  return meta.type || transaction.type || (transaction.amount > 0 ? "Income" : "");
}

function getTransactionTitle(transaction) {
  return transaction.shortDescription || transaction.description || "Untitled transaction";
}

function formatTransactionDateLabel(transaction) {
  const date = transaction.date ? dateFormatter.format(transaction.date) : "No date";
  return transaction.overrideMonth ? `${date} - counted in ${transaction.overrideMonth}` : date;
}

function renderCategoryEditor() {
  elements.categoryEditorList.innerHTML = "";

  if (!state.categories.length) {
    elements.categoryEditorList.innerHTML = '<li class="empty-inline">No categories yet. Add one and give the budget spreadsheet a tiny retirement party.</li>';
    return;
  }

  const groupedCategories = groupCategoriesByBucket();
  const fragment = document.createDocumentFragment();

  groupedCategories.forEach(([bucket, categories]) => {
    const group = document.createElement("li");
    group.className = "category-group";
    group.innerHTML = `
      <div class="category-group-heading">
        <h3></h3>
        <span></span>
      </div>
      <ol class="category-line-list"></ol>
    `;
    group.querySelector("h3").textContent = bucket;
    group.querySelector("span").textContent = `${categories.length} categor${categories.length === 1 ? "y" : "ies"}`;

    const list = group.querySelector(".category-line-list");
    categories.forEach((category) => {
      const item = document.createElement("li");
      item.className = "category-line-item";
      item.dataset.categoryName = category.name;
      item.innerHTML = `
        <div class="category-line-main">
          <strong></strong>
          <small></small>
        </div>
        <button class="secondary-button compact-button" type="button" data-category-action="edit">Edit</button>
      `;

      item.querySelector("strong").textContent = category.name;
      item.querySelector("small").textContent = formatCategoryLineMeta(category);
      list.append(item);
    });

    fragment.append(group);
  });

  elements.categoryEditorList.append(fragment);
}

function groupCategoriesByBucket() {
  const groups = new Map();
  state.categories
    .slice()
    .sort((a, b) => `${a.bucket || "Other"}-${a.name}`.localeCompare(`${b.bucket || "Other"}-${b.name}`))
    .forEach((category) => {
      const bucket = category.bucket || "Other";
      if (!groups.has(bucket)) {
        groups.set(bucket, []);
      }
      groups.get(bucket).push(category);
    });

  return [...groups.entries()];
}

function formatCategoryLineMeta(category) {
  const budget = category.monthlyBudget ? `${CURRENCY.format(category.monthlyBudget)} budget` : "No budget";
  return [category.type || "Unknown", budget].join(" - ");
}

async function addCategoryFromForm() {
  const name = elements.newCategoryName.value.trim();
  if (!name) {
    return;
  }

  const existing = getCategoryMeta(name);
  if (existing.name) {
    setStatus(`Category "${name}" already exists. Edit it below instead.`);
    return;
  }

  const category = {
    name,
    bucket: elements.newCategoryBucket.value.trim() || "Other",
    type: elements.newCategoryType.value,
    actualExpense: "Yes",
    regularExpense: "Yes",
    frequency: "Everyday Expense",
    monthlyBudget: Number(elements.newCategoryBudget.value) || 0,
  };

  if (CONFIG.apiBaseUrl) {
    const payload = await apiRequest("/categories", { method: "POST", body: category });
    state.categories.push(payload.category);
    await updateLocalCacheFromWrite(payload.metadata);
  } else {
    state.categories.push(category);
    saveManagedCategories();
  }

  elements.categoryCreateForm.reset();
  refreshAfterCategoryChange();
  setStatus(`Added category "${name}".`);
}

function saveCategoryRow(item) {
  const originalName = item.dataset.categoryName;
  const nextName = item.querySelector('[data-category-field="name"]').value.trim();
  if (!nextName) {
    setStatus("A category needs a name. Philosophically and also technically.");
    return;
  }

  const duplicate = state.categories.some((category) => category.name === nextName && category.name !== originalName);
  if (duplicate) {
    setStatus(`Category "${nextName}" already exists.`);
    return;
  }

  const category = getCategoryMeta(originalName);
  category.name = nextName;
  category.bucket = item.querySelector('[data-category-field="bucket"]').value.trim() || "Other";
  category.type = item.querySelector('[data-category-field="type"]').value;
  category.monthlyBudget = Number(item.querySelector('[data-category-field="monthlyBudget"]').value) || 0;

  if (nextName !== originalName) {
    renameCategoryReferences(originalName, nextName);
  }

  saveManagedCategories();
  refreshAfterCategoryChange();
  setStatus(`Saved category "${nextName}".`);
}

function openCategoryEditor(categoryName) {
  const category = getCategoryMeta(categoryName);
  if (!category.name) {
    setStatus(`Could not find category "${categoryName}".`);
    return;
  }

  elements.categoryEditTitle.textContent = category.name;
  elements.editCategoryOriginalName.value = category.name;
  elements.editCategoryName.value = category.name;
  elements.editCategoryBucket.value = category.bucket || "";
  elements.editCategoryType.value = category.type || "Need";
  elements.editCategoryBudget.value = category.monthlyBudget || "";
  elements.categoryEditDialog.showModal();
}

async function saveCategoryDialog() {
  const originalName = elements.editCategoryOriginalName.value;
  const nextName = elements.editCategoryName.value.trim();
  if (!nextName) {
    setStatus("A category needs a name. Philosophically and also technically.");
    return;
  }

  const duplicate = state.categories.some((category) => category.name === nextName && category.name !== originalName);
  if (duplicate) {
    setStatus(`Category "${nextName}" already exists.`);
    return;
  }

  const category = getCategoryMeta(originalName);
  const nextCategory = {
    ...category,
    name: nextName,
    bucket: elements.editCategoryBucket.value.trim() || "Other",
    type: elements.editCategoryType.value,
    monthlyBudget: Number(elements.editCategoryBudget.value) || 0,
  };

  if (CONFIG.apiBaseUrl) {
    const payload = await apiRequest(`/categories/${encodeURIComponent(originalName)}`, {
      method: "PUT",
      body: nextCategory,
    });
    Object.assign(category, payload.category);
    nextCategory.metadata = payload.metadata;
  } else {
    Object.assign(category, nextCategory);
    saveManagedCategories();
  }

  if (nextName !== originalName) {
    renameCategoryReferences(originalName, nextName);
  }

  elements.categoryEditDialog.close();
  refreshAfterCategoryChange();
  if (CONFIG.apiBaseUrl) {
    await updateLocalCacheFromWrite(nextCategory.metadata);
  }
  setStatus(`Saved category "${nextName}".`);
}

async function deleteCategoryDialog() {
  const name = elements.editCategoryOriginalName.value;
  await deleteCategoryByName(name);
  elements.categoryEditDialog.close();
}

function deleteCategoryRow(item) {
  deleteCategoryByName(item.dataset.categoryName);
}

async function deleteCategoryByName(name) {
  let metadata = null;
  if (CONFIG.apiBaseUrl) {
    const payload = await apiRequest(`/categories/${encodeURIComponent(name)}`, { method: "DELETE" });
    metadata = payload.metadata;
  }

  state.categories = state.categories.filter((category) => category.name !== name);
  Object.entries(state.categoryOverrides).forEach(([transactionId, category]) => {
    if (category === name) {
      delete state.categoryOverrides[transactionId];
    }
  });
  saveCategoryOverrides();
  if (!CONFIG.apiBaseUrl) {
    saveManagedCategories();
  }
  refreshAfterCategoryChange();
  if (CONFIG.apiBaseUrl) {
    await updateLocalCacheFromWrite(metadata);
  }
  setStatus(`Deleted category "${name}". Transactions using it are now uncategorized-ish until you remap them.`);
}

function renameCategoryReferences(originalName, nextName) {
  state.allTransactions = state.allTransactions.map((transaction) => {
    if (transaction.category !== originalName && transaction.originalCategory !== originalName) {
      return transaction;
    }

    if (!CONFIG.apiBaseUrl) {
      state.categoryOverrides[transaction.id] = nextName;
    }
    return {
      ...transaction,
      category: nextName,
    };
  });

  Object.entries(state.categoryOverrides).forEach(([transactionId, category]) => {
    if (category === originalName) {
      state.categoryOverrides[transactionId] = nextName;
    }
  });
  if (!CONFIG.apiBaseUrl) {
    saveCategoryOverrides();
  }
}

function refreshAfterCategoryChange() {
  populateFilters();
  render();
}

function loadManagedCategories(fallbackCategories) {
  try {
    const saved = JSON.parse(localStorage.getItem(CATEGORY_STORE_KEY) || "null");
    return Array.isArray(saved) ? saved : fallbackCategories;
  } catch (error) {
    return fallbackCategories;
  }
}

function saveManagedCategories() {
  localStorage.setItem(CATEGORY_STORE_KEY, JSON.stringify(state.categories));
}

function downloadCategoriesCsv() {
  const headers = ["Bucket", "Category", "Actual expense", "Regular expense", "Type", "Frequency (for regular expense only)", "Monthly Budget"];
  const rows = state.categories.map((category) => [
    category.bucket || "",
    category.name,
    category.actualExpense || "",
    category.regularExpense || "",
    category.type || "",
    category.frequency || "",
    category.monthlyBudget || "",
  ]);
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "categories.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function renderUncategorizedTransactions(transactions) {
  const uncategorized = transactions.filter(isUncategorizedExpense);
  const visibleTransactions = uncategorized.slice(0, INITIAL_RENDER_LIMIT);
  const hiddenCount = uncategorized.length - visibleTransactions.length;
  const total = uncategorized.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);

  elements.uncategorizedCount.textContent = `${uncategorized.length} uncategorized expense${uncategorized.length === 1 ? "" : "s"}`;
  elements.uncategorizedTotal.textContent = `${CURRENCY.format(total)} waiting for a home`;
  elements.uncategorizedList.innerHTML = "";
  elements.uncategorizedEmptyState.classList.toggle("hidden", uncategorized.length > 0);

  const fragment = document.createDocumentFragment();
  visibleTransactions.forEach((transaction) => {
    const item = document.createElement("li");
    item.className = "transaction-item uncategorized-item";
    item.innerHTML = `
      <div class="transaction-main">
        <div class="transaction-title"></div>
        <div class="transaction-meta"></div>
        <div class="transaction-date"></div>
        <button class="category-picker-button quick-category-picker" type="button">Apply category</button>
      </div>
      <div class="transaction-amount expense"></div>
    `;

    item.querySelector(".transaction-title").textContent = getTransactionTitle(transaction);
    item.querySelector(".transaction-meta").textContent = [getTransactionAccountName(transaction), transaction.description].filter(Boolean).join(" - ");
    item.querySelector(".transaction-date").textContent = formatTransactionDateLabel(transaction);
    item.querySelector(".transaction-amount").textContent = CURRENCY.format(transaction.amount);
    setupCategoryButton(item.querySelector(".category-picker-button"), transaction, "Apply category");
    fragment.append(item);
  });

  elements.uncategorizedList.append(fragment);
  if (hiddenCount > 0) {
    const item = document.createElement("li");
    item.className = "list-note";
    item.textContent = `Showing first ${INITIAL_RENDER_LIMIT}. Use search or filters to narrow ${hiddenCount} more.`;
    elements.uncategorizedList.append(item);
  }
}

function isUncategorizedExpense(transaction) {
  const category = normalizeCategoryName(transaction.category);
  return transaction.amount < 0 && (!category || category === "uncategorized" || category === "un categorized");
}

function normalizeCategoryName(category) {
  return String(category || "").trim().toLowerCase();
}

function renderTransactions(transactions) {
  const visibleTransactions = transactions.slice(0, INITIAL_RENDER_LIMIT);
  const hiddenCount = transactions.length - visibleTransactions.length;
  elements.transactionCount.textContent = `${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`;
  elements.transactionList.innerHTML = "";
  elements.emptyState.classList.toggle("hidden", transactions.length > 0);

  const fragment = document.createDocumentFragment();
  visibleTransactions.forEach((transaction) => {
    const item = document.createElement("li");
    item.className = "transaction-item";

    const amountType = transaction.amount < 0 ? "expense" : "income";
    item.innerHTML = `
      <div class="transaction-main">
        <div class="transaction-title"></div>
        <div class="transaction-meta"></div>
        <div class="transaction-date"></div>
        <button class="category-picker-button" type="button"></button>
      </div>
      <div class="transaction-amount ${amountType}"></div>
    `;

    item.querySelector(".transaction-title").textContent = getTransactionTitle(transaction);
    item.querySelector(".transaction-meta").textContent = [transaction.category, transaction.travelTag, getTransactionAccountName(transaction)].filter(Boolean).join(" - ");
    item.querySelector(".transaction-date").textContent = formatTransactionDateLabel(transaction);
    item.querySelector(".transaction-amount").textContent = CURRENCY.format(transaction.amount);
    setupCategoryButton(item.querySelector(".category-picker-button"), transaction);

    fragment.append(item);
  });

  elements.transactionList.append(fragment);
  if (hiddenCount > 0) {
    const item = document.createElement("li");
    item.className = "list-note";
    item.textContent = `Showing first ${INITIAL_RENDER_LIMIT}. Use search or filters to narrow ${hiddenCount} more.`;
    elements.transactionList.append(item);
  }
}

function setupCategoryButton(button, transaction, fallbackLabel = "") {
  button.textContent = transaction.category || fallbackLabel || "Choose category";
  button.addEventListener("click", () => openCategorySearch(transaction.id));
}

function openCategorySearch(transactionId) {
  const transaction = state.allTransactions.find((item) => item.id === transactionId);
  if (!transaction) {
    setStatus("Could not find that transaction anymore. Refresh and try again.");
    return;
  }

  state.categorySearchTransactionId = transaction.id;
  elements.categorySearchTitle.textContent = getTransactionTitle(transaction);
  elements.categorySearchInput.value = "";
  renderCategorySearchOptions();
  elements.categorySearchDialog.showModal();
  window.setTimeout(() => elements.categorySearchInput.focus(), 60);
}

function renderCategorySearchOptions() {
  const transaction = state.allTransactions.find((item) => item.id === state.categorySearchTransactionId);
  const currentCategory = transaction?.category || "Uncategorized";
  const query = elements.categorySearchInput.value.trim().toLowerCase();
  const categories = getCategorySearchOptions(currentCategory).filter((category) => {
    const searchable = [category.name, category.bucket, category.type].filter(Boolean).join(" ").toLowerCase();
    return !query || searchable.includes(query);
  });

  elements.categorySearchList.innerHTML = "";
  if (!categories.length) {
    elements.categorySearchList.innerHTML = '<p class="empty-inline">No category matches that search.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  let currentBucket = "";
  categories.slice(0, 80).forEach((category) => {
    if (category.bucket !== currentBucket) {
      currentBucket = category.bucket;
      const heading = document.createElement("h3");
      heading.className = "category-search-bucket";
      heading.textContent = currentBucket || "Other";
      fragment.append(heading);
    }

    const button = document.createElement("button");
    button.className = "category-search-option";
    button.type = "button";
    button.dataset.categoryName = category.name;
    button.innerHTML = `
      <span class="category-search-name"></span>
      <span class="category-search-meta"></span>
      <span class="category-search-check" aria-hidden="true"></span>
    `;
    button.querySelector(".category-search-name").textContent = category.name;
    button.querySelector(".category-search-meta").textContent = [category.type, category.monthlyBudget ? CURRENCY.format(category.monthlyBudget) : ""]
      .filter(Boolean)
      .join(" - ");
    button.querySelector(".category-search-check").textContent = category.name === currentCategory ? "✓" : "";
    fragment.append(button);
  });

  elements.categorySearchList.append(fragment);
}

function getCategorySearchOptions(currentCategory) {
  const options = [];
  if (CONFIG.apiBaseUrl || currentCategory === "Uncategorized") {
    options.push({ name: "Uncategorized", bucket: "Current", type: "" });
  }

  if (currentCategory && currentCategory !== "Uncategorized" && !state.categories.some((category) => category.name === currentCategory)) {
    options.push({ name: currentCategory, bucket: "Current", type: "" });
  }

  return [...options, ...state.categories].sort((a, b) => {
    const bucketCompare = String(a.bucket || "").localeCompare(String(b.bucket || ""));
    return bucketCompare || a.name.localeCompare(b.name);
  });
}

async function chooseCategoryFromSearch(nextCategory) {
  const transaction = state.allTransactions.find((item) => item.id === state.categorySearchTransactionId);
  if (!transaction) {
    return;
  }

  const previousCategory = transaction.category;
  try {
    await saveTransactionCategory(transaction, nextCategory);
    elements.categorySearchDialog.close();
  } catch (error) {
    transaction.category = previousCategory;
    setStatus(`Could not save category change. ${error.message}`);
  }
}

async function saveTransactionCategory(transaction, nextCategory) {
  transaction.category = nextCategory;

  if (CONFIG.apiBaseUrl) {
    let payload = null;
    if (shouldClearCategoryOverride(transaction, nextCategory)) {
      payload = await apiRequest(`/transactions/${encodeURIComponent(transaction.id)}/category`, { method: "DELETE" });
    } else {
      payload = await apiRequest(`/transactions/${encodeURIComponent(transaction.id)}/category`, {
        method: "PUT",
        body: { category: nextCategory },
      });
    }
    await updateLocalCacheFromWrite(payload?.metadata);
  } else if (nextCategory === transaction.originalCategory) {
    delete state.categoryOverrides[transaction.id];
    saveCategoryOverrides();
  } else {
    state.categoryOverrides[transaction.id] = nextCategory;
    saveCategoryOverrides();
  }

  render();
}

function shouldClearCategoryOverride(transaction, nextCategory) {
  return nextCategory === transaction.originalCategory || nextCategory === "Uncategorized";
}

function loadCategoryOverrides() {
  try {
    return JSON.parse(localStorage.getItem(CATEGORY_OVERRIDES_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function saveCategoryOverrides() {
  if (CONFIG.apiBaseUrl) {
    return;
  }

  localStorage.setItem(CATEGORY_OVERRIDES_KEY, JSON.stringify(state.categoryOverrides));
}

function downloadCategorizedCsv() {
  const headers = ["Date", "Effective Date", "Description", "Short Description", "Amount", "Category", "Original Category", "Override Month", "Travel Tag", "Account", "Account Friendly Name"];
  const rows = state.allTransactions.map((transaction) => [
    transaction.date ? formatIsoDate(transaction.date) : "",
    getTransactionPeriodDate(transaction) ? formatIsoDate(getTransactionPeriodDate(transaction)) : "",
    transaction.description,
    transaction.shortDescription,
    transaction.amount,
    transaction.category,
    transaction.originalCategory,
    transaction.overrideMonth,
    transaction.travelTag,
    transaction.account,
    transaction.accountFriendlyName || getTransactionAccountName(transaction),
  ]);
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "categorized-expenses.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function updateSettings() {
  elements.csvMode.textContent = state.dataSource;
  elements.categoryEditCount.textContent = CONFIG.apiBaseUrl ? "Database" : String(Object.keys(state.categoryOverrides).length);
  elements.clearUploadButton.disabled = !localStorage.getItem(UPLOADED_CSV_KEY);
  elements.resetCategoriesButton.disabled = CONFIG.apiBaseUrl || Object.keys(state.categoryOverrides).length === 0;
}

function setStatus(message) {
  elements.statusPanel.textContent = message;
  elements.statusPanel.classList.toggle("hidden", !message);
}

function setLoading(isLoading, title = "Loading", message = "Crunching the numbers without making them feel judged.") {
  elements.loadingTitle.textContent = title;
  elements.loadingMessage.textContent = message;
  elements.loadingOverlay.classList.toggle("hidden", !isLoading);
}

function isAuroraWakingError(error) {
  const text = `${error.type || ""} ${error.message || ""}`.toLowerCase();
  return text.includes("databaseresumingexception") || text.includes("resuming after being auto-paused");
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function sha256Hex(value) {
  if (!crypto?.subtle) {
    throw new Error("SHA-256 is not available in this browser context.");
  }

  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isValidLogin(login, password) {
  if (login !== LOGIN_NAME) {
    return false;
  }

  const normalizedPassword = password.trim();
  try {
    return (await sha256Hex(`${login}:${password}`)) === LOGIN_HASH || (await sha256Hex(`${login}:${normalizedPassword}`)) === LOGIN_HASH;
  } catch (error) {
    return false;
  }
}
