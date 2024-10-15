import { expect, test } from "vitest"
import { calculateLicenseCompatibility } from '../metrics/license';
import { cloneRepository } from '../API/githubAPI';

test("license score for Wat4hjs to be 1", async () => {
    const repoPath = await cloneRepository("hasansultan92", "watch.js")
    const result = await calculateLicenseCompatibility(repoPath)
    expect(result).toBe(1)
}, 60000)

test("license score for cloudinary_npm to be 1", async () => {
    const repoPath = await cloneRepository("cloudinary", "cloudinary_npm")
    expect(await calculateLicenseCompatibility(repoPath)).toBe(1)
}, 60000)

test("license score for SocketIO to be 1", async () => {
    const repoPath = await cloneRepository("socketio", "socket.io")
    const result = await calculateLicenseCompatibility(repoPath)
    expect(result).toBe(1)
}, 60000)

test("license score for libvlc to be 1", async () => {
    const repoPath = await cloneRepository("prathameshnetake", "libvlc")
    expect(await calculateLicenseCompatibility(repoPath)).toBe(1)
}, 60000)

test("license score for nodist to be 1", async () => {
    const repoPath = await cloneRepository("nullivex", "nodist")
    expect(await calculateLicenseCompatibility(repoPath)).toBe(1)
}, 60000)

test("license score for unlicensed to be 0", async () => {
    const repoPath = await cloneRepository("ryanve", "unlicensed")
    expect(await calculateLicenseCompatibility(repoPath)).toBe(0)
}, 60000)