/**
 * @file host/premiere.jsx
 * @description ExtendScript for Adobe Premiere Pro to automate video project setup.
 * This script handles:
 * - Creating course-specific directory structures and Premiere Pro projects.
 * - Importing media (videos and slides) into organized bins.
 * - Creating sequences for lessons based on a Master Plan JSON.
 * - Populating sequences with appropriate media clips.
 * It communicates with the CEP panel (HTML/JS) via `evalScript`.
 */

#target premierepro
#include "json2.js"; // For JSON parsing in ExtendScript, as native JSON object might be limited or unavailable.

// --- Global Constants & Configuration ---

/**
 * @const {boolean} IS_TEST_MODE
 * @description Flag to enable test mode, which typically processes a limited subset of data (e.g., first section/lesson).
 * Set to false for full processing of the Master Plan.
 */
var IS_TEST_MODE = false;

/**
 * @const {number} PPRO_BIN_TYPE
 * @description Premiere Pro ProjectItemType constant for Bins.
 * Value: 2 (typically, but using app.project.rootItem.createBin() is safer than relying on magic numbers directly if API changes).
 * Note: ProjectItemType.BIN is usually 2.
 */
var PPRO_BIN_TYPE = 2; // ProjectItemType.BIN

/**
 * @const {number} PPRO_FILE_TYPE
 * @description Premiere Pro ProjectItemType constant for imported files (master clips/media files).
 * Value: 1 (typically).
 * Note: ProjectItemType.FILE is usually 1.
 */
var PPRO_FILE_TYPE = 1; // ProjectItemType.FILE

/**
 * @const {number} PPRO_CLIP_TYPE
 * @description Premiere Pro ProjectItemType constant for clips (can also refer to master clips).
 * Value: 0 (typically).
 * Note: ProjectItemType.CLIP is usually 0.
 */
var PPRO_CLIP_TYPE = 0; // ProjectItemType.CLIP (Master clips can also be this type)


// --- Helper Functions ---

/**
 * Polyfill for String.prototype.padStart, simplified for padding numbers with leading zeros.
 * ExtendScript's JavaScript engine (ES3-based) might not have this built-in.
 * @param {number|string} number The number or string to pad.
 * @param {number} targetLength The desired total length of the string.
 * @param {string} [padString='0'] The string to use for padding.
 * @returns {string} The padded string.
 */
function padNumberStart(number, targetLength, padString) {
    padString = String(typeof padString !== 'undefined' ? padString : '0');
    var str = String(number);
    while (str.length < targetLength) {
        str = padString + str;
    }
    return str;
}

/**
 * Counts the number of own properties in an object.
 * Useful in ExtendScript where newer Object.keys().length might not be available.
 * @param {object} obj The object whose properties to count.
 * @returns {number} The number of own properties in the object.
 */
function getObjectPropertyCount(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return 0;
    }
    var count = 0;
    for (var key in obj) {
        // Check if the property belongs to the object itself, not its prototype.
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            count++;
        }
    }
    return count;
}


/**
 * Finds a bin by its name within a parent project item (typically project.rootItem or another bin).
 * @param {ProjectItem} parentBin The parent bin item.
 * @param {string} name The name of the bin to find.
 * @returns {ProjectItem|null} The found bin item, or null if not found or parentBin is invalid.
 */
function findBinByName(parentBin, name) {
    if (!parentBin || typeof parentBin.children === 'undefined' || parentBin.children === null) {
        $.writeln("ExtendScript: findBinByName - Error: parentBin is invalid or has no children. Parent: " + (parentBin ? parentBin.name : "null"));
        return null;
    }
    for (var i = 0; i < parentBin.children.numItems; i++) {
        var child = parentBin.children[i];
        // Check if child exists, matches name, and is a Bin type.
        if (child && child.name === name && child.type === PPRO_BIN_TYPE) {
            return child;
        }
    }
    return null; // Bin not found
}

/**
 * Finds a sequence by its name within a specific bin.
 * @param {ProjectItem} targetBin The bin (ProjectItem of type BIN) to search within.
 * @param {string} sequenceName The name of the sequence to find.
 * @returns {Sequence|null} The found Sequence object, or null if not found or arguments are invalid.
 */
