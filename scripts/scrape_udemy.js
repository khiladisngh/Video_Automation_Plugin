// File: scrape_udemy.js

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path'); // Import path module

// Helper function for a fixed delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeUdemyCourse(courseUrl, dumpHtml = false) {
    console.log(`[INFO] Starting scrape for: ${courseUrl}`);
    if (dumpHtml) {
        console.log("[INFO] HTML DUMP MODE ENABLED. Will save rendered page content.");
    }
    let browser;
    let page;

    const IS_HEADLESS = true; // Set to false to debug by watching the browser

    try {
        browser = await puppeteer.launch({
            headless: IS_HEADLESS,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
            ]
        });

        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        console.log(`[INFO] Navigating to ${courseUrl}...`);
        await page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: 90000 });
        console.log('[SUCCESS] Page loaded.');

        // --- CSS Selectors defined in Node.js scope (using your fixed versions) ---
        const courseTitleSelector = 'h1[data-purpose="lead-title"]';
        const mainCurriculumContainerSelector = 'div[data-purpose="course-curriculum"]';
        const expandAllButtonSelector = 'button[data-purpose="expand-toggle"]';
        const sectionPanelSelector = `${mainCurriculumContainerSelector} div[class*="accordion-panel-module--panel--"]`;

        // --- Selectors for use INSIDE each panel (from your uploaded script) ---
        const sectionTitleSel_NodeVar = '.ud-accordion-panel-title .section--section-title--svpHP';
        const lessonListSel_NodeVar = '.ud-unstyled-list'; // This is quite generic, ensure it's specific enough in context
        const lessonItemSel_NodeVar = 'li .ud-block-list-item-content'; // This targets a div inside an li
        const lessonTitleAttrSel_NodeVar = '[class*="section--item-title"]';
        const lessonDurationAttrSel_NodeVar = '[class*="section--item-content-summary"]';


        console.log('[INFO] Waiting for main curriculum container...');
        try {
            await page.waitForSelector(mainCurriculumContainerSelector, { timeout: 45000 });
            console.log('[SUCCESS] Main curriculum container found.');
        } catch (e) {
            console.error(`[ERROR] Error waiting for main curriculum container: ${mainCurriculumContainerSelector}.`);
            await page.screenshot({ path: 'debug_screenshot_curriculum_container_missing.png' });
            console.log("[DEBUG] Screenshot: debug_screenshot_curriculum_container_missing.png");
            throw new Error('Could not find main curriculum container.');
        }

        let courseTitle = '';
        try {
            courseTitle = await page.$eval(courseTitleSelector, el => el.textContent.trim());
            console.log(`[SUCCESS] Course Title: ${courseTitle}`);
        } catch (e) {
            console.warn(`[WARN] Could not extract course title (selector: ${courseTitleSelector}).`);
            await page.screenshot({ path: 'debug_screenshot_title_not_found.png' });
            console.log("[DEBUG] Screenshot: debug_screenshot_title_not_found.png");
        }

        try {
            console.log(`[INFO] Attempting "Expand all sections" (selector: ${expandAllButtonSelector})`);
            const expandButton = await page.$(expandAllButtonSelector);
            if (expandButton) {
                const buttonTextElement = await page.$(`${expandAllButtonSelector} span, ${expandAllButtonSelector}`);
                let currentButtonText = '';
                if (buttonTextElement) {
                    currentButtonText = await buttonTextElement.evaluate(el => el.textContent.trim().toLowerCase());
                }
                console.log(`[INFO] "Expand all" button found. Text: "${currentButtonText}"`);
                if (currentButtonText.includes('expand all') || currentButtonText.includes('expandir todas')) {
                    console.log('[INFO] Clicking "Expand all sections"...');
                    await expandButton.click();
                    console.log('[SUCCESS] Clicked "Expand all sections". Waiting 7s for content/scrolls...');
                    await delay(7000);
                    console.log('[INFO] Scrolling page to ensure all content is potentially loaded...');
                    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
                    await delay(2000);
                    await page.evaluate(() => { window.scrollTo(0, 0); });
                    await delay(1000);
                    console.log('[SUCCESS] Wait and scrolls finished.');
                    await page.screenshot({ path: 'debug_screenshot_after_expand_all.png' });
                    console.log("[DEBUG] Screenshot: debug_screenshot_after_expand_all.png");
                } else {
                    console.log('[INFO] Sections might already be expanded or button text differs. Text: "' + currentButtonText + '"');
                    await page.screenshot({ path: 'debug_screenshot_expand_all_not_needed.png' });
                    console.log("[DEBUG] Screenshot: debug_screenshot_expand_all_not_needed.png");
                }
            } else {
                console.log(`[WARN] "Expand all sections" button not found (selector: ${expandAllButtonSelector}).`);
                await page.screenshot({ path: 'debug_screenshot_expand_all_btn_not_found.png' });
                console.log("[DEBUG] Screenshot: debug_screenshot_expand_all_btn_not_found.png");
            }
        } catch (e) {
            console.warn('[WARN] Error during "Expand all sections" attempt:', e.message);
            await page.screenshot({ path: 'debug_screenshot_expand_all_error.png' });
            console.log("[DEBUG] Screenshot: debug_screenshot_expand_all_error.png");
        }

        if (dumpHtml) {
            console.log("[INFO] Getting page content for HTML dump...");
            const pageContent = await page.content();
            const dumpsDir = path.join(__dirname, 'dumps');
            if (!fs.existsSync(dumpsDir)){
                fs.mkdirSync(dumpsDir, { recursive: true });
            }
            const htmlDumpFilename = path.join(dumpsDir, `rendered_udemy_page_${new Date().toISOString().replace(/:/g, '-')}.html`);
            fs.writeFileSync(htmlDumpFilename, pageContent);
            console.log(`[SUCCESS] Full page HTML saved to ${htmlDumpFilename}`);
        }

        const panelsFoundCount = (await page.$$(sectionPanelSelector)).length;
        console.log(`[INFO] Found ${panelsFoundCount} DOM elements matching sectionPanelSelector: ${sectionPanelSelector}`);
        if (panelsFoundCount === 0 && IS_HEADLESS) {
            console.log("[HINT] If headless & no sections found, try with headless: false.");
        }

        console.log('[INFO] Attempting to extract sections and lessons from rendered DOM...');
        const evalResult = await page.$$eval(sectionPanelSelector,
            // Parameters for the browser-side callback function:
            (panelsInBrowser, sTitleSel, lListSel, lItemSel, lTitleSel, lDurationSel) => {
            const extractedSections = [];
            const browserDebugLogs = [];
            if (panelsInBrowser.length === 0) {
                browserDebugLogs.push(`[BROWSER] $$eval: No panels found. Check sectionPanelSelector or page structure.`);
                return { sections: [], logs: browserDebugLogs };
            }

            browserDebugLogs.push(`[BROWSER] $$eval: Processing ${panelsInBrowser.length} panels.`);

            panelsInBrowser.forEach((panel, panelIndex) => {
                let sectionTitle = 'Untitled Section';
                let lessons = [];
                let panelDebug = `[BROWSER] Panel ${panelIndex}: `;

                try {
                    let sectionTitleElement = panel.querySelector(sTitleSel);
                    if (sectionTitleElement) {
                        sectionTitle = sectionTitleElement.textContent.trim();
                        panelDebug += `Title (selector: '${sTitleSel}') found: "${sectionTitle}". `;
                    } else {
                         panelDebug += `Title (selector: '${sTitleSel}') NOT found. `;
                    }

                    const lessonListElement = panel.querySelector(lListSel);
                    if (lessonListElement) {
                        panelDebug += `Lesson list (selector: '${lListSel}') found. `;
                        let lessonElements = lessonListElement.querySelectorAll(lItemSel);
                        panelDebug += `Found ${lessonElements.length} lesson items (selector: '${lItemSel}'). `;

                        lessonElements.forEach((lessonEl) => {
                            let lessonTitle = 'Untitled Lesson';
                            let lessonDuration = "00:00";

                            let lessonTitleElement = lessonEl.querySelector(lTitleSel);
                            if (lessonTitleElement) {
                                lessonTitle = lessonTitleElement.textContent.trim();
                            } else {
                                panelDebug += `L-Title ('${lTitleSel}') NOT found for an item. `;
                            }

                            let lessonDurationElement = lessonEl.querySelector(lDurationSel);
                            if (lessonDurationElement) {
                                const durationText = lessonDurationElement.textContent.trim();
                                const match = durationText.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
                                if (match && match[0]) {
                                    lessonDuration = match[0];
                                }
                            } else {
                                panelDebug += `L-Duration ('${lDurationSel}') NOT found for an item. `;
                            }
                            lessons.push({ lessonTitle, duration: lessonDuration });
                        });
                    } else {
                        panelDebug += `Lesson list (selector: '${lListSel}') NOT found. `;
                    }

                    if ((sectionTitle && sectionTitle !== 'Untitled Section' && sectionTitle.length > 1) || lessons.length > 0) {
                        extractedSections.push({ sectionTitle, lessons, rawPanelIndex: panelIndex });
                    }
                } catch (err) {
                    panelDebug += `Error processing panel: ${err.toString()}. `;
                }
                browserDebugLogs.push(panelDebug);
            });
            return { sections: extractedSections, logs: browserDebugLogs };
        },
        // Pass the user's fixed selectors
        sectionTitleSel_NodeVar,
        lessonListSel_NodeVar,
        lessonItemSel_NodeVar,
        lessonTitleAttrSel_NodeVar,
        lessonDurationAttrSel_NodeVar
        );

        if (evalResult.logs && evalResult.logs.length > 0) {
            console.log("\n--- Browser Context Logs from $$eval ---");
            evalResult.logs.forEach(log => console.log(log));
            console.log("--------------------------------------\n");
        }

        const sectionsData = evalResult.sections;

        if (sectionsData && sectionsData.length > 0) {
            console.log(`[SUCCESS] Found ${sectionsData.length} sections with lessons via DOM scraping.`);
            sectionsData.forEach((sec, index) => {
                console.log(`  [DATA] Section ${index + 1} (Raw Panel Index: ${sec.rawPanelIndex}): "${sec.sectionTitle}" (${sec.lessons.length} lessons)`);
                 sec.lessons.forEach((lesson, lessonIdx) => {
                     console.log(`    [DATA] Lesson ${lessonIdx + 1}: "${lesson.lessonTitle}" - ${lesson.duration}`);
                 });
            });
        } else {
            console.warn("[WARN] No sections with lessons found. Check browser logs, selectors, page structure, ensure sections expanded & content loaded.");
            if (!dumpHtml) {
                 await page.screenshot({ path: 'debug_screenshot_no_sections_data_extracted.png' });
                 console.log("[DEBUG] Screenshot: debug_screenshot_no_sections_data_extracted.png");
            }
        }

        const courseData = {
            courseTitle: courseTitle,
            scrapedUrl: courseUrl,
            scrapeTimestamp: new Date().toISOString(),
            sections: sectionsData.filter(section => section.lessons.length > 0 || (section.sectionTitle && section.sectionTitle !== 'Untitled Section' && section.sectionTitle.length > 0))
        };
        return courseData;

    } catch (error) {
        console.error('[ERROR] Error during scraping process:', error);
        if (page) {
             try {
                await page.screenshot({ path: 'error_screenshot.png' });
                console.log("[DEBUG] Error screenshot: error_screenshot.png");
             } catch (ssError) {
                console.error("[ERROR] Could not take error screenshot:", ssError);
             }
        }
        return { error: error.message, courseTitle: '', scrapedUrl: courseUrl, scrapeTimestamp: new Date().toISOString(), sections: [] };
    } finally {
        if (browser) {
            await browser.close();
            console.log('[INFO] Browser closed.');
        }
    }
}

