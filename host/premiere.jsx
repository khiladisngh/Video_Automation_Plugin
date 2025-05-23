#target premierepro

#include "json2.js"; // Include the JSON library

// Using the global 'app' object directly.

/**
 * Polyfill for String.prototype.padStart (simplified for numbers)
 * @param {number} number The number to pad.
 * @param {number} targetLength The desired length of the resulting string.
 * @param {string} padString The string to pad with (defaults to '0').
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

// Function to set up course directories AND create/open a Premiere Pro project
function setupCourseProjectAndDirectories(basePath, courseName) {
    $.writeln("ExtendScript: setupCourseProjectAndDirectories --- START ---");
    $.writeln("ExtendScript: Args - basePath: " + basePath + ", courseName: " + courseName);
    try {
        if (!app || typeof app.openDocument !== 'function' || typeof app.newProject !== 'function') {
            var initErrorMsg = "Error: Critical - Host application 'app' is not properly initialized or core functions (openDocument/newProject) are missing at start of setup.";
            $.writeln("ExtendScript: " + initErrorMsg);
            return initErrorMsg;
        }
        if (!basePath || !courseName) {
            return "Error: Base path or course name is missing in setupCourseProjectAndDirectories.";
        }
        var safeCourseName = courseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
        if (!safeCourseName) {
             return "Error: Invalid course name after sanitization: '" + courseName + "'";
        }

        var mainCoursePath = basePath;
        $.writeln("ExtendScript: mainCoursePath (course-specific root): " + mainCoursePath);

        var mainCourseFolder = new Folder(mainCoursePath);
        if (!mainCourseFolder.exists) {
            $.writeln("ExtendScript: Main course folder does not exist, attempting to create: " + mainCoursePath);
            if (!mainCourseFolder.create()) {
                return "Error: Could not create main course folder: " + mainCoursePath;
            }
            $.writeln("ExtendScript: Main course folder created: " + mainCourseFolder.fsName);
        } else {
            $.writeln("ExtendScript: Main course folder already exists: " + mainCourseFolder.fsName);
        }

        var subDirs = [
            "_01_RAW_VIDEOS", "_02_SLIDES", "_02_SLIDES/INTRO_OUTRO",
            "_02_SLIDES/LESSON_SPECIFIC", "_03_PROJECT_DATA",
            "_04_PREMIERE_PROJECTS", "_05_EXPORTS"
        ];
        var errorMessages = [];
        for (var i = 0; i < subDirs.length; i++) {
            var subDirPath = mainCoursePath + "/" + subDirs[i];
            var subDirFolder = new Folder(subDirPath);
            if (!subDirFolder.exists) {
                if (!subDirFolder.create()) {
                    errorMessages.push("Failed to create subdirectory: " + subDirs[i]);
                }
            }
        }
        if (errorMessages.length > 0) { return "Error: Creating subdirectories: " + errorMessages.join("; "); }
        $.writeln("ExtendScript: All subdirectories verified/created.");

        var premiereProjectsFolderPath = mainCoursePath + "/_04_PREMIERE_PROJECTS";
        var premiereProjectsFolder = new Folder(premiereProjectsFolderPath);
        if (!premiereProjectsFolder.exists) {
            if (!premiereProjectsFolder.create()){
                return "Error: Could not ensure _04_PREMIERE_PROJECTS folder exists at: " + premiereProjectsFolder.fsName;
            }
        }
        var projectFileName = safeCourseName + ".prproj";
        var projectFilePath = premiereProjectsFolder.fsName.replace(/\\/g, '/') + "/" + projectFileName;
        $.writeln("ExtendScript: Target project file path for setup: " + projectFilePath);

        var projectFile = new File(projectFilePath);
        var projectOpenedSuccessfully = false;
        var messagePrefix = "";

        var currentProjPathStr = (app.project && app.project.path) ? app.project.path.toString().replace(/\\/g, '/') : null;

        if (currentProjPathStr === projectFilePath) {
            $.writeln("ExtendScript: Target project '" + projectFileName + "' is already open and active.");
            projectOpenedSuccessfully = true;
            messagePrefix = "Success: Project '" + projectFileName + "' is already active. Folders verified.";
        } else if (projectFile.exists) {
            $.writeln("ExtendScript: Target project file exists. Attempting to open with app.openDocument(): " + projectFilePath);
            app.openDocument(projectFilePath);
            $.sleep(3000);

            if (app.project && app.project.path && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                projectOpenedSuccessfully = true;
                messagePrefix = "Success: Existing project '" + projectFileName + "' opened. Folders verified.";
            } else {
                var currentProjName = (app.project && app.project.name) ? app.project.name : "None";
                messagePrefix = "Error: Failed to open or confirm opening of existing project '" + projectFileName + "'. Current active project: " + currentProjName;
            }
        } else {
            $.writeln("ExtendScript: Target project file does not exist. Attempting to create new project with app.newProject(): " + projectFilePath);
            var newProjectSuccess = app.newProject(projectFilePath);
            $.sleep(2000);

            if (app.project && app.project.path && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                projectOpenedSuccessfully = true;
                messagePrefix = "Success: New project '" + projectFileName + "' created and opened. Folders set up.";
            } else if (newProjectSuccess === true) {
                 projectOpenedSuccessfully = true;
                 messagePrefix = "Success: New project '" + projectFileName + "' created (newProject API returned true, path may update). Folders set up.";
            } else {
                var creationErrorMsg = "Error: Failed to create or confirm creation of new Premiere Pro project at: " + projectFilePath + ".";
                messagePrefix = creationErrorMsg;
            }
        }

        $.writeln("ExtendScript: " + messagePrefix);
        return messagePrefix;

    } catch (e) {
        var errorString = "Error: Exception in setupCourseProjectAndDirectories: " + e.toString();
        if (e.line) errorString += " on line " + e.line;
        if (e.fileName) errorString += " in file " + e.fileName;
        $.writeln("ExtendScript: " + errorString);
        return errorString;
    } finally {
        $.writeln("ExtendScript: setupCourseProjectAndDirectories --- END ---");
    }
}

/**
 * Processes the Master Plan JSON to create bins and sequences in Premiere Pro.
 * @param {string} masterPlanJSONString The Master Plan data as a JSON string.
 * @param {string} projectPathFromPanel The expected full path to the .prproj file.
 * @returns {string} A status message, prefixed with "Success:" or "Error:".
 */
