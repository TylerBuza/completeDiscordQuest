/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { IpcMainInvokeEvent } from "electron";
import { existsSync } from "fs";
import { userInfo } from "os";

export function getUsername(_: IpcMainInvokeEvent): string {
    try {
        return userInfo().username;
    } catch {
        return process.env.USERNAME || process.env.USER || "user";
    }
}

// Look for the game's real executable on disk. When found, the returned paths reflect the
// actual install location, casing and Windows user profile — a far more convincing spoof than
// a fabricated "C:\Program Files\<name>" guess. Returns null when the game isn't installed.
export function resolveGamePath(_: IpcMainInvokeEvent, exeName: string, appName: string): { cmdLine: string; exePath: string; } | null {
    const PF = process.env.ProgramFiles || "C:\\Program Files";
    const PF86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const LOCAL = process.env.LOCALAPPDATA || "";

    const candidates = [
        `${PF}\\${appName}\\${exeName}`,
        `${PF86}\\${appName}\\${exeName}`,
        `${PF86}\\Steam\\steamapps\\common\\${appName}\\${exeName}`,
        `${PF}\\Steam\\steamapps\\common\\${appName}\\${exeName}`,
        `${PF}\\Riot Games\\${appName}\\${exeName}`,
        LOCAL && `${LOCAL}\\${appName}\\${exeName}`,
        LOCAL && `${LOCAL}\\Programs\\${appName}\\${exeName}`,
    ].filter(Boolean) as string[];

    for (const p of candidates) {
        try {
            if (existsSync(p)) {
                return { cmdLine: p, exePath: p.replace(/\\/g, "/").toLowerCase() };
            }
        } catch {
            // permission denied on a root — skip it
        }
    }
    return null;
}
