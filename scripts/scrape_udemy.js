/**
 * @file scripts/scrape_udemy.js
 * @description Node.js script to scrape Udemy course curriculum data (sections, lessons, durations).
 * It uses Puppeteer to launch a headless browser, navigate to the course URL,
 * expand all sections, and then extract the curriculum structure.
 *
 * @usage node scrape_udemy.js "<UDEMY_COURSE_URL>" [--dump-html] [--verbose|-v]
 *
 * @example
 * node scrape_udemy.js "https://www.udemy.com/course/your-course-slug/" --verbose
 *
 * @requires puppeteer - For browser automation and web scraping.
 * @requires fs - Node.js File System module for saving output.
 * @requires path - Node.js Path module for constructing file paths.
 *
 * @outputs
 * - A JSON file in `../output/output_json/` containing the scraped course data.
 * Filename format: `<CourseTitle>_<Timestamp>.json`.
 * - Optionally, an HTML dump of the page in `../temp/dumps/` if `--dump-html` is used.
 * - Optionally, screenshots in `../temp/screenshots/` if `VERBOSE_MODE` is true and errors occur or for debugging steps.
 */

// -----------------------------------------------------------------------------
// Dependencies
// -----------------------------------------------------------------------------
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// -----------------------------------------------------------------------------
// Configuration Constants
// -----------------------------------------------------------------------------

/**
 * @const {boolean} IS_HEADLESS_MODE
 * @description Determines if Puppeteer runs in headless mode (true) or with a visible browser window (false).
 * Headless is generally preferred for automated scripts.
 */
const IS_HEADLESS_MODE = true;

/**
 * @const {number} NAVIGATION_TIMEOUT
 * @description Maximum time (in milliseconds) to wait for page navigation to complete.
 */
const NAVIGATION_TIMEOUT = 90000; // 90 seconds

/**
 * @const {number} ACTION_DELAY_MS
 * @description Delay (in milliseconds) to wait after certain actions like clicking "Expand All",
 * allowing dynamic content to load.
 */
const ACTION_DELAY_MS = 7000; // 7 seconds

/**
 * @const {number} SCROLL_DELAY_MS
 * @description Delay (in milliseconds) after scrolling, to allow lazy-loaded content to appear.
 */
const SCROLL_DELAY_MS = 2000; // 2 seconds

/**
 * @const {string} USER_AGENT
 * @description The User-Agent string to use for browser requests, mimicking a common desktop browser.
 */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36';

/**
 * @const {number} VIEWPORT_WIDTH
 * @description The width of the browser viewport in pixels.
 */
const VIEWPORT_WIDTH = 1920;

/**
 * @const {number} VIEWPORT_HEIGHT
 * @description The height of the browser viewport in pixels.
 */
const VIEWPORT_HEIGHT = 1080;

/**
 * @const {object} SELECTORS
 * @description An object containing CSS selectors used to find elements on the Udemy course page.
 * These are crucial for the scraper and might need updating if Udemy changes its page structure.
 */
const SELECTORS = {
    /** Selector for the main course title element. */
    COURSE_TITLE: 'h1[data-purpose="lead-title"]',
    /** Selector for the container holding the entire course curriculum. */
    CURRICULUM_CONTAINER: 'div[data-purpose="course-curriculum"]',
    /** Selector for the "Expand All" / "Collapse All" button for curriculum sections. */
    EXPAND_ALL_BUTTON: 'button[data-purpose="expand-toggle"]',
    /** Selector for individual section panels within the curriculum. */
    SECTION_PANEL: 'div[data-purpose="course-curriculum"] div[class*="accordion-panel-module--panel--"]',
    /** Selector for the title of a section within a section panel. */
    SECTION_TITLE_IN_PANEL: '.ud-accordion-panel-title .section--section-title--svpHP', // Adjusted based on common Udemy structures
    /** Selector for the list of lessons within a section panel. */
    LESSON_LIST_IN_PANEL: '.ud-unstyled-list', // Common class for lesson lists
    /** Selector for an individual lesson item within a lesson list. */
    LESSON_ITEM_IN_LIST: 'li .ud-block-list-item-content', // Targets the content div of a list item
    /** Selector for the title of a lesson within a lesson item. */
    LESSON_TITLE_IN_ITEM: '[class*="section--item-title"]', // Flexible selector for lesson title
    /** Selector for the duration summary of a lesson within a lesson item. */
    LESSON_DURATION_IN_ITEM: '[class*="section--item-content-summary"]' // Flexible selector for lesson duration
};

