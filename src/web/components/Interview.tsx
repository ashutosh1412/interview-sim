import {
  addEdge,
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type XYPosition,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAnnotation, type ComponentType } from "../../shared/components.ts";
import type { Design, PublicProblem, Session } from "../../shared/schemas.ts";
import { api, ApiRequestError, newRequestId } from "../api.ts";
import { COMPONENTS } from "../catalog.ts";
import { CanvasContext } from "../canvasContext.ts";
import {
  DEFAULT_EDGE_DATA,
  defaultSize,
  flowKindFor,
  reparent,
  restack,
  withoutNodes,
  edgeMarkers,
  nextId,
  targetKey,
  toDesign,
  withDirection,
  type DesignFlowEdge,
  type DirectionChoice,
  type DesignFlowNode,
  type EdgeData,
  type LineStyle,
  type NodeData,
  type ShapeStyle,
} from "../graph.ts";
import { EdgeEditContext, type EdgeEditApi } from "../edgeEditContext.ts";
import { alignNodes, copySelection, pasteClip, reorder, type AlignMode, type Clip } from "../editing.ts";
import { useHistory } from "../useHistory.ts";
import { useShortcuts } from "../useShortcuts.ts";
import { loadDraft, saveDraft } from "../storage.ts";
import { ThreadsContext, type NumberedThread, type ThreadsContextValue } from "../threadsContext.ts";
import { AnnotationNode } from "./AnnotationNode.tsx";
import { AssessmentView } from "./AssessmentView.tsx";
import { CanvasToolbar } from "./CanvasToolbar.tsx";
import { ContainerNode } from "./ContainerNode.tsx";
import { ContextMenu, shortcut, type MenuSections } from "./ContextMenu.tsx";
import { DesignEdge } from "./DesignEdge.tsx";
import { DesignNode } from "./DesignNode.tsx";
import { FormatPanel } from "./FormatPanel.tsx";
import { Inspector } from "./Inspector.tsx";
import { DRAG_MIME, Palette } from "./Palette.tsx";
import { ContractPanel, ContractSummary, EMPTY_CONTRACT, type ContractDraft } from "./ContractPanel.tsx";
import { EMPTY_REQUIREMENTS, RequirementsPanel, RequirementsSummary, type RequirementsDraft } from "./RequirementsPanel.tsx";
import { ThreadPanel } from "./ThreadPanel.tsx";
import { Timer } from "./Timer.tsx";

const nodeTypes = { design: DesignNode, container: ContainerNode, annotation: AnnotationNode };
const edgeTypes = { design: DesignEdge };
const defaultEdgeOptions = { type: "design" as const, ...edgeMarkers("one_way") };
const GRID_COLUMNS = 4;
const STRIKE_NOTE = "Not reviewable yet";
const GRID = 10;

/** Merges a style patch; a field set to undefined goes back to the default. */
function mergeStyle<T extends object>(current: T | undefined, patch: Partial<T>): T {
  return Object.fromEntries(Object.entries({ ...current, ...patch }).filter(([, v]) => v !== undefined)) as T;
}

/** Rebuilds a canvas from a saved design when no local draft exists (e.g. another browser). */
function fromDesign(design: Design | undefined): { nodes: DesignFlowNode[]; edges: DesignFlowEdge[] } {
  if (!design) return { nodes: [], edges: [] };
  const childIndex = new Map<string, number>();
  return {
    nodes: restack(
      design.nodes.map((n, i) => {
        // Children are laid out inside their container; everything else on a grid.
        const k = n.parent ? (childIndex.get(n.parent) ?? 0) : 0;
        if (n.parent) childIndex.set(n.parent, k + 1);
        return {
          id: n.id,
          type: flowKindFor(n.type),
          parentId: n.parent || undefined,
          position: n.parent
            ? { x: 20 + (k % 2) * 200, y: 50 + Math.floor(k / 2) * 90 }
            : { x: (i % GRID_COLUMNS) * 260, y: Math.floor(i / GRID_COLUMNS) * 180 },
          ...defaultSize(n.type),
          data: { type: n.type, label: n.label, notes: n.notes },
        };
      }),
    ),
    edges: design.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      sourceHandle: "right",
      targetHandle: "left",
      type: "design",
      ...edgeMarkers(e.direction),
      data: { mode: e.mode, direction: e.direction, label: e.label },
    })),
  };
}

