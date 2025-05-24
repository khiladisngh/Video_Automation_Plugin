# Premiere Pro - Video Automation Hub Plugin

**Automate your Udemy (and other platform) course video production workflow directly within Adobe Premiere Pro!**

This plugin streamlines the process of creating video projects by taking your course structure (e.g., from Udemy), local video files, and slide assets, then automatically setting up your Premiere Pro project with organized bins and sequences.

![Placeholder for Plugin Demo GIF](https://placehold.co/800x450/252525/F0F0F0?text=Plugin+Interface+Demo+GIF)
*(Replace this with a GIF showcasing the plugin's UI and core functionality)*

## ✨ Features

* **Automated Project Setup:** Creates a structured Premiere Pro project with dedicated folders for your course.
* **Udemy Course Scraper:** Fetches course structure (sections, lessons, durations) directly from a Udemy course URL.
* **Local File Integration:**
    * Lists local raw video files.
    * Retrieves actual video durations using `ffprobe`.
* **Intelligent Matching:** Matches Udemy lessons with local video files based on duration (with tolerance).
* **Slide Management:**
    * Identifies required slide assets (intro, outro, blank, section-specific).
    * Assigns available slides sequentially to sections and lessons.
* **Master Plan Generation:** Creates a detailed JSON "Master Plan" outlining the entire video structure, including media paths and slide assignments.
* **Premiere Pro Automation (via ExtendScript):**
    * Imports all necessary video and slide assets into organized bins.
    * Creates sequences for each lesson based on the Master Plan.
    * Populates sequences with corresponding slides and the matched video clip.
* **Modern UI:** User-friendly interface designed to feel at home within Premiere Pro, supporting both light and dark themes.

## 🚀 Installation Guide

This plugin is a CEP (Common Extensibility Platform) extension for Adobe Premiere Pro.

### Prerequisites

* **Adobe Premiere Pro CC:** Version that supports CEP 11 extensions (PPro `24.0` or newer as per `manifest.xml`).
* **Node.js & npm:** Required by the plugin for its helper scripts (Udemy scraper, video duration). Ensure these are installed on your system.
* **`ffprobe`:** The `get_video_duration.js` script relies on `ffprobe` (which is bundled via `ffprobe-static` in `package.json`).

### Installation Steps

There are several ways to install CEP extensions:

**Method 1: Using an Extension Manager (Recommended)**

1.  **Download a ZXP/CEP Extension Manager:**
    * [Anastasiy's Extension Manager](https://install.anastasiy.com/) (Windows/macOS, free and paid versions)
    * [ZXPInstaller](https://zxpinstaller.com/) (Windows/macOS, free)
2.  **Package the Plugin (if not already a `.zxp`):**
    * If you have the plugin source code, you'll first need to package it into a `.zxp` file. You can use the `ZXPSignCmd` tool provided by Adobe or other third-party tools.
    * *(Placeholder: Add specific command here if you provide a build script for ZXP)*
    * For example, you might add a script to your `package.json`: `"package-zxp": "cep-bundler -p your_certificate.p12 -w your_password -s dist -o release/YourPlugin.zxp"` (This is a hypothetical example using a tool like `cep-bundler`).
3.  **Install via Extension Manager:**
    * Download the `.zxp` file of the plugin.
    * Open your chosen Extension Manager.
    * Drag and drop the `.zxp` file into the manager, or use its "Install" option to browse for the file.
    * Follow the on-screen prompts.

**Method 2: Manual Installation (for development/testing)**

This method involves copying the plugin files directly into the Adobe CEP extensions folder.

1.  **Locate your CEP Extensions Folder:**
    * **Windows:** `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\`
        * Or for user-specific: `C:\Users\<YourUserName>\AppData\Roaming\Adobe\CEP\extensions\`
    * **macOS:** `/Library/Application Support/Adobe/CEP/extensions/`
        * Or for user-specific: `~/Library/Application Support/Adobe/CEP/extensions/`
        *(Note: The `AppData` and `~/Library` folders might be hidden by default.)*

2.  **Copy the Plugin Folder:**
    * Copy the entire plugin folder (the root of this repository, which should be named `com.gishant.videoautomationhub` or ensure the `Id` in `CSXS/manifest.xml` matches the folder name if you rename it) into the CEP extensions folder identified above.

3.  **Enable Debug Mode (if necessary):**
    * You might need to enable unsigned extension loading, especially for manual installs.
    * **Windows:** Open `regedit`. Navigate to `HKEY_CURRENT_USER\Software\Adobe\CSXS.11` (the number `11` corresponds to the `RequiredRuntime Name="CSXS" Version="11.0"` in your `manifest.xml`. If you change this version, update the registry path accordingly). Add a new String value named `PlayerDebugMode` and set its value to `1`.
    * **macOS:** Open Terminal and run: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1` (again, adjust the `CSXS.11` number as needed, matching your manifest).
    * Restart Premiere Pro after making these changes.

4.  **Verify Installation:**
    * Launch Adobe Premiere Pro.
    * Go to `Window > Extensions`. You should see "Video Automator Plugin" (the menu name defined in `manifest.xml`) listed. Click it to open the panel.

## 🛠️ Usage

The plugin guides you through a 3-step process:

### Step 1: Project Setup

1.  **Course Name:** Enter a descriptive name for your course (e.g., "Wireshark for Beginners").
2.  **Base Directory for Courses:** Select a parent directory on your system where all your course project folders will reside (e.g., `D:/VideoProjects/Udemy`). The plugin will create a subfolder here named after your course.
3.  **Click "Create/Open Project & Folders":**
    * This creates the necessary subfolder structure (e.g., `_01_RAW_VIDEOS`, `_02_SLIDES`, `_03_PROJECT_DATA`, `_04_PREMIERE_PROJECTS`).
    * It creates or opens a Premiere Pro project file (`.prproj`) named after your course inside the `_04_PREMIERE_PROJECTS` folder.
4.  **Follow Next Steps (as indicated in the plugin UI):**
    * Place your raw video lecture files into the `_01_RAW_VIDEOS` folder.
    * Place all your slide images (TIF, PNG, JPG, etc.) into the `_02_SLIDES` folder. Ensure your slides are named sequentially (e.g., `Slide1.tif`, `Slide2.tif`, `Slide3.tif`, etc.) as the plugin will assign them based on availability and order.

### Step 2: Data Fetching & Planning

1.  **Udemy Course URL:** Paste the full URL of the Udemy course you want to process.
2.  **Click "Fetch Course Structure":** The plugin will scrape the Udemy page to get section titles, lesson titles, and lesson durations. This data will appear in the "Scraped Udemy Data (Raw)" text area.
3.  **Raw Videos Path & Slides Path:** These should be auto-populated if Step 1 was completed. Verify they point to your `_01_RAW_VIDEOS` and `_02_SLIDES` folders respectively. You can also browse manually.
4.  **Click "List Videos & Get Durations":** The plugin scans the `_01_RAW_VIDEOS` folder, lists found video files, and uses `ffprobe` to get their actual durations. This appears in "Local Video Files (Raw)".
5.  **Click "Validate Slides & Generate Master Plan":**
    * This is the core planning step. The plugin will:
        * Attempt to match your local video files to the scraped Udemy lessons based on duration.
        * Scan the `_02_SLIDES` folder for available slides.
        * Assign slides (blank slides, section intros, lesson intros/outros) to the appropriate places in the plan.
    * A preview of the "Master Plan" (a JSON object) will appear in the "Generated Master Plan (Preview)" text area.
    * Any local videos that couldn't be matched will be listed in "Unmatched Local Videos."
    * **Important:** If you have unmatched videos, review them. If these videos had corresponding slides that are *not* needed for the matched lessons, **manually remove those specific slides** from your `_02_SLIDES` directory.
    * If you removed slides, click **"Confirm Slide Removal & Regenerate"** to update the Master Plan.
6.  The final Master Plan JSON is saved in your `_03_PROJECT_DATA` folder.

### Step 3: Premiere Pro Automation

1.  **Ensure the correct Premiere Pro project is open** (the one created/opened in Step 1).
2.  **Click "Generate Bins & Sequences" (this button enables after a Master Plan is successfully generated):**
    * The plugin will execute an ExtendScript (`.jsx`) file in Premiere Pro.
    * The script reads the Master Plan JSON.
    * It imports all videos from `_01_RAW_VIDEOS_IMPORTED` (a bin it creates for imported videos) and slides from `_02_SLIDES_IMPORTED` (a bin for imported slides) into dedicated bins within your Premiere Pro project. Note: The source folders on disk are `_01_RAW_VIDEOS` and `_02_SLIDES`.
    * It creates a new bin for each section of your course.
    * Inside each section bin, it creates a sequence for every lesson that has a matched video.
    * Each lesson sequence is populated using `app.project.createNewSequenceFromClips` with:
        * Blank slides (if it's the first video lesson in a section).
        * Section intro slide (if applicable).
        * Lesson intro slide.
        * The matched video clip.
        * Lesson outro slide.

![Placeholder for Premiere Pro Bins GIF](https://placehold.co/600x400/252525/F0F0F0?text=Organized+PPro+Bins+GIF)
*(Replace this with a GIF showing the organized bins and sequences in Premiere Pro after processing)*

## 💻 Technical Stack

* **Frontend (Panel UI):** HTML, CSS, JavaScript
* **Backend (Premiere Pro Scripting):** ExtendScript (JavaScript dialect for Adobe apps - `.jsx`)
* **Helper Scripts (Node.js):**
    * `scrape_udemy.js`: Uses [Puppeteer](https://pptr.dev/) for web scraping.
    * `get_video_duration.js`: Uses `ffprobe` (via [ffprobe-static](https://www.npmjs.com/package/ffprobe-static)) for video analysis.
* **CEP (Common Extensibility Platform):** The framework enabling communication between the HTML panel and Premiere Pro.
* **`CSInterface.js`:** Adobe-provided library for CEP panel-host communication.
* **`json2.js`:** Polyfill for JSON parsing in ExtendScript.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📜 License

Distributed under the MIT License.

---

**Disclaimer:** Web scraping can be fragile and may break if Udemy changes its website structure. This tool is provided as-is. Always respect website terms of service.
