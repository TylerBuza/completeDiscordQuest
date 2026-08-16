/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin, { PluginNative } from "@utils/types";
import { findByCodeLazy, findByPropsLazy } from "@webpack";
import { FluxDispatcher, RestAPI } from "@webpack/common";

const Native = VencordNative.pluginHelpers.CompleteDiscordQuest as PluginNative<typeof import("./native")>;

import { QuestButton, QuestsCount } from "./components/QuestButton";
import settings from "./settings";
import { ChannelStore, GuildChannelStore, QuestsStore, RunningGameStore } from "./stores";

const QuestApplyAction = findByCodeLazy("type:\"QUESTS_ENROLL_BEGIN\"") as (questId: string, action: QuestAction) => Promise<any>;
const QuestLocationMap = findByPropsLazy("QUEST_HOME_DESKTOP", "11") as Record<string, any>;

let availableQuests: QuestValue[] = [];
let acceptableQuests: QuestValue[] = [];
let completableQuests: QuestValue[] = [];

const completingQuest = new Map();
const fakeGames = new Map();
const fakeApplications = new Map();
const patchedStoreMethods = new Map<string, Function>();

// Run game/stream spoofs one at a time. Two fake games "running" simultaneously is an obvious
// bot tell, so PLAY_ON_DESKTOP / STREAM_ON_DESKTOP quests take this lock; the rest wait in queue.
let activeInjection: string | null = null;
const injectionQueue: any[] = [];

const CONSENT_WARNING = [
    "Important Notice",
    "",
    "As of April 7th 2026, Discord has expressed their intent to crack down on automating quest completion.",
    "",
    "Use this plugin at your own risk, as you may get flagged by doing so.",
    "",
    "Press OK to keep using this plugin, or Cancel to keep automation disabled."
].join("\n");