// Output directories for scraped data, HTML dumps, and screenshots.
const OUTPUT_DIR_JSON = path.join(__dirname, '..', 'output', 'output_json');
const OUTPUT_DIR_HTML_DUMPS = path.join(__dirname, '..', 'temp', 'dumps');
const OUTPUT_DIR_SCREENSHOTS = path.join(__dirname, '..', 'temp', 'screenshots');

// Global flags controlled by command-line arguments.
/** @type {boolean} VERBOSE_MODE - Enables detailed logging output. */
let VERBOSE_MODE = false;
/** @type {boolean} DUMP_HTML_MODE - Enables saving the full HTML content of the scraped page. */
let DUMP_HTML_MODE = false;

// -----------------------------------------------------------------------------
// Logging System
// -----------------------------------------------------------------------------

/**
 * @enum {number} LogLevel
 * @description Defines different levels for logging messages.
 */
const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    VERBOSE: 3,
    DEBUG: 4 // Kept for potential deeper debugging, currently same as VERBOSE
};

/**
 * Generic logging function.
 * @param {LogLevel} level - The level of the log message.
 * @param {string} message - The main log message.
 * @param {...any} args - Additional arguments to log.
 */
function log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}]`;

    switch (level) {
        case LogLevel.ERROR:
            console.error(`${prefix} [ERROR]`, message, ...args);
            break;
        case LogLevel.WARN:
            console.warn(`${prefix} [WARN]`, message, ...args);
            break;
        case LogLevel.INFO:
            // Info logs are always shown unless a higher restriction is set elsewhere
            console.log(`${prefix} [INFO]`, message, ...args);
            break;
        case LogLevel.VERBOSE:
            if (VERBOSE_MODE) {
                console.log(`${prefix} [VERBOSE]`, message, ...args);
            }
            break;
        case LogLevel.DEBUG: // Currently behaves like VERBOSE
            if (VERBOSE_MODE) {
                console.log(`${prefix} [DEBUG]`, message, ...args);
            }
            break;
        default:
            console.log(`${prefix}`, message, ...args); // Default log
    }
}

// Convenience logging functions
const logError = (msg, ...args) => log(LogLevel.ERROR, msg, ...args);
const logWarn = (msg, ...args) => log(LogLevel.WARN, msg, ...args);
const logInfo = (msg, ...args) => log(LogLevel.INFO, msg, ...args);
const logVerbose = (msg, ...args) => log(LogLevel.VERBOSE, msg, ...args);
const logDebug = (msg, ...args) => log(LogLevel.DEBUG, msg, ...args); // For very detailed internal steps

/**
 * Logs a success message, always displayed regardless of VERBOSE_MODE.
 * @param {string} msg - The success message.
 * @param {...any} args - Additional arguments.
 */
const logSuccess = (msg, ...args) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SUCCESS]`, msg, ...args);
};

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Creates a promise that resolves after a specified delay.
 * @param {number} ms - The delay in milliseconds.
 * @returns {Promise<void>}
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Ensures that a directory exists, creating it recursively if necessary.
 * @param {string} dirPath - The path to the directory.
 */
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        try {
            fs.mkdirSync(dirPath, { recursive: true });
            logInfo(`Created directory: ${dirPath}`);
        } catch (error) {
            logError(`Failed to create directory ${dirPath}:`, error.message);
            // Depending on severity, might want to throw or exit
        }
    }
}

/**
 * Takes a screenshot of the current page in Puppeteer.
 * Used for debugging, especially in verbose mode or on error.
 * @param {import('puppeteer').Page} page - The Puppeteer page object.
 * @param {string} filename - The desired filename for the screenshot (e.g., "error_page.png").
 * @param {string} [description=''] - An optional description for logging.
 * @returns {Promise<string|null>} The path to the saved screenshot, or null if failed.
 */
