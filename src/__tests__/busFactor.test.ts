import {expect, test, vi} from "vitest"
import { calculateBusFactor } from '../metrics/busFactor';

test("bus factor for Wat4hjs to be low (less than or equal .33)", async () => {
    expect(await calculateBusFactor("hasansultan92", "watch.js")).toBeLessThanOrEqual(.33)
}, 60000)

test("bus factor for 3js to be high (greater than or equal to .67)", async () => {
    expect(await calculateBusFactor("mrdoob", "three.js")).toBeGreaterThanOrEqual(.67)
}, 60000)

test("bus factor for SocketIO to be medium (in between .33 and .67)", async () => {
    const result = await calculateBusFactor("socketio", "socket.io")
    expect(result).toBeGreaterThanOrEqual(.33)
    expect(result).toBeLessThanOrEqual(.67)
}, 60000)

test("bus factor for libvlc to be low (less than or equal .33)", async () => {
    expect(await calculateBusFactor("prathameshnetake", "libvlc")).toBeLessThanOrEqual(.33)
}, 60000)

test("bus factor for ReactJs to be high (greater than or equal to .67)", async () => {
    expect(await calculateBusFactor("facebook", "react")).toBeGreaterThanOrEqual(.67)
}, 60000)

test("bus factor for unlicensed to be low (less than or equal .33)", async () => {
    expect(await calculateBusFactor("ryanve", "unlicensed")).toBeLessThanOrEqual(.33)
}, 60000)

test("bus factor for a repository with no contributors", async () => {
    // Assuming the repository has zero contributors
    expect(await calculateBusFactor("mockOwner", "emptyRepo")).toBe(0);
}, 60000);

test("bus factor fails gracefully when network issues occur", async () => {
    // Mock the API call to throw an error
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error("Network error"));
    
    expect(await calculateBusFactor("mockOwner", "mockRepo")).toEqual(0);

    vi.restoreAllMocks(); // Clean up mocks
}, 60000);
