import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';

// Default log level and file
const logFile = process.env.LOG_FILE || 'default-log.txt';
const logLevel = parseInt(process.env.LOG_LEVEL || '0', 10);

// Ensure log directory exists
const logDir = path.dirname(logFile);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Overwrite the log file at the start of the run
fs.writeFileSync(logFile, ''); // This clears or creates the log file at the start

// Log function
function appendLog(message: string) {
    fs.appendFileSync(logFile, message);
}

// Log functions
export function logInfo(message: string) {
    if (logLevel >= 1) {
        const logMessage = `[INFO] ${new Date().toISOString()} - ${message}\n`;
        appendLog(logMessage);
    }
}

export function logDebug(message: string) {
    if (logLevel >= 2) {
        const logMessage = `[DEBUG] ${new Date().toISOString()} - ${message}\n`;
        appendLog(logMessage);
    }
}

export function logError(message: string) {
    if (logLevel >= 2) {
        const logMessage = `[ERROR] ${new Date().toISOString()} - ${message}\n`;
        appendLog(logMessage);
    }
}