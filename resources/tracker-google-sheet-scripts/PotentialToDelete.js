function resetFilters() {

    sheetNames.forEach(function (sheetName) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    var filter = sheet.getFilter();
    if (filter !== null) {  // tests if there is a filter applied
      var range = filter.getRange();
      filter.remove();
      range.createFilter();
    Logger.log("%s - All filters cleared",sheetName);
    } else {
      Logger.log("%s - There is no filter",sheetName);
    }
  });
}

function applySavedFiltersToSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
    sheetNames.forEach(function (sheetName) {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      sheet.activate(); // Activate the sheet to exit any active filter view
      // Define each sheet with its corresponding filter view ID
      var sheetFilters = {
          "Recurring": 896795226,  // Replace with actual Filter View ID for Sheet1
          // "Sheet2": 2345678901,  // Replace with actual Filter View ID for Sheet2
          // "Sheet3": 3456789012   // Replace with actual Filter View ID for Sheet3
      };
      // SpreadsheetApp.getActiveSpreadsheet().setView(sheetFilters[sheetName]);
      ss.getActiveSheet().getFilter().setView(sheetFilters[sheetName]); // Apply the corresponding filter view
      
      // SpreadsheetApp.flush();

      // var filter = sheet.getFilter();
      // if (filter) {
      //   filter.remove(); // Remove the filter if it exists
      // }
    });
}



function applySavedFiltersToSheets22() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Define each sheet with its corresponding filter view ID
    var sheetFilters = {
        "Sheet1": 1234567890,  // Replace with actual Filter View ID for Sheet1
        "Sheet2": 2345678901,  // Replace with actual Filter View ID for Sheet2
        "Sheet3": 3456789012   // Replace with actual Filter View ID for Sheet3
    };
    SpreadsheetApp.getActiveSpreadsheet().setView(sheetFilters[sheetName]);
    for (var sheetName in sheetFilters) {
        var sheet = ss.getSheetByName(sheetName);
        if (sheet) {
            var filter = sheet.getFilter();
            if (filter) {
                filter.remove(); // Remove existing filter if present
            }
            sheet.getRange("A1").activate(); // Ensure focus is on the sheet
            ss.getActiveSheet().getFilter().setView(sheetFilters[sheetName]); // Apply the corresponding filter view
        }
    }

    Logger.log("Filters applied to all specified sheets.");
}

function switchFilterView() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    sheetNames.forEach(function (sheetName) {
      
      var sheet = ss.getSheetByName(sheetName);
      
      if (!sheet) {
          Logger.log("Sheet not found: " + sheetName);
          // customLog("No filter view found for this sheet.");
          return;
      }
      
      var sheetId = sheet.getSheetId(); // Get Sheet ID
      var filterViews = {
          "Recurring": 896795226,  // Replace with actual Filter View ID for Sheet1
      };

      if (!(sheetName in filterViews)) {
          Logger.log("No filter view found for this sheet.");
          // customLog("No filter view found for this sheet.");
          return;
      }

      var filterViewId = filterViews[sheetName];
      var url = ss.getUrl() + "#gid=" + sheetId + "&fvid=" + filterViewId;

      var message = "Opening filter view for " + sheetName + ": " + url;
      Logger.log(message);
      customLog(message);
      var html = '<script>window.open("' + url + '", "_blank");google.script.host.close();</script>';
      var ui = HtmlService.createHtmlOutput(html).setWidth(200).setHeight(100);
      SpreadsheetApp.getUi().showModalDialog(ui, "Opening Filter View...");
    });
}