function findSequenceInBin(targetBin, sequenceName) {
    if (!app.project || !app.project.sequences || !targetBin || typeof targetBin.nodeId === 'undefined') {
        $.writeln("ExtendScript: findSequenceInBin - Error: Invalid arguments. TargetBin: " + (targetBin ? targetBin.name : "null") + ", SeqName: " + sequenceName);
        return null;
    }
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        var seq = app.project.sequences[i];
        if (seq && seq.name === sequenceName) {
            var seqProjectItem = seq.projectItem; // Get the ProjectItem associated with the Sequence
            // Check if the sequence's parent bin is the targetBin
            if (seqProjectItem && typeof seqProjectItem.getBin === 'function') {
                var parentBin = seqProjectItem.getBin(); // getBin() should return the parent bin ProjectItem
                 if (parentBin && typeof parentBin.nodeId !== 'undefined' && parentBin.nodeId === targetBin.nodeId) {
                    return seq; // Found the sequence in the specified bin
                }
            } else if (seqProjectItem && seqProjectItem.treePath) {
                // Fallback for older PPro versions or different API behavior: Check treePath
                // treePath is like: /My Project.prproj/Root/Target Bin Name/Sequence Name.seqitem
                // This is less reliable than nodeId if bins can have same names at different levels.
                var expectedPathPart = "/" + targetBin.name + "/" + sequenceName;
                if (seqProjectItem.treePath.indexOf(expectedPathPart) > -1) {
                     // Further check if targetBin is truly the direct parent
                     // This part can be complex to verify robustly with treePath alone.
                     // For now, if nodeId is unavailable, this is a weaker check.
                    $.writeln("ExtendScript: findSequenceInBin - Warning: Used treePath for sequence '" + sequenceName + "'. NodeID preferred.");
                    return seq;
                }
            }
             else {
                 $.writeln("ExtendScript: findSequenceInBin - Sequence '" + sequenceName + "' projectItem or getBin method is problematic.");
            }
        }
    }
    return null; // Sequence not found in the target bin
}

/**
 * Imports files from a specified folder path into a target bin in Premiere Pro.
 * @param {string} sourceFolderPath The absolute path to the folder containing files to import.
 * @param {ProjectItem} targetBin The Premiere Pro bin (ProjectItem) to import files into.
 * @param {string} fileTypeDescription A descriptive string for logging (e.g., "Videos", "Slides").
 * @param {RegExp} [fileFilterRegex] Optional regular expression to filter files by name/extension (e.g., /\.(mp4|mov)$/i).
 * @param {string[]} [specificFileNamesToImport] Optional array of specific filenames. If provided, only these files (matching regex if also provided) are imported from the source folder.
 * @returns {object|null} An object mapping original file names (from disk) to their corresponding Premiere Pro ProjectItem objects.
 * Returns null if a critical error occurs (e.g., source folder doesn't exist).
 * Returns an empty object if no files are found or matched for import.
 */
