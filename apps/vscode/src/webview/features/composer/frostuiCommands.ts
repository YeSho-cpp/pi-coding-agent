import type { RpcCommandDescriptor } from "@frostime/pi-rpc";

const frostui_COMMANDS: RpcCommandDescriptor[] = [
  { name: "compact", description: "Compact the current Pi context", source: "piAgent" },
  { name: "editor", description: "Edit the composer draft in a VS Code tab", source: "piAgent" },
  { name: "resume", description: "Open an existing Pi session for this workspace", source: "piAgent" },
];

export function withFrostUiCommands(commands: RpcCommandDescriptor[], includeResume = true): RpcCommandDescriptor[] {
  const localCommands = includeResume
    ? frostui_COMMANDS
    : frostui_COMMANDS.filter((command) => command.name !== "resume");
  return [
    ...localCommands,
    ...commands.filter((command) => !frostui_COMMANDS.some((local) => local.name === command.name)),
  ];
}