async function takeScreenshot(page, filename, description = '') {
    try {
        ensureDirectoryExists(OUTPUT_DIR_SCREENSHOTS); // Ensure screenshot dir exists
        const screenshotPath = path.join(OUTPUT_DIR_SCREENSHOTS, filename);
        await page.screenshot({ path: screenshotPath, fullPage: true }); // fullPage for more context
        logDebug(`Screenshot saved: ${screenshotPath}${description ? ` - ${description}` : ''}`);
        return screenshotPath;
    } catch (error) {
        logError(`Failed to take screenshot ${filename}:`, error.message);
        return null;
    }
}

// Initialize output directories at script start.
ensureDirectoryExists(OUTPUT_DIR_JSON);
ensureDirectoryExists(OUTPUT_DIR_HTML_DUMPS);
// OUTPUT_DIR_SCREENSHOTS is ensured by takeScreenshot if/when called.

// -----------------------------------------------------------------------------
// Main Scraping Function and Sub-functions
// -----------------------------------------------------------------------------

/**
 * Handles clicking the "Expand All" button on the Udemy course page if it's present and not already expanded.
 * Also scrolls the page to ensure all dynamically loaded content is visible.
 * @param {import('puppeteer').Page} page - The Puppeteer page object.
 * @returns {Promise<void>}
 */
async function handleExpandAllButton(page) {
    logVerbose(`Looking for expand all button using selector: ${SELECTORS.EXPAND_ALL_BUTTON}`);

    try {
        // Wait for the button to be potentially available
        const expandButton = await page.waitForSelector(SELECTORS.EXPAND_ALL_BUTTON, { timeout: 15000, visible: true }).catch(() => null);

        if (!expandButton) {
            logWarn('Expand all button not found or not visible within timeout. Sections might already be expanded or page structure changed.');
            if (VERBOSE_MODE) await takeScreenshot(page, 'debug_expand_button_not_found.png', 'Expand button not found');
            return;
        }

        // Get button text to determine its current state (e.g., "Expand all" vs "Collapse all")
        // Udemy might use nested spans or the button text directly.
        const buttonTextElement = await page.$(`${SELECTORS.EXPAND_ALL_BUTTON} span, ${SELECTORS.EXPAND_ALL_BUTTON}`); // Try to get text from span or button itself
        let currentButtonText = '';

        if (buttonTextElement) {
            currentButtonText = await buttonTextElement.evaluate(el => el.textContent.trim().toLowerCase());
        } else {
            logWarn("Could not determine text of the expand/collapse button.");
        }

        logVerbose(`Expand button found. Current text: "${currentButtonText}"`);

        // Click only if it seems to be in an "expand" state.
        if (currentButtonText.includes('expand all') || currentButtonText.includes('expandir todas') || currentButtonText === "") { // "" for safety if text not found but button is
            logInfo('Attempting to click "Expand all sections" button...');
            await expandButton.click();
            logInfo(`Waiting ${ACTION_DELAY_MS / 1000}s for sections to expand after click...`);
            await delay(ACTION_DELAY_MS);

            // Scroll down and up to trigger loading of all content after expansion.
            logVerbose('Scrolling page to ensure all expanded content loads...');
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await delay(SCROLL_DELAY_MS);
            await page.evaluate(() => window.scrollTo(0, 0)); // Scroll back to top
            await delay(1000); // Short delay after scrolling back

            logSuccess('Sections expansion initiated and page scrolled.');
            if (VERBOSE_MODE) await takeScreenshot(page, 'debug_after_expand_all.png', 'After attempting to expand all sections');
        } else {
            logInfo(`Sections appear to be already expanded or button indicates "Collapse" state (text: "${currentButtonText}").`);
            if (VERBOSE_MODE) await takeScreenshot(page, 'debug_already_expanded.png', 'Sections already expanded or collapse state');
        }
    } catch (error) {
        logWarn(`Error handling expand all button: ${error.message}. Continuing as sections might be expanded by default or an alternative structure is present.`);
        if (VERBOSE_MODE) await takeScreenshot(page, 'debug_expand_error.png', 'Error during expand all handling');
    }
}

/**
 * Dumps the full HTML content of the current page to a file.
 * Triggered if `DUMP_HTML_MODE` is true.
 * @param {import('puppeteer').Page} page - The Puppeteer page object.
 * @returns {Promise<void>}
 */
