#target premierepro

#include "json2.js"; // Ensure json2.js is in the same folder or provide correct relative path

// Test mode flag
var IS_TEST_MODE = true; // Set to false for full processing
var PPRO_BIN_TYPE = 2; // ProjectItemType.BIN
var PPRO_FILE_TYPE = 1; // ProjectItemType.FILE (for master clips/media files)
var PPRO_CLIP_TYPE = 0; // ProjectItemType.CLIP (master clips can also be this type)


/**
 * Polyfill for String.prototype.padStart (simplified for numbers)
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
 * Helper function to count properties in an object (ExtendScript compatible).
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
 * Helper function to find a bin by name within a parent bin.
 * @param {ProjectItem} parentBin The parent bin item (typically project.rootItem or another bin).
 * @param {string} name The name of the bin to find.
 * @returns {ProjectItem|null} The found bin item or null.
 */
function findBinByName(parentBin, name) {
    if (!parentBin || !parentBin.children) {
        $.writeln("ExtendScript: findBinByName - parentBin is invalid or has no children. Parent: " + (parentBin ? parentBin.name : "null"));
        return null;
    }
    for (var i = 0; i < parentBin.children.numItems; i++) {
        var child = parentBin.children[i];
        if (child && child.name === name && child.type === PPRO_BIN_TYPE) {
            return child;
        }
    }
    return null;
}

/**
 * Helper function to find a sequence by name within a specific bin.
 * @param {ProjectItem} targetBin The bin to search within.
 * @param {string} sequenceName The name of the sequence.
 * @returns {Sequence|null} The found sequence object or null.
 */
function findSequenceInBin(targetBin, sequenceName) {
    if (!app.project || !app.project.sequences || !targetBin || typeof targetBin.nodeId === 'undefined') {
        $.writeln("ExtendScript: findSequenceInBin - Invalid arguments. TargetBin: " + (targetBin ? targetBin.name : "null") + ", SeqName: " + sequenceName);
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
            } else {
                 $.writeln("ExtendScript: findSequenceInBin - Sequence '" + sequenceName + "' does not have a valid projectItem or getBin method.");
            }
        }
    }
    return null;
}

/**
 * Imports files from a given folder path into a specified target bin.
 * @param {string} sourceFolderPath The path to the folder to import files from.
 * @param {ProjectItem} targetBin The bin to import files into.
 * @param {string} fileTypeDescription For logging (e.g., "Videos", "Slides").
 * @param {RegExp} [fileFilterRegex] Optional regex to filter files by type (e.g., /\.(mp4|mov)$/i).
 * @param {Array} [specificFileNamesToImport] Optional array of specific file names to import. If provided, only these (matching regex) are imported.
 * @returns {object} An object mapping original file names to their new project item names (or null if import failed critically).
 */
