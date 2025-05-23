#target premierepro

// Function to set up course directories AND create/open a Premiere Pro project
function setupCourseProjectAndDirectories(basePath, courseName) {
    try {
        if (!basePath || !courseName) {
            return "Error: Base path or course name is missing.";
        }

        var safeCourseName = courseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
        if (!safeCourseName) {
             return "Error: Invalid course name after sanitization: '" + courseName + "'";
        }

        var mainCoursePath = basePath + "/" + safeCourseName;
        var mainCourseFolder = new Folder(mainCoursePath);

        if (!mainCourseFolder.exists) {
            if (!mainCourseFolder.create()) {
                return "Error: Could not create main course folder: " + mainCoursePath;
            }
        }

        var subDirs = [
            "_01_RAW_VIDEOS",
            "_02_SLIDES",
            "_03_PROJECT_DATA",
            "_04_PREMIERE_PROJECTS",
            "_05_EXPORTS"
        ];
        var createdCount = 0;
        var existingCount = 0;
        var errorMessages = [];

        for (var i = 0; i < subDirs.length; i++) {
            var subDirPath = mainCoursePath + "/" + subDirs[i];
            var subDirFolder = new Folder(subDirPath);
            if (!subDirFolder.exists) {
                if (subDirFolder.create()) {
                    createdCount++;
                } else {
                    errorMessages.push("Failed to create subdirectory: " + subDirs[i]);
                }
            } else {
                existingCount++;
            }
        }

        if (errorMessages.length > 0) {
            return "Error: " + errorMessages.join("; ");
        }

        // --- Create or Open Premiere Pro Project ---
        var premiereProjectsFolder = new Folder(mainCoursePath + "/_04_PREMIERE_PROJECTS");
        if (!premiereProjectsFolder.exists) {
            if (!premiereProjectsFolder.create()){ // Should have been created, but good to check
                return "Error: Could not ensure _04_PREMIERE_PROJECTS folder exists.";
            }
        }

        var projectFileName = safeCourseName + ".prproj";
        var projectFilePath = premiereProjectsFolder.fsName.replace(/\\/g, '/') + "/" + projectFileName;
        var projectFile = new File(projectFilePath);
        var projectOpenedSuccessfully = false;
        var messagePrefix = "";

        if (projectFile.exists) {
            // Project file exists, try to open it
            // Ensure any current project is handled (Premiere Pro usually prompts to save)
            // app.openDocument() is more generic, app.openProject() is specific. Let's try app.openProject().
            // If a project is already open and it's the same one, openProject might do nothing or re-focus.
            // If it's a different project, it will close the current (with save prompt) and open the new one.
            if (app.project && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                // The requested project is already open
                projectOpenedSuccessfully = true;
                messagePrefix = "Success: Existing project '" + projectFileName + "' is already open. Folders verified.";
            } else {
                // Attempt to open the existing project file
                // Note: app.openProject() doesn't return a boolean success in all PPro versions.
                // We might need to rely on checking app.project.path after the call.
                app.openProject(projectFilePath);
                // Check if the project path matches after attempting to open
                if (app.project && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                    projectOpenedSuccessfully = true;
                    messagePrefix = "Success: Existing project '" + projectFileName + "' opened. Folders verified.";
                } else {
                    // This case is tricky. If openProject fails silently or PPro shows an error,
                    // we might not get a direct failure indication here.
                    // For now, if path doesn't match, assume it might have failed or user cancelled a dialog.
                    return "Error: Could not open existing project '" + projectFileName + "'. Please check Premiere Pro.";
                }
            }
        } else {
            // Project file does not exist, create a new one
            var newProjectSuccess = app.newProject(projectFilePath);
            // Similar to openProject, newProject's return can be inconsistent.
            // Check app.project.path.
            if (app.project && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                projectOpenedSuccessfully = true;
                messagePrefix = "Success: New project '" + projectFileName + "' created and opened. Folders set up.";
            } else {
                // If newProject failed.
                return "Error: Failed to create new Premiere Pro project at: " + projectFilePath + ". Please check Premiere Pro.";
            }
        }

        if (projectOpenedSuccessfully) {
            return messagePrefix;
        } else {
            // Fallback error if logic above didn't catch a specific failure.
            return "Error: Premiere Pro project operation could not be confirmed for '" + projectFileName + "'.";
        }

    } catch (e) {
        return "Error: Exception in ExtendScript (setupCourseProjectAndDirectories): " + e.toString();
    }
}

// ... (Placeholders for runUdemyScraper and listLocalVideos remain the same for now) ...
function runUdemyScraper(udemyUrl) { /* ... */ return JSON.stringify({"message": "scraper not implemented"});}
function listLocalVideos(folderPath) { /* ... */ return JSON.stringify([]);}