async function dumpPageHTML(page) {
    logInfo('Dumping page HTML content...');
    try {
        ensureDirectoryExists(OUTPUT_DIR_HTML_DUMPS); // Ensure dump dir exists
        const pageContent = await page.content();
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+Z$/, ''); // Filesystem-safe timestamp
        const htmlDumpFilename = path.join(OUTPUT_DIR_HTML_DUMPS, `udemy_page_dump_${timestamp}.html`);
        fs.writeFileSync(htmlDumpFilename, pageContent);
        logSuccess(`HTML dump saved to: ${htmlDumpFilename}`);
    } catch (error) {
        logError('Failed to create HTML dump:', error.message);
    }
}

/**
 * Extracts curriculum data (sections and lessons) from the page.
 * This function is executed in the browser context using `page.$$eval`.
 * @param {import('puppeteer').Page} page - The Puppeteer page object.
 * @returns {Promise<Array<{sectionTitle: string, lessons: Array<{lessonTitle: string, duration: string}>, rawPanelIndex: number}>>}
 * An array of section objects, each containing a title and an array of lesson objects.
 */
async function extractSectionsData(page) {
    const panelsFound = await page.$$(SELECTORS.SECTION_PANEL);
    logInfo(`Found ${panelsFound.length} potential section panels using selector: ${SELECTORS.SECTION_PANEL}`);

    if (panelsFound.length === 0) {
        logWarn('No section panels found on the page. Check CSS selectors or page structure. The curriculum might be missing or structured differently.');
        if (IS_HEADLESS_MODE) {
            logWarn('Consider running with headless mode disabled (IS_HEADLESS_MODE = false) to visually inspect the page.');
        }
        if (VERBOSE_MODE) await takeScreenshot(page, 'debug_no_sections_found.png', 'No section panels found');
        return []; // Return empty array if no panels
    }

    logVerbose('Attempting to extract section and lesson data from panels...');

    // This function runs in the browser's context (page.evaluate context)
    const evalResult = await page.$$eval(
        SELECTORS.SECTION_PANEL, // Selector for all section panels
        (panelsInBrowser, externalSelectors, isVerbose) => {
            // This code runs inside the browser page, not in Node.js environment.
            // `externalSelectors` and `isVerbose` are passed from Node.js context.
            const extractedSections = [];
            const browserLogs = []; // For detailed logging from browser context

            browserLogs.push(`Browser-side: Processing ${panelsInBrowser.length} section panels.`);

            panelsInBrowser.forEach((panelElement, panelIdx) => {
                let sectionTitle = 'Untitled Section';
                let lessons = [];
                let panelLogEntry = `Panel ${panelIdx + 1}: `;

                try {
                    // Extract section title from within the panel
                    const titleElement = panelElement.querySelector(externalSelectors.SECTION_TITLE_IN_PANEL);
                    if (titleElement) {
                        sectionTitle = titleElement.textContent.trim();
                        panelLogEntry += `Title found: "${sectionTitle}" | `;
                    } else {
                        panelLogEntry += `Title NOT found using selector '${externalSelectors.SECTION_TITLE_IN_PANEL}' | `;
                    }

                    // Extract lessons from within the panel
                    const lessonListElement = panelElement.querySelector(externalSelectors.LESSON_LIST_IN_PANEL);
                    if (lessonListElement) {
                        const lessonItemElements = lessonListElement.querySelectorAll(externalSelectors.LESSON_ITEM_IN_LIST);
                        panelLogEntry += `${lessonItemElements.length} lesson items found.`;

                        lessonItemElements.forEach((lessonItemEl, lessonIdx) => {
                            let lessonTitle = 'Untitled Lesson';
                            let lessonDuration = '00:00'; // Default duration

                            // Extract lesson title
                            const lessonTitleEl = lessonItemEl.querySelector(externalSelectors.LESSON_TITLE_IN_ITEM);
                            if (lessonTitleEl) {
                                lessonTitle = lessonTitleEl.textContent.trim();
                            }

                            // Extract lesson duration
                            const lessonDurationEl = lessonItemEl.querySelector(externalSelectors.LESSON_DURATION_IN_ITEM);
                            if (lessonDurationEl) {
                                const durationText = lessonDurationEl.textContent.trim();
                                // Regex to extract time format like HH:MM:SS, MM:SS, or M:SS
                                const durationMatch = durationText.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
                                if (durationMatch && durationMatch[0]) {
                                    lessonDuration = durationMatch[0];
                                }
                            }
                            lessons.push({ lessonTitle, duration: lessonDuration });
                            if (isVerbose) browserLogs.push(`  Panel ${panelIdx+1}, Lesson ${lessonIdx + 1}: "${lessonTitle}" - ${lessonDuration}`);
                        });
                    } else {
                        panelLogEntry += ` | Lesson list NOT found using selector '${externalSelectors.LESSON_LIST_IN_PANEL}'`;
                    }

                    // Add section if it has a valid title or lessons
                    if (sectionTitle !== 'Untitled Section' || lessons.length > 0) {
                        extractedSections.push({
                            sectionTitle,
                            lessons,
                            rawPanelIndex: panelIdx // Original index of the panel on the page
                        });
                    } else {
                        panelLogEntry += " | Skipping section (no title and no lessons)."
                    }

                } catch (errorInBrowser) {
                    panelLogEntry += ` | BROWSER-SIDE ERROR: ${errorInBrowser.message}`;
                }
                browserLogs.push(panelLogEntry);
            });

            return { sections: extractedSections, logs: browserLogs }; // Return both data and logs
        },
        SELECTORS, // Pass our selectors object to the browser context
        VERBOSE_MODE // Pass verbose mode flag to browser context
    );

    // Log details from browser-side execution if verbose
    if (VERBOSE_MODE && evalResult.logs && evalResult.logs.length > 0) {
        logVerbose('Browser-side extraction details:');
        evalResult.logs.forEach(logMsg => logVerbose(logMsg));
    }

    const sectionsData = evalResult.sections;

    if (sectionsData.length > 0) {
        logSuccess(`Successfully extracted data for ${sectionsData.length} sections.`);
        sectionsData.forEach((section, index) => {
            logInfo(`Section ${index + 1}: "${section.sectionTitle}" (${section.lessons.length} lessons)`);
            if (VERBOSE_MODE) { // Log individual lessons if verbose
                section.lessons.forEach((lesson, lessonIndex) => {
                    logVerbose(`  Lesson ${lessonIndex + 1}: "${lesson.lessonTitle}" - Duration: ${lesson.duration}`);
                });
            }
        });
    } else {
        logWarn('No valid section data was extracted from the panels. The page structure might have changed, or selectors need adjustment.');
        if (VERBOSE_MODE) await takeScreenshot(page, 'debug_no_valid_sections_extracted.png', 'No valid sections extracted from panels');
    }

    return sectionsData;
}