function importFilesToBin(sourceFolderPath, targetBin, fileTypeDescription, fileFilterRegex, specificFileNamesToImport) {
    $.writeln("ExtendScript: importFilesToBin - Importing " + fileTypeDescription + " from: " + sourceFolderPath + " into bin: " + targetBin.name);
    if (specificFileNamesToImport && specificFileNamesToImport.length > 0) {
        $.writeln("ExtendScript: Specific files requested for import: " + specificFileNamesToImport.join(", "));
    }

    var sourceFolder = new Folder(sourceFolderPath);
    if (!sourceFolder.exists) {
        $.writeln("Error: Source folder for " + fileTypeDescription + " does not exist: " + sourceFolderPath);
        return null; // Critical error, cannot proceed with import for this type.
    }

    var filesToImportPaths = []; // Array to hold full paths of files to be imported.
    var filesInFolder = sourceFolder.getFiles(); // Get all files and subfolders.

    for (var i = 0; i < filesInFolder.length; i++) {
        var file = filesInFolder[i];
        if (file instanceof File) { // Ensure it's a file, not a folder.
            var shouldConsiderThisFile = false;
            // If a specific list is provided, only consider files in that list.
            if (specificFileNamesToImport && specificFileNamesToImport.length > 0) {
                for (var j = 0; j < specificFileNamesToImport.length; j++) {
                    if (file.name === specificFileNamesToImport[j]) {
                        shouldConsiderThisFile = true;
                        break;
                    }
                }
            } else {
                // If no specific list, consider all files (subject to regex filter).
                shouldConsiderThisFile = true;
            }

            if (shouldConsiderThisFile) {
                if (fileFilterRegex) {
                    // If regex filter is provided, test the filename.
                    if (fileFilterRegex.test(file.name)) {
                        filesToImportPaths.push(file.fsName);
                    } else if (specificFileNamesToImport && specificFileNamesToImport.length > 0 && shouldConsiderThisFile) {
                        // Log if a specifically requested file doesn't match the type regex.
                        $.writeln("ExtendScript: Warning - File '" + file.name + "' was in specific list but does not match type regex. It will NOT be imported.");
                    }
                } else {
                    // No regex filter, add if it was considered.
                    filesToImportPaths.push(file.fsName);
                }
            }
        }
    }

    if (filesToImportPaths.length === 0) {
        $.writeln("ExtendScript: No " + fileTypeDescription + " found or matched to import in " + sourceFolderPath);
        return {}; // Return empty map, not a critical failure.
    }

    $.writeln("ExtendScript: Attempting to import " + filesToImportPaths.length + " " + fileTypeDescription + " files: " + filesToImportPaths.join(", "));

    // Perform the import operation.
    // `suppressUI` (true) prevents import dialogs.
    // `targetBin` is where files go.
    // `importAsNumberedStills` (false) for regular file import.
    var importSuccess = app.project.importFiles(filesToImportPaths, true, targetBin, false);

    // It's good to add a small delay after import operations for Premiere to process.
    $.sleep(1500); // 1.5 seconds delay

    // After import, map the original filenames to the newly created ProjectItem objects.
    // This is important because Premiere might rename files on import if duplicates exist,
    // though with targetBin specified, it's less common for simple name clashes within that bin.
    var importedFileMap = {};
    var currentBinItems = targetBin.children;
    for (var k = 0; k < currentBinItems.numItems; k++) {
        var item = currentBinItems[k];
        var importedFileNameInPremiere = item.name;

        // Check if this imported item was one of the files we intended to import.
        var wasInImportList = false;
        var originalFileNameFromPathForMapKey = "";
        for (var l = 0; l < filesToImportPaths.length; l++) {
            var originalPath = filesToImportPaths[l].replace(/\\/g, '/'); // Normalize path
            var pathParts = originalPath.split('/');
            var originalFileNameFromPath = pathParts[pathParts.length -1]; // Get filename from path

            // Match the ProjectItem name with the original filename.
            if (importedFileNameInPremiere === originalFileNameFromPath) {
                wasInImportList = true;
                originalFileNameFromPathForMapKey = originalFileNameFromPath;
                break;
            }
        }
        if(wasInImportList){
            // Map the original disk filename to the Premiere ProjectItem.
            importedFileMap[originalFileNameFromPathForMapKey] = item;
        }
    }
    $.writeln("ExtendScript: " + fileTypeDescription + " import process finished. " + getObjectPropertyCount(importedFileMap) + " items newly mapped in bin '" + targetBin.name + "'.");
    return importedFileMap;
}


/**
 * Finds a project item (clip, file, etc.) by its name within a specific bin.
 * @param {string} itemName The name of the item to find.
 * @param {ProjectItem} bin The bin (ProjectItem of type BIN) to search within.
 * @param {string} [itemTypeDescription] Optional description of the item type for logging purposes (e.g., "Video Clip", "Slide Image").
 * @returns {ProjectItem|null} The found ProjectItem, or null if not found or arguments are invalid.
 */
function findItemInBinByName(itemName, bin, itemTypeDescription) {
    if (!itemName || itemName === "") { // Check for empty or null itemName
        $.writeln("ExtendScript: findItemInBinByName - Warning: itemName is empty or null. Cannot find item.");
        return null;
    }
    if (!bin || typeof bin.children === 'undefined' || bin.children === null) {
        $.writeln("ExtendScript: findItemInBinByName - Error: Cannot find " + (itemTypeDescription || "item") + " '" + itemName + "' in invalid bin: " + (bin ? bin.name : "null"));
        return null;
    }
    for (var i = 0; i < bin.children.numItems; i++) {
        var item = bin.children[i];
        if (item.name === itemName) {
            return item; // Item found
        }
    }
    // $.writeln("ExtendScript: findItemInBinByName - Item '" + itemName + "' (" + (itemTypeDescription || "item") + ") not found in bin '" + bin.name + "'.");
    return null; // Item not found
}


/**
 * Sets up the course project directory structure on disk and creates/opens the Premiere Pro project file.
 * This function is typically called first by the panel.
 * @param {string} courseSpecificPath The base path for this specific course (e.g., "D:/Courses/MyAwesomeCourse").
 * @param {string} courseName The name of the course (e.g., "My Awesome Course").
 * @returns {string} A status message indicating success or failure.
 */
