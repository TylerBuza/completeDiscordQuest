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
   git clone https://github.com/osyduck/completeDiscordQuest src/userplugins/CompleteDiscordQuest
   ```

3. Build and inject into your Discord client:

   ```sh
   pnpm build
   pnpm inject
   ```

4. Fully restart Discord, then enable **CompleteDiscordQuest** in `Settings → Vencord → Plugins`.

To update later, `git pull` inside `src/userplugins/CompleteDiscordQuest`, then run `pnpm build` and reload Discord (`Ctrl+R`).

## Credits:

This is a porting for BetterDiscord of a [snippet](https://gist.github.com/aamiaa/204cd9d42013ded9faf646fae7f89fbb) made by [aamiaa](https://github.com/aamiaa).

## Features:

- One-time consent prompt before automation starts
- Auto enroll quests
- Set which type of quest can be farmed
- Set which type of reward can be farmed
