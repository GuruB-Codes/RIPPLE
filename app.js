// --- CONFIGURATION ---
// REPLACE THIS URL WITH YOUR GOOGLE APPS SCRIPT WEB APP URL
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxhz5r6NEYTTyUt9760qtbgO6ikehapi5ltSdU3mfVtoUXQTYUGNIzanJKABSHTNrAQ/exec';

// --- CONSTANTS & MONTH MAPPINGS ---
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_MAP = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
};
const CACHE_TRANSACTIONS_KEY = 'ripple_cached_transactions';
const CACHE_CATEGORIES_KEY = 'ripple_categories_v2';
const CACHE_ACCOUNTS_KEY = 'ripple_accounts_v2';
let lastFetchTimestamp = 0;

// --- STATE MANAGEMENT ---
let transactions = [];
let categoryPieChart = null;
let incomeExpenseBarChart = null;
let analyticsLineChart = null;
let currentAnalyticsTab = 'expenses'; // 'expenses' or 'earnings'
let currentCategoryTab = 'Expense'; // 'Expense' or 'Income' in Category settings

// Curated Vibrant Colors for Categories & Accounts
const CURATED_COLORS = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308',
    '#10B981', '#14B8A6', '#06B6D4', '#3B82F6',
    '#6366F1', '#8B5CF6', '#EC4899', '#64748B'
];

// Curated FontAwesome Icons for Financial Categories & Accounts
const CURATED_ICONS = [
    'fa-utensils', 'fa-burger', 'fa-cookie-bite', 'fa-mug-hot',
    'fa-gas-pump', 'fa-car', 'fa-wrench', 'fa-bolt',
    'fa-mobile-screen', 'fa-mobile-screen-button', 'fa-shirt', 'fa-bag-shopping',
    'fa-cart-shopping', 'fa-film', 'fa-plane', 'fa-gift',
    'fa-graduation-cap', 'fa-house', 'fa-heart-pulse', 'fa-dumbbell',
    'fa-piggy-bank', 'fa-money-bill-wave', 'fa-coins', 'fa-wallet',
    'fa-building-columns', 'fa-briefcase', 'fa-laptop-code', 'fa-hand-holding-dollar',
    'fa-receipt', 'fa-credit-card', 'fa-shield-halved', 'fa-ellipsis'
];

// Default Ripple V1-compatible Categories Seed
const DEFAULT_CATEGORIES = {
    Expense: [
        { id: 'cat_snacks', name: 'Snacks', type: 'Expense', icon: 'fa-cookie-bite', color: '#F59E0B', order: 1 },
        { id: 'cat_food', name: 'Food', type: 'Expense', icon: 'fa-utensils', color: '#EF4444', order: 2 },
        { id: 'cat_petrol', name: 'Petrol', type: 'Expense', icon: 'fa-gas-pump', color: '#06B6D4', order: 3 },
        { id: 'cat_bike', name: 'Bike Service', type: 'Expense', icon: 'fa-wrench', color: '#64748B', order: 4 },
        { id: 'cat_stationery', name: 'Stationery', type: 'Expense', icon: 'fa-pen-ruler', color: '#8B5CF6', order: 5 },
        { id: 'cat_electricity', name: 'Electricity', type: 'Expense', icon: 'fa-bolt', color: '#EAB308', order: 6 },
        { id: 'cat_bc', name: 'BC Amt', type: 'Expense', icon: 'fa-piggy-bank', color: '#EC4899', order: 7 },
        { id: 'cat_phone', name: 'Phone Bill', type: 'Expense', icon: 'fa-mobile-screen-button', color: '#3B82F6', order: 8 },
        { id: 'cat_clothing', name: 'Clothing', type: 'Expense', icon: 'fa-shirt', color: '#10B981', order: 9 },
        { id: 'cat_others_exp', name: 'Others', type: 'Expense', icon: 'fa-ellipsis', color: '#94A3B8', order: 10 }
    ],
    Income: [
        { id: 'cat_salary', name: 'Salary', type: 'Income', icon: 'fa-money-bill-wave', color: '#10B981', order: 1 },
        { id: 'cat_pocket', name: 'Pocket Money', type: 'Income', icon: 'fa-hand-holding-dollar', color: '#6366F1', order: 2 },
        { id: 'cat_freelance', name: 'Freelance', type: 'Income', icon: 'fa-laptop-code', color: '#06B6D4', order: 3 },
        { id: 'cat_others_inc', name: 'Others', type: 'Income', icon: 'fa-coins', color: '#94A3B8', order: 4 }
    ]
};

// Default Accounts Seed
const DEFAULT_ACCOUNTS = [
    { id: 'acc_cash', name: 'Cash', type: 'cash', initialBalance: 0, icon: 'fa-money-bill-wave', color: '#10B981', isDefault: true, order: 1 },
    { id: 'acc_bank', name: 'Bank Account', type: 'bank', initialBalance: 0, icon: 'fa-building-columns', color: '#4F46E5', isDefault: false, order: 2 },
    { id: 'acc_upi', name: 'UPI', type: 'upi', initialBalance: 0, icon: 'fa-mobile-screen', color: '#06B6D4', isDefault: false, order: 3 },
    { id: 'acc_credit', name: 'Credit Card', type: 'credit', initialBalance: 0, icon: 'fa-credit-card', color: '#EC4899', isDefault: false, order: 4 },
    { id: 'acc_wallet', name: 'Wallet', type: 'wallet', initialBalance: 0, icon: 'fa-wallet', color: '#F59E0B', isDefault: false, order: 5 }
];

let categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
let accounts = JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS));

// Active modal selection state
let selectedModalColor = '#10B981';
let selectedModalIcon = 'fa-utensils';

// --- DOM ELEMENTS ---
const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const loader = document.getElementById('loader');
const toast = document.getElementById('toast');

// Dashboard Elements
const monthlyIncomeEl = document.getElementById('monthly-income');
const monthlyExpenseEl = document.getElementById('monthly-expense');
const monthlySavingsEl = document.getElementById('monthly-savings');
const recentTransactionsList = document.getElementById('recent-transactions-list');
const totalNetBalanceEl = document.getElementById('total-net-balance');
const dashboardAccountsList = document.getElementById('dashboard-accounts-list');

// Dashboard Month Selector (Image 2 style)
let dashboardSelectedYear = new Date().getFullYear();
let dashboardSelectedMonth = new Date().getMonth(); // 0-indexed
const DASHBOARD_MONTH_ABBRS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

// Form Elements
const addForm = document.getElementById('add-transaction-form');
const typeRadios = document.getElementsByName('type');
const categorySelect = document.getElementById('category');
const accountSelect = document.getElementById('account');
const toAccountSelect = document.getElementById('to-account');
const dateInput = document.getElementById('date');

// History Elements
const historyTableBody = document.getElementById('history-table-body');
const searchHistoryInput = document.getElementById('search-history');
const historyMonthFilter = document.getElementById('history-month-filter');
const historyAccountFilter = document.getElementById('history-account-filter');
const noHistoryMsg = document.getElementById('no-history-msg');
const tableResponsive = document.querySelector('.table-responsive');

// Analytics Elements
const analyticsTimeFilter = document.getElementById('analytics-time-filter');
const analyticsTabs = document.querySelectorAll('.analytics-tab');
const analyticsChartContainer = document.getElementById('analytics-chart-container');
const analyticsEmptyState = document.getElementById('analytics-empty-state');

// Settings Elements
const profileName = document.getElementById('profile-name');
const profilePhone = document.getElementById('profile-phone');
const profileEmail = document.getElementById('profile-email');
const profileOccupation = document.getElementById('profile-occupation');
const saveProfileBtn = document.getElementById('save-profile-btn');

const reminderToggle = document.getElementById('reminder-toggle');
const reminderTime = document.getElementById('reminder-time');
const themeToggle = document.getElementById('theme-toggle');

let reminderInterval = null;

// Monthly Financial Report Elements
const reportMonthSelect = document.getElementById('report-month-select');
const reportEmailInput = document.getElementById('report-email-input');
const generateReportBtn = document.getElementById('generate-report-btn');
const downloadPdfBtn = document.getElementById('download-pdf-btn');
const emailReportBtn = document.getElementById('email-report-btn');
const reportStatusMsg = document.getElementById('report-status-msg');
const reportResultsContainer = document.getElementById('report-results-container');
let currentReportData = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today in local format (YYYY-MM-DD)
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    if (dateInput) {
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }
    
    // Set default month filter to current month (YYYY-MM)
    if (historyMonthFilter) {
        historyMonthFilter.value = `${yyyy}-${mm}`;
    }

    // Load V2 Custom Categories & Accounts
    loadCategories();
    loadAccounts();
    updateAccountOptions();
    updateCategoryOptions();

    // Setup event listeners
    setupNavigation();
    setupKeypadListeners();
    initAddView();
    setupFilters();
    setupSettings();
    setupMobileLifecycle();
    setupMonthlyReport();
    initDashboardMonthPicker();

    // 1. Immediately show cached data if available (zero-latency load on mobile PWA)
    const hasCachedData = loadCachedTransactions();

    // 2. Fetch fresh transactions from Google Sheets in background
    fetchTransactions(!hasCachedData);
});

// --- NAVIGATION ---
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // Check if click was inside add-btn-wrapper
            let targetItem = e.target.closest('.nav-item');
            if (!targetItem) return;

            const targetViewId = targetItem.getAttribute('data-target');
            navigateTo(targetViewId);
        });
    });
}

function navigateTo(viewId) {
    // Update Nav
    navItems.forEach(nav => nav.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-target="${viewId}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Update Views
    views.forEach(view => view.classList.remove('active'));
    const activeView = document.getElementById(`view-${viewId}`);
    if (activeView) activeView.classList.add('active');

    // View specific updates
    if (viewId !== 'add') {
        closeKeypad();
    }

    if (viewId === 'dashboard') {
        updateDashboard();
    } else if (viewId === 'history') {
        renderHistoryTable();
    } else if (viewId === 'analytics') {
        updateAnalytics();
    } else if (viewId === 'settings') {
        closeSettingsSub();
    } else if (viewId === 'report') {
        initReportView();
    } else if (viewId === 'add') {
        openAddView();
    }
}

// Ensure navigateTo is globally available for inline onclick
window.app = {
    navigateTo: navigateTo
};

// --- ACCOUNT & CATEGORY DROPDOWN MANAGEMENT ---
function updateAccountOptions() {
    const accSelect = document.getElementById('account');
    const toAccSelect = document.getElementById('to-account');
    const histAccFilter = document.getElementById('history-account-filter');

    const optionsHtml = accounts.map(acc => {
        return `<option value="${acc.name}">${acc.name}</option>`;
    }).join('');

    if (accSelect) {
        const currentVal = accSelect.value;
        accSelect.innerHTML = optionsHtml;
        if (currentVal && accounts.some(a => a.name === currentVal)) {
            accSelect.value = currentVal;
        } else if (accounts.length > 0) {
            accSelect.value = accounts[0].name;
        }
    }

    if (toAccSelect) {
        const currentVal = toAccSelect.value;
        toAccSelect.innerHTML = optionsHtml;
        if (currentVal && accounts.some(a => a.name === currentVal)) {
            toAccSelect.value = currentVal;
        } else if (accounts.length > 1) {
            toAccSelect.value = accounts[1].name;
        } else if (accounts.length > 0) {
            toAccSelect.value = accounts[0].name;
        }
    }

    if (histAccFilter) {
        const currentVal = histAccFilter.value;
        histAccFilter.innerHTML = '<option value="">All Accounts</option>' + optionsHtml;
        if (currentVal) {
            histAccFilter.value = currentVal;
        }
    }
}

function updateCategoryOptions(type) {
    const catSelect = document.getElementById('category');
    const toAccGroup = document.getElementById('to-account-group');
    const catGroup = document.getElementById('category-group');
    const accLabel = document.getElementById('account-label');

    const selectedType = type || (document.querySelector('input[name="type"]:checked')?.value || 'Expense');

    if (selectedType === 'Transfer') {
        if (toAccGroup) toAccGroup.classList.remove('hidden');
        if (catGroup) catGroup.classList.add('hidden');
        if (accLabel) accLabel.textContent = 'Transfer From Account';
        if (catSelect) catSelect.required = false;
        return;
    }

    if (toAccGroup) toAccGroup.classList.add('hidden');
    if (catGroup) catGroup.classList.remove('hidden');
    if (catSelect) catSelect.required = true;

    if (selectedType === 'Expense') {
        if (accLabel) accLabel.textContent = 'Paid From Account';
    } else if (selectedType === 'Income') {
        if (accLabel) accLabel.textContent = 'Deposited To Account';
    }

    if (!catSelect) return;
    const catList = getCategoriesList(selectedType);
    catSelect.innerHTML = catList.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('');
    if (catList.length > 0) {
        catSelect.value = catList[0].name;
    }
}

// --- RIPPLE V2: CATEGORY GRID & KEYPAD CONTROLLER (IMAGE 2 & 3 WORKFLOW) ---

let addActiveType = 'Expense'; // 'Expense' | 'Income' | 'Transfer'
let addSelectedCategoryId = null;
let addSelectedCategoryName = '';
let addSelectedAccount = 'Cash';
let addSelectedToAccount = '';
let addSelectedDate = ''; // YYYY-MM-DD
let keypadExpression = '0';
let keypadPickerTarget = 'source'; // 'source' | 'from' | 'to'
let transferSubMode = 'debited'; // 'debited' | 'credited' | 'self'
let transferPaymentMode = 'UPI'; // 'UPI' | 'Cash' | 'Bank Transfer'

function initAddView() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    if (!addSelectedDate) {
        addSelectedDate = `${yyyy}-${mm}-${dd}`;
    }

    if (accounts.length > 0 && (!addSelectedAccount || !accounts.some(a => a.name === addSelectedAccount))) {
        addSelectedAccount = accounts[0].name;
    }
    if (accounts.length > 1 && (!addSelectedToAccount || !accounts.some(a => a.name === addSelectedToAccount))) {
        addSelectedToAccount = accounts[1].name;
    } else if (accounts.length > 0 && !addSelectedToAccount) {
        addSelectedToAccount = accounts[0].name;
    }

    renderAddCategoryGrid();
    updateKeypadAccountPill();
    updateTransferAccountsUI();
    updateKeypadDateUI();
}

function openAddView() {
    initAddView();
    switchAddType(addActiveType || 'Expense');
    closeKeypad();
}

