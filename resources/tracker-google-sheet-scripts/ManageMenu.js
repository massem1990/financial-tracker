function onOpen() {
  var ui = SpreadsheetApp.getUi() // Or DocumentApp or SlidesApp or FormApp.
  
  ui.createMenu('Manage')
  .addItem('Upload transactions', 'openAttachmentDialog')
  .addItem('Process uploaded transactions', 'processFiles')
  .addItem('Categories (Only New)', 'categorize')
  .addItem('Categories (All Entries)', 'categorizeForceAll')
  .addItem('Validate Categories', 'validateCategories')
  .addItem('Validate Categories: Sheet "*" vs Categories', 'validateStarSheetCategories')
  .addSubMenu(
    ui.createMenu('Only Show') // Submenu
      .addItem('Reset all filters', 'removeAllFilters')
      .addItem('Uncategorised Expenses', 'applyDynamicFilter__un_categorised')
      .addItem('All Temp Expenses', 'applyDynamicFilter__temp')
      .addItem('Temp: Amazon', 'applyDynamicFilter__temp_amazon')
      .addItem('Temp: Bol', 'applyDynamicFilter__temp_bol')
      .addItem('Temp: Revolut', 'applyDynamicFilter__temp_revolut')
      .addItem('Temp: Travel', 'applyDynamicFilter__travel')
      .addItem('Temp: Paypal', 'applyDynamicFilter__temp_paypal')
  )
  .addItem('Hide Expense Sheets', 'hideSheets')
  .addItem('Show All Sheets', 'showAllSheets')
  .addToUi();
}