const args = process.argv.slice(2);
if (args.length < 1) {
    console.error('Usage: node scrape_udemy.js "<UDEMY_COURSE_URL>" [--dump-html]');
    process.exit(1);
}
const udemyUrl = args[0];
const dumpHtmlFlag = args.includes('--dump-html');

scrapeUdemyCourse(udemyUrl, dumpHtmlFlag)
    .then(data => {
        if (dumpHtmlFlag) {
            console.log("[INFO] HTML dump mode was active. Check the .html file.");
            if (data && data.error) {
                 console.error('[FAIL] Scraping process (even in dump mode) reported an error:', data.error);
            }
            return;
        }

        if (data && !data.error && data.sections.length > 0) {
            const outputJson = JSON.stringify(data, null, 2);
            console.log("\n--- Scraped Data (JSON) ---");
            console.log(outputJson);

            const safeCourseTitle = data.courseTitle ? data.courseTitle.replace(/[^\w\s-]/g, '_').replace(/\s+/g, '_') : 'udemy_course';
            // CORRECTED FILENAME GENERATION:
            const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+Z$/, ''); // Remove milliseconds and Z
            const outputFilename = `${safeCourseTitle}_${timestamp}.json`;

            const outputDir = path.join(__dirname, 'output_json');
            if (!fs.existsSync(outputDir)){
                fs.mkdirSync(outputDir, { recursive: true });
            }
            const fullOutputPath = path.join(outputDir, outputFilename);

            fs.writeFileSync(fullOutputPath, outputJson);
            console.log(`\n[SUCCESS] Data saved to ${fullOutputPath}`);
        } else if (data && data.error) {
            console.error('[FAIL] Scraping process reported an error:', data.error);
            if(data.sections && data.sections.length === 0) console.log("[INFO] No sections data was extracted.");
            process.exit(1);
        } else {
            console.log("[FAIL] No data or no sections returned from scraper. Check logs, selectors. Ensure page is fully loaded and sections expanded.");
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('[FAIL] Scraping script failed critically:', error.message);
        process.exit(1);
    });