function switchAddType(type) {
    addActiveType = type;

    // Update toggle tabs in UI
    const tabs = document.querySelectorAll('.add-type-tab');
    tabs.forEach(tab => {
        if (tab.getAttribute('data-type') === type) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    const catGrid = document.getElementById('add-category-grid');
    const transferSection = document.getElementById('add-transfer-section');

    if (type === 'Transfer') {
        if (catGrid) catGrid.classList.add('hidden');
        if (transferSection) transferSection.classList.remove('hidden');
        switchTransferSubMode(transferSubMode || 'debited');
        closeKeypad(); // Keep keypad closed initially; user taps Transfer Amount card to enter numbers
    } else {
        if (catGrid) catGrid.classList.remove('hidden');
        if (transferSection) transferSection.classList.add('hidden');
        addSelectedCategoryId = null;
        addSelectedCategoryName = '';
        renderAddCategoryGrid();
        closeKeypad();
    }
}

function switchTransferSubMode(subMode) {
    transferSubMode = subMode;

    // Update submode buttons in UI
    document.querySelectorAll('.transfer-submode-btn').forEach(btn => {
        if (btn.getAttribute('data-submode') === subMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const fromHint = document.getElementById('transfer-from-hint');
    const toHint = document.getElementById('transfer-to-hint');
    const fromAccBox = document.getElementById('transfer-from-account-box');
    const fromPersonBox = document.getElementById('transfer-from-person-box');
    const toAccBox = document.getElementById('transfer-to-account-box');
    const toPersonBox = document.getElementById('transfer-to-person-box');
    const modeRow = document.getElementById('transfer-mode-row');
    const arrowIcon = document.getElementById('transfer-flow-arrow-icon');

    if (subMode === 'debited') {
        // Debited: From my account -> to recipient person
        if (fromHint) fromHint.textContent = 'Paid From (My Account)';
        if (toHint) toHint.textContent = 'Sent To (Recipient)';
        if (fromAccBox) fromAccBox.classList.remove('hidden');
        if (fromPersonBox) fromPersonBox.classList.add('hidden');
        if (toAccBox) toAccBox.classList.add('hidden');
        if (toPersonBox) toPersonBox.classList.remove('hidden');
        if (modeRow) modeRow.classList.remove('hidden');
        if (arrowIcon) arrowIcon.innerHTML = '<i class="fa-solid fa-arrow-down"></i>';
    } else if (subMode === 'credited') {
        // Credited: From sender person -> to my account
        if (fromHint) fromHint.textContent = 'Received From (Sender)';
        if (toHint) toHint.textContent = 'Deposited Into (My Account)';
        if (fromAccBox) fromAccBox.classList.add('hidden');
        if (fromPersonBox) fromPersonBox.classList.remove('hidden');
        if (toAccBox) toAccBox.classList.remove('hidden');
        if (toPersonBox) toPersonBox.classList.add('hidden');
        if (modeRow) modeRow.classList.remove('hidden');
        if (arrowIcon) arrowIcon.innerHTML = '<i class="fa-solid fa-arrow-down"></i>';
    } else if (subMode === 'self') {
        // Self Transfer: From my account -> to another my account
        if (fromHint) fromHint.textContent = 'From Account';
        if (toHint) toHint.textContent = 'To Account';
        if (fromAccBox) fromAccBox.classList.remove('hidden');
        if (fromPersonBox) fromPersonBox.classList.add('hidden');
        if (toAccBox) toAccBox.classList.remove('hidden');
        if (toPersonBox) toPersonBox.classList.add('hidden');
        if (modeRow) modeRow.classList.add('hidden');
        if (arrowIcon) arrowIcon.innerHTML = '<i class="fa-solid fa-arrow-right-arrow-left"></i>';
    }

    updateTransferAccountsUI();
    updateKeypadAccountPill();
}

function setTransferPaymentMode(mode) {
    transferPaymentMode = mode;
    document.querySelectorAll('.mode-chip').forEach(chip => {
        if (chip.getAttribute('data-mode') === mode) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}

function getCategoriesList(type) {
    if (!categories) return [];
    if (type === 'Income') {
        return categories.Income || categories.income || [];
    }
    return categories.Expense || categories.expense || [];
}

function renderAddCategoryGrid() {
    const gridEl = document.getElementById('add-category-grid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    const catList = getCategoriesList(addActiveType);

    catList.forEach(cat => {
        const item = document.createElement('div');
        const isSelected = cat.id === addSelectedCategoryId;
        item.className = `category-grid-item ${isSelected ? 'selected' : ''}`;
        item.onclick = () => selectCategory(cat.id, cat.name);

        // Icon render: FontAwesome or Emoji
        let iconHtml = '';
        const iconVal = cat.icon || (addActiveType === 'Income' ? 'fa-wallet' : 'fa-receipt');
        if (iconVal.startsWith('fa-')) {
            iconHtml = `<i class="fa-solid ${iconVal}"></i>`;
        } else {
            iconHtml = `<span>${iconVal}</span>`;
        }

        item.innerHTML = `
            <div class="category-circle-icon">
                ${iconHtml}
            </div>
            <span class="category-grid-label" title="${cat.name}">${cat.name}</span>
        `;
        gridEl.appendChild(item);
    });

    // Add Category Settings Tile at the end
    const settingsTile = document.createElement('div');
    settingsTile.className = 'category-grid-item add-new-category';
    settingsTile.title = 'Manage or Add Categories';
    settingsTile.onclick = () => openCategoryModal('add', addActiveType);
    settingsTile.innerHTML = `
        <div class="category-circle-icon">
            <i class="fa-solid fa-plus"></i>
        </div>
        <span class="category-grid-label">Settings</span>
    `;
    gridEl.appendChild(settingsTile);
}

function selectCategory(catId, catName) {
    addSelectedCategoryId = catId;
    addSelectedCategoryName = catName;

    // Update selection highlight in DOM
    const items = document.querySelectorAll('.category-grid-item');
    const catList = getCategoriesList(addActiveType);

    items.forEach((item, index) => {
        if (catList[index] && catList[index].id === catId) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });

    // Open keypad bottom sheet
    openKeypad();
}

function openKeypad() {
    const sheet = document.getElementById('keypad-sheet');
    const backdrop = document.getElementById('keypad-backdrop');
    if (!sheet) return;
    sheet.classList.remove('hidden');
    if (backdrop) backdrop.classList.remove('hidden');
    document.body.classList.add('keypad-open');

    updateKeypadAccountPill();
    updateKeypadDateUI();
    updateKeypadDisplay();
}

function closeKeypad() {
    const sheet = document.getElementById('keypad-sheet');
    const backdrop = document.getElementById('keypad-backdrop');
    if (sheet) sheet.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
    document.body.classList.remove('keypad-open');

    if (addActiveType !== 'Transfer') {
        keypadExpression = '0';
        updateKeypadDisplay();
        document.querySelectorAll('.category-grid-item').forEach(i => i.classList.remove('selected'));
        addSelectedCategoryId = null;
        addSelectedCategoryName = '';
    } else {
        updateKeypadDisplay();
    }
}

function updateKeypadDisplay() {
    const amountValEl = document.getElementById('keypad-amount-val');
    if (amountValEl) {
        amountValEl.textContent = keypadExpression;
    }
    const transferAmountValEl = document.getElementById('transfer-amount-val');
    if (transferAmountValEl) {
        transferAmountValEl.textContent = keypadExpression;
    }
}

function handleKeypadPress(key) {
    if (!key) return;

    if (key >= '0' && key <= '9') {
        if (keypadExpression === '0') {
            keypadExpression = key;
        } else {
            if (keypadExpression.length < 14) {
                keypadExpression += key;
            }
        }
    } else if (key === '.') {
        const lastPart = keypadExpression.split(/[+\-]/).pop();
        if (!lastPart.includes('.')) {
            keypadExpression += '.';
        }
    } else if (key === '+' || key === '-') {
        const lastChar = keypadExpression.slice(-1);
        if (lastChar === '+' || lastChar === '-') {
            keypadExpression = keypadExpression.slice(0, -1) + key;
        } else {
            if (/[+\-]/.test(keypadExpression)) {
                const evalVal = evaluateKeypadExpression();
                keypadExpression = String(evalVal) + key;
            } else {
                keypadExpression += key;
            }
        }
    } else if (key === 'backspace') {
        if (keypadExpression.length > 1) {
            keypadExpression = keypadExpression.slice(0, -1);
            if (keypadExpression === '-' || keypadExpression === '') {
                keypadExpression = '0';
            }
        } else {
            keypadExpression = '0';
        }
    }

    updateKeypadDisplay();
}

function evaluateKeypadExpression() {
    try {
        let clean = keypadExpression.trim();
        if (clean.endsWith('+') || clean.endsWith('-')) {
            clean = clean.slice(0, -1);
        }
        if (!clean) return 0;

        const plusIdx = clean.indexOf('+');
        const minusIdx = clean.lastIndexOf('-');

        if (plusIdx > 0) {
            const a = parseFloat(clean.substring(0, plusIdx)) || 0;
            const b = parseFloat(clean.substring(plusIdx + 1)) || 0;
            return Math.round((a + b) * 100) / 100;
        } else if (minusIdx > 0) {
            const a = parseFloat(clean.substring(0, minusIdx)) || 0;
            const b = parseFloat(clean.substring(minusIdx + 1)) || 0;
            return Math.round((a - b) * 100) / 100;
        } else {
            return parseFloat(clean) || 0;
        }
    } catch (e) {
        return 0;
    }
}

function setupKeypadListeners() {
    const keypadGrid = document.querySelector('.keypad-grid');
    if (keypadGrid) {
        keypadGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.key-btn');
            if (!btn) return;

            const key = btn.getAttribute('data-key');
            if (key) {
                handleKeypadPress(key);
            }
        });
    }

    // Confirm button
    const confirmBtn = document.getElementById('keypad-confirm-btn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', submitKeypadTransaction);
    }

    // Date Picker on Keypad
    const dateBtn = document.getElementById('keypad-date-btn');
    const dateInput = document.getElementById('keypad-date-input');
    if (dateBtn && dateInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        addSelectedDate = dateInput.value;

        dateBtn.addEventListener('click', (e) => {
            if (e.target !== dateInput) {
                if (typeof dateInput.showPicker === 'function') {
                    try { dateInput.showPicker(); } catch (_) { dateInput.click(); }
                } else {
                    dateInput.click();
                }
            }
        });

        dateInput.addEventListener('change', (e) => {
            if (e.target.value) {
                addSelectedDate = e.target.value;
                updateKeypadDateUI();
            }
        });
    }

    // Physical keyboard listener for convenience on desktop
    document.addEventListener('keydown', (e) => {
        const addView = document.getElementById('view-add');
        if (!addView || !addView.classList.contains('active')) return;
        const noteInput = document.getElementById('keypad-note-input');
        if (document.activeElement === noteInput) return;

        if (e.key >= '0' && e.key <= '9') {
            handleKeypadPress(e.key);
        } else if (e.key === '.') {
            handleKeypadPress('.');
        } else if (e.key === '+' || e.key === '-') {
            handleKeypadPress(e.key);
        } else if (e.key === 'Backspace') {
            handleKeypadPress('backspace');
        } else if (e.key === 'Enter') {
            submitKeypadTransaction();
        } else if (e.key === 'Escape') {
            closeKeypad();
        }
    });
}

function updateKeypadDateUI() {
    const labelEl = document.getElementById('keypad-date-label');
    if (!labelEl || !addSelectedDate) return;

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (addSelectedDate === todayStr) {
        labelEl.textContent = 'Today';
    } else if (addSelectedDate === yStr) {
        labelEl.textContent = 'Yesterday';
    } else {
        const [y, m, d] = addSelectedDate.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        labelEl.textContent = `${parseInt(d, 10)} ${monthNames[parseInt(m, 10) - 1]}`;
    }
}

function updateKeypadAccountPill() {
    const pillName = document.getElementById('keypad-acc-name');
    const pillIcon = document.getElementById('keypad-acc-icon');
    if (!pillName || !pillIcon) return;

    let targetAccName = addSelectedAccount;
    if (addActiveType === 'Transfer' && transferSubMode === 'credited') {
        targetAccName = addSelectedToAccount || (accounts.length > 1 ? accounts[1].name : accounts[0]?.name);
    }

    const currentAcc = accounts.find(a => a.name === targetAccName) || accounts[0];
    if (currentAcc) {
        pillName.textContent = currentAcc.name;
        pillIcon.style.backgroundColor = currentAcc.color || '#4F46E5';
        const iconClass = (currentAcc.icon && currentAcc.icon.startsWith('fa-')) ? currentAcc.icon : 'fa-wallet';
        pillIcon.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    }
}

function updateTransferAccountsUI() {
    const fromName = document.getElementById('transfer-from-name');
    const fromIcon = document.getElementById('transfer-from-icon');
    const toName = document.getElementById('transfer-to-name');
    const toIcon = document.getElementById('transfer-to-icon');

    const fromAcc = accounts.find(a => a.name === addSelectedAccount) || accounts[0];
    const toAcc = accounts.find(a => a.name === addSelectedToAccount) || (accounts.length > 1 ? accounts[1] : accounts[0]);

    if (fromAcc && fromName && fromIcon) {
        fromName.textContent = fromAcc.name;
        fromIcon.style.backgroundColor = fromAcc.color || '#4F46E5';
        const iconClass = (fromAcc.icon && fromAcc.icon.startsWith('fa-')) ? fromAcc.icon : 'fa-wallet';
        fromIcon.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    }

    if (toAcc && toName && toIcon) {
        toName.textContent = toAcc.name;
        toIcon.style.backgroundColor = toAcc.color || '#10B981';
        const iconClass = (toAcc.icon && toAcc.icon.startsWith('fa-')) ? toAcc.icon : 'fa-building-columns';
        toIcon.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    }
}

function openKeypadAccountPicker(target) {
    keypadPickerTarget = target;
    const popover = document.getElementById('keypad-account-popover');
    const listEl = document.getElementById('popover-accounts-list');
    if (!popover || !listEl) return;

    listEl.innerHTML = '';
    const balances = calculateAccountBalances();
    const activeAccName = (target === 'to') ? addSelectedToAccount : addSelectedAccount;

    accounts.forEach(acc => {
        const bal = balances[acc.name] || 0;
        const isSelected = acc.name === activeAccName;
        const iconClass = (acc.icon && acc.icon.startsWith('fa-')) ? acc.icon : 'fa-wallet';

        const item = document.createElement('div');
        item.className = `popover-acc-item ${isSelected ? 'selected' : ''}`;
        item.onclick = () => selectKeypadAccount(acc.name);

        item.innerHTML = `
            <div class="popover-acc-left">
                <div class="acc-pill-icon" style="background-color:${acc.color || '#4F46E5'}; width:32px; height:32px; font-size:0.9rem;">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div>
                    <div style="font-weight:600; font-size:0.95rem; color:var(--text-main);">${acc.name}</div>
                    <span style="font-size:0.75rem; color:var(--text-muted);">${acc.type || 'Account'}</span>
                </div>
            </div>
            <div class="popover-acc-bal">
                ₹${bal.toLocaleString('en-IN')}
            </div>
        `;
        listEl.appendChild(item);
    });

    popover.classList.remove('hidden');
}

function closeKeypadAccountPicker() {
    const popover = document.getElementById('keypad-account-popover');
    if (popover) popover.classList.add('hidden');
}

function selectKeypadAccount(accountName) {
    if (keypadPickerTarget === 'to') {
        addSelectedToAccount = accountName;
    } else {
        addSelectedAccount = accountName;
    }

    updateKeypadAccountPill();
    updateTransferAccountsUI();
    closeKeypadAccountPicker();
}

async function submitKeypadTransaction() {
    const finalAmount = evaluateKeypadExpression();

    if (finalAmount <= 0) {
        showToast('⚠️ Please enter an amount greater than 0.');
        return;
    }

    let transactionData = null;
    const [y, m, d] = (addSelectedDate || '').split('-').map(Number);
    const dateStr = `${String(d).padStart(2, '0')}-${MONTH_NAMES[m - 1]}-${y}`;
    const noteInput = document.getElementById('keypad-note-input');
    const keypadNote = (noteInput ? noteInput.value : '').trim();

    if (addActiveType === 'Transfer') {
        if (transferSubMode === 'debited') {
            const recipientInput = document.getElementById('transfer-recipient-name');
            const purposeInput = document.getElementById('transfer-recipient-purpose');
            const recipientName = (recipientInput ? recipientInput.value : '').trim();
            const purpose = (purposeInput ? purposeInput.value : '').trim();

            if (!addSelectedAccount) {
                showToast('⚠️ Please select the paying account.');
                return;
            }
            if (!recipientName) {
                showToast('⚠️ Please enter recipient’s name.');
                if (recipientInput) recipientInput.focus();
                return;
            }

            const noteParts = [];
            if (purpose) noteParts.push(purpose);
            if (transferPaymentMode) noteParts.push(`via ${transferPaymentMode}`);
            if (keypadNote && keypadNote !== purpose) noteParts.push(keypadNote);
            const fullNotes = noteParts.join(' • ');

            transactionData = {
                date: dateStr,
                category: 'Transfer',
                amount: finalAmount,
                type: 'Transfer',
                account: addSelectedAccount,
                toAccount: recipientName,
                notes: fullNotes
            };
        } else if (transferSubMode === 'credited') {
            const senderInput = document.getElementById('transfer-sender-name');
            const purposeInput = document.getElementById('transfer-sender-purpose');
            const senderName = (senderInput ? senderInput.value : '').trim();
            const purpose = (purposeInput ? purposeInput.value : '').trim();

            if (!senderName) {
                showToast('⚠️ Please enter sender’s name.');
                if (senderInput) senderInput.focus();
                return;
            }
            if (!addSelectedToAccount) {
                showToast('⚠️ Please select receiving account.');
                return;
            }

            const noteParts = [];
            if (purpose) noteParts.push(purpose);
            if (transferPaymentMode) noteParts.push(`via ${transferPaymentMode}`);
            if (keypadNote && keypadNote !== purpose) noteParts.push(keypadNote);
            const fullNotes = noteParts.join(' • ');

            transactionData = {
                date: dateStr,
                category: 'Transfer',
                amount: finalAmount,
                type: 'Transfer',
                account: senderName,
                toAccount: addSelectedToAccount,
                notes: fullNotes
            };
        } else {
            // Self Transfer between own accounts
            if (!addSelectedAccount || !addSelectedToAccount) {
                showToast('⚠️ Please select source and destination accounts.');
                return;
            }
            if (addSelectedAccount === addSelectedToAccount) {
                showToast('⚠️ Source and destination accounts must be different.');
                return;
            }

            transactionData = {
                date: dateStr,
                category: 'Transfer',
                amount: finalAmount,
                type: 'Transfer',
                account: addSelectedAccount,
                toAccount: addSelectedToAccount,
                notes: keypadNote || 'Self Transfer'
            };
        }
    } else {
        if (!addSelectedCategoryName) {
            showToast('⚠️ Please select a category.');
            return;
        }

        transactionData = {
            date: dateStr,
            category: addSelectedCategoryName,
            amount: finalAmount,
            type: addActiveType,
            account: addSelectedAccount || 'Cash',
            toAccount: '',
            notes: keypadNote
        };
    }

    const confirmBtn = document.getElementById('keypad-confirm-btn');
    const transferSubmitBtn = document.getElementById('transfer-main-submit-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
    if (transferSubmitBtn) {
        transferSubmitBtn.disabled = true;
        transferSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    try {
        await saveTransactionToCloud(transactionData);

        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(40);
        }

        // Reset inputs
        if (noteInput) noteInput.value = '';
        const recInput = document.getElementById('transfer-recipient-name');
        if (recInput) recInput.value = '';
        const recPurp = document.getElementById('transfer-recipient-purpose');
        if (recPurp) recPurp.value = '';
        const sendInput = document.getElementById('transfer-sender-name');
        if (sendInput) sendInput.value = '';
        const sendPurp = document.getElementById('transfer-sender-purpose');
        if (sendPurp) sendPurp.value = '';

        keypadExpression = '0';
        updateKeypadDisplay();
        closeKeypad();

        navigateTo('dashboard');
    } catch (err) {
        debugLog('Keypad transaction save error', err);
        showToast('❌ Failed to save transaction.');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        }
        if (transferSubmitBtn) {
            transferSubmitBtn.disabled = false;
            transferSubmitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Transfer';
        }
    }
}

// Window globals for inline HTML event handlers
window.switchAddType = switchAddType;
window.switchTransferSubMode = switchTransferSubMode;
window.setTransferPaymentMode = setTransferPaymentMode;
window.selectCategory = selectCategory;
window.openKeypad = openKeypad;
window.closeKeypad = closeKeypad;
window.submitKeypadTransaction = submitKeypadTransaction;
window.openKeypadAccountPicker = openKeypadAccountPicker;
window.closeKeypadAccountPicker = closeKeypadAccountPicker;

// --- DEBUG / DEVELOPMENT MODE ---
const DEBUG_MODE = true;

function debugLog(label, ...args) {
    if (DEBUG_MODE) {
        console.log(`[RIPPLE DEBUG] ${label}:`, ...args);
    }
}

// --- ROBUST NUMBER & DATE UTILITIES ---

// Safe amount parser that handles numbers, currency symbols, commas, and strings
function parseAmount(val) {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleaned = String(val).replace(/[^\d.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

// Locale-independent robust date parser
function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'number') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    }
    const s = String(val).trim();

    // 1. Match dd-MMM-yyyy or dd MMM yyyy (e.g. 08-sep-2026, 08-Sept-2026, 8-Sep-2026)
    const textMatch = s.match(/^(\d{1,2})[-/\s]([A-Za-z]+)[-/\s](\d{4})/);
    if (textMatch) {
        const day = parseInt(textMatch[1], 10);
        const mKey = textMatch[2].toLowerCase();
        const year = parseInt(textMatch[3], 10);
        if (MONTH_MAP[mKey] !== undefined) {
            return new Date(year, MONTH_MAP[mKey], day);
        }
    }

    // 2. Match yyyy-mm-dd (ISO date format)
    const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
        return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
    }

    // 3. Match dd-mm-yyyy or dd/mm/yyyy
    const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
        return new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
    }

    // Fallback standard Date parser
    const fallback = new Date(s);
    return isNaN(fallback.getTime()) ? null : fallback;
}

// Format any date string to standard display format: DD-MMM-YYYY (e.g. 08-Sep-2026)
function formatDateDisplay(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return dateStr || '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

// Sort transactions descending by date
function sortTransactions() {
    transactions.sort((a, b) => {
        const da = parseDate(a.Date);
        const db = parseDate(b.Date);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
}

// --- LOCAL PERSISTENCE & LIFECYCLE ---

function saveTransactionsToCache() {
    try {
        localStorage.setItem(CACHE_TRANSACTIONS_KEY, JSON.stringify(transactions));
    } catch (e) {
        console.warn('[RIPPLE] Failed to save transactions to localStorage:', e);
    }
}

function loadCachedTransactions() {
    try {
        const cached = localStorage.getItem(CACHE_TRANSACTIONS_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                transactions = parsed.map(t => ({
                    rowId: t.rowId,
                    Date: formatDateDisplay(t.Date),
                    Category: t.Category || '',
                    Amount: parseAmount(t.Amount),
                    Type: t.Type || 'Expense',
                    Notes: t.Notes || '',
                    Account: t.Account || 'Cash',
                    ToAccount: t.ToAccount || ''
                }));
                sortTransactions();
                updateDashboard();
                renderHistoryTable();
                updateAnalytics();
                debugLog('Loaded cached transactions from localStorage', transactions.length);
                return true;
            }
        }
    } catch (e) {
        console.warn('[RIPPLE] Failed to load transactions from localStorage:', e);
    }
    return false;
}

function setupMobileLifecycle() {
    // Refresh when returning to the PWA after backgrounding (throttled 30s)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const now = Date.now();
            if (now - lastFetchTimestamp > 30000) {
                debugLog('PWA resumed, quietly refreshing transactions...');
                fetchTransactions(false);
            }
        }
    });

    // Sync when device reconnects to internet
    window.addEventListener('online', () => {
        debugLog('Device back online, syncing...');
        showToast('🌐 Back online. Syncing data...');
        fetchTransactions(false);
    });
}

// --- DATA FETCHING & SAVING ---

async function fetchTransactions(showLoading = true) {
    if (showLoading) showLoader();
    debugLog('Fetching transactions', { url: SCRIPT_URL });

    try {
        if (!SCRIPT_URL || SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
            console.warn('[RIPPLE] No API URL configured. Set SCRIPT_URL in app.js.');
            showToast('⚠️ API not configured. Set your Google Apps Script URL.');
            transactions = [];
            updateDashboard();
            renderHistoryTable();
            if (showLoading) hideLoader();
            return;
        }

        if (!SCRIPT_URL.endsWith('/exec')) {
            console.error('[RIPPLE] Invalid SCRIPT_URL. Must end with /exec');
            showToast('⚠️ Invalid API URL. Must end with /exec');
            if (showLoading) hideLoader();
            return;
        }

        const response = await fetch(SCRIPT_URL);
        lastFetchTimestamp = Date.now();
        debugLog('GET response status', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        debugLog('GET response data count', data.data ? data.data.length : 0);

        if (Array.isArray(data) || data.status === 'success' || data.success === true || Array.isArray(data.data)) {
            const rawTransactions = Array.isArray(data) ? data : (data.data || []);
            
            transactions = rawTransactions.map(t => {
                return {
                    rowId: t.rowId, // Google Sheets row index
                    Date: formatDateDisplay(t.Date),
                    Category: t.Category || '',
                    Amount: parseAmount(t.Amount),
                    Type: t.Type || 'Expense',
                    Notes: t.Notes || '',
                    Account: t.Account || 'Cash',
                    ToAccount: t.ToAccount || ''
                };
            });

            sortTransactions();
            saveTransactionsToCache();
            
            debugLog('Transactions synced', transactions.length);
            
            updateDashboard();
            renderHistoryTable();
            updateAnalytics();
        } else {
            console.error('[RIPPLE] API error:', data.message);
            showToast('⚠️ Error from server: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('[RIPPLE] Fetch error:', error);
        if (transactions.length > 0) {
            showToast('⚠️ Unable to sync. Showing last available data.');
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showToast('❌ Network error. Check your internet connection.');
        } else if (error.message.includes('403')) {
            showToast('❌ Permission denied. Redeploy your Apps Script with "Anyone" access.');
        } else {
            showToast('❌ Error loading data: ' + error.message);
        }
    } finally {
        if (showLoading) hideLoader();
    }
}

async function saveTransactionToCloud(transaction) {
    debugLog('Saving transaction', transaction);
    debugLog('POST URL', SCRIPT_URL);

    if (!SCRIPT_URL || SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
        showToast('⚠️ API not configured.');
        return;
    }

    const txAmount = parseAmount(transaction.amount);
    const normalizedDate = formatDateDisplay(transaction.date);
    const txType = transaction.type || 'Expense';
    const isTransfer = String(txType).trim().toLowerCase() === 'transfer' || String(transaction.category || '').trim().toLowerCase() === 'transfer';
    const txAccount = transaction.account || 'Cash';
    const txToAccount = transaction.toAccount || '';

    // --- OPTIMISTIC UI UPDATE ---
    let existingTx = null;
    if (!isTransfer) {
        existingTx = transactions.find(t => 
            formatDateDisplay(t.Date).toLowerCase() === normalizedDate.toLowerCase() && 
            String(t.Category || '').trim().toLowerCase() === String(transaction.category || '').trim().toLowerCase() && 
            String(t.Type || '').trim().toLowerCase() === String(txType).trim().toLowerCase() &&
            String(t.Account || 'Cash').trim().toLowerCase() === String(txAccount).trim().toLowerCase()
        );
    }

    if (existingTx) {
        existingTx.Amount = parseAmount(existingTx.Amount) + txAmount;
    } else {
        transactions.unshift({
            rowId: 'temp_' + Date.now(),
            Date: normalizedDate,
            Category: isTransfer ? 'Transfer' : transaction.category,
            Amount: txAmount,
            Type: txType,
            Notes: transaction.notes || '',
            Account: txAccount,
            ToAccount: txToAccount
        });
        sortTransactions();
    }

    saveTransactionsToCache();
    updateDashboard();
    renderHistoryTable();
    updateAnalytics();
    showToast('✅ Transaction saved! Syncing...');

    // Background sync to Google Apps Script
    fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(transaction)
    }).then(() => {
        debugLog('Background save complete. Waiting for Google Sheet to commit row...');
        // Allow Google Sheets 1200ms to persist row before re-fetching quietly
        setTimeout(() => {
            fetchTransactions(false);
        }, 1200);
    }).catch(err => {
        console.error('Background save error:', err);
        showToast('⚠️ Sync issue, data might not be saved to cloud.');
    });
}

// --- CONNECTION TEST TOOL (Developer Use) ---
async function testGoogleSheetsConnection() {
    console.log('=== RIPPLE: Google Sheets Connection Test ===');
    console.log('API URL:', SCRIPT_URL);
    console.log('URL ends with /exec:', SCRIPT_URL.endsWith('/exec'));

    // Test 1: GET request
    console.log('\n--- Test 1: GET (Fetch transactions) ---');
    try {
        const getRes = await fetch(SCRIPT_URL);
        console.log('GET Status:', getRes.status);
        const getData = await getRes.json();
        console.log('GET Response:', getData);
        console.log('GET Success:', getData.status === 'success');
        console.log('Transactions count:', (getData.data || []).length);
    } catch (err) {
        console.error('GET FAILED:', err.message);
    }

    // Test 2: POST request
    console.log('\n--- Test 2: POST (Save test transaction) ---');
    const testPayload = {
        date: '01-Jan-2000',
        category: 'TEST',
        amount: '0.01',
        type: 'Expense',
        notes: 'RIPPLE connection test - safe to delete'
    };
    console.log('Test payload:', testPayload);
    try {
        const postRes = await fetch(SCRIPT_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(testPayload)
        });
        console.log('POST Status:', postRes.status);
        console.log('POST Type:', postRes.type);
        if (postRes.type !== 'opaque') {
            const postText = await postRes.text();
            console.log('POST Response:', postText);
        } else {
            console.log('POST returned opaque response (CORS). Request was likely sent.');
        }
    } catch (err) {
        console.error('POST FAILED:', err.message);
    }

    console.log('\n=== Connection Test Complete ===');
    console.log('If both tests pass, your integration is working.');
    console.log('Remember to delete the test row (01-Jan-2000 / TEST / 0.01) from your Google Sheet.');
}

window.testGoogleSheetsConnection = testGoogleSheetsConnection;

async function deleteTransaction(index) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    const transaction = transactions[index];
    
    if (!transaction.rowId) {
        showToast('⚠️ Cannot delete: No row ID found. Try refreshing the page.');
        return;
    }

    // --- OPTIMISTIC UI UPDATE ---
    transactions.splice(index, 1);
    saveTransactionsToCache();
    updateDashboard();
    renderHistoryTable();
    updateAnalytics();
    showToast('✅ Transaction deleted! Syncing...');

    const payload = {
        action: 'delete',
        rowId: transaction.rowId
    };
    
    // Background sync
    fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload)
    }).then(() => {
        debugLog('Background delete complete. Waiting for Google Sheet to commit...');
        setTimeout(() => {
            fetchTransactions(false);
        }, 1200);
    }).catch(err => {
        console.error('Delete error:', err);
        showToast('⚠️ Sync issue, data might not be deleted from cloud.');
    });
}

