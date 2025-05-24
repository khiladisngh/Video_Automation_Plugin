/**
 * @file host/premiere.jsx
 * @description ExtendScript for Adobe Premiere Pro to automate video project setup.
 * This script handles:
 * - Creating course-specific directory structures and Premiere Pro projects.
 * - Importing media (videos and slides) into organized bins.
 * - Creating sequences for lessons based on a Master Plan JSON.
 * - Populating sequences with appropriate media clips and applying transitions.
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
 */
var PPRO_BIN_TYPE = 2; // ProjectItemType.BIN

/**
 * @const {number} PPRO_FILE_TYPE
 * @description Premiere Pro ProjectItemType constant for imported files (master clips/media files).
 */
var PPRO_FILE_TYPE = 1; // ProjectItemType.FILE

/**
 * @const {number} PPRO_CLIP_TYPE
 * @description Premiere Pro ProjectItemType constant for clips (can also refer to master clips).
 */
var PPRO_CLIP_TYPE = 0; // ProjectItemType.CLIP


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
            var seqProjectItem = seq.projectItem;
            if (seqProjectItem && typeof seqProjectItem.getBin === 'function') {
                var parentBin = seqProjectItem.getBin();
                 if (parentBin && typeof parentBin.nodeId !== 'undefined' && parentBin.nodeId === targetBin.nodeId) {
                    return seq;
                }
            } else if (seqProjectItem && seqProjectItem.treePath) {
                var expectedPathPart = "/" + targetBin.name + "/" + sequenceName;
                if (seqProjectItem.treePath.indexOf(expectedPathPart) > -1) {
                    $.writeln("ExtendScript: findSequenceInBin - Warning: Used treePath for sequence '" + sequenceName + "'. NodeID preferred.");
                    return seq;
                }
            }
             else {
                 $.writeln("ExtendScript: findSequenceInBin - Sequence '" + sequenceName + "' projectItem or getBin method is problematic.");
            }
        }
    }
    return null;
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
        return null;
    }

    var filesToImportPaths = [];
    var filesInFolder = sourceFolder.getFiles();

    for (var i = 0; i < filesInFolder.length; i++) {
        var file = filesInFolder[i];
        if (file instanceof File) {
            var shouldConsiderThisFile = false;
            if (specificFileNamesToImport && specificFileNamesToImport.length > 0) {
                for (var j = 0; j < specificFileNamesToImport.length; j++) {
                    if (file.name === specificFileNamesToImport[j]) {
                        shouldConsiderThisFile = true;
                        break;
                    }
                }
            } else {
                shouldConsiderThisFile = true;
            }

            if (shouldConsiderThisFile) {
                if (fileFilterRegex) {
                    if (fileFilterRegex.test(file.name)) {
                        filesToImportPaths.push(file.fsName);
                    } else if (specificFileNamesToImport && specificFileNamesToImport.length > 0 && shouldConsiderThisFile) {
                        $.writeln("ExtendScript: Warning - File '" + file.name + "' was in specific list but does not match type regex. It will NOT be imported.");
                    }
                } else {
                    filesToImportPaths.push(file.fsName);
                }
            }
        }
    }

    if (filesToImportPaths.length === 0) {
        $.writeln("ExtendScript: No " + fileTypeDescription + " found or matched to import in " + sourceFolderPath);
        return {};
    }

    $.writeln("ExtendScript: Attempting to import " + filesToImportPaths.length + " " + fileTypeDescription + " files: " + filesToImportPaths.join(", "));
    var importSuccess = app.project.importFiles(filesToImportPaths, true, targetBin, false);
    $.sleep(1500);

    var importedFileMap = {};
    var currentBinItems = targetBin.children;
    for (var k = 0; k < currentBinItems.numItems; k++) {
        var item = currentBinItems[k];
        var importedFileNameInPremiere = item.name;
        var wasInImportList = false;
        var originalFileNameFromPathForMapKey = "";
        for (var l = 0; l < filesToImportPaths.length; l++) {
            var originalPath = filesToImportPaths[l].replace(/\\/g, '/');
            var pathParts = originalPath.split('/');
            var originalFileNameFromPath = pathParts[pathParts.length -1];
            if (importedFileNameInPremiere === originalFileNameFromPath) {
                wasInImportList = true;
                originalFileNameFromPathForMapKey = originalFileNameFromPath;
                break;
            }
        }
        if(wasInImportList){
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
    if (!itemName || itemName === "") {
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
            return item;
        }
    }
    return null;
}


