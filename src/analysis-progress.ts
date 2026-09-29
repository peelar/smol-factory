export type AnalysisProgress = {
  activity: string;
  sessionId?: string;
  completedItems: number;
  updatedAt: number;
};

// Only project known metadata. Agent text and command output can contain secrets.
export function codexProgress(
  onProgress: (progress: AnalysisProgress) => void,
) {
  let pending = "";
  let dropping = false;
  let sessionId: string | undefined;
  let completedItems = 0;
  return (chunk: string) => {
    for (const part of chunk.split(/(?<=\n)/)) {
      if (!dropping) pending += part;
      if (pending.length > 1024 * 1024) {
        pending = "";
        dropping = true;
      }
      if (!part.endsWith("\n")) continue;
      const line = pending;
      pending = "";
      if (dropping) {
        dropping = false;
        continue;
      }
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (!event || typeof event !== "object") continue;
      let activity: string | undefined;
      if (event.type === "thread.started") {
        if (
          typeof event.thread_id === "string" &&
          /^[a-f0-9-]{36}$/i.test(event.thread_id)
        )
          sessionId = event.thread_id;
        activity = "Codex session started";
      } else if (event.type === "turn.started")
        activity = "Analyzing repository context";
      else if (
        ["item.started", "item.updated", "item.completed"].includes(event.type)
      ) {
        const labels: Record<string, string> = {
          command_execution: "Inspecting repository evidence",
          reasoning: "Analyzing findings",
          agent_message: "Preparing analysis document",
          mcp_tool_call: "Reading connected context",
          web_search: "Looking up supporting sources",
          plan: "Updating analysis plan",
        };
        activity = labels[event.item?.type];
        if (event.type === "item.completed") completedItems++;
      } else if (event.type === "turn.completed")
        activity = "Analysis finished; validating document";
      else if (event.type === "turn.failed" || event.type === "error")
        activity = "Codex reported an error";
      if (activity)
        onProgress({
          activity,
          sessionId,
          completedItems,
          updatedAt: Date.now(),
        });
    }
  };
}
