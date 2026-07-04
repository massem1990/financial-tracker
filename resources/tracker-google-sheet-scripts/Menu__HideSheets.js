function hideSheets(sheets_to_show) {
  showAllExpenseSheets();
  sheetNames.forEach(function (sheetName) {
    if(!sheets_to_show || (sheets_to_show && !sheets_to_show[sheetName])){
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      sheet.hideSheet(); // Hide the sheet
    }
  });
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Categories").hideSheet();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName("*").hideSheet();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CreditCardHelper").hideSheet();
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Manual").hideSheet();
}

function showAllExpenseSheets() {
  sheetNames.forEach(function (sheetName) {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      sheet.showSheet();
  });
}

function showAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  
  sheets.forEach(function(sheet) {
    if (sheet.isSheetHidden() == true) {
      sheet.showSheet();
    }
  });
}