/**
 * Sets up the course project directory structure on disk and creates/opens the Premiere Pro project file.
 * @param {string} courseSpecificPath The base path for this specific course.
 * @param {string} courseName The name of the course.
 * @returns {string} A status message indicating success or failure.
 */
function setupCourseProjectAndDirectories(courseSpecificPath, courseName) {
    $.writeln("ExtendScript: setupCourseProjectAndDirectories --- START ---");
    $.writeln("ExtendScript: Args - courseSpecificPath: " + courseSpecificPath + ", courseName: " + courseName);
    try {
        if (!app || typeof app.openDocument !== 'function' || typeof app.newProject !== 'function') {
            return "Error: Host 'app' object or critical methods (openDocument/newProject) not available in ExtendScript.";
        }
        if (!courseSpecificPath || courseSpecificPath === "" || !courseName || courseName === "") {
            return "Error: courseSpecificPath or courseName is missing or empty.";
        }

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

        var projectsFolder = new Folder(courseSpecificPath + "/_04_PREMIERE_PROJECTS");
        var projectFileName = safeCourseName + ".prproj";
        var projectFilePath = projectsFolder.fsName.replace(/\\/g, '/') + "/" + projectFileName;
        $.writeln("ExtendScript: Target project file path: " + projectFilePath);

        var projectFile = new File(projectFilePath);
        var messagePrefix = "";
        var currentProjPathStr = (app.project && app.project.path) ? app.project.path.toString().replace(/\\/g, '/') : null;

        if (currentProjPathStr === projectFilePath) {
            $.writeln("ExtendScript: Target project '" + projectFileName + "' is already active.");
            messagePrefix = "Success: Project '" + projectFileName + "' is already active. Folders verified.";
        } else if (projectFile.exists) {
            $.writeln("ExtendScript: Target project file exists. Opening: " + projectFilePath);
            app.openDocument(projectFilePath);
            $.sleep(3000);
            if (app.project && app.project.path && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                messagePrefix = "Success: Existing project '" + projectFileName + "' opened.";
            } else {
                var activeProjectName = (app.project && app.project.name) ? app.project.name : "None";
                messagePrefix = "Error: Failed to open or confirm opening of project '" + projectFileName + "'. Current active project: " + activeProjectName;
            }
        } else {
            $.writeln("ExtendScript: Target project does not exist. Creating new: " + projectFilePath);
            app.newProject(projectFilePath);
            $.sleep(2000);
            if (app.project && app.project.path && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                messagePrefix = "Success: New project '" + projectFileName + "' created and opened.";
            } else {
                messagePrefix = "Error: Failed to create or confirm creation of new project '" + projectFileName + "'.";
            }
        }
        $.writeln("ExtendScript: " + messagePrefix);
        return messagePrefix;
    } catch (e) {
        return "Error: Exception in setupCourseProjectAndDirectories: " + e.toString() + " (Line: " + e.line + ")";
    } finally {
        $.writeln("ExtendScript: setupCourseProjectAndDirectories --- END ---");
    }
}


/**
 * Searches for a transition preset ProjectItem by name, recursively within bins.
 * IMPORTANT: This assumes the transition (e.g., "Dip to Black") has been saved as a preset
 * AND that preset has been imported or dragged into a project bin, making it a ProjectItem.
 * ExtendScript cannot typically apply built-in effects/transitions directly by name
 * from the Effects Panel without them being ProjectItems.
 *
 * @param {string} presetName The name of the transition preset to find.
 * @param {ProjectItem} currentBin The current bin to search within.
 * @returns {ProjectItem|null} The found transition preset ProjectItem, or null.
 */
