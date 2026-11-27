import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Network,
  Sparkles,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Undo2,
  Edit3,
  Check,
  X,
  RefreshCw,
  GitBranch,
  Rows3,
  Eye,
  EyeOff,
} from 'lucide-react';
import { callAiApi, QuotaExceededError } from '../utils/apiClient.js';
import { getProjectDataIDB } from '../utils/indexedDb.js';

const COLOR_STYLES = {
  blue: {
    bg: '#ffffff',
    darkBg: '#2a0f1c',
    border: '#be123c',
    accent: '#be123c',
    text: '#4c0519',
    darkText: '#ffe4e6',
    dot: '#be123c',
  },
  emerald: {
    bg: '#ffffff',
    darkBg: '#2c0d28',
    border: '#a21caf',
    accent: '#a21caf',
    text: '#4a044e',
    darkText: '#fae8ff',
    dot: '#a21caf',
  },
  violet: {
    bg: '#ffffff',
    darkBg: '#2d0c19',
    border: '#e11d48',
    accent: '#e11d48',
    text: '#881337',
    darkText: '#fecdd3',
    dot: '#e11d48',
  },
  amber: {
    bg: '#ffffff',
    darkBg: '#2b1312',
    border: '#dc2626',
    accent: '#dc2626',
    text: '#7f1d1d',
    darkText: '#fee2e2',
    dot: '#dc2626',
  },
  rose: {
    bg: '#ffffff',
    darkBg: '#310f24',
    border: '#db2777',
    accent: '#db2777',
    text: '#831843',
    darkText: '#fce7f3',
    dot: '#db2777',
  },
  cyan: {
    bg: '#ffffff',
    darkBg: '#241029',
    border: '#9333ea',
    accent: '#9333ea',
    text: '#581c87',
    darkText: '#f3e8ff',
    dot: '#9333ea',
  },
};

const NODE_W = 224;
const NODE_H = 88;
const H_GAP = 42;
const V_GAP = 86;