export default definePlugin({
    name: "CompleteDiscordQuest",
    description: "A plugin that completes multiple discord quests in background simultaneously.",
    authors: [{
        name: "nicola02nb",
        id: 257900031351193600n
    }],
    settings,
    patches: [
        {
            find: ".PlatformTypes.WEB",
            replacement: {
                match: /(\((\i)\){)(let{leading)/,
                replace: "$1$2?.trailing?.props?.children?.unshift($self.renderQuestButtonTopBar());$3"
            }
        },
        {
            find: "accountContainerRef:",
            replacement: {
                match: /className:\i\.Uo,style:\i,children:\[/,
                replace: "$&$self.renderQuestButtonSettingsBar(),"
            }
        },
        { // PTB Experimental
            find: "\"innerRef\",\"navigate\",\"onClick\"",
            replacement: {
                match: /(\i).createElement\("a",(\i)\)/,
                replace: "$1.createElement(\"a\",$self.renderQuestButtonBadges($2))"
            }
        },
        {
            find: "ApplicationStreamingStore",
            replacement: {
                match: /}getStreamerActiveStreamMetadata\(\){/,
                replace: "}getStreamerActiveStreamMetadata(){const metadata=$self.getStreamerActiveStreamMetadata();if(metadata){return metadata;}"
            }
        }
    ],
    start: () => {
        if (!ensureHasAcceptedToUsePlugin()) {
            stopAllFarming();
            return;
        }

        patchRunningGameStore();
        QuestsStore.addChangeListener(updateQuests);
        updateQuests();
    },
    stop: () => {
        QuestsStore.removeChangeListener(updateQuests);
        stopAllFarming();
        unpatchRunningGameStore();
    },

    renderQuestButtonTopBar() {
        if (settings.store.showQuestsButtonTopBar) {
            return <QuestButton type="top-bar" />;
        }
    },

    renderQuestButtonSettingsBar() {
        if (settings.store.showQuestsButtonSettingsBar) {
            return <QuestButton type="settings-bar" />;
        }
    },

    renderQuestButtonBadges(questButton) {
        if (settings.store.showQuestsButtonBadges && typeof questButton === "string" && questButton === "quests") {
            return (<QuestsCount />);
        }
        // Experiment
        if (settings.store.showQuestsButtonBadges && questButton?.href?.startsWith("/quest-home")
            && Array.isArray(questButton?.children) && questButton.children.findIndex(child => child?.type === QuestsCount) === -1) {
            questButton.children.push(<QuestsCount />);
        }
        return questButton;
    },

    getStreamerActiveStreamMetadata() {
        if (fakeApplications.size > 0) {
            return Array.from(fakeApplications.values()).at(0);
        }
    }
});

// Overriding getRunningGames + getGameForPID alone no longer schedules a heartbeat: modern
// Discord derives quest eligibility from the "visible"/"candidate" views too, and a fake game
// absent from those sits at 0% forever. Wrap them at runtime (each only if the build exposes
// it) so the fake game shows up everywhere Discord looks. Mirrors nyxxbit/discord-quest-completer.
function patchRunningGameStore() {
    const S: any = RunningGameStore;
    const fakes = () => Array.from(fakeGames.values());

    const wrap = (name: string, make: (orig: Function) => Function) => {
        if (typeof S[name] !== "function" || patchedStoreMethods.has(name)) return;
        const orig = S[name].bind(S);
        patchedStoreMethods.set(name, S[name]);
        S[name] = make(orig);
    };

    wrap("getRunningGames", orig => () => [...orig(), ...fakes()]);
    wrap("getGameForPID", orig => (pid: number) => fakes().find((g: any) => g.pid === pid) ?? orig(pid));
    wrap("getVisibleGame", orig => () => fakes()[0] ?? orig());
    wrap("getVisibleRunningGames", orig => () => [...orig(), ...fakes()]);
    wrap("getCandidateGames", orig => () => [...orig(), ...fakes()]);
    wrap("getRunningDiscordApplicationIds", orig => () => {
        const ids = orig();
        const ours = fakes().map((g: any) => String(g.id));
        // shape varies by build, preserve whichever collection came back
        return ids instanceof Set ? new Set([...ids, ...ours]) : [...(ids ?? []), ...ours];
    });
}

function unpatchRunningGameStore() {
    const S: any = RunningGameStore;
    for (const [name, fn] of patchedStoreMethods) S[name] = fn;
    patchedStoreMethods.clear();
}

function isQuestEligibleForFarming(quest: QuestValue): boolean {
    const questConfig = quest.config.taskConfig || quest.config.taskConfigV2;
    if (!Object.keys(questConfig.tasks).some(taskName => {
        return (taskName === "WATCH_VIDEO" && settings.store.farmVideos
            || taskName === "WATCH_VIDEO_ON_MOBILE" && settings.store.farmVideos
            || taskName === "PLAY_ON_DESKTOP" && settings.store.farmPlayOnDesktop
            || taskName === "STREAM_ON_DESKTOP" && settings.store.farmStreamOnDesktop
            || taskName === "PLAY_ACTIVITY" && settings.store.farmPlayActivity);
    })) return false;

    const rewards = quest.config?.rewardsConfig?.rewards || [];
    if (!Array.isArray(rewards) || rewards.length === 0) return false;
    return rewards.some(reward => {
        return (reward.type === 1 && settings.store.farmRewardCodes
            || reward.type === 2 && settings.store.farmInGame
            || reward.type === 3 && settings.store.farmCollectibles
            || reward.type === 4 && settings.store.farmVirtualCurrency
            || reward.type === 5 && settings.store.farmFractionalPremium);
    });
}

function ensureHasAcceptedToUsePlugin(): boolean {
    if (settings.store.hasAcceptedToUsePlugin === true) {
        return true;
    }

    const accepted = window.confirm(CONSENT_WARNING);
    settings.store.hasAcceptedToUsePlugin = accepted;

    if (!accepted) {
        console.warn("Consent not accepted. Quest completion is disabled.");
    }

    return accepted;
}

function updateQuests() {
    if (!settings.store.hasAcceptedToUsePlugin) {
        stopAllFarming();
        console.warn("Consent not accepted. Skipping quest update/completion.");
        return;
    }

    availableQuests = [...QuestsStore.quests.values()];
    acceptableQuests = availableQuests.filter(x => x.userStatus?.enrolledAt == null && new Date(x.config.expiresAt).getTime() > Date.now()) || [];
    completableQuests = availableQuests.filter(x => x.userStatus?.enrolledAt && !x.userStatus?.completedAt && new Date(x.config.expiresAt).getTime() > Date.now()) || [];

    // Stop the spoofed process the moment its quest is no longer completable (completed/expired).
    // The heartbeat handler removes it too, but only if a final beat lands exactly on target;
    // this reconcile guarantees the fake game/pid disappears as soon as the quest finishes.
    for (const questId of [...fakeGames.keys()]) {
        if (!completableQuests.some(q => q.id === questId)) {
            const fakeGame = fakeGames.get(questId);
            fakeGames.delete(questId);
            const games = RunningGameStore.getRunningGames();
            FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: fakeGames.size === 0 ? games : [], games });
            completingQuest.set(questId, false);
            releaseInjection(questId);
        }
    }

    for (const quest of acceptableQuests) {
        if (isQuestEligibleForFarming(quest)) {
            acceptQuest(quest);
        }
    }
    for (const quest of completableQuests) {
        if (completingQuest.has(quest.id)) {
            if (completingQuest.get(quest.id) === false) {
                completingQuest.delete(quest.id);
            }
        } else {
            // Isolate failures: one malformed quest must not abort the whole batch.
            try {
                completeQuest(quest);
            } catch (err) {
                console.error("Failed to complete quest:", quest.config?.messages?.questName, err);
            }
        }
    }
    /* console.log("Available quests updated:", availableQuests);
    console.log("Acceptable quests updated:", acceptableQuests);
    console.log("Completable quests updated:", completableQuests); */
}

function acceptQuest(quest: QuestValue) {
    if (!settings.store.acceptQuestsAutomatically) return;
    console.log("Accepting quest:", quest.config.messages.questName);
    const action: QuestAction = {
        questContent: QuestLocationMap.QUEST_HOME_DESKTOP,
        questContentCTA: "ACCEPT_QUEST",
        sourceQuestContent: 0,
    };
    QuestApplyAction(quest.id, action).then(() => {
        console.log("Accepted quest:", quest.config.messages.questName);
    }).catch(err => {
        console.error("Failed to accept quest:", quest.config.messages.questName, err);
    });
}

function stopCompletingAll() {
    for (const quest of completableQuests) {
        if (completingQuest.has(quest.id)) {
            completingQuest.set(quest.id, false);
        }
    }
    console.log("Stopped completing all quests.");
}

// Free the injection lock held by questId and start the next queued game/stream quest, if any.
function releaseInjection(questId: string) {
    if (activeInjection !== questId) return;
    activeInjection = null;
    const next = injectionQueue.shift();
    if (next) {
        console.log("Starting next queued quest:", next.config?.messages?.questName);
        try {
            completeQuest(next);
        } catch (err) {
            console.error("Failed to start queued quest:", next.config?.messages?.questName, err);
            releaseInjection(next.id);
        }
    }
}

function stopAllFarming() {
    stopCompletingAll();
    activeInjection = null;
    injectionQueue.length = 0;

    if (fakeGames.size > 0) {
        const removedGames = Array.from(fakeGames.values());
        fakeGames.clear();
        const games = RunningGameStore.getRunningGames();
        FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: removedGames, added: games, games });
    }

    if (fakeApplications.size > 0) {
        fakeApplications.clear();
    }
}

