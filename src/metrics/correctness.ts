import { getCiStatus, getRepoIssues } from '../API/githubAPI.js'; // Import API functions
import * as esprima from 'esprima'; // For static analysis
import { promises as fs } from 'fs';
import * as path from 'path';
import { logInfo, logDebug, logError } from '../logger.js'; 

// Helper function to calculate the issue resolution rate
async function getIssueResolutionRate(owner: string, repo: string): Promise<number> {
    logInfo(`Fetching issue resolution rate for ${owner}/${repo}`);
    try {
        const issues = await getRepoIssues(owner, repo);

        // Filter issues from the last 6 months
        const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
        const recentIssues = issues.filter((issue: any) => new Date(issue.created_at) > sixMonthsAgo);

        const totalIssues = recentIssues.length;
        const closedIssues = recentIssues.filter((issue: any) => issue.state === 'closed').length;

        const resolutionRate = totalIssues > 0 ? closedIssues / totalIssues : 1;
        logDebug(`Issue resolution rate for ${owner}/${repo}: ${resolutionRate}`);
        return resolutionRate;
    } catch (error) {
        logError(`Error fetching issue data for ${owner}/${repo}: ${error}`);
        return 0;
    }
}

// Helper function to find JavaScript files
async function findJavaScriptFiles(dir: string): Promise<string[]> {
    logInfo(`Finding JavaScript files in directory: ${dir}`);
    let jsFiles: string[] = [];

    try {
        const files = await fs.readdir(dir, { withFileTypes: true });

        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                const nestedFiles = await findJavaScriptFiles(fullPath);
                jsFiles = jsFiles.concat(nestedFiles);
            } else if (file.isFile() && file.name.endsWith('.js')) {
                jsFiles.push(fullPath);
            }
        }

        logDebug(`Found ${jsFiles.length} JavaScript files in directory: ${dir}`);
    } catch (error) {
        logError(`Error reading directory ${dir}: ${error}`);
    }

    return jsFiles;
}

// Helper function to perform static analysis using Esprima
async function performStaticAnalysis(repoPath: string): Promise<number> {
    logInfo(`Performing static analysis on ${repoPath}`);
    try {
        const jsFiles = await findJavaScriptFiles(repoPath);
        
        if (jsFiles.length === 0) {
            logInfo('No JavaScript files found, returning full score (1).');
            return 1; // No JS files means no issues, return 1 (full score)
        }
    
        let issueCount = 0;
        let totalCount = jsFiles.length;
    
        for (const file of jsFiles) {
            const code = await fs.readFile(file, 'utf-8');
            try {
                esprima.parseScript(code, { tolerant: true });
            } catch (error) {
                issueCount += 1;
                logDebug(`Syntax error found in file: ${file}`);
            }
        }

        const staticAnalysisScore = totalCount > 0 ? 1 - issueCount / totalCount : 1;
        logInfo(`Static analysis score for ${repoPath}: ${staticAnalysisScore}`);
        return staticAnalysisScore;
    } catch (error) {
        logError(`Error during static analysis for ${repoPath}: ${error}`);
        return 0;
    }
}

// Combine everything to calculate correctness
export async function calculateCorrectness(repoPath: string, owner: string, repo: string): Promise<number> {
    logInfo(`Calculating correctness for ${owner}/${repo}`);
    try {
        const ciStatus = await getCiStatus(owner, repo);
        
        // If no workflow runs are found, set success rate to 0
        const successRate = ciStatus.length > 0
            ? ciStatus.filter(run => run.conclusion === 'success').length / ciStatus.length
            : 0;

        logDebug(`CI success rate for ${owner}/${repo}: ${successRate}`);

        const issueResolutionRate = await getIssueResolutionRate(owner, repo);
        const staticAnalysisScore = await performStaticAnalysis(repoPath);

        // Correctness score calculation
        const correctnessScore = (0.4 * successRate) + (0.4 * issueResolutionRate) + (0.2 * staticAnalysisScore);

        logInfo(`Correctness score for ${owner}/${repo}: ${correctnessScore}`);
        return correctnessScore;
    } catch (error) {
        logError(`Error calculating correctness for ${owner}/${repo}: ${error}`);
        return 0;
    }
}