// Calcola layout Albero Verticale oppure Mappa Mentale Orizzontale (stile Algor Education)
function computeMapLayout(nodes, orientation = 'tree', collapsedIds = new Set()) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { positioned: [], edges: [], width: 920, height: 520, childCounts: new Map() };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = nodes.find((n) => !n.parentId || !byId.has(n.parentId)) || nodes[0];

  const allChildrenMap = new Map();
  nodes.forEach((n) => {
    if (n.id === root.id) return;
    const pid = n.parentId && byId.has(n.parentId) ? n.parentId : root.id;
    if (!allChildrenMap.has(pid)) allChildrenMap.set(pid, []);
    allChildrenMap.get(pid).push(n);
  });

  const childCounts = new Map();
  allChildrenMap.forEach((kids, pid) => childCounts.set(pid, kids.length));

  const getVisibleKids = (id) => (collapsedIds.has(id) ? [] : allChildrenMap.get(id) || []);

  const positioned = [];
  const posById = new Map();

  if (orientation === 'horizontal') {
    const subtreeH = new Map();
    const visited = new Set();
    const measureH = (id) => {
      if (visited.has(id)) return NODE_H;
      visited.add(id);
      const kids = getVisibleKids(id);
      if (kids.length === 0) {
        subtreeH.set(id, NODE_H);
        return NODE_H;
      }
      const total = kids.reduce((acc, k) => acc + measureH(k.id), 0) + 28 * (kids.length - 1);
      const h = Math.max(NODE_H, total);
      subtreeH.set(id, h);
      return h;
    };
    measureH(root.id);

    const placed = new Set();
    const placeH = (id, topY, depth) => {
      if (placed.has(id)) return;
      placed.add(id);
      const node = byId.get(id);
      const myH = subtreeH.get(id) || NODE_H;
      const x = 48 + depth * (NODE_W + 96);
      const y = topY + myH / 2 - NODE_H / 2;
      const item = { ...node, x, y, depth };
      positioned.push(item);
      posById.set(id, item);

      const kids = getVisibleKids(id);
      if (kids.length > 0) {
        const kidsTotal = kids.reduce((acc, k) => acc + (subtreeH.get(k.id) || NODE_H), 0) + 28 * (kids.length - 1);
        let cursor = topY + (myH - kidsTotal) / 2;
        for (const k of kids) {
          const kh = subtreeH.get(k.id) || NODE_H;
          placeH(k.id, cursor, depth + 1);
          cursor += kh + 28;
        }
      }
    };
    placeH(root.id, 48, 0);
  } else {
    const subtreeW = new Map();
    const visited = new Set();
    const measureW = (id) => {
      if (visited.has(id)) return NODE_W;
      visited.add(id);
      const kids = getVisibleKids(id);
      if (kids.length === 0) {
        subtreeW.set(id, NODE_W);
        return NODE_W;
      }
      const total = kids.reduce((acc, k) => acc + measureW(k.id), 0) + H_GAP * (kids.length - 1);
      const w = Math.max(NODE_W, total);
      subtreeW.set(id, w);
      return w;
    };
    measureW(root.id);

    const placed = new Set();
    const placeW = (id, leftX, depth) => {
      if (placed.has(id)) return;
      placed.add(id);
      const node = byId.get(id);
      const myW = subtreeW.get(id) || NODE_W;
      const x = leftX + myW / 2 - NODE_W / 2;
      const y = 48 + depth * (NODE_H + V_GAP);
      const item = { ...node, x, y, depth };
      positioned.push(item);
      posById.set(id, item);

      const kids = getVisibleKids(id);
      if (kids.length > 0) {
        const kidsTotal = kids.reduce((acc, k) => acc + (subtreeW.get(k.id) || NODE_W), 0) + H_GAP * (kids.length - 1);
        let cursor = leftX + (myW - kidsTotal) / 2;
        for (const k of kids) {
          const kw = subtreeW.get(k.id) || NODE_W;
          placeW(k.id, cursor, depth + 1);
          cursor += kw + H_GAP;
        }
      }
    };
    placeW(root.id, 48, 0);
  }

  const edges = [];
  for (const p of positioned) {
    if (p.id === root.id) continue;
    const parent = posById.get(p.parentId) || posById.get(root.id);
    if (parent) {
      edges.push({
        id: `${parent.id}->${p.id}`,
        from: parent,
        to: p,
        label: p.edgeLabel || '',
      });
    }
  }

  const maxX = Math.max(...positioned.map((p) => p.x + NODE_W), 900) + 80;
  const maxY = Math.max(...positioned.map((p) => p.y + NODE_H), 500) + 80;

  return { positioned, edges, width: maxX, height: maxY, childCounts };
}

