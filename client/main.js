window.onload = function() {
    console.log("Panel main.js loaded.");
    var csInterface = new CSInterface();

    // --- Theme Detection ---
    function onAppThemeColorChanged(event) {
        try {
            var appSkinInfo = JSON.parse(window.__adobe_cep__.getHostEnvironment()).appSkinInfo;
            if (!appSkinInfo) return;
            var panelBackgroundColor = appSkinInfo.panelBackgroundColor.color;
            var body = document.body;
            if (panelBackgroundColor.red < 100 && panelBackgroundColor.green < 100 && panelBackgroundColor.blue < 100) {
                body.classList.remove('light');
                body.classList.add('dark');
            } else {
                body.classList.remove('dark');
                body.classList.add('light');
            }
        } catch (e) {
            console.error("Error getting skin info: ", e);
        }
    }
    csInterface.addEventListener("com.adobe.csxs.events.ThemeColorChanged", onAppThemeColorChanged);
    onAppThemeColorChanged(null);

    // --- DOM Elements ---
    var courseNameInput = document.getElementById('courseNameInput');
    var baseDirectoryInput = document.getElementById('baseDirectoryInput');
    var browseBaseDirButton = document.getElementById('browseBaseDirButton');
    var setupProjectButton = document.getElementById('setupProjectButton');
    var dirSetupStatus = document.getElementById('dirSetupStatus');
    var nextStepsMessage = document.getElementById('nextStepsMessage');
    var projectStatusSubMessage = document.getElementById('projectStatusSubMessage');


    // --- Event Listeners for Phase 0 ---
    if (browseBaseDirButton) {
        browseBaseDirButton.onclick = function() {
            var result = window.cep.fs.showOpenDialog(false, true, "Select Base Directory for Courses", baseDirectoryInput.value || "");
            if (result && result.data && result.data.length > 0) {
                baseDirectoryInput.value = result.data[0].replace(/\\/g, '/');
            }
        };
    }

    if (setupProjectButton) {
        setupProjectButton.onclick = function() {
            var courseName = courseNameInput.value.trim();
            var baseDirectory = baseDirectoryInput.value.trim();

            if (!courseName) {
                updateStatus(dirSetupStatus, "Please enter a Course Name.", "error");
                return;
            }
            if (!baseDirectory) {
                updateStatus(dirSetupStatus, "Please select a Base Directory.", "error");
                return;
            }

            updateStatus(dirSetupStatus, "Setting up project...", "");
            nextStepsMessage.style.display = 'none';

            var callString = 'setupCourseProjectAndDirectories("' + escapeString(baseDirectory) + '", "' + escapeString(courseName) + '")';
            console.log("Calling ExtendScript: " + callString);

            csInterface.evalScript(callString, function(result) {
                // Example result formats from ExtendScript:
                // "Success:New project 'CourseName.prproj' created and folders set up."
                // "Success:Existing project 'CourseName.prproj' opened and folders verified."
                // "Error:Could not create main course folder."
                if (result && typeof result === 'string') {
                    var lowerResult = result.toLowerCase();
                    if (lowerResult.startsWith("success:")) {
                        updateStatus(dirSetupStatus, result, "success");
                        if (projectStatusSubMessage) {
                            if (lowerResult.includes("new project")) {
                                projectStatusSubMessage.textContent = "A new Premiere Pro project has been created and opened.";
                            } else if (lowerResult.includes("existing project")) {
                                projectStatusSubMessage.textContent = "The existing Premiere Pro project has been opened.";
                            } else {
                                projectStatusSubMessage.textContent = "A Premiere Pro project has been prepared.";
                            }
                        }
                        nextStepsMessage.style.display = 'block';
                    } else {
                        updateStatus(dirSetupStatus, result, "error");
                         if (projectStatusSubMessage) projectStatusSubMessage.textContent = "Project setup failed.";
                    }
                } else {
                    updateStatus(dirSetupStatus, "An unknown error occurred or no response from script.", "error");
                    if (projectStatusSubMessage) projectStatusSubMessage.textContent = "Project setup failed.";
                }
            });
        };
    }

    // --- Helper Functions ---
    function updateStatus(element, message, type) {
        if (!element) return;
        element.textContent = message.replace(/^Success:/i, '').replace(/^Error:/i, '').trim();
        element.className = 'status-message';
        if (type) {
            element.classList.add(type);
        }
        element.style.display = message ? 'block' : 'none';
    }

    function escapeString(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/\\/g, '/').replace(/"/g, '\\"').replace(/'/g, "\\'");
    }

    // --- Placeholder for Phase 1 (Udemy Scraper) Button ---
    var fetchUdemyDataButton = document.getElementById('fetchUdemyDataButton');
    if (fetchUdemyDataButton) {
        fetchUdemyDataButton.onclick = function() {
            var scraperStatus = document.getElementById('scraperStatus');
            updateStatus(scraperStatus, "Udemy fetching not yet implemented.", "error");
        };
    }
};