/**
 * Main function to orchestrate the Udemy course scraping process.
 * @param {string} courseUrl - The URL of the Udemy course to scrape.
 * @returns {Promise<object>} An object containing the scraped course data or an error message.
 * Structure: { courseTitle: string, scrapedUrl: string, scrapeTimestamp: string, sections: Array, error?: string }
 */
async function scrapeUdemyCourse(courseUrl) {
    logInfo(`Starting Udemy course scrape for URL: ${courseUrl}`);
    if (DUMP_HTML_MODE) logInfo('HTML dump mode is enabled.');
    if (VERBOSE_MODE) logInfo('Verbose logging is enabled.');

    let browser;
    let page; // Declare page here to access in finally block for screenshots on error

    try {
        // 1. Launch Puppeteer browser
        logVerbose(`Launching Puppeteer browser (headless: ${IS_HEADLESS_MODE})`);
        browser = await puppeteer.launch({
            headless: IS_HEADLESS_MODE,
            args: [ // Common arguments for running in CI/headless environments
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Important for Docker/CI
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu' // Often helps in headless environments
            ]
        });
        logSuccess('Browser launched successfully.');

        // 2. Open a new page and configure it
        page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
        logVerbose('New page created and configured (User Agent, Viewport).');

        // 3. Navigate to the course page
        logInfo(`Navigating to course page: ${courseUrl}`);
        await page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT });
        logSuccess('Successfully navigated to course page and network is idle.');
        if (VERBOSE_MODE) await takeScreenshot(page, 'debug_page_loaded.png', 'Initial page load');


        // 4. Extract course title
        let courseTitle = 'Untitled_Course'; // Default title
        try {
            logVerbose(`Attempting to extract course title using selector: ${SELECTORS.COURSE_TITLE}`);
            await page.waitForSelector(SELECTORS.COURSE_TITLE, { timeout: 20000, visible: true }); // Wait for title to be visible
            courseTitle = await page.$eval(SELECTORS.COURSE_TITLE, el => el.textContent.trim());
            logSuccess(`Course title extracted: "${courseTitle}"`);
        } catch (error) {
            logWarn(`Could not extract course title: ${error.message}. Using default: "${courseTitle}".`);
            if (VERBOSE_MODE) await takeScreenshot(page, 'debug_title_extraction_failed.png', 'Course title extraction failed');
        }

        // 5. Wait for the main curriculum container to ensure essential page parts are loaded
        logVerbose(`Waiting for curriculum container with selector: ${SELECTORS.CURRICULUM_CONTAINER}`);
        try {
            await page.waitForSelector(SELECTORS.CURRICULUM_CONTAINER, { timeout: 45000, visible: true });
            logSuccess('Curriculum container is present and visible.');
        } catch (error) {
            logError(`Curriculum container (${SELECTORS.CURRICULUM_CONTAINER}) not found or not visible: ${error.message}`);
            await takeScreenshot(page, 'error_curriculum_container_missing.png', 'Curriculum container missing or not visible');
            throw new Error('Could not find curriculum container. Page structure may have changed or content failed to load.');
        }

        // 6. Handle the "Expand All" button to reveal all lessons
        await handleExpandAllButton(page);

        // 7. Dump full page HTML if dump mode is enabled (for debugging selectors)
        if (DUMP_HTML_MODE) {
            await dumpPageHTML(page);
        }

        // 8. Extract the actual section and lesson data
        const sectionsData = await extractSectionsData(page);

        // 9. Compile and return the final course data object
        const finalCourseData = {
            courseTitle: courseTitle,
            scrapedUrl: courseUrl,
            scrapeTimestamp: new Date().toISOString(),
            sections: sectionsData.filter(section => // Filter out truly empty sections
                (section.sectionTitle && section.sectionTitle !== 'Untitled Section' && section.sectionTitle.length > 0) ||
                (section.lessons && section.lessons.length > 0)
            )
        };

        logSuccess(`Scraping completed. Extracted ${finalCourseData.sections.length} sections.`);
        return finalCourseData;

    } catch (error) {
        logError('A critical error occurred during the scraping process:', error.message);
        logVerbose('Error stack trace:', error.stack);

        // Take a screenshot on critical failure if page object exists
        if (page) {
            await takeScreenshot(page, 'error_critical_failure_state.png', 'State at critical error');
        }

        // Return an error object structure
        return {
            error: `Scraping failed: ${error.message}`,
            courseTitle: 'Error During Scraping', // Provide a title indicating error
            scrapedUrl: courseUrl,
            scrapeTimestamp: new Date().toISOString(),
            sections: [] // Empty sections on error
        };
    } finally {
        // 10. Close the browser
        if (browser) {
            await browser.close();
            logInfo('Browser closed.');
        }
    }
}

