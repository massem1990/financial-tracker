function parseCreditCardData() {
  // var spreadsheet = SpreadsheetApp.getActive();
  var sheet= SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CreditCardHelper');
  sheet.getRange("A2:A").setNumberFormat("@"); // Set column as plain text
  var range = sheet.getDataRange();
  var values = range.getValues();

  var cardHolder = values[1][1];
  var account = 'CreditCard-';
  if(cardHolder === ""){
    SpreadsheetApp.getUi().alert('Please select card holder first');return;
  }else{
    account+=cardHolder;
  }
  var resultsArray = [];
  var handlingRow = 3;
  for (var r = 1; r < values.length-3; r+=3) {
    var desc = values[r+1][0];
    var date = formatDateStringToYYYYMMDD(values[r][0]);
    var money = extractNumericValue(values[r+2][0]);

    Logger.log("Row: %s : %s - %s - %s", r+1, desc, date, money);
    // return;
    resultsArray.push([account, 'EUR', date, date, '-', '-', money, desc]);
  }
  resultsArray.reverse();
  resultsArray.forEach(function(row){
    range.getCell(handlingRow, 3).setValue(row[0]);
    range.getCell(handlingRow, 4).setValue(row[1]);
    range.getCell(handlingRow, 5).setValue(row[2]);
    range.getCell(handlingRow, 6).setValue(row[3]);
    range.getCell(handlingRow, 7).setValue(row[4]);
    range.getCell(handlingRow, 8).setValue(row[5]);
    range.getCell(handlingRow, 9).setValue(row[6]);
    range.getCell(handlingRow, 10).setValue(row[7]);
    handlingRow++;
  });
};

// input: € 138,28
// output: 20220701
function transformMoney(input){
  
  var output = input.toString().slice(1);
  output = output.replace(".", "");
  output = output.replace(",", ".");
  if (output.indexOf('Debit') > -1) {
    output = output.replace("Debit", "");
    output = "-"+output;
    output = output.replace(" ", "");
  } else {
    output = output.replace("Credit", "");
  }
  // Logger.log("Input: %s - Output: %s", input, output);
  return output;
}

function extractNumericValue(input) {
  if (typeof input !== 'string') return null;

  // Remove everything except digits, minus sign, and decimal point
  const match = input.match(/-?\d+[\.,]?\d*/);
  if (match) {
    return parseFloat(match[0].replace(',', '.'));
  }

  return null; // or 0 if you prefer
}



// input: 3 Jul 2022 | 10:22:12
// output: 20220701
function transformDate(input){
  var mapMonths = {
    'Jan' : '01', 
    'Feb' : '02', 
    'Mar' : '03', 
    'Apr' : '04', 
    'May' : '05', 
    'Jun' : '06', 
    'Jul' : '07', 
    'Aug' : '08', 
    'Sep' : '09', 
    'Oct' : '10', 
    'Nov' : '11', 
    'Dec' : '12', 
  };

  const tokens = input.toString().split(" ");
  var output = tokens[2] + mapMonths[tokens[1]];
  if(tokens[0] < 10){
    output += "0";
  }
  output += tokens[0];
  Logger.log("Input: %s - Output: %s", input, output);
  return output;
}

function formatDateStringToYYYYMMDD(input) {
  if (typeof input !== 'string') return '';
  
  const date = new Date(input);
  if (isNaN(date)) return '';

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}




function reset(){
  var sheet = SpreadsheetApp.getActive().getSheetByName("CreditCardHelper");
  
  var numberOfRows = sheet.getDataRange().getValues().length;

  sheet.getRange(2, 1, 1, 2).clearContent();
  sheet.getRange(3,1,numberOfRows,11).clearContent();
}