window.deleteTransaction = deleteTransaction;

// --- DASHBOARD CALCULATIONS & CHARTS ---

function initDashboardMonthPicker() {
    const monthPicker = document.getElementById('dashboard-month-picker');
    const yearEl = document.getElementById('dashboard-pill-year');
    const monthEl = document.getElementById('dashboard-pill-month');
    const pill = document.getElementById('dashboard-month-pill');

    if (!monthPicker) return;

    const now = new Date();
    dashboardSelectedYear = now.getFullYear();
    dashboardSelectedMonth = now.getMonth();

    const yyyy = dashboardSelectedYear;
    const mm = String(dashboardSelectedMonth + 1).padStart(2, '0');
    monthPicker.value = `${yyyy}-${mm}`;

    if (yearEl) yearEl.textContent = yyyy;
    if (monthEl) monthEl.innerHTML = `${DASHBOARD_MONTH_ABBRS[dashboardSelectedMonth]} <i class="fa-solid fa-chevron-down"></i>`;

    monthPicker.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val || val.indexOf('-') === -1) return;
        const [yStr, mStr] = val.split('-');
        dashboardSelectedYear = parseInt(yStr, 10);
        dashboardSelectedMonth = parseInt(mStr, 10) - 1;

        if (yearEl) yearEl.textContent = dashboardSelectedYear;
        if (monthEl) monthEl.innerHTML = `${DASHBOARD_MONTH_ABBRS[dashboardSelectedMonth]} <i class="fa-solid fa-chevron-down"></i>`;

        updateDashboard();
    });

    if (pill) {
        pill.addEventListener('click', (e) => {
            if (e.target !== monthPicker) {
                if (typeof monthPicker.showPicker === 'function') {
                    try {
                        monthPicker.showPicker();
                    } catch (_) {
                        monthPicker.click();
                    }
                } else {
                    monthPicker.click();
                }
            }
        });
    }
}