function importFilesToBin(sourceFolderPath, targetBin, fileTypeDescription, fileFilterRegex, specificFileNamesToImport) {
    $.writeln("ExtendScript: importFilesToBin - Importing " + fileTypeDescription + " from: " + sourceFolderPath + " into bin: " + targetBin.name);
    if (specificFileNamesToImport && specificFileNamesToImport.length > 0) {
        $.writeln("ExtendScript: Specific files requested for import: " + specificFileNamesToImport.join(", "));
    }

    var sourceFolder = new Folder(sourceFolderPath);
    if (!sourceFolder.exists) {
        $.writeln("Error: Source folder for " + fileTypeDescription + " does not exist: " + sourceFolderPath);
        return null; // Critical error
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

    app.project.importFiles(filesToImportPaths, true, targetBin, false);
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
 * Finds a project item by its name within a specific bin.
 * @param {string} itemName The name of the item to find.
 * @param {ProjectItem} bin The bin to search within.
 * @param {string} [itemTypeDescription] Optional description for logging.
 * @returns {ProjectItem|null}
 */
function findItemInBinByName(itemName, bin, itemTypeDescription) {
    if (!itemName) { // Added check for null/empty itemName
        // $.writeln("ExtendScript: findItemInBinByName - itemName is null or empty. Cannot search.");
        return null;
    }
    if (!bin || !bin.children) {
        $.writeln("Error: Cannot find " + (itemTypeDescription || "item") + " '" + itemName + "' in invalid bin: " + (bin ? bin.name : "null"));
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
 * Creates the necessary course directory structure and creates/opens the Premiere Pro project.
 */
function setupCourseProjectAndDirectories(courseSpecificPath, courseName) {
    $.writeln("ExtendScript: setupCourseProjectAndDirectories --- START ---");
    $.writeln("ExtendScript: Args - courseSpecificPath: " + courseSpecificPath + ", courseName: " + courseName);
    try {
        if (!app || typeof app.openDocument !== 'function' || typeof app.newProject !== 'function') {
            return "Error: Host 'app' object or critical methods (openDocument/newProject) not available.";
        }
        if (!courseSpecificPath || !courseName) {
            return "Error: courseSpecificPath or courseName is missing.";
        }
        var safeCourseName = courseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
        if (!safeCourseName) { return "Error: Invalid course name after sanitization: '" + courseName + "'"; }

        $.writeln("ExtendScript: Using course-specific root path: " + courseSpecificPath);
        var mainCourseFolder = new Folder(courseSpecificPath);
        if (!mainCourseFolder.exists && !mainCourseFolder.create()) {
            return "Error: Could not create main course folder: " + courseSpecificPath;
        }
        $.writeln("ExtendScript: Main course folder verified/created: " + mainCourseFolder.fsName);

        var subDirs = ["_01_RAW_VIDEOS", "_02_SLIDES", "_03_PROJECT_DATA", "_04_PREMIERE_PROJECTS", "_05_EXPORTS"];
        for (var i = 0; i < subDirs.length; i++) {
            var subDir = new Folder(courseSpecificPath + "/" + subDirs[i]);
            if (!subDir.exists && !subDir.create()) {
                return "Error: Failed to create subdirectory: " + subDirs[i];
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
            if (!app.openDocument(projectFilePath)) {
                 $.writeln("ExtendScript: app.openDocument returned falsy. Checking path...");
            }
            $.sleep(3000);
            if (app.project && app.project.path && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                messagePrefix = "Success: Existing project '" + projectFileName + "' opened.";
            } else {
                messagePrefix = "Error: Failed to open or confirm opening of '" + projectFileName + "'. Active: " + (app.project ? app.project.name : "None");
            }
        } else {
            $.writeln("ExtendScript: Target project does not exist. Creating new: " + projectFilePath);
            if (!app.newProject(projectFilePath)) {
                $.writeln("ExtendScript: app.newProject returned falsy. Checking path...");
            }
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
 * Processes the Master Plan JSON to import media, create bins, sequences, and add clips in Premiere Pro.
 */
function processMasterPlanInPremiere(masterPlanJSONString, projectPathFromPanel) {
    $.writeln("\nExtendScript: processMasterPlanInPremiere --- START ---");
    $.writeln("ExtendScript: IS_TEST_MODE: " + IS_TEST_MODE);
    $.writeln("ExtendScript: Expected project path from panel: " + projectPathFromPanel);

    var importedVideosMap = {};
    var importedSlidesMap = {};

    try {
        // --- Basic Setup and Validation ---
        if (!app) { return "Error: Host 'app' object is null/undefined."; }
        if (!app.project) { return "Error: No project currently open (app.project is null)."; }
        if (!app.project.path) { return "Error: Current project path is null/undefined."; }
        $.writeln("ExtendScript: Active project: " + app.project.name + " at " + app.project.path);

        var currentProjectPathNormalized = app.project.path.toString().replace(/\\/g, '/');
        var targetProjectPathNormalized = projectPathFromPanel.replace(/\\/g, '/');

        if (currentProjectPathNormalized !== targetProjectPathNormalized) {
            return "Error: Active PPro project ('" + app.project.name + "') doesn't match expected ('" + targetProjectPathNormalized + "'). Ensure correct project is active.";
        }
        $.writeln("ExtendScript: Correct project is active: " + app.project.name);

        if (!app.project.rootItem) { return "Error: Project rootItem not accessible for: " + app.project.name; }
        $.writeln("ExtendScript: Project root item accessed: " + app.project.rootItem.name);

        var masterPlan;
        if (typeof JSON === 'undefined' || typeof JSON.parse !== 'function') {
             return "Error: JSON object not available for parsing. json2.js might be missing.";
        }
        try {
            masterPlan = JSON.parse(masterPlanJSONString);
        } catch (jsonError) {
            return "Error: Parsing Master Plan JSON failed: " + jsonError.toString();
        }

        if (!masterPlan || !masterPlan.sections || !masterPlan.baseVideoPath || !masterPlan.baseSlidePath) {
            return "Error: Invalid Master Plan structure (missing sections, baseVideoPath, or baseSlidePath).";
        }
        $.writeln("ExtendScript: Master Plan parsed. Sections count: " + masterPlan.sections.length);

        var projectRoot = app.project.rootItem;

        // --- Create/Get Main Bins ---
        var courseBinName = "COURSE - " + masterPlan.courseTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
        var courseBin = findBinByName(projectRoot, courseBinName) || projectRoot.createBin(courseBinName);
        if (!courseBin) { return "Error: Failed to create/find main course bin: " + courseBinName; }
        $.writeln("ExtendScript: Using course bin: " + courseBin.name);

        var videosBinName = "_01_RAW_VIDEOS_IMPORTED";
        var videosBin = findBinByName(courseBin, videosBinName) || courseBin.createBin(videosBinName);
        if (!videosBin) { return "Error: Failed to create/find videos import bin: " + videosBinName; }
        $.writeln("ExtendScript: Using videos import bin: " + videosBin.name);

        var slidesBinName = "_02_SLIDES_IMPORTED";
        var slidesBin = findBinByName(courseBin, slidesBinName) || courseBin.createBin(slidesBinName);
        if (!slidesBin) { return "Error: Failed to create/find slides import bin: " + slidesBinName; }
        $.writeln("ExtendScript: Using slides import bin: " + slidesBin.name);

        // --- Phase 1: Import Media ---
        $.writeln("ExtendScript: --- Starting Media Import Phase ---");
        var videoFileRegex = /\.(mp4|mov|avi|mkv|flv|wmv|mpg|mpeg|m4v)$/i;
        var slideFileRegex = /\.(tif|tiff|png|jpg|jpeg|psd|ai)$/i;

        var requiredVideoNamesForImport = null;
        var requiredSlideNamesForImport = null;

        if (IS_TEST_MODE) {
            $.writeln("ExtendScript: TEST MODE - Collecting specific files to import.");
            requiredVideoNamesForImport = [];
            requiredSlideNamesForImport = [];
            var tempVideoNames = {};
            var tempSlideNames = {};

            var sectionsToScan = masterPlan.sections.slice(0, 1);
            for (var ts = 0; ts < sectionsToScan.length; ts++) {
                var testSectionData = sectionsToScan[ts];
                if (testSectionData.sectionIntroSlide) {
                    tempSlideNames[testSectionData.sectionIntroSlide] = true;
                }
                var lessonsToScan = testSectionData.lessons.slice(0, 1);
                for (var tl = 0; tl < lessonsToScan.length; tl++) {
                    var testLessonData = lessonsToScan[tl];
                    if (testLessonData.matchedVideoFile) {
                        tempVideoNames[testLessonData.matchedVideoFile] = true;
                    }
                    if (testLessonData.blankSlide1) {
                        tempSlideNames[testLessonData.blankSlide1] = true;
                    }
                    if (testLessonData.blankSlide2) {
                        tempSlideNames[testLessonData.blankSlide2] = true;
                    }
                    if (testLessonData.lessonIntroSlide) {
                        tempSlideNames[testLessonData.lessonIntroSlide] = true;
                    }
                    if (testLessonData.lessonOutroSlide) {
                        tempSlideNames[testLessonData.lessonOutroSlide] = true;
                    }
                }
            }
            for (var vName in tempVideoNames) { if (Object.prototype.hasOwnProperty.call(tempVideoNames, vName)) requiredVideoNamesForImport.push(vName); }
            for (var sName in tempSlideNames) { if (Object.prototype.hasOwnProperty.call(tempSlideNames, sName)) requiredSlideNamesForImport.push(sName); }

            $.writeln("ExtendScript: TEST MODE - Required videos for import: " + (requiredVideoNamesForImport.length > 0 ? requiredVideoNamesForImport.join(", ") : "None"));
            $.writeln("ExtendScript: TEST MODE - Required slides for import: " + (requiredSlideNamesForImport.length > 0 ? requiredSlideNamesForImport.join(", ") : "None"));
        }

        importedVideosMap = importFilesToBin(masterPlan.baseVideoPath, videosBin, "Videos", videoFileRegex, requiredVideoNamesForImport);
        if (!importedVideosMap) { return "Error: Video import process failed critically."; }
        $.writeln("ExtendScript: Video import process complete. " + getObjectPropertyCount(importedVideosMap) + " videos mapped.");

        importedSlidesMap = importFilesToBin(masterPlan.baseSlidePath, slidesBin, "Slides", slideFileRegex, requiredSlideNamesForImport);
        if (!importedSlidesMap) { return "Error: Slide import process failed critically."; }
        $.writeln("ExtendScript: Slide import process complete. " + getObjectPropertyCount(importedSlidesMap) + " slides mapped.");
        $.writeln("ExtendScript: --- Media Import Phase Finished ---");


        // --- Phase 2: Create Sequences and Add Media ---
        $.writeln("ExtendScript: --- Starting Sequence Creation & Population Phase ---");
        var labelColors = [0, 2, 4, 6, 1, 3, 5, 7];
        var sequencesCreatedCount = 0;

        var sectionsToProcess = IS_TEST_MODE ? masterPlan.sections.slice(0, 1) : masterPlan.sections;
        if (IS_TEST_MODE) $.writeln("ExtendScript: TEST MODE - Will process up to 1 section for sequence creation.");

        for (var s = 0; s < sectionsToProcess.length; s++) {
            var sectionData = sectionsToProcess[s];
            var sectionBinName = padNumberStart(sectionData.sectionIndex + 1, 2) + " - " + sectionData.udemySectionTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
            $.writeln("ExtendScript: Processing Section " + (sectionData.sectionIndex + 1) + ": " + sectionData.udemySectionTitle);
            var sectionBin = findBinByName(courseBin, sectionBinName) || courseBin.createBin(sectionBinName);

            if (!sectionBin) { $.writeln("Error creating section bin: " + sectionBinName + ". Skipping this section."); continue; }
            $.writeln("ExtendScript: Using section bin: " + sectionBin.name);
            if (typeof sectionBin.setColorLabel === 'function') {
                sectionBin.setColorLabel(labelColors[sectionData.sectionIndex % labelColors.length]);
            }

            var firstVideoLessonInSectionProcessed = false; // Flag for this section

            var lessonsToProcess = IS_TEST_MODE ? sectionData.lessons.slice(0, 1) : sectionData.lessons;
             if (IS_TEST_MODE && sectionData.lessons.length > 0) $.writeln("ExtendScript: TEST MODE - Will process up to 1 lesson for sequence creation in section: " + sectionData.udemySectionTitle);

            for (var l = 0; l < lessonsToProcess.length; l++) {
                var lessonData = lessonsToProcess[l];

                if (!lessonData.matchedVideoFile) {
                    $.writeln("ExtendScript: Lesson '" + lessonData.lessonTitle + "' has no matched video. Skipping sequence creation.");
                    continue;
                }

                var sequenceName = padNumberStart(lessonData.lessonIndexInSection + 1, 2) + " - " + lessonData.lessonTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
                $.writeln("ExtendScript: Preparing sequence: '" + sequenceName + "' for bin: '" + sectionBin.name + "'");

                if (findSequenceInBin(sectionBin, sequenceName)){
                    $.writeln("ExtendScript: Sequence '" + sequenceName + "' already exists in bin. Skipping creation.");
                    continue;
                }

                var clipsForSequence = [];

                // Add clips based on the new logic
                if (!firstVideoLessonInSectionProcessed) {
                    // This is the first lesson in this section that has a video.
                    // Add Slide1 and Slide2 (which are stored in lessonData.blankSlide1/2 for the first lesson)
                    if (lessonData.blankSlide1) {
                        var blankSlide1Item = findItemInBinByName(lessonData.blankSlide1, slidesBin, "Blank Slide 1") || (importedSlidesMap ? importedSlidesMap[lessonData.blankSlide1] : null);
                        if (blankSlide1Item && (blankSlide1Item.type === PPRO_FILE_TYPE || blankSlide1Item.type === PPRO_CLIP_TYPE)) {
                            clipsForSequence.push(blankSlide1Item);
                            $.writeln("ExtendScript: Added Blank Slide 1 '" + blankSlide1Item.name + "' to clip list.");
                        } else { $.writeln("Warning: Blank Slide 1 '" + lessonData.blankSlide1 + "' not found or invalid for first video lesson."); }
                    }
                    if (lessonData.blankSlide2) {
                        var blankSlide2Item = findItemInBinByName(lessonData.blankSlide2, slidesBin, "Blank Slide 2") || (importedSlidesMap ? importedSlidesMap[lessonData.blankSlide2] : null);
                        if (blankSlide2Item && (blankSlide2Item.type === PPRO_FILE_TYPE || blankSlide2Item.type === PPRO_CLIP_TYPE)) {
                            clipsForSequence.push(blankSlide2Item);
                            $.writeln("ExtendScript: Added Blank Slide 2 '" + blankSlide2Item.name + "' to clip list.");
                        } else { $.writeln("Warning: Blank Slide 2 '" + lessonData.blankSlide2 + "' not found or invalid for first video lesson."); }
                    }

                    // Add Section Intro Slide (if it exists for the section)
                    if (sectionData.sectionIntroSlide) {
                        var sectionIntroSlideItem = findItemInBinByName(sectionData.sectionIntroSlide, slidesBin, "Section Intro Slide") || (importedSlidesMap ? importedSlidesMap[sectionData.sectionIntroSlide] : null);
                        if (sectionIntroSlideItem && (sectionIntroSlideItem.type === PPRO_FILE_TYPE || sectionIntroSlideItem.type === PPRO_CLIP_TYPE)) {
                            clipsForSequence.push(sectionIntroSlideItem);
                            $.writeln("ExtendScript: Added Section Intro Slide '" + sectionIntroSlideItem.name + "' to clip list.");
                        } else {
                            $.writeln("Warning: Section Intro Slide '" + sectionData.sectionIntroSlide + "' not found or invalid for sequence.");
                        }
                    }
                    firstVideoLessonInSectionProcessed = true; // Mark that section-start slides have been added
                }

                // Add Lesson Intro Slide
                if (lessonData.lessonIntroSlide) {
                    var lessonIntroSlideItem = findItemInBinByName(lessonData.lessonIntroSlide, slidesBin, "Lesson Intro Slide") || (importedSlidesMap ? importedSlidesMap[lessonData.lessonIntroSlide] : null);
                    if (lessonIntroSlideItem && (lessonIntroSlideItem.type === PPRO_FILE_TYPE || lessonIntroSlideItem.type === PPRO_CLIP_TYPE)) {
                        clipsForSequence.push(lessonIntroSlideItem);
                        $.writeln("ExtendScript: Added Lesson Intro Slide '" + lessonIntroSlideItem.name + "' to clip list.");
                    } else { $.writeln("Warning: Lesson Intro Slide '" + lessonData.lessonIntroSlide + "' not found or invalid."); }
                }

                // Add Matched Video File
                var videoItem = findItemInBinByName(lessonData.matchedVideoFile, videosBin, "Matched Video") || (importedVideosMap ? importedVideosMap[lessonData.matchedVideoFile] : null);
                if (videoItem && (videoItem.type === PPRO_FILE_TYPE || videoItem.type === PPRO_CLIP_TYPE) ) {
                     $.writeln("ExtendScript: Video Item for sequence: Name: '" + videoItem.name + "', Type: " + videoItem.type);
                    clipsForSequence.push(videoItem);
                    $.writeln("ExtendScript: Added Matched Video '" + videoItem.name + "' to clip list.");
                } else {
                    var videoItemDetails = "not found or invalid type.";
                    if(videoItem) videoItemDetails = "Name: " + videoItem.name + ", Type: " + videoItem.type;
                    $.writeln("Error: Matched video file '" + lessonData.matchedVideoFile + "' ("+ videoItemDetails +") not suitable for sequence '" + lessonData.lessonTitle + "'. Skipping this video for this sequence.");
                }

                // Add Lesson Outro Slide
                if (lessonData.lessonOutroSlide) {
                    var lessonOutroSlideItem = findItemInBinByName(lessonData.lessonOutroSlide, slidesBin, "Lesson Outro Slide") || (importedSlidesMap ? importedSlidesMap[lessonData.lessonOutroSlide] : null);
                    if (lessonOutroSlideItem && (lessonOutroSlideItem.type === PPRO_FILE_TYPE || lessonOutroSlideItem.type === PPRO_CLIP_TYPE)) {
                        clipsForSequence.push(lessonOutroSlideItem);
                        $.writeln("ExtendScript: Added Lesson Outro Slide '" + lessonOutroSlideItem.name + "' to clip list.");
                    } else { $.writeln("Warning: Lesson Outro Slide '" + lessonData.lessonOutroSlide + "' not found or invalid."); }
                }

                // Create sequence from the collected clips
                if (clipsForSequence.length > 0) {
                    if (!app.project.createNewSequenceFromClips) {
                        $.writeln("Error: app.project.createNewSequenceFromClips is not a function.");
                        continue;
                    }
                    $.writeln("ExtendScript: Attempting to create sequence '" + sequenceName + "' with " + clipsForSequence.length + " clips.");
                    var newSequence = app.project.createNewSequenceFromClips(sequenceName, clipsForSequence, sectionBin);

                    if (newSequence) {
                        $.writeln("ExtendScript: Successfully created sequence '" + newSequence.name + "' from clips in bin '" + sectionBin.name + "'.");
                        sequencesCreatedCount++;
                    } else {
                        $.writeln("Error: Failed to create sequence '" + sequenceName + "' from clips. The method returned null or undefined.");
                    }
                } else {
                    $.writeln("ExtendScript: No valid clips collected for lesson '" + lessonData.lessonTitle + "'. Skipping sequence creation.");
                }
            }
        }

        return "Success: Processing finished. " +
               getObjectPropertyCount(importedVideosMap) + " videos mapped, " +
               getObjectPropertyCount(importedSlidesMap) + " slides mapped. " +
               sequencesCreatedCount + " sequences created using createNewSequenceFromClips.";

    } catch (e) {
        return "Error: EXCEPTION in processMasterPlanInPremiere: " + e.toString() + " (Line: " + e.line + ") Stack: " + $.stack;
    } finally {
        $.writeln("ExtendScript: processMasterPlanInPremiere --- END ---");
    }
}
