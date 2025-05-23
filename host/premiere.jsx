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

        if (errorMessages.length > 0) {
            return "Error: " + errorMessages.join("; ");
        }

        // --- Create or Open Premiere Pro Project ---
        var premiereProjectsFolder = new Folder(mainCoursePath + "/_04_PREMIERE_PROJECTS");
        if (!premiereProjectsFolder.exists) {
            if (!premiereProjectsFolder.create()){
                return "Error: Could not ensure _04_PREMIERE_PROJECTS folder exists at: " + premiereProjectsFolder.fsName;
            }
        }

        var projectFileName = safeCourseName + ".prproj";
        var projectFilePath = premiereProjectsFolder.fsName.replace(/\\/g, '/') + "/" + projectFileName;
        var projectFileObject = new File(projectFilePath); // Use this File object for app.open()
        var projectOpenedSuccessfully = false;
        var messagePrefix = "";

        if (projectFileObject.exists) {
            // Project file exists, try to open it
            // Check if it's already the active project
            if (app.project && app.project.path && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                projectOpenedSuccessfully = true;
                messagePrefix = "Success: Existing project '" + projectFileName + "' is already open. Folders verified.";
            } else {
                // Attempt to open the existing project file using app.open()
                app.open(projectFileObject); // Pass the File object

                // Check if the project path matches after attempting to open.
                // This check might need a slight delay or a more robust way to confirm in some PPro versions,
                // as app.open() might not block script execution until the project is fully loaded.
                // For now, we rely on checking the path immediately after.
                if (app.project && app.project.path && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                    projectOpenedSuccessfully = true;
                    messagePrefix = "Success: Existing project '" + projectFileName + "' opened. Folders verified.";
                } else {
                    // If the path doesn't match, it could be an async operation or a failure.
                    // It's hard to get a definitive boolean success from app.open() for projects.
                    // We'll assume if the path isn't updated, it might not have opened as expected,
                    // or the user cancelled a dialog (e.g., save changes to current project).
                    return "Error: Could not confirm opening of existing project '" + projectFileName + "'. Please check Premiere Pro. The app.project.path did not match after attempting to open, or a dialog may have been cancelled.";
                }
            }
        } else {
            // Project file does not exist, create a new one
            var newProjectSuccess = app.newProject(projectFilePath); // This is generally reliable

            if (app.project && app.project.path && app.project.path.toString().replace(/\\/g, '/') === projectFilePath) {
                projectOpenedSuccessfully = true;
                messagePrefix = "Success: New project '" + projectFileName + "' created and opened. Folders set up.";
            } else if (newProjectSuccess === true) { // Some versions might return a boolean
                 projectOpenedSuccessfully = true;
                 messagePrefix = "Success: New project '" + projectFileName + "' created and opened (confirmed by return value). Folders set up.";
            }
            else {
                return "Error: Failed to create or confirm creation of new Premiere Pro project at: " + projectFilePath + ". Please check Premiere Pro.";
            }
        }

        if (projectOpenedSuccessfully) {
            return messagePrefix;
        } else {
            // Fallback error if logic above didn't catch a specific failure.
            return "Error: Premiere Pro project operation could not be confirmed for '" + projectFileName + "'.";
        }

    } catch (e) {
        var errorString = "Error: Exception in ExtendScript (setupCourseProjectAndDirectories): " + e.toString();
        if (e.line) {
            errorString += " on line " + e.line;
        }
        if (e.fileName) {
            errorString += " in file " + e.fileName;
        }
        return errorString;
    }
}

// Placeholder for runUdemyScraper - Handled by client/main.js
function runUdemyScraper(udemyUrl) {
    return JSON.stringify({"error": "Node.js scraper execution from ExtendScript is not implemented. Client-side JS handles it."});
}

// Placeholder for listLocalVideos - Handled by client/main.js
function listLocalVideos(folderPath) {
    return JSON.stringify({"error": "File listing from ExtendScript is not implemented. Client-side JS handles it."});
}