// Month filter based on user-selected dashboard month
function getCurrentMonthData() {
    return transactions.filter(t => {
        const d = parseDate(t.Date);
        return d && d.getFullYear() === dashboardSelectedYear && d.getMonth() === dashboardSelectedMonth;
    });
}

function calculateSummaries(filteredTransactions) {
    let income = 0;
    let expense = 0;

    (filteredTransactions || []).forEach(t => {
        const amt = parseAmount(t.Amount);
        if (t.Type === 'Income') income += amt;
        if (t.Type === 'Expense') expense += amt;
    });

    return { income, expense, savings: income - expense };
}

function updateDashboard() {
    const currentMonthData = getCurrentMonthData();
    const { income, expense, savings } = calculateSummaries(currentMonthData);

    debugLog('Dashboard calculated', { income, expense, savings, count: currentMonthData.length });

    // Render Accounts & Total Balance (in Accounts management)
    renderDashboardAccounts();

    // Update UI Summary Bar (Image 2 style: clean comma-separated values, negative sign for balance)
    if (monthlyIncomeEl) monthlyIncomeEl.textContent = income.toLocaleString('en-IN');
    if (monthlyExpenseEl) monthlyExpenseEl.textContent = expense.toLocaleString('en-IN');
    if (monthlySavingsEl) {
        monthlySavingsEl.textContent = `${savings < 0 ? '-' : ''}${Math.abs(savings).toLocaleString('en-IN')}`;
        if (savings < 0) {
            monthlySavingsEl.classList.add('negative-balance');
        } else {
            monthlySavingsEl.classList.remove('negative-balance');
        }
    }

    // Recent Transactions Preview (max 3)
    if (recentTransactionsList) {
        recentTransactionsList.innerHTML = '';
        const recent = transactions.slice(0, 3);

        if (recent.length === 0) {
            recentTransactionsList.innerHTML = '<p class="text-muted" style="text-align:center; padding:10px;">No transactions added yet.</p>';
        } else {
            recent.forEach(t => {
                const isExpense = t.Type === 'Expense';
                const isTransfer = t.Type === 'Transfer';
                let icon = 'fa-arrow-trend-down';
                let colorClass = 'amount-expense';
                let sign = '-';

                if (isTransfer) {
                    icon = 'fa-arrow-right-arrow-left';
                    colorClass = 'amount-transfer';
                    sign = '';
                } else if (t.Type === 'Income') {
                    icon = 'fa-arrow-trend-up';
                    colorClass = 'amount-income';
                    sign = '+';
                }

                const formattedDate = formatDateDisplay(t.Date);
                const categoryName = isTransfer ? `${t.Account || 'Cash'} → ${t.ToAccount || 'Cash'}` : t.Category;
                const subtitle = isTransfer ? `Transfer • ${formattedDate}` : `${t.Account || 'Cash'} • ${formattedDate}`;

                const html = `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:36px; height:36px; border-radius:50%; background-color: var(--bg-color); display:flex; justify-content:center; align-items:center; color: var(--text-muted);">
                                <i class="fa-solid ${icon}"></i>
                            </div>
                            <div>
                                <p style="font-weight:500; font-size:0.95rem;">${categoryName}</p>
                                <p style="font-size:0.75rem; color:var(--text-muted);">${subtitle}</p>
                            </div>
                        </div>
                        <div class="${colorClass}" style="font-weight:600;">
                            ${sign}₹${parseAmount(t.Amount).toLocaleString('en-IN')}
                        </div>
                    </div>
                `;
                recentTransactionsList.innerHTML += html;
            });
        }
    }

    // Update Charts
    updateDashboardCharts(currentMonthData);
}

function getCategoryData(data, type) {
    const categoryTotals = {};
    (data || []).filter(t => t.Type === type).forEach(t => {
        categoryTotals[t.Category] = (categoryTotals[t.Category] || 0) + parseAmount(t.Amount);
    });
    return {
        labels: Object.keys(categoryTotals),
        values: Object.values(categoryTotals)
    };
}

const chartColors = [
    '#10B981', '#6366F1', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#14B8A6', '#F97316', '#64748B'
];

function updateDashboardCharts(currentMonthData) {
    if (typeof Chart === 'undefined') return;

    // 1. Pie Chart - Expenses by Category
    const expenseData = getCategoryData(currentMonthData, 'Expense');

    const pieCanvas = document.getElementById('categoryPieChart');
    if (!pieCanvas) return;
    const pieCtx = pieCanvas.getContext('2d');
    if (categoryPieChart) categoryPieChart.destroy();

    categoryPieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: expenseData.labels.length ? expenseData.labels : ['No Data'],
            datasets: [{
                data: expenseData.values.length ? expenseData.values : [1],
                backgroundColor: expenseData.values.length ? chartColors : ['#E2E8F0'],
                borderWidth: 0,
                cutout: '70%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, font: { family: "'Poppins', sans-serif" } } }
            }
        }
    });

    // 2. Bar Chart - Income vs Expense
    const { income, expense } = calculateSummaries(currentMonthData);

    const barCanvas = document.getElementById('incomeExpenseBarChart');
    if (!barCanvas) return;
    const barCtx = barCanvas.getContext('2d');
    if (incomeExpenseBarChart) incomeExpenseBarChart.destroy();

    incomeExpenseBarChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: ['Income', 'Expense'],
            datasets: [{
                label: 'Amount (₹)',
                data: [income, expense],
                backgroundColor: ['#10B981', '#EF4444'],
                borderRadius: 6,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#E2E8F0', borderDash: [5, 5] }, ticks: { font: { family: "'Poppins', sans-serif" } } },
                x: { grid: { display: false }, ticks: { font: { family: "'Poppins', sans-serif" } } }
            }
        }
    });
}

// --- HISTORY VIEW ---
function setupFilters() {
    if (searchHistoryInput) {
        searchHistoryInput.addEventListener('input', renderHistoryTable);
    }
    if (historyMonthFilter) {
        historyMonthFilter.addEventListener('change', renderHistoryTable);
    }
    if (historyAccountFilter) {
        historyAccountFilter.addEventListener('change', renderHistoryTable);
    }
    if (analyticsTimeFilter) {
        analyticsTimeFilter.addEventListener('change', updateAnalytics);
    }

    if (analyticsTabs) {
        analyticsTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                analyticsTabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                currentAnalyticsTab = e.target.getAttribute('data-tab');
                updateAnalytics();
            });
        });
    }
}

function filterTransactions() {
    const searchTerm = (searchHistoryInput ? searchHistoryInput.value || '' : '').trim().toLowerCase();
    const monthFilter = historyMonthFilter ? historyMonthFilter.value : ''; // Format: YYYY-MM
    const accountFilter = (historyAccountFilter ? historyAccountFilter.value : '').trim();

    let filterYear = null;
    let filterMonth = null;
    if (monthFilter) {
        const parts = monthFilter.split('-').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            filterYear = parts[0];
            filterMonth = parts[1] - 1; // 0-indexed month
        }
    }

    return transactions.filter(t => {
        const notesMatch = t.Notes && t.Notes.toLowerCase().includes(searchTerm);
        const categoryMatch = t.Category && t.Category.toLowerCase().includes(searchTerm);
        const accountMatch = (t.Account && t.Account.toLowerCase().includes(searchTerm)) || 
                             (t.ToAccount && t.ToAccount.toLowerCase().includes(searchTerm));
        const matchesSearch = !searchTerm || notesMatch || categoryMatch || accountMatch;

        let matchesMonth = true;
        if (filterYear !== null && filterMonth !== null) {
            const d = parseDate(t.Date);
            matchesMonth = d && d.getFullYear() === filterYear && d.getMonth() === filterMonth;
        }

        let matchesAccount = true;
        if (accountFilter) {
            matchesAccount = (t.Account === accountFilter) || (t.Type === 'Transfer' && t.ToAccount === accountFilter);
        }

        return matchesSearch && matchesMonth && matchesAccount;
    });
}

