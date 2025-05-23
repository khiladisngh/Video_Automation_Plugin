window.onload = function() {
    console.log("Panel main.js loaded.");
    var csInterface = new CSInterface();

    // --- Client-side Test Mode Flag ---
    const IS_CLIENT_TEST_MODE = false;

    const hardcodedTestMasterPlanJsonString = `{
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
          "lessonIndexInSection": 2,
          "blankSlide1": "Slide1.TIF",
          "blankSlide2": "Slide2.TIF",
          "lessonIntroSlide": "Slide4.TIF",
          "matchedVideoFile": "SEC-T01-P01.mp4",
          "lessonOutroSlide": "Slide5.TIF",
          "globalLessonIndex": 0
        },
        {
          "lessonTitle": "Preparação do laboratório e requisitos",
          "udemyDuration": "02:22",
          "lessonIndexInSection": 4,
          "blankSlide1": null,
          "blankSlide2": null,
          "lessonIntroSlide": "Slide6.TIF",
          "matchedVideoFile": "SEC-T01-P02.mp4",
          "lessonOutroSlide": "Slide7.TIF",
          "globalLessonIndex": 1
        },
        {
          "lessonTitle": "Preparação do ambiente de laboratório (VM Kali Linux)",
          "udemyDuration": "12:24",
          "lessonIndexInSection": 6,
          "blankSlide1": null,
          "blankSlide2": null,
          "lessonIntroSlide": "Slide8.TIF",
          "matchedVideoFile": "SEC-T01-P04.mp4",
          "lessonOutroSlide": "Slide9.TIF",
          "globalLessonIndex": 2
        },
        {
          "lessonTitle": "Preparação do ambiente de laboratório (VM Windows)",
          "udemyDuration": "09:20",
          "lessonIndexInSection": 7,
          "blankSlide1": null,
          "blankSlide2": null,
          "lessonIntroSlide": "Slide10.TIF",
          "matchedVideoFile": "SEC-T01-P05.mp4",
          "lessonOutroSlide": "Slide11.TIF",
          "globalLessonIndex": 3
        },
        {
          "lessonTitle": "Desativando Firewall e AV na VM do Windows 10",
          "udemyDuration": "03:16",
          "lessonIndexInSection": 10,
          "blankSlide1": null,
          "blankSlide2": null,
          "lessonIntroSlide": "Slide12.TIF",
          "matchedVideoFile": "SEC-T01-P06.mp4",
          "lessonOutroSlide": "Slide13.TIF",
          "globalLessonIndex": 4
        },
        {
          "lessonTitle": "Compartilhando arquivos com a VM",
          "udemyDuration": "03:54",
          "lessonIndexInSection": 11,
          "blankSlide1": null,
          "blankSlide2": null,
          "lessonIntroSlide": "Slide14.TIF",
          "matchedVideoFile": "SEC-T01-P07.mp4",
          "lessonOutroSlide": "Slide15.TIF",
          "globalLessonIndex": 5
        }
      ]
    }
  ]
}`; // Note: lessonIndexInSection is now 1-based for the first matched lesson in test JSON.

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
    var reloadPluginButton = document.getElementById('reloadPluginButton');
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
    var localFileProgressContainer = document.getElementById('localFileProgressContainer');
    var localFileProgressBar = document.getElementById('localFileProgressBar');
    var localFileStatus = document.getElementById('localFileStatus');
    var localVideoFilesDisplay = document.getElementById('localVideoFilesDisplay');
    var unmatchedVideosDisplay = document.getElementById('unmatchedVideosDisplay');
    var validateAndPlanButton = document.getElementById('validateAndPlanButton');
    var regeneratePlanButton = document.getElementById('regeneratePlanButton');
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
    let udemyLessonsForMatchingGlobal = [];


    // --- Helper Functions ---
    function updateStatus(element, message, type, isPermanent, append) {
        if (!element) { console.warn("updateStatus called with null element for message:", message); return; }
        let displayMessage = message;
        if (typeof message === 'string') {
            displayMessage = message.replace(/^Success:/i, '').replace(/^Error:/i, '').trim();
        }

        if (append && element.textContent.trim() !== "") {
            element.textContent += "\n" + displayMessage;
        } else {
            element.textContent = displayMessage;
        }

        if (type) {
            element.className = 'status-message ' + type;
        } else {
            element.className = 'status-message';
            if (element.textContent.toLowerCase().includes("error")) element.classList.add('error');
            else if (element.textContent.toLowerCase().includes("warning")) element.classList.add('info');
            else if (element.textContent.toLowerCase().includes("success")) element.classList.add('success');
        }

        element.style.display = element.textContent.trim() ? 'block' : 'none';
    }

    function escapeString(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");
    }


    function getExtensionBasePath() {
        var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
        return extensionPath.replace(/\\/g, '/');
    }

    function parseUdemyDurationToSeconds(durationStr) {
        if (!durationStr || typeof durationStr !== 'string') return 0;
        const parts = durationStr.split(':').map(Number);
        let seconds = 0;
        if (parts.length === 3) {
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            seconds = parts[0] * 60 + parts[1];
        } else if (parts.length === 1 && !isNaN(parts[0])) {
            seconds = parts[0];
        }
        return isNaN(seconds) ? 0 : Math.round(seconds);
    }

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
                        const roundedDuration = Math.round(duration);
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
                const errMsg = `Failed to start duration script for ${videoFileNameForLog}: ${err.message}`;
                console.error(errMsg, err);
                if (progressCallback) progressCallback(false);
                reject(new Error(errMsg));
            });
        });
    }

    function levenshteinDistance(a = "", b = "") {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
        for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                const cost = (b.charAt(i - 1) === a.charAt(j - 1)) ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }
        return matrix[b.length][a.length];
    }

    // --- Reload Plugin Button ---
    if (reloadPluginButton) {
        reloadPluginButton.onclick = function() {
            console.log("Reloading plugin...");
            window.location.reload();
        };
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
                                    if (baseDirectoryInput.value.trim()) {
                                        currentCourseName = courseNameInput.value;
                                        const parentDir = baseDirectoryInput.value.trim();
                                        const safeName = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
                                        currentBaseDirectory = path.join(parentDir, safeName).replace(/\\/g, '/');
                                        rawVideoPathInput.value = path.join(currentBaseDirectory, "_01_RAW_VIDEOS").replace(/\\/g, '/');
                                        slidePathInput.value = path.join(currentBaseDirectory, "_02_SLIDES").replace(/\\/g, '/');
                                         console.log("Auto-populated paths after Udemy fetch as Step 1 was incomplete.");
                                    }
                                }


                            } else {
                                throw new Error("No JSON output file found after scrape.");
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
            var rawVideoPath = rawVideoPathInput.value.trim();
            if (!rawVideoPath) {
                updateStatus(localFileStatus, "Please specify the Raw Video Path.", "error"); return;
            }
            updateStatus(localFileStatus, "Listing video files and fetching actual durations...", "info");
            localVideoFilesDisplay.value = "Processing...";
            unmatchedVideosDisplay.value = "";
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
                currentLocalVideoFiles = files.filter(file => /\.(mp4|mov|avi|mkv|flv|wmv|mpg|mpeg|m4v)$/i.test(file));

                if (currentLocalVideoFiles.length > 0) {
                    let processedCount = 0;
                    const totalFiles = currentLocalVideoFiles.length;

                    const updateProgress = () => {
                        processedCount++;
                        const percentage = Math.round((processedCount / totalFiles) * 100);
                        if (localFileProgressBar) localFileProgressBar.style.width = percentage + '%';
                        updateStatus(localFileStatus, `Processing durations: ${processedCount} of ${totalFiles}...`, "info");
                    };

                    const durationPromises = currentLocalVideoFiles.map(fileName => {
                        const filePath = path.join(rawVideoPath, fileName);
                        return fetchVideoDurationPromise(filePath, fileName, updateProgress)
                            .then(durationSeconds => ({
                                fileName: fileName,
                                durationSeconds: durationSeconds,
                                isMatched: false,
                                error: null
                            }))
                            .catch(error => {
                                console.error(`Error processing duration for ${fileName}: ${error.message}`);
                                updateProgress();
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
                    if (localFileProgressContainer) localFileProgressContainer.style.display = 'none';
                }
            } catch (err) {
                updateStatus(localFileStatus, `Error listing local files or processing durations: ${err.message}`, "error");
                console.error("Error in listLocalFilesButton.onclick:", err);
                if (localFileProgressContainer) localFileProgressContainer.style.display = 'none';
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


    // --- Function to perform the core plan generation logic ---
    function generatePlanLogic(isRegenerating) {
        let planMessages = [];

        masterPlanDisplay.value = "";
        currentMasterPlanPath = "";
        if(unmatchedVideosDisplay) unmatchedVideosDisplay.value = "";
        if(regeneratePlanButton) regeneratePlanButton.style.display = 'none';

        if (!currentUdemyData || !currentUdemyData.sections) {
            updateStatus(planStatus, "Error: Udemy course data not fetched or is invalid.", "error", true); return false;
        }
        if (currentLocalVideoFiles.length > 0 && localVideoDetails.length === 0) {
             updateStatus(planStatus, "Error: Local video files listed, but durations not processed. Click 'List Local Video Files' again.", "error", true); return false;
        }
        if (!slidePathInput.value.trim()) {
            updateStatus(planStatus, "Error: Slide path not specified.", "error", true); return false;
        }
         if (!rawVideoPathInput.value.trim() && localVideoDetails.length > 0) {
            updateStatus(planStatus, "Error: Raw video path not specified (needed if local videos are present).", "error", true); return false;
        }
        if (!currentCourseName || !currentBaseDirectory) {
            updateStatus(planStatus, "Error: Course Name or Base Directory for the course not set (from Step 1). Please complete Step 1.", "error", true); return false;
        }

        const slidesPath = slidePathInput.value.trim();

        if (!isRegenerating || !udemyLessonsForMatchingGlobal || udemyLessonsForMatchingGlobal.length === 0) {
            udemyLessonsForMatchingGlobal = [];
            currentUdemyData.sections.forEach((section, sectionIdx) => {
                section.lessons.forEach((lesson, lessonIdx_actual) => {
                    udemyLessonsForMatchingGlobal.push({
                        udemyTitle: lesson.lessonTitle,
                        udemyDurationSeconds: parseUdemyDurationToSeconds(lesson.duration),
                        originalSectionIndex: sectionIdx,
                        originalLessonIndexInSection: lesson.lessonIndexInSection !== undefined ? lesson.lessonIndexInSection : lessonIdx_actual,
                        udemySectionTitle: section.sectionTitle,
                        isMatched: false,
                        matchedLocalFile: null,
                        originalUdemyDurationStr: lesson.duration
                    });
                });
            });

            let successfulMatches = 0;
            localVideoDetails.forEach(video => video.isMatched = false);

            console.log("--- Starting Video Matching Process (Revised Logic) ---");
            udemyLessonsForMatchingGlobal.forEach(udemyLesson => {
                if (udemyLesson.isMatched) return;
                let bestMatch = null;
                for (let i = 0; i < localVideoDetails.length; i++) {
                    const localVideo = localVideoDetails[i];
                    if (localVideo.isMatched || localVideo.durationSeconds === 0 || localVideo.error) continue;
                    const exactMatch = (udemyLesson.udemyDurationSeconds === localVideo.durationSeconds);
                    const compensatedMatch = (udemyLesson.udemyDurationSeconds === (localVideo.durationSeconds - 1));
                    if (exactMatch || compensatedMatch) {
                        bestMatch = localVideo;
                        break;
                    }
                }
                if (bestMatch) {
                    udemyLesson.matchedLocalFile = bestMatch.fileName;
                    const originalLocalVideoEntry = localVideoDetails.find(v => v.fileName === bestMatch.fileName);
                    if (originalLocalVideoEntry) {
                        originalLocalVideoEntry.isMatched = true;
                    }
                    successfulMatches++;
                }
            });
            console.log("--- Video Matching Process Ended ---");
            planMessages.push({text: `Video Matching: ${successfulMatches} of ${udemyLessonsForMatchingGlobal.length} Udemy lessons matched.`, type: "info"});
        } else {
            planMessages.push({text: "Re-using previous video matching results.", type: "info"});
        }


        const unmatchedLocalFilesList = localVideoDetails
            .filter(video => !video.isMatched && !video.error)
            .map(video => `${video.fileName} (${Math.floor(video.durationSeconds / 60)}m ${Math.round(video.durationSeconds % 60)}s)`);

        if (unmatchedVideosDisplay) {
            if (unmatchedLocalFilesList.length > 0) {
                unmatchedVideosDisplay.value = "The following local videos were not matched to any Udemy lesson:\n" + unmatchedLocalFilesList.join('\n');
                planMessages.push({
                    text: "WARNING: Some local videos were unmatched. Please review the 'Unmatched Local Video Files' list. If these unmatched videos had corresponding slides (e.g., SlideX.TIF, SlideY.TIF), you should MANUALLY REMOVE those specific slides from your '_02_SLIDES' directory to prevent them from being incorrectly used in sequences for the matched videos.",
                    type: "info"
                });
                if (regeneratePlanButton) regeneratePlanButton.style.display = 'block';
            } else {
                unmatchedVideosDisplay.value = "All local videos (without errors during duration fetching) were successfully matched.";
                if (regeneratePlanButton) regeneratePlanButton.style.display = 'none';
            }
        }

        const sectionsWithMatchedVideosCount = currentUdemyData.sections.filter((section, sectionIdx) =>
            udemyLessonsForMatchingGlobal.some(ul => ul.originalSectionIndex === sectionIdx && ul.matchedLocalFile)
        ).length;
        const numMatchedLocalVideos = udemyLessonsForMatchingGlobal.filter(ul => ul.matchedLocalFile).length;
        const numSequentialSlidesNeeded = sectionsWithMatchedVideosCount + (numMatchedLocalVideos * 2);
        const maxExpectedSlideNumber = (numMatchedLocalVideos > 0 || sectionsWithMatchedVideosCount > 0)
            ? (2 + numSequentialSlidesNeeded)
            : 0;

        planMessages.push({text: `Slide Scan: Expecting up to Slide${maxExpectedSlideNumber} if all were present. Scanning available slides...`, type: "info"});

        let missingEssentialSlides = [];
        let foundSlidesMapping = {};
        let availableSequentialSlideFiles = []; // For "shifting" slides

        try {
            if (maxExpectedSlideNumber > 0) {
                if (!fs.existsSync(slidesPath) || !fs.statSync(slidesPath).isDirectory()) {
                    planMessages.push({text: `Error: Slides directory not found: ${slidesPath}`, type: "error"});
                    updateStatus(planStatus, planMessages.map(m => m.text).join("\n"), 'error', true);
                    return false;
                }
                const slideFilesOnDisk = fs.readdirSync(slidesPath);

                if (numMatchedLocalVideos > 0 || sectionsWithMatchedVideosCount > 0) {
                    for (let i = 1; i <= 2; i++) {
                        const slideRegex = new RegExp(`^slide\\s*${i}\\.(tif|tiff|png|jpg|jpeg)$`, 'i');
                        const foundFile = slideFilesOnDisk.find(f => slideRegex.test(f));
                        if (foundFile) {
                            foundSlidesMapping["Slide" + i] = foundFile;
                        } else {
                            missingEssentialSlides.push(`Slide${i}.tiff (or variant)`);
                        }
                    }
                }

                // Populate foundSlidesMapping for all sequential slides that exist
                // And create the availableSequentialSlideFiles list
                for (let i = 3; i <= maxExpectedSlideNumber; i++) {
                    const slideRegex = new RegExp(`^slide\\s*${i}\\.(tif|tiff|png|jpg|jpeg)$`, 'i');
                    const foundFile = slideFilesOnDisk.find(f => slideRegex.test(f));
                    if (foundFile) {
                        foundSlidesMapping["Slide" + i] = foundFile; // Keep this for direct access if needed
                        availableSequentialSlideFiles.push(foundFile); // Add to the ordered list of available
                    }
                }
                // Note: availableSequentialSlideFiles will be naturally sorted if slideFilesOnDisk was,
                // or if we sort it based on the number extracted from the filename.
                // For simplicity, let's assume they are processed in a way that keeps order,
                // or sort them explicitly if needed:
                availableSequentialSlideFiles.sort((a, b) => {
                    const numA = parseInt(a.match(/slide\s*(\d+)/i)[1], 10);
                    const numB = parseInt(b.match(/slide\s*(\d+)/i)[1], 10);
                    return numA - numB;
                });


            }
        } catch (e) {
            planMessages.push({text: `Error reading slides directory: ${e.message}`, type: "error"});
            updateStatus(planStatus, planMessages.map(m => m.text).join("\n"), 'error', true);
            return false;
        }

        if (missingEssentialSlides.length > 0) {
            let missingMsg = missingEssentialSlides.join(', ');
            planMessages.push({text: `Error: Essential slides missing: ${missingMsg}. These are required if any videos are being processed.`, type: "error"});
            generatePremiereProjectButton.disabled = true;
            updateStatus(planStatus, planMessages.map(m => m.text).join("\n"), 'error', true);
            return false;
        }

        planMessages.push({text: `Slide Validation: All essential slides found. ${availableSequentialSlideFiles.length} sequential slides available for assignment. Generating Master Plan...`, type: "success"});

        let masterPlan = {
            courseTitle: currentUdemyData.courseTitle || currentCourseName,
            baseVideoPath: rawVideoPathInput.value.trim(),
            baseSlidePath: slidesPath,
            projectDataPath: path.join(currentBaseDirectory, "_03_PROJECT_DATA").replace(/\\/g, '/'),
            premiereProjectFile: path.join(currentBaseDirectory, "_04_PREMIERE_PROJECTS", currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '') + ".prproj").replace(/\\/g, '/'),
            sections: []
        };

        let currentAvailableSlideIdx = 0; // Index for availableSequentialSlideFiles
        const getNextAvailableSequentialSlide = () => {
            if (currentAvailableSlideIdx < availableSequentialSlideFiles.length) {
                return availableSequentialSlideFiles[currentAvailableSlideIdx++];
            }
            return null; // No more available sequential slides
        };

        const getFixedSlide = (slideNum) => { // For Slide1 and Slide2
            return foundSlidesMapping["Slide" + slideNum] || null;
        };


        currentUdemyData.sections.forEach((udemySectionFromScrape, sectionIdx) => {
            let lessonsForThisSectionInMasterPlan = [];
            let firstVideoLessonInSectionMasterPlanGenerated = false;
            let allocatedSectionIntroSlide = null;
            let lessonCounterForPPro = 0;

            const hasMatchedVideoInSection = udemySectionFromScrape.lessons.some(lesson => {
                const currentLessonOriginalIndexCheck = lesson.lessonIndexInSection !== undefined
                                                   ? lesson.lessonIndexInSection
                                                   : udemySectionFromScrape.lessons.indexOf(lesson);
                const matchedInfo = udemyLessonsForMatchingGlobal.find(
                    ul => ul.originalSectionIndex === sectionIdx &&
                          ul.originalLessonIndexInSection === currentLessonOriginalIndexCheck
                );
                return matchedInfo && matchedInfo.matchedLocalFile;
            });

            if (hasMatchedVideoInSection) {
                allocatedSectionIntroSlide = getNextAvailableSequentialSlide();
                if (!allocatedSectionIntroSlide) {
                    console.warn("MasterPlan Gen: Ran out of available sequential slides for Section Intro: " + udemySectionFromScrape.sectionTitle);
                }
            }

            udemySectionFromScrape.lessons.forEach((udemyLessonFromScrape, lessonIdxInSection_actual) => {
                const currentLessonOriginalIndex = udemyLessonFromScrape.lessonIndexInSection !== undefined
                                                   ? udemyLessonFromScrape.lessonIndexInSection
                                                   : lessonIdxInSection_actual;

                const matchedUdemyLessonInfo = udemyLessonsForMatchingGlobal.find(
                    ul => ul.originalSectionIndex === sectionIdx && ul.originalLessonIndexInSection === currentLessonOriginalIndex
                );

                if (matchedUdemyLessonInfo && matchedUdemyLessonInfo.matchedLocalFile) {
                    lessonCounterForPPro++;
                    let lessonEntry = {
                        lessonTitle: matchedUdemyLessonInfo.udemyTitle,
                        udemyDuration: matchedUdemyLessonInfo.originalUdemyDurationStr,
                        lessonIndexInSection: lessonCounterForPPro,
                        originalUdemyIndex: currentLessonOriginalIndex,
                        blankSlide1: null,
                        blankSlide2: null,
                        lessonIntroSlide: null,
                        matchedVideoFile: matchedUdemyLessonInfo.matchedLocalFile,
                        lessonOutroSlide: null
                    };

                    lessonEntry.lessonIntroSlide = getNextAvailableSequentialSlide();
                    if (!lessonEntry.lessonIntroSlide) {
                         console.warn("MasterPlan Gen: Ran out of available sequential slides for Lesson Intro: " + lessonEntry.lessonTitle);
                    }
                    lessonEntry.lessonOutroSlide = getNextAvailableSequentialSlide();
                     if (!lessonEntry.lessonOutroSlide) {
                         console.warn("MasterPlan Gen: Ran out of available sequential slides for Lesson Outro: " + lessonEntry.lessonTitle);
                    }

                    if (!firstVideoLessonInSectionMasterPlanGenerated) {
                        lessonEntry.blankSlide1 = getFixedSlide(1);
                        lessonEntry.blankSlide2 = getFixedSlide(2);
                        if (!lessonEntry.blankSlide1) console.warn("MasterPlan Gen: Slide1.TIF (or variant) not found in mapping for first video lesson.");
                        if (!lessonEntry.blankSlide2) console.warn("MasterPlan Gen: Slide2.TIF (or variant) not found in mapping for first video lesson.");
                        firstVideoLessonInSectionMasterPlanGenerated = true;
                    }
                    lessonsForThisSectionInMasterPlan.push(lessonEntry);
                }
            });

            if (lessonsForThisSectionInMasterPlan.length > 0) {
                let sectionEntry = {
                    udemySectionTitle: udemySectionFromScrape.sectionTitle,
                    sectionIndex: sectionIdx,
                    sectionIntroSlide: allocatedSectionIntroSlide,
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

             currentMasterPlanPath = path.join(projectDataFolder, `${safeCourseName}_MasterPlan.json`).replace(/\\/g, '/');
             fs.writeFileSync(currentMasterPlanPath, JSON.stringify(masterPlan, null, 2));
             planMessages.push({text: `Master Plan saved to ${currentMasterPlanPath}`, type: "success"});
             generatePremiereProjectButton.disabled = false;
        } catch (e) {
            planMessages.push({text: `Error saving Master Plan: ${e.message}`, type: "error"});
            generatePremiereProjectButton.disabled = true;
            console.error("Error saving Master Plan:", e);
        }

        const finalStatusType = planMessages.some(m => m.type === 'error') ? 'error' : (planMessages.some(m => m.type === 'info') ? 'info' : 'success');
        updateStatus(planStatus, planMessages.map(m => m.text).join("\n"), finalStatusType, true);
        return true;
    }


    // --- Event Listeners for Buttons ---
    if (validateAndPlanButton) {
        validateAndPlanButton.onclick = function() {
            updateStatus(planStatus, "Starting validation and planning...", "info", false);
            udemyLessonsForMatchingGlobal = [];
            generatePlanLogic(false);
        };
    }

    if (regeneratePlanButton) {
        regeneratePlanButton.onclick = function() {
            updateStatus(planStatus, "Re-validating slides and regenerating Master Plan...", "info", false);
            if (udemyLessonsForMatchingGlobal.length === 0 && !IS_CLIENT_TEST_MODE) { // Check if not in test mode and no prior matching
                updateStatus(planStatus, "Error: Video matching data not available. Please run 'Validate Slides & Generate Master Plan' first.", "error", true);
                return;
            }
             // If in client test mode, udemyLessonsForMatchingGlobal might be empty if the test plan itself is the source
            if (IS_CLIENT_TEST_MODE && hardcodedTestMasterPlanJsonString) {
                try {
                    const testPlan = JSON.parse(hardcodedTestMasterPlanJsonString);
                    // Re-populate udemyLessonsForMatchingGlobal from the test plan for consistency if needed,
                    // or ensure generatePlanLogic can handle it if it's empty in test mode by re-parsing the test JSON.
                    // For now, let's assume generatePlanLogic will handle it or we rely on the initial click of validateAndPlanButton
                    // to populate it even in test mode (which it does via the test JSON loading).
                    console.log("Regenerating plan in test mode. Using existing or test JSON derived matching info.");
                } catch(e) {
                    updateStatus(planStatus, "Error: Could not parse test JSON for regeneration.", "error", true);
                    return;
                }
            }
            generatePlanLogic(true);
        }
    }


    // --- Phase 3: Generate Premiere Pro Project Content ---
    if (generatePremiereProjectButton) {
        generatePremiereProjectButton.onclick = function() {
            let masterPlanStringForEval;
            let premiereProjPathForEval;

            if(premiereProgressContainer) premiereProgressContainer.style.display = 'block';
            if(premiereProgressBar) {
                premiereProgressBar.style.width = '0%';
                premiereProgressBar.classList.add('indeterminate');
            }

            if (IS_CLIENT_TEST_MODE && currentMasterPlanPath === "CLIENT_TEST_MODE_PLAN_LOADED") {
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
            } else {
                if (!currentMasterPlanPath || !fs.existsSync(currentMasterPlanPath)) {
                    updateStatus(premiereStatus, "Error: Master Plan JSON not found or not generated yet. Please complete Step 2.", "error", true);
                    if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                    if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                    return;
                }
                try {
                    masterPlanStringForEval = fs.readFileSync(currentMasterPlanPath, 'utf8');
                    const loadedPlanObj = JSON.parse(masterPlanStringForEval);
                     if (!loadedPlanObj.premiereProjectFile) {
                         updateStatus(premiereStatus, "Error: Loaded Master Plan JSON from file is missing 'premiereProjectFile'.", "error", true);
                        if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                        if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                        return;
                    }
                    premiereProjPathForEval = loadedPlanObj.premiereProjectFile.replace(/\\\\/g, '/').replace(/\\/g, '/');
                } catch (e) {
                    updateStatus(premiereStatus, `Error reading or parsing Master Plan from file: ${e.message}`, "error", true);
                    if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                    if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                    return;
                }
            }

            if (!premiereProjPathForEval) {
                updateStatus(premiereStatus, "Error: Premiere Pro project path could not be determined.", "error", true);
                if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                return;
            }
            if (!fs.existsSync(premiereProjPathForEval)) {
                 updateStatus(premiereStatus, "Error: Premiere Pro project file not found at " + premiereProjPathForEval + ". Ensure Step 1 (Setup Project) was successful and paths in Master Plan are correct.", "error", true);
                if(premiereProgressContainer) premiereProgressContainer.style.display = 'none';
                if(premiereProgressBar) premiereProgressBar.classList.remove('indeterminate');
                return;
            }

            updateStatus(premiereStatus, "Processing in Premiere Pro... This may take some time.", "info");
            console.log("ClientJS: Calling ExtendScript processMasterPlanInPremiere.");
            console.log("ClientJS: Premiere Project Path for ExtendScript: " + premiereProjPathForEval);

            var callStr = 'processMasterPlanInPremiere(' + JSON.stringify(masterPlanStringForEval) + ', "' + escapeString(premiereProjPathForEval) + '")';

            csInterface.evalScript(callStr, function(result) {
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
                } else if (result && typeof result === 'object' && result.hasOwnProperty('status')) {
                    if (result.status === "complete" || result.status === "success") {
                         updateStatus(premiereStatus, result.message || "Premiere Pro processing complete!", "success", true);
                    } else if (result.status === "error") {
                         updateStatus(premiereStatus, result.message || "Error from Premiere Pro script.", "error", true);
                    } else {
                        updateStatus(premiereStatus, result.message || "Update from Premiere Pro.", "info", true);
                    }
                }
                else {
                    updateStatus(premiereStatus, "Unknown or no response from Premiere Pro script. Check ExtendScript console.", "error", true);
                }
            });

        };
    }

    // --- Autofill for Prototyping ---
    if (IS_CLIENT_TEST_MODE) {
        if (courseNameInput) {
            try {
                const testPlan = JSON.parse(hardcodedTestMasterPlanJsonString);
                courseNameInput.value = testPlan.courseTitle || "Wireshark_Test";
            } catch (e) { courseNameInput.value = "Wireshark_Test_JSON_Error"; }
        }
        if (baseDirectoryInput) {
            try {
                const testPlan = JSON.parse(hardcodedTestMasterPlanJsonString);
                if (testPlan.baseVideoPath) {
                    const parts = testPlan.baseVideoPath.replace(/\\/g, '/').split('/');
                    if (parts.length > 2) {
                        baseDirectoryInput.value = parts.slice(0, parts.length - 2).join('/');
                    } else {
                        baseDirectoryInput.value = "H:/Temp/projects";
                    }
                } else {
                     baseDirectoryInput.value = "H:/Temp/projects";
                }
            } catch(e) {
                 baseDirectoryInput.value = "H:/Temp/projects";
            }
        }
        if (udemyUrlInput) {
            udemyUrlInput.value = "https://www.udemy.com/course/wireshark-tcpip";
        }

        if (setupProjectButton) {
            if (courseNameInput.value && baseDirectoryInput.value) {
                currentCourseName = courseNameInput.value;
                const safeCourseNameForPath = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
                currentBaseDirectory = path.join(baseDirectoryInput.value, safeCourseNameForPath).replace(/\\/g, '/');

                try {
                    const testPlan = JSON.parse(hardcodedTestMasterPlanJsonString);
                    rawVideoPathInput.value = testPlan.baseVideoPath || path.join(currentBaseDirectory, "_01_RAW_VIDEOS").replace(/\\/g, '/');
                    slidePathInput.value = testPlan.baseSlidePath || path.join(currentBaseDirectory, "_02_SLIDES").replace(/\\/g, '/');
                } catch(e) {
                    rawVideoPathInput.value = path.join(currentBaseDirectory, "_01_RAW_VIDEOS").replace(/\\/g, '/');
                    slidePathInput.value = path.join(currentBaseDirectory, "_02_SLIDES").replace(/\\/g, '/');
                }
                console.log("CLIENT TEST MODE: Autofilled Step 1 and derived paths for Step 2.");
                if (validateAndPlanButton) {
                    validateAndPlanButton.click();
                    console.log("CLIENT TEST MODE: Automatically triggered 'Validate and Plan' to load test JSON.");
                }
            }
        }
    }
    // --- End Autofill ---
};
