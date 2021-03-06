function logger(type, text) {
  var message = [watcherID, "consoleMessage", type, text];
  process.send(message);
}

process.on("uncaughtException", function (err) {
  console.error(err.stack);
  logger("fatal", err.stack);
  process.exit();
});

const path = require("path");
const fs = require("fs");
var watcherFilesToScan = {};
var watchers = {};

if (fs.existsSync(path.join(process.cwd(), "/npm"))) {
  var rootModules = path.join(process.cwd(), "/npm/node_modules/");
} else {
  var rootModules = "";
}

var watcherID = process.argv[2];
var Folder = process.argv[3];
var DB_id = process.argv[4];
var folderWatchScanInterval = process.argv[5];

//args come through as strings
var useFsEvents = process.argv[6] == "true";

//seconds in milliseconds
folderWatchScanInterval = folderWatchScanInterval * 1000;
if (folderWatchScanInterval < 1000) {
  folderWatchScanInterval = 1000;
}

var exitRequestSent = false;
const chokidar = require(rootModules + "chokidar");

logger("info", "Creating folder watch for library:" + Folder);

watcherFilesToScan[DB_id] = {};
watcherFilesToScan[DB_id].id = DB_id;
watcherFilesToScan[DB_id].filesToScan = [];
watcherFilesToScan[DB_id].oldLength = 0;
watcherFilesToScan[DB_id].newLength = 0;

watchers[DB_id] = chokidar.watch(Folder, {
  persistent: true,
  ignoreInitial: true,
  followSymlinks: true,
  usePolling: !useFsEvents,
  interval: folderWatchScanInterval,
  binaryInterval: folderWatchScanInterval,
  awaitWriteFinish: {
    stabilityThreshold: 10000,
    pollInterval: 1000,
  },
  useFsEvents: useFsEvents,
});

// Something to use when events are received.
const log = console.log.bind(console);

// Add event listeners.
watchers[DB_id].on("add", (newFile) => {
  newFile = newFile.replace(/\\/g, "/");
  logger("info", "File detected, adding to queue:" + newFile);
  watcherFilesToScan[DB_id].filesToScan.push(newFile);
})
  .on("change", (newFile) => {
    newFile = newFile.replace(/\\/g, "/");
    logger("info", "File detected, adding to queue:" + newFile);
    watcherFilesToScan[DB_id].filesToScan.push(newFile);
  })
  .on("unlink", (path) => {
    path = path.replace(/\\/g, "/");
    logger("info", "file removed, removing:" + path);

    //  log(`File ${path} has been removed`)
    var message = [watcherID, "removeThisFileFromDB", path];
    process.send(message);
  })
  .on("error", (error) => {
    logger("error", `error: ${error}`);
  })

  .on("ready", () => {
    logger("info", "Initial scan complete. Ready for changes");
  });

//on close

process.on("message", (m) => {
  if (m[0] == "closeDown") {
    if (exitRequestSent == false) {
      watchers[DB_id].close();
      var message = [watcherID, "requestingExit", DB_id];
      process.send(message);
    }

    exitRequestSent = true;
  }

  if (m[0] == "exitApproved") {
    process.exit();
  }
});

scanWatcherFiles();

function scanWatcherFiles() {
  //logger('info','Folder watcher:' + JSON.stringify(watcherFilesToScan))
  Object.keys(watcherFilesToScan).forEach(function (key) {
    try {
      //newLength = watcherFilesToScan.length
      watcherFilesToScan[key].newLength =
        watcherFilesToScan[key].filesToScan.length;

      if (
        watcherFilesToScan[key].newLength ==
          watcherFilesToScan[key].oldLength &&
        watcherFilesToScan[key].filesToScan.length != 0
      ) {
        logger(
          "info",
          "Sending files for scanning, library :" + watcherFilesToScan[key].id
        );
        var message = [
          watcherID,
          "sendFilesForExtract",
          DB_id,
          watcherFilesToScan[key].filesToScan,
        ];
        process.send(message);
        watcherFilesToScan[key].filesToScan = [];
      }

      // oldLength = newLength
      watcherFilesToScan[key].oldLength = watcherFilesToScan[key].newLength;
    } catch (err) {}
  });
  setTimeout(scanWatcherFiles, 1000);
}
