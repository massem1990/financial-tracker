function categorizeNoMessage() {
  
  sheetNames.forEach(function (sheetName) {
    // SpreadsheetApp.getUi().alert(sheetName);
    categorizeBySheet(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName));
  });

}

var CategorizeMode = {
  /** Default mode: only process rows with BOTH empty short desc and empty category. */
  NEW_ONLY: 'new_only',
  /** Force mode: ignore existing category/short desc and (re)apply rules. */
  FORCE_ALL: 'force_all',
  /** Force mode: only fill missing short description (even if category already set). */
  FORCE_NEW_AND_MISSING_SHORT: 'force_new_and_missing_short'
};

// Toggle for writing a debug sheet after categorize()
var ENABLE_CATEGORIZE_DEBUG_SHEET = true;
var CATEGORIZE_DEBUG_SHEET_NAME = 'Debug Categorize';

function writeCategorizeDebugSheet(ss, debugRows) {
  if (!debugRows || debugRows.length <= 1) return;

  var sheet = ss.getSheetByName(CATEGORIZE_DEBUG_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CATEGORIZE_DEBUG_SHEET_NAME);
  sheet.clearContents();

  sheet.getRange(1, 1, debugRows.length, debugRows[0].length).setValues(debugRows);
  sheet.autoResizeColumns(1, debugRows[0].length);
}

function categorizeForceAll(){
  categorize(CategorizeMode.FORCE_ALL);
}

function categorizeFillMissingShortDescription(){
  categorize(CategorizeMode.FORCE_NEW_AND_MISSING_SHORT);
}

// Backwards compatible wrappers (menus/macros may reference these).
function categorizeForced_1(){
  categorizeForceAll();
}

function categorizeForced_2(){
  categorizeFillMissingShortDescription();
}

function normalizeCategorizeMode(mode) {
  // Backwards compatibility: older calls used numbers.
  if (mode === 1) return CategorizeMode.FORCE_ALL;
  if (mode === 2) return CategorizeMode.FORCE_NEW_AND_MISSING_SHORT;
  if (mode === CategorizeMode.FORCE_ALL || mode === CategorizeMode.FORCE_NEW_AND_MISSING_SHORT) return mode;
  return CategorizeMode.NEW_ONLY;
}

