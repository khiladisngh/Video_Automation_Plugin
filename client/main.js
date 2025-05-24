/**
 * @file client/main.js
 * @description Core client-side JavaScript for the Premiere Pro Video Automation Hub panel.
 * Handles UI interactions, communication with Node.js helper scripts,
 * and ExtendScript for Premiere Pro automation.
 */

window.onload = function() {
    console.log("Panel main.js loaded. Initializing Video Automation Hub.");
    const csInterface = new CSInterface();

    // --- Configuration & Constants ---

    /**
     * @const {boolean} IS_CLIENT_TEST_MODE
     * @description Flag to enable client-side test mode.
     * When true, hardcoded JSON can be used for testing, bypassing some live calls.
     */
    const IS_CLIENT_TEST_MODE = false;

    /**
     * @const {string} HARDCODED_TEST_MASTER_PLAN_JSON_STRING
     * @description A sample Master Plan JSON string for testing purposes when IS_CLIENT_TEST_MODE is true.
     * This allows testing the UI and Premiere Pro interaction logic without live scraping or file processing.
     */
    const HARDCODED_TEST_MASTER_PLAN_JSON_STRING = `{
  "courseTitle": "Wireshark na Prática: Analisando Ataques na Rede",
  "baseVideoPath": "H:/Temp/projects/Wireshark/_01_RAW_VIDEOS",
  "baseSlidePath": "H:/Temp/projects/Wireshark/_02_SLIDES",
  "projectDataPath": "H:\\\\Temp\\\\projects\\\\Wireshark\\\\_03_PROJECT_DATA",
  "premiereProjectFile": "H:\\\\Temp\\\\projects\\\\Wireshark\\\\_04_PREMIERE_PROJECTS\\\\Wireshark.prproj",
  "sections": [
    {
      "udemySectionTitle": "Introdução ao Curso e Nivelamento",
      "sectionIndex": 0,
      "sectionIntroSlide": "Slide21.TIF",
      "lessons": [
        {
          "lessonTitle": "Apresentação do curso e objetivos",
          "udemyDuration": "10:23",
          "lessonIndexInSection": 1,
          "blankSlide1": "Slide1.TIF",
          "blankSlide2": "Slide2.TIF",
          "lessonIntroSlide": "Slide4.TIF",
          "matchedVideoFile": "SEC-T01-P01.mp4",
          "lessonOutroSlide": "Slide5.TIF",
          "globalLessonIndex": 0
        }
      ]
    }
  ]
}`; // Note: lessonIndexInSection is 1-based in this example.

    // --- Theme Detection & Handling ---

    /**
     * Handles changes in the Adobe application's theme (light/dark).
     * Updates the panel's body class to match the host application's theme.
     * @param {Event} event - The theme color changed event object (can be null for initial call).
     */
    function onAppThemeColorChanged(event) {
        try {
            const appSkinInfo = JSON.parse(window.__adobe_cep__.getHostEnvironment()).appSkinInfo;
            if (!appSkinInfo || !appSkinInfo.panelBackgroundColor || !appSkinInfo.panelBackgroundColor.color) {
                console.warn("Theme change: App skin info or panel background color not available.");
                return;
            }
            const panelBackgroundColor = appSkinInfo.panelBackgroundColor.color;
            const body = document.body;

            // Determine if the theme is dark or light based on RGB values
            // This threshold might need adjustment based on specific Adobe app themes
            if (panelBackgroundColor.red < 128 && panelBackgroundColor.green < 128 && panelBackgroundColor.blue < 128) {
                body.classList.remove('light');
                body.classList.add('dark');
                console.log("Theme changed to: Dark");
            } else {
                body.classList.remove('dark');
                body.classList.add('light');
                console.log("Theme changed to: Light");
            }
        } catch (e) {
            console.error("Error getting or applying skin info for theme change:", e);
        }
    }
    csInterface.addEventListener("com.adobe.csxs.events.ThemeColorChanged", onAppThemeColorChanged);
    onAppThemeColorChanged(null); // Initial theme check

    // --- Node.js Dependencies (available due to CEF --enable-nodejs) ---
    const child_process = require('child_process');
    const fs = require('fs');
    const path = require('path');

    // --- DOM Element References ---
    // It's good practice to check if elements exist after attempting to get them,
    // especially if HTML structure might change.
    const reloadPluginButton = document.getElementById('reloadPluginButton');
    const courseNameInput = document.getElementById('courseNameInput');
    const baseDirectoryInput = document.getElementById('baseDirectoryInput');
    const browseBaseDirButton = document.getElementById('browseBaseDirButton');
    const setupProjectButton = document.getElementById('setupProjectButton');
    const dirSetupStatus = document.getElementById('dirSetupStatus');
    const nextStepsMessage = document.getElementById('nextStepsMessage');
    const projectStatusSubMessage = document.getElementById('projectStatusSubMessage');
    const dirSetupProgressContainer = document.getElementById('dirSetupProgressContainer');
    const dirSetupProgressBar = document.getElementById('dirSetupProgressBar');

    const udemyUrlInput = document.getElementById('udemyUrlInput');
    const fetchUdemyDataButton = document.getElementById('fetchUdemyDataButton');
    const scraperStatus = document.getElementById('scraperStatus');
    const udemyDataDisplay = document.getElementById('udemyDataDisplay');

    const rawVideoPathInput = document.getElementById('rawVideoPathInput');
    const browseRawVideoPathButton = document.getElementById('browseRawVideoPathButton');
    const slidePathInput = document.getElementById('slidePathInput');
    const browseSlidePathButton = document.getElementById('browseSlidePathButton');
    const listLocalFilesButton = document.getElementById('listLocalFilesButton');
    const localFileProgressContainer = document.getElementById('localFileProgressContainer');
    const localFileProgressBar = document.getElementById('localFileProgressBar');
    const localFileStatus = document.getElementById('localFileStatus');
    const localVideoFilesDisplay = document.getElementById('localVideoFilesDisplay');
    const unmatchedVideosDisplay = document.getElementById('unmatchedVideosDisplay');

    const validateAndPlanButton = document.getElementById('validateAndPlanButton');
    const regeneratePlanButton = document.getElementById('regeneratePlanButton');
    const planStatus = document.getElementById('planStatus');
    const masterPlanDisplay = document.getElementById('masterPlanDisplay');

    const generatePremiereProjectButton = document.getElementById('generatePremiereProjectButton');
    const premiereProgressContainer = document.getElementById('premiereProgressContainer');
    const premiereProgressBar = document.getElementById('premiereProgressBar');
    const premiereStatus = document.getElementById('premiereStatus');

    // --- Application State Variables ---
    let currentUdemyData = null; // Stores the fetched Udemy course structure.
    let currentLocalVideoFiles = []; // Stores names of video files found locally.
    let localVideoDetails = []; // Stores details (name, duration, matched status) of local videos.
    let currentCourseName = ""; // Stores the user-defined course name.
    let currentBaseDirectory = ""; // Stores the base directory for the current course project.
    let currentMasterPlanPath = ""; // Stores the file path to the saved Master Plan JSON.
    let udemyLessonsForMatchingGlobal = []; // Stores a flattened list of Udemy lessons for matching logic.


    // --- Helper Functions ---

    /**
     * Updates a status message element in the UI.
     * @param {HTMLElement} element - The DOM element to update.
     * @param {string} message - The message to display. Can include "Success:" or "Error:" prefixes.
     * @param {'success'|'error'|'info'|null} [type] - The type of message, for styling. If null, tries to infer from message.
     * @param {boolean} [isPermanent=false] - If true, the message might persist longer (currently not changing behavior).
     * @param {boolean} [append=false] - If true, appends the message to existing content; otherwise, replaces it.
     */
    function updateStatus(element, message, type, isPermanent = false, append = false) {
        if (!element) {
            console.warn("updateStatus called with null element for message:", message);
            return;
        }
        let displayMessage = message;
        if (typeof message === 'string') {
            // Remove common prefixes for cleaner display, as styling handles indication.
            displayMessage = message.replace(/^(Success:|Error:|Info:|Warning:)\s*/i, '').trim();
        }

        if (append && element.textContent && element.textContent.trim() !== "") {
            element.textContent += "\n" + displayMessage;
        } else {
            element.textContent = displayMessage;
        }

        // Determine class based on type or message content
        let messageTypeClass = '';
        if (type) {
            messageTypeClass = type;
        } else if (typeof message === 'string') {
            const lowerMessage = message.toLowerCase();
            if (lowerMessage.startsWith("error:")) messageTypeClass = 'error';
            else if (lowerMessage.startsWith("success:")) messageTypeClass = 'success';
            else if (lowerMessage.startsWith("warning:") || lowerMessage.startsWith("info:")) messageTypeClass = 'info';
        }

        element.className = 'status-message'; // Reset base class
        if (messageTypeClass) {
            element.classList.add(messageTypeClass);
        }

        element.style.display = (element.textContent && element.textContent.trim()) ? 'block' : 'none';
    }

    /**
     * Escapes a string for safe inclusion in an ExtendScript evalScript call,
     * particularly for file paths or other string literals.
     * @param {string} str - The string to escape.
     * @returns {string} The escaped string.
     */
    function escapeStringForExtendScript(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/\\/g, '\\\\') // Escape backslashes
                  .replace(/"/g, '\\"')  // Escape double quotes
                  .replace(/'/g, "\\'"); // Escape single quotes (though ExtendScript often prefers double)
    }

    /**
     * Gets the base path of the current CEP extension.
     * @returns {string} The extension's base path, with forward slashes.
     */
    function getExtensionBasePath() {
        const extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
        return extensionPath.replace(/\\/g, '/'); // Normalize to forward slashes
    }

    /**
     * Parses a duration string (e.g., "HH:MM:SS", "MM:SS", "SS") into total seconds.
     * @param {string} durationStr - The duration string.
     * @returns {number} The duration in seconds, or 0 if parsing fails.
     */
    function parseUdemyDurationToSeconds(durationStr) {
        if (!durationStr || typeof durationStr !== 'string') return 0;
        const parts = durationStr.split(':').map(Number);
        let seconds = 0;
        if (parts.length === 3) { // HH:MM:SS
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) { // MM:SS
            seconds = parts[0] * 60 + parts[1];
        } else if (parts.length === 1 && !isNaN(parts[0])) { // SS
            seconds = parts[0];
        }
        return isNaN(seconds) ? 0 : Math.round(seconds);
    }

    /**
     * Fetches the duration of a video file using the get_video_duration.js Node script.
     * @param {string} videoFilePath - The absolute path to the video file.
     * @param {string} videoFileNameForLog - The name of the video file, for logging purposes.
     * @param {function} [progressCallback] - Optional callback function called with true (success) or false (failure) for this file.
     * @returns {Promise<number>} A promise that resolves with the video duration in seconds, or rejects with an error.
     */
    function fetchVideoDurationPromise(videoFilePath, videoFileNameForLog, progressCallback) {
        return new Promise((resolve, reject) => {
            const extensionBasePath = getExtensionBasePath();
            const durationScriptPath = path.join(extensionBasePath, 'scripts', 'get_video_duration.js');

            if (!fs.existsSync(durationScriptPath)) {
                const errMsg = `Duration script not found at ${durationScriptPath}`;
                console.error(errMsg);
                if (progressCallback) progressCallback(false);
                return reject(new Error(errMsg));
            }

            console.log(`Fetching duration for: ${videoFileNameForLog} using script: ${durationScriptPath}`);
            const process = child_process.spawn('node', [durationScriptPath, videoFilePath]);
            let durationOutput = '';
            let errorOutput = '';

            process.stdout.on('data', (data) => {
                durationOutput += data.toString().trim();
            });
            process.stderr.on('data', (data) => {
                errorOutput += data.toString().trim();
                console.error(`Stderr from duration script for ${videoFileNameForLog}: ${data.toString().trim()}`);
            });

            process.on('close', (code) => {
                if (code === 0 && durationOutput) {
                    const duration = parseFloat(durationOutput);
                    if (!isNaN(duration)) {
                        const roundedDuration = Math.round(duration);
                        console.log(`Duration for ${videoFileNameForLog}: ${roundedDuration}s`);
                        if (progressCallback) progressCallback(true);
                        resolve(roundedDuration);
                    } else {
                        const errMsg = `Could not parse duration for ${videoFileNameForLog} from script output: '${durationOutput}'. Stderr: '${errorOutput}'`;
                        console.error(errMsg);
                        if (progressCallback) progressCallback(false);
                        reject(new Error(errMsg));
                    }
                } else {
                    const errMsg = `Duration script for ${videoFileNameForLog} failed (code ${code}). Stderr: '${errorOutput}'. Stdout: '${durationOutput}'`;
                    console.error(errMsg);
                    if (progressCallback) progressCallback(false);
                    reject(new Error(errMsg));
                }
            });
            process.on('error', (err) => {
                const errMsg = `Failed to start duration script process for ${videoFileNameForLog}: ${err.message}`;
                console.error(errMsg, err);
                if (progressCallback) progressCallback(false);
                reject(new Error(errMsg));
            });
        });
    }


    // --- Event Listener Setup ---

    // Reload Plugin Button
    if (reloadPluginButton) {
        reloadPluginButton.onclick = function() {
            console.log("Reloading plugin via window.location.reload()...");
            window.location.reload();
        };
    }

    // --- Phase 0: Project Setup ---
    if (browseBaseDirButton) {
        browseBaseDirButton.onclick = function() {
            const result = window.cep.fs.showOpenDialog(false, true, "Select Base Directory for Courses", baseDirectoryInput.value || "");
            if (result && result.data && result.data.length > 0) {
                baseDirectoryInput.value = result.data[0].replace(/\\/g, '/'); // Normalize to forward slashes
            }
        };
    }

    if (setupProjectButton) {
        setupProjectButton.onclick = function() {
            const courseNameVal = courseNameInput.value.trim();
            const baseDirVal = baseDirectoryInput.value.trim();

            if (!courseNameVal) {
                updateStatus(dirSetupStatus, "Error: Please enter a Course Name.", "error"); return;
            }
            if (!baseDirVal) {
                updateStatus(dirSetupStatus, "Error: Please select a Base Directory for courses.", "error"); return;
            }

            currentCourseName = courseNameVal;
            // Sanitize course name for path creation (remove invalid chars, replace spaces)
            const safeCourseNameForPath = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
            currentBaseDirectory = path.join(baseDirVal, safeCourseNameForPath).replace(/\\/g, '/');

            // Update UI for progress
            if (dirSetupProgressContainer) dirSetupProgressContainer.style.display = 'block';
            if (dirSetupProgressBar) {
                dirSetupProgressBar.style.width = '0%'; // Reset
                dirSetupProgressBar.classList.add('indeterminate');
            }
            updateStatus(dirSetupStatus, "Setting up project structure in Premiere Pro...", "info");
            if (nextStepsMessage) nextStepsMessage.style.display = 'none';
            if (projectStatusSubMessage) projectStatusSubMessage.textContent = "";

            // Call ExtendScript function
            const callString = `setupCourseProjectAndDirectories("${escapeStringForExtendScript(currentBaseDirectory)}", "${escapeStringForExtendScript(currentCourseName)}")`;
            console.log("ClientJS: Calling ExtendScript for project setup:", callString);

            csInterface.evalScript(callString, function(result) {
                if (dirSetupProgressContainer) dirSetupProgressContainer.style.display = 'none';
                if (dirSetupProgressBar) dirSetupProgressBar.classList.remove('indeterminate');

                if (result && typeof result === 'string') {
                    const lowerResult = result.toLowerCase();
                    if (lowerResult.startsWith("success:")) {
                        updateStatus(dirSetupStatus, result, "success", true);
                        if (projectStatusSubMessage) projectStatusSubMessage.textContent = "A Premiere Pro project has been prepared.";
                        if (nextStepsMessage) nextStepsMessage.style.display = 'block';
                        // Auto-populate paths for next step
                        if (rawVideoPathInput) rawVideoPathInput.value = path.join(currentBaseDirectory, "_01_RAW_VIDEOS").replace(/\\/g, '/');
                        if (slidePathInput) slidePathInput.value = path.join(currentBaseDirectory, "_02_SLIDES").replace(/\\/g, '/');
                    } else {
                        updateStatus(dirSetupStatus, result, "error", true);
                        if (projectStatusSubMessage) projectStatusSubMessage.textContent = "Project setup failed.";
                    }
                } else {
                    updateStatus(dirSetupStatus, "Error: An unknown error occurred or no response from Premiere Pro script (setup). Check ExtendScript console.", "error", true);
                    if (projectStatusSubMessage) projectStatusSubMessage.textContent = "Project setup failed.";
                }
            });
        };
    }

    // --- Phase 1 & 2: Data Fetching, File Listing, and Planning ---
    if (fetchUdemyDataButton) {
        fetchUdemyDataButton.onclick = function() {
            const udemyUrl = udemyUrlInput.value.trim();
            if (!udemyUrl) {
                updateStatus(scraperStatus, "Error: Please enter a Udemy Course URL.", "error"); return;
            }
            updateStatus(scraperStatus, "Fetching Udemy course data... This may take a minute.", "info");
            if (udemyDataDisplay) udemyDataDisplay.value = "";
            currentUdemyData = null;

            const extensionBasePath = getExtensionBasePath();
            const scriptPath = path.join(extensionBasePath, 'scripts', 'scrape_udemy.js');
            const jsonOutputDir = path.join(extensionBasePath, 'output', 'output_json'); // Output dir for the scraper script

            // Clear previous JSON files from the scraper's output directory
            try {
                if (fs.existsSync(jsonOutputDir)) {
                    const files = fs.readdirSync(jsonOutputDir);
                    let clearedCount = 0;
                    files.forEach(file => {
                        if (path.extname(file).toLowerCase() === '.json') {
                            try {
                                fs.unlinkSync(path.join(jsonOutputDir, file));
                                clearedCount++;
                            } catch (err) { console.warn(`Could not delete existing json file: ${file}`, err); }
                        }
                    });
                    if (clearedCount > 0) console.log(`Cleared ${clearedCount} existing .json files from scraper output dir: ${jsonOutputDir}`);
                }
            } catch (err) { console.error(`Error trying to clear scraper output directory ${jsonOutputDir}:`, err); }

            if (!fs.existsSync(scriptPath)) {
                updateStatus(scraperStatus, `Error: Scraper script not found at ${scriptPath}`, "error"); return;
            }

            try {
                console.log(`Spawning scraper: node "${scriptPath}" "${udemyUrl}" --verbose`);
                const scraperProcess = child_process.spawn('node', [scriptPath, udemyUrl, '--verbose']);
                let scraperOutputLog = []; // To capture stdout/stderr from scraper

                scraperProcess.stdout.on('data', (data) => {
                    const logMsg = data.toString();
                    scraperOutputLog.push(logMsg);
                    console.log(`Scraper stdout: ${logMsg.trim()}`);
                });
                scraperProcess.stderr.on('data', (data) => {
                    const logMsg = `STDERR: ${data.toString()}`;
                    scraperOutputLog.push(logMsg);
                    console.error(`Scraper stderr: ${logMsg.trim()}`);
                });

                scraperProcess.on('close', (code) => {
                    console.log(`Scraper process exited with code ${code}`);
                    if (code === 0) {
                        try {
                            // Find the latest JSON file created by the scraper
                            const files = fs.readdirSync(jsonOutputDir)
                                .filter(fileName => path.extname(fileName).toLowerCase() === '.json')
                                .map(fileName => ({ name: fileName, time: fs.statSync(path.join(jsonOutputDir, fileName)).mtime.getTime() }))
                                .sort((a, b) => b.time - a.time); // Sort by modification time, newest first

                            if (files.length > 0) {
                                const latestJsonFile = path.join(jsonOutputDir, files[0].name);
                                const fileContent = fs.readFileSync(latestJsonFile, 'utf8');
                                currentUdemyData = JSON.parse(fileContent);
                                if (udemyDataDisplay) udemyDataDisplay.value = JSON.stringify(currentUdemyData, null, 2);
                                updateStatus(scraperStatus, "Success: Udemy course data fetched!", "success");

                                // Auto-populate course name if not already set by user and Step 1 was skipped/incomplete
                                if (courseNameInput && !courseNameInput.value && currentUdemyData.courseTitle) {
                                    courseNameInput.value = currentUdemyData.courseTitle;
                                    // If base directory is set, update currentBaseDirectory and paths
                                    if (baseDirectoryInput && baseDirectoryInput.value.trim()) {
                                        currentCourseName = courseNameInput.value;
                                        const parentDir = baseDirectoryInput.value.trim();
                                        const safeName = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
                                        currentBaseDirectory = path.join(parentDir, safeName).replace(/\\/g, '/');
                                        if (rawVideoPathInput) rawVideoPathInput.value = path.join(currentBaseDirectory, "_01_RAW_VIDEOS").replace(/\\/g, '/');
                                        if (slidePathInput) slidePathInput.value = path.join(currentBaseDirectory, "_02_SLIDES").replace(/\\/g, '/');
                                        console.log("Auto-populated paths after Udemy fetch as Step 1 might have been incomplete.");
                                    }
                                }
                            } else {
                                throw new Error("No JSON output file found from scraper in " + jsonOutputDir);
                            }
                        } catch (e) {
                            updateStatus(scraperStatus, `Error processing scraper output: ${e.message}. Log:\n${scraperOutputLog.join('')}`, "error");
                            console.error("Error processing scraper output:", e);
                        }
                    } else {
                        updateStatus(scraperStatus, `Error: Scraper exited with code ${code}. Log:\n${scraperOutputLog.join('')}`, "error");
                    }
                });
                 scraperProcess.on('error', (err) => {
                    console.error('Failed to start scraper process.', err);
                    updateStatus(scraperStatus, `Error: Failed to start scraper process. ${err.message}`, "error");
                });

            } catch (spawnError) {
                 console.error('Exception when trying to spawn scraper:', spawnError);
                 updateStatus(scraperStatus, `Fatal Error: Could not spawn scraper. ${spawnError.message}`, "error");
            }
        };
    }

    if (listLocalFilesButton) {
        listLocalFilesButton.onclick = async function() {
            const rawVideoPath = rawVideoPathInput.value.trim();
            if (!rawVideoPath) {
                updateStatus(localFileStatus, "Error: Please specify the Raw Video Path.", "error"); return;
            }
            updateStatus(localFileStatus, "Listing video files and fetching actual durations...", "info");
            if (localVideoFilesDisplay) localVideoFilesDisplay.value = "Processing...";
            if (unmatchedVideosDisplay) unmatchedVideosDisplay.value = ""; // Clear previous unmatched
            currentLocalVideoFiles = [];
            localVideoDetails = [];

            if (localFileProgressContainer) localFileProgressContainer.style.display = 'block';
            if (localFileProgressBar) localFileProgressBar.style.width = '0%';

            try {
                if (!fs.existsSync(rawVideoPath) || !fs.statSync(rawVideoPath).isDirectory()) {
                    updateStatus(localFileStatus, "Error: Raw Video Path does not exist or is not a directory.", "error");
                    if (localFileProgressContainer) localFileProgressContainer.style.display = 'none';
                    return;
                }
                const files = fs.readdirSync(rawVideoPath);
                // Filter for common video file extensions
                currentLocalVideoFiles = files.filter(file => /\.(mp4|mov|avi|mkv|flv|wmv|mpg|mpeg|m4v)$/i.test(file));

                if (currentLocalVideoFiles.length > 0) {
                    let processedCount = 0;
                    const totalFiles = currentLocalVideoFiles.length;

                    // Progress update function for duration fetching
                    const updateProgress = (success) => {
                        processedCount++;
                        const percentage = Math.round((processedCount / totalFiles) * 100);
                        if (localFileProgressBar) localFileProgressBar.style.width = percentage + '%';
                        updateStatus(localFileStatus, `Processing durations: ${processedCount} of ${totalFiles}...`, "info");
                    };

                    // Fetch durations for all videos concurrently
                    const durationPromises = currentLocalVideoFiles.map(fileName => {
                        const filePath = path.join(rawVideoPath, fileName);
                        return fetchVideoDurationPromise(filePath, fileName, updateProgress)
                            .then(durationSeconds => ({
                                fileName: fileName,
                                durationSeconds: durationSeconds,
                                isMatched: false, // Initialize matching status
                                error: null
                            }))
                            .catch(error => {
                                console.error(`Error processing duration for ${fileName}: ${error.message}`);
                                // updateProgress(false); // Already called inside fetchVideoDurationPromise on error
                                return {
                                    fileName: fileName,
                                    durationSeconds: 0,
                                    isMatched: false,
                                    error: error.message // Store error message
                                };
                            });
                    });

                    localVideoDetails = await Promise.all(durationPromises);
                    // Sort by filename for consistent display
                    localVideoDetails.sort((a, b) => a.fileName.localeCompare(b.fileName));

                    // Display results
                    const displayTexts = localVideoDetails.map(detail => {
                        if (detail.error) {
                            return `${detail.fileName} (Error fetching duration: ${detail.error.substring(0, 50)}...)`;
                        }
                        const mins = Math.floor(detail.durationSeconds / 60);
                        const secs = Math.round(detail.durationSeconds % 60);
                        return `${detail.fileName} (${mins}m ${secs}s)`;
                    });

                    if (localVideoFilesDisplay) localVideoFilesDisplay.value = displayTexts.join('\n');
                    const errorCount = localVideoDetails.filter(d => d.error).length;
                    if (errorCount > 0) {
                        updateStatus(localFileStatus, `Warning: Found ${localVideoDetails.length} video(s). Errors fetching duration for ${errorCount} file(s). Check console.`, "info"); // Changed to info/warning
                    } else {
                        updateStatus(localFileStatus, `Success: Found and processed durations for ${localVideoDetails.length} video file(s).`, "success");
                    }

                } else {
                    if (localVideoFilesDisplay) localVideoFilesDisplay.value = "No video files found in the specified directory.";
                    updateStatus(localFileStatus, "Info: No video files found in the specified directory.", "info");
                }
            } catch (err) {
                updateStatus(localFileStatus, `Error listing local files or processing durations: ${err.message}`, "error");
                console.error("Error in listLocalFilesButton.onclick:", err);
            } finally {
                 if (localFileProgressContainer) localFileProgressContainer.style.display = 'none';
            }
        };
    }

    // Browse buttons for paths
    if (browseRawVideoPathButton) {
        browseRawVideoPathButton.onclick = function() {
            const result = window.cep.fs.showOpenDialog(false, true, "Select Raw Videos Folder (_01_RAW_VIDEOS)", rawVideoPathInput.value || "");
            if (result && result.data && result.data.length > 0) {
                rawVideoPathInput.value = result.data[0].replace(/\\/g, '/');
            }
        };
    }
    if (browseSlidePathButton) {
        browseSlidePathButton.onclick = function() {
            const result = window.cep.fs.showOpenDialog(false, true, "Select Slides Folder (_02_SLIDES)", slidePathInput.value || "");
            if (result && result.data && result.data.length > 0) {
                slidePathInput.value = result.data[0].replace(/\\/g, '/');
            }
        };
    }

    /**
     * Core logic for generating the Master Plan.
     * This function matches Udemy lessons with local videos and assigns slides.
     * @param {boolean} isRegenerating - True if this is a regeneration call (e.g., after user removes slides).
     * @returns {boolean} True if plan generation was attempted (even if with warnings/errors), false if critical prerequisites missing.
     */
    function generatePlanLogic(isRegenerating = false) {
        let planMessages = []; // Array to hold status messages during planning

        if (masterPlanDisplay) masterPlanDisplay.value = "";
        currentMasterPlanPath = ""; // Reset path
        if (unmatchedVideosDisplay) unmatchedVideosDisplay.value = "";
        if (regeneratePlanButton) regeneratePlanButton.style.display = 'none'; // Hide by default

        // --- Prerequisite Checks ---
        if (!currentUdemyData || !currentUdemyData.sections || currentUdemyData.sections.length === 0) {
            updateStatus(planStatus, "Error: Udemy course data not fetched or is invalid/empty.", "error", true); return false;
        }
        if (localVideoDetails.length === 0 && currentLocalVideoFiles.length > 0) {
             updateStatus(planStatus, "Error: Local video files were listed, but their durations were not processed. Click 'List Videos & Get Durations' again.", "error", true); return false;
        }
        if (slidePathInput && !slidePathInput.value.trim()) {
            updateStatus(planStatus, "Error: Slide path not specified. This is needed for slide assignment.", "error", true); return false;
        }
        if (rawVideoPathInput && !rawVideoPathInput.value.trim() && localVideoDetails.length > 0) {
            updateStatus(planStatus, "Error: Raw video path not specified. This is needed if local videos are present for the Master Plan.", "error", true); return false;
        }
        if (!currentCourseName || !currentBaseDirectory) {
            updateStatus(planStatus, "Error: Course Name or Base Directory for the course not set (from Step 1). Please complete Step 1 to define project paths.", "error", true); return false;
        }

        const slidesPath = slidePathInput.value.trim();

        // --- Video Matching Logic ---
        // If not regenerating, or if previous matching data is unavailable, perform matching.
        if (!isRegenerating || !udemyLessonsForMatchingGlobal || udemyLessonsForMatchingGlobal.length === 0) {
            udemyLessonsForMatchingGlobal = []; // Reset global list
            // Flatten Udemy lessons for easier matching
            currentUdemyData.sections.forEach((section, sectionIdx) => {
                section.lessons.forEach((lesson, lessonIdx_in_scraped_data) => {
                    udemyLessonsForMatchingGlobal.push({
                        udemyTitle: lesson.lessonTitle,
                        udemyDurationSeconds: parseUdemyDurationToSeconds(lesson.duration),
                        originalSectionIndex: sectionIdx, // Keep track of original section
                        originalLessonIndexInScrapedSection: lessonIdx_in_scraped_data, // Index within the originally scraped lessons array
                        udemySectionTitle: section.sectionTitle,
                        isMatched: false,
                        matchedLocalFile: null,
                        originalUdemyDurationStr: lesson.duration
                    });
                });
            });

            // Reset match status for local videos
            localVideoDetails.forEach(video => video.isMatched = false);
            let successfulMatches = 0;

            console.log("--- Starting Video Matching Process ---");
            // Iterate through Udemy lessons and try to find a match in local videos
            udemyLessonsForMatchingGlobal.forEach(udemyLesson => {
                if (udemyLesson.isMatched) return; // Skip if already matched (e.g. in a previous iteration if logic changes)
                let bestMatch = null;
                // Find an unmatched local video with the exact or very close duration (+-1 second as a simple tolerance)
                // This is a simple matching; more sophisticated matching might use titles, order, etc.
                for (let i = 0; i < localVideoDetails.length; i++) {
                    const localVideo = localVideoDetails[i];
                    if (localVideo.isMatched || localVideo.durationSeconds === 0 || localVideo.error) continue; // Skip matched or invalid videos

                    const durationDiff = Math.abs(udemyLesson.udemyDurationSeconds - localVideo.durationSeconds);
                    if (durationDiff <= 1) { // Allow 0 or 1 second difference
                        bestMatch = localVideo;
                        break; // Found a good enough match
                    }
                }

                if (bestMatch) {
                    udemyLesson.matchedLocalFile = bestMatch.fileName;
                    udemyLesson.isMatched = true;
                    const originalLocalVideoEntry = localVideoDetails.find(v => v.fileName === bestMatch.fileName);
                    if (originalLocalVideoEntry) {
                        originalLocalVideoEntry.isMatched = true; // Mark local video as matched
                    }
                    successfulMatches++;
                }
            });
            console.log("--- Video Matching Process Ended ---");
            planMessages.push({text: `Video Matching: ${successfulMatches} of ${udemyLessonsForMatchingGlobal.length} Udemy lessons matched to local videos.`, type: "info"});
        } else {
            planMessages.push({text: "Re-using previous video matching results for regeneration.", type: "info"});
        }

        // Display unmatched local videos
        const unmatchedLocalFilesList = localVideoDetails
            .filter(video => !video.isMatched && !video.error) // Show only successfully processed but unmatched videos
            .map(video => `${video.fileName} (Duration: ${Math.floor(video.durationSeconds / 60)}m ${Math.round(video.durationSeconds % 60)}s)`);

        if (unmatchedVideosDisplay) {
            if (unmatchedLocalFilesList.length > 0) {
                unmatchedVideosDisplay.value = "The following local videos were processed but NOT matched to any Udemy lesson:\n" + unmatchedLocalFilesList.join('\n');
                planMessages.push({
                    text: "WARNING: Some local videos were unmatched. Review the 'Unmatched Local Videos' list. If these have corresponding slides (e.g., SlideX.TIF, SlideY.TIF) that are NOT needed for the matched lessons, MANUALLY REMOVE those specific slides from your '_02_SLIDES' directory. Then, click 'Confirm Slide Removal & Regenerate Plan'.",
                    type: "info" // Using 'info' as it's a warning with user action
                });
                if (regeneratePlanButton) regeneratePlanButton.style.display = 'block'; // Show regenerate button
            } else {
                unmatchedVideosDisplay.value = "All processed local videos were successfully matched to Udemy lessons.";
                if (regeneratePlanButton) regeneratePlanButton.style.display = 'none';
            }
        }

        // --- Slide Availability and Assignment Logic ---
        // Count how many "slots" for slides are needed based on matched videos.
        // Each matched video lesson potentially needs an intro and an outro slide.
        // Each section with at least one matched video potentially needs a section intro slide.
        // The very first video lesson in the entire course needs two blank slides.
        let sectionsWithMatchedVideosCount = 0;
        const uniqueMatchedSectionIndices = new Set();
        udemyLessonsForMatchingGlobal.forEach(ul => {
            if (ul.matchedLocalFile) {
                uniqueMatchedSectionIndices.add(ul.originalSectionIndex);
            }
        });
        sectionsWithMatchedVideosCount = uniqueMatchedSectionIndices.size;

        const numMatchedLocalVideos = udemyLessonsForMatchingGlobal.filter(ul => ul.matchedLocalFile).length;
        // Max slides needed: 2 (blanks) + N_sections_with_videos (section intros) + M_videos * 2 (lesson intro/outro)
        const maxExpectedSequentialSlidesNeeded = (numMatchedLocalVideos > 0 ? 2 : 0) + sectionsWithMatchedVideosCount + (numMatchedLocalVideos * 2);

        planMessages.push({text: `Slide Scan: Expecting up to ${maxExpectedSequentialSlidesNeeded} sequential slides (Slide1.tif, Slide2.tif, Slide3.tif, ...). Scanning available slides in '${slidesPath}'...`, type: "info"});

        let missingEssentialSlides = []; // For Slide1.tif, Slide2.tif if needed
        let foundSlidesMapping = {}; // Stores actual filenames for Slide1, Slide2, etc.
        let availableSequentialSlideFiles = []; // Stores actual filenames of Slide3.tif, Slide4.tif, ... in order

        try {
            if (maxExpectedSequentialSlidesNeeded > 0) { // Only scan if slides are actually needed
                if (!fs.existsSync(slidesPath) || !fs.statSync(slidesPath).isDirectory()) {
                    planMessages.push({text: `Error: Slides directory not found: ${slidesPath}. Cannot proceed with slide assignment.`, type: "error"});
                    updateStatus(planStatus, planMessages.map(m => m.text).join("\n"), 'error', true);
                    if (generatePremiereProjectButton) generatePremiereProjectButton.disabled = true;
                    return false;
                }
                const slideFilesOnDisk = fs.readdirSync(slidesPath);

                // Check for essential Slide1 and Slide2 if there's at least one matched video
                if (numMatchedLocalVideos > 0) {
                    for (let i = 1; i <= 2; i++) {
                        const slideRegex = new RegExp(`^slide\\s*${i}\\.(tif|tiff|png|jpg|jpeg|psd)$`, 'i');
                        const foundFile = slideFilesOnDisk.find(f => slideRegex.test(f));
                        if (foundFile) {
                            foundSlidesMapping["Slide" + i] = foundFile;
                        } else {
                            missingEssentialSlides.push(`Slide${i}.ext (e.g., Slide${i}.tif)`);
                        }
                    }
                }

                // Collect all other available sequential slides (Slide3, Slide4, ...)
                // This simple loop assumes slides are named like "SlideNUMBER.ext"
                // A more robust approach might sort all slide files numerically.
                const allSlideFilesSorted = slideFilesOnDisk
                    .map(f => {
                        const match = f.match(/^slide\s*(\d+)\.(tif|tiff|png|jpg|jpeg|psd)$/i);
                        return match ? { name: f, number: parseInt(match[1], 10) } : null;
                    })
                    .filter(f => f !== null)
                    .sort((a, b) => a.number - b.number);

                allSlideFilesSorted.forEach(slideFile => {
                    if (slideFile.number > 2) { // Only add Slide3 and onwards to this list
                        availableSequentialSlideFiles.push(slideFile.name);
                    }
                    // Also populate foundSlidesMapping for direct access if needed later (e.g. if Slide1/2 were found this way)
                    if (!foundSlidesMapping["Slide" + slideFile.number]) {
                         foundSlidesMapping["Slide" + slideFile.number] = slideFile.name;
                    }
                });
            }
        } catch (e) {
            planMessages.push({text: `Error reading slides directory: ${e.message}`, type: "error"});
            updateStatus(planStatus, planMessages.map(m => m.text).join("\n"), 'error', true);
            if (generatePremiereProjectButton) generatePremiereProjectButton.disabled = true;
            return false;
        }

        if (missingEssentialSlides.length > 0) {
            let missingMsg = missingEssentialSlides.join(', ');
            planMessages.push({text: `Error: Essential slides missing: ${missingMsg}. These are required if any videos are being processed. Please add them to '${slidesPath}'.`, type: "error"});
            if (generatePremiereProjectButton) generatePremiereProjectButton.disabled = true;
            updateStatus(planStatus, planMessages.map(m => m.text).join("\n"), 'error', true);
            return false;
        }

        planMessages.push({text: `Slide Validation: Essential slides (if needed) found. ${availableSequentialSlideFiles.length} other sequential slides (Slide3+) available for assignment. Generating Master Plan...`, type: "success"});

        // --- Construct Master Plan ---
        let masterPlan = {
            courseTitle: currentUdemyData.courseTitle || currentCourseName,
            baseVideoPath: rawVideoPathInput.value.trim(),
            baseSlidePath: slidesPath,
            projectDataPath: path.join(currentBaseDirectory, "_03_PROJECT_DATA").replace(/\\/g, '/'),
            premiereProjectFile: path.join(currentBaseDirectory, "_04_PREMIERE_PROJECTS", currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '') + ".prproj").replace(/\\/g, '/'),
            sections: []
        };

        let currentAvailableSlideIdx = 0; // Index for `availableSequentialSlideFiles` (Slide3 onwards)
        const getNextAvailableSequentialSlide = () => {
            if (currentAvailableSlideIdx < availableSequentialSlideFiles.length) {
                return availableSequentialSlideFiles[currentAvailableSlideIdx++];
            }
            planMessages.push({text: "Warning: Ran out of available sequential slides (Slide3+) during assignment.", type: "info"});
            return null; // No more available sequential slides
        };

        const getFixedSlide = (slideNum) => { // For Slide1 and Slide2
            return foundSlidesMapping["Slide" + slideNum] || null;
        };

        let isFirstVideoLessonInCourse = true; // Flag to assign BlankSlide1 and BlankSlide2

        // Iterate through original Udemy sections to maintain order
        currentUdemyData.sections.forEach((udemySectionFromScrape, sectionIdx) => {
            let lessonsForThisSectionInMasterPlan = [];
            let allocatedSectionIntroSlide = null;
            let lessonCounterForPProNaming = 0; // 1-based index for matched lessons within this section for PPro naming

            // Check if this section has any matched videos
            const hasMatchedVideoInSection = udemyLessonsForMatchingGlobal.some(
                ul => ul.originalSectionIndex === sectionIdx && ul.matchedLocalFile
            );

            if (hasMatchedVideoInSection) {
                allocatedSectionIntroSlide = getNextAvailableSequentialSlide(); // Assign section intro slide
            }

            // Iterate through Udemy lessons *within this section* based on their original scraped order
            udemyLessonsForMatchingGlobal.filter(ul => ul.originalSectionIndex === sectionIdx)
                .sort((a,b) => a.originalLessonIndexInScrapedSection - b.originalLessonIndexInScrapedSection) // Ensure original order
                .forEach(matchedUdemyLessonInfo => {
                    if (matchedUdemyLessonInfo.matchedLocalFile) { // Only process lessons that were matched
                        lessonCounterForPProNaming++;
                        let lessonEntry = {
                            lessonTitle: matchedUdemyLessonInfo.udemyTitle,
                            udemyDuration: matchedUdemyLessonInfo.originalUdemyDurationStr,
                            lessonIndexInSection: lessonCounterForPProNaming, // This is the 1-based index for PPro sequence naming
                            originalUdemyIndexInScrapedSection: matchedUdemyLessonInfo.originalLessonIndexInScrapedSection,
                            blankSlide1: null,
                            blankSlide2: null,
                            lessonIntroSlide: getNextAvailableSequentialSlide(),
                            matchedVideoFile: matchedUdemyLessonInfo.matchedLocalFile,
                            lessonOutroSlide: getNextAvailableSequentialSlide()
                        };

                        // Add Slide1 and Slide2 before the first video in each section
                        if (lessonCounterForPProNaming === 1) { // First video in this section
                            lessonEntry.blankSlide1 = getFixedSlide(1);
                            lessonEntry.blankSlide2 = getFixedSlide(2);
                            if (!lessonEntry.blankSlide1) planMessages.push({text: "Warning: Slide1.tif (or variant) expected but not found for first video in section.", type: "info"});
                            if (!lessonEntry.blankSlide2) planMessages.push({text: "Warning: Slide2.tif (or variant) expected but not found for first video in section.", type: "info"});
                        }
                        lessonsForThisSectionInMasterPlan.push(lessonEntry);
                    }
                });

            // Add section to master plan only if it contains matched lessons
            if (lessonsForThisSectionInMasterPlan.length > 0) {
                let sectionEntry = {
                    udemySectionTitle: udemySectionFromScrape.sectionTitle,
                    sectionIndex: sectionIdx, // Original 0-based index from scrape
                    sectionIntroSlide: allocatedSectionIntroSlide,
                    lessons: lessonsForThisSectionInMasterPlan
                };
                masterPlan.sections.push(sectionEntry);
            }
        });

        // Assign global lesson index for easier processing in Premiere Pro if needed
        let globalLessonCounter = 0;
        masterPlan.sections.forEach(section => {
            section.lessons.forEach(lesson => {
                lesson.globalLessonIndex = globalLessonCounter++;
            });
        });

        if (masterPlanDisplay) masterPlanDisplay.value = JSON.stringify(masterPlan, null, 2);

        // Save Master Plan to file
        try {
             const safeCourseName = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
             const projectDataFolder = path.join(currentBaseDirectory, "_03_PROJECT_DATA");
             if (!fs.existsSync(projectDataFolder)) { fs.mkdirSync(projectDataFolder, { recursive: true }); }

             currentMasterPlanPath = path.join(projectDataFolder, `${safeCourseName}_MasterPlan.json`).replace(/\\/g, '/');
             fs.writeFileSync(currentMasterPlanPath, JSON.stringify(masterPlan, null, 2));
             planMessages.push({text: `Master Plan saved to: ${currentMasterPlanPath}`, type: "success"});
             if (generatePremiereProjectButton) generatePremiereProjectButton.disabled = false; // Enable PPro button
        } catch (e) {
            planMessages.push({text: `Error saving Master Plan: ${e.message}`, type: "error"});
            if (generatePremiereProjectButton) generatePremiereProjectButton.disabled = true;
            console.error("Error saving Master Plan:", e);
        }

        // Display final status messages
        const finalStatusType = planMessages.some(m => m.type === 'error') ? 'error' : (planMessages.some(m => m.type === 'info' || m.text.toLowerCase().includes("warning")) ? 'info' : 'success');
        updateStatus(planStatus, planMessages.map(m => m.text).join("\n"), finalStatusType, true);
        return true;
    }


    // --- Event Listeners for Plan Generation Buttons ---
    if (validateAndPlanButton) {
        validateAndPlanButton.onclick = function() {
            updateStatus(planStatus, "Starting validation and planning...", "info", false);
            udemyLessonsForMatchingGlobal = []; // Reset matching data for a fresh run
            generatePlanLogic(false); // isRegenerating = false
        };
    }

    if (regeneratePlanButton) {
        regeneratePlanButton.onclick = function() {
            updateStatus(planStatus, "Re-validating slides and regenerating Master Plan (using existing video matches)...", "info", false);
            if (udemyLessonsForMatchingGlobal.length === 0 && !IS_CLIENT_TEST_MODE) {
                updateStatus(planStatus, "Error: Video matching data not available. Please run 'Validate & Generate Master Plan' first to establish matches.", "error", true);
                return;
            }
            // In test mode, udemyLessonsForMatchingGlobal might be populated from the hardcoded JSON.
            // The generatePlanLogic(true) will re-evaluate slides based on these existing matches.
            generatePlanLogic(true); // isRegenerating = true
        }
    }


    // --- Phase 3: Generate Premiere Pro Project Content ---
    if (generatePremiereProjectButton) {
        generatePremiereProjectButton.onclick = function() {
            let masterPlanStringForEval;
            let premiereProjPathForEval;

            if (premiereProgressContainer) premiereProgressContainer.style.display = 'block';
            if (premiereProgressBar) {
                premiereProgressBar.style.width = '0%';
                premiereProgressBar.classList.add('indeterminate');
            }

            if (IS_CLIENT_TEST_MODE && currentMasterPlanPath === "CLIENT_TEST_MODE_PLAN_LOADED") {
                // This logic for test mode needs to be carefully managed.
                // If currentMasterPlanPath is set to a specific string, it implies test plan from display.
                updateStatus(premiereStatus, "CLIENT TEST MODE: Using Master Plan from display for Premiere Pro...", "info");
                masterPlanStringForEval = masterPlanDisplay.value;
                try {
                    const testPlanObj = JSON.parse(masterPlanStringForEval);
                    if (!testPlanObj.premiereProjectFile) {
                        updateStatus(premiereStatus, "Error: Test Master Plan JSON in display is missing 'premiereProjectFile'.", "error", true);
                        if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                        if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                        return;
                    }
                    premiereProjPathForEval = testPlanObj.premiereProjectFile.replace(/\\\\/g, '/').replace(/\\/g, '/');
                } catch (e) {
                    updateStatus(premiereStatus, `Error: Invalid Test Master Plan JSON in display: ${e.message}`, "error", true);
                    if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                    if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                    return;
                }
            } else { // Normal operation: Read from saved Master Plan file
                if (!currentMasterPlanPath || !fs.existsSync(currentMasterPlanPath)) {
                    updateStatus(premiereStatus, "Error: Master Plan JSON file not found or not generated yet. Please complete Step 2 successfully.", "error", true);
                    if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                    if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                    return;
                }
                try {
                    masterPlanStringForEval = fs.readFileSync(currentMasterPlanPath, 'utf8');
                    const loadedPlanObj = JSON.parse(masterPlanStringForEval); // Validate it's good JSON
                     if (!loadedPlanObj.premiereProjectFile) {
                         updateStatus(premiereStatus, "Error: Loaded Master Plan JSON from file is missing 'premiereProjectFile'.", "error", true);
                        if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                        if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                        return;
                    }
                    premiereProjPathForEval = loadedPlanObj.premiereProjectFile.replace(/\\\\/g, '/').replace(/\\/g, '/');
                } catch (e) {
                    updateStatus(premiereStatus, `Error reading or parsing Master Plan from file '${currentMasterPlanPath}': ${e.message}`, "error", true);
                    if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                    if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                    return;
                }
            }

            if (!premiereProjPathForEval) {
                updateStatus(premiereStatus, "Error: Premiere Pro project path could not be determined from the Master Plan.", "error", true);
                if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                return;
            }
            // It's the ExtendScript's job to check if the project file exists and is open.
            // The panel should ensure the path is passed correctly.

            updateStatus(premiereStatus, "Processing in Premiere Pro... This may take some time depending on the number of assets and sequences.", "info");
            console.log("ClientJS: Calling ExtendScript processMasterPlanInPremiere.");
            console.log("ClientJS: Premiere Project Path for ExtendScript: " + premiereProjPathForEval);

            // Pass the Master Plan as a string, and the project path.
            // ExtendScript will parse the JSON string.
            const callStr = `processMasterPlanInPremiere(${JSON.stringify(masterPlanStringForEval)}, "${escapeStringForExtendScript(premiereProjPathForEval)}")`;
            // Note: JSON.stringify(masterPlanStringForEval) will double-encode the JSON string if masterPlanStringForEval is already a string.
            // It should be: 'processMasterPlanInPremiere(' + JSON.stringify(JSON.parse(masterPlanStringForEval)) + ...
            // Or, more simply, pass the string directly if ExtendScript's JSON.parse can handle it:
            // const callStr = `processMasterPlanInPremiere(${masterPlanStringForEval}, ... )` -> This is risky if masterPlanStringForEval contains characters that break the evalScript.
            // Best: ensure masterPlanStringForEval is a valid JSON string, then stringify it for transport.
            // The premiere.jsx script uses JSON.parse on the first argument. So, the string itself needs to be passed,
            // but properly escaped for evalScript.
            // Let's ensure the string passed to evalScript is a valid JavaScript string literal containing the JSON.
             const escapedJsonString = JSON.stringify(masterPlanStringForEval); // This will create a JS string like "\"{\\\"key\\\": ...}\""
             const finalCallStr = `processMasterPlanInPremiere(${escapedJsonString}, "${escapeStringForExtendScript(premiereProjPathForEval)}")`;


            csInterface.evalScript(finalCallStr, function(result) {
                console.log("ClientJS: ExtendScript processMasterPlanInPremiere raw result:", result);
                if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');

                if (result && typeof result === 'string') {
                    if (result.toLowerCase().startsWith("error:")) {
                        updateStatus(premiereStatus, result, "error", true);
                    } else if (result.toLowerCase().startsWith("success:")) {
                        updateStatus(premiereStatus, result, "success", true);
                    } else {
                         updateStatus(premiereStatus, "Premiere Pro processing finished. Result: " + result, "info", true);
                    }
                } else if (result && typeof result === 'object' && result.hasOwnProperty('status')) { // If ExtendScript returns structured JSON
                    if (result.status === "complete" || result.status === "success") {
                         updateStatus(premiereStatus, result.message || "Premiere Pro processing complete!", "success", true);
                    } else if (result.status === "error") {
                         updateStatus(premiereStatus, result.message || "Error from Premiere Pro script.", "error", true);
                    } else {
                        updateStatus(premiereStatus, result.message || "Update from Premiere Pro.", "info", true);
                    }
                }
                else {
                    updateStatus(premiereStatus, "Unknown or no response from Premiere Pro script. Check ExtendScript console for errors.", "error", true);
                }
            });
        };
    }

    // --- Autofill for Prototyping/Testing (if IS_CLIENT_TEST_MODE is true) ---
    if (IS_CLIENT_TEST_MODE) {
        console.log("CLIENT TEST MODE IS ACTIVE. Applying test data...");
        if (courseNameInput && udemyUrlInput && baseDirectoryInput && rawVideoPathInput && slidePathInput && masterPlanDisplay && validateAndPlanButton) {
            try {
                const testPlan = JSON.parse(HARDCODED_TEST_MASTER_PLAN_JSON_STRING);
                courseNameInput.value = testPlan.courseTitle || "Test Course from JSON";

                // Try to derive base directory from test plan if possible
                if (testPlan.baseVideoPath) {
                    const parts = testPlan.baseVideoPath.replace(/\\/g, '/').split('/');
                    if (parts.length > 2) { // e.g., H:/Temp/projects/CourseName/_01_RAW_VIDEOS -> H:/Temp/projects
                        baseDirectoryInput.value = parts.slice(0, parts.length - 2).join('/');
                    } else { baseDirectoryInput.value = "C:/Temp/PProPluginTest"; } // Fallback
                } else { baseDirectoryInput.value = "C:/Temp/PProPluginTest"; }

                udemyUrlInput.value = "https://www.udemy.com/course/example-test-course/"; // Dummy URL for test mode

                // Simulate Step 1 completion for path setup
                currentCourseName = courseNameInput.value;
                const safeCourseNameForPath = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
                currentBaseDirectory = path.join(baseDirectoryInput.value, safeCourseNameForPath).replace(/\\/g, '/');

                rawVideoPathInput.value = testPlan.baseVideoPath || path.join(currentBaseDirectory, "_01_RAW_VIDEOS").replace(/\\/g, '/');
                slidePathInput.value = testPlan.baseSlidePath || path.join(currentBaseDirectory, "_02_SLIDES").replace(/\\/g, '/');

                // Simulate fetched Udemy data and local files for planning
                currentUdemyData = { // Simplified version of what scraper would produce
                    courseTitle: testPlan.courseTitle,
                    sections: testPlan.sections.map(s => ({
                        sectionTitle: s.udemySectionTitle,
                        lessons: s.lessons.map(l => ({ lessonTitle: l.lessonTitle, duration: l.udemyDuration }))
                    }))
                };
                if(udemyDataDisplay) udemyDataDisplay.value = JSON.stringify(currentUdemyData, null, 2);

                // Simulate local video details based on test plan
                localVideoDetails = testPlan.sections.flatMap(s => s.lessons.map(l => ({
                    fileName: l.matchedVideoFile,
                    durationSeconds: parseUdemyDurationToSeconds(l.udemyDuration),
                    isMatched: false, // Will be set by generatePlanLogic
                    error: null
                }))).filter(v => v.fileName); // Only include if matchedVideoFile exists
                if(localVideoFilesDisplay) localVideoFilesDisplay.value = localVideoDetails.map(v => `${v.fileName} (${v.durationSeconds}s)`).join('\n');


                console.log("CLIENT TEST MODE: Autofilled fields. Triggering 'Validate and Plan' to use hardcoded data for Master Plan generation.");
                updateStatus(scraperStatus, "Success: Test Udemy data loaded.", "success");
                updateStatus(localFileStatus, `Success: Test local video data loaded (${localVideoDetails.length} videos).`, "success");

                // Automatically click "Validate and Plan" to process the hardcoded data
                // This will use the currentUdemyData and localVideoDetails populated above
                validateAndPlanButton.click();
                // After this, currentMasterPlanPath might be set, or we can use a flag for test mode.
                // For Premiere Pro step in test mode, we might directly use the hardcodedTestMasterPlanJsonString.
                currentMasterPlanPath = "CLIENT_TEST_MODE_PLAN_LOADED"; // Special flag
                if (generatePremiereProjectButton) generatePremiereProjectButton.disabled = false;


            } catch (e) {
                console.error("Error applying test mode data:", e);
                updateStatus(dirSetupStatus, "Error: Failed to apply test data: " + e.message, "error");
            }
        } else {
            console.warn("CLIENT TEST MODE: Some DOM elements for test mode are missing.");
        }
    }
    // --- End Autofill for Prototyping ---

    console.log("Video Automation Hub panel initialization complete.");
};
