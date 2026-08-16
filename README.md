> [!CAUTION]
> As of April 7th 2026, Discord has expressed their intent to crack down on automating quest completion.
>
> Some users have received the following system message:
>
> <img width="836" height="272" alt="574947159-6b439f4b-4381-4524-8540-b6a4777a80d0" src="https://github.com/user-attachments/assets/db4c7641-dd57-412e-a625-f39a363f2138" />
>
> There isn't much I can do to make the script undetected, so use it at your own risk, as you most likely WILL get flagged by doing so.

# CompleteDiscordQuest for Vencord

> [!NOTE]
> **This is an actively maintained fork.** The upstream repository [nicola02nb/completeDiscordQuest](https://github.com/nicola02nb/completeDiscordQuest) no longer receives updates, so this fork ([osyduck/completeDiscordQuest](https://github.com/osyduck/completeDiscordQuest)) carries the fixes needed to keep the plugin working on current Discord builds.

This is a porting of the original BetterDiscord(BD) plugin [CompleteDiscordQuest](https://github.com/nicola02nb/BetterDiscord-Stuff/tree/main/Plugins/CompleteDiscordQuest).

A Vencord(VC) plugin that completes you multiple discord quests in background simultaneously.

## Changes in this fork:

- Fixed quest completion crashing on newer `taskConfigV2` quests (app moved off `config.application`)
- Store spoof rewritten as runtime wrappers over `getRunningGames` / `getGameForPID` / `getVisibleGame` / `getVisibleRunningGames` / `getCandidateGames` / `getRunningDiscordApplicationIds` — modern Discord derives quest eligibility from the visible/candidate views, so the old two-method patch left quests stuck at 0%
- Game/stream spoofs now run one at a time (queued) instead of all at once, to avoid the "playing several games simultaneously" bot tell
- Spoofed process reports the game's real on-disk path when installed, falling back to a path stamped with the real Windows username
- PIDs generated as multiples of 4 (Windows NT alignment)
- Spoofed process stops as soon as its quest completes or expires
- Quest button navigation fixed (renamed `navigateToQuestHome` module)

## Credits:

This is a porting for BetterDiscord of a [snippet](https://gist.github.com/aamiaa/204cd9d42013ded9faf646fae7f89fbb) made by [aamiaa](https://github.com/aamiaa).

## Features:

- One-time consent prompt before automation starts
- Auto enroll quests
- Set which type of quest can be farmed
- Set which type of reward can be farmed
