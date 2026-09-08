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
let lastFetchTimestamp = 0;

// --- STATE MANAGEMENT ---
let transactions = [];
let categoryPieChart = null;
let incomeExpenseBarChart = null;
let analyticsLineChart = null;
let currentAnalyticsTab = 'expenses'; // 'expenses' or 'earnings'

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

// Form Elements
const addForm = document.getElementById('add-transaction-form');
const typeRadios = document.getElementsByName('type');
const categorySelect = document.getElementById('category');
const expenseCategories = document.getElementById('expense-categories');
const incomeCategories = document.getElementById('income-categories');
const dateInput = document.getElementById('date');

// History Elements
const historyTableBody = document.getElementById('history-table-body');
const searchHistoryInput = document.getElementById('search-history');
const historyMonthFilter = document.getElementById('history-month-filter');
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

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today in local format (YYYY-MM-DD)
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    
    // Set default month filter to current month (YYYY-MM)
    historyMonthFilter.value = `${yyyy}-${mm}`;

    // Setup event listeners
    setupNavigation();
    setupFormToggle();
    setupFormSubmission();
    setupFilters();
    setupSettings();
    setupMobileLifecycle();

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
    if (viewId === 'dashboard') {
        updateDashboard();
    } else if (viewId === 'history') {
        renderHistoryTable();
    } else if (viewId === 'analytics') {
        updateAnalytics();
    } else if (viewId === 'settings') {
        closeSettingsSub();
    }
}

// Ensure navigateTo is globally available for inline onclick
window.app = {
    navigateTo: navigateTo
};

// --- FORM HANDLING ---
function setupFormToggle() {
    typeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'Income') {
                expenseCategories.style.display = 'none';
                incomeCategories.style.display = 'block';
                categorySelect.value = incomeCategories.querySelector('option').value;
            } else {
                expenseCategories.style.display = 'block';
                incomeCategories.style.display = 'none';
                categorySelect.value = expenseCategories.querySelector('option').value;
            }
        });
    });
}

