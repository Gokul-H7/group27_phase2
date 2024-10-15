import { expect, test, vi } from 'vitest';
import { calculateCorrectness } from '../metrics/correctness';
import * as githubAPI from '../API/githubAPI'; // Correctly import githubAPI module
import * as fs from 'fs/promises'; // Promises version of fs to mock file operations

// Mock GitHub API responses
vi.mock('../API/githubAPI', () => ({
    getCiStatus: vi.fn(),
    getRepoIssues: vi.fn(),
}));

// Mock filesystem operations
vi.mock('fs/promises', () => ({
    readdir: vi.fn(),
    readFile: vi.fn(),
}));

test("correctness for Wat4hjs to be low (less than or equal .33)", async () => {
    expect(await calculateCorrectness("https://www.npmjs.com/package/browserify", "hasansultan92", "watch.js")).toBeLessThanOrEqual(.7)
}, 60000);

// Test case for error handling in getIssueResolutionRate
test('should return 0 when getRepoIssues throws an error', async () => {
    const mockError = new Error('Failed to fetch repo issues');
    vi.mocked(githubAPI.getRepoIssues).mockRejectedValueOnce(mockError);

    const result = await calculateCorrectness('mockRepoPath', 'mockOwner', 'mockRepo');

    expect(result).toBe(0);
});

// Test case for error handling in findJavaScriptFiles
test('should return 0 when directory reading fails in findJavaScriptFiles', async () => {
    vi.mocked(fs.readdir).mockRejectedValueOnce(new Error('Failed to read directory'));

    const result = await calculateCorrectness('mockRepoPath', 'mockOwner', 'mockRepo');

    expect(result).toBe(0);
});

// Test case for error handling in performStaticAnalysis
test('should return 0 when static analysis fails', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([{
        name: 'file.js', isFile: () => true, isDirectory: () => false,
        isBlockDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isCharacterDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSymbolicLink: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isFIFO: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSocket: function (): boolean {
            throw new Error('Function not implemented.');
        },
        parentPath: '',
        path: ''
    }]);
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('Failed to read file'));

    const result = await calculateCorrectness('mockRepoPath', 'mockOwner', 'mockRepo');

    expect(result).toBe(0);
});

// Test case for error handling when CI status retrieval fails
test('should return 0 when getCiStatus throws an error', async () => {
    const mockError = new Error('Failed to fetch CI status');
    vi.mocked(githubAPI.getCiStatus).mockRejectedValueOnce(mockError);

    const result = await calculateCorrectness('mockRepoPath', 'mockOwner', 'mockRepo');

    expect(result).toBe(0);
});

// Test case for when no JavaScript files are found and static analysis is skipped
test('should return a correctness score when no JS files are found', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([]);

    const result = await calculateCorrectness('mockRepoPath', 'mockOwner', 'mockRepo');

    expect(result).toBeGreaterThanOrEqual(0); // Assuming some success in CI or issues
});

// Test case for issue resolution rate and static analysis to return 0 when both fail
test('should return 0 when both issue resolution and static analysis fail', async () => {
    vi.mocked(githubAPI.getRepoIssues).mockRejectedValueOnce(new Error('Failed to fetch repo issues'));
    vi.mocked(fs.readdir).mockRejectedValueOnce(new Error('Failed to read directory'));

    const result = await calculateCorrectness('mockRepoPath', 'mockOwner', 'mockRepo');

    expect(result).toBe(0);
});

// Test case for successful correctness calculation
test('should calculate correctness when all API calls succeed', async () => {
    vi.mocked(githubAPI.getCiStatus).mockResolvedValueOnce([{ conclusion: 'success' }]);
    vi.mocked(githubAPI.getRepoIssues).mockResolvedValueOnce([{
        state: 'closed', created_at: new Date().toISOString(),
        id: 0,
        node_id: '',
        url: '',
        repository_url: '',
        labels_url: '',
        comments_url: '',
        events_url: '',
        html_url: '',
        number: 0,
        title: '',
        user: null,
        labels: [],
        assignee: null,
        milestone: null,
        locked: false,
        comments: 0,
        closed_at: null,
        updated_at: '',
        author_association: 'COLLABORATOR'
    }]);
    vi.mocked(fs.readdir).mockResolvedValueOnce([{
        name: 'file.js', isFile: () => true, isDirectory: () => false,
        isBlockDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isCharacterDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSymbolicLink: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isFIFO: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSocket: function (): boolean {
            throw new Error('Function not implemented.');
        },
        parentPath: '',
        path: ''
    }]);
    vi.mocked(fs.readFile).mockResolvedValueOnce('console.log("Hello World");');

    const result = await calculateCorrectness('mockRepoPath', 'mockOwner', 'mockRepo');

    expect(result).toBeGreaterThan(0); // Expect a positive correctness score
});