function renderHistoryTable() {
    const filtered = filterTransactions();
    if (historyTableBody) {
        historyTableBody.innerHTML = '';
    }
    if (!historyTableBody) return;

    if (filtered.length === 0) {
        if (tableResponsive) tableResponsive.classList.add('hidden');
        if (noHistoryMsg) noHistoryMsg.classList.remove('hidden');
        return;
    }

    if (tableResponsive) tableResponsive.classList.remove('hidden');
    if (noHistoryMsg) noHistoryMsg.classList.add('hidden');

    filtered.forEach((t) => {
        const realIndex = transactions.indexOf(t);

        const isExpense = t.Type === 'Expense';
        const isTransfer = t.Type === 'Transfer';
        let colorClass = 'amount-expense';
        let sign = '-';

        if (isTransfer) {
            colorClass = 'amount-transfer';
            sign = '';
        } else if (t.Type === 'Income') {
            colorClass = 'amount-income';
            sign = '+';
        }

        // Lookup Category icon & color
        let catBadgeHtml = '';
        if (isTransfer) {
            catBadgeHtml = `<span class="transfer-badge"><i class="fa-solid fa-arrow-right-arrow-left"></i> Transfer</span>`;
        } else {
            const allCats = [...(categories.Expense || []), ...(categories.Income || [])];
            const matchedCat = allCats.find(c => c.name.toLowerCase() === (t.Category || '').toLowerCase());
            const catIcon = matchedCat?.icon || (isExpense ? 'fa-tag' : 'fa-coins');
            const catColor = matchedCat?.color || (isExpense ? '#EF4444' : '#10B981');
            catBadgeHtml = `<span class="category-badge" style="background-color: ${catColor}15; color: ${catColor}; border: 1px solid ${catColor}30;"><i class="fa-solid ${catIcon}"></i> ${t.Category}</span>`;
        }

        // Account display
        let accountDisplayHtml = '';
        if (isTransfer) {
            accountDisplayHtml = formatTransferPartyHtml(t);
        } else {
            const matchedAcc = accounts.find(a => a.name.toLowerCase() === (t.Account || 'Cash').toLowerCase());
            const accIcon = matchedAcc?.icon || 'fa-wallet';
            accountDisplayHtml = `<span class="account-badge"><i class="fa-solid ${accIcon}"></i> ${t.Account || 'Cash'}</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDateDisplay(t.Date)}</td>
            <td>${catBadgeHtml}</td>
            <td>${accountDisplayHtml}</td>
            <td style="color:var(--text-muted); font-size:0.85rem;">${t.Notes || '-'}</td>
            <td class="text-right ${colorClass}">
                ${sign}₹${parseAmount(t.Amount).toLocaleString('en-IN')}
                <button class="action-btn" onclick="deleteTransaction(${realIndex})" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        historyTableBody.appendChild(tr);
    });
}

// --- ANALYTICS VIEW ---
function updateAnalytics() {
    const timeFilter = analyticsTimeFilter ? analyticsTimeFilter.value : 'weekly';
    const txType = currentAnalyticsTab === 'expenses' ? 'Expense' : 'Income';

    // Filter by type
    const relevantTx = transactions.filter(t => t.Type === txType);

    const labels = [];
    const dataPoints = [];
    let hasData = false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (timeFilter === 'weekly') {
        // Last 4 weeks (including current)
        labels.push('Week 1', 'Week 2', 'Week 3', 'Current Week');

        for (let i = 3; i >= 0; i--) {
            const endOffset = i * 7;
            const startOffset = i * 7 + 6;

            const endDate = new Date(today);
            endDate.setDate(today.getDate() - endOffset);

            const startDate = new Date(today);
            startDate.setDate(today.getDate() - startOffset);

            let sum = 0;
            relevantTx.forEach(t => {
                const d = parseDate(t.Date);
                if (!d) return;
                d.setHours(0, 0, 0, 0);
                if (d >= startDate && d <= endDate) {
                    sum += parseAmount(t.Amount);
                }
            });
            dataPoints.push(sum);
            if (sum > 0) hasData = true;
        }
        debugLog(`Analytics totals (${timeFilter} ${txType}):`, dataPoints);
    } else {
        // Last 4 months (including current)
        for (let i = 3; i >= 0; i--) {
            const targetMonth = new Date(today.getFullYear(), today.getMonth() - i, 1);
            labels.push(MONTH_NAMES[targetMonth.getMonth()]);

            let sum = 0;
            relevantTx.forEach(t => {
                const d = parseDate(t.Date);
                if (!d) return;
                if (d.getMonth() === targetMonth.getMonth() && d.getFullYear() === targetMonth.getFullYear()) {
                    sum += parseAmount(t.Amount);
                }
            });
            dataPoints.push(sum);
            if (sum > 0) hasData = true;
        }
        debugLog(`Analytics totals (${timeFilter} ${txType}):`, dataPoints);
    }

    if (!hasData) {
        analyticsChartContainer.classList.add('hidden');
        analyticsEmptyState.classList.remove('hidden');
        if (analyticsLineChart) analyticsLineChart.destroy();
        return;
    }

    analyticsEmptyState.classList.add('hidden');
    analyticsChartContainer.classList.remove('hidden');

    const canvas = document.getElementById('analyticsLineChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (analyticsLineChart) analyticsLineChart.destroy();

    const color = txType === 'Expense' ? '#EF4444' : '#10B981';

    if (typeof Chart === 'undefined') return;

    analyticsLineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `Total ${txType} (₹)`,
                data: dataPoints,
                borderColor: color,
                backgroundColor: color + '33', // 20% opacity
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: color,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `₹${context.raw.toLocaleString('en-IN')}`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, grid: { color: '#E2E8F0', borderDash: [5, 5] } }
            }
        }
    });
}

// --- UTILS ---
function showLoader() {
    if (loader) loader.classList.remove('hidden');
}

function hideLoader() {
    if (loader) loader.classList.add('hidden');
}

function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// --- SETTINGS VIEW ---
function openSettingsSub(subId) {
    // Navigate to settings view if not already there
    navigateTo('settings');

    document.getElementById('settings-main-menu').classList.add('hidden');
    document.querySelectorAll('.settings-subview').forEach(view => {
        view.classList.add('hidden');
    });
    const targetSub = document.getElementById(`settings-sub-${subId}`);
    if (targetSub) targetSub.classList.remove('hidden');

    if (subId === 'categories') {
        renderCategoriesManagement();
    } else if (subId === 'accounts') {
        renderAccountsManagement();
    }
}

function closeSettingsSub() {
    document.getElementById('settings-main-menu').classList.remove('hidden');
    document.querySelectorAll('.settings-subview').forEach(view => {
        view.classList.add('hidden');
    });
}

window.openSettingsSub = openSettingsSub;
window.closeSettingsSub = closeSettingsSub;

function setupSettings() {
    // 1. Profile
    const savedProfile = JSON.parse(localStorage.getItem('expense_tracker_profile')) || {};
    if (savedProfile.name && profileName) profileName.value = savedProfile.name;
    if (savedProfile.phone && profilePhone) profilePhone.value = savedProfile.phone;
    if (savedProfile.email && profileEmail) profileEmail.value = savedProfile.email;
    if (savedProfile.occupation && profileOccupation) profileOccupation.value = savedProfile.occupation;

    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', () => {
            const profileData = {
                name: profileName.value,
                phone: profilePhone.value,
                email: profileEmail.value,
                occupation: profileOccupation.value
            };
            localStorage.setItem('expense_tracker_profile', JSON.stringify(profileData));
            showToast('Profile saved successfully!');
        });
    }

    // 2. Notifications
    const savedReminder = JSON.parse(localStorage.getItem('expense_tracker_reminder')) || { enabled: false, time: '21:00' };
    if (reminderToggle) reminderToggle.checked = savedReminder.enabled;
    if (reminderTime) reminderTime.value = savedReminder.time;

    if (savedReminder.enabled) {
        requestNotificationPermission();
        startReminderInterval(savedReminder.time);
    }

    if (reminderToggle) {
        reminderToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            const time = reminderTime ? reminderTime.value : '21:00';
            saveReminderSettings(enabled, time);

            if (enabled) {
                requestNotificationPermission();
                startReminderInterval(time);
            } else {
                stopReminderInterval();
            }
        });
    }

    if (reminderTime) {
        reminderTime.addEventListener('change', (e) => {
            const enabled = reminderToggle ? reminderToggle.checked : false;
            const time = e.target.value;
            saveReminderSettings(enabled, time);
            if (enabled) {
                startReminderInterval(time);
            }
        });
    }

    // 3. Appearance (Dark Mode)
    const savedTheme = localStorage.getItem('expense_tracker_theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        if (themeToggle) themeToggle.checked = true;
    }

    if (themeToggle) {
        themeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.body.classList.add('dark-mode');
                localStorage.setItem('expense_tracker_theme', 'dark');
            } else {
                document.body.classList.remove('dark-mode');
                localStorage.setItem('expense_tracker_theme', 'light');
            }
            if (document.getElementById('view-dashboard').classList.contains('active')) updateDashboardCharts(getCurrentMonthData());
            if (document.getElementById('view-analytics').classList.contains('active')) updateAnalytics();
        });
    }
}

function saveReminderSettings(enabled, time) {
    localStorage.setItem('expense_tracker_reminder', JSON.stringify({ enabled, time }));
    if (enabled) {
        showToast(`Reminder set for ${time}`);
    } else {
        showToast('Reminder disabled');
    }
}

function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.log("This browser does not support desktop notification");
    } else if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

function startReminderInterval(timeString) {
    stopReminderInterval();

    reminderInterval = setInterval(() => {
        const now = new Date();
        const currentHours = String(now.getHours()).padStart(2, '0');
        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
        const currentTimeString = `${currentHours}:${currentMinutes}`;

        const lastNotifiedDate = localStorage.getItem('expense_tracker_last_notified');
        const todayStr = now.toDateString();

        if (currentTimeString === timeString && lastNotifiedDate !== todayStr) {
            triggerNotification();
            localStorage.setItem('expense_tracker_last_notified', todayStr);
        }
    }, 60000);
}

function stopReminderInterval() {
    if (reminderInterval) {
        clearInterval(reminderInterval);
        reminderInterval = null;
    }
}

function triggerNotification() {
    if (Notification.permission === "granted") {
        new Notification("Daily Expense Reminder", {
            body: "Don't forget to update today's expenses and earnings.",
            icon: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
        });
    } else {
        showToast("Reminder: Don't forget to update today's expenses!");
    }
}

// ==========================================================================
// MONTHLY FINANCIAL REPORT IMPLEMENTATION
// ==========================================================================

const FULL_MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function initReportView() {
    if (reportMonthSelect && !reportMonthSelect.value) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        reportMonthSelect.value = `${yyyy}-${mm}`;
    }

    if (reportEmailInput && !reportEmailInput.value) {
        try {
            const savedProfile = JSON.parse(localStorage.getItem('expense_tracker_profile')) || {};
            if (savedProfile.email) {
                reportEmailInput.value = savedProfile.email;
            }
        } catch (e) {
            console.warn('[RIPPLE] Failed reading profile email for report:', e);
        }
    }
}

function setupMonthlyReport() {
    initReportView();

    if (generateReportBtn) {
        generateReportBtn.addEventListener('click', handleGenerateReport);
    }

    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', () => {
            if (currentReportData) {
                generatePdfReport(currentReportData);
            }
        });
    }

    if (emailReportBtn) {
        emailReportBtn.addEventListener('click', () => {
            if (currentReportData) {
                sendReportEmail(currentReportData);
            }
        });
    }
}

function showReportStatus(message, type = '') {
    if (!reportStatusMsg) return;
    reportStatusMsg.innerHTML = message;
    reportStatusMsg.className = 'report-status ' + type;
    reportStatusMsg.classList.remove('hidden');
}

function hideReportStatus() {
    if (reportStatusMsg) {
        reportStatusMsg.classList.add('hidden');
    }
}

function handleGenerateReport() {
    const monthVal = reportMonthSelect ? reportMonthSelect.value : '';
    if (!monthVal || monthVal.indexOf('-') === -1) {
        showReportStatus('⚠️ Please select a valid month.', 'error');
        return;
    }

    const [yearStr, monthStr] = monthVal.split('-');
    const targetYear = parseInt(yearStr, 10);
    const targetMonthIndex = parseInt(monthStr, 10) - 1; // 0-indexed

    hideReportStatus();
    showToast(`Generating your ${FULL_MONTH_NAMES[targetMonthIndex]} ${targetYear} report...`);

    const report = calculateMonthlyReport(targetYear, targetMonthIndex);
    currentReportData = report;

    renderReportResults(report);
    showReportStatus(`Report generated successfully for ${report.monthLabel}.`, 'success');
}

function calculateMonthlyReport(targetYear, targetMonthIndex) {
    const monthLabel = `${FULL_MONTH_NAMES[targetMonthIndex]} ${targetYear}`;
    const monthSlug = `${FULL_MONTH_NAMES[targetMonthIndex]}_${targetYear}`;

    // Current month transactions
    const currentMonthTx = transactions.filter(t => {
        const d = parseDate(t.Date);
        return d && d.getFullYear() === targetYear && d.getMonth() === targetMonthIndex;
    });

    // Previous month transactions for Month-over-Month comparison
    let prevYear = targetYear;
    let prevMonthIndex = targetMonthIndex - 1;
    if (prevMonthIndex < 0) {
        prevMonthIndex = 11;
        prevYear -= 1;
    }
    const prevMonthTx = transactions.filter(t => {
        const d = parseDate(t.Date);
        return d && d.getFullYear() === prevYear && d.getMonth() === prevMonthIndex;
    });

    // Income calculations
    const incomeList = currentMonthTx.filter(t => t.Type === 'Income');
    const incomeAmounts = incomeList.map(t => parseAmount(t.Amount));
    const totalIncome = incomeAmounts.reduce((sum, a) => sum + a, 0);
    const incomeCount = incomeList.length;
    const avgIncome = incomeCount > 0 ? totalIncome / incomeCount : 0;
    const highestIncome = incomeAmounts.length > 0 ? Math.max(...incomeAmounts) : 0;

    // Expense calculations
    const expenseList = currentMonthTx.filter(t => t.Type === 'Expense');
    const expenseAmounts = expenseList.map(t => parseAmount(t.Amount));
    const totalExpense = expenseAmounts.reduce((sum, a) => sum + a, 0);
    const expenseCount = expenseList.length;
    const avgExpense = expenseCount > 0 ? totalExpense / expenseCount : 0;
    const highestExpense = expenseAmounts.length > 0 ? Math.max(...expenseAmounts) : 0;
    const lowestExpense = expenseAmounts.length > 0 ? Math.min(...expenseAmounts) : 0;

    // Transfer calculations
    const transferList = currentMonthTx.filter(t => t.Type === 'Transfer');
    const transferAmounts = transferList.map(t => parseAmount(t.Amount));
    const totalTransfer = transferAmounts.reduce((sum, a) => sum + a, 0);
    const transferCount = transferList.length;
    const avgTransfer = transferCount > 0 ? totalTransfer / transferCount : 0;

    // Savings calculations (avoid division by zero if totalIncome is 0)
    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100) : 0;

    // Expense category analysis: group, sort descending, calculate percentages
    const catTotals = {};
    expenseList.forEach(t => {
        const cat = (t.Category || 'Others').trim();
        catTotals[cat] = (catTotals[cat] || 0) + parseAmount(t.Amount);
    });

    const categoryBreakdown = Object.keys(catTotals).map(cat => {
        const amt = catTotals[cat];
        const pct = totalExpense > 0 ? ((amt / totalExpense) * 100) : 0;
        return {
            category: cat,
            amount: amt,
            percentage: pct.toFixed(1)
        };
    }).sort((a, b) => b.amount - a.amount);

    // Spending insights
    const highestCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;

    let highestIndividualExpense = null;
    expenseList.forEach(t => {
        const amt = parseAmount(t.Amount);
        if (!highestIndividualExpense || amt > parseAmount(highestIndividualExpense.Amount)) {
            highestIndividualExpense = t;
        }
    });

    // Peak spending day
    const dailySpending = {};
    expenseList.forEach(t => {
        const dStr = formatDateDisplay(t.Date);
        dailySpending[dStr] = (dailySpending[dStr] || 0) + parseAmount(t.Amount);
    });
    let peakDay = '-';
    let peakDayAmount = 0;
    for (const day in dailySpending) {
        if (dailySpending[day] > peakDayAmount) {
            peakDayAmount = dailySpending[day];
            peakDay = day;
        }
    }

    const daysInMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
    const now = new Date();
    const isCurrentMonthYear = (targetYear === now.getFullYear() && targetMonthIndex === now.getMonth());
    const daysElapsed = isCurrentMonthYear ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
    const avgDailySpending = totalExpense / (daysElapsed || 1);
    const avgTxAmount = expenseCount > 0 ? totalExpense / expenseCount : 0;

    // Month-over-Month comparison
    const prevIncome = prevMonthTx.filter(t => t.Type === 'Income').reduce((s, t) => s + parseAmount(t.Amount), 0);
    const prevExpense = prevMonthTx.filter(t => t.Type === 'Expense').reduce((s, t) => s + parseAmount(t.Amount), 0);
    const prevTransfer = prevMonthTx.filter(t => t.Type === 'Transfer').reduce((s, t) => s + parseAmount(t.Amount), 0);
    const prevSavings = prevIncome - prevExpense;
    const hasPrevData = (prevIncome > 0 || prevExpense > 0 || prevTransfer > 0);

    const incomeChangePct = (hasPrevData && prevIncome > 0) ? (((totalIncome - prevIncome) / prevIncome) * 100) : null;
    const expenseChangePct = (hasPrevData && prevExpense > 0) ? (((totalExpense - prevExpense) / prevExpense) * 100) : null;
    const transferChangePct = (hasPrevData && prevTransfer > 0) ? (((totalTransfer - prevTransfer) / prevTransfer) * 100) : null;
    const savingsChangePct = (hasPrevData && prevSavings !== 0) ? (((netSavings - prevSavings) / Math.abs(prevSavings)) * 100) : null;

    return {
        monthStr: `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}`,
        monthLabel,
        monthSlug,
        targetYear,
        targetMonthIndex,
        totalIncome,
        incomeCount,
        avgIncome,
        highestIncome,
        totalExpense,
        expenseCount,
        avgExpense,
        highestExpense,
        lowestExpense,
        totalTransfer,
        transferCount,
        avgTransfer,
        netSavings,
        savingsRate,
        categoryBreakdown,
        highestCategory,
        highestIndividualExpense,
        peakDay,
        peakDayAmount,
        daysInMonth,
        daysElapsed,
        avgDailySpending,
        avgTxAmount,
        incomeList,
        expenseList,
        transferList,
        hasPrevData,
        prevIncome,
        prevExpense,
        prevTransfer,
        prevSavings,
        incomeChangePct,
        expenseChangePct,
        transferChangePct,
        savingsChangePct,
        generatedAt: new Date()
    };
}

function formatTransferPartyDisplay(t) {
    if (!t) return '-';
    const from = (t.Account || '').trim();
    const to = (t.ToAccount || '').trim();
    const notes = (t.Notes || '').trim();

    // 1. Both from and to are present and different
    if (from && to && from.toLowerCase() !== to.toLowerCase()) {
        return `${from} -> ${to}`;
    }

    // 2. Only 'to' is present
    if (to && !from) {
        return `To: ${to}`;
    }

    // 3. 'from' is present but 'to' is empty or same as 'from'
    if (from && (!to || from.toLowerCase() === to.toLowerCase())) {
        if (notes) {
            const parts = notes.split('•').map(p => p.trim()).filter(Boolean);
            const nonModeParts = parts.filter(p => !p.toLowerCase().startsWith('via ') && p.toLowerCase() !== 'self transfer');
            if (nonModeParts.length > 0 && nonModeParts[0].toLowerCase() !== from.toLowerCase()) {
                return `${from} -> ${nonModeParts[0]}`;
            }
        }
        if (to && from.toLowerCase() !== 'cash') {
            return from;
        }
        return `${from || 'Account'} -> Recipient`;
    }

    // 4. Fallback to notes if available
    if (notes) {
        const parts = notes.split('•').map(p => p.trim()).filter(Boolean);
        if (parts.length > 0) return parts[0];
    }

    return 'Transfer';
}

function formatTransferPartyHtml(t) {
    if (!t) return '-';
    const from = (t.Account || '').trim();
    const to = (t.ToAccount || '').trim();
    const notes = (t.Notes || '').trim();

    const escapeText = (str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    if (from && to && from.toLowerCase() !== to.toLowerCase()) {
        return `<span class="transfer-badge">${escapeText(from)} <i class="fa-solid fa-arrow-right" style="font-size:0.68rem; margin:0 3px;"></i> ${escapeText(to)}</span>`;
    }

    if (from && (!to || from.toLowerCase() === to.toLowerCase())) {
        if (notes) {
            const parts = notes.split('•').map(p => p.trim()).filter(Boolean);
            const nonModeParts = parts.filter(p => !p.toLowerCase().startsWith('via ') && p.toLowerCase() !== 'self transfer');
            if (nonModeParts.length > 0 && nonModeParts[0].toLowerCase() !== from.toLowerCase()) {
                return `<span class="transfer-badge">${escapeText(from)} <i class="fa-solid fa-arrow-right" style="font-size:0.68rem; margin:0 3px;"></i> ${escapeText(nonModeParts[0])}</span>`;
            }
        }
        if (from.toLowerCase() !== 'cash') {
            return `<span class="transfer-badge">${escapeText(from)}</span>`;
        }
        return `<span class="transfer-badge">${escapeText(from || 'Account')} <i class="fa-solid fa-arrow-right" style="font-size:0.68rem; margin:0 3px;"></i> Recipient</span>`;
    }

    if (to) {
        return `<span class="transfer-badge">To: ${escapeText(to)}</span>`;
    }

    if (notes) {
        const parts = notes.split('•').map(p => p.trim()).filter(Boolean);
        if (parts.length > 0) return `<span class="transfer-badge">${escapeText(parts[0])}</span>`;
    }

    return `<span class="transfer-badge">Transfer</span>`;
}

function renderReportResults(report) {
    // 1. Banner
    const displayMonthEl = document.getElementById('report-display-month');
    const genTimeEl = document.getElementById('report-generation-time');
    if (displayMonthEl) displayMonthEl.textContent = `Monthly Financial Report – ${report.monthLabel}`;
    if (genTimeEl) genTimeEl.textContent = `Generated on ${report.generatedAt.toLocaleDateString()} at ${report.generatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    // 2. Summary Cards
    const totalIncomeEl = document.getElementById('report-total-income');
    const incomeCountEl = document.getElementById('report-income-count');
    const totalExpenseEl = document.getElementById('report-total-expense');
    const expenseCountEl = document.getElementById('report-expense-count');
    const totalTransferEl = document.getElementById('report-total-transfer');
    const transferCountEl = document.getElementById('report-transfer-count');
    const netSavingsEl = document.getElementById('report-net-savings');
    const savingsRateEl = document.getElementById('report-savings-rate');

    if (totalIncomeEl) totalIncomeEl.textContent = `₹${report.totalIncome.toLocaleString('en-IN')}`;
    if (incomeCountEl) incomeCountEl.textContent = `${report.incomeCount} transaction${report.incomeCount === 1 ? '' : 's'}`;
    if (totalExpenseEl) totalExpenseEl.textContent = `₹${report.totalExpense.toLocaleString('en-IN')}`;
    if (expenseCountEl) expenseCountEl.textContent = `${report.expenseCount} transaction${report.expenseCount === 1 ? '' : 's'}`;
    if (totalTransferEl) totalTransferEl.textContent = `₹${report.totalTransfer.toLocaleString('en-IN')}`;
    if (transferCountEl) transferCountEl.textContent = `${report.transferCount} transaction${report.transferCount === 1 ? '' : 's'}`;
    if (netSavingsEl) netSavingsEl.textContent = `₹${report.netSavings.toLocaleString('en-IN')}`;
    if (savingsRateEl) savingsRateEl.textContent = `Savings Rate: ${report.savingsRate.toFixed(2)}%`;

    // 3. Spending Insights
    const hiCatEl = document.getElementById('insight-highest-category');
    const hiExpEl = document.getElementById('insight-highest-expense');
    const peakDayEl = document.getElementById('insight-peak-day');
    const dailyAvgEl = document.getElementById('insight-daily-avg');
    const avgTxEl = document.getElementById('insight-avg-tx');
    const lowExpEl = document.getElementById('insight-lowest-expense');

    if (hiCatEl) {
        hiCatEl.textContent = report.highestCategory 
            ? `${report.highestCategory.category} (₹${report.highestCategory.amount.toLocaleString('en-IN')} • ${report.highestCategory.percentage}%)` 
            : 'None';
    }
    if (hiExpEl) {
        hiExpEl.textContent = report.highestIndividualExpense 
            ? `${report.highestIndividualExpense.Category} (₹${parseAmount(report.highestIndividualExpense.Amount).toLocaleString('en-IN')} on ${formatDateDisplay(report.highestIndividualExpense.Date)})` 
            : 'None';
    }
    if (peakDayEl) {
        peakDayEl.textContent = report.peakDay !== '-' 
            ? `${report.peakDay} (₹${report.peakDayAmount.toLocaleString('en-IN')})` 
            : '-';
    }
    if (dailyAvgEl) {
        dailyAvgEl.textContent = `₹${Math.round(report.avgDailySpending).toLocaleString('en-IN')} / day`;
    }
    if (avgTxEl) {
        avgTxEl.textContent = `₹${Math.round(report.avgTxAmount).toLocaleString('en-IN')}`;
    }
    if (lowExpEl) {
        lowExpEl.textContent = report.lowestExpense > 0 
            ? `₹${report.lowestExpense.toLocaleString('en-IN')}` 
            : '-';
    }

    // 4. Month-over-Month Comparison
    const momCard = document.getElementById('report-mom-card');
    if (momCard) {
        if (report.hasPrevData) {
            momCard.classList.remove('hidden');
            const formatChange = (pct) => {
                if (pct === null) return '-';
                const sign = pct >= 0 ? '+' : '';
                const cls = pct >= 0 ? 'mom-down' : 'mom-up';
                return `<span class="${cls}">${sign}${pct.toFixed(1)}%</span>`;
            };
            const formatNeutralChange = (pct) => {
                if (pct === null) return '-';
                const sign = pct >= 0 ? '+' : '';
                return `<span class="mom-neutral">${sign}${pct.toFixed(1)}%</span>`;
            };
            const momIncEl = document.getElementById('mom-income-change');
            const momExpEl = document.getElementById('mom-expense-change');
            const momTransEl = document.getElementById('mom-transfer-change');
            const momSavEl = document.getElementById('mom-savings-change');
            if (momIncEl) momIncEl.innerHTML = formatChange(report.incomeChangePct);
            if (momExpEl) momExpEl.innerHTML = formatChange(report.expenseChangePct);
            if (momTransEl) momTransEl.innerHTML = formatNeutralChange(report.transferChangePct);
            if (momSavEl) momSavEl.innerHTML = formatChange(report.savingsChangePct);
        } else {
            momCard.classList.add('hidden');
        }
    }

    // 5. Expense Category Breakdown
    const catListEl = document.getElementById('report-category-list');
    if (catListEl) {
        catListEl.innerHTML = '';
        if (report.categoryBreakdown.length === 0) {
            catListEl.innerHTML = '<p class="text-muted" style="text-align:center; padding:15px;">No expenses recorded for this month.</p>';
        } else {
            report.categoryBreakdown.forEach(item => {
                const row = document.createElement('div');
                row.className = 'cat-breakdown-row';
                row.innerHTML = `
                    <div class="cat-breakdown-header">
                        <span class="cat-breakdown-title">${item.category}</span>
                        <span class="cat-breakdown-amt">₹${item.amount.toLocaleString('en-IN')} <span class="text-muted">(${item.percentage}%)</span></span>
                    </div>
                    <div class="cat-breakdown-bar-bg">
                        <div class="cat-breakdown-bar-fill" style="width: ${item.percentage}%;"></div>
                    </div>
                `;
                catListEl.appendChild(row);
            });
        }
    }

    // 6. Income Transactions Table
    const incomeTbody = document.getElementById('report-income-tbody');
    const noIncomeMsg = document.getElementById('report-no-income-msg');
    if (incomeTbody) {
        incomeTbody.innerHTML = '';
        if (report.incomeList.length === 0) {
            if (noIncomeMsg) noIncomeMsg.classList.remove('hidden');
        } else {
            if (noIncomeMsg) noIncomeMsg.classList.add('hidden');
            report.incomeList.forEach(t => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDateDisplay(t.Date)}</td>
                    <td><span class="category-badge">${t.Category}</span></td>
                    <td style="color:var(--text-muted); font-size:0.85rem;">${t.Notes || '-'}</td>
                    <td class="text-right amount-income">+₹${parseAmount(t.Amount).toLocaleString('en-IN')}</td>
                `;
                incomeTbody.appendChild(tr);
            });
        }
    }

    // 7. Expense Transactions Table
    const expenseTbody = document.getElementById('report-expense-tbody');
    const noExpenseMsg = document.getElementById('report-no-expense-msg');
    if (expenseTbody) {
        expenseTbody.innerHTML = '';
        if (report.expenseList.length === 0) {
            if (noExpenseMsg) noExpenseMsg.classList.remove('hidden');
        } else {
            if (noExpenseMsg) noExpenseMsg.classList.add('hidden');
            report.expenseList.forEach(t => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDateDisplay(t.Date)}</td>
                    <td><span class="category-badge">${t.Category}</span></td>
                    <td style="color:var(--text-muted); font-size:0.85rem;">${t.Notes || '-'}</td>
                    <td class="text-right amount-expense">-₹${parseAmount(t.Amount).toLocaleString('en-IN')}</td>
                `;
                expenseTbody.appendChild(tr);
            });
        }
    }

    // 8. Transfer Transactions Table
    const transferTbody = document.getElementById('report-transfer-tbody');
    const noTransferMsg = document.getElementById('report-no-transfer-msg');
    if (transferTbody) {
        transferTbody.innerHTML = '';
        if (report.transferList.length === 0) {
            if (noTransferMsg) noTransferMsg.classList.remove('hidden');
        } else {
            if (noTransferMsg) noTransferMsg.classList.add('hidden');
            report.transferList.forEach(t => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDateDisplay(t.Date)}</td>
                    <td>${formatTransferPartyHtml(t)}</td>
                    <td style="color:var(--text-muted); font-size:0.85rem;">${t.Notes || '-'}</td>
                    <td class="text-right amount-transfer">₹${parseAmount(t.Amount).toLocaleString('en-IN')}</td>
                `;
                transferTbody.appendChild(tr);
            });
        }
    }

    // Reveal results and action buttons
    if (reportResultsContainer) reportResultsContainer.classList.remove('hidden');
    if (downloadPdfBtn) downloadPdfBtn.classList.remove('hidden');
    if (emailReportBtn) emailReportBtn.classList.remove('hidden');

    // Smooth scroll down to results
    if (reportResultsContainer) {
        reportResultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Build client-side vector PDF document using jsPDF and autoTable
function buildPdfDocument(report) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        return null;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 16;

    // Header Branding
    doc.setFillColor(79, 70, 229); // Primary Indigo
    doc.rect(14, y, pageWidth - 28, 20, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text('RIPPLE', 20, y + 9);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Monthly Financial Report – ${report.monthLabel}`, 20, y + 15);

    const genStr = `Generated: ${report.generatedAt.toLocaleDateString()}`;
    doc.text(genStr, pageWidth - 20 - doc.getTextWidth(genStr), y + 15);

    y += 28;

    // Financial Summary Table Grid
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('Executive Summary', 14, y);
    y += 4;

    const netSavingsFormatted = `${report.netSavings >= 0 ? '+' : '-'}Rs. ${Math.abs(report.netSavings).toLocaleString('en-IN')}`;

    doc.autoTable({
        startY: y,
        theme: 'grid',
        head: [['Total Income', 'Total Expenses', 'Transferred', 'Net Savings', 'Savings Rate', 'Transactions']],
        body: [[
            `+Rs. ${report.totalIncome.toLocaleString('en-IN')}`,
            `-Rs. ${report.totalExpense.toLocaleString('en-IN')}`,
            `Rs. ${report.totalTransfer.toLocaleString('en-IN')}`,
            netSavingsFormatted,
            `${report.savingsRate.toFixed(2)}%`,
            `${report.incomeCount + report.expenseCount + report.transferCount} total`
        ]],
        headStyles: {
            fillColor: [241, 245, 249],
            textColor: [71, 85, 105],
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'center',
            cellPadding: 3.5
        },
        bodyStyles: {
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: 3.5
        },
        columnStyles: {
            0: { cellWidth: 31, textColor: [16, 185, 129] },
            1: { cellWidth: 31, textColor: [239, 68, 68] },
            2: { cellWidth: 30, textColor: [99, 102, 241] },
            3: { cellWidth: 30, textColor: [99, 102, 241] },
            4: { cellWidth: 30, textColor: [99, 102, 241] },
            5: { cellWidth: 30, textColor: [71, 85, 105] }
        }
    });

    y = doc.lastAutoTable.finalY + 10;

    // Spending Insights Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('Spending Insights', 14, y);
    y += 4;

    const hiCatStr = report.highestCategory 
        ? `${report.highestCategory.category} (Rs. ${report.highestCategory.amount.toLocaleString('en-IN')} • ${report.highestCategory.percentage}%)` 
        : 'None';
    const hiExpStr = report.highestIndividualExpense 
        ? `${report.highestIndividualExpense.Category} (Rs. ${parseAmount(report.highestIndividualExpense.Amount).toLocaleString('en-IN')} on ${formatDateDisplay(report.highestIndividualExpense.Date)})` 
        : 'None';

    const insightRows = [
        ['Highest Spending Category', hiCatStr],
        ['Highest Individual Expense', hiExpStr],
        ['Peak Spending Day', report.peakDay !== '-' ? `${report.peakDay} (Rs. ${report.peakDayAmount.toLocaleString('en-IN')})` : '-'],
        ['Average Daily Spending', `Rs. ${Math.round(report.avgDailySpending).toLocaleString('en-IN')} / day`],
        ['Average Transaction Size', `Rs. ${Math.round(report.avgTxAmount).toLocaleString('en-IN')}`]
    ];

    if (report.lowestExpense && report.lowestExpense > 0) {
        insightRows.push(['Lowest Expense', `Rs. ${report.lowestExpense.toLocaleString('en-IN')}`]);
    }
    insightRows.push(['Total Expense Transactions', `${report.expenseCount} transactions`]);
    insightRows.push(['Total Transferred', `Rs. ${report.totalTransfer.toLocaleString('en-IN')} (${report.transferCount} transactions)`]);

    doc.autoTable({
        startY: y,
        theme: 'striped',
        body: insightRows,
        styles: {
            fontSize: 8.5,
            cellPadding: 2.8,
            overflow: 'linebreak'
        },
        columnStyles: {
            0: { fontStyle: 'bold', textColor: [71, 85, 105], cellWidth: 58 },
            1: { textColor: [30, 41, 59], cellWidth: 124 }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        }
    });

    y = doc.lastAutoTable.finalY + 10;

    // Expense Category Breakdown Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('Expense Category Breakdown', 14, y);
    y += 4;

    const catRows = report.categoryBreakdown.map(c => [
        c.category,
        `Rs. ${c.amount.toLocaleString('en-IN')}`,
        `${c.percentage}%`
    ]);

    doc.autoTable({
        startY: y,
        theme: 'striped',
        head: [[
            { content: 'Category', styles: { halign: 'left' } },
            { content: 'Amount (Rs.)', styles: { halign: 'center' } },
            { content: 'Percentage of Expenses', styles: { halign: 'center' } }
        ]],
        body: catRows.length > 0 ? catRows : [['No expense categories', '-', '-']],
        headStyles: {
            fillColor: [99, 102, 241],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9
        },
        styles: {
            fontSize: 8.5,
            cellPadding: 2.8,
            overflow: 'linebreak'
        },
        columnStyles: {
            0: { cellWidth: 72, halign: 'left' },
            1: { cellWidth: 50, halign: 'center', fontStyle: 'bold' },
            2: { cellWidth: 60, halign: 'center' }
        },
        didParseCell: function(data) {
            if (data.column.index === 1) {
                data.cell.styles.halign = 'center';
            }
            if (data.column.index === 2) {
                data.cell.styles.halign = 'center';
            }
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        }
    });

    // Itemized Income Transactions
    if (report.incomeList.length > 0) {
        doc.addPage();
        y = 16;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(16, 185, 129);
        doc.text(`Income Transactions (${report.incomeList.length})`, 14, y);
        y += 4;

        const incomeRows = report.incomeList.map(item => [
            formatDateDisplay(item.Date),
            item.Category,
            item.Notes || '-',
            `+Rs. ${parseAmount(item.Amount).toLocaleString('en-IN')}`
        ]);

        doc.autoTable({
            startY: y,
            theme: 'striped',
            head: [[
                { content: 'Date', styles: { halign: 'left' } },
                { content: 'Category', styles: { halign: 'left' } },
                { content: 'Notes / Description', styles: { halign: 'left' } },
                { content: 'Amount (Rs.)', styles: { halign: 'right' } }
            ]],
            body: incomeRows,
            headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            styles: { fontSize: 8.5, cellPadding: 2.8, overflow: 'linebreak' },
            columnStyles: {
                0: { cellWidth: 28 },
                1: { cellWidth: 38 },
                2: { cellWidth: 76 },
                3: { cellWidth: 40, halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] }
            },
            didParseCell: function(data) {
                if (data.column.index === 3) {
                    data.cell.styles.halign = 'right';
                }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            }
        });

        y = doc.lastAutoTable.finalY + 10;
    }

    // Itemized Expense Transactions
    if (report.expenseList.length > 0) {
        if (y > 220 || report.incomeList.length === 0) {
            if (report.incomeList.length > 0) doc.addPage();
            y = 16;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(239, 68, 68);
        doc.text(`Expense Transactions (${report.expenseList.length})`, 14, y);
        y += 4;

        const expenseRows = report.expenseList.map(item => [
            formatDateDisplay(item.Date),
            item.Category,
            item.Notes || '-',
            `-Rs. ${parseAmount(item.Amount).toLocaleString('en-IN')}`
        ]);

        doc.autoTable({
            startY: y,
            theme: 'striped',
            head: [[
                { content: 'Date', styles: { halign: 'left' } },
                { content: 'Category', styles: { halign: 'left' } },
                { content: 'Notes / Description', styles: { halign: 'left' } },
                { content: 'Amount (Rs.)', styles: { halign: 'right' } }
            ]],
            body: expenseRows,
            headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            styles: { fontSize: 8.5, cellPadding: 2.8, overflow: 'linebreak' },
            columnStyles: {
                0: { cellWidth: 28 },
                1: { cellWidth: 38 },
                2: { cellWidth: 76 },
                3: { cellWidth: 40, halign: 'right', fontStyle: 'bold', textColor: [239, 68, 68] }
            },
            didParseCell: function(data) {
                if (data.column.index === 3) {
                    data.cell.styles.halign = 'right';
                }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            }
        });
    }

    // Itemized Transfer Transactions
    if (report.transferList && report.transferList.length > 0) {
        if (y > 220 || (report.incomeList.length === 0 && report.expenseList.length === 0)) {
            if (report.incomeList.length > 0 || report.expenseList.length > 0) doc.addPage();
            y = 16;
        } else {
            y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : y + 10;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(99, 102, 241);
        doc.text(`Transfer Transactions (${report.transferList.length})`, 14, y);
        y += 4;

        const transferRows = report.transferList.map(item => [
            formatDateDisplay(item.Date),
            formatTransferPartyDisplay(item),
            item.Notes || '-',
            `Rs. ${parseAmount(item.Amount).toLocaleString('en-IN')}`
        ]);

        doc.autoTable({
            startY: y,
            theme: 'striped',
            head: [[
                { content: 'Date', styles: { halign: 'left' } },
                { content: 'From / To Accounts', styles: { halign: 'left' } },
                { content: 'Notes / Purpose', styles: { halign: 'left' } },
                { content: 'Amount (Rs.)', styles: { halign: 'right' } }
            ]],
            body: transferRows,
            headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            styles: { fontSize: 8.5, cellPadding: 2.8, overflow: 'linebreak' },
            columnStyles: {
                0: { cellWidth: 28 },
                1: { cellWidth: 48 },
                2: { cellWidth: 66 },
                3: { cellWidth: 40, halign: 'right', fontStyle: 'bold', textColor: [99, 102, 241] }
            },
            didParseCell: function(data) {
                if (data.column.index === 3) {
                    data.cell.styles.halign = 'right';
                }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            }
        });
    }

    // Footer on all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
            `RIPPLE – Expense Tracker • Report for ${report.monthLabel} • Page ${i} of ${totalPages}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 8,
            { align: 'center' }
        );
    }

    return doc;
}

// Generate and trigger download of client-side PDF
function generatePdfReport(report) {
    try {
        const doc = buildPdfDocument(report);
        if (!doc) {
            showToast('⚠️ PDF generator library loading. Please wait a moment and try again.');
            return;
        }
        const filename = `RIPPLE_Report_${report.monthSlug}.pdf`;
        doc.save(filename);
        showToast('📄 PDF downloaded successfully!');
    } catch (err) {
        console.error('[RIPPLE] PDF generation error:', err);
        showToast('❌ Failed to generate PDF: ' + err.message);
    }
}

// Send Monthly Report via Google Apps Script Email
async function sendReportEmail(report) {
    const email = (reportEmailInput ? reportEmailInput.value : '').trim();
    if (!email || email.indexOf('@') === -1 || email.indexOf('.') === -1) {
        showReportStatus('⚠️ Please enter a valid recipient email address.', 'error');
        if (reportEmailInput) reportEmailInput.focus();
        return;
    }

    // Check offline state
    if (!navigator.onLine) {
        showReportStatus('⚠️ Internet connection required to generate and send the monthly report.', 'error');
        showToast('⚠️ Internet connection required to send email.');
        return;
    }

    if (!SCRIPT_URL || SCRIPT_URL.includes('YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE')) {
        showReportStatus('⚠️ API URL not configured. Please set SCRIPT_URL in app.js.', 'error');
        return;
    }

    // Save email to profile for future convenience
    try {
        const savedProfile = JSON.parse(localStorage.getItem('expense_tracker_profile')) || {};
        savedProfile.email = email;
        localStorage.setItem('expense_tracker_profile', JSON.stringify(savedProfile));
    } catch (e) {}

    // Disable button & show loading state
    if (emailReportBtn) {
        emailReportBtn.disabled = true;
        emailReportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    }
    showReportStatus(`Sending your ${report.monthLabel} report to ${email}...`, '');

    try {
        // Generate client-side vector PDF base64 so Google Apps Script can attach it directly
        let pdfBase64 = null;
        try {
            const doc = buildPdfDocument(report);
            if (doc) {
                pdfBase64 = doc.output('datauristring').split(',')[1];
            }
        } catch (pdfErr) {
            console.warn('[RIPPLE] Client-side PDF generation for email skipped:', pdfErr);
        }

        const payload = {
            action: 'send_monthly_report',
            email: email,
            month: report.monthStr,
            monthLabel: report.monthLabel,
            pdfBase64: pdfBase64
        };

        // Attempt standard fetch first to capture any permission errors directly from Apps Script
        let responseParsed = false;
        try {
            const res = await fetch(SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'error') {
                    throw new Error(data.message);
                }
                responseParsed = true;
            }
        } catch (corsOrApiErr) {
            if (corsOrApiErr.message && (corsOrApiErr.message.includes('permission') || corsOrApiErr.message.includes('MailApp'))) {
                throw corsOrApiErr;
            }
        }

        // If standard CORS redirected opaque, execute with no-cors fallback
        if (!responseParsed) {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify(payload)
            });
        }

        showReportStatus('✅ Sent successfully!', 'success');
        showToast('✅ Sent successfully!');
    } catch (err) {
        console.error('[RIPPLE] Email sending error:', err);
        if (err.message && (err.message.includes('permission') || err.message.includes('MailApp'))) {
            showReportStatus('⚠️ <strong>Google Apps Script Authorization Required:</strong><br>In your Google Apps Script editor, run <code>authorizeScript</code> once and click <em>Allow</em> to permit sending emails.', 'error');
            showToast('⚠️ Apps Script permission required. Run authorizeScript in editor.');
        } else {
            showReportStatus('⚠️ Unable to send report: ' + (err.message || 'Please check your connection and try again.'), 'error');
            showToast('❌ Unable to send report.');
        }
    } finally {
        if (emailReportBtn) {
            emailReportBtn.disabled = false;
            emailReportBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send to Email';
        }
    }
}

// ==========================================================================
// RIPPLE V2: CATEGORIES & ACCOUNTS MANAGEMENT, TRANSFERS & BALANCES
// ==========================================================================

// --- CATEGORIES & ACCOUNTS PERSISTENCE ---
function loadCategories() {
    try {
        const cached = localStorage.getItem(CACHE_CATEGORIES_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && Array.isArray(parsed.Expense) && Array.isArray(parsed.Income)) {
                categories = parsed;
                return;
            }
        }
    } catch (e) {
        console.warn('[RIPPLE] Failed to load categories from localStorage:', e);
    }
    // Deep clone defaults
    categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    saveCategories();
}

function saveCategories() {
    try {
        localStorage.setItem(CACHE_CATEGORIES_KEY, JSON.stringify(categories));
        if (typeof renderAddCategoryGrid === 'function') {
            renderAddCategoryGrid();
        }
    } catch (e) {
        console.warn('[RIPPLE] Failed to save categories to localStorage:', e);
    }
}

function loadAccounts() {
    try {
        const cached = localStorage.getItem(CACHE_ACCOUNTS_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                accounts = parsed;
                return;
            }
        }
    } catch (e) {
        console.warn('[RIPPLE] Failed to load accounts from localStorage:', e);
    }
    // Deep clone defaults
    accounts = JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS));
    saveAccounts();
}

function saveAccounts() {
    try {
        localStorage.setItem(CACHE_ACCOUNTS_KEY, JSON.stringify(accounts));
        if (typeof updateKeypadAccountPill === 'function') {
            updateKeypadAccountPill();
            updateTransferAccountsUI();
        }
    } catch (e) {
        console.warn('[RIPPLE] Failed to save accounts to localStorage:', e);
    }
}

// --- ACCOUNT-WISE BALANCES & DASHBOARD WIDGET ---
function calculateAccountBalances() {
    const balances = {};
    accounts.forEach(acc => {
        balances[acc.name] = parseAmount(acc.initialBalance || 0);
    });

    transactions.forEach(t => {
        const amt = parseAmount(t.Amount);
        const type = (t.Type || '').toLowerCase();
        const acc = t.Account || 'Cash';
        const toAcc = t.ToAccount || '';

        if (type === 'income') {
            balances[acc] = (balances[acc] || 0) + amt;
        } else if (type === 'expense') {
            balances[acc] = (balances[acc] || 0) - amt;
        } else if (type === 'transfer') {
            if (balances[acc] !== undefined) {
                balances[acc] -= amt;
            }
            if (toAcc && balances[toAcc] !== undefined) {
                balances[toAcc] += amt;
            }
        }
    });

    return balances;
}

function renderDashboardAccounts() {
    const balances = calculateAccountBalances();
    const totalEl = document.getElementById('total-net-balance');
    const listEl = document.getElementById('dashboard-accounts-list');

    let totalNet = 0;
    accounts.forEach(acc => {
        totalNet += (balances[acc.name] || 0);
    });

    if (totalEl) {
        totalEl.textContent = `₹${totalNet.toLocaleString('en-IN')}`;
    }

    if (listEl) {
        listEl.innerHTML = '';
        if (accounts.length === 0) {
            listEl.innerHTML = '<p class="text-muted" style="font-size:0.85rem; padding:8px;">No accounts found. Click Manage to add one.</p>';
            return;
        }

        accounts.forEach(acc => {
            const bal = balances[acc.name] || 0;
            const isNegative = bal < 0;
            const chip = document.createElement('div');
            chip.className = 'account-card-chip';
            chip.onclick = () => filterByAccountAndGoToHistory(acc.name);
            chip.title = `Click to filter history for ${acc.name}`;

            chip.innerHTML = `
                <div class="account-chip-icon" style="background-color: ${acc.color || '#4F46E5'};">
                    <i class="fa-solid ${acc.icon || 'fa-wallet'}"></i>
                </div>
                <div class="account-chip-info">
                    <div class="account-chip-name">${acc.name}</div>
                    <div class="account-chip-balance ${isNegative ? 'account-chip-negative' : ''}">
                        ₹${bal.toLocaleString('en-IN')}
                    </div>
                </div>
            `;
            listEl.appendChild(chip);
        });
    }
}

function filterByAccountAndGoToHistory(accountName) {
    const histAccFilter = document.getElementById('history-account-filter');
    if (histAccFilter) {
        histAccFilter.value = accountName;
    }
    navigateTo('history');
}

// --- CATEGORY MANAGEMENT (SETTINGS) ---
function switchCategoryTab(type) {
    currentCategoryTab = type;
    const tabExp = document.getElementById('tab-cat-expense');
    const tabInc = document.getElementById('tab-cat-income');
    if (tabExp && tabInc) {
        if (type === 'Expense') {
            tabExp.classList.add('active');
            tabInc.classList.remove('active');
        } else {
            tabInc.classList.add('active');
            tabExp.classList.remove('active');
        }
    }
    renderCategoriesManagement();
}

function renderCategoriesManagement() {
    const listEl = document.getElementById('categories-management-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const list = categories[currentCategoryTab] || [];
    if (list.length === 0) {
        listEl.innerHTML = '<p class="text-muted" style="text-align:center; padding:15px;">No categories found. Click Add to create one.</p>';
        return;
    }

    list.forEach((cat, index) => {
        const item = document.createElement('div');
        item.className = 'category-manage-item';
        const isFirst = index === 0;
        const isLast = index === list.length - 1;

        item.innerHTML = `
            <div class="category-item-info">
                <div class="cat-icon-circle" style="background-color: ${cat.color || '#10B981'};">
                    <i class="fa-solid ${cat.icon || 'fa-tag'}"></i>
                </div>
                <div class="category-item-name">${cat.name}</div>
            </div>
            <div class="category-actions">
                <button type="button" class="reorder-btn" title="Move Up" ${isFirst ? 'disabled' : ''} onclick="moveCategory('${cat.id}', -1)">
                    <i class="fa-solid fa-chevron-up"></i>
                </button>
                <button type="button" class="reorder-btn" title="Move Down" ${isLast ? 'disabled' : ''} onclick="moveCategory('${cat.id}', 1)">
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
                <button type="button" class="action-btn-edit" title="Edit" onclick="openCategoryModal('edit', '${cat.id}')">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button type="button" class="action-btn-del" title="Delete" onclick="deleteCategory('${cat.id}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        listEl.appendChild(item);
    });
}

function moveCategory(catId, dir) {
    const list = categories[currentCategoryTab];
    if (!list) return;
    const idx = list.findIndex(c => c.id === catId);
    if (idx === -1) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;

    list.forEach((c, i) => c.order = i + 1);
    saveCategories();
    renderCategoriesManagement();
    updateCategoryOptions();
}

function deleteCategory(catId) {
    const list = categories[currentCategoryTab];
    if (!list) return;
    const cat = list.find(c => c.id === catId);
    if (!cat) return;

    if (list.length <= 1) {
        showToast('⚠️ You must have at least one category.');
        return;
    }

    const inUse = transactions.some(t => t.Category && t.Category.toLowerCase() === cat.name.toLowerCase());
    if (inUse) {
        if (!confirm(`Category "${cat.name}" is used in existing transactions. Are you sure you want to delete it from the list?`)) {
            return;
        }
    } else {
        if (!confirm(`Delete category "${cat.name}"?`)) return;
    }

    categories[currentCategoryTab] = list.filter(c => c.id !== catId);
    saveCategories();
    renderCategoriesManagement();
    updateCategoryOptions();
    showToast(`Category "${cat.name}" deleted.`);
}

// Category Modal Logic
function openCategoryModal(mode, catId) {
    const modal = document.getElementById('category-modal');
    const titleEl = document.getElementById('category-modal-title');
    const nameInput = document.getElementById('category-name-input');
    const idInput = document.getElementById('category-edit-id');
    const typeInput = document.getElementById('category-edit-type');
    const customColorInput = document.getElementById('category-custom-color');

    typeInput.value = currentCategoryTab;

    if (mode === 'edit' && catId) {
        const cat = (categories[currentCategoryTab] || []).find(c => c.id === catId);
        if (!cat) return;
        titleEl.textContent = `Edit ${currentCategoryTab} Category`;
        idInput.value = cat.id;
        nameInput.value = cat.name;
        selectedModalColor = cat.color || '#10B981';
        selectedModalIcon = cat.icon || 'fa-utensils';
    } else {
        titleEl.textContent = `Add ${currentCategoryTab} Category`;
        idInput.value = '';
        nameInput.value = '';
        selectedModalColor = currentCategoryTab === 'Expense' ? '#EF4444' : '#10B981';
        selectedModalIcon = currentCategoryTab === 'Expense' ? 'fa-utensils' : 'fa-money-bill-wave';
    }

    if (customColorInput) customColorInput.value = selectedModalColor;
    renderColorPalette('category', selectedModalColor);
    renderIconGrid('category', selectedModalIcon);
    updateCategoryPreview();

    modal.classList.remove('hidden');
    nameInput.focus();
}

function closeCategoryModal() {
    const modal = document.getElementById('category-modal');
    if (modal) modal.classList.add('hidden');
}

function updateCategoryPreview() {
    const nameInput = document.getElementById('category-name-input');
    const previewName = document.getElementById('preview-cat-name');
    const previewIcon = document.getElementById('preview-cat-icon');

    if (previewName) {
        previewName.textContent = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'Category Name';
    }
    if (previewIcon) {
        previewIcon.style.backgroundColor = selectedModalColor;
        previewIcon.innerHTML = `<i class="fa-solid ${selectedModalIcon}"></i>`;
    }
}

function handleCategoryFormSubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('category-name-input');
    const idInput = document.getElementById('category-edit-id');
    const typeInput = document.getElementById('category-edit-type');

    const name = (nameInput.value || '').trim();
    if (!name) {
        showToast('⚠️ Please enter a category name.');
        return;
    }

    const type = typeInput.value || currentCategoryTab;
    const list = categories[type] || [];
    const editId = idInput.value;

    // Check duplicate name
    const isDuplicate = list.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editId);
    if (isDuplicate) {
        showToast(`⚠️ A category named "${name}" already exists.`);
        return;
    }

    if (editId) {
        const cat = list.find(c => c.id === editId);
        if (cat) {
            cat.name = name;
            cat.color = selectedModalColor;
            cat.icon = selectedModalIcon;
        }
        showToast(`Category "${name}" updated!`);
    } else {
        const newCat = {
            id: 'cat_' + Date.now(),
            name: name,
            type: type,
            icon: selectedModalIcon,
            color: selectedModalColor,
            order: list.length + 1
        };
        list.push(newCat);
        showToast(`Category "${name}" added!`);
    }

    saveCategories();
    renderCategoriesManagement();
    updateCategoryOptions();
    closeCategoryModal();
}

