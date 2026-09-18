/**
 * EXPENSE TRACKER - GOOGLE APPS SCRIPT BACKEND
 *
 * Instructions:
 * 1. Open Google Sheets and create a new sheet named "Sheet1" (or rename accordingly).
 *    Set headers in Row 1: Date | Category | Amount | Type | Notes
 * 2. Go to Extensions > Apps Script.
 * 3. Delete any code there and paste this entire file.
 * 4. Click Save (disk icon).
 * 5. Click Deploy > New deployment.
 * 6. Select type: "Web app".
 * 7. Description: "Expense Tracker API v1"
 * 8. Execute as: "Me"
 * 9. Who has access: "Anyone"
 * 10. Click Deploy and authorize the script.
 * 11. Copy the Web App URL and paste it into app.js `SCRIPT_URL`.
 */

const SHEET_NAME = 'Sheet1'; // Change if your sheet name is different

/**
 * =========================================================================
 * ONE-CLICK PERMISSION AUTHORIZATION FUNCTION
 * =========================================================================
 * Because sending emails requires Google Mail permissions, you MUST run this
 * function ONCE directly inside the Apps Script editor to authorize it:
 *
 * 1. At the top of the Google Apps Script editor, select 'authorizeScript'
 *    from the function dropdown (next to 'Debug').
 * 2. Click the 'Run' button.
 * 3. A popup will say: "Authorization required". Click "Review permissions".
 * 4. Choose your Google Account.
 * 5. If you see "Google hasn't verified this app", click "Advanced" (bottom left)
 *    and click "Go to Untitled project (unsafe)" / "Go to RIPPLE (unsafe)".
 * 6. Click "Allow".
 * 7. Once authorized, all emails from RIPPLE will send immediately!
 * =========================================================================
 */
function authorizeScript() {
  Logger.log("Testing permissions for SpreadsheetApp and MailApp...");
  const quota = MailApp.getRemainingDailyQuota();
  Logger.log("✅ Success! MailApp is AUTHORIZED. Remaining daily email quota: " + quota);
}

/**
 * TEST FUNCTION TO VERIFY EMAIL DELIVERY TO YOURSELF
 * You can select 'testSendReportToSelf' and click 'Run' to verify that
 * email sending and PDF attachments are working properly.
 */
function testSendReportToSelf() {
  const userEmail = Session.getActiveUser().getEmail();
  Logger.log("Sending test financial report to: " + userEmail);
  const sheet = getSheet();
  const result = handleSendMonthlyReport({
    email: userEmail,
    month: '2026-08',
    monthLabel: 'August 2026'
  }, sheet);
  Logger.log("Result: " + result.getContent());
}

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function setupSheet() {
  const sheet = getSheet();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Date',
      'Category',
      'Amount',
      'Type',
      'Notes',
      'Account',
      'ToAccount'
    ]);
  } else {
    // Check if headers need V2 upgrade (columns F and G for Account and ToAccount)
    const lastCol = sheet.getLastColumn();
    if (lastCol < 6) {
      sheet.getRange(1, 6).setValue('Account');
    }
    if (lastCol < 7) {
      sheet.getRange(1, 7).setValue('ToAccount');
    }
  }
}