function findTransitionPresetByNameRecursive(presetName, currentBin) {
    if (!currentBin || currentBin.type !== PPRO_BIN_TYPE || !currentBin.children) {
        return null;
    }
    for (var i = 0; i < currentBin.children.numItems; i++) {
        var item = currentBin.children[i];
        // Check name and if it's a file (presets are often treated as files).
        // A more robust check would be item.isTransitionPreset() if such a property existed,
        // or checking the file extension if it's an imported .prfpset file.
        // For now, relying on name and that it's not a Bin, Sequence, or common media type.
        if (item.name === presetName) {
            // Further heuristics could be added here if 'item.type' or other properties
            // can reliably identify it as a usable transition preset.
            // For now, if name matches and it's a file-like item, assume it's the preset.
             if (item.type === PPRO_FILE_TYPE || item.type === PPRO_CLIP_TYPE) { // Presets might appear as FILE or CLIP type
                $.writeln("ExtendScript: Found potential transition preset by name: '" + presetName + "' in bin '" + currentBin.name + "'");
                return item;
            }
        }
        // Recursively search in sub-bins
        if (item.type === PPRO_BIN_TYPE) {
            var foundInSubBin = findTransitionPresetByNameRecursive(presetName, item);
            if (foundInSubBin) {
                return foundInSubBin;
            }
        }
    }
    return null;
}


/**
 * Applies specified transitions to a sequence.
 * @param {Sequence} sequence The Premiere Pro Sequence object.
 * @param {ProjectItem|null} dipToBlackPreset The ProjectItem for "Dip to Black" transition.
 * @param {ProjectItem|null} irisRoundPreset The ProjectItem for "Iris Round" transition.
 */
function addTransitionsToSequence(sequence, dipToBlackPreset, irisRoundPreset) {
    $.writeln("ExtendScript: addTransitionsToSequence - Adding transitions to sequence: " + sequence.name);
    if (!sequence || !sequence.videoTracks || sequence.videoTracks.numTracks === 0) {
        $.writeln("ExtendScript: addTransitionsToSequence - Sequence is invalid or has no video tracks. Skipping transitions.");
        return;
    }

    var videoTrack = sequence.videoTracks[0]; // Assuming transitions on the first video track
    if (videoTrack.clips.numItems === 0) {
        $.writeln("ExtendScript: addTransitionsToSequence - No clips on video track 0 for sequence '" + sequence.name + "'. Skipping transitions.");
        return;
    }

    var transitionDurationInSeconds = 1.0; // 1 second for all transitions as per request

    // --- Apply Transitions ---
    for (var i = 0; i < videoTrack.clips.numItems; i++) {
        var currentClip = videoTrack.clips[i]; // This is a TrackItem
        if (!currentClip || !currentClip.transitions) {
            $.writeln("ExtendScript: addTransitionsToSequence - Clip at index " + i + " is invalid or has no transitions property. Skipping.");
            continue;
        }

        // 1. "Dip to Black 1 sec" at the start of the sequence (on the first clip's IN point)
        if (i === 0 && dipToBlackPreset) {
            try {
                // Alignment for transition at the start of a clip: 1 (STARTOUT_ON_INCOMING_CLIP might work, or specific "head" alignment if API differs)
                // Let's try alignment 1 (StartAtCut, which applies to the head of the clip)
                var startTransition = currentClip.transitions.add(dipToBlackPreset, 1); // Alignment 1 for start of clip
                if (startTransition && startTransition.duration) {
                    startTransition.duration.seconds = transitionDurationInSeconds;
                    $.writeln("ExtendScript: Applied 'Dip to Black' (1s) at start of sequence '" + sequence.name + "' on clip '" + currentClip.name + "'");
                } else {
                     $.writeln("ExtendScript: WARNING - Could not apply 'Dip to Black' at start or set its duration for sequence '" + sequence.name + "'. Transition object: " + startTransition);
                }
            } catch (e_startTrans) {
                $.writeln("ExtendScript: ERROR applying 'Dip to Black' at start of sequence '" + sequence.name + "': " + e_startTrans.toString());
            }
        }

        // 2. "Iris Round 1 sec" between current clip and the NEXT clip
        if (i < videoTrack.clips.numItems - 1 && irisRoundPreset) {
            // This transition is applied to the OUT point of `currentClip` (or centered on the cut).
            try {
                // Alignment 0 (CENTER_ON_CUT) is typical for transitions between two clips.
                var interClipTransition = currentClip.transitions.add(irisRoundPreset, 0); // Alignment 0 for center on cut
                if (interClipTransition && interClipTransition.duration) {
                    interClipTransition.duration.seconds = transitionDurationInSeconds;
                    $.writeln("ExtendScript: Applied 'Iris Round' (1s) after clip '" + currentClip.name + "' in sequence '" + sequence.name + "'");
                } else {
                    $.writeln("ExtendScript: WARNING - Could not apply 'Iris Round' or set its duration between clips in sequence '" + sequence.name + "'. Transition object: " + interClipTransition);
                }
            } catch (e_interTrans) {
                $.writeln("ExtendScript: ERROR applying 'Iris Round' between clips in sequence '" + sequence.name + "': " + e_interTrans.toString());
            }
        }

        // 3. "Dip to Black 1 sec" at the end of the sequence (on the last clip's OUT point)
        if (i === videoTrack.clips.numItems - 1 && dipToBlackPreset) {
            try {
                // Alignment for transition at the end of a clip: 2 (ENDIN_ON_OUTGOING_CLIP / EndAtCut)
                var endTransition = currentClip.transitions.add(dipToBlackPreset, 2); // Alignment 2 for end of clip
                if (endTransition && endTransition.duration) {
                    endTransition.duration.seconds = transitionDurationInSeconds;
                     $.writeln("ExtendScript: Applied 'Dip to Black' (1s) at end of sequence '" + sequence.name + "' on clip '" + currentClip.name + "'");
                } else {
                    $.writeln("ExtendScript: WARNING - Could not apply 'Dip to Black' at end or set its duration for sequence '" + sequence.name + "'. Transition object: " + endTransition);
                }
            } catch (e_endTrans) {
                $.writeln("ExtendScript: ERROR applying 'Dip to Black' at end of sequence '" + sequence.name + "': " + e_endTrans.toString());
            }
        }
    }
     $.writeln("ExtendScript: addTransitionsToSequence - Finished attempting to add transitions for sequence: " + sequence.name);
}