function categorize(mode) {
  mode = normalizeCategorizeMode(mode);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var debugRows = null;
  if (ENABLE_CATEGORIZE_DEBUG_SHEET) {
    debugRows = [[
      'timestamp',
      'mode',
      'sheet',
      'row',
      'amount',
      'matchedKeys',
      'matchCount',
      'oldCategory',
      'newCategory',
      'categoryChanged',
      'oldShort',
      'newShort',
      'shortChanged',
      'shortSource',
      'explicitShortCandidate',
      'explicitShortApplied',
      'shortMapSize',
      'tempBlocked'
    ]];
  }

  var totalCategoryChangedRows = 0;
  var totalRowsChangedCategoryOnly = 0;
  var totalRowsChangedShortOnly = 0;
  var totalRowsChangedCategoryAndShort = 0;
  var overallCategoryCounts = {};
  var overallChangedCategoryCounts = {};
  var perSheetLines = [];
  var totalForceUnchanged = 0;
  var totalForceChanged = 0;
  var totalForceTempBlocked = 0;
  var totalForceShortChangedWithCategoryChange = 0;
  var totalForceShortChangedWithoutCategoryChange = 0;

  sheetNames.forEach(function (sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    var result = categorizeBySheet(sheet, mode, debugRows);

    if (result && typeof result === 'object') {
      totalCategoryChangedRows += result.categoryChangedRows || 0;
      totalRowsChangedCategoryOnly += result.rowsChangedCategoryOnly || 0;
      totalRowsChangedShortOnly += result.rowsChangedShortOnly || 0;
      totalRowsChangedCategoryAndShort += result.rowsChangedCategoryAndShort || 0;
      totalForceUnchanged += result.forceUnchangedCategoryRows || 0;
      totalForceChanged += result.forceChangedCategoryRows || 0;
      totalForceTempBlocked += result.forceTempBlockedRows || 0;
      totalForceShortChangedWithCategoryChange += result.forceShortChangedWithCategoryChange || 0;
      totalForceShortChangedWithoutCategoryChange += result.forceShortChangedWithoutCategoryChange || 0;

      var catCounts = result.categoryCounts || {};
      for (var cat in catCounts) {
        if (!Object.prototype.hasOwnProperty.call(catCounts, cat)) continue;
        overallCategoryCounts[cat] = (overallCategoryCounts[cat] || 0) + catCounts[cat];
      }

      var changedCounts = result.changedCategoryCounts || {};
      for (var changedCat in changedCounts) {
        if (!Object.prototype.hasOwnProperty.call(changedCounts, changedCat)) continue;
        overallChangedCategoryCounts[changedCat] =
          (overallChangedCategoryCounts[changedCat] || 0) + changedCounts[changedCat];
      }

      var chCatOnly = result.rowsChangedCategoryOnly || 0;
      var chShortOnly = result.rowsChangedShortOnly || 0;
      var chBoth = result.rowsChangedCategoryAndShort || 0;
      if (chCatOnly + chShortOnly + chBoth > 0) {
        perSheetLines.push(
          Utilities.formatString(
            "%s:\n  Rows changed (category only): %s\n  Rows changed (short description only): %s\n  Rows changed (category and short description): %s",
            sheetName,
            chCatOnly,
            chShortOnly,
            chBoth
          )
        );
      }
    }
  });

  var sortedCats = Object.keys(overallChangedCategoryCounts).sort(function (a, b) {
    return overallChangedCategoryCounts[b] - overallChangedCategoryCounts[a];
  });

  var topCats = [];
  var maxCats = 18;
  for (var i = 0; i < sortedCats.length && i < maxCats; i++) {
    var cat = sortedCats[i];
    topCats.push(Utilities.formatString("%s: %s", cat, overallChangedCategoryCounts[cat]));
  }
  var remaining = sortedCats.length - topCats.length;

  var summary = '';
  summary += "Categorization summary\n";
  summary += "=====================\n\n";
  summary += Utilities.formatString("Rows where only category changed: %s\n", totalRowsChangedCategoryOnly);
  summary += Utilities.formatString("Rows where only description changed: %s\n", totalRowsChangedShortOnly);
  summary += Utilities.formatString("Rows where both category and description changed: %s\n\n", totalRowsChangedCategoryAndShort);

  if (topCats.length > 0) {
    summary += "Top categories (by rows changed)\n";
    summary += "-------------------------------\n";
    summary += topCats.join("\n") + "\n";
    if (remaining > 0) {
      summary += Utilities.formatString("...and %s more categories\n", remaining);
    }
    summary += "\n";
  }

  if (perSheetLines.length > 0) {
    summary += "By sheet\n";
    summary += "--------\n";
    summary += perSheetLines.join("\n\n");
  }

  if (ENABLE_CATEGORIZE_DEBUG_SHEET) {
    writeCategorizeDebugSheet(ss, debugRows);
  }
  ui.alert(summary);
}

function FillFormulas(spreadsheet) {   

  //var spreadsheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Shopping');   
  sheetNames.forEach(function (sheetName) {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
        
    var lastRow = spreadsheet.getLastRow();   

    // var formula = "=IF(H2 = \"\", \"\", CONCATENATE(left(C2,4), \"/\", right(left(C2,6),2)))";
    var formula = "=IF(L2 = \"\", IF(H2 = \"\", \"\", CONCATENATE(left(C2,4), \"/\", right(left(C2,6),2))), L2)"
    spreadsheet.getRange("K2").setFormula(formula);   
    var fillDownRange = spreadsheet.getRange(2,11,(lastRow-1));   
    spreadsheet.getRange("K2").copyTo(fillDownRange); 

    formula = "=LEFT(K2, FIND(\"/\", K2) - 1)";
    spreadsheet.getRange("M2").setFormula(formula);   
    fillDownRange = spreadsheet.getRange(2,13,(lastRow-1));   
    spreadsheet.getRange("M2").copyTo(fillDownRange); 

    
  });
}


