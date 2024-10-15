import { expect, test, vi } from 'vitest';
import * as githubAPI from '../API/githubAPI.js'; // Import the module
import { exec } from 'child_process';
import { promisify } from 'util';

// Mock execAsync with Vitest's vi.fn()
const execAsync = promisify(exec) as unknown as ReturnType<typeof vi.fn>;

// Mock file system with Vitest
vi.mock('fs');

// Mock util.promisify for execAsync
vi.mock('util', () => ({
  promisify: vi.fn(() => vi.fn().mockResolvedValue('mock success')),
}));

// Test case for getRepoContributors error handling
test('should log an error and throw when fetching contributors fails', async () => {
  const mockError = new Error('GitHub API error');
  vi.spyOn(githubAPI, 'getRepoContributors').mockRejectedValueOnce(mockError);

  await expect(githubAPI.getRepoContributors('owner', 'repo')).rejects.toThrow('GitHub API error');
});

// Test case for getRepoIssues error handling
test('should log an error and throw when fetching issues fails', async () => {
  const mockError = new Error('GitHub API error');
  vi.spyOn(githubAPI, 'getRepoIssues').mockRejectedValueOnce(mockError);

  await expect(githubAPI.getRepoIssues('owner', 'repo')).rejects.toThrow('GitHub API error');
});

// Test case for getIssueComments error handling
test('should log an error and throw when fetching comments fails', async () => {
  const mockError = new Error('GitHub API error');
  vi.spyOn(githubAPI, 'getIssueComments').mockRejectedValueOnce(mockError);

  await expect(githubAPI.getIssueComments('owner', 'repo', 1)).rejects.toThrow('GitHub API error');
});

// Test case for getUserContributionStats error handling
test('should log an error and throw when fetching contribution stats fails', async () => {
  const mockError = new Error('GitHub API error');
  vi.spyOn(githubAPI, 'getUserContributionStats').mockRejectedValueOnce(mockError);

  await expect(githubAPI.getUserContributionStats('owner', 'repo', 'user')).rejects.toThrow('GitHub API error');
});

// Test case for getCiStatus error handling
test('should log an error and return an empty array when fetching CI status fails', async () => {
  const mockError = new Error('GitHub API error');
  vi.spyOn(githubAPI, 'getCiStatus').mockRejectedValueOnce(mockError);

  await expect(githubAPI.getUserContributionStats('owner', 'repo', 'user')).rejects.toThrow("Not Found - https://docs.github.com/rest/commits/commits#list-commits");
});

// Test case for cleanUpRepository error handling
test('should log an error and throw when cleaning up repository fails', async () => {
  const mockError = new Error('Failed to delete repository');
  (execAsync as ReturnType<typeof vi.fn>).mockRejectedValue(mockError); // Ensure execAsync mock is cast correctly

  await expect(githubAPI.cleanUpRepository('./repos/mockRepo')).rejects.toThrow('Failed to delete repository');
});

const originalGITHUB_TOKEN = process.env.GITHUB_TOKEN;

test('should throw an error if GITHUB_TOKEN is missing', async () => {
    // Temporarily remove the GITHUB_TOKEN
    process.env.GITHUB_TOKEN = '';

    // Clear the module cache to force re-import with the updated environment variable
    vi.resetModules();

    // Dynamically import githubAPI after changing the environment variable
    const githubAPI = await import('../API/githubAPI');

    await expect(githubAPI.getRepoContributors('owner', 'repo')).rejects.toThrow('GITHUB_TOKEN is missing. Please set the token in your environment variables.');

    // Restore the original GITHUB_TOKEN after the test
    process.env.GITHUB_TOKEN = originalGITHUB_TOKEN;
});

test('should throw an error when fetching CI status fails', async () => {
    // Temporarily set the GITHUB_TOKEN
    process.env.GITHUB_TOKEN = 'mocked_github_token';

    // Mocking the octokit instance and its method
    const mockError = new Error('Failed to fetch CI status');
    vi.spyOn(githubAPI, 'getCiStatus').mockRejectedValueOnce(mockError);

    await expect(githubAPI.getCiStatus('mockOwner', 'mockRepo')).rejects.toThrow('Failed to fetch CI status');

    // Restore the original GITHUB_TOKEN
    process.env.GITHUB_TOKEN = originalGITHUB_TOKEN;
});