/**
 * Main processing function called by the panel to automate Premiere Pro tasks based on the Master Plan.
 * @param {string} masterPlanJSONString A stringified JSON object representing the Master Plan.
 * @param {string} projectPathFromPanel The expected path of the active Premiere Pro project.
 * @returns {string} A status message indicating the overall success or failure of the processing.
 */
function processMasterPlanInPremiere(masterPlanJSONString, projectPathFromPanel) {
    $.writeln("\nExtendScript: processMasterPlanInPremiere --- START ---");
    $.writeln("ExtendScript: IS_TEST_MODE: " + IS_TEST_MODE);
    $.writeln("ExtendScript: Expected project path from panel: " + projectPathFromPanel);

    var importedVideosMap = {};
    var importedSlidesMap = {};

    try {
        if (!app) { return "Error: Host 'app' object is null/undefined in ExtendScript."; }
        if (!app.project) { return "Error: No project currently open in Premiere Pro (app.project is null)."; }
        if (!app.project.path) { return "Error: Current Premiere Pro project path is null/undefined."; }
        $.writeln("ExtendScript: Active project: " + app.project.name + " at " + app.project.path);

        var currentProjectPathNormalized = app.project.path.toString().replace(/\\/g, '/');
        var targetProjectPathNormalized = projectPathFromPanel.replace(/\\/g, '/');

        if (currentProjectPathNormalized !== targetProjectPathNormalized) {
            return "Error: Active PPro project ('" + app.project.name + "') path '" + currentProjectPathNormalized + "' doesn't match expected path '" + targetProjectPathNormalized + "'. Please ensure the correct project is active.";
        }
        $.writeln("ExtendScript: Correct project is active: " + app.project.name);

        if (!app.project.rootItem) { return "Error: Project rootItem not accessible for: " + app.project.name; }
        $.writeln("ExtendScript: Project root item accessed: " + app.project.rootItem.name);

        var masterPlan;
        if (typeof JSON === 'undefined' || typeof JSON.parse !== 'function') {
             $.writeln("ExtendScript: Warning - Native JSON object not fully available. Relying on json2.js.");
        }
        try {
            masterPlan = JSON.parse(masterPlanJSONString);
        } catch (jsonError) {
            return "Error: Parsing Master Plan JSON failed in ExtendScript: " + jsonError.toString();
        }

        if (!masterPlan || !masterPlan.sections || !masterPlan.baseVideoPath || !masterPlan.baseSlidePath) {
            return "Error: Invalid Master Plan structure (missing sections, baseVideoPath, or baseSlidePath).";
        }
        $.writeln("ExtendScript: Master Plan parsed. Course: '" + masterPlan.courseTitle + "'. Sections count: " + masterPlan.sections.length);

        var projectRoot = app.project.rootItem;

        var courseBinName = "COURSE - " + masterPlan.courseTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
        var courseBin = findBinByName(projectRoot, courseBinName) || projectRoot.createBin(courseBinName);
        if (!courseBin) { return "Error: Failed to create/find main course bin: " + courseBinName; }
        $.writeln("ExtendScript: Using main course bin: " + courseBin.name);

        var videosBinName = "_01_RAW_VIDEOS_IMPORTED";
        var videosBin = findBinByName(courseBin, videosBinName) || courseBin.createBin(videosBinName);
        if (!videosBin) { return "Error: Failed to create/find videos import bin: " + videosBinName; }
        $.writeln("ExtendScript: Using videos import bin: " + videosBin.name);

        var slidesBinName = "_02_SLIDES_IMPORTED";
        var slidesBin = findBinByName(courseBin, slidesBinName) || courseBin.createBin(slidesBinName);
        if (!slidesBin) { return "Error: Failed to create/find slides import bin: " + slidesBinName; }
        $.writeln("ExtendScript: Using slides import bin: " + slidesBin.name);

        // --- Pre-find Transition Presets ---
        $.writeln("ExtendScript: Attempting to find transition presets ('Dip to Black', 'Iris Round') in the project...");
        var dipToBlackPreset = findTransitionPresetByNameRecursive("Dip to Black", projectRoot);
        var irisRoundPreset = findTransitionPresetByNameRecursive("Iris Round", projectRoot);

        if (!dipToBlackPreset) {
            $.writeln("ExtendScript: WARNING - 'Dip to Black' transition preset NOT FOUND in project bins. Start/end transitions will be skipped. Ensure it's imported or saved as a preset in a project bin.");
        } else {
            $.writeln("ExtendScript: Found 'Dip to Black' transition preset: " + dipToBlackPreset.name);
        }
        if (!irisRoundPreset) {
            $.writeln("ExtendScript: WARNING - 'Iris Round' transition preset NOT FOUND in project bins. Inter-clip transitions will be skipped. Ensure it's imported or saved as a preset in a project bin.");
        } else {
            $.writeln("ExtendScript: Found 'Iris Round' transition preset: " + irisRoundPreset.name);
        }


        $.writeln("ExtendScript: --- Starting Media Import Phase ---");
        var videoFileRegex = /\.(mp4|mov|avi|mkv|flv|wmv|mpg|mpeg|m4v)$/i;
        var slideFileRegex = /\.(tif|tiff|png|jpg|jpeg|psd|ai)$/i;
        var requiredVideoNamesForImport = null;
        var requiredSlideNamesForImport = null;

        if (IS_TEST_MODE) {
            $.writeln("ExtendScript: TEST MODE - Collecting specific files to import for limited processing.");
            requiredVideoNamesForImport = [];
            requiredSlideNamesForImport = [];
            var tempVideoNames = {};
            var tempSlideNames = {};
            var sectionsToScan = masterPlan.sections.slice(0, 1);
            for (var ts = 0; ts < sectionsToScan.length; ts++) {
                var testSectionData = sectionsToScan[ts];
                if (testSectionData.sectionIntroSlide) { tempSlideNames[testSectionData.sectionIntroSlide] = true; }
                var lessonsToScan = testSectionData.lessons.slice(0, 1);
                for (var tl = 0; tl < lessonsToScan.length; tl++) {
                    var testLessonData = lessonsToScan[tl];
                    if (testLessonData.matchedVideoFile) { tempVideoNames[testLessonData.matchedVideoFile] = true; }
                    if (testLessonData.blankSlide1) tempSlideNames[testLessonData.blankSlide1] = true;
                    if (testLessonData.blankSlide2) tempSlideNames[testLessonData.blankSlide2] = true;
                    if (testLessonData.lessonIntroSlide) tempSlideNames[testLessonData.lessonIntroSlide] = true;
                    if (testLessonData.lessonOutroSlide) tempSlideNames[testLessonData.lessonOutroSlide] = true;
                }
            }
            for (var vName in tempVideoNames) { if (Object.prototype.hasOwnProperty.call(tempVideoNames, vName)) requiredVideoNamesForImport.push(vName); }
            for (var sName in tempSlideNames) { if (Object.prototype.hasOwnProperty.call(tempSlideNames, sName)) requiredSlideNamesForImport.push(sName); }
            $.writeln("ExtendScript: TEST MODE - Required videos: " + (requiredVideoNamesForImport.length > 0 ? requiredVideoNamesForImport.join(", ") : "None"));
            $.writeln("ExtendScript: TEST MODE - Required slides: " + (requiredSlideNamesForImport.length > 0 ? requiredSlideNamesForImport.join(", ") : "None"));
        }

        importedVideosMap = importFilesToBin(masterPlan.baseVideoPath, videosBin, "Videos", videoFileRegex, requiredVideoNamesForImport);
        if (!importedVideosMap) { return "Error: Video import process failed critically."; }
        $.writeln("ExtendScript: Video import mapping complete. Mapped items: " + getObjectPropertyCount(importedVideosMap));

        importedSlidesMap = importFilesToBin(masterPlan.baseSlidePath, slidesBin, "Slides", slideFileRegex, requiredSlideNamesForImport);
        if (!importedSlidesMap) { return "Error: Slide import process failed critically."; }
        $.writeln("ExtendScript: Slide import mapping complete. Mapped items: " + getObjectPropertyCount(importedSlidesMap));
        $.writeln("ExtendScript: --- Media Import Phase Finished ---");


        $.writeln("ExtendScript: --- Starting Sequence Creation & Population Phase ---");
        var labelColors = [0, 2, 4, 6, 1, 3, 5, 7];
        var sequencesCreatedCount = 0;
        var sectionsToProcess = IS_TEST_MODE ? masterPlan.sections.slice(0, 1) : masterPlan.sections;
        if (IS_TEST_MODE) $.writeln("ExtendScript: TEST MODE - Will process up to 1 section.");

        for (var s = 0; s < sectionsToProcess.length; s++) {
            var sectionData = sectionsToProcess[s];
            var sectionBinName = "S" + padNumberStart(sectionData.sectionIndex + 1, 2) + " - " + sectionData.udemySectionTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
            $.writeln("ExtendScript: Processing Section " + (sectionData.sectionIndex + 1) + ": " + sectionData.udemySectionTitle);

            var sectionBin = findBinByName(courseBin, sectionBinName) || courseBin.createBin(sectionBinName);
            if (!sectionBin) {
                $.writeln("Error: Failed to use section bin: " + sectionBinName + ". Skipping section.");
                continue;
            }
            if (typeof sectionBin.setColorLabel === 'function') {
                sectionBin.setColorLabel(labelColors[sectionData.sectionIndex % labelColors.length]);
            }

            var firstVideoLessonInSectionProcessed = false;
            var lessonsToProcess = IS_TEST_MODE ? sectionData.lessons.slice(0, 1) : sectionData.lessons;
            if (IS_TEST_MODE && sectionData.lessons.length > 0) $.writeln("ExtendScript: TEST MODE - Will process up to 1 lesson in section: " + sectionData.udemySectionTitle);

            for (var l = 0; l < lessonsToProcess.length; l++) {
                var lessonData = lessonsToProcess[l];
                if (!lessonData.matchedVideoFile) {
                    $.writeln("ExtendScript: Lesson '" + lessonData.lessonTitle + "' has no matched video. Skipping.");
                    continue;
                }

                var sequenceName = "L" + padNumberStart(lessonData.lessonIndexInSection, 2) + " - " + lessonData.lessonTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
                $.writeln("ExtendScript: Preparing sequence: '" + sequenceName + "' in bin: '" + sectionBin.name + "'");

                if (findSequenceInBin(sectionBin, sequenceName)){
                    $.writeln("ExtendScript: Sequence '" + sequenceName + "' already exists. Skipping creation.");
                    continue;
                }

                var clipsForSequence = [];
                if (!firstVideoLessonInSectionProcessed) {
                    if (lessonData.blankSlide1) {
                        var item = findItemInBinByName(lessonData.blankSlide1, slidesBin, "Blank Slide 1") || (importedSlidesMap ? importedSlidesMap[lessonData.blankSlide1] : null);
                        if (item) clipsForSequence.push(item); else $.writeln("Warning: Blank Slide 1 '" + lessonData.blankSlide1 + "' not found.");
                    }
                    if (lessonData.blankSlide2) {
                         var item = findItemInBinByName(lessonData.blankSlide2, slidesBin, "Blank Slide 2") || (importedSlidesMap ? importedSlidesMap[lessonData.blankSlide2] : null);
                        if (item) clipsForSequence.push(item); else $.writeln("Warning: Blank Slide 2 '" + lessonData.blankSlide2 + "' not found.");
                    }
                    if (sectionData.sectionIntroSlide) {
                        var item = findItemInBinByName(sectionData.sectionIntroSlide, slidesBin, "Section Intro Slide") || (importedSlidesMap ? importedSlidesMap[sectionData.sectionIntroSlide] : null);
                        if (item) clipsForSequence.push(item); else $.writeln("Warning: Section Intro '" + sectionData.sectionIntroSlide + "' not found.");
                    }
                    firstVideoLessonInSectionProcessed = true;
                }

                if (lessonData.lessonIntroSlide) {
                    var item = findItemInBinByName(lessonData.lessonIntroSlide, slidesBin, "Lesson Intro Slide") || (importedSlidesMap ? importedSlidesMap[lessonData.lessonIntroSlide] : null);
                    if (item) clipsForSequence.push(item); else $.writeln("Warning: Lesson Intro '" + lessonData.lessonIntroSlide + "' not found.");
                }

                var videoItem = findItemInBinByName(lessonData.matchedVideoFile, videosBin, "Matched Video") || (importedVideosMap ? importedVideosMap[lessonData.matchedVideoFile] : null);
                if (videoItem) {
                    clipsForSequence.push(videoItem);
                } else {
                    $.writeln("Error: Matched video '" + lessonData.matchedVideoFile + "' not found for sequence '" + lessonData.lessonTitle + "'. Video SKIPPED.");
                }

                if (lessonData.lessonOutroSlide) {
                    var item = findItemInBinByName(lessonData.lessonOutroSlide, slidesBin, "Lesson Outro Slide") || (importedSlidesMap ? importedSlidesMap[lessonData.lessonOutroSlide] : null);
                    if (item) clipsForSequence.push(item); else $.writeln("Warning: Lesson Outro '" + lessonData.lessonOutroSlide + "' not found.");
                }

                if (clipsForSequence.length > 0) {
                    if (typeof app.project.createNewSequenceFromClips !== 'function') {
                        $.writeln("Error: createNewSequenceFromClips not available. Cannot create sequence.");
                        continue;
                    }
                    $.writeln("ExtendScript: Creating sequence '" + sequenceName + "' with " + clipsForSequence.length + " clips.");
                    var newSequence = app.project.createNewSequenceFromClips(sequenceName, clipsForSequence, sectionBin);

                    if (newSequence) {
                        $.writeln("ExtendScript: Successfully created sequence '" + newSequence.name + "'.");
                        sequencesCreatedCount++;
                        if (newSequence.projectItem && typeof newSequence.projectItem.setColorLabel === 'function') {
                            newSequence.projectItem.setColorLabel(labelColors[(s + l) % labelColors.length]);
                        }
                        // --- Add Transitions to the new sequence ---
                        addTransitionsToSequence(newSequence, dipToBlackPreset, irisRoundPreset);
                        // --- End Add Transitions ---
                    } else {
                        $.writeln("Error: Failed to create sequence '" + sequenceName + "'.");
                    }
                } else {
                    $.writeln("ExtendScript: No valid clips for lesson '" + lessonData.lessonTitle + "'. Skipping sequence.");
                }
            }
        }

        return "Success: Processing finished. " +
               getObjectPropertyCount(importedVideosMap) + " videos mapped, " +
               getObjectPropertyCount(importedSlidesMap) + " slides mapped. " +
               sequencesCreatedCount + " sequences created and transitions attempted.";

    } catch (e) {
        return "Error: EXCEPTION in processMasterPlanInPremiere: " + e.toString() + " (Line: " + e.line + ") Stack: " + $.stack;
    } finally {
        $.writeln("ExtendScript: processMasterPlanInPremiere --- END ---");
    }
}