function categorizeBySheet(sheet, mode, debugRows) {
  var count = 0;
  var countTransactionsWithoutCategories = 0;
  var categorizedRows = 0;
  var categoryChangedRows = 0;
  var categoryCounts = {};
  var changedCategoryCounts = {};
  var forceUnchangedCategoryRows = 0;
  var forceChangedCategoryRows = 0;
  var forceTempBlockedRows = 0;
  var forceShortChangedWithCategoryChange = 0;
  var forceShortChangedWithoutCategoryChange = 0;
  var rowsChangedCategoryOnly = 0;
  var rowsChangedShortOnly = 0;
  var rowsChangedCategoryAndShort = 0;
  var values = sheet.getDataRange().getValues();
  var lastRow = values.length;
  if (lastRow <= 1) {
    return {
      sheetName: sheet.getName(),
      categorizedRows: 0,
      categoryChangedRows: 0,
      uncategorizedRows: 0,
      rowsChangedCategoryOnly: 0,
      rowsChangedShortOnly: 0,
      rowsChangedCategoryAndShort: 0,
      categoryCounts: {},
      changedCategoryCounts: {},
      forceUnchangedCategoryRows: 0,
      forceChangedCategoryRows: 0,
      forceTempBlockedRows: 0,
      forceShortChangedWithCategoryChange: 0,
      forceShortChangedWithoutCategoryChange: 0
    };
  }

  // Prepare column buffers so we can write in bulk once per column.
  var shortCol = [];
  var travelCol = [];
  var categoryCol = [];
  for (var i = 1; i < lastRow; i++) {
    shortCol.push([values[i][TX_IDX.SHORT_DESC]]);
    travelCol.push([values[i][TX_CELL_COL.TRAVEL_NOTE - 1]]);
    categoryCol.push([values[i][TX_IDX.CATEGORY]]);
  }
  var changedShort = false;
  var changedTravel = false;
  var changedCategory = false;

  for (var r = 1; r < lastRow; r++) {
    var amountStr = values[r][TX_IDX.AMOUNT].toString();
    var description = values[r][TX_IDX.LONG_DESC].toString().toLowerCase();
    var sDescription = values[r][TX_IDX.SHORT_DESC].toString().toLowerCase();
    var setCategory = values[r][TX_IDX.CATEGORY].toString().toLowerCase();
    var originalShort = values[r][TX_IDX.SHORT_DESC] === null || values[r][TX_IDX.SHORT_DESC] === undefined
      ? ''
      : String(values[r][TX_IDX.SHORT_DESC]);
    var hadPreviousCategory = setCategory !== "";
    var isForceMode = (mode === CategorizeMode.FORCE_ALL || mode === CategorizeMode.FORCE_NEW_AND_MISSING_SHORT);
    var tempBlocked = false;

    if (amountStr === "") // empty line
        continue;

    var categoryDecided = 0;

    if(mode === CategorizeMode.FORCE_ALL){
      // Do not skip based on existing category/short desc.
    } else if(mode === CategorizeMode.FORCE_NEW_AND_MISSING_SHORT){
      // Only skip when a short desc is there
      if (sDescription !== "")
          continue;
    } else { // NEW_ONLY
      // If either the category or short description exist, skip this line as this was previously categorized
      if (sDescription !== "" || setCategory !== "")
          continue;
    }

    // if( amount > 0 ) { // Positive value transaction, some of these can be actually refunds/income, better update needed
    //   if (description.indexOf("salary") > -1) {
    //     range.getCell(r+1, 10).setValue('Income'); count++; categoryDecided = 1;
    //   }else if(description.indexOf("kinderopvang") > -1 || description.indexOf("toeslagen") > -1){
    //     range.getCell(r+1, 10).setValue('Kindergarten'); count++; categoryDecided = 1;
    //   } else if(description.indexOf("loterij") > -1 ){
    //     range.getCell(r+1, 10).setValue('Loterij'); count++; categoryDecided = 1;
    //   } else if(description.indexOf("revolut") > -1 ){
    //     range.getCell(r+1, 10).setValue('Rent+'); count++; categoryDecided = 1;
    //   }
    //   else{
    //     // Not all positive is transfers, let's comment the next line for now
    //     // range.getCell(r+1, 10).setValue('Transfers'); count++; categoryDecided = 1; 
    //   }
    // } else {
      // Intentionally no early exit: every keyword rule is evaluated so all substring
      // matches on this row are applied (side columns, PayPal overrides, etc.). Last
      // match wins for category / short desc / travel note; we flush one row at a time.
      var matchCount = 0;
      var lastCategory = undefined;
      var pendingShort = undefined;
      var pendingTravel = undefined;
      var matchedKeys = [];
      var lastShortSource = '';
      var explicitShortCandidate = '';
      var explicitShortApplied = 0;
      for (var key in inputCategoryKeywordsLower){
        if (description.indexOf(key) > -1) {
          matchedKeys.push(key);
          var value = inputCategoryKeywordsLower[key];
          var amountOverrideMap = Object.prototype.hasOwnProperty.call(inputCategoryAmountOverrides, value)
            ? inputCategoryAmountOverrides[value]
            : null;
          if (amountOverrideMap && Object.prototype.hasOwnProperty.call(amountOverrideMap, amountStr)) {
            value = CATEGORY_TEMP_AMOUNT_OVERRIDE;
            pendingShort = amountOverrideMap[amountStr];
            lastShortSource = 'tempAmountOverride';
          } else if (value === 'Transfers'){
            var accountNameMapping = mapTransferAccounts[key.toUpperCase()] || '';
            if(accountNameMapping !== ''){
              var newShortDescription;
              if(Number(amountStr) < 0){
                newShortDescription = 'To "';
              }else{
                newShortDescription = 'From "';
              }
              newShortDescription += accountNameMapping;
              newShortDescription += '" Account';
              pendingShort = newShortDescription;
              lastShortSource = 'transferAccount';
            }
          }  else if (value === 'Travel'){
            var travelCategoryMapping = mapTravelCategories[key.toUpperCase()] || '';
            if(travelCategoryMapping !== ''){
              pendingTravel = travelCategoryMapping;
            }
          }
          var explicitShort = Object.prototype.hasOwnProperty.call(inputKeywordShortDescriptionsLower, key)
            ? inputKeywordShortDescriptionsLower[key]
            : undefined;
          if (explicitShort !== undefined) {
            explicitShortCandidate = String(explicitShort);
          }
          if (explicitShort !== undefined) {
            pendingShort = explicitShort;
            lastShortSource = 'explicitShort';
            explicitShortApplied = 1;
          }
          lastCategory = value;
          matchCount++;
        }
      }
      // Safety guard: In force modes, never overwrite an existing non-temp category
      // with a temp category (e.g. "Amazon (Temp)"). If the last winning category
      // is temp and the row had a different category before, do not apply any force rule.
      if (
        isForceMode &&
        hadPreviousCategory &&
        lastCategory &&
        lastCategory.toLowerCase().indexOf('temp') > -1 &&
        setCategory !== lastCategory.toLowerCase()
      ) {
        forceTempBlockedRows++;
        tempBlocked = true;
        matchCount = 0;
        pendingShort = undefined;
        pendingTravel = undefined;
        lastCategory = undefined;
      }

      if (matchCount > 0) {
        count += matchCount;
        categoryDecided = 1;
        categorizedRows++;
        var categoryUnchanged = setCategory === String(lastCategory).toLowerCase();
        if (!categoryUnchanged) {
          categoryChangedRows++;
          changedCategoryCounts[lastCategory] = (changedCategoryCounts[lastCategory] || 0) + 1;
        }
        if (isForceMode && hadPreviousCategory) {
          if (categoryUnchanged) {
            forceUnchangedCategoryRows++;
          } else {
            forceChangedCategoryRows++;
          }

          var shortWouldChange = (pendingShort !== undefined) && (String(pendingShort) !== originalShort);
          if (shortWouldChange) {
            if (categoryUnchanged) {
              forceShortChangedWithoutCategoryChange++;
            } else {
              forceShortChangedWithCategoryChange++;
            }
          }
        }
        var shortDescWouldChange =
          pendingShort !== undefined && String(pendingShort) !== String(originalShort);
        var categoryWouldChange = !categoryUnchanged;
        if (categoryWouldChange || shortDescWouldChange) {
          if (categoryWouldChange && shortDescWouldChange) {
            rowsChangedCategoryAndShort++;
          } else if (categoryWouldChange) {
            rowsChangedCategoryOnly++;
          } else {
            rowsChangedShortOnly++;
          }
        }
        categoryCounts[lastCategory] = (categoryCounts[lastCategory] || 0) + 1;
        var bufferIndex = r - 1; // arrays start at sheet row 2
        if (pendingShort !== undefined) {
          shortCol[bufferIndex][0] = pendingShort;
          changedShort = true;
        }
        if (pendingTravel !== undefined) {
          travelCol[bufferIndex][0] = pendingTravel;
          changedTravel = true;
        }
        categoryCol[bufferIndex][0] = lastCategory;
        changedCategory = true;

        if (debugRows) {
          var oldCategory = setCategory;
          var newCategoryLower = String(lastCategory).toLowerCase();
          var categoryChanged = oldCategory !== newCategoryLower;
          var newShort = (pendingShort !== undefined) ? String(pendingShort) : originalShort;
          var shortChanged = String(originalShort) !== String(newShort);
          debugRows.push([
            new Date().toISOString(),
            mode,
            sheet.getName(),
            r + 1,
            amountStr,
            matchedKeys.join(' | '),
            matchCount,
            oldCategory,
            newCategoryLower,
            categoryChanged ? 1 : 0,
            originalShort,
            newShort,
            shortChanged ? 1 : 0,
            lastShortSource,
            explicitShortCandidate,
            explicitShortApplied,
            Object.keys(inputKeywordShortDescriptionsLower).length,
            tempBlocked ? 1 : 0
          ]);
        }
      }
    // }


    if(categoryDecided == 0){
      // Logger.log("%s", sheet.getName())
      countTransactionsWithoutCategories++;
    }
  }

  // Bulk flush writes (largest runtime win in Apps Script).
  if (changedShort) {
    sheet.getRange(2, TX_CELL_COL.SHORT_DESC, lastRow - 1, 1).setValues(shortCol);
  }
  if (changedTravel) {
    sheet.getRange(2, TX_CELL_COL.TRAVEL_NOTE, lastRow - 1, 1).setValues(travelCol);
  }
  if (changedCategory) {
    sheet.getRange(2, TX_CELL_COL.CATEGORY, lastRow - 1, 1).setValues(categoryCol);
  }

    // FillFormulas(sheet);
    return {
      sheetName: sheet.getName(),
      categorizedRows: categorizedRows,
      categoryChangedRows: categoryChangedRows,
      uncategorizedRows: countTransactionsWithoutCategories,
      rowsChangedCategoryOnly: rowsChangedCategoryOnly,
      rowsChangedShortOnly: rowsChangedShortOnly,
      rowsChangedCategoryAndShort: rowsChangedCategoryAndShort,
      categoryCounts: categoryCounts,
      changedCategoryCounts: changedCategoryCounts,
      forceUnchangedCategoryRows: forceUnchangedCategoryRows,
      forceChangedCategoryRows: forceChangedCategoryRows,
      forceTempBlockedRows: forceTempBlockedRows,
      forceShortChangedWithCategoryChange: forceShortChangedWithCategoryChange,
      forceShortChangedWithoutCategoryChange: forceShortChangedWithoutCategoryChange
    };
};