export default function ConceptMapView({
  theme = 'dark',
  activeProject,
  defaultTopicTitle = '',
  defaultLessonContent = '',
  maps = [],
  onSaveMaps,
  onQuotaExceeded,
  compact = false,
}) {
  const [selectedMapId, setSelectedMapId] = useState(maps[0]?.id || null);
  const [customPrompt, setCustomPrompt] = useState(defaultTopicTitle || '');
  const [orientation, setOrientation] = useState('tree'); // 'tree' | 'horizontal'
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const svgRef = useRef(null);

  useEffect(() => {
    if (defaultTopicTitle) {
      setCustomPrompt(defaultTopicTitle);
    }
  }, [defaultTopicTitle]);

  useEffect(() => {
    if (!selectedMapId && maps.length > 0) {
      setSelectedMapId(maps[0].id);
    }
  }, [maps, selectedMapId]);

  const activeMap = useMemo(
    () => maps.find((m) => m.id === selectedMapId) || maps[0] || null,
    [maps, selectedMapId]
  );

  const layout = useMemo(
    () => computeMapLayout(activeMap?.nodes || [], orientation, collapsedIds),
    [activeMap, orientation, collapsedIds]
  );

  const selectedNode = useMemo(
    () => activeMap?.nodes?.find((n) => n.id === selectedNodeId) || null,
    [activeMap, selectedNodeId]
  );

  const toggleCollapseNode = (e, nodeId) => {
    e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const commitMapUpdate = (updatedMap, pushUndo = true) => {
    if (pushUndo && activeMap) {
      setUndoStack((prev) => [...prev.slice(-15), activeMap]);
    }
    const nextMaps = maps.some((m) => m.id === updatedMap.id)
      ? maps.map((m) => (m.id === updatedMap.id ? updatedMap : m))
      : [updatedMap, ...maps];
    onSaveMaps?.(nextMaps);
  };

  const handleGenerateMap = async () => {
    setErrorMsg('');
    setIsGenerating(true);
    try {
      let fullFiles = activeProject?.files || [];
      if (activeProject?.id) {
        const dbData = await getProjectDataIDB(activeProject.id);
        if (dbData?.files?.length) fullFiles = dbData.files;
      }

      const data = await callAiApi({
        action: 'generate_concept_map',
        topicTitle: customPrompt.trim() || defaultTopicTitle || activeProject?.description || 'Mappa Concettuale',
        examDescription: activeProject?.description || '',
        lessonContent: defaultLessonContent || '',
        files: fullFiles.map((f) => ({
          name: f.name,
          text: f.extractedText || f.text || '',
        })),
      });

      if (data?.map) {
        const nextMaps = [data.map, ...maps];
        onSaveMaps?.(nextMaps);
        setSelectedMapId(data.map.id);
        setSelectedNodeId(data.map.nodes?.[0]?.id || null);
        setCollapsedIds(new Set());
        setZoom(0.88);
        setPan({ x: 0, y: 0 });
      }
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        onQuotaExceeded?.(err.message);
      } else {
        setErrorMsg(err.message || 'Errore nella generazione della mappa concettuale.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateNode = (nodeId, patch) => {
    if (!activeMap) return;
    const nextNodes = activeMap.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n));
    commitMapUpdate({ ...activeMap, nodes: nextNodes });
  };

  const handleAddChildNode = (parentId) => {
    if (!activeMap) return;
    const parent = activeMap.nodes.find((n) => n.id === parentId);
    const newNode = {
      id: `n_${Date.now()}`,
      label: 'Nuovo concetto',
      summary: 'Aggiungi qui la spiegazione sintetica del concetto.',
      level: (parent?.level || 0) + 1,
      parentId,
      color: parent?.color || 'blue',
      edgeLabel: 'collega',
    };
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.delete(parentId);
      return next;
    });
    commitMapUpdate({ ...activeMap, nodes: [...activeMap.nodes, newNode] });
    setSelectedNodeId(newNode.id);
  };

  const handleDeleteNode = (nodeId) => {
    if (!activeMap || activeMap.nodes.length <= 1) return;
    const root = activeMap.nodes.find((n) => !n.parentId) || activeMap.nodes[0];
    if (nodeId === root.id) return;

    const toRemove = new Set([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of activeMap.nodes) {
        if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
          toRemove.add(n.id);
          changed = true;
        }
      }
    }
    const nextNodes = activeMap.nodes.filter((n) => !toRemove.has(n.id));
    commitMapUpdate({ ...activeMap, nodes: nextNodes });
    setSelectedNodeId(null);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    commitMapUpdate(previous, false);
  };

  const handleExportPng = () => {
    if (!svgRef.current || !activeMap) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgRef.current);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = layout.width * scale;
      canvas.height = layout.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = theme === 'dark' ? '#120a10' : '#fdf7f9';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const link = document.createElement('a');
      link.download = `${(activeMap.title || 'mappa-concettuale').replace(/[^a-z0-9]/gi, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = url;
  };

  const onMouseDownCanvas = (e) => {
    if (e.target.closest('[data-node-id]')) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onMouseMoveCanvas = (e) => {
    if (!isPanning) return;
    setPan({
      x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
      y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
    });
  };

  const onMouseUpCanvas = () => setIsPanning(false);

  const onWheelCanvas = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((z) => Math.max(0.35, Math.min(1.8, Number((z + delta).toFixed(2)))));
  };

  return (
    <div className="space-y-4">
      {/* HEADER GENERATOR BAR STILE ALGOR */}
      <div className="p-3.5 sm:p-4 rounded-3xl border border-indigo-500/20 bg-white dark:bg-[#171a26] shadow-lg shadow-indigo-500/5 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500 to-teal-400 text-white flex items-center justify-center shadow-md shadow-indigo-500/25">
            <Network size={18} />
          </div>
          <div>
            <div className="font-extrabold text-sm leading-tight">Algor-Style Map Studio</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Genera, modifica, esplora e memorizza</div>
          </div>
        </div>
        <input
          type="text"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Scrivi l'argomento da mappare (es. Chirurgia Vascolare, Rivoluzione Francese...)"
          className="flex-1 px-4 py-2.5 rounded-2xl text-sm bg-slate-100 dark:bg-[#0f111a] border border-slate-200 dark:border-[#2a2f45] outline-none focus:border-indigo-500 transition"
        />
        <button
          onClick={handleGenerateMap}
          disabled={isGenerating}
          className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-500 hover:to-teal-400 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition shrink-0"
        >
          {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {isGenerating ? 'Creazione Mappa AI...' : 'Genera Mappa AI'}
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* PILL SELECTOR MAPPE SALVATE */}
      {maps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {maps.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedMapId(m.id);
                setSelectedNodeId(null);
                setCollapsedIds(new Set());
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                activeMap?.id === m.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/25'
                  : 'bg-white dark:bg-[#171a26] border-slate-200 dark:border-[#2a2f45] hover:border-indigo-400'
              }`}
            >
              {m.title}
            </button>
          ))}
        </div>
      )}

      {/* CANVAS INTERATTIVO + SIDEBAR NODO */}
      {activeMap ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 rounded-3xl border border-slate-200 dark:border-[#2a2f45] bg-[#f5f7fc] dark:bg-[#0f111a] overflow-hidden relative shadow-xl">
            {/* TOP BAR LEGGERA */}
            <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-[#2a2f45] bg-white/90 dark:bg-[#171a26]/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" />
                <span className="font-bold text-xs sm:text-sm truncate">{activeMap.title}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-semibold shrink-0">
                  {activeMap.nodes?.length || 0} nodi
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setOrientation((o) => (o === 'tree' ? 'horizontal' : 'tree'))}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#222638] hover:bg-indigo-500/15 text-xs font-semibold flex items-center gap-1.5 transition"
                  title="Cambia layout Albero / Mappa Mentale"
                >
                  {orientation === 'tree' ? <GitBranch size={13} className="text-indigo-500" /> : <Rows3 size={13} className="text-teal-500" />}
                  <span>{orientation === 'tree' ? 'Albero' : 'Orizzontale'}</span>
                </button>
                <button
                  onClick={() => {
                    if (collapsedIds.size > 0) {
                      setCollapsedIds(new Set());
                    } else {
                      const level1 = (activeMap.nodes || []).filter((n) => n.level === 1).map((n) => n.id);
                      setCollapsedIds(new Set(level1));
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#222638] hover:bg-indigo-500/15 text-xs font-semibold flex items-center gap-1.5 transition"
                  title="Modalità Ripasso Attivo: nascondi o mostra i sotto-rami"
                >
                  {collapsedIds.size > 0 ? <Eye size={13} className="text-teal-500" /> : <EyeOff size={13} className="text-amber-500" />}
                  <span className="hidden sm:inline">{collapsedIds.size > 0 ? 'Mostra tutto' : 'Ripasso attivo'}</span>
                </button>
              </div>
            </div>

            {/* LAVAGNA A PUNTINI */}
            <div
              onMouseDown={onMouseDownCanvas}
              onMouseMove={onMouseMoveCanvas}
              onMouseUp={onMouseUpCanvas}
              onMouseLeave={onMouseUpCanvas}
              onWheel={onWheelCanvas}
              className={`algor-dot-grid relative ${compact ? 'h-[470px]' : 'h-[560px]'} overflow-hidden select-none ${
                isPanning ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'top left',
                }}
              >
                <svg
                  ref={svgRef}
                  xmlns="http://www.w3.org/2000/svg"
                  width={layout.width}
                  height={layout.height}
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                >
                  <defs>
                    <filter id="algorCardShadow" x="-10%" y="-10%" width="125%" height="130%">
                      <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#1e1b4b" floodOpacity={theme === 'dark' ? '0.45' : '0.10'} />
                    </filter>
                  </defs>

                  {/* CONNETTORI CURVI FLUIDI */}
                  {layout.edges.map((e) => {
                    const isHoriz = orientation === 'horizontal';
                    const x1 = isHoriz ? e.from.x + NODE_W : e.from.x + NODE_W / 2;
                    const y1 = isHoriz ? e.from.y + NODE_H / 2 : e.from.y + NODE_H;
                    const x2 = isHoriz ? e.to.x : e.to.x + NODE_W / 2;
                    const y2 = isHoriz ? e.to.y + NODE_H / 2 : e.to.y;
                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;
                    const d = isHoriz
                      ? `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
                      : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
                    const style = COLOR_STYLES[e.to.color] || COLOR_STYLES.blue;

                    return (
                      <g key={e.id}>
                        <path
                          d={d}
                          fill="none"
                          stroke={style.border}
                          strokeWidth="2.5"
                          strokeOpacity="0.65"
                        />
                        {e.label && (
                          <g transform={`translate(${midX}, ${midY})`}>
                            <rect
                              x="-52"
                              y="-11"
                              width="104"
                              height="22"
                              rx="11"
                              fill={theme === 'dark' ? '#171a26' : '#ffffff'}
                              stroke={style.border}
                              strokeWidth="1.2"
                              strokeOpacity="0.55"
                            />
                            <text
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontSize="10"
                              fontWeight="700"
                              fill={theme === 'dark' ? '#e2e8f0' : '#334155'}
                            >
                              {e.label.slice(0, 17)}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* NODI CARD STILE ALGOR */}
                  {layout.positioned.map((node) => {
                    const st = COLOR_STYLES[node.color] || COLOR_STYLES.blue;
                    const isSelected = selectedNodeId === node.id;
                    const fill = theme === 'dark' ? st.darkBg : st.bg;
                    const textColor = theme === 'dark' ? st.darkText : st.text;
                    const kidsCount = layout.childCounts.get(node.id) || 0;
                    const isCollapsed = collapsedIds.has(node.id);

                    return (
                      <g
                        key={node.id}
                        data-node-id={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        onClick={() => setSelectedNodeId(node.id)}
                        style={{ cursor: 'pointer' }}
                        filter="url(#algorCardShadow)"
                      >
                        <rect
                          width={NODE_W}
                          height={NODE_H}
                          rx="18"
                          fill={fill}
                          stroke={isSelected ? '#ffffff' : st.border}
                          strokeWidth={isSelected ? '3.2' : node.depth === 0 ? '2.8' : '1.8'}
                        />
                        {/* Barra accento colorata in alto */}
                        <rect
                          x="14"
                          y="0"
                          width={NODE_W - 28}
                          height="5"
                          rx="2.5"
                          fill={st.accent}
                        />
                        <foreignObject x="12" y="10" width={NODE_W - 24} height={NODE_H - 18}>
                          <div
                            xmlns="http://www.w3.org/1999/xhtml"
                            style={{
                              color: textColor,
                              fontFamily: '"Plus Jakarta Sans", Inter, sans-serif',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              height: '100%',
                              textAlign: 'center',
                              overflow: 'hidden',
                            }}
                          >
                            <div style={{ fontSize: node.depth === 0 ? '13.5px' : '12px', fontWeight: 800, lineHeight: 1.25 }}>
                              {node.label}
                            </div>
                            {node.summary && (
                              <div
                                style={{
                                  fontSize: '10px',
                                  opacity: 0.78,
                                  marginTop: '4px',
                                  lineHeight: 1.25,
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                              >
                                {node.summary}
                              </div>
                            )}
                          </div>
                        </foreignObject>

                        {/* Badge espandi / comprimi ramo */}
                        {kidsCount > 0 && (
                          <g
                            transform={
                              orientation === 'horizontal'
                                ? `translate(${NODE_W}, ${NODE_H / 2})`
                                : `translate(${NODE_W / 2}, ${NODE_H})`
                            }
                            onClick={(e) => toggleCollapseNode(e, node.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <circle r="11" fill={st.accent} stroke={fill} strokeWidth="2" />
                            <text
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize="11"
                              fontWeight="800"
                              fill="#ffffff"
                            >
                              {isCollapsed ? `+${kidsCount}` : '−'}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* DOCK FLUTTUANTE IN BASSO (STILE ALGOR / FIGJAM) */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-white/95 dark:bg-[#171a26]/95 backdrop-blur-md border border-slate-200 dark:border-[#2a2f45] shadow-xl">
                <button
                  onClick={() => setZoom((z) => Math.max(0.35, Number((z - 0.1).toFixed(2))))}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#222638] transition"
                  title="Zoom indietro"
                >
                  <ZoomOut size={15} />
                </button>
                <span className="text-[11px] font-bold font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(2))))}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#222638] transition"
                  title="Zoom avanti"
                >
                  <ZoomIn size={15} />
                </button>
                <div className="w-px h-4 bg-slate-200 dark:bg-[#2a2f45] mx-0.5" />
                <button
                  onClick={() => {
                    setZoom(0.88);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#222638] transition"
                  title="Centra lavagna"
                >
                  <Maximize2 size={15} />
                </button>
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#222638] disabled:opacity-30 transition"
                  title="Annulla"
                >
                  <Undo2 size={15} />
                </button>
                <div className="w-px h-4 bg-slate-200 dark:bg-[#2a2f45] mx-0.5" />
                <button
                  onClick={handleExportPng}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Download size={13} /> PNG
                </button>
              </div>
            </div>
          </div>

          {/* PANNELLO ISPEZIONE / MODIFICA NODO */}
          <div className="rounded-3xl border border-slate-200 dark:border-[#2a2f45] bg-white dark:bg-[#171a26] p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm flex items-center gap-2">
                <Edit3 size={15} className="text-indigo-500" />
                Editor Nodo
              </h4>
              {selectedNode && (
                <button onClick={() => setSelectedNodeId(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={15} />
                </button>
              )}
            </div>

            {selectedNode ? (
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold mb-1 text-slate-500 dark:text-slate-400">Concetto</label>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={(e) => handleUpdateNode(selectedNode.id, { label: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#0f111a] border border-slate-200 dark:border-[#2a2f45] outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-500 dark:text-slate-400">Spiegazione completa</label>
                  <textarea
                    rows={4}
                    value={selectedNode.summary || ''}
                    onChange={(e) => handleUpdateNode(selectedNode.id, { summary: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#0f111a] border border-slate-200 dark:border-[#2a2f45] outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                {selectedNode.parentId && (
                  <div>
                    <label className="block font-bold mb-1 text-slate-500 dark:text-slate-400">Nesso sulla freccia</label>
                    <input
                      type="text"
                      value={selectedNode.edgeLabel || ''}
                      onChange={(e) => handleUpdateNode(selectedNode.id, { edgeLabel: e.target.value })}
                      placeholder="es. causa, include, porta a..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#0f111a] border border-slate-200 dark:border-[#2a2f45] outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-bold mb-1.5 text-slate-500 dark:text-slate-400">Colore ramo</label>
                  <div className="flex items-center gap-2">
                    {Object.entries(COLOR_STYLES).map(([name, st]) => (
                      <button
                        key={name}
                        onClick={() => handleUpdateNode(selectedNode.id, { color: name })}
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition ${
                          selectedNode.color === name ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''
                        }`}
                        style={{ backgroundColor: st.dot }}
                      >
                        {selectedNode.color === name && <Check size={12} className="text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={() => handleAddChildNode(selectedNode.id)}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition"
                  >
                    <Plus size={14} /> Aggiungi sotto-nodo
                  </button>
                  {selectedNode.parentId && (
                    <button
                      onClick={() => handleDeleteNode(selectedNode.id)}
                      className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold flex items-center justify-center gap-1.5 transition"
                    >
                      <Trash2 size={14} /> Elimina ramo
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                <p>
                  Clicca su un nodo nella lavagna per leggere la definizione completa, modificarne testo, freccia o colore, oppure aggiungere nuovi rami.
                </p>
                <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-medium">
                  💡 Suggerimento: usa il pulsante <strong>Ripasso attivo</strong> o clicca sui pallini <strong>− / +</strong> sui nodi per nascondere e rivelare i concetti mentre ripeti!
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="algor-dot-grid p-12 rounded-3xl border-2 border-dashed border-indigo-300/60 dark:border-indigo-500/30 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-teal-400 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Network size={28} />
          </div>
          <h3 className="font-extrabold text-base">Trasforma questa lezione in una Mappa Concettuale Interattiva</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Con un clic l&apos;AI organizza i concetti chiave in nodi colorati modificabili, perfetti per memorizzare velocemente e ripassare prima dell&apos;esame.
          </p>
          <button
            onClick={handleGenerateMap}
            disabled={isGenerating}
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-500 hover:to-teal-400 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 transition"
          >
            {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isGenerating ? 'Generazione in corso...' : 'Crea la tua prima Mappa AI'}
          </button>
        </div>
      )}
    </div>
  );
}
