// File: scripts/get_video_duration.js
// Purpose: Gets the duration of a video file in seconds using ffprobe-static.
// Usage: node scripts/get_video_duration.js "<VIDEO_FILE_PATH>"

const cp = require('child_process');
const ffprobeStatic = require('ffprobe-static');
const path = require('path');

const videoFilePath = process.argv[2];

if (!videoFilePath) {
    console.error('Error: Video file path argument is missing.');
    process.exit(1);
}

// Construct the command
// -v error: Suppress all non-error messages
// -show_entries format=duration: Only show the duration from the format section
// -of default=noprint_wrappers=1:nokey=1: Output format that's easy to parse (just the value)
const ffprobePath = ffprobeStatic.path;
const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoFilePath
];

try {
    // Using spawnSync for simplicity in this standalone script,
    // as it's called per file and expected to be relatively quick.
    const result = cp.spawnSync(ffprobePath, args, { encoding: 'utf8' });

    if (result.error) {
        console.error(`Error spawning ffprobe: ${result.error.message}`);
        process.exit(1);
    }

    if (result.status !== 0) {
        console.error(`ffprobe exited with status ${result.status}. Stderr: ${result.stderr}`);
        process.exit(1);
    }

    const duration = parseFloat(result.stdout.trim());

    if (isNaN(duration)) {
        console.error(`Error: Could not parse duration from ffprobe output. Output: ${result.stdout}`);
        process.exit(1);
    }

    // Output the duration in seconds to stdout
    process.stdout.write(duration.toString());
    process.exit(0);

} catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`);
    process.exit(1);
}