// ----// ----// ----// ----// ----// ----// ----

function setCurrentSheetFormat(){

    var worksheet = SpreadsheetApp.getActiveSheet();
    // var worksheet = spreadsheet.getSheets()[0];
    setFormat(worksheet);
}

function setFormat(worksheet){
  worksheet.getRange("A:D").setNumberFormat("@"); // Set column as plain text
  worksheet.getRange("E:G").setNumberFormat("0.00");
  worksheet.getRange("K:M").setNumberFormat("@"); // Set column as plain text
}

function analyzeUploaded() {

  var dryRun = 0;

  var mapSheetNameToDictionaryOfRecords = initializeSheetMaps();

  var convertedFiles = DriveApp.getFolderById(DriveFolders.CONVERTED).getFiles();
  var rowsToAppendBySheet = {};

  function addRowForSheet(sheetName, row) {
    if (!rowsToAppendBySheet[sheetName]) rowsToAppendBySheet[sheetName] = [];
    rowsToAppendBySheet[sheetName].push(row);
  }

  function padRows(rows, width) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].length < width) {
        rows[i] = rows[i].concat(new Array(width - rows[i].length).fill(''));
      } else if (rows[i].length > width) {
        rows[i] = rows[i].slice(0, width);
      }
    }
    return rows;
  }

  while (convertedFiles.hasNext()) {
    var file = convertedFiles.next();
    var name = file.getName();
    Logger.log("Reading data from %s", name);

    var spreadsheet = SpreadsheetApp.openById(file.getId());
    var worksheet = spreadsheet.getSheets()[0];
    setFormat(worksheet);
    // return;
    var values = worksheet.getDataRange().getValues();
    // Logger.log(values.length);
    // return;
    // Logger.log(values);

    if(values[0][0] == "Type"){ // Revolut
      Logger.log("Revolut sheet");
      var sheetNameToPlace;
      if (name.startsWith("Mo")) {
        sheetNameToPlace = "Revolut-Mo";
      } else if (name.startsWith("Alice")) {
        sheetNameToPlace = "Revolut-Alice";
      } else {
        Logger.log("Uploaded Revolut file name must start with 'Alice' or 'Mo'");
        continue;
      }

      var countNewRevolut = 0;
      var dedupRevolut = mapSheetNameToDictionaryOfRecords[sheetNameToPlace];
      for (var r = 1; r < values.length; r++) {
        var recordToLookFor = values[r].slice(4, 5).join();
        if (dedupRevolut[recordToLookFor] == 1) {
          Logger.log("Record exists:%s", recordToLookFor);
        } else {
          Logger.log("NEW Record:%s -> %s", sheetNameToPlace, recordToLookFor);
          countNewRevolut++;
          dedupRevolut[recordToLookFor] = 1;
          if (dryRun == 0) {
            addRowForSheet(sheetNameToPlace, values[r]);
          }
        }
      }
      Logger.log("Revolut file %s: %s new rows", name, countNewRevolut);
      continue;
    } else {
      var countNew = 0;
      for(var r=1;r<values.length;r++){
          var accountNumber = values[r][0];
          var sheetNameToPlace = mapAccountIdtoSheetName[accountNumber];
          if(sheetNameToPlace != null){
            var recordToLookFor = values[r].slice(3, 7).join();
            if(mapSheetNameToDictionaryOfRecords[sheetNameToPlace][recordToLookFor] == 1){
              
              Logger.log("Record exists:%s", recordToLookFor);
            } else {
              Logger.log("NEW Record:%s -> %s", sheetNameToPlace, recordToLookFor);
              // return;//Debug
              countNew++;
              mapSheetNameToDictionaryOfRecords[sheetNameToPlace][recordToLookFor] = 1;
              if(dryRun == 0){
                addRowForSheet(sheetNameToPlace, values[r]);
                
              }
              
            }
          } else {
            Logger.log("Sheet not found, account number:%s -> %s", accountNumber, sheetNameToPlace);
          }
      }
      var msg = Utilities.formatString("File:%s\n", name);
      if(countNew == 0){
        msg = msg + Utilities.formatString("None of the imported %s transactions is new!", values.length);
      } else {
        msg = msg + Utilities.formatString("%s new transactions imported", countNew);
      }
    }
    //SpreadsheetApp.getUi().alert(msg);
  }

  // Bulk append once per sheet (much faster than appendRow in a loop).
  if (dryRun == 0) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    for (var sheetName in rowsToAppendBySheet) {
      if (!Object.prototype.hasOwnProperty.call(rowsToAppendBySheet, sheetName)) continue;
      var rows = rowsToAppendBySheet[sheetName];
      if (!rows || rows.length === 0) continue;
      var target = ss.getSheetByName(sheetName);
      if (!target) continue;
      var width = target.getLastColumn();
      padRows(rows, width);
      var startRow = target.getLastRow() + 1;
      target.getRange(startRow, 1, rows.length, width).setValues(rows);
    }
  }
  
}

