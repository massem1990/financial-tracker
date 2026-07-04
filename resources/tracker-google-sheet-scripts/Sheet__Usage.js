
function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  
  if (sheet.getName() === 'Card Usage') {
    resetColors(sheet);
  }
}

function inspectMonth(){
    var value = SpreadsheetApp.getActive().getActiveRange().getValue();
    var sheet= SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Update inspector value
    sheet.getDataRange().getCell(6, colA1ToIndex('AI') + 1).setValue(value);

    // Coloring
    sheet.getRange("J2:AG").setBackground(null); // Clears the background color
    sheet.getRange("J1:AG1").setBackgroundRGB(217,234,211);// Headers

  
    var column = sheet.getActiveCell().getColumn();

    var lastRow = sheet.getLastRow(); // Gets the last row with content
    if (lastRow > 0) {
      sheet.getRange(1, column, lastRow).setBackgroundRGB(255,255,0);
      sheet.getRange(1, column + 1, lastRow).setBackgroundRGB(255,255,0);
    }

}

function resetColors(sheet){
  sheet.getRange("A5:W").setBackground(null); // Clears the background color
}

function highlightRows(){
    var range = SpreadsheetApp.getActive().getActiveRange();
    var value = range.getValue();
    var sheet= SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();


  // var activeCell = activeSpreadSheet.getActiveRange().getA1Notation();
  // const col = activeCell.getColumn();

  // // Validate column is between J (10) and U (21)
  // if (col != 22) {
  //   SpreadsheetApp.getUi().alert(
  //     "Wrong usage: Please select a category from column V."
  //   );
  //   return;
  // }


    resetColors(sheet);

    if (!value){
      return;
    }
    
    if(value.startsWith("Needs")){
      value = "Needs";
    } else if(value.startsWith("Wants")){
        value = "Wants";
    } else if(value.startsWith("Invest")){
        value = "Invest";
    } else if(value.startsWith("Savings")){
        value = "Savings";
        return;
    }

    

    
    var colorRangeA1Notion;
    var r = 217;
    var g = 210;
    var b = 122;

    if(value === "Needs"){
      colorRangeA1Notion = "V5:W6";
    } else if(value === "Wants"){
      colorRangeA1Notion = "V7:W8";
    }  else if(value === "Invest"){
      colorRangeA1Notion = "V9:W10";
    }  else if(value === "Regular"){
      colorRangeA1Notion = "V14:W15";
    }   else if(value === "Irregular"){
      colorRangeA1Notion = "V16:W17";
    } 
    sheet.getRange(colorRangeA1Notion).setBackgroundRGB(r, g, b);
  
    var indexCol_expenseType = letterToIndex('N');
    var indexCol_regular = letterToIndex('M');
    // var debugMessage = data[4][indexCol_expenseType] + " - " + value; //k = 10
    // customLog(debugMessage);return;
    for (var i = 4; i < data.length; i++) { 
        if( 
            (value === "Needs"  && data[i][indexCol_expenseType] === "Need") ||
            (value === "Wants"  && data[i][indexCol_expenseType] === "Want") ||
            (value === "Invest" && data[i][indexCol_expenseType] === "Invest") ||
            (value === "Regular" && data[i][indexCol_regular] === "Yes") ||
            (value === "Irregular" && data[i][indexCol_regular] === "No")
          ){
            colorRange(sheet, i, r, g, b);
            // customLog(data[i][6]);
          } 
        // if (value === "Wants"  && data[i][10] === "Want"){
        //   colorRange(sheet, i, r, g, b);
        //   var debugMessage = "Attempting to color " + data[i][6];
        //   customLog(debugMessage);
        // }
    }
}

function colorRange(sheet, i, r, g, b) {
  
  sheet.getRange(i+1, 10, 1, 11).setBackgroundRGB(r, g, b);
  // var debugMessage = i + " - " + r;
  // customLog(debugMessage);return;
}

