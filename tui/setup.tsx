import { useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { clean } from "./model";
import { FactoryError } from "../src/io";

export type SetupAction = "status" | "install-skill";
type SetupStatus = {
  onboarding?: "unconfigured" | "complete";
  repository?: string;
  skillInstalled?: boolean;
};

export function Setup({
  root,
  run,
  onQueue,
  onQuit,
}: {
  root: string;
  run: (action: SetupAction) => Promise<unknown>;
  onQueue: () => void;
  onQuit: () => void;
}) {
  const [status, setStatus] = useState<SetupStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const execute = async (action: SetupAction) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setStatus((await run(action)) as SetupStatus);
    } catch (cause) {
      setError(
        cause instanceof FactoryError
          ? cause.message
          : "Command could not complete. Run the command in your terminal for details.",
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void execute("status");
  }, []);
  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") onQuit();
    else if (key.name === "q") onQuit();
    else if (!busy && key.name === "r") void execute("status");
    else if (!busy && status?.onboarding === "complete" && key.name === "tab") {
      key.preventDefault();
      onQueue();
    } else if (!busy && !status?.skillInstalled && key.name === "return")
      void execute("install-skill");
  });
  const installed = status?.skillInstalled;
  const complete = status?.onboarding === "complete";
  return (
    <box
      width="100%"
      height="100%"
      padding={1}
      gap={1}
      backgroundColor="#151820"
      flexDirection="column"
    >
      <text fg="#82aaff">
        <b>smol-factory / {complete ? "setup" : "onboarding"}{status?.repository ? ` · ${clean(status.repository)}` : ""}</b>
      </text>
      <text fg="#8792a7">{clean(root)}</text>
      <scrollbox
        width="100%"
        maxWidth={120}
        alignSelf="center"
        flexGrow={1}
        minHeight={0}
        focused
        border
        borderColor="#343e52"
        padding={1}
      >
        <box flexDirection="column" gap={1}>
          <text fg="#edf3ff">
            <b>{complete ? "Setup complete" : installed ? "Continue setup in your agent" : "Install the agent skill"}</b>
          </text>
          <text fg="#d8deeb" wrapMode="word">
            {complete
              ? "Configuration ready. Open the PR queue to scan and classify PRs."
              : installed
                ? `Open your coding agent in this repository:\n${clean(root)}\n\nThen ask:\nUse the smol-factory skill to set up this repository.\n\nReturn here and press [r] to refresh when setup is complete.`
                : `Install the smol-factory skill in this repository:\n${clean(root)}/.agents/skills/smol-factory/SKILL.md\n\nA coding agent that discovers repository skills can use it to set up this repository.`}
          </text>
          {!complete && !installed && (
            <box
              alignSelf="flex-start"
              border
              borderStyle="rounded"
              borderColor="#82aaff"
              padding={1}
              onMouseDown={() => {
                if (!busy) void execute("install-skill");
              }}
            >
              <text fg="#edf3ff"><b>Install skill ↵</b></text>
            </box>
          )}
          {error && <text fg="#ffb4a6" wrapMode="word">{clean(error)}</text>}
        </box>
      </scrollbox>
      <text fg="#82aaff" wrapMode="word">
        {busy
          ? "Working…"
          : complete
            ? "[Tab] PR queue  [r] Refresh  [q] Quit"
            : installed
              ? "[r] Refresh  [q] Quit"
              : "[Enter] Select  [r] Refresh  [q] Quit"}
      </text>
    </box>
  );
}
