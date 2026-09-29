import { assessment } from "../src/assessment";
import { stageReport } from "../src/report";
import { FactoryError } from "../src/io";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useState, useRef } from "react";
import {
  clean,
  currentGate,
  filters,
  gates,
  overall,
  previewAction,
  selectPrs,
  stageStatus,
  visuals,
  type Filter,
  type PullRequest,
  type Snapshot,
} from "./model";

import type { QueueAction } from "./actions";

const color = {
  bg: "#151820",
  panel: "#1b202b",
  text: "#d8deeb",
  muted: "#8792a7",
  border: "#343e52",
  accent: "#82aaff",
  selected: "#2a3850",
};
const tabs = ["Overview", "Evidence", "History", "Artifacts"] as const;
type Tab = (typeof tabs)[number];
const empty: Snapshot = { prs: [], warnings: [], models: {} };
function clipped(value: string, width: number) {
  const text = clean(value).replace(/\s+/g, " ");
  return text.length <= width
    ? text
    : `${text.slice(0, Math.max(0, width - 1))}…`;
}
function time(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? clean(value) : date.toLocaleString();
}

function Stage({
  pr,
  gate,
}: {
  pr: PullRequest;
  gate: (typeof gates)[number];
}) {
  const visual = visuals[stageStatus(pr, gate)];
  return (
    <box flexDirection="column" flexGrow={1} flexBasis={0} gap={0}>
      <text fg={color.text}>
        {gate === "classification"
          ? "01 Classify"
          : gate === "review"
            ? "02 Review"
            : "03 Verify"}
      </text>
      <text fg={visual.color}>
        {visual.icon} {visual.label}
      </text>
    </box>
  );
}

function Details({
  pr,
  snapshot,
  tab,
}: {
  pr: PullRequest;
  snapshot: Snapshot;
  tab: Tab;
}) {
  const view = assessment(pr);
  const focus = view.focus;
  return (
    <box flexDirection="column" gap={1} paddingRight={1}>
      {tab === "Overview" && (
        <box flexDirection="column" gap={0}>
          <text fg={color.accent} wrapMode="word">
            <b>
              {view.needs_maintainer
                ? "Your decision"
                : view.next.action === "complete"
                  ? "Assessment complete"
                  : "Next action"}
            </b>
          </text>
          <text fg={color.text} wrapMode="word">
            {view.next.reason}
          </text>
          {view.needs_maintainer && (
            <text fg={color.accent}>[a] Inspect decision</text>
          )}
          {focus ? (
            <box flexDirection="column" gap={0} marginTop={1}>
              <text fg={color.accent}>
                {focus.gate} · {stageReport(pr, focus.gate).outcome}
              </text>
              <text fg={color.text} wrapMode="word">
                {clean(focus.result.summary)}
              </text>
              {focus.result.findings.slice(0, 2).map((item, index) => (
                <text key={`f${index}`} fg="#ed8796" wrapMode="word">
                  {clean(item)}
                </text>
              ))}
              {focus.result.evidence.slice(0, 2).map((item, index) => (
                <text key={`e${index}`} fg={color.muted} wrapMode="word">
                  Evidence: {clean(item)}
                </text>
              ))}
              <text fg={color.muted}>
                [2] All stages, findings and evidence
              </text>
            </box>
          ) : (
            <text fg={color.muted}>No findings recorded yet.</text>
          )}
        </box>
      )}
      {tab === "Evidence" &&
        gates.map((stage) => (
          <box key={stage} flexDirection="column" gap={1}>
            <text fg={color.accent}>
              <b>
                {stage} · {stageReport(pr, stage).outcome}
              </b>
            </text>
            <text fg={color.text}>
              {clean(pr.results[stage]?.summary ?? "No evidence yet.")}
            </text>
            {pr.results[stage]?.findings.map((item, index) => (
              <text key={`f${index}`} fg="#ed8796">
                ! {clean(item)}
              </text>
            ))}
            {pr.results[stage]?.evidence.map((item, index) => (
              <text key={`e${index}`} fg={color.muted}>
                • {clean(item)}
              </text>
            ))}
          </box>
        ))}
      {tab === "History" && (
        <>
          <text fg={color.muted}>
            Newest first · includes historical revisions and approvals
          </text>
          {pr.history.toReversed().map((event, index) => (
            <box key={index} flexDirection="column" gap={1}>
              <text fg={color.accent}>
                {time(event.time)} · {clean(event.event)}
              </text>
              <text fg={color.text}>{clean(event.text)}</text>
            </box>
          ))}
        </>
      )}
      {tab === "Artifacts" && (
        <>
          <text fg={color.muted}>
            Local paths · selectable text · no files are opened or executed
          </text>
          <text fg={color.accent}>Runtime models</text>
          {gates.map((gate) => (
            <text key={gate} fg={color.muted}>
              {gate}: {clean(snapshot.models[gate] ?? "Configured model")}
            </text>
          ))}
          <text fg={color.accent}>Assessment</text>
          <text fg={color.text}>{`assessments/pr-${pr.number}.md`}</text>
          <text fg={color.accent}>Runtime state</text>
          <text fg={color.text}>{`.runtime/prs/${pr.number}/state.json`}</text>
          {pr.packet && (
            <>
              <text fg={color.accent}>Evidence packet</text>
              <text fg={color.text}>{clean(pr.packet)}</text>
            </>
          )}
          {pr.thread && (
            <>
              <text fg={color.accent}>PR thread</text>
              <text fg={color.text}>
                {clean(pr.thread.agent ?? "Not recorded")} · pane{" "}
                {clean(pr.thread.pane ?? "—")}
              </text>
              <text fg={color.accent}>Worktree</text>
              <text fg={color.text}>
                {clean(pr.thread.worktree ?? "Not recorded")}
              </text>
            </>
          )}
        </>
      )}
    </box>
  );
}

