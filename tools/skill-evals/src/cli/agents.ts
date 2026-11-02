import type { AgentCommand } from "../adapters/command-coding-agent.ts";

/** How to run one coding agent, and where it looks for project skills. */
export interface AgentPreset extends AgentCommand {
  readonly skillTargetPath: string;
}

type AgentPresetFactory = (model: string) => AgentPreset;

/**
 * Claude Code in print mode. Only project settings load, and no MCP servers, so the user's own
 * instructions, memory and tools do not change the result; the skill is a project skill.
 */
function claudeCode(model: string): AgentPreset {
  return {
    command: [
      "claude",
      "-p",
      "--model",
      model,
      "--permission-mode",
      "bypassPermissions",
      "--setting-sources",
      "project",
      "--strict-mcp-config",
      "--no-session-persistence",
      // One JSON event per line: the transcript shows every tool call, including skill loads.
      "--output-format",
      "stream-json",
      "--verbose",
    ],
    passedVariables: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
    skillTargetPath: ".claude/skills/openapi-typesafe",
  };
}

const AGENT_PRESETS: Readonly<Record<string, AgentPresetFactory>> = { "claude-code": claudeCode };

/** The preset with this name. Throws with the known names on a typo. */
export function resolveAgentPreset(name: string, model: string): AgentPreset {
  const factory = AGENT_PRESETS[name];
  if (factory === undefined) {
    throw new Error(`Unknown agent "${name}"; known: ${Object.keys(AGENT_PRESETS).join(", ")}`);
  }
  return factory(model);
}
