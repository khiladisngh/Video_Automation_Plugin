// File: scrape_udemy.js
// Purpose: Scrapes Udemy course curriculum data (sections, lessons, durations) given a course URL.
// Usage: node scrape_udemy.js "<UDEMY_COURSE_URL>" [--dump-html] [--verbose]

// -----------------------------------------------------------------------------
// Dependencies
// -----------------------------------------------------------------------------
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// -----------------------------------------------------------------------------
// Configuration Constants
// -----------------------------------------------------------------------------
const IS_HEADLESS_MODE = true;
const NAVIGATION_TIMEOUT = 90000;
const ACTION_DELAY_MS = 7000;
const SCROLL_DELAY_MS = 2000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36';
const VIEWPORT_WIDTH = 1920;
const VIEWPORT_HEIGHT = 1080;

// CSS Selectors
const SELECTORS = {
    COURSE_TITLE: 'h1[data-purpose="lead-title"]',
    CURRICULUM_CONTAINER: 'div[data-purpose="course-curriculum"]',
    EXPAND_ALL_BUTTON: 'button[data-purpose="expand-toggle"]',
    SECTION_PANEL: 'div[data-purpose="course-curriculum"] div[class*="accordion-panel-module--panel--"]',
    SECTION_TITLE_IN_PANEL: '.ud-accordion-panel-title .section--section-title--svpHP',
    LESSON_LIST_IN_PANEL: '.ud-unstyled-list',
    LESSON_ITEM_IN_LIST: 'li .ud-block-list-item-content',
    LESSON_TITLE_IN_ITEM: '[class*="section--item-title"]',
    LESSON_DURATION_IN_ITEM: '[class*="section--item-content-summary"]'
};

// Output directories
const OUTPUT_DIR_JSON = path.join(__dirname, '..', 'output', 'output_json');
const OUTPUT_DIR_HTML_DUMPS = path.join(__dirname, '..', 'temp', 'dumps');
const OUTPUT_DIR_SCREENSHOTS = path.join(__dirname, '..', 'temp', 'screenshots');

// Global flags
let VERBOSE_MODE = false;
let DUMP_HTML_MODE = false;

// -----------------------------------------------------------------------------
// Logging System
// -----------------------------------------------------------------------------
const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    VERBOSE: 3,
    DEBUG: 4
};

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
            console.log(`${prefix} [INFO]`, message, ...args);
            break;
        case LogLevel.VERBOSE:
            if (VERBOSE_MODE) {
                console.log(`${prefix} [VERBOSE]`, message, ...args);
            }
            break;
        case LogLevel.DEBUG:
            if (VERBOSE_MODE) {
                console.log(`${prefix} [DEBUG]`, message, ...args);
            }
            break;
        default:
            console.log(`${prefix}`, message, ...args);
    }
}

// Convenience functions
const logError = (msg, ...args) => log(LogLevel.ERROR, msg, ...args);
const logWarn = (msg, ...args) => log(LogLevel.WARN, msg, ...args);
const logInfo = (msg, ...args) => log(LogLevel.INFO, msg, ...args);
const logVerbose = (msg, ...args) => log(LogLevel.VERBOSE, msg, ...args);
const logDebug = (msg, ...args) => log(LogLevel.DEBUG, msg, ...args);