// --- ACCOUNT MANAGEMENT (SETTINGS) ---
function renderAccountsManagement() {
    const listEl = document.getElementById('accounts-management-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const balances = calculateAccountBalances();

    accounts.forEach(acc => {
        const bal = balances[acc.name] || 0;
        const card = document.createElement('div');
        card.className = 'account-settings-card';

        card.innerHTML = `
            <div class="account-card-left">
                <div class="acc-icon-circle" style="background-color: ${acc.color || '#4F46E5'};">
                    <i class="fa-solid ${acc.icon || 'fa-building-columns'}"></i>
                </div>
                <div>
                    <div style="font-weight:600; font-size:1rem; color:var(--text-main);">${acc.name}</div>
                    <span class="account-type-tag">${acc.type || 'account'}</span>
                </div>
            </div>
            <div style="display:flex; align-items:center;">
                <div class="account-card-balance-info">
                    <div class="account-current-bal">₹${bal.toLocaleString('en-IN')}</div>
                    <div class="account-init-bal">Initial: ₹${parseAmount(acc.initialBalance || 0).toLocaleString('en-IN')}</div>
                </div>
                <div class="category-actions">
                    <button type="button" class="action-btn-edit" title="Edit" onclick="openAccountModal('edit', '${acc.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button type="button" class="action-btn-del" title="Delete" onclick="deleteAccount('${acc.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        listEl.appendChild(card);
    });
}

function openAccountModal(mode, accId) {
    const modal = document.getElementById('account-modal');
    const titleEl = document.getElementById('account-modal-title');
    const nameInput = document.getElementById('account-name-input');
    const typeSelect = document.getElementById('account-type-select');
    const balanceInput = document.getElementById('account-balance-input');
    const idInput = document.getElementById('account-edit-id');
    const customColorInput = document.getElementById('account-custom-color');

    if (mode === 'edit' && accId) {
        const acc = accounts.find(a => a.id === accId);
        if (!acc) return;
        titleEl.textContent = 'Edit Account';
        idInput.value = acc.id;
        nameInput.value = acc.name;
        typeSelect.value = acc.type || 'bank';
        balanceInput.value = parseAmount(acc.initialBalance || 0);
        selectedModalColor = acc.color || '#4F46E5';
        selectedModalIcon = acc.icon || 'fa-building-columns';
    } else {
        titleEl.textContent = 'Add Account';
        idInput.value = '';
        nameInput.value = '';
        typeSelect.value = 'bank';
        balanceInput.value = '0.00';
        selectedModalColor = '#4F46E5';
        selectedModalIcon = 'fa-building-columns';
    }

    if (customColorInput) customColorInput.value = selectedModalColor;
    renderColorPalette('account', selectedModalColor);
    renderIconGrid('account', selectedModalIcon);
    updateAccountPreview();

    modal.classList.remove('hidden');
    nameInput.focus();
}

function closeAccountModal() {
    const modal = document.getElementById('account-modal');
    if (modal) modal.classList.add('hidden');
}

function updateAccountPreview() {
    const nameInput = document.getElementById('account-name-input');
    const typeSelect = document.getElementById('account-type-select');
    const previewName = document.getElementById('preview-acc-name');
    const previewType = document.getElementById('preview-acc-type');
    const previewIcon = document.getElementById('preview-acc-icon');

    if (previewName) {
        previewName.textContent = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'Account Name';
    }
    if (previewType && typeSelect) {
        const typeLabels = {
            bank: 'Bank Account',
            cash: 'Cash',
            upi: 'UPI',
            credit: 'Credit Card',
            wallet: 'Wallet',
            other: 'Other'
        };
        previewType.textContent = typeLabels[typeSelect.value] || 'Account';
    }
    if (previewIcon) {
        previewIcon.style.backgroundColor = selectedModalColor;
        previewIcon.innerHTML = `<i class="fa-solid ${selectedModalIcon}"></i>`;
    }
}

function handleAccountFormSubmit(e) {
    e.preventDefault();
    const nameInput = document.getElementById('account-name-input');
    const typeSelect = document.getElementById('account-type-select');
    const balanceInput = document.getElementById('account-balance-input');
    const idInput = document.getElementById('account-edit-id');

    const name = (nameInput.value || '').trim();
    if (!name) {
        showToast('⚠️ Please enter an account name.');
        return;
    }

    const type = typeSelect.value || 'bank';
    const initBal = parseAmount(balanceInput.value || 0);
    const editId = idInput.value;

    const isDuplicate = accounts.some(a => a.name.toLowerCase() === name.toLowerCase() && a.id !== editId);
    if (isDuplicate) {
        showToast(`⚠️ An account named "${name}" already exists.`);
        return;
    }

    if (editId) {
        const acc = accounts.find(a => a.id === editId);
        if (acc) {
            const oldName = acc.name;
            acc.name = name;
            acc.type = type;
            acc.initialBalance = initBal;
            acc.color = selectedModalColor;
            acc.icon = selectedModalIcon;

            // If account name changed, update transactions referencing old name
            if (oldName !== name) {
                transactions.forEach(t => {
                    if (t.Account === oldName) t.Account = name;
                    if (t.ToAccount === oldName) t.ToAccount = name;
                });
                saveTransactionsToCache();
            }
        }
        showToast(`Account "${name}" updated!`);
    } else {
        const newAcc = {
            id: 'acc_' + Date.now(),
            name: name,
            type: type,
            initialBalance: initBal,
            color: selectedModalColor,
            icon: selectedModalIcon,
            isDefault: false,
            order: accounts.length + 1
        };
        accounts.push(newAcc);
        showToast(`Account "${name}" added!`);
    }

    saveAccounts();
    updateAccountOptions();
    renderAccountsManagement();
    renderDashboardAccounts();
    renderHistoryTable();
    closeAccountModal();
}

function deleteAccount(accId) {
    const acc = accounts.find(a => a.id === accId);
    if (!acc) return;

    if (accounts.length <= 1) {
        showToast('⚠️ You must have at least one active account.');
        return;
    }

    const inUse = transactions.some(t => 
        (t.Account && t.Account.toLowerCase() === acc.name.toLowerCase()) ||
        (t.ToAccount && t.ToAccount.toLowerCase() === acc.name.toLowerCase())
    );

    if (inUse) {
        if (!confirm(`Account "${acc.name}" has transactions linked to it. Deleting will remove it from the account list. Proceed?`)) {
            return;
        }
    } else {
        if (!confirm(`Delete account "${acc.name}"?`)) return;
    }

    accounts = accounts.filter(a => a.id !== accId);
    saveAccounts();
    updateAccountOptions();
    renderAccountsManagement();
    renderDashboardAccounts();
    renderHistoryTable();
    showToast(`Account "${acc.name}" deleted.`);
}

// --- SHARED MODAL HELPERS (PALETTE & ICON GRID) ---
function renderColorPalette(context, activeColor) {
    const container = document.getElementById(`${context}-color-palette`);
    if (!container) return;
    container.innerHTML = '';

    CURATED_COLORS.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = `color-swatch ${color.toLowerCase() === activeColor.toLowerCase() ? 'selected' : ''}`;
        swatch.style.backgroundColor = color;
        swatch.onclick = () => {
            selectedModalColor = color;
            document.querySelectorAll(`#${context}-color-palette .color-swatch`).forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            const customInput = document.getElementById(`${context}-custom-color`);
            if (customInput) customInput.value = color;
            if (context === 'category') updateCategoryPreview();
            if (context === 'account') updateAccountPreview();
        };
        container.appendChild(swatch);
    });

    const customInput = document.getElementById(`${context}-custom-color`);
    if (customInput) {
        customInput.oninput = (e) => {
            selectedModalColor = e.target.value;
            document.querySelectorAll(`#${context}-color-palette .color-swatch`).forEach(s => s.classList.remove('selected'));
            if (context === 'category') updateCategoryPreview();
            if (context === 'account') updateAccountPreview();
        };
    }
}

