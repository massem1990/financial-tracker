/**
 * Column letter(s) to 0-based index (e.g. 'F' -> 5). Used by sheet row arrays.
 */
function letterToIndex(input) {
  var output = '';
  for (var i = 0; i < input.length; i++) {
    var code = input.toUpperCase().charCodeAt(i);
    if (code > 64 && code < 91) output += (code - 64) + ' ';
  }
  output = output.slice(0, output.length - 1) - 1;
  return output;
}

/**
 * Build category map from { category: [ entries ] }.
 * Each entry is either a keyword string or { keyword: '...', shortDescription: '...' }.
 * Returns { categories: { keyword -> category }, shortByKeyword: { keyword -> short text } }.
 */
function buildCategoryKeywordData(groups) {
  // Null-prototype maps avoid any Object.prototype pollution surprises.
  var categories = Object.create(null);
  var shortByKeyword = Object.create(null);
  for (var category in groups) {
    if (!Object.prototype.hasOwnProperty.call(groups, category)) continue;
    var keys = groups[category];
    for (var i = 0; i < keys.length; i++) {
      var entry = keys[i];
      if (typeof entry === 'string') {
        categories[entry] = category;
      } else if (entry && typeof entry === 'object' && entry.keyword) {
        categories[entry.keyword] = category;
        if (entry.shortDescription != null && String(entry.shortDescription) !== '') {
          shortByKeyword[entry.keyword] = String(entry.shortDescription);
        }
      }
    }
  }
  return { categories: categories, shortByKeyword: shortByKeyword };
}

/**
 * @deprecated Use buildCategoryKeywordData; kept if any script still calls this name.
 */
function buildInputCategoryKeywords(groups) {
  return buildCategoryKeywordData(groups).categories;
}

/**
 * Same map as flatKeywords but with every key lowercased (for description substring matching).
 * Built once at load; avoids rebuilding per sheet in categorizeBySheet.
 */
function buildLowercaseKeywordLookup(flatKeywords) {
  // Null-prototype map avoids prototype keys influencing lookups.
  var out = Object.create(null);
  for (var key in flatKeywords) {
    if (!Object.prototype.hasOwnProperty.call(flatKeywords, key)) continue;
    out[key.toLowerCase()] = flatKeywords[key];
  }
  return out;
}

/**
 * Convert a cell reference from A1Notation to 0-based indices (for arrays)
 * or 1-based indices (for Spreadsheet Service methods).
 *
 * @param {String}    cellA1   Cell reference to be converted.
 * @param {Number}    index    (optional, default 0) Indicate 0 or 1 indexing
 *
 * @return {object}            {row,col}, both 0-based array indices.
 *
 * @throws                     Error if invalid parameter
 */
function cellA1ToIndex( cellA1, index ) {
  // Ensure index is (default) 0 or 1, no other values accepted.
  index = index || 0;
  index = (index == 0) ? 0 : 1;

  // Use regex match to find column & row references.
  // Must start with letters, end with numbers.
  // This regex still allows induhviduals to provide illegal strings like "AB.#%123"
  var match = cellA1.match(/(^[A-Z]+)|([0-9]+$)/gm);

  if (match.length != 2) throw new Error( "Invalid cell reference" );

  var colA1 = match[0];
  var rowA1 = match[1];

  return { row: rowA1ToIndex( rowA1, index ),
           col: colA1ToIndex( colA1, index ) };
}

/**
 * Return a 0-based array index corresponding to a spreadsheet column
 * label, as in A1 notation.
 *
 * @param {String}    colA1    Column label to be converted.
 *
 * @return {Number}            0-based array index.
 * @param {Number}    index    (optional, default 0) Indicate 0 or 1 indexing
 *
 * @throws                     Error if invalid parameter
 */
function colA1ToIndex( colA1, index ) {
  if (typeof colA1 !== 'string' || colA1.length > 2) 
    throw new Error( "Expected column label." );

  // Ensure index is (default) 0 or 1, no other values accepted.
  index = index || 0;
  index = (index == 0) ? 0 : 1;

  var A = "A".charCodeAt(0);

  var number = colA1.charCodeAt(colA1.length-1) - A;
  if (colA1.length == 2) {
    number += 26 * (colA1.charCodeAt(0) - A + 1);
  }
  return number + index;
}

/**
 * Return a 0-based array index corresponding to a spreadsheet row
 * number, as in A1 notation. Almost pointless, really, but maintains
 * symmetry with colA1ToIndex().
 *
 * @param {Number}    rowA1    Row number to be converted.
 * @param {Number}    index    (optional, default 0) Indicate 0 or 1 indexing
 *
 * @return {Number}            0-based array index.
 */
function rowA1ToIndex( rowA1, index ) {
  // Ensure index is (default) 0 or 1, no other values accepted.
  index = index || 0;
  index = (index == 0) ? 0 : 1;

  return rowA1 - 1 + index;
}

// ------------------------
function typeofcellvalue(reference) {
  var ss = SpreadsheetApp.getActive();
  var rng = ss.getRange(reference);
  var value = rng.getValue();
  return typeof value;
}


function sortArray(arrayOne) {
  arrayOne.sort(function (a, b) {
    return (b.expense || 0) - (a.expense || 0);
  });
}

function customLog(message, cell_r, cell_c){
  
  SpreadsheetApp.getUi().alert(message);

  // var sheet= SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  // sheet.getDataRange().getCell(11, colA1ToIndex('AK') + 1).setValue(message);
  // sheet.getDataRange().getCell(20,13).setValue(message);
}