// Success logging (always shown)
const logSuccess = (msg, ...args) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SUCCESS]`, msg, ...args);
};

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logInfo(`Created directory: ${dirPath}`);
    }
}

async function takeScreenshot(page, filename, description = '') {
    try {
        const screenshotPath = path.join(OUTPUT_DIR_SCREENSHOTS, filename);
        await page.screenshot({ path: screenshotPath });
        logDebug(`Screenshot saved: ${screenshotPath}${description ? ` - ${description}` : ''}`);
        return screenshotPath;
    } catch (error) {
        logError(`Failed to take screenshot ${filename}:`, error.message);
        return null;
    }
}

// Initialize output directories
ensureDirectoryExists(OUTPUT_DIR_JSON);
ensureDirectoryExists(OUTPUT_DIR_HTML_DUMPS);
ensureDirectoryExists(OUTPUT_DIR_SCREENSHOTS);

// -----------------------------------------------------------------------------
// Main Scraping Function
// -----------------------------------------------------------------------------
async function scrapeUdemyCourse(courseUrl) {
    logInfo(`Starting scrape for: ${courseUrl}`);
    if (DUMP_HTML_MODE) logInfo('HTML dump mode enabled');
    if (VERBOSE_MODE) logInfo('Verbose logging enabled');

    let browser;
    let page;

    try {
        // Launch browser
        logVerbose(`Launching browser (headless: ${IS_HEADLESS_MODE})`);
        browser = await puppeteer.launch({
            headless: IS_HEADLESS_MODE,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        logSuccess('Browser launched successfully');

        // Setup page
        page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
        logVerbose('Page setup complete (User Agent, Viewport)');

        // Navigate to course page
        logInfo(`Navigating to course page...`);
        logVerbose(`URL: ${courseUrl}`);
        await page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT });
        logSuccess('Page loaded successfully');

        // Extract course title
        let courseTitle = 'Untitled_Course';
        try {
            logVerbose(`Looking for course title with selector: ${SELECTORS.COURSE_TITLE}`);
            await page.waitForSelector(SELECTORS.COURSE_TITLE, { timeout: 10000 });
            courseTitle = await page.$eval(SELECTORS.COURSE_TITLE, el => el.textContent.trim());
            logSuccess(`Course title extracted: "${courseTitle}"`);
        } catch (error) {
            logWarn(`Could not extract course title: ${error.message}`);
            logWarn(`Using default title: "${courseTitle}"`);
            if (VERBOSE_MODE) {
                await takeScreenshot(page, 'debug_title_not_found.png', 'Course title not found');
            }
        }

        // Wait for curriculum container
        logVerbose(`Looking for curriculum container: ${SELECTORS.CURRICULUM_CONTAINER}`);
        try {
            await page.waitForSelector(SELECTORS.CURRICULUM_CONTAINER, { timeout: 45000 });
            logSuccess('Curriculum container found');
        } catch (error) {
            logError(`Curriculum container not found: ${error.message}`);
            await takeScreenshot(page, 'error_curriculum_container_missing.png', 'Curriculum container missing');
            throw new Error('Could not find curriculum container - page structure may have changed');
        }

        // Handle "Expand All" button
        await handleExpandAllButton(page);

        // Dump HTML if requested
        if (DUMP_HTML_MODE) {
            await dumpPageHTML(page);
        }

        // Extract sections data
        const sectionsData = await extractSectionsData(page);

        // Process and return results
        const courseData = {
            courseTitle: courseTitle,
            scrapedUrl: courseUrl,
            scrapeTimestamp: new Date().toISOString(),
            sections: sectionsData.filter(section =>
                section.lessons.length > 0 ||
                (section.sectionTitle && section.sectionTitle !== 'Untitled Section' && section.sectionTitle.length > 0)
            )
        };

        logSuccess(`Scraping completed - ${courseData.sections.length} sections extracted`);
        return courseData;

    } catch (error) {
        logError('Critical error during scraping:', error.message);
        logVerbose('Error stack:', error.stack);

        if (page) {
            await takeScreenshot(page, 'error_critical_failure.png', 'Critical error occurred');
        }

        return {
            error: error.message,
            courseTitle: '',
            scrapedUrl: courseUrl,
            scrapeTimestamp: new Date().toISOString(),
            sections: []
        };
    } finally {
        if (browser) {
            await browser.close();
            logInfo('Browser closed');
        }
    }
}

async function handleExpandAllButton(page) {
    logVerbose(`Looking for expand all button: ${SELECTORS.EXPAND_ALL_BUTTON}`);

    try {
        const expandButton = await page.$(SELECTORS.EXPAND_ALL_BUTTON);

        if (!expandButton) {
            logWarn('Expand all button not found - sections may already be expanded');
            if (VERBOSE_MODE) {
                await takeScreenshot(page, 'debug_expand_button_not_found.png', 'Expand button not found');
            }
            return;
        }

        // Get button text to determine current state
        const buttonTextElement = await page.$(`${SELECTORS.EXPAND_ALL_BUTTON} span, ${SELECTORS.EXPAND_ALL_BUTTON}`);
        let currentButtonText = '';

        if (buttonTextElement) {
            currentButtonText = await buttonTextElement.evaluate(el => el.textContent.trim().toLowerCase());
        }

        logVerbose(`Expand button found with text: "${currentButtonText}"`);

        if (currentButtonText.includes('expand all') || currentButtonText.includes('expandir todas')) {
            logInfo('Clicking "Expand all sections"...');
            await expandButton.click();
            logInfo(`Waiting ${ACTION_DELAY_MS / 1000}s for sections to expand...`);
            await delay(ACTION_DELAY_MS);

            // Scroll to load all content
            logVerbose('Scrolling page to ensure all content loads...');
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await delay(SCROLL_DELAY_MS);
            await page.evaluate(() => window.scrollTo(0, 0));
            await delay(1000);

            logSuccess('Sections expanded successfully');

            if (VERBOSE_MODE) {
                await takeScreenshot(page, 'debug_after_expand_all.png', 'After expanding all sections');
            }
        } else {
            logInfo(`Sections appear to already be expanded (button text: "${currentButtonText}")`);
            if (VERBOSE_MODE) {
                await takeScreenshot(page, 'debug_already_expanded.png', 'Sections already expanded');
            }
        }
    } catch (error) {
        logWarn('Error handling expand all button:', error.message);
        if (VERBOSE_MODE) {
            await takeScreenshot(page, 'debug_expand_error.png', 'Error expanding sections');
        }
    }
}

async function dumpPageHTML(page) {
    logInfo('Generating HTML dump...');
    try {
        const pageContent = await page.content();
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+Z$/, '');
        const htmlDumpFilename = path.join(OUTPUT_DIR_HTML_DUMPS, `udemy_page_${timestamp}.html`);
        fs.writeFileSync(htmlDumpFilename, pageContent);
        logSuccess(`HTML dump saved to: ${htmlDumpFilename}`);
    } catch (error) {
        logError('Failed to create HTML dump:', error.message);
    }
}

async function extractSectionsData(page) {
    const panelsFound = await page.$$(SELECTORS.SECTION_PANEL);
    logInfo(`Found ${panelsFound.length} section panels`);

    if (panelsFound.length === 0) {
        logWarn('No section panels found - check selectors or page structure');
        if (IS_HEADLESS_MODE) {
            logWarn('Try running with headless: false to observe browser behavior');
        }
        if (VERBOSE_MODE) {
            await takeScreenshot(page, 'debug_no_sections_found.png', 'No sections found');
        }
        return [];
    }

    logVerbose('Extracting sections and lessons data...');

    const evalResult = await page.$$eval(
        SELECTORS.SECTION_PANEL,
        (panels, selectors, verboseMode) => {
            const sections = [];
            const logs = [];

            logs.push(`Processing ${panels.length} section panels`);

            panels.forEach((panel, panelIndex) => {
                let sectionTitle = 'Untitled Section';
                let lessons = [];
                let panelLog = `Panel ${panelIndex + 1}: `;

                try {
                    // Extract section title
                    const titleElement = panel.querySelector(selectors.SECTION_TITLE_IN_PANEL);
                    if (titleElement) {
                        sectionTitle = titleElement.textContent.trim();
                        panelLog += `Title found: "${sectionTitle}" | `;
                    } else {
                        panelLog += `Title NOT found | `;
                    }

                    // Extract lessons
                    const lessonList = panel.querySelector(selectors.LESSON_LIST_IN_PANEL);
                    if (lessonList) {
                        const lessonElements = lessonList.querySelectorAll(selectors.LESSON_ITEM_IN_LIST);
                        panelLog += `${lessonElements.length} lessons found`;

                        lessonElements.forEach((lessonEl, lessonIndex) => {
                            let lessonTitle = 'Untitled Lesson';
                            let lessonDuration = '00:00';

                            // Extract lesson title
                            const titleEl = lessonEl.querySelector(selectors.LESSON_TITLE_IN_ITEM);
                            if (titleEl) {
                                lessonTitle = titleEl.textContent.trim();
                            }

                            // Extract lesson duration
                            const durationEl = lessonEl.querySelector(selectors.LESSON_DURATION_IN_ITEM);
                            if (durationEl) {
                                const durationText = durationEl.textContent.trim();
                                const match = durationText.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
                                if (match && match[0]) {
                                    lessonDuration = match[0];
                                }
                            }

                            lessons.push({ lessonTitle, duration: lessonDuration });

                            if (verboseMode) {
                                logs.push(`  Lesson ${lessonIndex + 1}: "${lessonTitle}" - ${lessonDuration}`);
                            }
                        });
                    } else {
                        panelLog += ' | Lesson list NOT found';
                    }

                    // Only add sections with valid content
                    if (sectionTitle !== 'Untitled Section' || lessons.length > 0) {
                        sections.push({
                            sectionTitle,
                            lessons,
                            rawPanelIndex: panelIndex
                        });
                    }

                } catch (error) {
                    panelLog += ` | ERROR: ${error.message}`;
                }

                logs.push(panelLog);
            });

            return { sections, logs };
        },
        SELECTORS,
        VERBOSE_MODE
    );

    // Log extraction results
    if (VERBOSE_MODE && evalResult.logs.length > 0) {
        logVerbose('Section extraction details:');
        evalResult.logs.forEach(logMsg => logVerbose(logMsg));
    }

    const sectionsData = evalResult.sections;

    if (sectionsData.length > 0) {
        logSuccess(`Successfully extracted ${sectionsData.length} sections`);
        sectionsData.forEach((section, index) => {
            logInfo(`Section ${index + 1}: "${section.sectionTitle}" (${section.lessons.length} lessons)`);
            if (VERBOSE_MODE) {
                section.lessons.forEach((lesson, lessonIndex) => {
                    logVerbose(`  Lesson ${lessonIndex + 1}: "${lesson.lessonTitle}" - ${lesson.duration}`);
                });
            }
        });
    } else {
        logWarn('No valid sections extracted - check selectors and page structure');
        if (VERBOSE_MODE) {
            await takeScreenshot(page, 'debug_no_valid_sections.png', 'No valid sections extracted');
        }
    }

    return sectionsData;
}

// -----------------------------------------------------------------------------
// Script Execution
// -----------------------------------------------------------------------------
function parseArguments() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error('Usage: node scrape_udemy.js "<UDEMY_COURSE_URL>" [--dump-html] [--verbose|-v]');
        console.error('');
        console.error('Options:');
        console.error('  --dump-html    Save complete HTML of the page to dumps directory');
        console.error('  --verbose, -v  Enable detailed logging');
        process.exit(1);
    }

    const courseUrl = args[0];
    DUMP_HTML_MODE = args.includes('--dump-html');
    VERBOSE_MODE = args.includes('--verbose') || args.includes('-v');

    return { courseUrl };
}

async function saveResults(courseData) {
    if (DUMP_HTML_MODE) {
        logInfo('HTML dump mode was active - check dumps directory for HTML file');
        if (courseData.error) {
            logError('Scraping failed even in dump mode:', courseData.error);
        }
        return;
    }

    if (courseData.error) {
        logError('Scraping failed:', courseData.error);
        if (courseData.sections.length === 0) {
            logError('No sections data was extracted');
        }
        process.exit(1);
    }

    if (!courseData.sections || courseData.sections.length === 0) {
        logError('No valid sections found - check logs and selectors');
        process.exit(1);
    }

    // Generate output filename
    const safeCourseTitle = courseData.courseTitle
        ? courseData.courseTitle.replace(/[^\w\s-]/g, '_').replace(/\s+/g, '_')
        : 'udemy_course';
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+Z$/, '');
    const outputFilename = `${safeCourseTitle}_${timestamp}.json`;
    const fullOutputPath = path.join(OUTPUT_DIR_JSON, outputFilename);

    // Save JSON data
    const outputJson = JSON.stringify(courseData, null, 2);

    if (VERBOSE_MODE) {
        logVerbose('Complete scraped data:');
        console.log(outputJson);
    }

    fs.writeFileSync(fullOutputPath, outputJson);
    logSuccess(`Data saved to: ${fullOutputPath}`);

    // Summary
    logInfo('Scraping Summary:');
    logInfo(`- Course: "${courseData.courseTitle}"`);
    logInfo(`- Sections: ${courseData.sections.length}`);
    const totalLessons = courseData.sections.reduce((sum, section) => sum + section.lessons.length, 0);
    logInfo(`- Total Lessons: ${totalLessons}`);
}

// Main execution
async function main() {
    try {
        const { courseUrl } = parseArguments();
        const courseData = await scrapeUdemyCourse(courseUrl);
        await saveResults(courseData);
    } catch (error) {
        logError('Script execution failed:', error.message);
        if (VERBOSE_MODE) {
            logError('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

// Run the script
main();