function getAllData(expense, month, year){
  if(expense === 'Un categorized'){
    expense = "";
  }

  var year_month;
  if(month < 10){
    year_month = year + '/0' + month;
  } else {
    year_month = year + '/' + month;
  }

  var resultMap = {};

  sheetNames.forEach(function (sheetName) {
    var result = [];
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    var data = sheet.getDataRange().getValues();

    data.forEach(function (row, index) {

      var matches = false;

      if(month === "*"){
        if(year === "*"){
          if(row[TX_IDX.CATEGORY] === expense){
            matches = true;
          }
        } else {
          if(row[TX_IDX.CATEGORY] === expense && row[TX_IDX.YEAR] === year){
            matches = true;
          }
        }
      } else {
        if(row[TX_IDX.CATEGORY] === expense && row[TX_IDX.YEAR_MONTH] === year_month){
          matches = true;
        }
      }

      if (matches) {
        // Append metadata: [sheetName, rowNumber]
        result.push([...row, sheetName, index + 1]);
      }

    }); 
    
    if (result.length > 0){
      resultMap[sheetName] = result;
    }
    
  });

  return resultMap;
}

/** YYYYMMDD prefix for sorting transaction rows in Explain sidebar */
function explainSortDateKey(raw) {
  if (raw === null || raw === undefined) return '';
  var s = String(raw).trim();
  if (s.length >= 8 && /^\d/.test(s)) return s.substring(0, 8);
  return s;
}

/**
 * Copy resultMap with each sheet's rows sorted by date (column C / row[2]).
 * sortMode: 'dateAsc' (oldest first) or 'dateDesc' (newest first).
 */
function applyExplainSort(resultMap, sortMode) {
  var asc = sortMode !== 'dateDesc';
  var out = {};
  for (var sheetName in resultMap) {
    if (!Object.prototype.hasOwnProperty.call(resultMap, sheetName)) continue;
    var rows = resultMap[sheetName].slice();
    rows.sort(function (a, b) {
      var da = explainSortDateKey(a[2]);
      var db = explainSortDateKey(b[2]);
      if (asc) return da < db ? -1 : da > db ? 1 : 0;
      return db < da ? -1 : db > da ? 1 : 0;
    });
    out[sheetName] = rows;
  }
  return out;
}

var EXPLAIN_CTX_PROPERTY_KEY = 'EXPLAIN_CTX_V1';

function setLastExplainContext(ctx) {
  PropertiesService
    .getDocumentProperties()
    .setProperty(EXPLAIN_CTX_PROPERTY_KEY, JSON.stringify(ctx));
}

function getLastExplainContext() {
  var raw = PropertiesService
    .getDocumentProperties()
    .getProperty(EXPLAIN_CTX_PROPERTY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function setCheckboxes(rowsToKeepTrue) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const startRow = 4;
  const endRow = 20;
  const range = sheet.getRange(`Z${startRow}:Z${endRow}`);

  // Initialize all to false
  const values = Array.from({ length: endRow - startRow + 1 }, () => [false]);

  // Set selected rows to true
  rowsToKeepTrue.forEach(row => {
    if (row >= startRow && row <= endRow) {
      values[row - startRow][0] = true;
    }
  });

  range.setValues(values);
}

function normalAndBills() {
  setCheckboxes([6, 9,12,14]);
}



function normalExpenses() {
  setCheckboxes([5, 6, 9, 12, 14, 19, 20]);
}

function monthlyBills() {
  setCheckboxes([4, 6, 19, 20, 12, 14]);
}

function deferredExpenses() {
  setCheckboxes([15]);
}


function oneTimeExpenses() {
  setCheckboxes([11, 19, 20]);
}

function openCategoryVisualiser() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getActiveSheet();
  const activeCell = sourceSheet.getActiveCell();

  const row = activeCell.getRow();
  const col = activeCell.getColumn();

  // Validate column is between J (10) and U (21)
  if (col < 10 || col > 21) {
    SpreadsheetApp.getUi().alert(
      "Wrong usage: Please select a cell between columns J and U in the desired row."
    );
    return;
  }

  // Read value from column J of that row
  const x = sourceSheet.getRange(row, 10).getValue();

  // Write into target sheet
  const targetSheet = ss.getSheetByName("Category Visualiser");
  targetSheet.getRange("B1").setValue(x);

  // Navigate to target sheet
  ss.setActiveSheet(targetSheet);
  targetSheet.activate();
}
function goToTransaction(sheetName, rowNumber) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }

  rowNumber = Number(rowNumber);
  if (!rowNumber || rowNumber < 1) {
    throw new Error('Invalid row number: ' + rowNumber);
  }

  ss.setActiveSheet(sheet);
  SpreadsheetApp.flush();

  // Select the row, adjust the last column if you want a wider/narrower highlight
  var lastColumn = sheet.getLastColumn();
  var targetRange = sheet.getRange(rowNumber, 1, 1, lastColumn);
  sheet.setActiveRange(sheet.getRange(rowNumber, 1));
  SpreadsheetApp.flush();

  // Store original backgrounds
  var originalBackgrounds = targetRange.getBackgrounds();

  // Highlight
  targetRange.setBackground('#fff2cc'); // light yellow
  SpreadsheetApp.flush();

  // Keep highlight briefly
  Utilities.sleep(8000);

  // Restore original colors
  targetRange.setBackgrounds(originalBackgrounds);
  SpreadsheetApp.flush();
}


