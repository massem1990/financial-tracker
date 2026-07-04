
// Compare the constant dictionary of categories with imported categories sheet.
function validateCategories(){
  const uniqueDictionary = {};

  // Iterate through the dictionary in constants files with all categories
  for (let key in inputCategoryKeywords) {
    const value = inputCategoryKeywords[key];
    // Add each unique value to the new dictionary with value 1
    if (!uniqueDictionary[value]) {
      uniqueDictionary[value] = 1;
    }
  }

  var expensesCategoriesFromTheSheet = getExpenseCategories();

  var noError = true;
  for (const key in uniqueDictionary) {
    if (uniqueDictionary.hasOwnProperty(key)) { // Ensure the key is not inherited
      // console.log(`Key: ${key}, Value: ${uniqueDictionary[key]}`);
      if(expensesCategoriesFromTheSheet[key] != 1 ){
        var errorMsg = "The following category is not matching the provided categories : " + key;
        SpreadsheetApp.getUi().alert(errorMsg);
        noError = false;
      }
    }
  }
  if(noError){
    SpreadsheetApp.getUi().alert('Validation complete, no mismatch in categories');
  }
  
}


function getExpenseCategories() {
  // Open the active spreadsheet and get the sheet
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Categories");
  if (!sheet) {
    throw new Error('Sheet "Categories" not found.');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  const columnValues = sheet.getRange(2, 2, lastRow - 1, 1).getValues(); // B2:B

  // Create an empty dictionary to store unique values
  const uniqueDictionary = {};

  // Iterate through the column values
  columnValues.forEach(row => {
    const value = row[0]; // Access the value in the first column
    if (value && !uniqueDictionary[value]) { // Skip empty cells
      uniqueDictionary[value] = 1; // Add the unique value to the dictionary
    }
  });

  return uniqueDictionary;
}

/**
 * Validate that every category used in sheet "*" (column J) exists in Categories!B.
 * Shows a popup at the end listing missing category names (if any).
 */
function validateStarSheetCategories() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var sheet = ss.getSheetByName("*");
  if (!sheet) {
    throw new Error('Sheet "*" not found.');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('Validation complete: no categories found in "*".');
    return;
  }

  var values = sheet.getRange(2, 10, lastRow - 1, 1).getValues(); // J2:J
  var used = {};
  for (var i = 0; i < values.length; i++) {
    var v = values[i][0];
    if (v === null || v === undefined) continue;
    v = String(v).trim();
    if (!v) continue;
    used[v] = 1;
  }

  var allowed = getExpenseCategories(); // Categories!B2:B
  var missing = [];
  for (var cat in used) {
    if (!Object.prototype.hasOwnProperty.call(used, cat)) continue;
    if (allowed[cat] !== 1) missing.push(cat);
  }
  missing.sort();

  if (missing.length === 0) {
    ui.alert('Validation complete: all categories in "*" exist in "Categories".');
    return;
  }

  ui.alert(
    'Missing categories in "Categories" (found in "*" column J):\n\n' +
    missing.join('\n')
  );
}