
function processFiles(){
  // 2-Split transactions into proper files
  analyzeUploaded();
  // 3-Categorize transactions
  categorize();

  // 4-Categorize transactions
  FillFormulas();
  
  // 5-Delete all temp files
  deleteAll();

  SpreadsheetApp.getUi().alert("Processing complete !");
}


function deleteAll(){
  emptyFolder(DriveFolders.UNCONVERTED);
  emptyFolder(DriveFolders.CONVERTED);
  // SpreadsheetApp.getUi().alert('All temp files deleted!');

}

function emptyFolder(folderId){
  var files = DriveApp.getFolderById(folderId).getFiles();
  while (files.hasNext()) {
    var file = files.next();
    Drive.Files.remove(file.getId()); 
  }
}

function openAttachmentDialog() {
 var html = HtmlService.createHtmlOutputFromFile('Form__UploadFile');
 SpreadsheetApp.getUi() // Or DocumentApp or SlidesApp or FormApp.
 .showModalDialog(html, 'Upload File');
}

function saveFile(obj) {
 var blob = Utilities.newBlob(Utilities.base64Decode(obj.data), obj.mimeType, obj.fileName);
 var file = DriveApp.getFolderById(DriveFolders.UNCONVERTED).createFile(blob);
convertXLS(file);
}


function newName(oldName){
  // oldName = "test";
  oldName = oldName.replace(".xls", "");
  const now = new Date();
  var time = Utilities.formatDate(now, 'GMT+01', '-yyyy-MM-dd-HH:mm:ss');

  var newName = oldName + time;
  // Logger.log(newName);
  return newName;
}

function convertXLS(){
  var unconvertedFiles = DriveApp.getFolderById(DriveFolders.UNCONVERTED).getFiles();
  while (unconvertedFiles.hasNext()) {
    var file = unconvertedFiles.next();
    var name = file.getName();

    if (name.indexOf('.xls')>-1 || name.indexOf('.csv')>-1 ){
      var convertedName = newName(name);
      Logger.log("%s -%s", name, convertedName);
      var originalFileID = file.getId();
      var xBlob = file.getBlob();
      var newFile = {
        title : convertedName,
        parents: [{id: DriveFolders.CONVERTED}]
      };
      var newDriveFile = Drive.Files.insert(newFile, xBlob, {
        convert: true
      });
      Drive.Files.remove(originalFileID);
    }
  }
}

