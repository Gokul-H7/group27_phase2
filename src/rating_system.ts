import { Worker } from 'worker_threads';
import path from 'path';
import { logInfo, logError } from './logger.js';
import { calculateBusFactor } from './metrics/busFactor.js';
import { calculateCorrectness } from './metrics/correctness.js';
import { calculateResponsiveMaintainer } from './metrics/responsiveMaintainer.js';
import { calculateRampUp } from './metrics/rampUp.js';
import { calculateLicenseCompatibility } from './metrics/license.js';
import { calculateGoodPinningPractice } from './metrics/goodPinningPractice.js';
import { calculatePullRequestReviewFraction } from './metrics/pullRequest.js';

// Worker script path for parallel execution
const WORKER_SCRIPT_PATH = path.resolve(__dirname, 'metricsWorker.js');

interface PackageMetrics {
    URL: string;
    NetScore: number;
    RampUp: number;
    Correctness: number;
    BusFactor: number;
    ResponsiveMaintainer: number;
    LicenseCompatibility: number;
    GoodPinningPractice: number;
    PullRequests: number;
    FinalScore: number;
}

// Helper function to run a worker thread and calculate repository metrics
function runWorker(workerData: any): Promise<PackageMetrics> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(WORKER_SCRIPT_PATH, { workerData });
        worker.on('message', (message) => resolve(message));
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });
    });
}

// Function to calculate final score based on metrics
function calculateFinalScore(metrics: PackageMetrics): number {
    // Assign weights to each metric (this can be adjusted based on importance)
    const weights = {
        RampUp: 0.15,
        Correctness: 0.15,
        BusFactor: 0.15,
        ResponsiveMaintainer: 0.25,
        LicenseCompatibility: 0.10,
        GoodPinningPractice: 0.10,
        PullRequests: 0.10,
    };

    // Weighted sum of all metrics to get the final score
    const NetScore =  (metrics.RampUp * weights.RampUp) +
                      (metrics.Correctness * weights.Correctness) +
                      (metrics.BusFactor * weights.BusFactor) +
                      (metrics.ResponsiveMaintainer * weights.ResponsiveMaintainer) +
                      (metrics.LicenseCompatibility * weights.LicenseCompatibility) +
                      (metrics.GoodPinningPractice * weights.GoodPinningPractice) +
                      (metrics.PullRequests * weights.PullRequests);

    return parseFloat(NetScore.toFixed(2)); // Round to 2 decimal places
}

// Main function to run metrics and calculate the rating for all repositories
export async function runMetricsForAllRepos(repositories: { owner: string; repo: string; repoURL: string }[]) {
    const results: PackageMetrics[] = [];

    const tasks = repositories.map(async ({ owner, repo, repoURL }) => {
        try {
            // Run worker for each repository
            const metrics = await runWorker({ owner, repo, repoURL });
            logInfo(`Metrics for ${repoURL}: ${JSON.stringify(metrics)}`);

            // Calculate final score
            const finalScore = calculateFinalScore(metrics);
            logInfo(`Final Score for ${repoURL}: ${finalScore}`);

            // Include final score in the results
            results.push({ ...metrics, FinalScore: finalScore });
        } catch (error) {
            const err = error as Error; // Type assertion
            logError(`Error processing repository ${repoURL}: ${err.message}`);
        }
    });

    await Promise.all(tasks);

    // Log and return the final results
    results.forEach(result => logInfo(JSON.stringify(result, null, 2)));
    return results;
}