function setupFormSubmission() {
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // --- VALIDATION ---
        const formData = new FormData(addForm);
        const rawAmount = formData.get('amount');
        const category = formData.get('category');
        const type = formData.get('type');
        const dateVal = formData.get('date');

        const parsedAmount = parseAmount(rawAmount);
        if (parsedAmount <= 0) {
            showToast('⚠️ Please enter a valid amount.');
            return;
        }
        if (!category) {
            showToast('⚠️ Please select a category.');
            return;
        }
        if (!type) {
            showToast('⚠️ Please select a transaction type.');
            return;
        }
        if (!dateVal) {
            showToast('⚠️ Please select a date.');
            return;
        }

        // Format date to standard DD-MMM-YYYY with English month (e.g. 08-Sep-2026)
        // Date input is guaranteed YYYY-MM-DD
        const [y, m, d] = dateVal.split('-').map(Number);
        const dateStr = `${String(d).padStart(2, '0')}-${MONTH_NAMES[m - 1]}-${y}`;

        const transactionData = {
            date: dateStr,
            category: category,
            amount: parsedAmount,
            type: type,
            notes: (formData.get('notes') || '').trim()
        };

        // Disable submit button to prevent double-clicks
        const submitBtn = addForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        try {
            await saveTransactionToCloud(transactionData);
            addForm.reset();
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dateInput.value = `${yyyy}-${mm}-${dd}`;
            document.getElementById('type-expense').click();
        } catch (err) {
            debugLog('Form submission error', err);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Transaction';
        }
    });
}

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
                    Type: t.Type || '',
                    Notes: t.Notes || ''
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
                    Type: t.Type || '',
                    Notes: t.Notes || ''
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

    // --- OPTIMISTIC UI UPDATE ---
    const existingTx = transactions.find(t => 
        formatDateDisplay(t.Date).toLowerCase() === normalizedDate.toLowerCase() && 
        String(t.Category || '').trim().toLowerCase() === String(transaction.category || '').trim().toLowerCase() && 
        String(t.Type || '').trim().toLowerCase() === String(transaction.type || '').trim().toLowerCase()
    );

    if (existingTx) {
        existingTx.Amount = parseAmount(existingTx.Amount) + txAmount;
    } else {
        transactions.unshift({
            rowId: 'temp_' + Date.now(),
            Date: normalizedDate,
            Category: transaction.category,
            Amount: txAmount,
            Type: transaction.type,
            Notes: transaction.notes || ''
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

// Locale-independent current month filter
function getCurrentMonthData() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    return transactions.filter(t => {
        const d = parseDate(t.Date);
        return d && d.getFullYear() === currentYear && d.getMonth() === currentMonth;
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

    // Update UI
    monthlyIncomeEl.textContent = `₹${income.toLocaleString('en-IN')}`;
    monthlyExpenseEl.textContent = `₹${expense.toLocaleString('en-IN')}`;
    monthlySavingsEl.textContent = `₹${savings.toLocaleString('en-IN')}`;

    // Recent Transactions Preview (max 3)
    recentTransactionsList.innerHTML = '';
    const recent = transactions.slice(0, 3);

    if (recent.length === 0) {
        recentTransactionsList.innerHTML = '<p class="text-muted" style="text-align:center; padding:10px;">No transactions added yet.</p>';
    } else {
        recent.forEach(t => {
            const isExpense = t.Type === 'Expense';
            const icon = isExpense ? 'fa-arrow-trend-down' : 'fa-arrow-trend-up';
            const colorClass = isExpense ? 'amount-expense' : 'amount-income';
            const sign = isExpense ? '-' : '+';
            const formattedDate = formatDateDisplay(t.Date);
            const html = `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:36px; height:36px; border-radius:50%; background-color: var(--bg-color); display:flex; justify-content:center; align-items:center; color: var(--text-muted);">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div>
                            <p style="font-weight:500; font-size:0.95rem;">${t.Category}</p>
                            <p style="font-size:0.75rem; color:var(--text-muted);">${formattedDate}</p>
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
    searchHistoryInput.addEventListener('input', renderHistoryTable);
    historyMonthFilter.addEventListener('change', renderHistoryTable);

    analyticsTimeFilter.addEventListener('change', updateAnalytics);

    analyticsTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            analyticsTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentAnalyticsTab = e.target.getAttribute('data-tab');
            updateAnalytics();
        });
    });
}

function filterTransactions() {
    const searchTerm = (searchHistoryInput.value || '').trim().toLowerCase();
    const monthFilter = historyMonthFilter.value; // Format: YYYY-MM

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
        const matchesSearch = !searchTerm || notesMatch || categoryMatch;

        let matchesMonth = true;
        if (filterYear !== null && filterMonth !== null) {
            const d = parseDate(t.Date);
            matchesMonth = d && d.getFullYear() === filterYear && d.getMonth() === filterMonth;
        }

        return matchesSearch && matchesMonth;
    });
}

function renderHistoryTable() {
    const filtered = filterTransactions();
    historyTableBody.innerHTML = '';

    if (filtered.length === 0) {
        tableResponsive.classList.add('hidden');
        noHistoryMsg.classList.remove('hidden');
        return;
    }

    tableResponsive.classList.remove('hidden');
    noHistoryMsg.classList.add('hidden');

    filtered.forEach((t) => {
        const realIndex = transactions.indexOf(t);

        const isExpense = t.Type === 'Expense';
        const colorClass = isExpense ? 'amount-expense' : 'amount-income';
        const sign = isExpense ? '-' : '+';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDateDisplay(t.Date)}</td>
            <td><span class="category-badge">${t.Category}</span></td>
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
    const timeFilter = analyticsTimeFilter.value; // 'weekly' or 'monthly'
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
    document.getElementById('settings-main-menu').classList.add('hidden');
    document.querySelectorAll('.settings-subview').forEach(view => {
        view.classList.add('hidden');
    });
    const targetSub = document.getElementById(`settings-sub-${subId}`);
    if (targetSub) targetSub.classList.remove('hidden');
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
