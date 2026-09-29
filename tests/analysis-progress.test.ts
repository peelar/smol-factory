import { expect, test } from "bun:test";
import { Effect } from "effect";
import { codexProgress, type AnalysisProgress } from "../src/analysis-progress";
import { processRunner } from "../src/io";

test("progress parses split events and only exposes known metadata", () => {
  const events: AnalysisProgress[] = [];
  const consume = codexProgress((event) => events.push(event));
  consume('{"type":"thread.star');
  consume('ted","thread_id":"0199a213-81c0-7800-8aa1-bbab2a035a53"}\n');
  consume(
    '{"type":"item.completed","item":{"type":"command_execution","command":"SECRET","aggregated_output":"SECRET"}}\n',
  );
  consume('not json\nnull\n{"type":"unrecognized","text":"SECRET"}\n');
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    sessionId: "0199a213-81c0-7800-8aa1-bbab2a035a53",
    completedItems: 1,
    activity: "Inspecting repository evidence",
  });
  expect(JSON.stringify(events)).not.toContain("SECRET");
});

test("process runner delivers stdout before process exit", async () => {
  let delivered!: () => void;
  const firstOutput = new Promise<void>((resolve) => {
    delivered = resolve;
  });
  let complete = false;
  const running = Effect.runPromise(
    processRunner.run(
      [
        process.execPath,
        "-e",
        'process.stdout.write("started\\n"); setTimeout(() => process.stdout.write("finished\\n"), 200);',
      ],
      () => delivered(),
    ),
  ).then((output) => {
    complete = true;
    return output;
  });
  await firstOutput;
  expect(complete).toBe(false);
  expect(await running).toBe("started\nfinished\n");
});

test("process runner closes unused stdin so commands can start", async () => {
  const output = await Effect.runPromise(
    processRunner.run([
      process.execPath,
      "-e",
      'const timer = setTimeout(() => process.exit(2), 1000); process.stdin.resume(); process.stdin.on("end", () => { clearTimeout(timer); process.stdout.write("input complete"); });',
    ]),
  );
  expect(output).toBe("input complete");
});
