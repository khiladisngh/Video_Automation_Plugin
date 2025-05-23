#target premierepro

#include "json2.js"; // Ensure json2.js is in the same folder or provide correct relative path

// Test mode flag
var IS_TEST_MODE = true; // Set to false for full processing

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
 * Helper function to find a bin by name within a parent bin.
 * @param {ProjectItem} parentBin The parent bin item (typically project.rootItem or another bin).
 * @param {string} name The name of the bin to find.
 * @returns {ProjectItem|null} The found bin item or null.
 */
function findBinByName(parentBin, name) {
    var PPRO_BIN_TYPE = 2; // ProjectItemType.BIN is usually 2
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
            var parentBin = seq.getBin ? seq.getBin() : null;
            if (parentBin && typeof parentBin.nodeId !== 'undefined' && parentBin.nodeId === targetBin.nodeId) {
                return seq;
            }
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
            if (!app.openDocument(projectFilePath)) { // Some versions might return false on failure
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
            if (!app.newProject(projectFilePath)) { // Some versions might return false on failure
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
 * Processes the Master Plan JSON to create bins and sequences in Premiere Pro.
 */
function processMasterPlanInPremiere(masterPlanJSONString, projectPathFromPanel) {
    $.writeln("\nExtendScript: processMasterPlanInPremiere --- START ---");
    $.writeln("ExtendScript: IS_TEST_MODE: " + IS_TEST_MODE);
    $.writeln("ExtendScript: Expected project path from panel: " + projectPathFromPanel);

    try {
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

        if (!masterPlan || !masterPlan.sections) { return "Error: Invalid Master Plan structure (no sections array)."; }
        $.writeln("ExtendScript: Master Plan parsed. Sections count: " + masterPlan.sections.length);

        var projectRoot = app.project.rootItem;
        var courseBinName = "COURSE - " + masterPlan.courseTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
        var courseBin = findBinByName(projectRoot, courseBinName);

        if (!courseBin) {
            $.writeln("ExtendScript: Creating main course bin: " + courseBinName);
            if (typeof projectRoot.createBin !== 'function') return "Error: projectRoot.createBin is not a function.";
            courseBin = projectRoot.createBin(courseBinName);
        }
        if (!courseBin) { return "Error: Failed to create/find main course bin: " + courseBinName; }
        $.writeln("ExtendScript: Using course bin: " + courseBin.name + " (ID: " + courseBin.nodeId + ")");

        var labelColors = [0, 2, 4, 6, 1, 3, 5, 7];
        var sequencesCreatedCount = 0;

        var sectionsToProcess = IS_TEST_MODE ? masterPlan.sections.slice(0, 2) : masterPlan.sections;
        if (IS_TEST_MODE) $.writeln("ExtendScript: TEST MODE - Will process up to 2 sections.");

        for (var s = 0; s < sectionsToProcess.length; s++) {
            var sectionData = sectionsToProcess[s];
            var sectionBinName = padNumberStart(sectionData.sectionIndex + 1, 2) + " - " + sectionData.udemySectionTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
            $.writeln("ExtendScript: Processing Section " + (sectionData.sectionIndex + 1) + ": " + sectionData.udemySectionTitle);
            var sectionBin = findBinByName(courseBin, sectionBinName);

            if (!sectionBin) {
                $.writeln("ExtendScript: Creating section bin: " + sectionBinName);
                sectionBin = courseBin.createBin(sectionBinName);
            }
            if (!sectionBin) { $.writeln("Error creating section bin: " + sectionBinName + ". Skipping this section."); continue; }
            $.writeln("ExtendScript: Using section bin: " + sectionBin.name + " (ID: " + sectionBin.nodeId + ")");

            if (typeof sectionBin.setColorLabel === 'function') {
                 sectionBin.setColorLabel(labelColors[sectionData.sectionIndex % labelColors.length]);
            }

            var lessonsToProcess = IS_TEST_MODE ? sectionData.lessons.slice(0, 2) : sectionData.lessons;
            if (IS_TEST_MODE && sectionData.lessons.length > 0) $.writeln("ExtendScript: TEST MODE - Will process up to 2 lessons for this section.");

            for (var l = 0; l < lessonsToProcess.length; l++) {
                var lessonData = lessonsToProcess[l];
                if (!lessonData.matchedVideoFile) {
                    $.writeln("ExtendScript: Lesson '" + lessonData.lessonTitle + "' has no matched video. Skipping sequence creation.");
                    continue;
                }

                var sequenceName = padNumberStart(lessonData.lessonIndexInSection + 1, 2) + " - " + lessonData.lessonTitle.replace(/[^\w\s\-]/g, '_').replace(/\s+/g, '_');
                $.writeln("ExtendScript: Preparing sequence: '" + sequenceName + "' for bin: '" + sectionBin.name + "'");

                if (findSequenceInBin(sectionBin, sequenceName)){
                    $.writeln("ExtendScript: Sequence '" + sequenceName + "' already exists in bin. Skipping.");
                    continue;
                }

                if (!app.project.createNewSequence) {$.writeln("Error: app.project.createNewSequence is not a function."); continue;}

                var newSequence = app.project.createNewSequence(sequenceName, ""); // Create with default settings
                if (!newSequence) { $.writeln("Error: Failed to create sequence '" + sequenceName + "'."); continue; }
                $.writeln("ExtendScript: Created sequence: '" + newSequence.name + "' (ID: " + newSequence.sequenceID + ").");

                $.sleep(300); // Small delay before accessing projectItem and moving

                if (newSequence.projectItem && typeof newSequence.projectItem.moveToBin === 'function' && sectionBin && typeof sectionBin.nodeId !== 'undefined') {
                    $.writeln("ExtendScript: Moving sequence '" + newSequence.name + "' to bin '" + sectionBin.name + "' (ID: " + sectionBin.nodeId + ")");
                    newSequence.projectItem.moveToBin(sectionBin);
                    // Verification
                    var parentOfMovedSeq = newSequence.projectItem.getBin ? newSequence.projectItem.getBin() : null;
                    if (parentOfMovedSeq && parentOfMovedSeq.nodeId === sectionBin.nodeId) {
                        $.writeln("ExtendScript: Sequence '" + newSequence.name + "' successfully moved to bin '" + sectionBin.name + "'.");
                        sequencesCreatedCount++;
                    } else {
                        $.writeln("ExtendScript: WARNING - moveToBin for '" + newSequence.name + "' did not place it in expected bin. Actual parent: " + (parentOfMovedSeq ? parentOfMovedSeq.name : "root or null"));
                    }
                } else {
                    $.writeln("ExtendScript: WARNING - Could not move sequence '" + newSequence.name + "'. Conditions: projectItem? " + !!newSequence.projectItem + ", moveToBin? " + (newSequence.projectItem ? typeof newSequence.projectItem.moveToBin: 'N/A') + ", sectionBin? " + !!sectionBin );
                }
            }
        }
        return "Success: Phase 3 processing finished. " + sequencesCreatedCount + " sequences created/verified in correct bins. Media import pending.";
    } catch (e) {
        return "Error: EXCEPTION in processMasterPlanInPremiere: " + e.toString() + " (Line: " + e.line + ")";
    } finally {
        $.writeln("ExtendScript: processMasterPlanInPremiere --- END ---");
    }
}