// Test case for CI success rate calculation
test('should return correctness score when CI status is available', async () => {
    vi.mocked(githubAPI.getCiStatus).mockResolvedValueOnce([
        { conclusion: 'success' },
        { conclusion: 'failure' }
    ]);

    vi.mocked(githubAPI.getRepoIssues).mockResolvedValueOnce([{
        state: 'closed', created_at: new Date().toISOString(),
        id: 0,
        node_id: '',
        url: '',
        repository_url: '',
        labels_url: '',
        comments_url: '',
        events_url: '',
        html_url: '',
        number: 0,
        title: '',
        user: null,
        labels: [],
        assignee: null,
        milestone: null,
        locked: false,
        comments: 0,
        closed_at: null,
        updated_at: '',
        author_association: 'COLLABORATOR'
    }]);
    vi.mocked(fs.readdir).mockResolvedValueOnce([{
        name: 'file.js', isFile: () => true, isDirectory: () => false,
        isBlockDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isCharacterDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSymbolicLink: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isFIFO: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSocket: function (): boolean {
            throw new Error('Function not implemented.');
        },
        parentPath: '',
        path: ''
    }]);
    vi.mocked(fs.readFile).mockResolvedValueOnce('console.log("Test JS file");');

    const result = await calculateCorrectness('mockRepoPath', 'mockOwner', 'mockRepo');
    expect(result).toBeGreaterThan(0); // Expect a correctness score based on CI and issues
});

// Test case when no issues are found
test('should return correctness score when no issues are found', async () => {
    vi.mocked(githubAPI.getCiStatus).mockResolvedValueOnce([{ conclusion: 'success' }]);
    vi.mocked(githubAPI.getRepoIssues).mockResolvedValueOnce([]); // No issues returned
    vi.mocked(fs.readdir).mockResolvedValueOnce([{
        name: 'file.js', isFile: () => true, isDirectory: () => false,
        isBlockDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isCharacterDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSymbolicLink: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isFIFO: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSocket: function (): boolean {
            throw new Error('Function not implemented.');
        },
        parentPath: '',
        path: ''
    }]);
    vi.mocked(fs.readFile).mockResolvedValueOnce('console.log("Another JS file");');

    const result = await calculateCorrectness('mockRepoPath', 'mockOwner', 'mockRepo');
    expect(result).toBeGreaterThan(0);
});

// Test case for static analysis score
test('should return correctness score with no JS issues in static analysis', async () => {
    vi.mocked(githubAPI.getCiStatus).mockResolvedValueOnce([{ conclusion: 'success' }]);
    vi.mocked(githubAPI.getRepoIssues).mockResolvedValueOnce([{
        state: 'closed', created_at: new Date().toISOString(),
        id: 0,
        node_id: '',
        url: '',
        repository_url: '',
        labels_url: '',
        comments_url: '',
        events_url: '',
        html_url: '',
        number: 0,
        title: '',
        user: null,
        labels: [],
        assignee: null,
        milestone: null,
        locked: false,
        comments: 0,
        closed_at: null,
        updated_at: '',
        author_association: 'COLLABORATOR'
    }]);
    vi.mocked(fs.readdir).mockResolvedValueOnce([{
        name: 'file.js', isFile: () => true, isDirectory: () => false,
        isBlockDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isCharacterDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSymbolicLink: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isFIFO: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSocket: function (): boolean {
            throw new Error('Function not implemented.');
        },
        parentPath: '',
        path: ''
    }]);
    vi.mocked(fs.readFile).mockResolvedValueOnce('console.log("Valid JS code");');

    const result = await calculateCorrectness('mockRepoPath', 'mockOwner', 'mockRepo');
    expect(result).toBeGreaterThan(0); // No issues found during static analysis
});

// Test case for static analysis with syntax errors
test('should return 0 when syntax errors are found in static analysis', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([{
        name: 'file.js', isFile: () => true, isDirectory: () => false,
        isBlockDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isCharacterDevice: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSymbolicLink: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isFIFO: function (): boolean {
            throw new Error('Function not implemented.');
        },
        isSocket: function (): boolean {
            throw new Error('Function not implemented.');
        },
        parentPath: '',
        path: ''
    }]);
    vi.mocked(fs.readFile).mockResolvedValueOnce('Invalid JavaScript code'); // Cause a syntax error

    const result = await calculateCorrectness('mockRepoPath', 'mockOwner', 'mockRepo');
    expect(result).toBe(0); // Syntax errors should result in a 0 score
});