function processMasterPlanInPremiere(masterPlanJSONString, projectPathFromPanel) {
    $.writeln("\nExtendScript: processMasterPlanInPremiere --- START ---");
    $.writeln("ExtendScript: Target projectPathFromPanel argument: " + projectPathFromPanel);

    try {
        if (!app) { var appErr = "Error: Host app object 'app' is null/undefined at start of processMasterPlanInPremiere."; $.writeln("ExtendScript: " + appErr); return appErr; }
        $.writeln("ExtendScript: 'app' object exists. Type: " + typeof app);
        if (typeof app.openDocument !== 'function') { var openDocErr = "Error: app.openDocument is not a function."; $.writeln("ExtendScript: " + openDocErr); return openDocErr; }
        if (typeof app.project === 'undefined') { var projUndefErr = "Error: app.project is undefined."; $.writeln("ExtendScript: " + projUndefErr); return projUndefErr; }

        if (!app.project || !app.project.path) {
            var noProjMsg = "Error: No project is active in Premiere Pro. Please ensure Step 1 was completed and the project is open.";
            $.writeln("ExtendScript: " + noProjMsg);
            return noProjMsg;
        }

        var currentProjectPathNormalized = app.project.path.toString().replace(/\\/g, '/');
        var targetProjectPathNormalized = projectPathFromPanel.replace(/\\/g, '/');

        if (currentProjectPathNormalized !== targetProjectPathNormalized) {
            var pathMismatchMsg = "Error: Active PPro project ('" + app.project.name + "' at '" + currentProjectPathNormalized +
                                  "') doesn't match expected ('" + targetProjectPathNormalized +
                                  "'). Ensure correct project from Step 1 is active.";
            $.writeln("ExtendScript: " + pathMismatchMsg);
            return pathMismatchMsg;
        }
        $.writeln("ExtendScript: Correct project is active: " + app.project.name);

        if (!app.project.rootItem) {
            var noRootItemMsg = "Error: Project rootItem is not accessible for project: " + app.project.name;
            $.writeln("ExtendScript: " + noRootItemMsg);
            return noRootItemMsg;
        }
        $.writeln("ExtendScript: Project root item accessed. Name: " + app.project.rootItem.name);

        var masterPlan;
        $.writeln("ExtendScript: Attempting to parse Master Plan JSON.");
        if (typeof JSON === 'undefined' || typeof JSON.parse !== 'function') {
             return "Error: JSON object not available in ExtendScript. json2.js might not be included correctly.";
        }
        try {
            masterPlan = JSON.parse(masterPlanJSONString);
        } catch (jsonError) {
            return "Error: Could not parse Master Plan JSON. " + jsonError.toString();
        }

        if (!masterPlan || !masterPlan.sections || typeof masterPlan.sections.length === 'undefined') {
            return "Error: Invalid Master Plan data structure after parsing.";
        }
        $.writeln("ExtendScript: Master Plan parsed. Sections found: " + masterPlan.sections.length);

        var projectRoot = app.project.rootItem;
        var courseContentBinName = "COURSE - " + masterPlan.courseTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
        var courseBin = findBinByName(projectRoot, courseContentBinName);

        if (!courseBin) {
            $.writeln("ExtendScript: Creating main course bin: " + courseContentBinName);
            if (typeof projectRoot.createBin !== 'function') return "Error: projectRoot.createBin is not a function.";
            courseBin = projectRoot.createBin(courseContentBinName);
        }
        if (!courseBin) { return "Error: Could not create/find main course bin: " + courseContentBinName; }
        $.writeln("ExtendScript: Using course bin: " + courseBin.name);

        var labelColors = [0, 2, 4, 6, 1, 3, 5, 7];
        var lessonsProcessedCount = 0;

        if (masterPlan.sections.length === 0) {
            return "Success: Master Plan has no sections with matched videos. No bins or sequences created.";
        }

        for (var s = 0; s < masterPlan.sections.length; s++) {
            var sectionData = masterPlan.sections[s];
            // Use the polyfill padNumberStart for sectionBinName
            var sectionBinName = padNumberStart(sectionData.sectionIndex + 1, 2) + " - " + sectionData.udemySectionTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
            var sectionBin = findBinByName(courseBin, sectionBinName);

            if (!sectionBin) {
                $.writeln("ExtendScript: Creating section bin: " + sectionBinName + " inside " + courseBin.name);
                if (typeof courseBin.createBin !== 'function') {$.writeln("Error: courseBin.createBin is not a function for " + courseBin.name); continue;}
                sectionBin = courseBin.createBin(sectionBinName);
            }
            if (!sectionBin) { $.writeln("Error creating section bin: " + sectionBinName); continue; }
            $.writeln("ExtendScript: Using section bin: " + sectionBin.name);

            if (typeof sectionBin.setColorLabel === 'function') {
                 sectionBin.setColorLabel(labelColors[sectionData.sectionIndex % labelColors.length]);
            } else { $.writeln("Warning: setColorLabel not a function on sectionBin."); }

            if (!sectionData.lessons || sectionData.lessons.length === 0) { continue; }

            for (var l = 0; l < sectionData.lessons.length; l++) {
                var lessonData = sectionData.lessons[l];
                if (!lessonData.matchedVideoFile) continue;

                // Use the polyfill padNumberStart for sequenceName
                var sequenceName = padNumberStart(lessonData.lessonIndexInSection + 1, 2) + " - " + lessonData.lessonTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
                $.writeln("ExtendScript: Preparing sequence: " + sequenceName);

                var existingSequence = findSequenceInBin(sectionBin, sequenceName);

                if(existingSequence){
                    $.writeln("ExtendScript: Sequence '" + sequenceName + "' already exists in bin '" + sectionBin.name + "'. Skipping creation.");
                    lessonsProcessedCount++;
                    continue;
                }

                if (!app.project || typeof app.project.createNewSequence !== 'function') {
                     $.writeln("Error: createNewSequence method not found."); continue;
                }
                if (!sectionBin || typeof sectionBin.nodeId === 'undefined') {
                    $.writeln("Error: sectionBin invalid for sequence creation: " + (sectionBin ? sectionBin.name : "undefined")); continue;
                }
                var newSequence = app.project.createNewSequence(sequenceName, sectionBin.nodeId);

                if (!newSequence) {
                    $.writeln("Error: Could not create sequence: " + sequenceName); continue;
                }
                $.writeln("ExtendScript: Created sequence: " + newSequence.name);
                lessonsProcessedCount++;
            }
        }
        return "Success: Bins created/verified. " + lessonsProcessedCount + " lesson sequences considered. Media import pending.";
    } catch (e) {
        var errorString = "Error: EXCEPTION in processMasterPlanInPremiere: " + e.toString();
        if (e.line) errorString += " on line " + e.line;
        if (e.fileName) errorString += " in file " + e.fileName;
        $.writeln("ExtendScript: " + errorString);
        return errorString;
    } finally {
        $.writeln("ExtendScript: processMasterPlanInPremiere --- END ---");
    }
}

/**
 * Helper function to find a bin by name within a parent bin.
 * @param {ProjectItem} parentBin The parent bin item.
 * @param {string} name The name of the bin to find.
 * @returns {ProjectItem|null} The found bin item or null.
 */
function findBinByName(parentBin, name) {
    if (!parentBin || !parentBin.children) {
        $.writeln("ExtendScript: findBinByName - Parent bin is invalid or has no children. Parent: " + (parentBin ? parentBin.name : "null"));
        return null;
    }
    var BIN_TYPE = 2; // BinItemType.BIN
    for (var i = 0; i < parentBin.children.numItems; i++) {
        var child = parentBin.children[i];
        if (child && child.name === name && child.type === BIN_TYPE) {
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
    if (!app.project || !app.project.sequences || !targetBin || !targetBin.nodeId) {
        $.writeln("ExtendScript: findSequenceInBin - Invalid arguments or project state.");
        return null;
    }
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        var seq = app.project.sequences[i];
        if (seq && seq.name === sequenceName) {
            var parentBin = seq.getBin ? seq.getBin() : null;
            if (parentBin && parentBin.nodeId === targetBin.nodeId) {
                return seq;
            }
        }
    }
    return null;
}
