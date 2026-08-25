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
> This fork builds on [osyduck/completeDiscordQuest](https://github.com/osyduck/completeDiscordQuest), which updates the original [nicola02nb/completeDiscordQuest](https://github.com/nicola02nb/completeDiscordQuest) for current Discord builds.

This is a porting of the original BetterDiscord(BD) plugin [CompleteDiscordQuest](https://github.com/nicola02nb/BetterDiscord-Stuff/tree/main/Plugins/CompleteDiscordQuest).

A Vencord userplugin that completes supported Discord quests one at a time and pauses between quests for native reward claiming.

## Changes in this fork

- Uses one global queue for video, game, stream, and activity quests instead of completing multiple quests concurrently.
- Refreshes Discord's native quest store after startup/reconnects and every 60-75 minutes, so opening the Quests tab is not required.
- Waits for the current reward to be fully claimed before starting the next quest.
- Processes completed, unclaimed rewards one at a time when Discord starts.
- Invokes Discord's native reward action so Discord's own CAPTCHA flow appears; the user still completes the CAPTCHA manually.
- Reports video progress from real elapsed time using the 6-8 second cadence observed in Discord Stable's shipped player code. A fresh 15-minute quest still takes about 15 minutes.
- Uses Discord Stable's observed activity heartbeat schedule: immediate, then 60 seconds, with the final delay shortened to the remaining duration plus one second.
- Notifies the user when an unsupported `ACHIEVEMENT_IN_ACTIVITY` quest offers an avatar decoration/collectible so it can be completed manually.
- Keeps the current-Discord `taskConfigV2`, game-store, process cleanup, and navigation fixes from the osyduck fork.

> [!WARNING]
> Matching selected client timings and serializing work may reduce obvious behavioral anomalies, but it does not make quest automation safe or undetectable. The fake game/stream state, automated progress requests, and automatic invocation of reward claiming can still be detected. Use is at your own risk.

## Installation

Userplugins require a [dev build of Vencord](https://docs.vencord.dev/installing/) built from source — they don't work with the normal installer.

1. Set up the Vencord source and dependencies:

   ```sh
   git clone https://github.com/Vendicated/Vencord
   cd Vencord
   pnpm install
   ```

2. Clone this plugin into `src/userplugins`:

   ```sh
   git clone https://github.com/TylerBuza/completeDiscordQuest src/userplugins/CompleteDiscordQuest
   ```

3. Build and inject into your Discord client:

   ```sh
   pnpm build
   pnpm inject
   ```

4. Fully restart Discord, then enable **CompleteDiscordQuest** in `Settings → Vencord → Plugins`.

To update later, `git pull` inside `src/userplugins/CompleteDiscordQuest`, then run `pnpm build` and reload Discord (`Ctrl+R`).

## Credits

- Original quest-completion snippet by [aamiaa](https://github.com/aamiaa): [gist](https://gist.github.com/aamiaa/204cd9d42013ded9faf646fae7f89fbb)
- Original Vencord and BetterDiscord ports by [nicola02nb](https://github.com/nicola02nb)
- Current Discord compatibility fixes from [osyduck/completeDiscordQuest](https://github.com/osyduck/completeDiscordQuest)
- Running-game store compatibility and Windows-aligned PID ideas from [nyxxbit/discord-quest-completer](https://github.com/nyxxbit/discord-quest-completer)
- Native reward action lookup, CAPTCHA-interceptor approach, and reward platform/location selection adapted from the GPL-3.0 project [saintordevil/questCompleter](https://github.com/saintordevil/questCompleter)

## Features

- One-time consent prompt before automation starts
- Optional automatic quest enrollment
- Set which type of quest can be farmed
- Set which type of reward can be farmed
- Native claim/CAPTCHA flow with one-at-a-time queueing
- Avatar-decoration alerts for unsupported in-game achievement quests