function setupCourseProjectAndDirectories(courseSpecificPath, courseName) {
    $.writeln("ExtendScript: setupCourseProjectAndDirectories --- START ---");
    $.writeln("ExtendScript: Args - courseSpecificPath: " + courseSpecificPath + ", courseName: " + courseName);
    try {
        // Basic validation of host application environment
        if (!app || typeof app.openDocument !== 'function' || typeof app.newProject !== 'function') {
            return "Error: Host 'app' object or critical methods (openDocument/newProject) not available in ExtendScript.";
        }
        if (!courseSpecificPath || courseSpecificPath === "" || !courseName || courseName === "") {
            return "Error: courseSpecificPath or courseName is missing or empty.";
        }

        // Sanitize course name for use in file paths (replace invalid characters).
        var safeCourseName = courseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
        if (!safeCourseName || safeCourseName === "") {
             return "Error: Invalid course name after sanitization: Original was '" + courseName + "'";
        }

        $.writeln("ExtendScript: Using course-specific root path: " + courseSpecificPath);
        var mainCourseFolder = new Folder(courseSpecificPath);
        if (!mainCourseFolder.exists) {
            if (!mainCourseFolder.create()) {
                return "Error: Could not create main course folder: " + courseSpecificPath;
            }
        }
        $.writeln("ExtendScript: Main course folder verified/created: " + mainCourseFolder.fsName);

        // Define and create standard subdirectories for the course.
        var subDirs = ["_01_RAW_VIDEOS", "_02_SLIDES", "_03_PROJECT_DATA", "_04_PREMIERE_PROJECTS", "_05_EXPORTS"];
        for (var i = 0; i < subDirs.length; i++) {
            var subDir = new Folder(courseSpecificPath + "/" + subDirs[i]);
            if (!subDir.exists) {
                if (!subDir.create()) {
                    return "Error: Failed to create subdirectory: " + subDirs[i] + " in " + courseSpecificPath;
                }
            }
        }
        $.writeln("ExtendScript: All subdirectories verified/created.");

        // Define the path for the Premiere Pro project file.
        var projectsFolder = new Folder(courseSpecificPath + "/_04_PREMIERE_PROJECTS");
        var projectFileName = safeCourseName + ".prproj";
        var projectFilePath = projectsFolder.fsName.replace(/\\/g, '/') + "/" + projectFileName; // Normalize to forward slashes
        $.writeln("ExtendScript: Target project file path: " + projectFilePath);

        var projectFile = new File(projectFilePath);
        var messagePrefix = "";

        // Get current active project path (if any) for comparison.
        var currentProjPathStr = (app.project && app.project.path) ? app.project.path.toString().replace(/\\/g, '/') : null;

        if (currentProjPathStr === projectFilePath) {
            // Target project is already the active one.
            $.writeln("ExtendScript: Target project '" + projectFileName + "' is already active.");
            messagePrefix = "Success: Project '" + projectFileName + "' is already active. Folders verified.";
        } else if (projectFile.exists) {
            // Target project exists on disk but is not active; open it.
            $.writeln("ExtendScript: Target project file exists. Opening: " + projectFilePath);
            app.openDocument(projectFilePath); // Attempt to open
            $.sleep(3000); // Give Premiere Pro time to open the project.
            // Verify if the project was successfully opened.
            if (app.project && app.project.path && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                messagePrefix = "Success: Existing project '" + projectFileName + "' opened.";
            } else {
                var activeProjectName = (app.project && app.project.name) ? app.project.name : "None";
                messagePrefix = "Error: Failed to open or confirm opening of project '" + projectFileName + "'. Current active project: " + activeProjectName;
            }
        } else {
            // Target project does not exist; create a new one.
            $.writeln("ExtendScript: Target project does not exist. Creating new: " + projectFilePath);
            app.newProject(projectFilePath); // Attempt to create
            $.sleep(2000); // Give Premiere Pro time to create the project.
            // Verify if the new project was successfully created and is active.
            if (app.project && app.project.path && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                messagePrefix = "Success: New project '" + projectFileName + "' created and opened.";
            } else {
                messagePrefix = "Error: Failed to create or confirm creation of new project '" + projectFileName + "'.";
            }
        }
        $.writeln("ExtendScript: " + messagePrefix);
        return messagePrefix; // Return the final status message.
    } catch (e) {
        // Catch any unexpected errors during the process.
        return "Error: Exception in setupCourseProjectAndDirectories: " + e.toString() + " (Line: " + e.line + ")";
    } finally {
        $.writeln("ExtendScript: setupCourseProjectAndDirectories --- END ---");
    }
}