function doGet() {
  setupSheet();
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        data: []
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const transactions = [];

  for (let i = 1; i < data.length; i++) {
    let dateVal = data[i][0];
    if (dateVal instanceof Date) {
      dateVal = Utilities.formatDate(
        dateVal,
        Session.getScriptTimeZone(),
        "dd-MMM-yyyy"
      ).toLowerCase();
    }
    transactions.push({
      rowId: i + 1,
      Date: dateVal,
      Category: data[i][1],
      Amount: parseFloat(data[i][2]) || 0,
      Type: data[i][3],
      Notes: data[i][4] || '',
      Account: data[i][5] || 'Cash',
      ToAccount: data[i][6] || ''
    });
  }

  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      data: transactions
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  setupSheet();
  try {
    const sheet = getSheet();
    // Log incoming request data for debugging
    Logger.log('doPost received raw: ' + e.postData.contents);
    const requestData = JSON.parse(e.postData.contents);

    // DELETE
    if (requestData.action === 'delete') {
      const rowId = parseInt(requestData.rowId, 10);
      if (!rowId || rowId <= 1) {
        throw new Error('Invalid rowId');
      }
      sheet.deleteRow(rowId);
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'success',
          message: 'Deleted'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // SEND MONTHLY REPORT VIA EMAIL
    if (requestData.action === 'send_monthly_report') {
      return handleSendMonthlyReport(requestData, sheet);
    }

    // ADD OR UPDATE
    // Log parsed request data
    Logger.log('Parsed requestData: ' + JSON.stringify(requestData));
    const category = requestData.category || requestData.Category || '';
    const amount = parseFloat(requestData.amount || requestData.Amount || 0);
    const type = requestData.type || requestData.Type || 'Expense';
    const notes = requestData.notes || requestData.Notes || '';
    const account = requestData.account || requestData.Account || 'Cash';
    const toAccount = requestData.toAccount || requestData.ToAccount || '';

    // Transaction date handling: expect date in ISO format or already formatted
    const rawDate = requestData.date || requestData.Date || new Date();
    // Ensure date is in dd-MMM-yyyy format for the sheet
    const txDate = (function (d) {
      // If d is a Date object, format directly
      if (d instanceof Date) {
        return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
      }
      // If d is a string, try parsing as ISO then format; if parsing fails, assume already formatted
      try {
        const parsed = new Date(d);
        if (!isNaN(parsed)) {
          return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
        }
      } catch (e) { }
      // Return as‑is (presumed correctly formatted)
      return d;
    })(rawDate);

    const rows = sheet.getDataRange().getValues();
    let existingRow = -1;

    // NEVER combine transfer transactions: each transfer to/from a person or account is a distinct transaction
    const isTransferTx = String(type).trim().toLowerCase() === 'transfer' || String(category).trim().toLowerCase() === 'transfer';

    if (!isTransferTx) {
      for (let i = 1; i < rows.length; i++) {
        let rDate = rows[i][0];
        if (rDate instanceof Date) {
          rDate = Utilities.formatDate(rDate, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
        }
        const rowDate = String(rDate).trim().toLowerCase();
        const rowCategory = String(rows[i][1]).trim().toLowerCase();
        const rowType = String(rows[i][3]).trim().toLowerCase();
        const rowAccount = String(rows[i][5] || 'Cash').trim().toLowerCase();

        if (
          rowDate === String(txDate).trim().toLowerCase() &&
          rowCategory === String(category).trim().toLowerCase() &&
          rowType === String(type).trim().toLowerCase() &&
          rowAccount === String(account).trim().toLowerCase()
        ) {
          existingRow = i + 1;
          break;
        }
      }
    }

    if (existingRow > 0) {
      const currentAmount = parseFloat(sheet.getRange(existingRow, 3).getValue()) || 0;
      // Preserve existing notes; do not modify the Notes column
      sheet.getRange(existingRow, 3).setValue(currentAmount + amount);
      Logger.log('Updated existing row #' + existingRow + ' amount to ' + (currentAmount + amount));
    } else {
      sheet.appendRow([txDate, category, amount, type, notes, account, toAccount]);
      Logger.log('Appended new row: ' + [txDate, category, amount, type, notes, account, toAccount]);
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Saved'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Parses any date value into a standard JavaScript Date object
 */
function parseScriptDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();

  const monthMap = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };

  const textMatch = s.match(/^(\d{1,2})[-/\s]([A-Za-z]+)[-/\s](\d{4})/);
  if (textMatch) {
    const day = parseInt(textMatch[1], 10);
    const mKey = textMatch[2].toLowerCase();
    const year = parseInt(textMatch[3], 10);
    if (monthMap[mKey] !== undefined) {
      return new Date(year, monthMap[mKey], day);
    }
  }

  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Generates monthly financial summary, converts it to PDF, and emails it
 */
function handleSendMonthlyReport(requestData, sheet) {
  const recipientEmail = (requestData.email || '').trim();
  if (!recipientEmail || recipientEmail.indexOf('@') === -1) {
    throw new Error('A valid recipient email address is required.');
  }

  const monthStr = requestData.month || ''; // Format: YYYY-MM (e.g. '2026-08')
  let targetYear = null;
  let targetMonth = null;

  if (monthStr && monthStr.indexOf('-') !== -1) {
    const parts = monthStr.split('-');
    targetYear = parseInt(parts[0], 10);
    targetMonth = parseInt(parts[1], 10) - 1; // 0-indexed month
  } else {
    const now = new Date();
    targetYear = now.getFullYear();
    targetMonth = now.getMonth();
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthLabel = requestData.monthLabel || (monthNames[targetMonth] + ' ' + targetYear);

  // Read transactions directly from Google Sheet
  const rows = sheet.getDataRange().getValues();
  const incomeList = [];
  const expenseList = [];
  let totalIncome = 0;
  let totalExpense = 0;
  const categoryTotals = {};
  const dailySpending = {};

  for (let i = 1; i < rows.length; i++) {
    const rDate = rows[i][0];
    const rCategory = String(rows[i][1] || '').trim();
    const rAmount = parseFloat(String(rows[i][2]).replace(/[^\d.-]/g, '')) || 0;
    const rType = String(rows[i][3] || '').trim();
    const rNotes = String(rows[i][4] || '').trim();

    const d = parseScriptDate(rDate);
    if (!d) continue;

    if (d.getFullYear() === targetYear && d.getMonth() === targetMonth) {
      const formattedDate = Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
      const item = {
        date: formattedDate,
        category: rCategory,
        amount: rAmount,
        notes: rNotes
      };

      if (rType.toLowerCase() === 'income') {
        totalIncome += rAmount;
        incomeList.push(item);
      } else if (rType.toLowerCase() === 'expense') {
        totalExpense += rAmount;
        expenseList.push(item);
        categoryTotals[rCategory] = (categoryTotals[rCategory] || 0) + rAmount;
        dailySpending[formattedDate] = (dailySpending[formattedDate] || 0) + rAmount;
      }
    }
  }

  // Financial calculations
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(2) : '0.00';
  const totalTxCount = incomeList.length + expenseList.length;

  // Category breakdown
  const categoryBreakdown = [];
  for (const cat in categoryTotals) {
    const amt = categoryTotals[cat];
    const pct = totalExpense > 0 ? ((amt / totalExpense) * 100).toFixed(1) : '0.0';
    categoryBreakdown.push({ category: cat, amount: amt, percentage: pct });
  }
  categoryBreakdown.sort(function(a, b) { return b.amount - a.amount; });

  // Spending insights
  let highestCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;
  let highestExpense = null;
  for (let j = 0; j < expenseList.length; j++) {
    if (!highestExpense || expenseList[j].amount > highestExpense.amount) {
      highestExpense = expenseList[j];
    }
  }

  let peakDay = '-';
  let peakDayAmt = 0;
  for (const day in dailySpending) {
    if (dailySpending[day] > peakDayAmt) {
      peakDayAmt = dailySpending[day];
      peakDay = day;
    }
  }

  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const avgDailySpending = (totalExpense / daysInMonth).toFixed(2);
  const avgTxAmount = expenseList.length > 0 ? (totalExpense / expenseList.length).toFixed(2) : '0.00';

  // Build Executive HTML for PDF
  const pdfHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>RIPPLE Financial Report - ${monthLabel}</title>
      <style>
        body { font-family: Helvetica, Arial, sans-serif; color: #1E293B; margin: 25px; line-height: 1.4; font-size: 11px; }
        .header { border-bottom: 2px solid #4F46E5; padding-bottom: 12px; margin-bottom: 20px; }
        .brand { font-size: 20px; font-weight: bold; color: #4F46E5; letter-spacing: 1px; }
        .title { font-size: 14px; font-weight: 600; color: #334155; margin-top: 2px; }
        .meta { font-size: 10px; color: #64748B; margin-top: 4px; }
        .summary-box { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
        .summary-box td { width: 25%; padding: 10px; background: #F8FAFC; border: 1px solid #E2E8F0; text-align: center; }
        .stat-label { font-size: 9px; color: #64748B; text-transform: uppercase; font-weight: 600; }
        .stat-value { font-size: 15px; font-weight: bold; margin-top: 3px; }
        .income { color: #10B981; }
        .expense { color: #EF4444; }
        .savings { color: #6366F1; }
        .section-title { font-size: 12px; font-weight: bold; color: #1E293B; margin-top: 15px; margin-bottom: 8px; border-bottom: 1px solid #CBD5E1; padding-bottom: 4px; }
        table.data-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        table.data-table th { background-color: #F1F5F9; border: 1px solid #E2E8F0; padding: 6px 8px; font-size: 9px; text-align: left; text-transform: uppercase; color: #475569; }
        table.data-table td { border: 1px solid #E2E8F0; padding: 5px 8px; font-size: 10px; }
        .text-right { text-align: right; }
        .insights-box { background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 6px; padding: 10px; margin-bottom: 15px; }
        .insights-grid { width: 100%; border-collapse: collapse; }
        .insights-grid td { padding: 4px 6px; font-size: 10px; }
        .footer { margin-top: 25px; border-top: 1px solid #E2E8F0; padding-top: 8px; font-size: 9px; color: #94A3B8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">RIPPLE</div>
        <div class="title">Monthly Financial Report – ${monthLabel}</div>
        <div class="meta">Generated: ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy HH:mm')} | Recipient: ${recipientEmail}</div>
      </div>

      <table class="summary-box">
        <tr>
          <td>
            <div class="stat-label">Total Income</div>
            <div class="stat-value income">₹${totalIncome.toLocaleString('en-IN')}</div>
            <div style="font-size:8px; color:#64748B;">${incomeList.length} transactions</div>
          </td>
          <td>
            <div class="stat-label">Total Expenses</div>
            <div class="stat-value expense">₹${totalExpense.toLocaleString('en-IN')}</div>
            <div style="font-size:8px; color:#64748B;">${expenseList.length} transactions</div>
          </td>
          <td>
            <div class="stat-label">Net Savings</div>
            <div class="stat-value savings">₹${netSavings.toLocaleString('en-IN')}</div>
            <div style="font-size:8px; color:#64748B;">Balance delta</div>
          </td>
          <td>
            <div class="stat-label">Savings Rate</div>
            <div class="stat-value savings">${savingsRate}%</div>
            <div style="font-size:8px; color:#64748B;">Total: ${totalTxCount} txs</div>
          </td>
        </tr>
      </table>

      <div class="section-title">Spending Insights</div>
      <div class="insights-box">
        <table class="insights-grid">
          <tr>
            <td><strong>Highest Spending Category:</strong> ${highestCategory ? highestCategory.category + ' (₹' + highestCategory.amount.toLocaleString('en-IN') + ' - ' + highestCategory.percentage + '%)' : 'None'}</td>
            <td><strong>Average Daily Spending:</strong> ₹${parseFloat(avgDailySpending).toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td><strong>Highest Individual Expense:</strong> ${highestExpense ? highestExpense.category + ' (₹' + highestExpense.amount.toLocaleString('en-IN') + ' on ' + highestExpense.date + ')' : 'None'}</td>
            <td><strong>Average Transaction Size:</strong> ₹${parseFloat(avgTxAmount).toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td><strong>Peak Spending Day:</strong> ${peakDay !== '-' ? peakDay + ' (₹' + peakDayAmt.toLocaleString('en-IN') + ')' : '-'}</td>
            <td><strong>Total Expense Transactions:</strong> ${expenseList.length}</td>
          </tr>
        </table>
      </div>

      <div class="section-title">Expense Category Breakdown</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Category</th>
            <th class="text-right">Amount</th>
            <th class="text-right">Percentage</th>
          </tr>
        </thead>
        <tbody>
          ${categoryBreakdown.map(function(c) {
            return '<tr><td>' + c.category + '</td><td class="text-right">₹' + c.amount.toLocaleString('en-IN') + '</td><td class="text-right">' + c.percentage + '%</td></tr>';
          }).join('')}
          ${categoryBreakdown.length === 0 ? '<tr><td colspan="3" style="text-align:center; color:#64748B;">No expenses recorded this month</td></tr>' : ''}
        </tbody>
      </table>

      <div class="section-title">Income Transactions (${incomeList.length})</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Notes</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${incomeList.map(function(item) {
            return '<tr><td>' + item.date + '</td><td>' + item.category + '</td><td>' + (item.notes || '-') + '</td><td class="text-right income">+₹' + item.amount.toLocaleString('en-IN') + '</td></tr>';
          }).join('')}
          ${incomeList.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#64748B;">No income recorded this month</td></tr>' : ''}
        </tbody>
      </table>

      <div class="section-title">Expense Transactions (${expenseList.length})</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Notes</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${expenseList.map(function(item) {
            return '<tr><td>' + item.date + '</td><td>' + item.category + '</td><td>' + (item.notes || '-') + '</td><td class="text-right expense">-₹' + item.amount.toLocaleString('en-IN') + '</td></tr>';
          }).join('')}
          ${expenseList.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#64748B;">No expenses recorded this month</td></tr>' : ''}
        </tbody>
      </table>

      <div class="footer">
        Generated by RIPPLE – Expense Tracker • Source of truth: Google Sheets • Keep tracking to grow your savings.
      </div>
    </body>
    </html>
  `;

  // Prepare PDF attachment (support either client-generated vector PDF or server HTML conversion)
  const attachments = [];
  const safeFilename = 'RIPPLE_Report_' + monthLabel.replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';

  if (requestData.pdfBase64) {
    try {
      const decodedBytes = Utilities.base64Decode(requestData.pdfBase64);
      const pdfBlob = Utilities.newBlob(decodedBytes, 'application/pdf', safeFilename);
      attachments.push(pdfBlob);
      Logger.log('Successfully attached client-generated vector PDF.');
    } catch (base64Err) {
      Logger.log('Notice: Client PDF base64 decode failed, trying server-side conversion: ' + base64Err.toString());
    }
  }

  // If no client PDF was attached, attempt server-side HTML to PDF conversion
  if (attachments.length === 0) {
    try {
      const htmlBlob = Utilities.newBlob(pdfHtml, 'text/html', 'report.html');
      const pdfBlob = htmlBlob.getAs('application/pdf').setName(safeFilename);
      attachments.push(pdfBlob);
      Logger.log('Successfully generated and attached server-side PDF.');
    } catch (pdfConversionErr) {
      Logger.log('Notice: Server-side PDF conversion failed: ' + pdfConversionErr.toString());
      // The email will still be delivered with the rich HTML report in the body!
    }
  }

  // Friendly HTML email notification
  const emailNotificationHtml = `
    <div style="font-family: Arial, sans-serif; color: #1E293B; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px;">
      <h2 style="color: #4F46E5; margin-top: 0;">🌊 RIPPLE – Monthly Financial Report</h2>
      <p>Hello,</p>
      <p>Your RIPPLE monthly financial report for <strong>${monthLabel}</strong> has been generated${attachments.length > 0 ? ' and is attached to this email as a PDF document' : ''}.</p>
      
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 15px; margin: 15px 0;">
        <h3 style="margin-top: 0; font-size: 14px; color: #475569; text-transform: uppercase;">Financial Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Total Income:</td>
            <td style="padding: 6px 0; font-weight: bold; color: #10B981; text-align: right;">₹${totalIncome.toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B;">Total Expenses:</td>
            <td style="padding: 6px 0; font-weight: bold; color: #EF4444; text-align: right;">₹${totalExpense.toLocaleString('en-IN')}</td>
          </tr>
          <tr style="border-top: 1px solid #CBD5E1;">
            <td style="padding: 8px 0; font-weight: bold;">Net Savings:</td>
            <td style="padding: 8px 0; font-weight: bold; color: #6366F1; text-align: right;">₹${netSavings.toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748B;">Savings Rate:</td>
            <td style="padding: 4px 0; font-weight: bold; color: #6366F1; text-align: right;">${savingsRate}%</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 0.9em; color: #64748B;">${attachments.length > 0 ? 'Open the attached PDF to review your complete transaction breakdown, category distribution, and spending insights.' : 'Review your financial summary above.'}</p>
      <br>
      <p style="margin-bottom: 0;">Regards,<br><strong>RIPPLE Expense Tracker</strong></p>
    </div>
  `;

  // Send Email (attachments array will contain PDF if generated)
  const mailOptions = {
    to: recipientEmail,
    subject: 'RIPPLE Monthly Financial Report – ' + monthLabel,
    body: 'Hello,\n\nYour RIPPLE monthly financial report for ' + monthLabel + ' has been generated.\n\nTotal Income: ₹' + totalIncome.toLocaleString('en-IN') + '\nTotal Expenses: ₹' + totalExpense.toLocaleString('en-IN') + '\nNet Savings: ₹' + netSavings.toLocaleString('en-IN') + '\nSavings Rate: ' + savingsRate + '%\n\nRegards,\nRIPPLE Expense Tracker',
    htmlBody: emailNotificationHtml
  };

  if (attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  Logger.log('Sending email via MailApp to: ' + recipientEmail);
  MailApp.sendEmail(mailOptions);
  Logger.log('Email sent successfully to: ' + recipientEmail);

  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Monthly report sent successfully to ' + recipientEmail
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