// -----------------------------------------------------------------------------
// Script Execution (Argument Parsing and Main Call)
// -----------------------------------------------------------------------------

/**
 * Parses command-line arguments for the script.
 * Expected arguments: Udemy Course URL.
 * Optional flags: --dump-html, --verbose (-v).
 * @returns {{courseUrl: string}} An object containing the parsed course URL.
 * Exits process if arguments are invalid.
 */
function parseArguments() {
    const args = process.argv.slice(2); // Remove 'node' and script path

    if (args.length < 1 || args[0].startsWith('--')) { // Basic check for URL presence
        console.error('Usage: node scrape_udemy.js "<UDEMY_COURSE_URL>" [--dump-html] [--verbose|-v]');
        console.error('');
        console.error('Example: node scrape_udemy.js "https://www.udemy.com/course/your-course-name/" --verbose');
        console.error('');
        console.error('Arguments:');
        console.error('  <UDEMY_COURSE_URL>  (Required) The full URL of the Udemy course to scrape.');
        console.error('');
        console.error('Options:');
        console.error('  --dump-html         Save the complete HTML of the course page to the temp/dumps directory.');
        console.error('  --verbose, -v       Enable detailed logging output to the console.');
        process.exit(1); // Exit with error code
    }

    const courseUrl = args[0]; // First argument is assumed to be the URL
    DUMP_HTML_MODE = args.includes('--dump-html');
    VERBOSE_MODE = args.includes('--verbose') || args.includes('-v');

    return { courseUrl };
}

