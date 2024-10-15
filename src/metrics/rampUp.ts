import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logDebug, logError } from '../logger.js'; // Import the logger

// Helper function to extract content under each section
function extractSectionContent(content: string, sectionPattern: RegExp, nextSectionPatterns: RegExp[]): string {
    const sectionMatch = content.match(sectionPattern);
    if (sectionMatch) {
        const sectionStartIndex = sectionMatch.index! + sectionMatch[0].length;
        let sectionEndIndex = content.length; // Default to the end of the file

        // Find the next section and limit the end of the current section
        for (const nextPattern of nextSectionPatterns) {
            const nextSectionMatch = content.slice(sectionStartIndex).match(nextPattern);
            if (nextSectionMatch) {
                sectionEndIndex = sectionStartIndex + nextSectionMatch.index!;
                break;
            }
        }

        // Return the content between the current section and the next one
        return content.slice(sectionStartIndex, sectionEndIndex).trim();
    }
    return '';
}

// Helper function to evaluate the documentation
function evaluateDocumentation(repoPath: string): number {
    let readmePath = path.join(repoPath, 'README.md');
    logInfo(`Evaluating documentation for ${repoPath}`);
    if (!fs.existsSync(readmePath)) {
        logInfo(`Couldn't find README.me at ${repoPath}`);
        readmePath = path.join(repoPath, 'readme.markdown');
        if (!fs.existsSync(readmePath)) {
            console.error('README file not found.');
            return 0; // score 0 if README is missing
        }
    }

    const content = fs.readFileSync(readmePath, 'utf8');
    logDebug(`README content: ${content}`);

    // Define regex patterns for key sections
    const installationPattern = /installation/i;
    const usagePattern = /usage/i;
    const apiPattern = /api/i;
    const dependenciesPattern = /dependencies/i;

    // List of patterns to detect section headers
    const sectionPatterns = [installationPattern, usagePattern, apiPattern, dependenciesPattern];
    
    // Extract and evaluate the content under each section
    const installationContent = extractSectionContent(content, installationPattern, sectionPatterns);
    const usageContent = extractSectionContent(content, usagePattern, sectionPatterns);
    const apiContent = extractSectionContent(content, apiPattern, sectionPatterns);
    const dependenciesContent = extractSectionContent(content, dependenciesPattern, sectionPatterns);

    // Count code examples (assuming code blocks use triple backticks)
    const codeExampleCount = (content.match(/```/g) || []).length / 2;

    // Scoring system
    let score = 0;
    if (installationContent.length > 100) score += 0.3;
    if (usageContent.length > 100) score += 0.3;
    if (apiContent.length > 50) score += 0.2;
    if (dependenciesContent.length > 50) score += 0.1;
    score += Math.min(codeExampleCount * 0.1, 0.2); // max 0.2 points for examples

    // Normalize the score
    const finalScore = Math.min(score, 1); // Ensure score is between 0 and 1
    logInfo(`Documentation score for ${repoPath}: ${finalScore}`);

    return finalScore;
}

// Main function to calculate Ramp-Up Time
export async function calculateRampUp(repoPath: string): Promise<number> {
    try {
        logInfo(`Calculating Ramp-Up Time for repository: ${repoPath}`);
        const documentationScore = evaluateDocumentation(repoPath);
        return documentationScore;
    } catch (error) {
        logError(`Error calculating ramp-up time: ${error}`);
        return 0; // Return 0 if there was an error
    }
}
