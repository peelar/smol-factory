import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { useState } from "react";
import { Effect, FileSystem } from "effect";
import { BunServices } from "@effect/platform-bun";
import { Factory } from "../src/factory";
import { Onboarding } from "../src/onboarding";
import { parseRoot } from "../src/paths";
import { ProcessRunner, processRunner, withLock } from "../src/io";
import { App } from "./app";
import { performAction, type QueueAction } from "./actions";
import { Setup, type SetupAction } from "./setup";
import { createLiveSource, createPrPreviewSource } from "./live";
import { demoSnapshot } from "./demo";

export async function startTui(root: string, demo = false) {
  const factory = new Factory(root);
  const setup = new Onboarding(factory);
  const load = demo ? async () => demoSnapshot() : createLiveSource(root);
  const loadPr = demo ? undefined : createPrPreviewSource(root);
  const run = async (action: SetupAction): Promise<unknown> => {
    const effect: Effect.Effect<
      unknown,
      unknown,
      FileSystem.FileSystem | ProcessRunner
    > =
      action === "install-skill"
        ? setup.installSkill().pipe(Effect.flatMap(() => setup.status()))
        : setup.status();
    return Effect.runPromise(
      (action === "install-skill"
        ? withLock(factory.storage, effect)
        : effect
      ).pipe(
        Effect.provideService(ProcessRunner, processRunner),
        Effect.provide(BunServices.layer),
      ),
    );
  };
  const onAction = (action: QueueAction) =>
    Effect.runPromise(
      performAction(factory, action).pipe(
        Effect.provideService(ProcessRunner, processRunner),
        Effect.provide(BunServices.layer),
      ),
    );
  const needsSetup =
    !demo &&
    (await Effect.runPromise(
      factory.package().pipe(
        Effect.map(() => false),
        Effect.catch(() => Effect.succeed(true)),
        Effect.provide(BunServices.layer),
      ),
    ));
  const renderer = await createCliRenderer({ exitOnCtrlC: false });
  const quit = () => renderer.destroy();
  function Terminal() {
    const [showSetup, setShowSetup] = useState(needsSetup);
    return showSetup ? (
      <Setup
        root={root}
        run={run}
        onQueue={() => setShowSetup(false)}
        onQuit={quit}
      />
    ) : (
      <App
        load={load}
        loadPr={loadPr}
        demo={demo}
        onAction={demo ? undefined : onAction}
        onQuit={quit}
        onSetup={demo ? undefined : () => setShowSetup(true)}
      />
    );
  }
  createRoot(renderer).render(<Terminal />);
}
if (import.meta.main) {
  const { root, args } = parseRoot(process.argv.slice(2));
  if (args.includes("--help"))
    console.log("smol [--root PATH] tui\nbun run tui [--demo] [--root PATH]");
  else if (args.some((a) => a !== "--demo"))
    throw new Error("Unknown TUI option");
  else await startTui(root, args.includes("--demo"));
}