/**
 * Main processing function called by the panel to automate Premiere Pro tasks based on the Master Plan.
 * It parses the Master Plan JSON, imports media, creates bins and sequences, and populates sequences.
 * @param {string} masterPlanJSONString A stringified JSON object representing the Master Plan.
 * @param {string} projectPathFromPanel The expected path of the active Premiere Pro project, passed from the panel.
 * @returns {string} A status message indicating the overall success or failure of the processing.
 */
function processMasterPlanInPremiere(masterPlanJSONString, projectPathFromPanel) {
    $.writeln("\nExtendScript: processMasterPlanInPremiere --- START ---");
    $.writeln("ExtendScript: IS_TEST_MODE: " + IS_TEST_MODE);
    $.writeln("ExtendScript: Expected project path from panel: " + projectPathFromPanel);

    var importedVideosMap = {}; // To store mapping of video filenames to ProjectItems
    var importedSlidesMap = {}; // To store mapping of slide filenames to ProjectItems

    try {
        // --- Basic Setup and Validation ---
        if (!app) { return "Error: Host 'app' object is null/undefined in ExtendScript."; }
        if (!app.project) { return "Error: No project currently open in Premiere Pro (app.project is null)."; }
        if (!app.project.path) { return "Error: Current Premiere Pro project path is null/undefined."; }
        $.writeln("ExtendScript: Active project: " + app.project.name + " at " + app.project.path);

        // Normalize paths for comparison (forward slashes)
        var currentProjectPathNormalized = app.project.path.toString().replace(/\\/g, '/');
        var targetProjectPathNormalized = projectPathFromPanel.replace(/\\/g, '/');

        // Ensure the currently active project in Premiere Pro matches the one expected by the panel.
        if (currentProjectPathNormalized !== targetProjectPathNormalized) {
            return "Error: Active PPro project ('" + app.project.name + "') path '" + currentProjectPathNormalized + "' doesn't match expected path '" + targetProjectPathNormalized + "'. Please ensure the correct project is active.";
        }
        $.writeln("ExtendScript: Correct project is active: " + app.project.name);

        if (!app.project.rootItem) { return "Error: Project rootItem not accessible for: " + app.project.name; }
        $.writeln("ExtendScript: Project root item accessed: " + app.project.rootItem.name);

        // Parse the Master Plan JSON string.
        var masterPlan;
        if (typeof JSON === 'undefined' || typeof JSON.parse !== 'function') {
             $.writeln("ExtendScript: Warning - Native JSON object not fully available. Relying on json2.js.");
             // json2.js should have defined JSON.parse if it was included correctly.
        }
        try {
            masterPlan = JSON.parse(masterPlanJSONString);
        } catch (jsonError) {
            return "Error: Parsing Master Plan JSON failed in ExtendScript: " + jsonError.toString();
        }

        // Validate essential parts of the Master Plan.
        if (!masterPlan || !masterPlan.sections || !masterPlan.baseVideoPath || !masterPlan.baseSlidePath) {
            return "Error: Invalid Master Plan structure (missing sections, baseVideoPath, or baseSlidePath).";
        }
        $.writeln("ExtendScript: Master Plan parsed. Course: '" + masterPlan.courseTitle + "'. Sections count: " + masterPlan.sections.length);

        var projectRoot = app.project.rootItem;

        // --- Create/Get Main Bins for Organizing Imported Media and Sequences ---
        var courseBinName = "COURSE - " + masterPlan.courseTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
        var courseBin = findBinByName(projectRoot, courseBinName) || projectRoot.createBin(courseBinName);
        if (!courseBin) { return "Error: Failed to create/find main course bin: " + courseBinName; }
        $.writeln("ExtendScript: Using main course bin: " + courseBin.name);

        var videosBinName = "_01_RAW_VIDEOS_IMPORTED"; // Bin for imported video files
        var videosBin = findBinByName(courseBin, videosBinName) || courseBin.createBin(videosBinName);
        if (!videosBin) { return "Error: Failed to create/find videos import bin: " + videosBinName; }
        $.writeln("ExtendScript: Using videos import bin: " + videosBin.name);

        var slidesBinName = "_02_SLIDES_IMPORTED"; // Bin for imported slide files
        var slidesBin = findBinByName(courseBin, slidesBinName) || courseBin.createBin(slidesBinName);
        if (!slidesBin) { return "Error: Failed to create/find slides import bin: " + slidesBinName; }
        $.writeln("ExtendScript: Using slides import bin: " + slidesBin.name);

        // --- Phase 1: Import Media (Videos and Slides) ---
        $.writeln("ExtendScript: --- Starting Media Import Phase ---");
        var videoFileRegex = /\.(mp4|mov|avi|mkv|flv|wmv|mpg|mpeg|m4v)$/i; // Common video extensions
        var slideFileRegex = /\.(tif|tiff|png|jpg|jpeg|psd|ai)$/i;       // Common slide/image extensions

        var requiredVideoNamesForImport = null; // For test mode: specific list of videos
        var requiredSlideNamesForImport = null; // For test mode: specific list of slides

        // If in test mode, collect only the specific files needed for the test subset.
        if (IS_TEST_MODE) {
            $.writeln("ExtendScript: TEST MODE - Collecting specific files to import for limited processing.");
            requiredVideoNamesForImport = [];
            requiredSlideNamesForImport = [];
            var tempVideoNames = {}; // Use object keys for unique names
            var tempSlideNames = {};

            var sectionsToScan = masterPlan.sections.slice(0, 1); // Process only the first section in test mode
            for (var ts = 0; ts < sectionsToScan.length; ts++) {
                var testSectionData = sectionsToScan[ts];
                if (testSectionData.sectionIntroSlide) {
                    tempSlideNames[testSectionData.sectionIntroSlide] = true;
                }
                var lessonsToScan = testSectionData.lessons.slice(0, 1); // Process only the first lesson in test mode
                for (var tl = 0; tl < lessonsToScan.length; tl++) {
                    var testLessonData = lessonsToScan[tl];
                    if (testLessonData.matchedVideoFile) {
                        tempVideoNames[testLessonData.matchedVideoFile] = true;
                    }
                    if (testLessonData.blankSlide1) tempSlideNames[testLessonData.blankSlide1] = true;
                    if (testLessonData.blankSlide2) tempSlideNames[testLessonData.blankSlide2] = true;
                    if (testLessonData.lessonIntroSlide) tempSlideNames[testLessonData.lessonIntroSlide] = true;
                    if (testLessonData.lessonOutroSlide) tempSlideNames[testLessonData.lessonOutroSlide] = true;
                }
            }
            // Convert unique names from object keys to arrays
            for (var vName in tempVideoNames) { if (Object.prototype.hasOwnProperty.call(tempVideoNames, vName)) requiredVideoNamesForImport.push(vName); }
            for (var sName in tempSlideNames) { if (Object.prototype.hasOwnProperty.call(tempSlideNames, sName)) requiredSlideNamesForImport.push(sName); }

            $.writeln("ExtendScript: TEST MODE - Required videos for import: " + (requiredVideoNamesForImport.length > 0 ? requiredVideoNamesForImport.join(", ") : "None"));
            $.writeln("ExtendScript: TEST MODE - Required slides for import: " + (requiredSlideNamesForImport.length > 0 ? requiredSlideNamesForImport.join(", ") : "None"));
        }

        // Import videos
        importedVideosMap = importFilesToBin(masterPlan.baseVideoPath, videosBin, "Videos", videoFileRegex, requiredVideoNamesForImport);
        if (!importedVideosMap) { return "Error: Video import process failed critically. Check paths and permissions."; }
        $.writeln("ExtendScript: Video import process complete. " + getObjectPropertyCount(importedVideosMap) + " videos mapped to ProjectItems.");

        // Import slides
        importedSlidesMap = importFilesToBin(masterPlan.baseSlidePath, slidesBin, "Slides", slideFileRegex, requiredSlideNamesForImport);
        if (!importedSlidesMap) { return "Error: Slide import process failed critically. Check paths and permissions."; }
        $.writeln("ExtendScript: Slide import process complete. " + getObjectPropertyCount(importedSlidesMap) + " slides mapped to ProjectItems.");
        $.writeln("ExtendScript: --- Media Import Phase Finished ---");


        // --- Phase 2: Create Sequences and Add Media ---
        $.writeln("ExtendScript: --- Starting Sequence Creation & Population Phase ---");
        var labelColors = [0, 2, 4, 6, 1, 3, 5, 7]; // Array of label color indices for bins/sequences
        var sequencesCreatedCount = 0;

        var sectionsToProcess = IS_TEST_MODE ? masterPlan.sections.slice(0, 1) : masterPlan.sections;
        if (IS_TEST_MODE) $.writeln("ExtendScript: TEST MODE - Will process up to 1 section for sequence creation.");

        for (var s = 0; s < sectionsToProcess.length; s++) {
            var sectionData = sectionsToProcess[s];
            // Create a sanitized bin name for the section.
            var sectionBinName = "S" + padNumberStart(sectionData.sectionIndex + 1, 2) + " - " + sectionData.udemySectionTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
            $.writeln("ExtendScript: Processing Section " + (sectionData.sectionIndex + 1) + ": " + sectionData.udemySectionTitle + " (Target Bin: " + sectionBinName + ")");

            var sectionBin = findBinByName(courseBin, sectionBinName) || courseBin.createBin(sectionBinName);
            if (!sectionBin) {
                $.writeln("Error: Failed to create/find section bin: " + sectionBinName + ". Skipping this section.");
                continue; // Skip to next section if bin creation fails
            }
            $.writeln("ExtendScript: Using section bin: " + sectionBin.name);
            // Optionally set a color label for the section bin for visual organization.
            if (typeof sectionBin.setColorLabel === 'function') {
                sectionBin.setColorLabel(labelColors[sectionData.sectionIndex % labelColors.length]);
            }

            var firstVideoLessonInSectionProcessed = false; // Flag to handle blank slides and section intro for the first video lesson.

            var lessonsToProcess = IS_TEST_MODE ? sectionData.lessons.slice(0, 1) : sectionData.lessons;
            if (IS_TEST_MODE && sectionData.lessons.length > 0) $.writeln("ExtendScript: TEST MODE - Will process up to 1 lesson for sequence creation in section: " + sectionData.udemySectionTitle);

            for (var l = 0; l < lessonsToProcess.length; l++) {
                var lessonData = lessonsToProcess[l];

                if (!lessonData.matchedVideoFile) {
                    $.writeln("ExtendScript: Lesson '" + lessonData.lessonTitle + "' has no matched video file. Skipping sequence creation for this lesson.");
                    continue; // Skip if no video is matched for this lesson.
                }

                // Create a sanitized sequence name for the lesson.
                // Uses lessonIndexInSection from MasterJSON (which is 1-based for matched lessons in a section's output).
                var sequenceName = "L" + padNumberStart(lessonData.lessonIndexInSection, 2) + " - " + lessonData.lessonTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
                $.writeln("ExtendScript: Preparing sequence: '" + sequenceName + "' for bin: '" + sectionBin.name + "'");

                // Check if sequence already exists to avoid duplication.
                if (findSequenceInBin(sectionBin, sequenceName)){
                    $.writeln("ExtendScript: Sequence '" + sequenceName + "' already exists in bin '" + sectionBin.name + "'. Skipping creation.");
                    continue;
                }

                var clipsForSequence = []; // Array to hold ProjectItem objects for this sequence.

                // Add initial slides (blanks, section intro) only for the first video lesson in this section.
                if (!firstVideoLessonInSectionProcessed) {
                    if (lessonData.blankSlide1) {
                        var blankSlide1Item = findItemInBinByName(lessonData.blankSlide1, slidesBin, "Blank Slide 1") || (importedSlidesMap ? importedSlidesMap[lessonData.blankSlide1] : null);
                        if (blankSlide1Item && (blankSlide1Item.type === PPRO_FILE_TYPE || blankSlide1Item.type === PPRO_CLIP_TYPE)) {
                            clipsForSequence.push(blankSlide1Item);
                        } else { $.writeln("Warning: Blank Slide 1 '" + lessonData.blankSlide1 + "' not found or invalid for first video lesson."); }
                    }
                    if (lessonData.blankSlide2) {
                        var blankSlide2Item = findItemInBinByName(lessonData.blankSlide2, slidesBin, "Blank Slide 2") || (importedSlidesMap ? importedSlidesMap[lessonData.blankSlide2] : null);
                        if (blankSlide2Item && (blankSlide2Item.type === PPRO_FILE_TYPE || blankSlide2Item.type === PPRO_CLIP_TYPE)) {
                            clipsForSequence.push(blankSlide2Item);
                        } else { $.writeln("Warning: Blank Slide 2 '" + lessonData.blankSlide2 + "' not found or invalid for first video lesson."); }
                    }

                    if (sectionData.sectionIntroSlide) {
                        var sectionIntroSlideItem = findItemInBinByName(sectionData.sectionIntroSlide, slidesBin, "Section Intro Slide") || (importedSlidesMap ? importedSlidesMap[sectionData.sectionIntroSlide] : null);
                        if (sectionIntroSlideItem && (sectionIntroSlideItem.type === PPRO_FILE_TYPE || sectionIntroSlideItem.type === PPRO_CLIP_TYPE)) {
                            clipsForSequence.push(sectionIntroSlideItem);
                        } else { $.writeln("Warning: Section Intro Slide '" + sectionData.sectionIntroSlide + "' not found or invalid for sequence."); }
                    }
                    firstVideoLessonInSectionProcessed = true; // Mark that initial slides for the section have been handled.
                }

                // Add lesson-specific intro slide.
                if (lessonData.lessonIntroSlide) {
                    var lessonIntroSlideItem = findItemInBinByName(lessonData.lessonIntroSlide, slidesBin, "Lesson Intro Slide") || (importedSlidesMap ? importedSlidesMap[lessonData.lessonIntroSlide] : null);
                    if (lessonIntroSlideItem && (lessonIntroSlideItem.type === PPRO_FILE_TYPE || lessonIntroSlideItem.type === PPRO_CLIP_TYPE)) {
                        clipsForSequence.push(lessonIntroSlideItem);
                    } else { $.writeln("Warning: Lesson Intro Slide '" + lessonData.lessonIntroSlide + "' not found or invalid."); }
                }

                // Add the main matched video file.
                var videoItem = findItemInBinByName(lessonData.matchedVideoFile, videosBin, "Matched Video") || (importedVideosMap ? importedVideosMap[lessonData.matchedVideoFile] : null);
                if (videoItem && (videoItem.type === PPRO_FILE_TYPE || videoItem.type === PPRO_CLIP_TYPE) ) {
                    clipsForSequence.push(videoItem);
                } else {
                    var videoItemDetails = "not found or invalid type.";
                    if(videoItem) videoItemDetails = "Name: " + videoItem.name + ", Type: " + videoItem.type;
                    $.writeln("Error: Matched video file '" + lessonData.matchedVideoFile + "' ("+ videoItemDetails +") not suitable for sequence '" + lessonData.lessonTitle + "'. This video will be SKIPPED for this sequence.");
                }

                // Add lesson-specific outro slide.
                if (lessonData.lessonOutroSlide) {
                    var lessonOutroSlideItem = findItemInBinByName(lessonData.lessonOutroSlide, slidesBin, "Lesson Outro Slide") || (importedSlidesMap ? importedSlidesMap[lessonData.lessonOutroSlide] : null);
                    if (lessonOutroSlideItem && (lessonOutroSlideItem.type === PPRO_FILE_TYPE || lessonOutroSlideItem.type === PPRO_CLIP_TYPE)) {
                        clipsForSequence.push(lessonOutroSlideItem);
                    } else { $.writeln("Warning: Lesson Outro Slide '" + lessonData.lessonOutroSlide + "' not found or invalid."); }
                }

                // Create the sequence from the collected clips if any valid clips were found.
                if (clipsForSequence.length > 0) {
                    if (typeof app.project.createNewSequenceFromClips !== 'function') {
                        $.writeln("Error: app.project.createNewSequenceFromClips is not available in this Premiere Pro version. Cannot create sequence.");
                        continue; // Skip to next lesson
                    }
                    $.writeln("ExtendScript: Attempting to create sequence '" + sequenceName + "' with " + clipsForSequence.length + " clips.");
                    var newSequence = app.project.createNewSequenceFromClips(sequenceName, clipsForSequence, sectionBin);

                    if (newSequence) {
                        $.writeln("ExtendScript: Successfully created sequence '" + newSequence.name + "' from clips in bin '" + sectionBin.name + "'.");
                        sequencesCreatedCount++;
                         // Optionally, set a label color for the sequence as well
                        if (newSequence.projectItem && typeof newSequence.projectItem.setColorLabel === 'function') {
                            newSequence.projectItem.setColorLabel(labelColors[(s + l) % labelColors.length]); // Vary color
                        }
                    } else {
                        $.writeln("Error: Failed to create sequence '" + sequenceName + "' from clips. The method returned null or undefined. Possible issue with clip types or an internal PPro error.");
                    }
                } else {
                    $.writeln("ExtendScript: No valid clips collected for lesson '" + lessonData.lessonTitle + "'. Skipping sequence creation.");
                }
            } // End of lessons loop
        } // End of sections loop

        return "Success: Processing finished. " +
               getObjectPropertyCount(importedVideosMap) + " videos mapped, " +
               getObjectPropertyCount(importedSlidesMap) + " slides mapped. " +
               sequencesCreatedCount + " sequences created using createNewSequenceFromClips.";

    } catch (e) {
        // Catch any unexpected errors during the entire process.
        return "Error: EXCEPTION in processMasterPlanInPremiere: " + e.toString() + " (Line: " + e.line + ") Stack: " + $.stack;
    } finally {
        $.writeln("ExtendScript: processMasterPlanInPremiere --- END ---");
    }
}

