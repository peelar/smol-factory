import { Context, Data, Effect, FileSystem, Schema } from "effect";
import { execFile } from "node:child_process";
import { dirname, relative, resolve, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";

export class FactoryError extends Data.TaggedError("FactoryError")<{
  message: string;
}> {}
export const fail = (message: string) =>
  Effect.fail(new FactoryError({ message }));
export class ProcessRunner extends Context.Service<
  ProcessRunner,
  {
    readonly run: (
      argv: readonly string[],
      onStdout?: (chunk: string) => void,
    ) => Effect.Effect<string, FactoryError>;
  }
>()("factory/ProcessRunner") {}
export const processRunner = {
  run: (argv: readonly string[], onStdout?: (chunk: string) => void) =>
    Effect.tryPromise({
      try: (signal) =>
        new Promise<string>((resolve, reject) => {
          if (!argv[0]) {
            reject(new Error("Empty command"));
            return;
          }
          const child = execFile(
            argv[0],
            argv.slice(1),
            { signal, maxBuffer: 64 * 1024 * 1024 },
            (error, stdout) => {
              // Never echo adapter output or stderr, which may contain credentials.
              if (error)
                reject(
                  new Error(
                    argv[0] === "gh"
                      ? "GitHub request failed. Check network access and gh auth status, then retry."
                      : `${argv[0]} failed; inspect local runtime logs`,
                  ),
                );
              else resolve(stdout);
            },
          );
          // Commands receive their input through argv. Codex also reads piped stdin
          // with an explicit prompt, so leaving this open blocks session startup.
          child.stdin?.end();
          if (onStdout) {
            child.stdout?.setEncoding("utf8");
            child.stdout?.on("data", onStdout);
          }
        }),
      catch: (error) =>
        new FactoryError({
          message: error instanceof Error ? error.message : "Command failed",
        }),
    }),
};
export const parseJson = (text: string) =>
  Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: () => new FactoryError({ message: "Invalid JSON" }),
  });
export const readJson = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* parseJson(yield* fs.readFileString(path));
  });
export const readSchema = <S extends Schema.Constraint>(
  path: string,
  schema: S,
) => readJson(path).pipe(Effect.flatMap(Schema.decodeUnknownEffect(schema)));
export const writeText = (path: string, text: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    yield* fs
      .writeFileString(temporary, text)
      .pipe(
        Effect.andThen(fs.rename(temporary, path)),
        Effect.ensuring(
          fs.remove(temporary, { force: true }).pipe(Effect.orDie),
        ),
      );
  });
export const writeJson = (path: string, value: unknown) =>
  writeText(path, JSON.stringify(value, null, 2) + "\n");
export const contained = (base: string, path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.realPath(base);
    const target = yield* fs.realPath(resolve(root, path));
    const rel = relative(root, target);
    if (rel === ".." || rel.startsWith("../") || isAbsolute(rel))
      return yield* fail(`Configured path escapes ${base}: ${path}`);
    return target;
  });
const lockOwnerSchema = Schema.Struct({
  pid: Schema.Number,
  started: Schema.String,
});
const processExists = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Permission errors do not prove that the owner has exited.
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};
/** Recover only locks whose recorded owner has definitely exited. */
export const withLock = <A, E, R>(
  root: string,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = resolve(root, ".runtime/factory.lock.d");
      yield* fs.makeDirectory(dirname(path), { recursive: true });
      const owner = () =>
        readSchema(resolve(path, "owner.json"), lockOwnerSchema).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        );
      const blocked = () =>
        Effect.gen(function* () {
          const current = yield* owner();
          return yield* fail(
            current && Number.isSafeInteger(current.pid) && current.pid > 0
              ? `Another smol command owns this repository (PID ${current.pid}, started ${current.started}). Wait for it to finish, then press Enter to retry.`
              : `Cannot identify the owner of ${path}. Inspect this lock before removing it.`,
          );
        });
      const acquire = fs.makeDirectory(path).pipe(
        Effect.catch((error) => {
          if (error.reason._tag !== "AlreadyExists") return Effect.fail(error);
          return Effect.scoped(
            Effect.gen(function* () {
              // Serialize recovery so two contenders cannot remove each other's lock.
              yield* Effect.acquireRelease(
                fs
                  .makeDirectory(`${path}.recovery`)
                  .pipe(
                    Effect.catch(() =>
                      fail(
                        "Another command is checking the repository lock. Press Enter to retry.",
                      ),
                    ),
                  ),
                () =>
                  fs
                    .remove(`${path}.recovery`, {
                      recursive: true,
                      force: true,
                    })
                    .pipe(Effect.orDie),
              );
              const current = yield* owner();
              if (
                !current ||
                !Number.isSafeInteger(current.pid) ||
                current.pid <= 0 ||
                processExists(current.pid)
              )
                return yield* blocked();
              yield* fs.remove(path, { recursive: true });
              yield* fs.makeDirectory(path).pipe(Effect.catch(() => blocked()));
            }),
          );
        }),
      );
      yield* Effect.acquireRelease(acquire, () =>
        fs.remove(path, { recursive: true }).pipe(Effect.orDie),
      );
      yield* fs.writeFileString(
        resolve(path, "owner.json"),
        JSON.stringify({ pid: process.pid, started: new Date().toISOString() }),
      );
      return yield* effect;
    }),
  );