const notSelf = (c: Connection | Edge) => c.source !== c.target;


type Pending = { kind: "submit" | "finish" | "clarify" | "lock"; run: () => Promise<Session> };

function Workspace({ initial, problem, onExit }: { initial: Session; problem: PublicProblem; onExit: () => void }) {
  const [session, setSession] = useState(initial);
  const [draft] = useState(() => loadDraft(initial.id) ?? { ...fromDesign(initial.rounds.at(-1)?.design), answers: {} });
  // restack also upgrades drafts saved before layers were managed this way.
  const [nodes, setNodes, onNodesChange] = useNodesState<DesignFlowNode>(restack(draft.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState<DesignFlowEdge>(draft.edges);
  const [answers, setAnswers] = useState<Record<string, string>>(draft.answers);
  const [requirements, setRequirements] = useState<RequirementsDraft>(draft.requirements ?? EMPTY_REQUIREMENTS);
  const [contract, setContract] = useState<ContractDraft>(draft.contract ?? EMPTY_CONTRACT);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "node" | "edge" | "pane"; edgeId?: string } | null>(null);
  const [busy, setBusy] = useState<Pending["kind"] | null>(null);
  const [failed, setFailed] = useState<{ pending: Pending; message: string; retryable: boolean } | null>(null);
  const [showAssessment, setShowAssessment] = useState(initial.assessment !== null);
  const [snap, setSnap] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const clipboard = useRef<Clip | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const history = useHistory(nodes, edges, setNodes, setEdges);

  const readOnly = session.finishedAt !== null;
  const inRequirements = session.phase === "requirements";
  const inDesign = session.phase === "design";

  useEffect(() => {
    const id = window.setTimeout(() => saveDraft(session.id, { nodes, edges, answers, requirements, contract }), 400);
    return () => window.clearTimeout(id);
  }, [session.id, nodes, edges, answers, requirements, contract]);

  const addNode = useCallback(
    (type: ComponentType, position?: XYPosition) => {
      setNodes((current) => {
        const id = nextId("n", current);
        const at = position ?? { x: 80 + (current.length % GRID_COLUMNS) * 220, y: 80 + Math.floor(current.length / GRID_COLUMNS) * 150 };
        // Text starts empty so it opens ready for typing; shapes start with their type name.
        const label = isAnnotation(type) ? "" : COMPONENTS[type].label;
        const node: DesignFlowNode = {
          id,
          type: flowKindFor(type),
          position: at,
          ...defaultSize(type),
          data: { type, label, notes: "" },
          selected: true,
        };
        const others = current.map((n) => ({ ...n, selected: false }));
        // New containers go underneath existing shapes so they don't cover them; anything else on top.
        const next = restack(flowKindFor(type) === "container" ? [node, ...others] : [...others, node]);
        return position ? reparent(next, id) : next;
      });
    },
    [setNodes],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, __: DesignFlowNode, dragged: DesignFlowNode[]) =>
      setNodes((current) => dragged.reduce((acc, n) => reparent(acc, n.id), current)),
    [setNodes],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!notSelf(c)) return;
      setEdges((current) =>
        addEdge({ ...c, id: nextId("e", current), ...defaultEdgeOptions, data: { ...DEFAULT_EDGE_DATA } }, current),
      );
    },
    [setEdges],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DRAG_MIME) as ComponentType;
      if (type && type in COMPONENTS) addNode(type, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [addNode, screenToFlowPosition],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<NodeData>) =>
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
    [setNodes],
  );
  const updateEdge = useCallback(
    (id: string, patch: Partial<EdgeData>) =>
      setEdges((es) =>
        es.map((e) => {
          if (e.id !== id) return e;
          const data = { ...DEFAULT_EDGE_DATA, ...e.data, ...patch };
          return { ...e, data, ...edgeMarkers(data.direction, data.style?.color) };
        }),
      ),
    [setEdges],
  );
  const setDirection = useCallback(
    (id: string, choice: DirectionChoice) => setEdges((es) => es.map((e) => (e.id === id ? withDirection(e, choice) : e))),
    [setEdges],
  );
  const removeEdge = useCallback(
    (id: string) => {
      setEdges((es) => es.filter((e) => e.id !== id));
      setEditingEdgeId(null);
    },
    [setEdges],
  );

  const selectedNode = nodes.find((n) => n.selected);
  const selectedEdge = selectedNode ? undefined : edges.find((e) => e.selected);
  const nameOf = useCallback((id: string) => nodes.find((n) => n.id === id)?.data.label || id, [nodes]);

  const edgeEditApi: EdgeEditApi = useMemo(
    () => ({
      editingEdgeId: readOnly ? null : editingEdgeId,
      close: () => setEditingEdgeId(null),
      nameOf,
      update: updateEdge,
      setDirection,
      remove: removeEdge,
    }),
    [readOnly, editingEdgeId, nameOf, updateEdge, setDirection, removeEdge],
  );

  /** Removes nodes plus anything inside them, and every connection touching what was removed. */
  const removeNodes = useCallback(
    (ids: string[]) => {
      const remaining = withoutNodes(nodes, ids);
      const kept = new Set(remaining.map((n) => n.id));
      setNodes(remaining);
      setEdges((es) => es.filter((e) => kept.has(e.source) && kept.has(e.target)));
    },
    [nodes, setNodes, setEdges],
  );

  const deleteSelected = useCallback(() => {
    removeNodes(nodes.filter((n) => n.selected).map((n) => n.id));
    setEdges((es) => es.filter((e) => !e.selected));
  }, [nodes, removeNodes, setEdges]);

  // ---------- Format panel & arrange (apply to the whole selection) ----------
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);
  const selectedIds = selectedNodes.map((n) => n.id);

  const styleNodes = (patch: Partial<ShapeStyle>) =>
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, data: { ...n.data, style: mergeStyle(n.data.style, patch) } } : n)));
  const styleEdges = (patch: Partial<LineStyle>) =>
    setEdges((es) =>
      es.map((e) => {
        if (!e.selected) return e;
        const data = { ...DEFAULT_EDGE_DATA, ...e.data, style: mergeStyle(e.data?.style, patch) };
        return { ...e, data, ...edgeMarkers(data.direction, data.style.color) };
      }),
    );
  const align = (mode: AlignMode) => setNodes((ns) => alignNodes(ns, selectedIds, mode));
  const order = (where: "front" | "back") => setNodes((ns) => reorder(ns, selectedIds, where));
  const toggleLock = () => {
    const lock = !selectedNodes.every((n) => n.draggable === false);
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, draggable: !lock } : n)));
  };

  // ---------- clipboard ----------
  const copy = () => {
    if (selectedIds.length) clipboard.current = copySelection(nodes, edges, selectedIds);
  };
  const paste = () => {
    if (!clipboard.current) return;
    const result = pasteClip(clipboard.current, nodes, edges);
    setNodes(result.nodes);
    setEdges(result.edges);
    // Copy what was just pasted, so pasting again cascades instead of stacking.
    const selected = new Set(result.nodes.filter((n) => n.selected).map((n) => n.id));
    const roots = [...selected].filter((id) => {
      const parent = result.nodes.find((n) => n.id === id)?.parentId;
      return !parent || !selected.has(parent);
    });
    clipboard.current = copySelection(result.nodes, result.edges, roots);
  };
  const duplicate = () => {
    if (!selectedIds.length) return;
    const result = pasteClip(copySelection(nodes, edges, selectedIds), nodes, edges);
    setNodes(result.nodes);
    setEdges(result.edges);
  };
  const selectAll = () => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
    setEdges((es) => es.map((e) => ({ ...e, selected: true })));
  };

  // ---------- right-click menu ----------
  /** Like draw.io: right-clicking something unselected selects just it; a selected item keeps the selection. */
  const selectOnly = (nodeId: string | null, edgeId: string | null) => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === nodeId })));
    setEdges((es) => es.map((e) => ({ ...e, selected: e.id === edgeId })));
  };
  const openMenu = (e: React.MouseEvent | MouseEvent, kind: "node" | "edge" | "pane", edgeId?: string) => {
    e.preventDefault();
    if (!readOnly) setMenu({ x: e.clientX, y: e.clientY, kind, edgeId });
  };
  const closeMenu = useCallback(() => setMenu(null), []);

  const menuSections: MenuSections =
    menu?.kind === "node"
      ? [
          [
            { label: "Bring to front", shortcut: shortcut("mod+shift+f"), onSelect: () => order("front") },
            { label: "Send to back", shortcut: shortcut("mod+shift+b"), onSelect: () => order("back") },
          ],
          [
            { label: "Duplicate", shortcut: shortcut("mod+d"), onSelect: duplicate },
            { label: "Copy", shortcut: shortcut("mod+c"), onSelect: copy },
          ],
          [{ label: "Delete", shortcut: shortcut("backspace"), danger: true, onSelect: deleteSelected }],
        ]
      : menu?.kind === "edge"
        ? [
            [{ label: "Edit connection", onSelect: () => menu.edgeId && setEditingEdgeId(menu.edgeId) }],
            [{ label: "Delete", shortcut: shortcut("backspace"), danger: true, onSelect: () => menu.edgeId && removeEdge(menu.edgeId) }],
          ]
        : [
            [
              { label: "Paste", shortcut: shortcut("mod+v"), disabled: !clipboard.current, onSelect: paste },
              { label: "Select all", shortcut: shortcut("mod+a"), onSelect: selectAll },
            ],
          ];

  useShortcuts(!readOnly, {
    undo: history.undo,
    redo: history.redo,
    copy,
    paste,
    duplicate,
    selectAll,
    toFront: () => order("front"),
    toBack: () => order("back"),
  });

  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      if (!notSelf(c)) return false;
      const textEnd = nodes.some((n) => (n.id === c.source || n.id === c.target) && isAnnotation(n.data.type));
      return !textEnd;
    },
    [nodes],
  );

  /** Runs a server call; returns whether it succeeded. Failures keep the request for an exact retry. */
  const run = useCallback(async (pending: Pending): Promise<boolean> => {
    setBusy(pending.kind);
    setFailed(null);
    try {
      const next = await pending.run();
      setSession(next);
      if (pending.kind === "finish") setShowAssessment(true);
      if (pending.kind === "submit") {
        // Drop drafts that were just sent; keep anything typed for still-open threads.
        setAnswers((current) => {
          const sentTo = new Set(next.threads.filter((t) => t.status !== "open" && t.status !== "followup").map((t) => t.id));
          return Object.fromEntries(Object.entries(current).filter(([id]) => !sentTo.has(id)));
        });
      }
      return true;
    } catch (e) {
      const err = e instanceof ApiRequestError ? e : new ApiRequestError("unknown", "Unexpected error", true);
      setFailed({ pending, message: err.message, retryable: err.retryable });
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  const submit = () => {
    const payload = {
      design: toDesign(nodes, edges),
      answers: session.threads
        .filter((t) => (t.status === "open" || t.status === "followup") && answers[t.id]?.trim())
        .map((t) => ({ threadId: t.id, text: (answers[t.id] ?? "").trim() })),
      requestId: newRequestId(),
    };
    // The same payload (and requestId) is reused on retry, so a retry is never billed twice.
    void run({ kind: "submit", run: () => api.submitRound(session.id, payload) });
  };

  const finish = (confirmFirst: boolean) => {
    if (confirmFirst && !window.confirm("End the interview and get your final assessment?")) return;
    const design = toDesign(nodes, edges);
    const requestId = newRequestId();
    void run({ kind: "finish", run: () => api.finish(session.id, design, requestId) });
  };

  const ask = (question: string) => {
    const requestId = newRequestId();
    return run({ kind: "clarify", run: () => api.clarify(session.id, question, requestId) });
  };

  const lockRequirements = () => {
    const body = { ...requirements };
    void run({ kind: "lock", run: () => api.lockRequirements(session.id, body) });
  };

  const lockContract = () => {
    const body = { ...contract };
    void run({ kind: "lock", run: () => api.lockContract(session.id, body) });
  };

  const threadsContext: ThreadsContextValue = useMemo(() => {
    const byTarget = new Map<string, NumberedThread[]>();
    session.threads.forEach((thread, i) => {
      if (thread.status === "resolved" || thread.target.kind === "global") return;
      const key = targetKey(thread.target.kind, thread.target.id);
      byTarget.set(key, [...(byTarget.get(key) ?? []), { num: i + 1, thread }]);
    });
    return { byTarget, selectedThreadId, selectThread: setSelectedThreadId };
  }, [session.threads, selectedThreadId]);

  const canvasState = useMemo(() => ({ readOnly }), [readOnly]);
  const lastRound = session.rounds.at(-1);
  const strikeWarning = lastRound?.note.startsWith(STRIKE_NOTE) ?? false;

  return (
    <CanvasContext.Provider value={canvasState}>
      <ThreadsContext.Provider value={threadsContext}>
        <EdgeEditContext.Provider value={edgeEditApi}>
          <div className="app">
            <header className="topbar">
              <div className="topbar__title">
                <strong>{problem.title}</strong>
                <span className="muted"> · {problem.track}</span>
              </div>
              <ol className="steps" aria-label="Interview phase">
                <li className={inRequirements ? "is-on" : "is-done"}>1 Requirements</li>
                <li className={session.phase === "api" ? "is-on" : inDesign ? "is-done" : ""}>{problem.kind === "lld" ? "2 Classes & methods" : "2 Entities & API"}</li>
                <li className={inDesign ? "is-on" : ""}>3 Design</li>
              </ol>
              <Timer startedAt={session.startedAt} durationMin={session.durationMin} stopped={readOnly} onExpire={() => finish(false)} />
              <div className="topbar__actions">
                {readOnly ? (
                  <>
                    <button type="button" className="btn" onClick={() => setShowAssessment(true)} disabled={!session.assessment}>
                      View assessment
                    </button>
                    <button type="button" className="btn btn--primary" onClick={onExit}>
                      New interview
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={submit}
                      disabled={busy !== null || !inDesign}
                      title={inDesign ? undefined : "Finish steps 1 and 2 first"}
                    >
                      {busy === "submit" ? "Reviewing…" : "Submit for review"}
                    </button>
                    <button type="button" className="btn" onClick={() => finish(true)} disabled={busy !== null}>
                      {busy === "finish" ? "Assessing…" : "Finish"}
                    </button>
                  </>
                )}
              </div>
            </header>

            {(failed || lastRound) && (
              <div
                className={`notice${failed ? " notice--error" : strikeWarning ? " notice--warn" : ""}`}
                role={failed || strikeWarning ? "alert" : "status"}
              >
                {failed ? (
                  <>
                    {failed.message}
                    {failed.retryable && (
                      <button type="button" className="btn btn--small" onClick={() => void run(failed.pending)} disabled={busy !== null}>
                        Retry
                      </button>
                    )}
                    <button type="button" className="btn btn--small btn--ghost" onClick={() => setFailed(null)}>
                      Dismiss
                    </button>
                  </>
                ) : (
                  <>Round {session.rounds.length}: {lastRound?.note}</>
                )}
              </div>
            )}

            <div className="workspace">
              <Palette kind={problem.kind} onAdd={(t) => addNode(t)} disabled={readOnly} />
              <div className="canvas" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  defaultEdgeOptions={defaultEdgeOptions}
                  connectionMode={ConnectionMode.Loose}
                  isValidConnection={isValidConnection}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                onNodeDragStop={onNodeDragStop}
                onNodeContextMenu={(e, node) => {
                  if (!node.selected) selectOnly(node.id, null);
                  openMenu(e, "node");
                }}
                onEdgeContextMenu={(e, edge) => {
                  if (!edge.selected) selectOnly(null, edge.id);
                  openMenu(e, "edge", edge.id);
                }}
                onPaneContextMenu={(e) => openMenu(e, "pane")}
                onMoveStart={closeMenu}
                // Keep a selected shape on its own layer, so "Send to back" shows immediately (as in draw.io).
                elevateNodesOnSelect={false}
                onNodesDelete={(deleted) => removeNodes(deleted.map((n) => n.id))}
                  onEdgeDoubleClick={(_, edge) => {
                    if (!readOnly) setEditingEdgeId(edge.id);
                  }}
                  onPaneClick={() => setEditingEdgeId(null)}
                  zoomOnDoubleClick={false}
                  nodesDraggable={!readOnly}
                  nodesConnectable={!readOnly}
                  elementsSelectable
                  deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
                  colorMode="system"
              snapToGrid={snap}
              snapGrid={[GRID, GRID]}
                  fitView
                  fitViewOptions={{ maxZoom: 1 }}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={GRID * 2} />
              {minimap && <MiniMap pannable zoomable className="minimap" />}
              <Panel position="top-right">
                <CanvasToolbar
                  readOnly={readOnly}
                  canArrange={selectedNodes.length > 0}
                  onToFront={() => order("front")}
                  onToBack={() => order("back")}
                  canUndo={history.canUndo}
                  canRedo={history.canRedo}
                  snap={snap}
                  minimap={minimap}
                  fileName={problem.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
                  onUndo={history.undo}
                  onRedo={history.redo}
                  onToggleSnap={() => setSnap((v) => !v)}
                  onToggleMinimap={() => setMinimap((v) => !v)}
                />
              </Panel>
                  {!readOnly && nodes.length < 3 && (
                    <Panel position="bottom-center" className="canvas-hint">
                      Click or drag shapes in · Drag between dots to connect · Double-click to edit
                    </Panel>
                  )}
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
              <aside className="sidebar">
                <details className="statement" open={!inDesign}>

                  <summary>{inDesign ? "Problem & your plan" : "Problem"}</summary>

                  <p>{problem.statement}</p>

                  {session.requirements && <RequirementsSummary requirements={session.requirements} clarifications={session.clarifications} />}

                  {session.contract && <ContractSummary contract={session.contract} kind={problem.kind} />}

                </details>
                <RequirementsPanel
                  clarifications={session.clarifications}
                  draft={requirements}
                  locked={session.requirements}
                  busy={busy === "clarify" || busy === "lock"}
                  readOnly={readOnly}
                  onDraft={setRequirements}
                  onAsk={ask}
                  onLock={lockRequirements}
                />
                {session.phase === "api" && (
                  <ContractPanel kind={problem.kind} draft={contract} busy={busy === "lock"} readOnly={readOnly} onDraft={setContract} onLock={lockContract} />
                )}

                {inDesign && (
                  <>
                    <Inspector
                      node={selectedNode}
                      edge={selectedEdge}
                      selectedCount={selectedNodes.length + selectedEdges.length}
                      nameOf={nameOf}
                      readOnly={readOnly}
                      styleControls={
                        <FormatPanel
                          nodes={selectedNodes}
                          edges={selectedEdges}
                          onNodeStyle={styleNodes}
                          onEdgeStyle={styleEdges}
                          onAlign={align}
                          onDuplicate={duplicate}
                          onToggleLock={toggleLock}
                        />
                      }
                      onNodeChange={updateNode}
                      onEdgeChange={updateEdge}
                      onEdgeDirection={setDirection}
                      onOrder={order}
                      onDelete={deleteSelected}
                    />
                    <ThreadPanel
                      threads={session.threads}
                      knowledge={session.knowledge}
                      nameOf={nameOf}
                      drafts={answers}
                      selectedThreadId={selectedThreadId}
                      readOnly={readOnly}
                      onDraft={(id, text) => setAnswers((a) => ({ ...a, [id]: text }))}
                      onSelect={setSelectedThreadId}
                    />
                  </>
                )}
              </aside>
            </div>
            {menu && <ContextMenu x={menu.x} y={menu.y} sections={menuSections} onClose={closeMenu} />}
        {showAssessment && session.assessment && (
              <AssessmentView
                assessment={session.assessment}
                outcome={session.outcome}
                knowledge={session.knowledge}
                onClose={() => setShowAssessment(false)}
              />
            )}
          </div>
        </EdgeEditContext.Provider>
      </ThreadsContext.Provider>
    </CanvasContext.Provider>
  );
}

export function Interview({ sessionId, onExit }: { sessionId: string; onExit: () => void }) {
  const [state, setState] = useState<{ session: Session; problem: PublicProblem } | { error: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getSession(sessionId), api.problems()])
      .then(([session, problems]) => {
        const problem = problems.find((p) => p.id === session.problemId);
        if (cancelled) return;
        setState(problem ? { session, problem } : { error: "Problem not found" });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ error: e instanceof ApiRequestError ? e.message : "Could not load the interview" });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!state) return <p className="loading">Loading interview…</p>;
  if ("error" in state) {
    return (
      <main className="setup">
        <p className="error" role="alert">{state.error}</p>
        <button type="button" className="btn" onClick={onExit}>Start a new interview</button>
      </main>
    );
  }
  return (
    <ReactFlowProvider>
      <Workspace initial={state.session} problem={state.problem} onExit={onExit} />
    </ReactFlowProvider>
  );
}
