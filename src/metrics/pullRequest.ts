import { getRepoPullRequests, getPullRequestReviews } from '../API/githubAPI.js'; // Import API functions
import { logInfo, logDebug, logError } from '../logger.js'; // Import logging functions

// Helper function to evaluate the pull requests with code reviews
async function evaluatePullRequestsWithReviews(owner: string, repo: string): Promise<number> {
    logInfo(`Evaluating pull requests with reviews for ${owner}/${repo}`);
    
    try {
        const pullRequests = await getRepoPullRequests(owner, repo);
        const reviewedPullRequests = await Promise.all(pullRequests.map(async (pr: any) => {
            const reviews = await getPullRequestReviews(owner, repo, pr.number);
            return reviews.length > 0;
        }));

        const reviewedCount = reviewedPullRequests.filter(reviewed => reviewed).length;
        const score = reviewedCount / pullRequests.length;

        logInfo(`Pull requests with reviews score for ${owner}/${repo}: ${score}`);
        return score;
    } catch (error) {
        logError(`Error evaluating pull requests with reviews for ${owner}/${repo}: ${error}`);
        return 0; // Return 0 if there was an error
    }
}

// Main function to calculate the fraction of project code introduced through pull requests with a code review
export async function calculatePullRequestReviewFraction(owner: string, repo: string): Promise<number> {
    try {
        logInfo(`Calculating pull request review fraction for repository: ${owner}/${repo}`);
        const reviewScore = await evaluatePullRequestsWithReviews(owner, repo);
        return reviewScore;
    } catch (error) {
        logError(`Error calculating pull request review fraction: ${error}`);
        return 0; // Return 0 if there was an error
    }
}