import { getRepoContributors, getUserContributionStats } from '../API/githubAPI.js';
import { logInfo, logDebug, logError } from '../logger.js';  

// normalized value is bus_factor/total_contributors
// 0 -> project is entirely dependent on one person
// 1 -> project has evenly distributed contributions across many contributors

export async function calculateBusFactor(owner: string, repo: string) {
    logInfo(`Calculating Bus Factor for ${owner}/${repo}...`);

    try {
        const contributors = await getRepoContributors(owner, repo);

        if (contributors.length === 0) {
            logInfo(`No contributors found for ${owner}/${repo}`);
            return 0;
        }

        const contributions: { login: string, contributionCount: number }[] = [];

        // Fetch contribution counts for each contributor
        for (const contributor of contributors) {
            if (contributor.login) {
                logDebug(`Fetching contribution count for contributor: ${contributor.login}`);
                const contributionCount = await getUserContributionStats(owner, repo, contributor.login);
                contributions.push({ login: contributor.login, contributionCount });
            }
        }

        // Sort by contribution count (highest first)
        contributions.sort((a, b) => b.contributionCount - a.contributionCount);

        // Calculate the total number of contributions
        const totalContributions = contributions.reduce((sum, c) => sum + c.contributionCount, 0);

        let accumulatedContributions = 0;
        let busFactor = 0;

        // Identify the smallest number of contributors that account for >75% of contributions
        for (const contribution of contributions) {
            accumulatedContributions += contribution.contributionCount;
            busFactor += 1;
            if (accumulatedContributions >= totalContributions * 0.75) {
                break;
            }
        }

        if (contributors.length === 1) {
            logInfo(`Single contributor for ${owner}/${repo}, returning Bus Factor of 0.`);
            return 0;
        }

        const normalizedBusFactor = Math.round(busFactor / contributors.length * 10000) / 10000;
        logInfo(`Bus Factor calculated for ${owner}/${repo}: ${normalizedBusFactor}`);
        return normalizedBusFactor;

    } catch (error) {
        logError(`Error calculating Bus Factor for ${owner}/${repo}: ${error}`);
        return 0;  // Return 0 in case of an error
    }
}