/**
 * Saves the scraped course data to a JSON file.
 * @param {object} courseData - The course data object returned by `scrapeUdemyCourse`.
 * Expected structure: { courseTitle: string, scrapedUrl: string, scrapeTimestamp: string, sections: Array, error?: string }
 * @returns {Promise<void>}
 */
async function saveResults(courseData) {
    // If HTML dump mode was active, a message is already logged.
    // If there was an error, it's already logged by scrapeUdemyCourse.
    // This function focuses on saving valid data.

    if (courseData.error) {
        // Error message already logged by the main scraping function.
        // If no sections were extracted due to error, log that specifically.
        if (!courseData.sections || courseData.sections.length === 0) {
            logError('No sections data was extracted due to the error. No JSON file will be saved.');
        }
        process.exit(1); // Exit with error if scraping failed
    }

    if (!courseData.sections || courseData.sections.length === 0) {
        logError('No valid sections were found or extracted from the course page. No JSON file will be saved.');
        process.exit(1); // Exit if no data to save
    }

    // Generate a filesystem-safe filename.
    const safeCourseTitle = courseData.courseTitle
        ? courseData.courseTitle.replace(/[^\w\s-]/g, '_').replace(/\s+/g, '_') // Replace non-alphanumeric (except space, hyphen) with underscore
        : 'udemy_course_data'; // Default if title was problematic
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+Z$/, ''); // YYYY-MM-DDTHH-MM-SS
    const outputFilename = `${safeCourseTitle}_${timestamp}.json`;
    const fullOutputPath = path.join(OUTPUT_DIR_JSON, outputFilename);

    // Convert data to JSON string
    const outputJson = JSON.stringify(courseData, null, 2); // Pretty print with 2 spaces

    if (VERBOSE_MODE) {
        logVerbose('--- Complete Scraped Data (JSON Preview) ---');
        console.log(outputJson.substring(0, 2000) + (outputJson.length > 2000 ? "\n... (data truncated for console)" : "")); // Preview long data
        logVerbose('--- End of JSON Preview ---');
    }

    // Save the JSON data to file
    try {
        ensureDirectoryExists(OUTPUT_DIR_JSON); // Ensure output dir exists
        fs.writeFileSync(fullOutputPath, outputJson);
        logSuccess(`Scraped course data successfully saved to: ${fullOutputPath}`);

        // Provide a summary of what was saved
        logInfo('--- Scraping Summary ---');
        logInfo(`- Course Title: "${courseData.courseTitle}"`);
        logInfo(`- Scraped URL: "${courseData.scrapedUrl}"`);
        logInfo(`- Timestamp: ${courseData.scrapeTimestamp}`);
        logInfo(`- Sections Extracted: ${courseData.sections.length}`);
        const totalLessons = courseData.sections.reduce((sum, section) => sum + section.lessons.length, 0);
        logInfo(`- Total Lessons Extracted: ${totalLessons}`);
        logInfo('--- End of Summary ---');

    } catch (error) {
        logError(`Failed to save JSON output to ${fullOutputPath}:`, error.message);
        process.exit(1); // Exit with error if saving fails
    }
}

/**
 * Main execution block for the script.
 * Parses arguments, calls the scraping function, and saves the results.
 */
async function main() {
    logInfo('Udemy Course Scraper Script - Starting execution...');
    try {
        const { courseUrl } = parseArguments();
        const courseData = await scrapeUdemyCourse(courseUrl);
        await saveResults(courseData);
        logInfo('Udemy Course Scraper Script - Execution finished successfully.');
    } catch (error) {
        // Catch any unhandled promise rejections or synchronous errors from main flow
        logError('Unhandled error during script execution:', error.message);
        if (VERBOSE_MODE) {
            logError('Stack trace for unhandled error:', error.stack);
        }
        process.exit(1); // Exit with a generic error code
    }
}

// --- Script Entry Point ---
if (require.main === module) {
    main();
}