function completeQuest(quest: QuestValue) {
    if (!settings.store.hasAcceptedToUsePlugin) {
        stopAllFarming();
        console.warn("Consent not accepted. Cannot complete quests.");
        return;
    }

    const isApp = typeof DiscordNative !== "undefined";
    if (!quest) {
        console.log("You don't have any uncompleted quests!");
    } else {
        // Windows NT allocates PIDs as multiples of 4. Random unaligned PIDs are a spoof tell;
        // cherry-picked from nyxxbit/discord-quest-completer (tasks.ts: rnd(2500,12500)*4).
        const pid = (Math.floor(Math.random() * 10000) + 2500) * 4;

        const { questName } = quest.config.messages;
        const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
        const taskName = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"].find(x => taskConfig.tasks[x] != null);
        if (!taskName) {
            console.log("Unknown task type for quest:", questName);
            return;
        }
        // taskConfigV2 moved the app off config.application onto the task (tasks[key].applications[]).
        // Reading the legacy path crashes on newer quests; fall back through both.
        // Optional: video/activity tasks carry no application, and reading .id off undefined
        // used to throw and kill the whole updateQuests loop, starving every quest after it.
        const application = taskConfig.tasks[taskName]?.applications?.[0] ?? quest.config.application;
        const applicationId = application?.id;
        const applicationName = application?.name;
        const secondsNeeded = taskConfig.tasks[taskName].target;
        let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

        if (!isApp && taskName !== "WATCH_VIDEO" && taskName !== "WATCH_VIDEO_ON_MOBILE") {
            console.log("This no longer works in browser for non-video quests (" + taskName + "). Use the discord desktop app to complete the", questName, "quest!");
            return;
        }

        // Serialize the game/stream spoofs: only one fake process may "run" at a time.
        if (taskName === "PLAY_ON_DESKTOP" || taskName === "STREAM_ON_DESKTOP") {
            if (activeInjection !== null && activeInjection !== quest.id) {
                if (!injectionQueue.some(q => q.id === quest.id)) {
                    injectionQueue.push(quest);
                    completingQuest.set(quest.id, true); // mark busy so updateQuests won't re-enqueue
                    console.log(`Queued ${questName} — waiting for the current game quest to finish.`);
                }
                return;
            }
            activeInjection = quest.id;
        }

        completingQuest.set(quest.id, true);

        console.log(`Completing quest ${questName} (${quest.id}) - ${taskName} for ${secondsNeeded} seconds.`);

        switch (taskName) {
            case "WATCH_VIDEO":
            case "WATCH_VIDEO_ON_MOBILE":
                // Advance 1s per tick instead of 7s: keeps the progress bar smooth (small,
                // frequent steps) rather than jumping in big chunks. The maxFuture buffer caps
                // how far ahead of real time we can report anyway, so a smaller step costs nothing.
                const maxFuture = 10, speed = 1, interval = 1;
                const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
                let completed = false;
                const watchVideo = async () => {
                    while (true) {
                        const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
                        const diff = maxAllowed - secondsDone;
                        const timestamp = secondsDone + speed;

                        if (!completingQuest.get(quest.id)) {
                            console.log("Stopping completing quest:", questName);
                            completingQuest.set(quest.id, false);
                            break;
                        }

                        if (diff >= speed) {
                            const res = await RestAPI.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: Math.min(secondsNeeded, timestamp + Math.random()) } });
                            completed = res.body.completed_at != null;
                            secondsDone = Math.min(secondsNeeded, timestamp);
                        }

                        if (timestamp >= secondsNeeded) {
                            completingQuest.set(quest.id, false);
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, interval * 1000));
                    }
                    if (!completed) {
                        await RestAPI.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: secondsNeeded } });
                    }
                    console.log("Quest completed!");
                };
                watchVideo();
                console.log(`Spoofing video for ${questName}.`);
                break;

            case "PLAY_ON_DESKTOP":
                RestAPI.get({ url: `/applications/public?application_ids=${applicationId}` }).then(async res => {
                    const appData = res.body[0];
                    const exeName = appData.executables?.find(x => x.os === "win32")?.name?.replace(">","") ?? appData.name.replace(/[\/\\:*?"<>|]/g, "");

                    // Prefer the game's real on-disk path (reflects the actual install location,
                    // casing and Windows user). Fall back to a username-stamped profile path when
                    // the game isn't installed. Native only exists in the desktop app.
                    const real = isApp ? await Native.resolveGamePath(exeName, appData.name).catch(() => null) : null;
                    const username = isApp ? await Native.getUsername().catch(() => "user") : "user";
                    const cmdLine = real?.cmdLine ?? `C:\\Users\\${username}\\AppData\\Local\\${appData.name}\\${exeName}`;
                    const exePath = real?.exePath ?? `c:/users/${username.toLowerCase()}/appdata/local/${appData.name.toLowerCase()}/${exeName}`;

                    const fakeGame = {
                        cmdLine,
                        exeName,
                        exePath,
                        hidden: false,
                        isLauncher: false,
                        id: applicationId,
                        name: appData.name,
                        pid: pid,
                        pidPath: [pid],
                        processName: appData.name,
                        start: Date.now(),
                    };
                    const realGames = fakeGames.size === 0 ? RunningGameStore.getRunningGames() : [];
                    fakeGames.set(quest.id, fakeGame);
                    const fakeGames2 = Array.from(fakeGames.values());
                    FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: realGames, added: [fakeGame], games: fakeGames2 });

                    const playOnDesktop = event => {
                        if (event.questId !== quest.id) return;
                        const progress = quest.config.configVersion === 1 ? event.userStatus.streamProgressSeconds : Math.floor(event.userStatus.progress.PLAY_ON_DESKTOP.value);
                        console.log(`Quest progress ${questName}: ${progress}/${secondsNeeded}`);

                        if (!completingQuest.get(quest.id) || progress >= secondsNeeded) {
                            console.log("Stopping completing quest:", questName);

                            fakeGames.delete(quest.id);
                            const games = RunningGameStore.getRunningGames();
                            const added = fakeGames.size === 0 ? games : [];
                            FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: added, games: games });
                            FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", playOnDesktop);

                            if (progress >= secondsNeeded) {
                                console.log("Quest completed!");
                                completingQuest.set(quest.id, false);
                            }
                            releaseInjection(quest.id);
                        }
                    };
                    FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", playOnDesktop);

                    console.log(`Spoofed your game to ${applicationName}. Wait for ${Math.ceil((secondsNeeded - secondsDone) / 60)} more minutes.`);
                }).catch(err => {
                    console.error("Failed to spoof game for quest:", questName, err);
                    completingQuest.set(quest.id, false);
                    releaseInjection(quest.id);
                });
                break;

            case "STREAM_ON_DESKTOP":
                const fakeApp = {
                    id: applicationId,
                    name: `FakeApp ${applicationName} (CompleteDiscordQuest)`,
                    pid: pid,
                    sourceName: null,
                };
                fakeApplications.set(quest.id, fakeApp);

                const streamOnDesktop = event => {
                    if (event.questId !== quest.id) return;
                    const progress = quest.config.configVersion === 1 ? event.userStatus.streamProgressSeconds : Math.floor(event.userStatus.progress.STREAM_ON_DESKTOP.value);
                    console.log(`Quest progress ${questName}: ${progress}/${secondsNeeded}`);

                    if (!completingQuest.get(quest.id) || progress >= secondsNeeded) {
                        console.log("Stopping completing quest:", questName);

                        fakeApplications.delete(quest.id);
                        FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", streamOnDesktop);

                        if (progress >= secondsNeeded) {
                            console.log("Quest completed!");
                            completingQuest.set(quest.id, false);
                        }
                        releaseInjection(quest.id);
                    }
                };
                FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", streamOnDesktop);

                console.log(`Spoofed your stream to ${applicationName}. Stream any window in vc for ${Math.ceil((secondsNeeded - secondsDone) / 60)} more minutes.`);
                console.log("Remember that you need at least 1 other person to be in the vc!");
                break;

            case "PLAY_ACTIVITY":
                const channelId = ChannelStore.getSortedPrivateChannels()[0]?.id ?? Object.values(GuildChannelStore.getAllGuilds()).find(x => x != null && x.VOCAL.length > 0).VOCAL[0].channel.id;
                const streamKey = `call:${channelId}:1`;

                const playActivity = async () => {
                    console.log("Completing quest", questName, "-", quest.config.messages.questName);

                    while (true) {
                        const res = await RestAPI.post({ url: `/quests/${quest.id}/heartbeat`, body: { stream_key: streamKey, terminal: false } });
                        const progress = res.body.progress.PLAY_ACTIVITY.value;
                        console.log(`Quest progress ${questName}: ${progress}/${secondsNeeded}`);

                        await new Promise(resolve => setTimeout(resolve, 20 * 1000));

                        if (!completingQuest.get(quest.id) || progress >= secondsNeeded) {
                            console.log("Stopping completing quest:", questName);

                            if (progress >= secondsNeeded) {
                                await RestAPI.post({ url: `/quests/${quest.id}/heartbeat`, body: { stream_key: streamKey, terminal: true } });
                                console.log("Quest completed!");
                                completingQuest.set(quest.id, false);
                            }
                            break;
                        }
                    }
                };
                playActivity();
                break;

            default:
                console.error("Unknown task type:", taskName);
                completingQuest.set(quest.id, false);
                break;
        }
    }
}
