#target premierepro

#include "json2.js"; // Include the JSON library

// Using the global 'app' object directly.

var IS_TEST_MODE = true; // SET TO false FOR FULL PROCESSING

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
 * Creates the necessary course directory structure and creates/opens the Premiere Pro project.
 */
function setupCourseProjectAndDirectories(basePath, courseName) {
    $.writeln("ExtendScript: setupCourseProjectAndDirectories --- START ---");
    $.writeln("ExtendScript: Args - basePath: " + basePath + ", courseName: " + courseName);
    try {
        if (!app || typeof app.openDocument !== 'function' || typeof app.newProject !== 'function') {
            var initErrorMsg = "Error: Critical - Host application 'app' is not properly initialized or core functions (openDocument/newProject) are missing at start of setup.";
            $.writeln("ExtendScript: " + initErrorMsg);
            return initErrorMsg;
        }
        // ... (rest of the setupCourseProjectAndDirectories function from the previous version in canvas)
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
 */
function processMasterPlanInPremiere(masterPlanJSONString, projectPathFromPanel) {
    $.writeln("\nExtendScript: processMasterPlanInPremiere --- START ---");
    $.writeln("ExtendScript: IS_TEST_MODE is: " + IS_TEST_MODE);
    $.writeln("ExtendScript: Target projectPathFromPanel argument: " + projectPathFromPanel);

    try {
        if (!app) { return "Error: Host app object 'app' is null/undefined."; }
        if (typeof app.project === 'undefined') { return "Error: app.project is undefined."; }

        if (!app.project || !app.project.path) {
            return "Error: No project active. Please complete Step 1 (Setup Project).";
        }

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
             return "Error: JSON object not available in ExtendScript. json2.js missing or not included correctly.";
        }
        try {
            masterPlan = JSON.parse(masterPlanJSONString);
        } catch (jsonError) {
            return "Error: Parsing Master Plan JSON failed: " + jsonError.toString();
        }

        if (!masterPlan || !masterPlan.sections) { return "Error: Invalid Master Plan structure."; }
        $.writeln("ExtendScript: Master Plan parsed. Sections: " + masterPlan.sections.length);

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
        var sequencesCreatedCount = 0;

        var sectionsToProcess = masterPlan.sections;
        if (IS_TEST_MODE) {
            sectionsToProcess = masterPlan.sections.slice(0, 2); // Max 2 sections for testing
            $.writeln("ExtendScript: TEST MODE - Processing max 2 sections.");
        }

        for (var s = 0; s < sectionsToProcess.length; s++) {
            var sectionData = sectionsToProcess[s];
            var sectionBinName = padNumberStart(sectionData.sectionIndex + 1, 2) + " - " + sectionData.udemySectionTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
            var sectionBin = findBinByName(courseBin, sectionBinName);

            if (!sectionBin) {
                $.writeln("ExtendScript: Creating section bin: " + sectionBinName);
                if (typeof courseBin.createBin !== 'function') {$.writeln("Error: courseBin.createBin not function for " + courseBin.name); continue;}
                sectionBin = courseBin.createBin(sectionBinName);
            }
            if (!sectionBin) { $.writeln("Error creating section bin: " + sectionBinName); continue; }
            $.writeln("ExtendScript: Using section bin: " + sectionBin.name);

            if (typeof sectionBin.setColorLabel === 'function') {
                 sectionBin.setColorLabel(labelColors[sectionData.sectionIndex % labelColors.length]);
            } else { $.writeln("Warning: setColorLabel not function on sectionBin."); }

            var lessonsToProcessActual = sectionData.lessons;
            if (IS_TEST_MODE) {
                lessonsToProcessActual = sectionData.lessons.slice(0, 2); // Max 2 lessons per section for testing
                $.writeln("ExtendScript: TEST MODE - Processing max 2 lessons for section: " + sectionData.udemySectionTitle);
            }
            if (!lessonsToProcessActual || lessonsToProcessActual.length === 0) { continue; }

            for (var l = 0; l < lessonsToProcessActual.length; l++) {
                var lessonData = lessonsToProcessActual[l];
                if (!lessonData.matchedVideoFile) continue;

                var sequenceName = padNumberStart(lessonData.lessonIndexInSection + 1, 2) + " - " + lessonData.lessonTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
                $.writeln("ExtendScript: Preparing sequence: " + sequenceName);

                var existingSequence = findSequenceInBin(sectionBin, sequenceName);

                if(existingSequence){
                    $.writeln("ExtendScript: Sequence '" + sequenceName + "' already exists. Skipping.");
                    lessonsProcessedCount++;
                    continue;
                }

                if (!app.project || typeof app.project.createNewSequence !== 'function') {
                     $.writeln("Error: createNewSequence method not found on app.project."); continue;
                }

                // Create sequence with default settings (empty string for preset path for silence)
                var newSequence = app.project.createNewSequence(sequenceName, "");

                if (!newSequence) {
                    $.writeln("Error: Could not create sequence: " + sequenceName); continue;
                }
                $.writeln("ExtendScript: Created sequence: " + newSequence.name + " (ID: " + newSequence.sequenceID + ") at project root.");

                // Move the sequence to the target section bin
                if (newSequence.projectItem && typeof newSequence.projectItem.moveToBin === 'function' && sectionBin) {
                    newSequence.projectItem.moveToBin(sectionBin);
                    $.writeln("ExtendScript: Moved sequence '" + newSequence.name + "' to bin '" + sectionBin.name + "'.");
                } else {
                    $.writeln("ExtendScript: Warning - Could not move sequence '" + newSequence.name + "' to target bin. ProjectItem: " + newSequence.projectItem + ", moveToBin: " + (newSequence.projectItem ? newSequence.projectItem.moveToBin : "N/A"));
                }

                // TODO: Import media and add to timeline

                lessonsProcessedCount++;
                sequencesCreatedCount++;
            }
        }
        return "Success: Bins processed. " + sequencesCreatedCount + " new sequences created. " + lessonsProcessedCount + " total lessons considered. Media import pending.";
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
 */
function findSequenceInBin(targetBin, sequenceName) {
    if (!app.project || !app.project.sequences || !targetBin || !targetBin.nodeId) {
        $.writeln("ExtendScript: findSequenceInBin - Invalid arguments or project state for sequence: " + sequenceName + ", targetBin: " + (targetBin ? targetBin.name : "null"));
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
