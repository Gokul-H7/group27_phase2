import { getRepoIssues, getIssueComments } from '../API/githubAPI.js'; // Import API functions
import { logInfo, logDebug, logError } from '../logger.js'; // Import the logger

// Helper function to check if a version is pinned to at least major+minor version
function isPinnedToMajorMinor(version: string): boolean {
    const versionPattern = /^\d+\.\d+\.\d+$/; // Matches versions like 2.3.4
    return versionPattern.test(version);
}

// Helper function to evaluate the pinning practice
async function evaluatePinningPractice(owner: string, repo: string): Promise<number> {
    logInfo(`Evaluating pinning practice for ${owner}/${repo}`);
    
    try {
        const issues = await getRepoIssues(owner, repo);
        const packageJsonIssue = issues.find((issue: any) => issue.title.includes('package.json'));
        
        if (!packageJsonIssue) {
            logError(`package.json issue not found in ${owner}/${repo}`);
            return 0; // score 0 if package.json issue is missing
        }

        const comments = await getIssueComments(owner, repo, packageJsonIssue.number);
        const packageJsonComment = comments.find((comment: any) => comment.body.includes('package.json content'));

        if (!packageJsonComment) {
            logError(`package.json content not found in comments for ${owner}/${repo}`);
            return 0; // score 0 if package.json content is missing
        }

        const packageJson = JSON.parse(packageJsonComment.body);
        const dependencies = packageJson.dependencies || {};
        const dependencyNames = Object.keys(dependencies);

        if (dependencyNames.length === 0) {
            logInfo(`No dependencies found for ${owner}/${repo}`);
            return 1.0; // score 1.0 if there are no dependencies
        }

        const pinnedDependencies = dependencyNames.filter(dep => isPinnedToMajorMinor(dependencies[dep]));
        const score = pinnedDependencies.length / dependencyNames.length;

        logInfo(`Pinning practice score for ${owner}/${repo}: ${score}`);
        return score;
    } catch (error) {
        logError(`Error evaluating pinning practice for ${owner}/${repo}: ${error}`);
        return 0; // Return 0 if there was an error
    }
}

// Main function to calculate Good Pinning Practice
export async function calculateGoodPinningPractice(owner: string, repo: string): Promise<number> {
    try {
        logInfo(`Calculating Good Pinning Practice for repository: ${owner}/${repo}`);
        const pinningScore = await evaluatePinningPractice(owner, repo);
        return pinningScore;
    } catch (error) {
        logError(`Error calculating good pinning practice: ${error}`);
        return 0; // Return 0 if there was an error
    }
}