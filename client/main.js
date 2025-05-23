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

    // --- Node.js Dependencies ---
    const child_process = require('child_process');
    const fs = require('fs');
    const path = require('path');

    // --- DOM Elements ---
    var courseNameInput = document.getElementById('courseNameInput');
    var baseDirectoryInput = document.getElementById('baseDirectoryInput');
    var browseBaseDirButton = document.getElementById('browseBaseDirButton');
    var setupProjectButton = document.getElementById('setupProjectButton');
    var dirSetupStatus = document.getElementById('dirSetupStatus');
    var nextStepsMessage = document.getElementById('nextStepsMessage');
    var projectStatusSubMessage = document.getElementById('projectStatusSubMessage');
    var dirSetupProgressContainer = document.getElementById('dirSetupProgressContainer');
    var dirSetupProgressBar = document.getElementById('dirSetupProgressBar');
    var udemyUrlInput = document.getElementById('udemyUrlInput');
    var fetchUdemyDataButton = document.getElementById('fetchUdemyDataButton');
    var scraperStatus = document.getElementById('scraperStatus');
    var udemyDataDisplay = document.getElementById('udemyDataDisplay');
    var rawVideoPathInput = document.getElementById('rawVideoPathInput');
    var browseRawVideoPathButton = document.getElementById('browseRawVideoPathButton');
    var slidePathInput = document.getElementById('slidePathInput');
    var browseSlidePathButton = document.getElementById('browseSlidePathButton');
    var listLocalFilesButton = document.getElementById('listLocalFilesButton');
    var localFileStatus = document.getElementById('localFileStatus');
    var localVideoFilesDisplay = document.getElementById('localVideoFilesDisplay');
    var validateAndPlanButton = document.getElementById('validateAndPlanButton');
    var planStatus = document.getElementById('planStatus');
    var masterPlanDisplay = document.getElementById('masterPlanDisplay');
    var generatePremiereProjectButton = document.getElementById('generatePremiereProjectButton');
    var premiereProgressContainer = document.getElementById('premiereProgressContainer');
    var premiereProgressBar = document.getElementById('premiereProgressBar');
    var premiereStatus = document.getElementById('premiereStatus');


    // --- Application State Variables ---
    let currentUdemyData = null;
    let currentLocalVideoFiles = [];
    let localVideoDetails = [];
    let currentCourseName = "";
    let currentBaseDirectory = "";
    let currentMasterPlanPath = "";


    // --- Helper Functions ---
    function updateStatus(element, message, type, isPermanent) {
        if (!element) { console.warn("updateStatus called with null element for message:", message); return; }
        let displayMessage = message;
        if (typeof message === 'string') {
            displayMessage = message.replace(/^Success:/i, '').replace(/^Error:/i, '').trim();
        }
        element.textContent = displayMessage;
        element.className = 'status-message';
        if (type) { element.classList.add(type); }
        element.style.display = displayMessage ? 'block' : 'none';
    }

    function escapeString(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/\\/g, '/').replace(/"/g, '\\"').replace(/'/g, "\\'");
    }

    function getExtensionBasePath() {
        var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
        return extensionPath.replace(/\\/g, '/');
    }

    function parseUdemyDurationToSeconds(durationStr) {
        if (!durationStr || typeof durationStr !== 'string') return 0;
        const parts = durationStr.split(':').map(Number);
        let seconds = 0;
        if (parts.length === 3) { seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]; }
        else if (parts.length === 2) { seconds = parts[0] * 60 + parts[1]; }
        else if (parts.length === 1 && !isNaN(parts[0])) { seconds = parts[0]; }
        return isNaN(seconds) ? 0 : Math.round(seconds);
    }

    function fetchVideoDurationPromise(videoFilePath, videoFileNameForLog) {
        return new Promise((resolve, reject) => {
            const extensionBasePath = getExtensionBasePath();
            const durationScriptPath = path.join(extensionBasePath, 'scripts', 'get_video_duration.js');
            console.log(`Fetching duration for: ${videoFileNameForLog} at ${videoFilePath}`);
            console.log(`Using duration script: ${durationScriptPath}`);
            if (!fs.existsSync(durationScriptPath)) {
                const errMsg = `Duration script not found at ${durationScriptPath}`;
                console.error(errMsg);
                return reject(new Error(errMsg));
            }
            const process = child_process.spawn('node', [durationScriptPath, videoFilePath]);
            let durationOutput = '';
            let errorOutput = '';
            process.stdout.on('data', (data) => { durationOutput += data.toString().trim(); });
            process.stderr.on('data', (data) => { errorOutput += data.toString().trim(); });
            process.on('close', (code) => {
                console.log(`Duration script for ${videoFileNameForLog} exited with code ${code}.`);
                if (errorOutput) console.error(`Duration script stderr for ${videoFileNameForLog}: ${errorOutput}`);
                if (durationOutput) console.log(`Duration script stdout for ${videoFileNameForLog}: ${durationOutput}`);
                if (code === 0 && durationOutput) {
                    const duration = parseFloat(durationOutput);
                    if (!isNaN(duration)) {
                        const roundedDuration = Math.round(duration);
                        console.log(`Successfully parsed & rounded duration for ${videoFileNameForLog}: ${roundedDuration}s (original: ${duration})`);
                        resolve(roundedDuration);
                    } else {
                        const errMsg = `Could not parse duration for ${videoFileNameForLog} from script output: '${durationOutput}'. Stderr: '${errorOutput}'`;
                        console.error(errMsg); reject(new Error(errMsg));
                    }
                } else {
                    const errMsg = `Duration script for ${videoFileNameForLog} failed (code ${code}). Stderr: '${errorOutput}'. Stdout: '${durationOutput}'`;
                    console.error(errMsg); reject(new Error(errMsg));
                }
            });
            process.on('error', (err) => {
                const errMsg = `Failed to start duration script for ${videoFileNameForLog}: ${err.message}`;
                console.error(errMsg, err); reject(new Error(errMsg));
            });
        });
    }

    function levenshteinDistance(a = "", b = "") {
        if (a.length === 0) return b.length; if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
        for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                const cost = (b.charAt(i - 1) === a.charAt(j - 1)) ? 0 : 1;
                matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
            }
        }
        return matrix[b.length][a.length];
    }

    // --- Phase 0 Event Listeners ---
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
            const courseNameVal = courseNameInput.value.trim();
            const baseDirVal = baseDirectoryInput.value.trim();

            if (!courseNameVal) {
                updateStatus(dirSetupStatus, "Please enter a Course Name.", "error"); return;
            }
            if (!baseDirVal) {
                updateStatus(dirSetupStatus, "Please select a Base Directory for courses.", "error"); return;
            }

            currentCourseName = courseNameVal;
            const safeCourseNameForPath = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
            currentBaseDirectory = path.join(baseDirVal, safeCourseNameForPath).replace(/\\/g, '/');

            dirSetupProgressContainer.style.display = 'block';
            dirSetupProgressBar.style.width = '0%';
            dirSetupProgressBar.classList.add('indeterminate');
            updateStatus(dirSetupStatus, "", "");
            nextStepsMessage.style.display = 'none';
            if(projectStatusSubMessage) projectStatusSubMessage.textContent = "";

            var callString = 'setupCourseProjectAndDirectories("' + escapeString(currentBaseDirectory) + '", "' + escapeString(currentCourseName) + '")';
            console.log("ClientJS: Calling ExtendScript for project setup: " + callString);

            csInterface.evalScript(callString, function(result) {
                dirSetupProgressContainer.style.display = 'none';
                dirSetupProgressBar.classList.remove('indeterminate');
                if (result && typeof result === 'string') {
                    var lowerResult = result.toLowerCase();
                    if (lowerResult.startsWith("success:")) {
                        updateStatus(dirSetupStatus, result, "success", true);
                        if (projectStatusSubMessage) { projectStatusSubMessage.textContent = "A Premiere Pro project has been prepared."; }
                        nextStepsMessage.style.display = 'block';
                        rawVideoPathInput.value = path.join(currentBaseDirectory, "_01_RAW_VIDEOS").replace(/\\/g, '/');
                        slidePathInput.value = path.join(currentBaseDirectory, "_02_SLIDES").replace(/\\/g, '/');
                    } else {
                        updateStatus(dirSetupStatus, result, "error", true);
                        if (projectStatusSubMessage) projectStatusSubMessage.textContent = "Project setup failed.";
                    }
                } else {
                    updateStatus(dirSetupStatus, "Error: An unknown error occurred or no response from PPro script (setup).", "error", true);
                     if (projectStatusSubMessage) projectStatusSubMessage.textContent = "Project setup failed.";
                }
            });
        };
    }

    // --- Phase 1 & 2 Event Listeners ---
     if (fetchUdemyDataButton) {
        fetchUdemyDataButton.onclick = function() {
            var udemyUrl = udemyUrlInput.value.trim();
            if (!udemyUrl) {
                updateStatus(scraperStatus, "Please enter a Udemy Course URL.", "error"); return;
            }
            updateStatus(scraperStatus, "Fetching Udemy course data... This may take a minute.", "info");
            udemyDataDisplay.value = ""; currentUdemyData = null;

            const extensionBasePath = getExtensionBasePath();
            const scriptPath = path.join(extensionBasePath, 'scripts', 'scrape_udemy.js');
            const jsonOutputDir = path.join(extensionBasePath, 'output', 'output_json');

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
                    if (clearedCount > 0) console.log(`Cleared ${clearedCount} existing .json files from ${jsonOutputDir}`);
                }
            } catch (err) { console.error(`Error trying to clear ${jsonOutputDir}:`, err); }

            if (!fs.existsSync(scriptPath)) {
                updateStatus(scraperStatus, "Error: Scraper script not found at " + scriptPath, "error"); return;
            }

            try {
                const scraperProcess = child_process.spawn('node', [scriptPath, udemyUrl, '--verbose']);
                let scraperOutputLog = [];
                scraperProcess.stdout.on('data', (data) => { scraperOutputLog.push(data.toString()); console.log(`Scraper stdout: ${data.toString().trim()}`); });
                scraperProcess.stderr.on('data', (data) => { scraperOutputLog.push(`STDERR: ${data.toString()}`); console.error(`Scraper stderr: ${data.toString().trim()}`); });
                scraperProcess.on('close', (code) => {
                    console.log(`Scraper process exited with code ${code}`);
                    if (code === 0) {
                        try {
                            const files = fs.readdirSync(jsonOutputDir)
                                .filter(fileName => path.extname(fileName).toLowerCase() === '.json')
                                .map(fileName => ({ name: fileName, time: fs.statSync(path.join(jsonOutputDir, fileName)).mtime.getTime() }))
                                .sort((a, b) => b.time - a.time);
                            if (files.length > 0) {
                                const latestJsonFile = path.join(jsonOutputDir, files[0].name);
                                const fileContent = fs.readFileSync(latestJsonFile, 'utf8');
                                currentUdemyData = JSON.parse(fileContent);
                                udemyDataDisplay.value = JSON.stringify(currentUdemyData, null, 2);
                                updateStatus(scraperStatus, "Success: Udemy course data fetched!", "success");
                                if (!courseNameInput.value && currentUdemyData.courseTitle) {
                                    courseNameInput.value = currentUdemyData.courseTitle;
                                    currentCourseName = courseNameInput.value;
                                    if (currentCourseName && baseDirectoryInput.value) {
                                        const parentDir = baseDirectoryInput.value;
                                        const safeName = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
                                        currentBaseDirectory = path.join(parentDir, safeName).replace(/\\/g, '/');
                                        rawVideoPathInput.value = path.join(currentBaseDirectory, "_01_RAW_VIDEOS").replace(/\\/g, '/');
                                        slidePathInput.value = path.join(currentBaseDirectory, "_02_SLIDES").replace(/\\/g, '/');
                                    }
                                }
                            } else { throw new Error("No JSON output file found after scrape."); }
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
            var rawVideoPath = rawVideoPathInput.value.trim();
            if (!rawVideoPath) {
                updateStatus(localFileStatus, "Please specify the Raw Video Path.", "error"); return;
            }
            updateStatus(localFileStatus, "Listing video files and fetching actual durations...", "info");
            localVideoFilesDisplay.value = "Processing... This may take some time for many videos.";
            currentLocalVideoFiles = [];
            localVideoDetails = [];

            try {
                if (!fs.existsSync(rawVideoPath) || !fs.statSync(rawVideoPath).isDirectory()) {
                    updateStatus(localFileStatus, "Error: Raw Video Path does not exist or is not a directory.", "error"); return;
                }
                const files = fs.readdirSync(rawVideoPath);
                currentLocalVideoFiles = files.filter(file => /\.(mp4|mov|avi|mkv|flv|wmv|mpg|mpeg|m4v)$/i.test(file));

                if (currentLocalVideoFiles.length > 0) {
                    const durationPromises = currentLocalVideoFiles.map(fileName => {
                        const filePath = path.join(rawVideoPath, fileName);
                        return fetchVideoDurationPromise(filePath, fileName)
                            .then(durationSeconds => ({
                                fileName: fileName,
                                durationSeconds: durationSeconds,
                                isMatched: false,
                                error: null
                            }))
                            .catch(error => {
                                console.error(`Error processing duration for ${fileName}: ${error.message}`);
                                return {
                                    fileName: fileName,
                                    durationSeconds: 0,
                                    isMatched: false,
                                    error: error.message
                                };
                            });
                    });

                    localVideoDetails = await Promise.all(durationPromises);
                    localVideoDetails.sort((a, b) => a.fileName.localeCompare(b.fileName));

                    let displayTexts = localVideoDetails.map(detail => {
                        if (detail.error) {
                            return `${detail.fileName} (Error: ${detail.error.substring(0, 50)}...)`;
                        }
                        const mins = Math.floor(detail.durationSeconds / 60);
                        const secs = Math.round(detail.durationSeconds % 60);
                        return `${detail.fileName} (${mins}m ${secs}s)`;
                    });

                    localVideoFilesDisplay.value = displayTexts.join('\n');
                    const errorCount = localVideoDetails.filter(d => d.error).length;
                    if (errorCount > 0) {
                        updateStatus(localFileStatus, `Found ${localVideoDetails.length} video(s). Errors fetching duration for ${errorCount} file(s). Check console.`, "error");
                    } else {
                        updateStatus(localFileStatus, `Success: Found and processed durations for ${localVideoDetails.length} video file(s).`, "success");
                    }
                } else {
                    localVideoFilesDisplay.value = "No video files found.";
                    updateStatus(localFileStatus, "No video files found in the specified directory.", "info");
                }
            } catch (err) {
                updateStatus(localFileStatus, `Error listing local files or processing durations: ${err.message}`, "error");
                console.error("Error in listLocalFilesButton.onclick:", err);
            }
        };
    }

    if (browseRawVideoPathButton) {
        browseRawVideoPathButton.onclick = function() {
            var result = window.cep.fs.showOpenDialog(false, true, "Select Raw Videos Folder (_01_RAW_VIDEOS)", rawVideoPathInput.value || "");
            if (result && result.data && result.data.length > 0) {
                rawVideoPathInput.value = result.data[0].replace(/\\/g, '/');
            }
        };
    }
    if (browseSlidePathButton) {
        browseSlidePathButton.onclick = function() {
            var result = window.cep.fs.showOpenDialog(false, true, "Select Slides Folder (_02_SLIDES)", slidePathInput.value || "");
            if (result && result.data && result.data.length > 0) {
                slidePathInput.value = result.data[0].replace(/\\/g, '/');
            }
        };
    }

    // --- Phase 2: Validate Slides & Generate Master Plan ---
    if (validateAndPlanButton) {
        validateAndPlanButton.onclick = function() {
            updateStatus(planStatus, "Starting validation and planning...", "info");
            masterPlanDisplay.value = "";
            currentMasterPlanPath = "";

            if (!currentUdemyData || !currentUdemyData.sections) {
                updateStatus(planStatus, "Error: Udemy course data not fetched or is invalid.", "error"); return;
            }
            if (currentLocalVideoFiles.length > 0 && localVideoDetails.length === 0) {
                 updateStatus(planStatus, "Error: Local video files listed, but durations not processed. Click 'List Local Video Files' again.", "error"); return;
            }
            if (!slidePathInput.value.trim()) {
                updateStatus(planStatus, "Error: Slide path not specified.", "error"); return;
            }
            if (!rawVideoPathInput.value.trim() && localVideoDetails.length > 0) {
                updateStatus(planStatus, "Error: Raw video path not specified (needed if local videos are present).", "error"); return;
            }
            if (!currentCourseName || !currentBaseDirectory) {
                updateStatus(planStatus, "Error: Course Name or Base Directory for the course not set (from Step 1). Please complete Step 1.", "error"); return;
            }

            const slidesPath = slidePathInput.value.trim();

            let udemyLessonsForMatching = [];
            currentUdemyData.sections.forEach((section, sectionIdx) => {
                section.lessons.forEach((lesson, lessonIdx) => {
                    udemyLessonsForMatching.push({
                        udemyTitle: lesson.lessonTitle,
                        udemyDurationSeconds: parseUdemyDurationToSeconds(lesson.duration),
                        originalSectionIndex: sectionIdx,
                        originalLessonIndexInSection: lessonIdx,
                        udemySectionTitle: section.sectionTitle,
                        isMatched: false,
                        matchedLocalFile: null,
                        originalUdemyDurationStr: lesson.duration
                    });
                });
            });

            const DURATION_TOLERANCE_SECONDS = 1;
            let successfulMatches = 0;
            let availableLocalVideos = localVideoDetails.map(v => ({ ...v, isMatched: false }));
            console.log("--- Starting Video Matching Process ---");
            udemyLessonsForMatching.forEach(udemyLesson => {
                if (udemyLesson.isMatched) return;
                let bestMatch = null;
                let smallestDiff = Infinity;
                console.log(`Attempting to match Udemy Lesson: "${udemyLesson.udemyTitle}" (Udemy Duration: ${udemyLesson.udemyDurationSeconds}s)`);
                availableLocalVideos.forEach(localVideo => {
                    if (localVideo.isMatched || localVideo.durationSeconds === 0 || localVideo.error) return;
                    const diff = Math.abs(udemyLesson.udemyDurationSeconds - localVideo.durationSeconds);
                    console.log(`  Comparing with Local Video: "${localVideo.fileName}" (Local Duration: ${localVideo.durationSeconds}s) -> Diff: ${diff}s`);
                    if (diff <= DURATION_TOLERANCE_SECONDS) {
                        if (diff < smallestDiff) {
                            smallestDiff = diff; bestMatch = localVideo;
                            console.log(`    New best match (by diff): ${localVideo.fileName} (Diff: ${diff})`);
                        } else if (diff === smallestDiff && bestMatch) {
                            console.log(`    Tie in duration diff for ${localVideo.fileName}. Current best: ${bestMatch.fileName}. Applying Levenshtein.`);
                            const currentMatchTitleDistance = levenshteinDistance(path.basename(bestMatch.fileName, path.extname(bestMatch.fileName)).toLowerCase(), udemyLesson.udemyTitle.toLowerCase());
                            const newMovieTitleDistance = levenshteinDistance(path.basename(localVideo.fileName, path.extname(localVideo.fileName)).toLowerCase(), udemyLesson.udemyTitle.toLowerCase());
                            console.log(`      Levenshtein: Current (${bestMatch.fileName}): ${currentMatchTitleDistance}, New (${localVideo.fileName}): ${newMovieTitleDistance}`);
                            if (newMovieTitleDistance < currentMatchTitleDistance) {
                                bestMatch = localVideo;
                                console.log(`      New best match (by title similarity): ${localVideo.fileName}`);
                            }
                        }
                    }
                });
                if (bestMatch) {
                    udemyLesson.matchedLocalFile = bestMatch.fileName;
                    const matchedVideoInAvailable = availableLocalVideos.find(v => v.fileName === bestMatch.fileName);
                    if(matchedVideoInAvailable) matchedVideoInAvailable.isMatched = true;
                    successfulMatches++;
                    console.log(`  MATCHED: Udemy "${udemyLesson.udemyTitle}" with Local "${bestMatch.fileName}"`);
                } else {
                    console.log(`  NO MATCH for Udemy "${udemyLesson.udemyTitle}" (Duration: ${udemyLesson.udemyDurationSeconds}s)`);
                }
            });
            console.log("--- Video Matching Process Ended ---");
            updateStatus(planStatus, `Video Matching: ${successfulMatches} of ${udemyLessonsForMatching.length} Udemy lessons matched.`, "info");

            const sectionsWithMatchedVideosCount = currentUdemyData.sections.filter((section, sectionIdx) =>
                udemyLessonsForMatching.some(ul => ul.originalSectionIndex === sectionIdx && ul.matchedLocalFile)
            ).length;
            const numMatchedLocalVideos = udemyLessonsForMatching.filter(ul => ul.matchedLocalFile).length;

            const numSequentialSlidesNeeded = sectionsWithMatchedVideosCount + (numMatchedLocalVideos * 2);
            const maxRequiredSlideNumberToValidate = (numMatchedLocalVideos > 0 || sectionsWithMatchedVideosCount > 0) ? (2 + numSequentialSlidesNeeded) : 0;

            updateStatus(planStatus, (planStatus.textContent ? planStatus.textContent + "\n" : "") +
                `Slide Calculation: Validating Slide1, Slide2 (if needed) and ${numSequentialSlidesNeeded} sequential slides (Slide3 to Slide${2 + numSequentialSlidesNeeded}). Total to check: ${maxRequiredSlideNumberToValidate}`, "info");

            let missingSlides = [];
            let foundSlidesMapping = {};

            try {
                if (maxRequiredSlideNumberToValidate > 0) {
                    if (!fs.existsSync(slidesPath) || !fs.statSync(slidesPath).isDirectory()) {
                        updateStatus(planStatus, `Error: Slides directory not found: ${slidesPath}`, "error"); return;
                    }
                    const slideFilesOnDisk = fs.readdirSync(slidesPath);
                    if (numMatchedLocalVideos > 0 || sectionsWithMatchedVideosCount > 0) {
                        for (let i = 1; i <= 2; i++) {
                            const slideRegex = new RegExp(`^slide\\s*${i}\\.(tif|tiff)$`, 'i');
                            const foundFile = slideFilesOnDisk.find(f => slideRegex.test(f));
                            if (foundFile) { foundSlidesMapping["Slide" + i] = foundFile; }
                            else { missingSlides.push(`Slide${i}.tiff (or .tif)`); }
                        }
                    }
                    for (let i = 1; i <= numSequentialSlidesNeeded; i++) {
                        const expectedSlideNumberInSequence = i + 2;
                        const slideRegex = new RegExp(`^slide\\s*${expectedSlideNumberInSequence}\\.(tif|tiff)$`, 'i');
                        const foundFile = slideFilesOnDisk.find(f => slideRegex.test(f));
                        if (foundFile) { foundSlidesMapping["Slide" + expectedSlideNumberInSequence] = foundFile; }
                        else { missingSlides.push(`Slide${expectedSlideNumberInSequence}.tiff (or .tif)`);}
                    }
                }
            } catch (e) { updateStatus(planStatus, `Error reading slides directory: ${e.message}`, "error"); return; }

            if (missingSlides.length > 0) {
                let missingSlidesMsg = missingSlides.slice(0,10).join(', ') + (missingSlides.length > 10 ? '...' : '');
                updateStatus(planStatus, `Error: Missing ${missingSlides.length} slide(s): ${missingSlidesMsg}`, "error");
                generatePremiereProjectButton.disabled = true; return;
            }

            updateStatus(planStatus, (planStatus.textContent.includes("Video Matching") ? planStatus.textContent + "\n" : "") +
                `Slide Validation: All required slides found! Generating Master Plan...`, "success");

            let masterPlan = {
                courseTitle: currentUdemyData.courseTitle || currentCourseName,
                baseVideoPath: rawVideoPathInput.value.trim(),
                baseSlidePath: slidesPath,
                projectDataPath: path.join(currentBaseDirectory, "_03_PROJECT_DATA"),
                premiereProjectFile: path.join(currentBaseDirectory, "_04_PREMIERE_PROJECTS", currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '') + ".prproj"),
                sections: []
            };
            let sequentialSlideAllocatorIndex = 3;
            const getSlideFile = (slideNum) => {
                const base = "Slide" + slideNum;
                return foundSlidesMapping[base] || base + ".tiff";
            };
            currentUdemyData.sections.forEach((udemySectionFromScrape, sectionIdx) => {
                let lessonsForThisSectionInMasterPlan = [];
                let firstMatchedVideoInSectionFound = false;
                udemySectionFromScrape.lessons.forEach((udemyLessonFromScrape, lessonIdxInSection) => {
                    const matchedUdemyLessonInfo = udemyLessonsForMatching.find(
                        ul => ul.originalSectionIndex === sectionIdx && ul.originalLessonIndexInSection === lessonIdxInSection
                    );
                    if (matchedUdemyLessonInfo && matchedUdemyLessonInfo.matchedLocalFile) {
                        let lessonEntry = {
                            lessonTitle: matchedUdemyLessonInfo.udemyTitle,
                            udemyDuration: matchedUdemyLessonInfo.originalUdemyDurationStr,
                            lessonIndexInSection: lessonIdxInSection,
                            blankSlide1: null, blankSlide2: null,
                            lessonIntroSlide: getSlideFile(sequentialSlideAllocatorIndex++),
                            matchedVideoFile: matchedUdemyLessonInfo.matchedLocalFile,
                            lessonOutroSlide: getSlideFile(sequentialSlideAllocatorIndex++)
                        };
                        if (!firstMatchedVideoInSectionFound) {
                            lessonEntry.blankSlide1 = getSlideFile(1);
                            lessonEntry.blankSlide2 = getSlideFile(2);
                            firstMatchedVideoInSectionFound = true;
                        }
                        lessonsForThisSectionInMasterPlan.push(lessonEntry);
                    }
                });
                if (lessonsForThisSectionInMasterPlan.length > 0) {
                    let sectionEntry = {
                        udemySectionTitle: udemySectionFromScrape.sectionTitle,
                        sectionIndex: sectionIdx,
                        sectionIntroSlide: getSlideFile(sequentialSlideAllocatorIndex++),
                        lessons: lessonsForThisSectionInMasterPlan
                    };
                    masterPlan.sections.push(sectionEntry);
                }
            });
            let globalLessonCounter = 0;
            masterPlan.sections.forEach(section => {
                section.lessons.forEach(lesson => {
                    lesson.globalLessonIndex = globalLessonCounter++;
                });
            });
            masterPlanDisplay.value = JSON.stringify(masterPlan, null, 2);
            try {
                 const safeCourseName = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
                 const projectDataFolder = path.join(currentBaseDirectory, "_03_PROJECT_DATA");
                 if (!fs.existsSync(projectDataFolder)) { fs.mkdirSync(projectDataFolder, { recursive: true }); }
                 currentMasterPlanPath = path.join(projectDataFolder, `${safeCourseName}_MasterPlan.json`);
                 fs.writeFileSync(currentMasterPlanPath, JSON.stringify(masterPlan, null, 2));
                 updateStatus(planStatus, (planStatus.textContent.includes("Video Matching") ? planStatus.textContent + "\n" : "") + `Master Plan saved to ${currentMasterPlanPath}`, "success");
                 generatePremiereProjectButton.disabled = false;
            } catch (e) {
                updateStatus(planStatus, `Error saving Master Plan: ${e.message}`, "error");
                generatePremiereProjectButton.disabled = true;
                console.error("Error saving Master Plan:", e);
            }
        };
    }

    // --- Phase 3: Generate Premiere Pro Project Content ---
    if (generatePremiereProjectButton) {
        generatePremiereProjectButton.onclick = function() {
            if (!currentMasterPlanPath || !fs.existsSync(currentMasterPlanPath)) {
                updateStatus(premiereStatus, "Error: Master Plan JSON not found or not generated yet. Please complete Step 2.", "error");
                return;
            }
            if (!currentBaseDirectory || !currentCourseName){
                 updateStatus(premiereStatus, "Error: Course project not set up. Please complete Step 1 to define course name and base directory.", "error");
                return;
            }

            updateStatus(premiereStatus, "Processing in Premiere Pro... This may take some time.", "info");
            if(premiereProgressContainer) premiereProgressContainer.style.display = 'block';
            if(premiereProgressBar) {
                premiereProgressBar.style.width = '0%';
                premiereProgressBar.classList.add('indeterminate');
            }

            try {
                const masterPlanString = fs.readFileSync(currentMasterPlanPath, 'utf8');
                const safeCourseNameVal = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
                const premiereProjPath = path.join(currentBaseDirectory, "_04_PREMIERE_PROJECTS", safeCourseNameVal + ".prproj").replace(/\\/g, '/');

                if (!fs.existsSync(premiereProjPath)) {
                    updateStatus(premiereStatus, "Error: Premiere Pro project file not found at " + premiereProjPath + ". Please ensure Step 1 (Setup Project) was successful.", "error");
                    if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                    if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                    return;
                }

                console.log("ClientJS: Calling ExtendScript processMasterPlanInPremiere.");
                console.log("ClientJS: Premiere Project Path: " + premiereProjPath);
                console.log("ClientJS: MasterPlan String (first 500 chars): " + masterPlanString.substring(0,500));

                var callStr = 'processMasterPlanInPremiere(' + JSON.stringify(masterPlanString) + ', "' + escapeString(premiereProjPath) + '")';

                csInterface.evalScript(callStr, function(result) {
                    console.log("ClientJS: ExtendScript processMasterPlanInPremiere raw result:", result);
                    if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                    if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');

                    if (result && typeof result === 'string') {
                        if (result.toLowerCase().startsWith("error:")) {
                            updateStatus(premiereStatus, result, "error");
                        } else if (result.toLowerCase().startsWith("success:")) {
                            updateStatus(premiereStatus, result, "success");
                        } else {
                             updateStatus(premiereStatus, "Premiere Pro processing finished. Result: " + result, "info");
                        }
                    } else if (result && typeof result === 'object' && result.hasOwnProperty('status')) {
                        if (result.status === "complete" || result.status === "success") {
                             updateStatus(premiereStatus, result.message || "Premiere Pro processing complete!", "success");
                        } else if (result.status === "error") {
                             updateStatus(premiereStatus, result.message || "Error from Premiere Pro script.", "error");
                        } else {
                            updateStatus(premiereStatus, result.message || "Update from Premiere Pro.", "info");
                        }
                    }
                    else {
                        updateStatus(premiereStatus, "Unknown or no response from Premiere Pro script. Check ExtendScript console.", "error");
                    }
                });

            } catch (e) {
                if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                updateStatus(premiereStatus, `Error preparing to call Premiere Pro: ${e.message}`, "error");
                console.error("Error in generatePremiereProjectButton.onclick:", e);
            }
        };
    }

    // --- Autofill for Prototyping (UPDATED DEFAULTS) ---
    if (courseNameInput) {
        courseNameInput.value = "Wireshark";
    }
    if (baseDirectoryInput) {
        baseDirectoryInput.value = "H:/Temp/projects";
    }
    if (udemyUrlInput) {
        udemyUrlInput.value = "https://www.udemy.com/course/wireshark-tcpip";
    }

    currentCourseName = courseNameInput.value;
    const parentProjectsDir = baseDirectoryInput.value;

    if (currentCourseName && parentProjectsDir) {
        const safeCourseNameForPath = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
        currentBaseDirectory = path.join(parentProjectsDir, safeCourseNameForPath).replace(/\\/g, '/');

        if (rawVideoPathInput) {
            rawVideoPathInput.value = path.join(currentBaseDirectory, "_01_RAW_VIDEOS").replace(/\\/g, '/');
        }
        if (slidePathInput) {
            slidePathInput.value = path.join(currentBaseDirectory, "_02_SLIDES").replace(/\\/g, '/');
        }
    }
    // --- End Autofill ---
};