export function App({
  load,
  demo = false,
  onQuit,
  onSetup,
  onAction,
}: {
  load: (force?: boolean) => Promise<Snapshot>;
  demo?: boolean;
  onQuit: () => void;
  onSetup?: () => void;
  onAction?: (action: QueueAction) => Promise<string>;
}) {
  const { width, height } = useTerminalDimensions();
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number>();
  const [filter, setFilter] = useState<Filter>("All PRs");
  const [pane, setPane] = useState<"list" | "details">("list");
  const [tab, setTab] = useState<Tab>("Overview");
  const [modal, setModal] = useState<{
    title: string;
    detail: string;
    revision?: string;
    action?: QueueAction;
  }>();
  const executing = useRef(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let force = refresh > 0;
    const update = async () => {
      try {
        const next = await load(force);
        force = false;
        if (!stopped) {
          setSnapshot(next);
          setError("");
          setLoaded(true);
        }
      } catch {
        if (!stopped) {
          setError(
            "Cannot read factory files. Showing the last successful snapshot.",
          );
          setLoaded(true);
        }
      }
      if (!stopped) timer = setTimeout(update, 1000);
    };
    void update();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [load, refresh]);
  const prs = selectPrs(snapshot, filter);
  const pr = prs.find((item) => item.number === selected) ?? prs[0];
  useEffect(() => {
    if (pr) setSelected(pr.number);
  }, [pr?.number]);
  const selectedIndex = prs.findIndex((item) => item.number === pr?.number);
  const compact = width < 105;
  const listWidth = compact
    ? width - 2
    : Math.max(34, Math.floor(width * 0.34));
  const pageSize = Math.max(1, Math.floor((height - 12) / 3));
  const offset = Math.max(
    0,
    Math.min(
      Math.max(0, prs.length - pageSize),
      selectedIndex - Math.floor(pageSize / 2),
    ),
  );
  const visible = prs.slice(offset, offset + pageSize);
  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      onQuit();
      return;
    }
    if (modal) {
      if (executing.current) return;
      if (key.name === "return" && modal.action && onAction) {
        executing.current = true;
        const action = modal.action;
        setModal({
          title: "Working…",
          detail:
            "The factory is checking the request. Do not retry while it is running.",
        });
        void onAction(action)
          .then((detail) => setModal({ title: "Action completed", detail }))
          .catch((error: unknown) =>
            setModal({
              title: "Action stopped",
              detail:
                error instanceof FactoryError
                  ? error.message
                  : "Local I/O or input failed. Run smol status and use the CLI for details before retrying.",
            }),
          )
          .finally(() => {
            executing.current = false;
            setRefresh((value) => value + 1);
          });
      } else if (key.name === "escape" || key.name === "return")
        setModal(undefined);
      return;
    }
    if (key.name === "q") onQuit();
    else if (key.name === "o") onSetup?.();
    else if (key.name === "escape") setPane("list");
    else if (key.name === "r") setRefresh((value) => value + 1);
    else if (key.name === "f") {
      setFilter(
        filters[(filters.indexOf(filter) + 1) % filters.length] ?? "All PRs",
      );
      setPane("list");
    } else if (key.name === "tab") {
      key.preventDefault();
      setPane((value) => (value === "list" ? "details" : "list"));
    } else if (key.name === "return" || key.name === "right")
      setPane("details");
    else if (key.name === "left") setPane("list");
    else if (["1", "2", "3", "4"].includes(key.name)) {
      setTab(tabs[Number(key.name) - 1] ?? "Overview");
      setPane("details");
    } else if (pane === "list" && ["up", "down", "j", "k"].includes(key.name)) {
      const delta = key.name === "up" || key.name === "k" ? -1 : 1;
      setSelected(
        prs[Math.max(0, Math.min(prs.length - 1, selectedIndex + delta))]
          ?.number,
      );
    } else if (["a", "x"].includes(key.name) && pr) {
      const action = previewAction(pr);
      if (
        action &&
        (key.name === "x"
          ? assessment(pr).next.action === "launch"
          : assessment(pr).needs_maintainer)
      ) {
        const gate = currentGate(pr);
        const next = assessment(pr).next;
        const kind =
          next.action === "approve" || next.action === "launch"
            ? next.action
            : undefined;
        setModal({
          ...action,
          revision: pr.head,
          detail:
            onAction && kind
              ? kind === "approve"
                ? "Record your approval for this displayed assessment. The next stage will not start automatically."
                : "Start the approved stage using the configured adapter, subject to revision and capacity checks."
              : action.detail,
          action:
            onAction && kind
              ? { kind, number: pr.number, gate, fingerprint: pr.fingerprint }
              : undefined,
        });
      }
    } else if (key.name === "s")
      setModal({
        title: "Scan newest configured external PRs?",
        detail: onAction
          ? "Read GitHub and save evidence for eligible PRs. No classification agent starts automatically."
          : "Would capture eligible PRs for the harness to classify.",
        action: onAction ? { kind: "scan" } : undefined,
      });
    else if (key.name === "c" && onAction && snapshot.latestScan)
      setModal({
        title: "Classify the latest scan?",
        detail:
          "Invoke the configured adapter for this scan. Results stop for maintainer approval.",
        action: { kind: "classify", run: snapshot.latestScan.id },
      });
    else if (key.name === "?")
      setModal({
        title: "Keyboard guide",
        detail:
          "↑/↓ or j/k select a PR · Tab switches panes · 1–4 select detail tabs · f cycles filters · r refreshes files and PR details · a previews a decision · s scans · c classifies the latest scan · x launches an approved stage · o opens setup · Esc returns · q quits. Scroll the detail pane with arrow keys, Page Up/Down or the mouse.",
      });
  });
  const needsMe = selectPrs(snapshot, "Needs me").length;
  const running = snapshot.prs.filter(
    (item) => overall(item) === "running",
  ).length;
  if (width < 60 || height < 18)
    return (
      <box padding={1}>
        <text fg={color.text}>
          smol-factory · resize to at least 60 × 18. [q] quit
        </text>
      </box>
    );
  return (
    <box
      width="100%"
      height="100%"
      backgroundColor={color.bg}
      flexDirection="column"
      padding={1}
      gap={compact ? 0 : 1}
    >
      <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
        <text fg={color.accent}>
          <b>smol-factory</b>
          <span fg={color.muted}> {demo ? "DEMO" : "LOCAL"}</span>
        </text>
        <text fg="#f9d78c">
          {needsMe} need you · {running} running
        </text>
      </box>
      <text fg={color.muted}>
        Assessments · {snapshot.prs.length} PRs · local status ·{" "}
        {demo ? "demo details" : "GitHub details"} · [r] refresh
      </text>
      <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
        {(!compact || pane === "list") && (
          <box
            width={listWidth}
            flexShrink={0}
            border
            borderColor={pane === "list" ? color.accent : color.border}
            backgroundColor={color.panel}
            flexDirection="column"
            padding={1}
            title=" Assessments "
          >
            <text fg={color.accent}>
              {filter} <span fg={color.muted}>· [f] filter</span>
            </text>
            <box
              flexDirection="column"
              flexGrow={1}
              overflow="hidden"
            >
              {!prs.length && (
                <text fg={color.muted}>
                  {!loaded
                    ? "Reading factory files…"
                    : filter !== "All PRs"
                      ? "No PRs in this filter. [f] changes filter."
                      : "No scanned PRs yet. Ask your agent to scan and assess PRs."}
                </text>
              )}
              {visible.map((item) => {
                const active = item.number === pr?.number;
                const visual = visuals[overall(item)];
                return (
                  <box
                    key={item.number}
                    height={3}
                    flexShrink={0}
                    flexDirection="column"
                    backgroundColor={active ? color.selected : color.panel}
                    onMouseDown={() => {
                      setSelected(item.number);
                      setPane("list");
                    }}
                  >
                    <text fg={active ? color.text : color.muted}>
                      {active ? "▎" : " "} #{item.number}{" "}
                      {clipped(item.title, listWidth - 15)}
                    </text>
                    <text fg={visual.color}>
                      {" "}
                      {visual.icon} {visual.label}
                      <span fg={color.muted}> · {currentGate(item)}</span>
                    </text>
                  </box>
                );
              })}
            </box>
            <text fg={color.muted}>
              {prs.length
                ? `${offset + 1}–${Math.min(offset + pageSize, prs.length)} of ${prs.length}`
                : "0 PRs"}{" "}
              · ↑↓ select · Enter inspect
            </text>
          </box>
        )}
        {(!compact || pane === "details") && (
          <box
            border
            borderColor={pane === "details" ? color.accent : color.border}
            backgroundColor={color.panel}
            flexDirection="column"
            flexGrow={1}
            minWidth={0}
            paddingX={1}
            paddingY={compact ? 0 : 1}
            title={
              pr
                ? ` #${pr.number} · ${clean(pr.head.slice(0, 8))} `
                : " PR details "
            }
          >
            {pr ? (
              <>
                <text fg={color.text} flexShrink={0}>
                  <b>
                    {clipped(
                      pr.title,
                      compact ? width - 8 : width - listWidth - 10,
                    )}
                  </b>
                </text>
                <text fg={color.muted} flexShrink={0}>
                  Author: {pr.author ? `@${clean(pr.author)}` : "Unknown"}
                </text>
                <box
                  flexDirection="row"
                  border={["bottom"]}
                  borderColor={color.border}
                  paddingTop={compact ? 0 : 1}
                  paddingBottom={compact ? 0 : 1}
                  flexShrink={0}
                >
                  {gates.map((gate) => (
                    <Stage key={gate} pr={pr} gate={gate} />
                  ))}
                </box>
                <box
                  flexDirection="row"
                  gap={2}
                  marginTop={1}
                  marginBottom={1}
                  flexShrink={0}
                >
                  {tabs.map((name, index) => (
                    <text
                      key={name}
                      fg={tab === name ? color.accent : color.muted}
                      onMouseDown={() => {
                        setTab(name);
                        setPane("details");
                      }}
                    >
                      {index + 1} {name}
                    </text>
                  ))}
                </box>
                <scrollbox
                  key={`${pr.number}:${tab}`}
                  flexGrow={1}
                  minHeight={0}
                  overflow="hidden"
                  viewportOptions={{ overflow: "hidden" }}
                  marginBottom={1}
                  focused={pane === "details" && !modal}
                >
                  <Details pr={pr} snapshot={snapshot} tab={tab} />
                </scrollbox>
              </>
            ) : (
              <text fg={color.muted}>Select a PR to inspect its progress.</text>
            )}
          </box>
        )}
      </box>
      {(error || snapshot.warnings.length > 0) && (
        <text fg="#ed8796">
          {clipped(error || snapshot.warnings[0] || "", width - 3)}
          {snapshot.warnings.length > 1
            ? ` (+${snapshot.warnings.length - 1})`
            : ""}
        </text>
      )}
      <text fg={color.muted} flexShrink={0}>
        [?] keys · [q] quit
      </text>
      {modal && (
        <box
          position="absolute"
          left={0}
          top={0}
          width="100%"
          height="100%"
          alignItems="center"
          justifyContent="center"
          zIndex={10}
        >
          <box
            width={Math.min(76, width - 6)}
            border
            borderColor={color.accent}
            backgroundColor={color.panel}
            padding={2}
            flexDirection="column"
            gap={1}
            title={onAction ? " Factory action " : " Interaction preview "}
          >
            <text fg={color.text}>
              <b>{modal.title}</b>
            </text>
            {modal.revision && (
              <text fg={color.muted}>
                Captured revision: {clean(modal.revision.slice(0, 12))}
              </text>
            )}
            <text fg={color.text}>{clean(modal.detail)}</text>
            <text fg="#f9d78c">
              {modal.action
                ? "Enter confirms this action · Esc cancels"
                : onAction
                  ? "Enter or Esc closes"
                  : "Preview only. No approval saved, no work launched."}
            </text>
            {!onAction && (
              <text fg={color.accent}>[Enter / Esc] Close preview</text>
            )}
          </box>
        </box>
      )}
    </box>
  );
}
