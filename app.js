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
    setupMonthlyReport();

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
    } else if (viewId === 'report') {
        initReportView();
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
    const prevSavings = prevIncome - prevExpense;
    const hasPrevData = (prevIncome > 0 || prevExpense > 0);

    const incomeChangePct = (hasPrevData && prevIncome > 0) ? (((totalIncome - prevIncome) / prevIncome) * 100) : null;
    const expenseChangePct = (hasPrevData && prevExpense > 0) ? (((totalExpense - prevExpense) / prevExpense) * 100) : null;
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
        hasPrevData,
        prevIncome,
        prevExpense,
        prevSavings,
        incomeChangePct,
        expenseChangePct,
        savingsChangePct,
        generatedAt: new Date()
    };
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
    const netSavingsEl = document.getElementById('report-net-savings');
    const savingsRateEl = document.getElementById('report-savings-rate');

    if (totalIncomeEl) totalIncomeEl.textContent = `₹${report.totalIncome.toLocaleString('en-IN')}`;
    if (incomeCountEl) incomeCountEl.textContent = `${report.incomeCount} transaction${report.incomeCount === 1 ? '' : 's'}`;
    if (totalExpenseEl) totalExpenseEl.textContent = `₹${report.totalExpense.toLocaleString('en-IN')}`;
    if (expenseCountEl) expenseCountEl.textContent = `${report.expenseCount} transaction${report.expenseCount === 1 ? '' : 's'}`;
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
            const momIncEl = document.getElementById('mom-income-change');
            const momExpEl = document.getElementById('mom-expense-change');
            const momSavEl = document.getElementById('mom-savings-change');
            if (momIncEl) momIncEl.innerHTML = formatChange(report.incomeChangePct);
            if (momExpEl) momExpEl.innerHTML = formatChange(report.expenseChangePct);
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
        head: [['Total Income', 'Total Expenses', 'Net Savings', 'Savings Rate', 'Transactions']],
        body: [[
            `+Rs. ${report.totalIncome.toLocaleString('en-IN')}`,
            `-Rs. ${report.totalExpense.toLocaleString('en-IN')}`,
            netSavingsFormatted,
            `${report.savingsRate.toFixed(2)}%`,
            `${report.incomeCount + report.expenseCount} total`
        ]],
        headStyles: {
            fillColor: [241, 245, 249],
            textColor: [71, 85, 105],
            fontStyle: 'bold',
            fontSize: 8.5,
            halign: 'center',
            cellPadding: 3.5
        },
        bodyStyles: {
            fontSize: 10,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: 3.5
        },
        columnStyles: {
            0: { cellWidth: 37, textColor: [16, 185, 129] },
            1: { cellWidth: 37, textColor: [239, 68, 68] },
            2: { cellWidth: 36, textColor: [99, 102, 241] },
            3: { cellWidth: 36, textColor: [99, 102, 241] },
            4: { cellWidth: 36, textColor: [71, 85, 105] }
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