/**
 * Explain sidebar for the current selection. Optional sortMode: 'dateAsc' | 'dateDesc'
 * (used by sidebar Refresh / Sort buttons via google.script.run).
 */
function explain(sortMode, useLast) {
  if (sortMode !== 'dateDesc') {
    sortMode = 'dateAsc';
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var activeSheet = ss.getActiveSheet();
  var activeRange = ss.getActiveRange();
  var ui = SpreadsheetApp.getUi();

  var ctx = null;
  if (useLast === true) {
    ctx = getLastExplainContext();
    if (!ctx) {
      ui.alert('Nothing to refresh yet. Run Explain from a cell first.');
      return;
    }
  }

  if (!ctx) {
    if (!activeRange) {
      // If sidebar buttons are used while there is no active selection, fall back to last context.
      ctx = getLastExplainContext();
      if (!ctx) {
        ui.alert('No cell selected.');
        return;
      }
    } else {
      var selectedRow = activeRange.getRow();
      var selectedCol = activeRange.getColumn();
      var selectedValue = activeRange.getValue();

      // Only allow columns J:U
      if (selectedCol < 10 || selectedCol > 21) {
        // For convenience: if user clicked elsewhere, still allow refresh-from-last.
        ctx = getLastExplainContext();
        if (!ctx) {
          ui.alert('Wrong usage: please select a numeric cell between columns J and U.');
          return;
        }
      } else {
        // Selected cell must be numeric
        if (typeof selectedValue !== 'number' || isNaN(selectedValue)) {
          ctx = getLastExplainContext();
          if (!ctx) {
            ui.alert('Wrong cell was selected, please select a numeric value between columns J and U.');
            return;
          }
        } else {
          selectedValue = +selectedValue.toFixed(2);

          var indexColMonth = letterToIndex('W');
          var indexColYear = letterToIndex('V');
          var indexColExpense = letterToIndex('J');

          var year = activeSheet.getRange(2, indexColYear + 1).getValue();
          var month = activeSheet.getRange(2, indexColMonth + 1).getValue();
          var expense = activeSheet.getRange(selectedRow, indexColExpense + 1).getValue();

          ctx = { year: year, month: month, expense: expense, selectedValue: selectedValue };
          setLastExplainContext(ctx);
        }
      }
    }
  }

  var resultMap = getAllData(ctx.expense, ctx.month, ctx.year);
  var sortedMap = applyExplainSort(resultMap, sortMode);

  var sortButtonLabel =
    sortMode === 'dateDesc' ? 'Sort: newest first' : 'Sort: oldest first';

  var html = '';
  html += '<html><head>';
  html += '<meta charset="UTF-8">';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">';

  html += '<style>';
  html += 'body {';
  html += '  font-family: Arial, sans-serif;';
  html += '  margin: 0;';
  html += '  padding: 0;';
  html += '  background: #f6f8fb;';
  html += '  color: #1f2937;';
  html += '}';

  html += '.app {';
  html += '  padding: 12px;';
  html += '}';

  html += '.toolbar {';
  html += '  display: flex;';
  html += '  gap: 8px;';
  html += '  flex-wrap: wrap;';
  html += '  align-items: center;';
  html += '  margin-bottom: 12px;';
  html += '  position: sticky;';
  html += '  top: 0;';
  html += '  z-index: 11;';
  html += '  background: #f6f8fb;';
  html += '  padding-bottom: 8px;';
  html += '}';

  html += '.toolbar-btn {';
  html += '  cursor: pointer;';
  html += '  border: 1px solid #c6cfdb;';
  html += '  background: #ffffff;';
  html += '  border-radius: 8px;';
  html += '  padding: 8px 12px;';
  html += '  font-size: 13px;';
  html += '  color: #1f2937;';
  html += '}';

  html += '.toolbar-btn:hover {';
  html += '  background: #eef2f7;';
  html += '}';

  html += '.summary {';
  html += '  position: sticky;';
  html += '  top: 44px;';
  html += '  z-index: 10;';
  html += '  background: #ffffff;';
  html += '  border: 1px solid #d7deea;';
  html += '  border-radius: 10px;';
  html += '  padding: 12px;';
  html += '  margin-bottom: 14px;';
  html += '  box-shadow: 0 1px 3px rgba(0,0,0,0.08);';
  html += '}';

  html += '.title {';
  html += '  font-size: 18px;';
  html += '  font-weight: 700;';
  html += '  margin-bottom: 6px;';
  html += '}';

  html += '.subtitle {';
  html += '  font-size: 12px;';
  html += '  color: #5b6472;';
  html += '  margin-bottom: 10px;';
  html += '}';

  html += '.total {';
  html += '  font-size: 20px;';
  html += '  font-weight: 700;';
  html += '}';

  html += '.section {';
  html += '  margin-bottom: 18px;';
  html += '}';

  html += '.label { font-weight: 700; color: #2563eb; }'; // blue + bold

  html += '.section-header {';
  html += '  display: flex;';
  html += '  align-items: center;';
  html += '  justify-content: space-between;';
  html += '  margin: 0 0 8px 0;';
  html += '  padding: 0 2px;';
  html += '}';

  html += '.section-title {';
  html += '  font-size: 14px;';
  html += '  font-weight: 700;';
  html += '  color: #0f172a;';
  html += '}';

  html += '.section-count {';
  html += '  font-size: 12px;';
  html += '  color: #64748b;';
  html += '}';

  html += '.txn {';
  html += '  background: #ffffff;';
  html += '  border: 1px solid #d7deea;';
  html += '  border-radius: 10px;';
  html += '  padding: 10px;';
  html += '  margin-bottom: 8px;';
  html += '  box-shadow: 0 1px 2px rgba(0,0,0,0.05);';
  html += '}';

  html += '.txn-top {';
  html += '  display: flex;';
  html += '  align-items: center;';
  html += '  gap: 8px;';
  html += '  margin-bottom: 8px;';
  html += '}';

  html += '.go-btn {';
  html += '  cursor: pointer;';
  html += '  border: 1px solid #c6cfdb;';
  html += '  background: #f8fafc;';
  html += '  border-radius: 8px;';
  html += '  padding: 6px 10px;';
  html += '  font-size: 14px;';
  html += '}';

  html += '.go-btn:hover {';
  html += '  background: #eef2f7;';
  html += '}';

  html += '.txn-date {';
  html += '  font-size: 13px;';
  html += '  font-weight: 600;';
  html += '  color: #334155;';
  html += '}';

  html += '.txn-amount {';
  html += '  margin-left: auto;';
  html += '  font-size: 16px;';
  html += '  font-weight: 700;';
  html += '  color: #111827;';
  html += '}';

  html += '.txn-amount.positive {';
  html += '  color: #15803d;';
  html += '}';

  html += '.txn-short {';
  html += '  font-size: 12px;';
  html += '  color: #475569;';
  html += '  margin-bottom: 6px;';
  html += '}';

  html += '.txn-long {';
  html += '  font-size: 12px;';
  html += '  line-height: 1.4;';
  html += '  color: #111827;';
  html += '  word-break: break-word;';
  html += '  white-space: normal;';
  html += '}';

  html += '.empty {';
  html += '  background: #ffffff;';
  html += '  border: 1px dashed #cbd5e1;';
  html += '  border-radius: 10px;';
  html += '  padding: 12px;';
  html += '  color: #64748b;';
  html += '}';
  html += '</style>';

  html += '<script>';
  html += 'function explainSidebarRefresh() {';
  html += '  var mode = document.body.getAttribute("data-sort-mode") || "dateAsc";';
  html += '  google.script.run.withFailureHandler(function(err) {';
  html += '    alert("Refresh failed: " + (err && err.message ? err.message : err));';
  html += '  }).explain(mode, true);';
  html += '}';
  html += 'function explainSidebarToggleSort() {';
  html += '  var mode = document.body.getAttribute("data-sort-mode") || "dateAsc";';
  html += '  var next = (mode === "dateAsc") ? "dateDesc" : "dateAsc";';
  html += '  google.script.run.withFailureHandler(function(err) {';
  html += '    alert("Sort failed: " + (err && err.message ? err.message : err));';
  html += '  }).explain(next, true);';
  html += '}';
  html += 'function goToTransaction(sheetName, rowNumber) {';
  html += '  google.script.run';
  html += '    .withFailureHandler(function(err) {';
  html += '      alert("Navigation failed: " + (err && err.message ? err.message : err));';
  html += '      console.error(err);';
  html += '    })';
  html += '    .goToTransaction(sheetName, rowNumber);';
  html += '}';
  html += '</script>';

  html += '</head><body data-sort-mode="' + escapeHtml(sortMode) + '">';
  html += '<div class="app">';

  html += '<div class="toolbar">';
  html += '<button type="button" class="toolbar-btn" onclick="explainSidebarRefresh()">Refresh</button>';
  html += '<button type="button" class="toolbar-btn" onclick="explainSidebarToggleSort()">';
  html += escapeHtml(sortButtonLabel);
  html += '</button>';
  html += '</div>';

  html += '<div class="summary">';
  html += Utilities.formatString('<div class="title">%s</div>', escapeHtml(String(ctx.expense)));
  html += Utilities.formatString(
    '<div class="subtitle">Year %s, Month %s</div>',
    escapeHtml(String(ctx.year)),
    escapeHtml(String(ctx.month))
  );
  html += Utilities.formatString(
    '<div class="total">%s €</div>',
    escapeHtml(String(ctx.selectedValue))
  );
  html += '</div>';

  var sectionNames = Object.keys(sortedMap);

  if (sectionNames.length === 0) {
    html += '<div class="empty">No transactions found for this selection.</div>';
  } else {
    for (const [sheetName, rows] of Object.entries(sortedMap)) {
      html += '<div class="section">';
      html += '<div class="section-header">';
      html += Utilities.formatString(
        '<div class="section-title">%s</div>',
        escapeHtml(String(sheetName))
      );
      html += Utilities.formatString(
        '<div class="section-count">%s items</div>',
        rows.length
      );
      html += '</div>';

      rows.forEach(function(row) {
        var rawDate = row[2];
        var formattedDate = '';

        if (rawDate !== null && rawDate !== undefined) {
          var strValue = rawDate.toString();
          if (strValue.length >= 8) {
            formattedDate =
              strValue.substring(0, 4) + '-' +
              strValue.substring(4, 6) + '-' +
              strValue.substring(6, 8);
          } else {
            formattedDate = strValue;
          }
        }

        var amount = Number(row[6] || 0);
        var formattedPrice = amount + ' €';
        var amountClass = amount > 0 ? 'txn-amount positive' : 'txn-amount';

        var shortDescription = row[8] || '';
        var longDescription = row[7] || '';

        // Appended by getAllData via [...row, sheetName, index + 1]
        var sourceSheetName = String(row[row.length - 2] || '');
        var sourceRowNumber = Number(row[row.length - 1] || 0);

        var safeSheetName = sourceSheetName
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '&quot;');

        var goButton = '<button class="go-btn" onclick=\'goToTransaction("' +
          safeSheetName +
          '",' + sourceRowNumber + ')\'>➡</button>';

        html += '<div class="txn">';
        html += '<div class="txn-top">';
        html += goButton;
        html += Utilities.formatString(
          '<div class="txn-date">%s</div>',
          escapeHtml(formattedDate)
        );
        html += Utilities.formatString(
          '<div class="%s">%s</div>',
          amountClass,
          escapeHtml(formattedPrice)
        );
        html += '</div>';

        if (shortDescription) {
          html += Utilities.formatString(
            '<div class="txn-short"><span class="label">Short Desc:</span> %s</div>',
            escapeHtml(String(shortDescription))
          );
        } 
        // else {
        //   html += Utilities.formatString(
        //     '<div class="txn-short"><span class="label">Short Desc:</span> %s</div>',
        //     escapeHtml(String(shortDescription))
        //   );          
        // }

        if (longDescription) {
          html += Utilities.formatString(
            '<div class="txn-long">%s</div>',
            escapeHtml(String(longDescription))
          );
        }

        html += '</div>';
      });

      html += '</div>';
    }
  }

  html += '</div>';
  html += '</body></html>';

  var userInterface = HtmlService
    .createHtmlOutput(html)
    .setTitle('Explain transactions');

  ui.showSidebar(userInterface);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}