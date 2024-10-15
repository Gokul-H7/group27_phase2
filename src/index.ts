import * as dotenv from 'dotenv';
dotenv.config();
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { logInfo, logDebug, logError } from './logger.js'; 
import yargs from 'yargs';

// Simulate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Worker script for running metrics calculations in parallel
const WORKER_SCRIPT_PATH = path.resolve(__dirname, 'metricsWorker.js');

interface PackageMetrics {
    URL: string;
    NetScore: number;
    NetScore_Latency: number;
    RampUp: number;
    RampUp_Latency: number;
    Correctness: number;
    Correctness_Latency: number;
    BusFactor: number;
    BusFactor_Latency: number;
    ResponsiveMaintainer: number;
    ResponsiveMaintainer_Latency: number;
    License: number;
    License_Latency: number;
}

// Helper function to run a worker thread
function runWorker(workerData: any): Promise<PackageMetrics> {
    return new Promise((resolve, reject) => {
        logDebug(`Starting worker for ${JSON.stringify(workerData)}`);
        const worker = new Worker(WORKER_SCRIPT_PATH, { workerData });
        worker.on('message', (message) => {
            logInfo(`Worker completed: ${JSON.stringify(message)}`);
            resolve(message);
        });
        worker.on('error', (error) => {
            logError(`Worker encountered error: ${error.message}`);
            reject(error);
        });
        worker.on('exit', (code) => {
            if (code !== 0) {
                logError(`Worker stopped with exit code ${code}`);
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

// Main function to run metrics for each repository
export async function runMetricsForAllRepos(repositories: { owner: string; repo: string; repoURL: string }[]) {
    const results: PackageMetrics[] = [];
    const tasks = repositories.map(({ owner, repo, repoURL }) => runWorker({ owner, repo, repoURL }));

    try {
        logInfo(`Starting metrics analysis for ${repositories.length} repositories.`);
        const metricsResults = await Promise.all(tasks);
        results.push(...metricsResults);
        results.forEach(result => console.log(JSON.stringify(result, null, 2)));
        results.forEach(result => logInfo(`Metrics result: ${JSON.stringify(result)}`));
    } catch (error) {
        logError(`Error running metrics in worker threads: ${error}`);
    }
}

export async function getRepoFromNpm(packageName: string): Promise<{ owner: string; repo: string } | null> {
    return new Promise((resolve, reject) => {
        logInfo(`Fetching repository information for npm package: ${packageName}`);
        const options = {
            hostname: 'registry.npmjs.org',
            path: `/${packageName}`,
            method: 'GET',
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const packageData = JSON.parse(data);

                    if (packageData.repository && packageData.repository.url) {
                        let repoUrl = packageData.repository.url;
                        repoUrl = repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');

                        const githubRegex = /(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com[:\/])([^\/]+)\/([^\/]+)/;
                        const match = repoUrl.match(githubRegex);

                        if (match && match.length >= 3) {
                            const owner = match[1];
                            const repo = match[2];
                            logInfo(`Repository found: ${owner}/${repo}`);
                            resolve({ owner, repo });
                        } else {
                            logError(`Invalid repository URL format: ${repoUrl}`);
                            resolve(null);
                        }
                    } else {
                        logError(`Repository URL not found for package: ${packageName}`);
                        resolve(null);
                    }
                } catch (error) {
                    logError(`Error parsing package metadata for ${packageName}: ${error}`);
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            logError(`Error fetching package data for ${packageName}: ${error}`);
            reject(error);
        });

        req.end();
    });
}

export async function getRepositoriesFromFile(filePath: string): Promise<{ owner: string; repo: string; repoURL: string }[]> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const urls = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    const repositories = await Promise.all(urls.map(async (url) => {
        const githubMatch = /https:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/.exec(url);
        const npmMatch = /https:\/\/www\.npmjs\.com\/package\/([^\/]+)/.exec(url);

        if (githubMatch) {
            const owner = githubMatch[1];
            const repo = githubMatch[2];
            logInfo(`Found GitHub repository: ${owner}/${repo}`);
            return { owner, repo, repoURL: `https://github.com/${owner}/${repo}` };
        } else if (npmMatch) {
            const npmPackageName = npmMatch[1];
            logInfo(`Fetching repository for npm package: ${npmPackageName}`);
            const repoData = await getRepoFromNpm(npmPackageName);
            if (repoData) {
                return { owner: repoData.owner, repo: repoData.repo, repoURL: `https://github.com/${repoData.owner}/${repoData.repo}` };
            }
        }

        logError(`No valid repository found for URL: ${url}`);
        return null;
    }));

    return repositories.filter((repo): repo is { owner: string; repo: string; repoURL: string } => repo !== null);
}

function validateFilePath(filePath: string): boolean {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        const fileStats = fs.statSync(filePath);
        if (!fileStats.isFile() || !filePath.endsWith('.txt')) {
            logError(`Invalid file type or missing file: ${filePath}`);
            return false;
        }
        return true;
    } catch (error) {
        logError(`Error validating file path: ${filePath} - ${error}`);
        return false;
    }
}

// Main CLI logic
const argv = yargs(process.argv.slice(2))
    .demandCommand(0, 1, 'You need to provide a command or a file path')
    .check(async (argv) => {
        // Print the filepath if provided
        if (argv._.length === 1) {
            const filePath = argv._[0] as string;
            if (!validateFilePath(filePath)) {
                throw new Error('Invalid file path provided');
            }
        }
        const repositoriesFromFile = await getRepositoriesFromFile(argv._[0] as string);
        logInfo(`Repositories from file: ${JSON.stringify(repositoriesFromFile)}`);
        await runMetricsForAllRepos(repositoriesFromFile);
        return true;
    })
    .argv;
