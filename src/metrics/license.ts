import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logDebug, logError } from '../logger.js'; // Import logging functions

// Pre-defined list of licenses compatible with LGPL-2.1
const compatibleLicenses = [
    'LGPL-2.1', 'GPL-2.0', 'GPL-3.0', 'LGPL-3.0', 'Apache-2.0', 
    'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'X11', 'ISC', 
    'Zlib', 'PSF-2.0', 'Boost-1.0', 'CC0', 'EPL-1.0', 
    'EPL-2.0', 'MPL-2.0', 'Artistic-2.0', 'Public Domain'
];

// Helper function to read and extract license information from a file
async function extractLicenseFromFile(filePath: string): Promise<string | null> {
    logInfo(`Checking for license in file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        logDebug(`File not found: ${filePath}`);
        return null;
    }

    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        
        // Regex to match common license patterns
        const licenseRegex = /(LGPL-2.1|GPL-2.0|GPL-3.0|LGPL-3.0|Apache-2.0|MIT|BSD-2-Clause|BSD-3-Clause|X11|ISC|Zlib|PSF-2.0|Boost-1.0|CC0|EPL-1.0|EPL-2.0|MPL-2.0|Artistic-2.0|Public Domain)/i;
        const match = fileContent.match(licenseRegex);

        if (match) {
            logDebug(`License found: ${match[1]} in file: ${filePath}`);
        } else {
            logDebug(`No license found in file: ${filePath}`);
        }

        return match ? match[1] : null;
    } catch (error) {
        logError(`Error reading file ${filePath}: ${error}`);
        return null;
    }
}

// Helper function to check for a license in the package.json file
async function extractLicenseFromPackageJson(repoPath: string): Promise<string | null> {
    const packageJsonPath = path.join(repoPath, 'package.json');
    logInfo(`Checking for license in package.json at: ${packageJsonPath}`);

    if (!fs.existsSync(packageJsonPath)) {
        logDebug(`package.json not found: ${packageJsonPath}`);
        return null;
    }

    try {
        const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        if (packageJson.license) {
            logDebug(`License found in package.json: ${packageJson.license}`);
            return packageJson.license;
        } else {
            logDebug(`No license field found in package.json`);
            return null;
        }
    } catch (error) {
        logError(`Error reading or parsing package.json at ${packageJsonPath}: ${error}`);
        return null;
    }
}

// Main function to calculate the license score
export async function calculateLicenseCompatibility(repoPath: string): Promise<number> {
    logInfo(`Calculating license compatibility for repository at ${repoPath}`);

    try {
        // Check for LICENSE file first
        let licenseType = await extractLicenseFromFile(path.join(repoPath, 'LICENSE'));

        // If LICENSE file doesn't exist or no license type is found, check README.md
        if (!licenseType) {
            logDebug(`LICENSE file not found, checking README.md`);
            licenseType = await extractLicenseFromFile(path.join(repoPath, 'README.md'));
        }

        // If README.md doesn't have the license, check package.json
        if (!licenseType) {
            logDebug(`README.md file not found or no license found, checking package.json`);
            licenseType = await extractLicenseFromPackageJson(repoPath);
        }

        // Check if the license is compatible
        if (licenseType && compatibleLicenses.includes(licenseType.toUpperCase())) {
            logInfo(`License ${licenseType} is compatible.`);
            return 1; // License is compatible
        } else {
            logInfo(`License ${licenseType} is not compatible.`);
            return 0; // License is not compatible
        }
    } catch (error) {
        logError(`Error calculating license compatibility for ${repoPath}: ${error}`);
        return 0;
    }
}
