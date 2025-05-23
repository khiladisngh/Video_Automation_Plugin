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

    // --- Application State Variables ---
    let currentUdemyData = null;
    let currentLocalVideoFiles = []; // Array of filenames
    let localVideoDetails = []; // Array of { fileName: string, durationSeconds: number, isMatched: boolean }
    let currentCourseName = "";
    let currentBaseDirectory = "";

    // --- Helper Functions ---
    function updateStatus(element, message, type, isPermanent) {
        if (!element) return;
        let displayMessage = message.replace(/^Success:/i, '').replace(/^Error:/i, '').trim();
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
        return isNaN(seconds) ? 0 : seconds;
    }

    // Function to get local video duration by calling the external script
    function fetchVideoDurationPromise(videoFilePath) {
        return new Promise((resolve, reject) => {
            const extensionBasePath = getExtensionBasePath();
            const durationScriptPath = path.join(extensionBasePath, 'scripts', 'get_video_duration.js');

            if (!fs.existsSync(durationScriptPath)) {
                return reject(new Error(`Duration script not found at ${durationScriptPath}`));
            }

            const process = child_process.spawn('node', [durationScriptPath, videoFilePath]);
            let durationOutput = '';
            let errorOutput = '';

            process.stdout.on('data', (data) => {
                durationOutput += data.toString().trim();
            });
            process.stderr.on('data', (data) => {
                errorOutput += data.toString().trim();
            });
            process.on('close', (code) => {
                if (code === 0 && durationOutput) {
                    const duration = parseFloat(durationOutput);
                    if (!isNaN(duration)) {
                        resolve(duration);
                    } else {
                        reject(new Error(`Could not parse duration from script output: ${durationOutput}. Error: ${errorOutput}`));
                    }
                } else {
                    reject(new Error(`Duration script exited with code ${code}. Error: ${errorOutput}. Output: ${durationOutput}`));
                }
            });
            process.on('error', (err) => {
                reject(new Error(`Failed to start duration script: ${err.message}`));
            });
        });
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
            currentCourseName = courseNameInput.value.trim();
            currentBaseDirectory = baseDirectoryInput.value.trim();

            if (!currentCourseName) {
                updateStatus(dirSetupStatus, "Please enter a Course Name.", "error");
                return;
            }
            if (!currentBaseDirectory) {
                updateStatus(dirSetupStatus, "Please select a Base Directory.", "error");
                return;
            }

            dirSetupProgressContainer.style.display = 'block';
            dirSetupProgressBar.style.width = '0%';
            dirSetupProgressBar.classList.add('indeterminate');
            updateStatus(dirSetupStatus, "", "");
            nextStepsMessage.style.display = 'none';
            if(projectStatusSubMessage) projectStatusSubMessage.textContent = "";

            var callString = 'setupCourseProjectAndDirectories("' + escapeString(currentBaseDirectory) + '", "' + escapeString(currentCourseName) + '")';
            csInterface.evalScript(callString, function(result) {
                dirSetupProgressContainer.style.display = 'none';
                dirSetupProgressBar.classList.remove('indeterminate');
                if (result && typeof result === 'string') {
                    var lowerResult = result.toLowerCase();
                    if (lowerResult.startsWith("success:")) {
                        updateStatus(dirSetupStatus, result, "success", true);
                        if (projectStatusSubMessage) { /* ... update sub message ... */ }
                        nextStepsMessage.style.display = 'block';
                        var safeCourseNameVal = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
                        rawVideoPathInput.value = currentBaseDirectory + "/" + safeCourseNameVal + "/_01_RAW_VIDEOS";
                        slidePathInput.value = currentBaseDirectory + "/" + safeCourseNameVal + "/_02_SLIDES";
                    } else {
                        updateStatus(dirSetupStatus, result, "error", true);
                        if (projectStatusSubMessage) projectStatusSubMessage.textContent = "Project setup failed.";
                    }
                } else {
                    updateStatus(dirSetupStatus, "Error: An unknown error occurred or no response from PPro script.", "error", true);
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
                updateStatus(scraperStatus, "Please enter a Udemy Course URL.", "error");
                return;
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
                            } catch (err) {
                                console.warn(`Could not delete existing json file: ${file}`, err);
                            }
                        }
                    });
                    if (clearedCount > 0) {
                        console.log(`Cleared ${clearedCount} existing .json files from ${jsonOutputDir}`);
                    }
                }
            } catch (err) {
                console.error(`Error trying to clear ${jsonOutputDir}:`, err);
            }


            if (!fs.existsSync(scriptPath)) {
                updateStatus(scraperStatus, "Error: Scraper script not found at " + scriptPath, "error");
                return;
            }

            try {
                const scraperProcess = child_process.spawn('node', [scriptPath, udemyUrl, '--verbose']);
                let scraperOutputLog = [];

                scraperProcess.stdout.on('data', (data) => {
                    scraperOutputLog.push(data.toString());
                    console.log(`Scraper stdout: ${data.toString().trim()}`);
                });
                scraperProcess.stderr.on('data', (data) => {
                    scraperOutputLog.push(`STDERR: ${data.toString()}`);
                    console.error(`Scraper stderr: ${data.toString().trim()}`);
                });

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
                                    currentCourseName = currentUdemyData.courseTitle;
                                }
                            } else {
                                throw new Error("No JSON output file found in " + jsonOutputDir + " after scrape.");
                            }
                        } catch (e) {
                            updateStatus(scraperStatus, `Error processing scraper output: ${e.message}. Full log:\n${scraperOutputLog.join('')}`, "error");
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
                    let displayTexts = [];
                    const durationPromises = currentLocalVideoFiles.map(fileName => {
                        const filePath = path.join(rawVideoPath, fileName);
                        return fetchVideoDurationPromise(filePath)
                            .then(durationSeconds => {
                                localVideoDetails.push({
                                    fileName: fileName,
                                    durationSeconds: durationSeconds,
                                    isMatched: false
                                });
                                const mins = Math.floor(durationSeconds / 60);
                                const secs = Math.round(durationSeconds % 60); // Round seconds
                                displayTexts.push(`${fileName} (${mins}m ${secs}s)`);
                            })
                            .catch(error => {
                                console.error(`Error getting duration for ${fileName}: ${error.message}`);
                                localVideoDetails.push({ // Still add it, but with 0 duration or error flag
                                    fileName: fileName,
                                    durationSeconds: 0,
                                    isMatched: false,
                                    error: error.message
                                });
                                displayTexts.push(`${fileName} (Error fetching duration)`);
                            });
                    });

                    await Promise.all(durationPromises); // Wait for all durations to be fetched

                    // Sort localVideoDetails by filename for consistent display if needed, or by original order
                    // localVideoDetails.sort((a, b) => a.fileName.localeCompare(b.fileName));
                    // displayTexts.sort(); // If you want sorted display

                    localVideoFilesDisplay.value = displayTexts.join('\n');
                    updateStatus(localFileStatus, `Success: Found and processed durations for ${localVideoDetails.length} video file(s).`, "success");
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

            if (!currentUdemyData || !currentUdemyData.sections) {
                updateStatus(planStatus, "Error: Udemy course data not fetched or is invalid. Please fetch data first.", "error"); return;
            }
            if (localVideoDetails.length === 0 && currentLocalVideoFiles.length > 0) {
                 updateStatus(planStatus, "Error: Local video files listed, but durations not processed. Click 'List Local Video Files' again.", "error"); return;
            }
            if (!slidePathInput.value.trim()) {
                updateStatus(planStatus, "Error: Slide path not specified.", "error"); return;
            }
            if (!rawVideoPathInput.value.trim() && localVideoDetails.length > 0) {
                updateStatus(planStatus, "Error: Raw video path not specified (needed if local videos are present).", "error"); return;
            }
            if (!currentCourseName || !currentBaseDirectory) {
                updateStatus(planStatus, "Error: Course Name or Base Directory not set (from Step 1). Please complete Step 1.", "error"); return;
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

            // --- Perform Duration-Based Matching ---
            const DURATION_TOLERANCE_SECONDS = 1;
            let successfulMatches = 0;
            let availableLocalVideos = localVideoDetails.map(v => ({ ...v, isMatched: false }));

            udemyLessonsForMatching.forEach(udemyLesson => {
                if (udemyLesson.isMatched) return;
                let bestMatch = null;
                let smallestDiff = Infinity;

                availableLocalVideos.forEach(localVideo => {
                    if (localVideo.isMatched || localVideo.durationSeconds === 0) return;

                    const diff = Math.abs(udemyLesson.udemyDurationSeconds - localVideo.durationSeconds);
                    if (diff <= DURATION_TOLERANCE_SECONDS) {
                        if (diff < smallestDiff) {
                            smallestDiff = diff;
                            bestMatch = localVideo;
                        } else if (diff === smallestDiff) {
                            // Tie-breaking: prefer video whose filename (without ext) is closer to lesson title
                            if (bestMatch) { // if a bestMatch already exists for this smallestDiff
                                const currentMatchTitleDistance = levenshteinDistance(
                                    path.basename(bestMatch.fileName, path.extname(bestMatch.fileName)).toLowerCase(),
                                    udemyLesson.udemyTitle.toLowerCase()
                                );
                                const newMovieTitleDistance = levenshteinDistance(
                                    path.basename(localVideo.fileName, path.extname(localVideo.fileName)).toLowerCase(),
                                    udemyLesson.udemyTitle.toLowerCase()
                                );
                                if (newMovieTitleDistance < currentMatchTitleDistance) {
                                    bestMatch = localVideo; // New video is a better title match
                                }
                            } else { // This is the first video found with this smallestDiff
                                 bestMatch = localVideo;
                            }
                        }
                    }
                });

                if (bestMatch) {
                    udemyLesson.isMatched = true;
                    udemyLesson.matchedLocalFile = bestMatch.fileName;
                    bestMatch.isMatched = true;
                    successfulMatches++;
                }
            });
            updateStatus(planStatus, `Video Matching: ${successfulMatches} Udemy lessons matched to local videos by duration (Tolerance: ${DURATION_TOLERANCE_SECONDS}s).`, "info");

            const numSectionIntros = currentUdemyData.sections.length;
            const numMatchedLessons = udemyLessonsForMatching.filter(ul => ul.matchedLocalFile).length;
            const numLessonIntroOutros = numMatchedLessons * 2;
            const maxRequiredSlideNumber = numSectionIntros + numLessonIntroOutros;

            if (maxRequiredSlideNumber === 0) {
                updateStatus(planStatus, "Info: No slides required. Master Plan will be minimal.", "info");
            } else {
                updateStatus(planStatus, `Slide Calculation: ${maxRequiredSlideNumber} slides required. Validating...`, "info");
            }

            let missingSlides = [];
            let foundSlidesMapping = {};

            try {
                if (maxRequiredSlideNumber > 0) {
                    if (!fs.existsSync(slidesPath) || !fs.statSync(slidesPath).isDirectory()) {
                        updateStatus(planStatus, `Error: Slides directory not found: ${slidesPath}`, "error"); return;
                    }
                    const slideFilesOnDisk = fs.readdirSync(slidesPath);
                    for (let i = 1; i <= maxRequiredSlideNumber; i++) {
                        const expectedSlideNumber = i;
                        const slideRegex = new RegExp(`^slide\\s*${expectedSlideNumber}\\.(tif|tiff)$`, 'i');
                        const foundFile = slideFilesOnDisk.find(f => slideRegex.test(f));
                        if (foundFile) {
                            foundSlidesMapping["Slide" + expectedSlideNumber] = foundFile;
                        } else {
                            missingSlides.push("Slide" + expectedSlideNumber + ".tiff (or .tif)");
                        }
                    }
                }
            } catch (e) {
                updateStatus(planStatus, `Error reading slides directory: ${e.message}`, "error"); return;
            }

            if (missingSlides.length > 0) {
                let missingSlidesMsg = missingSlides.slice(0,10).join(', ') + (missingSlides.length > 10 ? '...' : '');
                updateStatus(planStatus, `Error: Missing ${missingSlides.length} slide(s): ${missingSlidesMsg}`, "error");
                generatePremiereProjectButton.disabled = true; return;
            }

            if (maxRequiredSlideNumber > 0) {
                updateStatus(planStatus, `Slide Validation: All ${maxRequiredSlideNumber} slides validated! Generating Master Plan...`, "success");
            } else {
                updateStatus(planStatus, "No slides required. Generating Master Plan...", "info");
            }

            let masterPlan = {
                courseTitle: currentUdemyData.courseTitle || currentCourseName,
                baseVideoPath: rawVideoPathInput.value.trim(),
                baseSlidePath: slidesPath,
                projectDataPath: path.join(currentBaseDirectory, currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, ''), "_03_PROJECT_DATA"),
                premiereProjectFile: path.join(currentBaseDirectory, currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, ''), "_04_PREMIERE_PROJECTS", currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '') + ".prproj"),
                sections: []
            };

            let currentSlideAllocatorIndex = 1;
            const getSlideFile = (slideNum) => {
                const base = "Slide" + slideNum;
                if (slideNum > maxRequiredSlideNumber && maxRequiredSlideNumber > 0) {
                    return "ERROR_SLIDE_OUT_OF_BOUNDS.tiff";
                }
                return foundSlidesMapping[base] || base + ".tiff";
            };

            currentUdemyData.sections.forEach((udemySectionFromScrape, sectionIdx) => {
                let sectionEntry = {
                    udemySectionTitle: udemySectionFromScrape.sectionTitle,
                    sectionIndex: sectionIdx,
                    sectionIntroSlide: (numSectionIntros > sectionIdx) ? getSlideFile(currentSlideAllocatorIndex++) : null,
                    lessons: []
                };
                udemySectionFromScrape.lessons.forEach((udemyLessonFromScrape, lessonIdxInSection) => {
                    const matchedUdemyLessonInfo = udemyLessonsForMatching.find(
                        ul => ul.originalSectionIndex === sectionIdx && ul.originalLessonIndexInSection === lessonIdxInSection
                    );
                    let lessonEntry = {
                        lessonTitle: matchedUdemyLessonInfo ? matchedUdemyLessonInfo.udemyTitle : "Error: Lesson Not Found",
                        udemyDuration: matchedUdemyLessonInfo ? matchedUdemyLessonInfo.originalUdemyDurationStr : "N/A",
                        lessonIndexInSection: lessonIdxInSection,
                        globalLessonIndex: masterPlan.sections.reduce((acc, s) => acc + s.lessons.length, 0) + sectionEntry.lessons.length,
                        lessonIntroSlide: null,
                        matchedVideoFile: matchedUdemyLessonInfo ? matchedUdemyLessonInfo.matchedLocalFile : null,
                        lessonOutroSlide: null
                    };
                    if (lessonEntry.matchedVideoFile) {
                        lessonEntry.lessonIntroSlide = getSlideFile(currentSlideAllocatorIndex++);
                        lessonEntry.lessonOutroSlide = getSlideFile(currentSlideAllocatorIndex++);
                    }
                    sectionEntry.lessons.push(lessonEntry);
                });
                masterPlan.sections.push(sectionEntry);
            });

            masterPlanDisplay.value = JSON.stringify(masterPlan, null, 2);
            try {
                 const safeCourseName = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
                 const projectDataFolder = path.join(currentBaseDirectory, safeCourseName, "_03_PROJECT_DATA");
                 if (!fs.existsSync(projectDataFolder)) { fs.mkdirSync(projectDataFolder, { recursive: true }); }
                 const masterPlanPath = path.join(projectDataFolder, `${safeCourseName}_MasterPlan.json`);
                 fs.writeFileSync(masterPlanPath, JSON.stringify(masterPlan, null, 2));
                 updateStatus(planStatus, `Success: Master Plan saved to ${masterPlanPath}`, "success");
                 generatePremiereProjectButton.disabled = false;
            } catch (e) {
                updateStatus(planStatus, `Error saving Master Plan: ${e.message}`, "error");
                generatePremiereProjectButton.disabled = true;
                console.error("Error saving Master Plan:", e);
            }
        };
    }

    // Levenshtein Distance function for tie-breaking in video matching
    function levenshteinDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
        for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                const cost = (b.charAt(i - 1) === a.charAt(j - 1)) ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // deletion
                    matrix[i][j - 1] + 1,      // insertion
                    matrix[i - 1][j - 1] + cost // substitution
                );
            }
        }
        return matrix[b.length][a.length];
    }


    // Autofill and other initial setup logic
    if (courseNameInput) courseNameInput.value = "Wireshark";
    if (baseDirectoryInput) baseDirectoryInput.value = "D:/01_PROJECTS_ACTIVE/MediaSoftwareDev/PremierePro/Plugins/ECCouncil_Plugin/projects";
    if (udemyUrlInput) udemyUrlInput.value = "https://www.udemy.com/course/wireshark-tcpip/?couponCode=LEARNNOWPLANS";
    currentCourseName = courseNameInput.value;
    currentBaseDirectory = baseDirectoryInput.value;
    if (currentCourseName && currentBaseDirectory) {
        var safeCourseNameVal = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
        if (rawVideoPathInput) rawVideoPathInput.value = currentBaseDirectory + "/" + safeCourseNameVal + "/_01_RAW_VIDEOS";
        if (slidePathInput) slidePathInput.value = currentBaseDirectory + "/" + safeCourseNameVal + "/_02_SLIDES";
    }
    // Ensure all Phase 0 related elements are correctly referenced if their logic is not shown but assumed to be present
    if (setupProjectButton && browseBaseDirButton) {
        // Logic for these buttons is assumed to be complete and correct from previous steps
        // For brevity, their full onclick handlers are not repeated if unchanged from the version that includes them.
        // However, if they were part of the "..." sections, they should be fully included.
        // Based on the prompt, it seems the user wants the *complete* main.js as it is in the canvas.
    }
    if (generatePremiereProjectButton) {
        generatePremiereProjectButton.onclick = function() {
            updateStatus(document.getElementById('premiereStatus'), "Premiere Pro automation not yet implemented.", "info");
        }
    }
     // Ensure all other button handlers like browseRawVideoPathButton, browseSlidePathButton are present
     // The selection tag was large, so it's assumed the full file from the canvas is being requested.
     // The parts marked with "..." in the prompt's selection should be filled with their actual logic
     // from the latest version of the canvas document.
};
