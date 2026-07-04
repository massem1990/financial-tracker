function retrieveStatus() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Status');
  var range = sheet.getRange("A2:N");
  var values = range.getValues();

  var map_result = {};
  for (var i = 0; i < values.length; i++) {
      var row = values[i]; // Current row as an array
      var result_per_card = {};
      var has_temp_expense = false;
      if(row[6] > 0){
        result_per_card["has_un_categorised_expenses"] = 1;
      }
      if(row[7] > 0){
        result_per_card["has_temp_expense__paypal"] = 1;
        has_temp_expense = true;
      }
      if(row[8] > 0){
        result_per_card["has_temp_expense__amazon"] = 1;
        has_temp_expense = true;
      }
      if(row[9] > 0){
        result_per_card["has_temp_expense__bol"] = 1;
        has_temp_expense = true;
      }
      if(row[10] > 0){
        result_per_card["has_temp_expense__media_markt"] = 1;
        has_temp_expense = true;
      }
      if(row[11] > 0){
        result_per_card["has_temp_expense__credit_card"] = 1;
        has_temp_expense = true;
      }
      if(row[12] > 0){
        result_per_card["has_temp_expense__coolblue"] = 1;
        has_temp_expense = true;
      }
      if(row[13] > 0){
        result_per_card["has_temp_expense__revolut"] = 1;
        has_temp_expense = true;
      }
      
      if(has_temp_expense){
        result_per_card["has_temp_expense"] = 1;
      }
      map_result[row[0]] = result_per_card;
  }
  // Logger.log(map_result);
  return map_result;
}