function renderIconGrid(context, activeIcon) {
    const container = document.getElementById(`${context}-icon-grid`);
    if (!container) return;
    container.innerHTML = '';

    CURATED_ICONS.forEach(icon => {
        const option = document.createElement('div');
        option.className = `icon-option ${icon === activeIcon ? 'selected' : ''}`;
        option.innerHTML = `<i class="fa-solid ${icon}"></i>`;
        option.onclick = () => {
            selectedModalIcon = icon;
            document.querySelectorAll(`#${context}-icon-grid .icon-option`).forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            if (context === 'category') updateCategoryPreview();
            if (context === 'account') updateAccountPreview();
        };
        container.appendChild(option);
    });

    // Real-time preview on input changes
    const nameInput = document.getElementById(`${context}-name-input`);
    if (nameInput) {
        nameInput.oninput = () => {
            if (context === 'category') updateCategoryPreview();
            if (context === 'account') updateAccountPreview();
        };
    }

    if (context === 'account') {
        const typeSelect = document.getElementById('account-type-select');
        if (typeSelect) {
            typeSelect.onchange = () => updateAccountPreview();
        }
    }
}

// --- GLOBAL EXPORTS FOR INLINE ONCLICK EVENT HANDLERS ---
window.switchCategoryTab = switchCategoryTab;
window.renderCategoriesManagement = renderCategoriesManagement;
window.moveCategory = moveCategory;
window.deleteCategory = deleteCategory;
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.handleCategoryFormSubmit = handleCategoryFormSubmit;
window.renderAccountsManagement = renderAccountsManagement;
window.openAccountModal = openAccountModal;
window.closeAccountModal = closeAccountModal;
window.handleAccountFormSubmit = handleAccountFormSubmit;
window.deleteAccount = deleteAccount;
window.filterByAccountAndGoToHistory = filterByAccountAndGoToHistory;

