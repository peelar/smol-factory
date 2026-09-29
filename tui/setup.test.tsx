import { expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { Setup, type SetupAction } from "./setup";
import { Effect } from "effect";
import { fail } from "../src/io";

const render = async (run: (action: SetupAction) => Promise<unknown>) => {
  let view!: Awaited<ReturnType<typeof testRender>>;
  await act(async () => {
    view = await testRender(
      <Setup root="/example/app" run={run} onQueue={() => {}} onQuit={() => {}} />,
      { width: 110, height: 26 },
    );
    await Bun.sleep(30);
  });
  await view.flush();
  return view;
};
const press = async (view: Awaited<ReturnType<typeof testRender>>, key: string) => {
  await act(async () => {
    view.mockInput.pressKey(key);
    await Bun.sleep(15);
  });
  await view.flush();
};

test("the TUI installs the skill before asking the maintainer to open an agent", async () => {
  const actions: SetupAction[] = [];
  const view = await render(async (action) => {
    actions.push(action);
    return { onboarding: "unconfigured", skillInstalled: action === "install-skill" };
  });
  try {
    expect(view.captureCharFrame()).toContain("Install the agent skill");
    expect(view.captureCharFrame()).toContain("Install skill ↵");
    expect(view.captureCharFrame()).toContain("[Enter] Select");
    expect(actions).toEqual(["status"]);
    await press(view, "RETURN");
    expect(actions).toEqual(["status", "install-skill"]);
    const frame = view.captureCharFrame();
    expect(frame).toContain("Continue setup in your agent");
    expect(frame).toContain("Use the smol-factory skill to set up this repository.");
    expect(frame).not.toContain("Codex");
    expect(frame).toContain("Return here and press [r] to refresh");
    expect(frame).toContain("/example/app");
    expect(frame).not.toContain("Step 5");
    await press(view, "RETURN");
    expect(actions).toEqual(["status", "install-skill"]);
  } finally {
    await act(async () => view.renderer.destroy());
  }
});

test("an installed skill goes directly to the agent handoff without initializing", async () => {
  const actions: SetupAction[] = [];
  const view = await render(async (action) => {
    actions.push(action);
    return { onboarding: "unconfigured", repository: "acme/app", skillInstalled: true };
  });
  try {
    expect(view.captureCharFrame()).toContain("Continue setup in your agent");
    expect(view.captureCharFrame()).toContain("acme/app");
    expect(actions).toEqual(["status"]);
    await press(view, "r");
    expect(actions).toEqual(["status", "status"]);
  } finally {
    await act(async () => view.renderer.destroy());
  }
});

test("refresh reveals configured setup and offers the PR queue", async () => {
  let configured = false;
  let queueOpens = 0;
  let view!: Awaited<ReturnType<typeof testRender>>;
  await act(async () => {
    view = await testRender(
      <Setup
        root="/example/app"
        run={async () => ({
          onboarding: configured ? "complete" : "unconfigured",
          skillInstalled: true,
        })}
        onQueue={() => queueOpens++}
        onQuit={() => {}}
      />,
      { width: 110, height: 26 },
    );
    await Bun.sleep(30);
  });
  try {
    expect(view.captureCharFrame()).not.toContain("[Tab] PR queue");
    configured = true;
    await press(view, "r");
    expect(view.captureCharFrame()).toContain("Setup complete");
    expect(view.captureCharFrame()).toContain("[Tab] PR queue");
    await press(view, "TAB");
    expect(queueOpens).toBe(1);
  } finally {
    await act(async () => view.renderer.destroy());
  }
});

test("skill installation error remains visible and can be retried", async () => {
  let attempts = 0;
  const view = await render(async (action) => {
    if (action === "status") return { onboarding: "unconfigured", skillInstalled: false };
    attempts++;
    return Effect.runPromise(fail("Skill already exists with different content."));
  });
  try {
    await press(view, "RETURN");
    expect(view.captureCharFrame()).toContain("Skill already exists with different content.");
    await press(view, "RETURN");
    expect(attempts).toBe(2);
  } finally {
    await act(async () => view.renderer.destroy());
  }
});
