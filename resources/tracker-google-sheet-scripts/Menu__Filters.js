function removeAllFilters() {
    sheetNames.forEach(function (sheetName) {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      sheet.activate(); // Activate the sheet to exit any active filter view
      SpreadsheetApp.flush();

      var filter = sheet.getFilter();
      if (filter) {
        filter.remove(); // Remove the filter if it exists
      }
    });
}


function applyDynamicFilter__un_categorised() {
    var criteria = SpreadsheetApp.newFilterCriteria()
        .whenCellEmpty() // Show only blank cells
        .build();
        
    applyDynamicFilter(criteria, 10, "has_un_categorised_expenses");
}

function applyDynamicFilter__temp() {
    var criteria = SpreadsheetApp.newFilterCriteria()
        .whenTextContains("Temp")
        .build();
        
    applyDynamicFilter(criteria, 10, "has_temp_expense");
}

function applyDynamicFilter__temp_amazon() {
    var criteria = SpreadsheetApp.newFilterCriteria()
        .whenTextEqualTo("Amazon (Temp)")
        .build();
        
    applyDynamicFilter(criteria, 10, "has_temp_expense__amazon");
}


function applyDynamicFilter__temp_bol() {
    var criteria = SpreadsheetApp.newFilterCriteria()
        .whenTextEqualTo("Bol (Temp)")
        .build();
        
    applyDynamicFilter(criteria, 10, "has_temp_expense__bol");
}


function applyDynamicFilter__temp_revolut() {
    var criteria = SpreadsheetApp.newFilterCriteria()
        .whenTextEqualTo("Revolut (Temp)")
        .build();
        
    applyDynamicFilter(criteria, 10, "has_temp_expense__revolut");
}

function applyDynamicFilter__temp_paypal() {
    var criteria = SpreadsheetApp.newFilterCriteria()
        .whenTextEqualTo("Paypal (Temp)")
        .build();
        
    applyDynamicFilter(criteria, 10, "has_temp_expense__paypal");
}


function applyDynamicFilter__travel() {
    var criteria = SpreadsheetApp.newFilterCriteria()
        .whenTextContains("Travel")
        .build();

    applyDynamicFilter(criteria, 10, null, { requireStatus: false, hideSheets: false });
}


/**
 * @param {*} criteria - Spreadsheet filter criteria
 * @param {number} column - 1-based column index for filter
 * @param {string} [filterName] - key in status sheet; omit when options.requireStatus is false
 * @param {{ requireStatus?: boolean, hideSheets?: boolean }} [options] - default requireStatus/hideSheets true
 */
function applyDynamicFilter(criteria, column, filterName, options) {
    options = options || {};
    var requireStatus = options.requireStatus !== false;
    var hideSheetsAfter = options.hideSheets !== false;

    var map_statusOfSheet = retrieveStatus();
    var map_that_has_filter_activated = {};
    var log_message = "Filter was applied to the following sheets:\n\n";
    sheetNames.forEach(function (sheetName) {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      var range = sheet.getRange("A1:M");

      // Remove any existing filter first
      if (sheet.getFilter()) {
          sheet.getFilter().remove();
      }

      var statusMap = map_statusOfSheet[sheetName];
      var shouldApply = !requireStatus || (statusMap && statusMap[filterName]);
      if (shouldApply) {
        var filter = range.createFilter();
        filter.setColumnFilterCriteria(column, criteria);

        log_message = log_message + "\t" + sheetName + "\n";
        map_that_has_filter_activated[sheetName] = 1;
      }

    });

    if (hideSheetsAfter) {
      hideSheets(map_that_has_filter_activated);
    }
    customLog(log_message);
}



