import { expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { App } from "./app";
import { FactoryError } from "../src/io";
import { demoSnapshot } from "./demo";
import type { Snapshot } from "./model";

type View = Awaited<ReturnType<typeof testRender>>;
async function press(view: View, key: string) {
  await act(async () => {
    view.mockInput.pressKey(key);
    await Bun.sleep(20);
  });
  await view.flush();
}
async function render(
  load = async () => demoSnapshot(),
  width = 140,
  height = 40,
) {
  let view!: View;
  await act(async () => {
    view = await testRender(<App load={load} demo onQuit={() => {}} />, {
      width,
      height,
    });
    await Bun.sleep(30);
  });
  await view.flush();
  return view;
}
async function destroy(view: View) {
  await act(async () => {
    view.renderer.destroy();
  });
}

test("queue, stages, evidence, history, and harmless decision preview", async () => {
  const snapshot = demoSnapshot();
  const before = JSON.stringify(snapshot);
  const view = await render(async () => snapshot);
  try {
    let frame = view.captureCharFrame();
    expect(frame).toContain("smol-factory");
    expect(frame).toContain("01 Classify");
    expect(frame).toContain("02 Review");
    expect(frame).toContain("03 Verify");
    expect(frame).toContain("Needs approval");
    expect(frame).toContain("Your decision");
    expect(frame).toContain("Author: @contributor901");
    expect(frame).toContain("Maintainer approval of review is pending");
    expect(frame).not.toContain("gpt-6-sol");
    const folder = resolve(import.meta.dir, "../.runtime/tui-preview");
    await mkdir(folder, { recursive: true });
    await writeFile(resolve(folder, "wide.txt"), frame);
    await press(view, "a");
    expect(view.captureCharFrame()).toContain("Approve review for #901?");
    expect(view.captureCharFrame()).toContain("No approval saved");
    await press(view, "RETURN");
    expect(JSON.stringify(snapshot)).toBe(before);
    await press(view, "2");
    expect(view.captureCharFrame()).toContain("Demo evidence only");
    await press(view, "3");
    expect(view.captureCharFrame()).toContain("historical revisions");
    await press(view, "4");
    expect(view.captureCharFrame()).toContain("assessments/pr-901.md");
  } finally {
    await destroy(view);
  }
});
test("queue filters keep matching PRs reachable", async () => {
  const view = await render();
  try {
    await press(view, "f");
    expect(view.captureCharFrame()).toContain("Needs me");
    expect(view.captureCharFrame()).toContain("1–3 of 3");
  } finally {
    await destroy(view);
  }
});
test("compact mode, resize, and long lists keep selection reachable", async () => {
  const snapshot = demoSnapshot();
  const original = snapshot.prs[0]!;
  snapshot.prs = Array.from({ length: 60 }, (_, index) => ({
    ...original,
    number: index + 1,
    title: `PR title ${index + 1}`,
  }));
  const view = await render(async () => snapshot, 80, 24);
  try {
    expect(view.captureCharFrame()).toContain("of 60");
    for (let index = 0; index < 20; index++) await press(view, "ARROW_DOWN");
    expect(view.captureCharFrame()).toContain("#40");
    await press(view, "RETURN");
    expect(view.captureCharFrame()).toContain("#40 · demo1234");
    expect(view.captureCharFrame()).toContain("03 Verify");
    await mkdir(resolve(import.meta.dir, "../.runtime/tui-preview"), {
      recursive: true,
    });
    await writeFile(
      resolve(import.meta.dir, "../.runtime/tui-preview/compact.txt"),
      view.captureCharFrame(),
    );
    await act(async () => {
      view.resize(50, 15);
    });
    await view.flush();
    expect(view.captureCharFrame()).toContain("resize to at least");
  } finally {
    await destroy(view);
  }
});
test("polling sees new results and preserves selected PR across reorder", async () => {
  let snapshot = demoSnapshot();
  const view = await render(async () => snapshot);
  try {
    await press(view, "ARROW_DOWN"); // decision PR 903
    expect(view.captureCharFrame()).toContain("#903 · demo1234");
    snapshot = structuredClone(snapshot);
    snapshot.prs[0]!.results.review!.summary = "External file refresh arrived";
    snapshot.prs[0]!.title = "Changed outside the TUI";
    await act(async () => {
      await Bun.sleep(1100);
    });
    await view.flush();
    expect(view.captureCharFrame()).toContain("Changed outside");
    expect(view.captureCharFrame()).toContain("#903 · demo1234");
  } finally {
    await destroy(view);
  }
});
test("empty factory and failed reads are explicit", async () => {
  const snapshot: Snapshot = { prs: [], models: {}, warnings: [] };
  const view = await render(async () => snapshot);
  try {
    expect(view.captureCharFrame()).toContain("No scanned PRs yet");
  } finally {
    await destroy(view);
  }
  const failed = await render(async () => {
    throw new Error("private details");
  });
  try {
    expect(failed.captureCharFrame()).toContain("Cannot read factory files");
    expect(failed.captureCharFrame()).not.toContain("private details");
  } finally {
    await destroy(failed);
  }
});

test("live queue actions require confirmation and Escape cancels", async () => {
  const actions: unknown[] = [];
  let view!: View;
  await act(async () => {
    view = await testRender(
      <App
        load={async () => demoSnapshot()}
        onQuit={() => {}}
        onAction={async (action) => {
          actions.push(action);
          return "Saved";
        }}
      />,
      { width: 140, height: 40 },
    );
    await Bun.sleep(30);
  });
  try {
    await press(view, "s");
    expect(actions).toEqual([]);
    await press(view, "ESCAPE");
    expect(actions).toEqual([]);
    await press(view, "s");
    await press(view, "RETURN");
    expect(actions).toEqual([{ kind: "scan" }]);
    expect(view.captureCharFrame()).toContain("Action completed");
    await press(view, "RETURN");
    await press(view, "a");
    expect(actions.length).toBe(1);
    await press(view, "RETURN");
    expect(actions[1]).toMatchObject({
      kind: "approve",
      number: 901,
      gate: "review",
    });
  } finally {
    await destroy(view);
  }
});

test("failed scan shows a safe, actionable error", async () => {
  let view!: View;
  await act(async () => {
    view = await testRender(
      <App
        load={async () => ({ prs: [], models: {}, warnings: [] })}
        onQuit={() => {}}
        onAction={async () => {
          throw new FactoryError({
            message:
              "GitHub request failed. Check network access and gh auth status, then retry.",
          });
        }}
      />,
      { width: 140, height: 40 },
    );
    await Bun.sleep(30);
  });
  try {
    await press(view, "s");
    await press(view, "RETURN");
    expect(view.captureCharFrame()).toContain("GitHub request failed");
    expect(view.captureCharFrame()).toContain("gh auth status");
  } finally {
    await destroy(view);
  }
});

test("decision key never launches harness work; execution shortcut confirms separately", async () => {
  const snapshot = demoSnapshot();
  const pr = snapshot.prs[0]!;
  pr.approvals.review = {
    fingerprint: pr.fingerprint,
    statement: "Verify",
    time: "now",
  };
  pr.status = "review:approved";
  snapshot.prs = [pr];
  const actions: unknown[] = [];
  let view!: View;
  await act(async () => {
    view = await testRender(
      <App
        load={async () => snapshot}
        onQuit={() => {}}
        onAction={async (action) => {
          actions.push(action);
          return "Started";
        }}
      />,
      { width: 140, height: 40 },
    );
    await Bun.sleep(30);
  });
  try {
    await press(view, "a");
    expect(view.captureCharFrame()).not.toContain("Enter confirms this action");
    expect(actions).toEqual([]);
    await press(view, "x");
    expect(view.captureCharFrame()).toContain("Start verification for #901?");
    expect(actions).toEqual([]);
    await press(view, "RETURN");
    expect(actions).toEqual([
      {
        kind: "launch",
        number: 901,
        gate: "verification",
        fingerprint: "demo",
      },
    ]);
  } finally {
    await destroy(view);
  }
});
