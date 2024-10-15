import { expect, test } from "vitest"
import { calculateRampUp } from '../metrics/rampUp';
import { cloneRepository } from '../API/githubAPI';

test("ramp up time for Wat4hjs to be medium (in between .33 and .67)", async () => {
    const repoPath = await cloneRepository("hasansultan92", "watch.js")
    const result = await calculateRampUp(repoPath)
    expect(result).toBeGreaterThanOrEqual(.33)
    expect(result).toBeLessThanOrEqual(.67)
}, 60000)

test("ramp up time for cloudinary to be high (greater than .67)", async () => {
    const repoPath = await cloneRepository("cloudinary", "cloudinary_npm")
    expect(await calculateRampUp(repoPath)).toBeGreaterThanOrEqual(.67)
}, 60000)

test("ramp up time for SocketIO to be low (in between .33 and .67)", async () => {
    const repoPath = await cloneRepository("socketio", "socket.io")
    const result = await calculateRampUp(repoPath)
    expect(result).toBeLessThanOrEqual(.33)
}, 60000)

test("ramp up time for libvlc to be low (less than or equal .33)", async () => {
    const repoPath = await cloneRepository("prathameshnetake", "libvlc")
    expect(await calculateRampUp(repoPath)).toBeLessThanOrEqual(.33)
}, 60000)

test("ramp up time for nodist to be high (greater than .67)", async () => {
    const repoPath = await cloneRepository("nullivex", "nodist")
    expect(await calculateRampUp(repoPath)).toBeGreaterThanOrEqual(.67)
}, 60000)

test("ramp up time for unlicensed to be low (less than or equal .33)", async () => {
    const repoPath = await cloneRepository("ryanve", "unlicensed")
    expect(await calculateRampUp(repoPath)).toBeLessThanOrEqual(.33)
}, 60000)