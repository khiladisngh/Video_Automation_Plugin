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
    // Phase 0
    var courseNameInput = document.getElementById('courseNameInput');
    var baseDirectoryInput = document.getElementById('baseDirectoryInput');
    var browseBaseDirButton = document.getElementById('browseBaseDirButton');
    var setupProjectButton = document.getElementById('setupProjectButton');
    var dirSetupStatus = document.getElementById('dirSetupStatus');
    var nextStepsMessage = document.getElementById('nextStepsMessage');
    var projectStatusSubMessage = document.getElementById('projectStatusSubMessage');
    var dirSetupProgressContainer = document.getElementById('dirSetupProgressContainer');
    var dirSetupProgressBar = document.getElementById('dirSetupProgressBar');

    // Phase 1 & 2
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
    let currentUdemyData = null; // To store parsed Udemy JSON
    let currentLocalVideoFiles = []; // To store listed local video files
    let currentCourseName = "";
    let currentBaseDirectory = "";

    // --- Helper Functions ---
    function updateStatus(element, message, type, isPermanent) {
        if (!element) return;
        let displayMessage = message.replace(/^Success:/i, '').replace(/^Error:/i, '').trim();
        element.textContent = displayMessage;
        element.className = 'status-message';
        if (type) {
            element.classList.add(type);
        }
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

            // **NEW: Clear existing JSON files from the output directory**
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
                // Non-fatal, proceed with scraping
            }
            // **END NEW SECTION**


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
                        // const jsonOutputDir = path.join(extensionBasePath, 'output', 'output_json'); // Already defined
                        try {
                            const files = fs.readdirSync(jsonOutputDir)
                                .filter(fileName => path.extname(fileName).toLowerCase() === '.json') // Ensure we only consider JSON files
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
        listLocalFilesButton.onclick = function() {
            var rawVideoPath = rawVideoPathInput.value.trim();
            if (!rawVideoPath) {
                updateStatus(localFileStatus, "Please specify the Raw Video Path.", "error");
                return;
            }
            updateStatus(localFileStatus, "Listing video files...", "info");
            localVideoFilesDisplay.value = ""; currentLocalVideoFiles = [];

            try {
                if (!fs.existsSync(rawVideoPath) || !fs.statSync(rawVideoPath).isDirectory()) {
                    updateStatus(localFileStatus, "Error: Raw Video Path does not exist or is not a directory.", "error");
                    return;
                }
                const files = fs.readdirSync(rawVideoPath);
                currentLocalVideoFiles = files.filter(file => /\.(mp4|mov|avi|mkv|flv|wmv|mpg|mpeg|m4v)$/i.test(file));
                if (currentLocalVideoFiles.length > 0) {
                    localVideoFilesDisplay.value = currentLocalVideoFiles.join('\n');
                    updateStatus(localFileStatus, `Success: Found ${currentLocalVideoFiles.length} video file(s).`, "success");
                } else {
                    localVideoFilesDisplay.value = "No video files found.";
                    updateStatus(localFileStatus, "No video files found in the specified directory.", "info");
                }
            } catch (err) {
                updateStatus(localFileStatus, `Error listing local files: ${err.message}`, "error");
                console.error("Error listing local files:", err);
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

            if (!currentUdemyData || !currentUdemyData.sections) { // Added check for sections
                updateStatus(planStatus, "Error: Udemy course data not fetched or is invalid. Please fetch data first.", "error");
                return;
            }
            if (currentLocalVideoFiles.length === 0) {
                 updateStatus(planStatus, "Warning: No local video files listed. Slide calculation for lesson intros/outros will be zero. Proceeding with section intros only.", "info");
            }
            if (!slidePathInput.value.trim()) {
                updateStatus(planStatus, "Error: Slide path not specified.", "error");
                return;
            }
            if (!rawVideoPathInput.value.trim() && currentLocalVideoFiles.length > 0) {
                updateStatus(planStatus, "Error: Raw video path not specified (needed if local videos are present).", "error");
                return;
            }
            if (!currentCourseName || !currentBaseDirectory) {
                updateStatus(planStatus, "Error: Course Name or Base Directory not set (from Step 1). Please complete Step 1.", "error");
                return;
            }

            const slidesPath = slidePathInput.value.trim();

            const numSectionIntros = currentUdemyData.sections.length;
            const numLessonIntroOutros = currentLocalVideoFiles.length * 2;
            const maxRequiredSlideNumber = numSectionIntros + numLessonIntroOutros;

            if (maxRequiredSlideNumber === 0) {
                updateStatus(planStatus, "Info: No slides required (0 sections and 0 local videos). Master Plan will be minimal.", "info");
            } else {
                updateStatus(planStatus, `Calculated: ${maxRequiredSlideNumber} slides required (${numSectionIntros} section intros, ${numLessonIntroOutros} for lessons). Validating...`, "info");
            }

            let missingSlides = [];
            let foundSlidesMapping = {};

            try {
                if (maxRequiredSlideNumber > 0) {
                    if (!fs.existsSync(slidesPath) || !fs.statSync(slidesPath).isDirectory()) {
                        updateStatus(planStatus, `Error: Slides directory not found or is not a directory: ${slidesPath}`, "error");
                        return;
                    }
                    const slideFilesOnDisk = fs.readdirSync(slidesPath);
                    for (let i = 1; i <= maxRequiredSlideNumber; i++) {
                        const expectedSlideNumber = i;
                        const slideRegex = new RegExp(`^slide\\s*${expectedSlideNumber}\\.(tif|tiff)$`, 'i');
                        const foundFile = slideFilesOnDisk.find(f => slideRegex.test(f));

                        if (foundFile) {
                            const consistentKey = "Slide" + expectedSlideNumber;
                            foundSlidesMapping[consistentKey] = foundFile;
                        } else {
                            missingSlides.push("Slide" + expectedSlideNumber + ".tiff (or .tif, with optional spaces)");
                        }
                    }
                }
            } catch (e) {
                updateStatus(planStatus, `Error reading slides directory: ${e.message}`, "error");
                console.error("Error reading slides directory:", e);
                return;
            }

            if (missingSlides.length > 0) {
                const displayMissingCount = 10;
                let missingSlidesMsg = missingSlides.join(', ');
                if (missingSlides.length > displayMissingCount) {
                    missingSlidesMsg = missingSlides.slice(0, displayMissingCount).join(', ') + `... and ${missingSlides.length - displayMissingCount} more.`;
                }
                updateStatus(planStatus, `Error: Missing ${missingSlides.length} slide(s): ${missingSlidesMsg}`, "error");
                generatePremiereProjectButton.disabled = true;
                return;
            }

            if (maxRequiredSlideNumber > 0) {
                updateStatus(planStatus, `Success: All ${maxRequiredSlideNumber} slides validated! Generating Master Plan...`, "success");
            } else {
                 updateStatus(planStatus, "No slides were required based on current data. Generating Master Plan...", "info");
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
                    console.warn(`Attempting to get slide ${slideNum} but max required is ${maxRequiredSlideNumber}`);
                    return "ERROR_SLIDE_OUT_OF_BOUNDS.tiff";
                }
                return foundSlidesMapping[base] || base + ".tiff";
            };

            currentUdemyData.sections.forEach((udemySection, sectionIndex) => {
                let sectionEntry = {
                    udemySectionTitle: udemySection.sectionTitle,
                    sectionIndex: sectionIndex,
                    sectionIntroSlide: (numSectionIntros > sectionIndex) ? getSlideFile(currentSlideAllocatorIndex++) : null,
                    lessons: []
                };

                udemySection.lessons.forEach((udemyLesson, lessonIndexInSection) => {
                    let lessonEntry = {
                        udemyLessonTitle: udemyLesson.lessonTitle,
                        udemyLessonDuration: udemyLesson.duration,
                        lessonIndexInSection: lessonIndexInSection,
                        globalLessonIndex: masterPlan.sections.reduce((acc, s) => acc + s.lessons.length, 0) + sectionEntry.lessons.length,
                        lessonIntroSlide: null,
                        matchedVideoFile: null,
                        lessonOutroSlide: null
                    };
                    sectionEntry.lessons.push(lessonEntry);
                });
                masterPlan.sections.push(sectionEntry);
            });

            let videoMatchAttempted = 0;
            let videosUsed = new Set();

            masterPlan.sections.forEach(section => {
                section.lessons.forEach(lesson => {
                    if (currentLocalVideoFiles.length > 0) {
                        let matchedVideo = null;
                        for (const videoFile of currentLocalVideoFiles) {
                            if (videosUsed.has(videoFile)) continue;
                            const videoNameLower = path.basename(videoFile, path.extname(videoFile)).toLowerCase();
                            const lessonTitleLower = lesson.udemyLessonTitle.toLowerCase();
                            if (lessonTitleLower.includes(videoNameLower) ||
                                videoNameLower.includes(lessonTitleLower.substring(0, Math.min(15, lessonTitleLower.length) ).replace(/[^\w\s]/gi, '').trim() ) ||
                                lessonTitleLower.split(' ').slice(0,2).join(' ') === videoNameLower.split(' ').slice(0,2).join(' ')
                                ) {
                                matchedVideo = videoFile;
                                break;
                            }
                        }
                        if (!matchedVideo && videoMatchAttempted < currentLocalVideoFiles.length) {
                           let potentialSequentialVideo = currentLocalVideoFiles[videoMatchAttempted];
                           if(!videosUsed.has(potentialSequentialVideo)){
                               if (!masterPlan.sections.flatMap(s => s.lessons).find(l => l.matchedVideoFile === potentialSequentialVideo)){
                                   matchedVideo = potentialSequentialVideo;
                               }
                           }
                        }
                        if (matchedVideo) {
                            lesson.matchedVideoFile = matchedVideo;
                            videosUsed.add(matchedVideo);
                            lesson.lessonIntroSlide = getSlideFile(currentSlideAllocatorIndex++);
                            lesson.lessonOutroSlide = getSlideFile(currentSlideAllocatorIndex++);
                        }
                        videoMatchAttempted++;
                    }
                });
            });

            masterPlanDisplay.value = JSON.stringify(masterPlan, null, 2);
            const safeCourseName = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
            const projectDataFolder = path.join(currentBaseDirectory, safeCourseName, "_03_PROJECT_DATA");

            try {
                if (!fs.existsSync(projectDataFolder)) {
                    fs.mkdirSync(projectDataFolder, { recursive: true });
                }
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

    if (generatePremiereProjectButton) {
        generatePremiereProjectButton.onclick = function() {
            updateStatus(document.getElementById('premiereStatus'), "Premiere Pro automation not yet implemented.", "info");
        }
    }

    // --- Autofill for Prototyping ---
    // Make sure these IDs match your index.html
    if (courseNameInput) {
        courseNameInput.value = "Wireshark";
    }
    if (baseDirectoryInput) {
        // Ensure path uses forward slashes for consistency, though input field might not care
        baseDirectoryInput.value = "D:/01_PROJECTS_ACTIVE/MediaSoftwareDev/PremierePro/Plugins/ECCouncil_Plugin/projects";
    }
    if (udemyUrlInput) {
        udemyUrlInput.value = "https://www.udemy.com/course/wireshark-tcpip/?couponCode=LEARNNOWPLANS";
    }
    // Automatically update state variables as well, as if user typed them
    currentCourseName = courseNameInput.value;
    currentBaseDirectory = baseDirectoryInput.value;

    // Optionally, auto-populate the derived paths if Step 1 values are filled
    if (currentCourseName && currentBaseDirectory) {
        var safeCourseNameVal = currentCourseName.replace(/[^\w\s\-\.]/g, '_').replace(/\s+/g, '_').replace(/[\.]+$/, '');
        if (rawVideoPathInput) {
            rawVideoPathInput.value = currentBaseDirectory + "/" + safeCourseNameVal + "/_01_RAW_VIDEOS";
        }
        if (slidePathInput) {
            slidePathInput.value = currentBaseDirectory + "/" + safeCourseNameVal + "/_02_SLIDES";
        }
    }
    // --- End Autofill ---

};