function getTodayFormattedDate() {
  // Get the current date
  var today = new Date();
  
  // Extract year, month, and day
  var year = today.getFullYear(); // e.g., 2022
  var month = (today.getMonth() + 1).toString().padStart(2, '0'); // e.g., 02 (month is 0-indexed)
  var day = today.getDate().toString().padStart(2, '0'); // e.g., 12
  
  // Concatenate in YYYYMMDD format
  var formattedDate = year + month + day;
  
  // Log or return the result
  // Logger.log(formattedDate);
  return formattedDate;
}

function appendToSheet(sheet, row, sheetNameToPlace){
  // Logger.log("Attempting to apend %s to sheet '%s'", row, sheetNameToPlace);

  sheet.getRange("A:H").setNumberFormat("@"); // Set column as plain text
  var values = sheet.getDataRange().getValues();
  var found = false;
  for(var r=1;r<values.length;r++){
    // if(values[r].join() == row.join()){
    if(values[r][2] == row[2] && values[r][3] == row[3] && values[r][4] == row[4] && values[r][5] == row[5] ){
      // Logger.log("Row exists");
      found = true;
      break;
    }
  }

  if(found == false){
    Logger.log("Row NOT found:%s!!\nappending at the end of %s", row, sheetNameToPlace);
    sheet.appendRow(row);
    return true;
  }
  return false;
}

function initializeSheetMaps(){
  var sheetNamesRunningAccounts = ['Shopping-Essential', 'Shopping-Non-Essential', 'Recurring', 'Personal-Mo', 'Personal-Alice', 'Investment Wallet', 'Revolut-Mo', 'Revolut-Alice'];
  var mapSheetNameToDictionaryOfRecords = {};
  sheetNamesRunningAccounts.forEach(function(sheetName){

    var slice_start;
    var slice_end;
    if(sheetName === "Revolut-Mo" || sheetName === "Revolut-Alice"){
      slice_start = 6;
      slice_end = 7;
    } else {
      slice_start = 3;
      slice_end = 7;      
    }
    var dictionaryOfRecords = {};
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    setFormat(sheet);
    var values = sheet.getDataRange().getValues();
    for(var r=1;r<values.length;r++){
      var record = values[r].slice(slice_start, slice_end).join();
      // Logger.log(record);
      // return;
      dictionaryOfRecords[record] = 1;
      
    }
    mapSheetNameToDictionaryOfRecords[sheetName] = dictionaryOfRecords;
  });
  return mapSheetNameToDictionaryOfRecords;
}