import {expect, test} from "vitest"
import { calculateResponsiveMaintainer } from '../metrics/responsiveMaintainer';

test("responsive maintainer score for Wat4hjs to be low (less than or equal to .33)", async () => {
    expect(await calculateResponsiveMaintainer("hasansultan92", "watch.js")).toBeLessThanOrEqual(.33)
}, 60000)

test("responsive maintainer score for 3js to be high (greater than or equal to .67)", async () => {
    expect(await calculateResponsiveMaintainer("mrdoob", "three.js")).toBeGreaterThanOrEqual(.67)
}, 60000)

test("responsive maintainer score for SocketIO to be medium (in between .33 and .67)", async () => {
    const result = await calculateResponsiveMaintainer("socketio", "socket.io")
    expect(result).toBeGreaterThanOrEqual(.33)
    expect(result).toBeLessThanOrEqual(.67)
}, 60000)

test("responsive maintainer score for libvlc to be low (less than or equal to .33)", async () => {
    expect(await calculateResponsiveMaintainer("prathameshnetake", "libvlc")).toBeLessThanOrEqual(.33)
}, 60000)

test("responsive maintainer score for unlicensed to be low (less than or equal .33)", async () => {
    expect(await calculateResponsiveMaintainer("ryanve", "unlicensed")).toBeLessThanOrEqual(.33)
}, 60000)