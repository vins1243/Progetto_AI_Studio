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
} from 'lucide-react';
import { callAiApi, QuotaExceededError } from '../utils/apiClient.js';
import { getProjectDataIDB } from '../utils/indexedDb.js';

const COLOR_STYLES = {
  blue: {
    bg: '#eff6ff',
    darkBg: '#1e3a8a',
    border: '#3b82f6',
    text: '#1e3a8a',
    darkText: '#dbeafe',
    dot: '#3b82f6',
  },
  emerald: {
    bg: '#ecfdf5',
    darkBg: '#064e3b',
    border: '#10b981',
    text: '#065f46',
    darkText: '#d1fae5',
    dot: '#10b981',
  },
  violet: {
    bg: '#f5f3ff',
    darkBg: '#4c1d95',
    border: '#8b5cf6',
    text: '#4c1d95',
    darkText: '#ede9fe',
    dot: '#8b5cf6',
  },
  amber: {
    bg: '#fffbeb',
    darkBg: '#78350f',
    border: '#f59e0b',
    text: '#78350f',
    darkText: '#fef3c7',
    dot: '#f59e0b',
  },
  rose: {
    bg: '#fff1f2',
    darkBg: '#881337',
    border: '#f43f5e',
    text: '#881337',
    darkText: '#ffe4e6',
    dot: '#f43f5e',
  },
  cyan: {
    bg: '#ecfeff',
    darkBg: '#164e63',
    border: '#06b6d4',
    text: '#164e63',
    darkText: '#cffafe',
    dot: '#06b6d4',
  },
};

const NODE_W = 210;
const NODE_H = 82;
const H_GAP = 42;
const V_GAP = 86;

// Calcola layout gerarchico ad albero pulito (senza sovrapposizioni)
function computeTreeLayout(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { positioned: [], edges: [], width: 900, height: 500 };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = nodes.find((n) => !n.parentId || !byId.has(n.parentId)) || nodes[0];

  const childrenMap = new Map();
  nodes.forEach((n) => {
    if (n.id === root.id) return;
    const pid = n.parentId && byId.has(n.parentId) ? n.parentId : root.id;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid).push(n);
  });

  const subtreeWidth = new Map();
  const visited = new Set();

  function measure(nodeId) {
    if (visited.has(nodeId)) return NODE_W;
    visited.add(nodeId);
    const kids = childrenMap.get(nodeId) || [];
    if (kids.length === 0) {
      subtreeWidth.set(nodeId, NODE_W);
      return NODE_W;
    }
    const total = kids.reduce((acc, k) => acc + measure(k.id), 0) + H_GAP * (kids.length - 1);
    const w = Math.max(NODE_W, total);
    subtreeWidth.set(nodeId, w);
    return w;
  }

  measure(root.id);

  const positioned = [];
  const posById = new Map();
  const placed = new Set();

  function place(nodeId, leftX, depth) {
    if (placed.has(nodeId)) return;
    placed.add(nodeId);
    const node = byId.get(nodeId);
    const myWidth = subtreeWidth.get(nodeId) || NODE_W;
    const x = leftX + myWidth / 2 - NODE_W / 2;
    const y = 40 + depth * (NODE_H + V_GAP);
    const item = { ...node, x, y, depth };
    positioned.push(item);
    posById.set(nodeId, item);

    const kids = childrenMap.get(nodeId) || [];
    if (kids.length > 0) {
      const kidsTotalW =
        kids.reduce((acc, k) => acc + (subtreeWidth.get(k.id) || NODE_W), 0) +
        H_GAP * (kids.length - 1);
      let cursor = leftX + (myWidth - kidsTotalW) / 2;
      for (const k of kids) {
        const kw = subtreeWidth.get(k.id) || NODE_W;
        place(k.id, cursor, depth + 1);
        cursor += kw + H_GAP;
      }
    }
  }

  place(root.id, 40, 0);

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

  const maxX = Math.max(...positioned.map((p) => p.x + NODE_W), 860) + 60;
  const maxY = Math.max(...positioned.map((p) => p.y + NODE_H), 460) + 60;

  return { positioned, edges, width: maxX, height: maxY };
}

export default function ConceptMapView({
  theme = 'dark',
  activeProject,
  defaultTopicTitle = '',
  defaultLessonContent = '',
  maps = [],
  onSaveMaps,
  onQuotaExceeded,
}) {
  const [selectedMapId, setSelectedMapId] = useState(maps[0]?.id || null);
  const [customPrompt, setCustomPrompt] = useState(defaultTopicTitle || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [zoom, setZoom] = useState(0.95);
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

  const layout = useMemo(() => computeTreeLayout(activeMap?.nodes || []), [activeMap]);
  const selectedNode = useMemo(
    () => activeMap?.nodes?.find((n) => n.id === selectedNodeId) || null,
    [activeMap, selectedNodeId]
  );

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
        setZoom(0.9);
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
    commitMapUpdate({ ...activeMap, nodes: [...activeMap.nodes, newNode] });
    setSelectedNodeId(newNode.id);
  };

  const handleDeleteNode = (nodeId) => {
    if (!activeMap || activeMap.nodes.length <= 1) return;
    const root = activeMap.nodes.find((n) => !n.parentId) || activeMap.nodes[0];
    if (nodeId === root.id) return;

    // Rimuove il nodo e tutti i discendenti
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
      ctx.fillStyle = theme === 'dark' ? '#131314' : '#ffffff';
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

  return (
    <div className="space-y-4">
      {/* BARRA GENERAZIONE MAPPA */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#2a2b2f] bg-white dark:bg-[#1e1f20] flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm shrink-0">
          <Network size={18} />
          <span>Mappe Concettuali AI</span>
        </div>
        <input
          type="text"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Argomento della mappa (es. Rivoluzione Francese, Ciclo di Krebs, Diritto Privato...)"
          className="flex-1 px-3.5 py-2 rounded-xl text-sm bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#2a2b2f] outline-none focus:border-blue-500"
        />
        <button
          onClick={handleGenerateMap}
          disabled={isGenerating}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shrink-0"
        >
          {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {isGenerating ? 'Generazione mappa...' : 'Genera Mappa AI'}
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-medium">
          {errorMsg}
        </div>
      )}

      {/* SELETTORE MAPPE SALVATE */}
      {maps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {maps.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedMapId(m.id);
                setSelectedNodeId(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                activeMap?.id === m.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-[#1e1f20] border-slate-200 dark:border-[#2a2b2f] hover:border-blue-500'
              }`}
            >
              {m.title}
            </button>
          ))}
        </div>
      )}

      {/* AREA CANVAS + PANNELLO MODIFICA NODO */}
      {activeMap ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-[#2a2b2f] bg-slate-50 dark:bg-[#131314] overflow-hidden flex flex-col">
            {/* TOOLBAR CANVAS */}
            <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-[#2a2b2f] bg-white dark:bg-[#1e1f20] flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-xs sm:text-sm truncate">{activeMap.title}</div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#282a2c]"
                  title="Riduci zoom"
                >
                  <ZoomOut size={15} />
                </button>
                <span className="text-[11px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(2))))}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#282a2c]"
                  title="Aumenta zoom"
                >
                  <ZoomIn size={15} />
                </button>
                <button
                  onClick={() => {
                    setZoom(0.9);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#282a2c]"
                  title="Centra mappa"
                >
                  <Maximize2 size={15} />
                </button>
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#282a2c] disabled:opacity-30"
                  title="Annulla ultima modifica"
                >
                  <Undo2 size={15} />
                </button>
                <button
                  onClick={handleExportPng}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download size={13} /> PNG
                </button>
              </div>
            </div>

            {/* CANVAS INTERATTIVO SVG */}
            <div
              onMouseDown={onMouseDownCanvas}
              onMouseMove={onMouseMoveCanvas}
              onMouseUp={onMouseUpCanvas}
              onMouseLeave={onMouseUpCanvas}
              className={`relative h-[520px] overflow-hidden select-none ${
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
                  {/* Connettori curvi */}
                  {layout.edges.map((e) => {
                    const x1 = e.from.x + NODE_W / 2;
                    const y1 = e.from.y + NODE_H;
                    const x2 = e.to.x + NODE_W / 2;
                    const y2 = e.to.y;
                    const midY = (y1 + y2) / 2;
                    const style = COLOR_STYLES[e.to.color] || COLOR_STYLES.blue;
                    return (
                      <g key={e.id}>
                        <path
                          d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                          fill="none"
                          stroke={style.border}
                          strokeWidth="2.2"
                          strokeOpacity="0.65"
                        />
                        {e.label && (
                          <g transform={`translate(${(x1 + x2) / 2}, ${midY})`}>
                            <rect
                              x="-48"
                              y="-10"
                              width="96"
                              height="20"
                              rx="10"
                              fill={theme === 'dark' ? '#1e1f20' : '#ffffff'}
                              stroke={style.border}
                              strokeOpacity="0.4"
                            />
                            <text
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontSize="10"
                              fontWeight="600"
                              fill={theme === 'dark' ? '#cbd5e1' : '#334155'}
                            >
                              {e.label.slice(0, 16)}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Nodi */}
                  {layout.positioned.map((node) => {
                    const st = COLOR_STYLES[node.color] || COLOR_STYLES.blue;
                    const isSelected = selectedNodeId === node.id;
                    const fill = theme === 'dark' ? st.darkBg : st.bg;
                    const textColor = theme === 'dark' ? st.darkText : st.text;

                    return (
                      <g
                        key={node.id}
                        data-node-id={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        onClick={() => setSelectedNodeId(node.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <rect
                          width={NODE_W}
                          height={NODE_H}
                          rx="16"
                          fill={fill}
                          stroke={isSelected ? '#ffffff' : st.border}
                          strokeWidth={isSelected ? '3' : '2'}
                        />
                        <foreignObject x="10" y="8" width={NODE_W - 20} height={NODE_H - 16}>
                          <div
                            xmlns="http://www.w3.org/1999/xhtml"
                            style={{
                              color: textColor,
                              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              height: '100%',
                              textAlign: 'center',
                              overflow: 'hidden',
                            }}
                          >
                            <div style={{ fontSize: node.depth === 0 ? '13px' : '12px', fontWeight: 700, lineHeight: 1.25 }}>
                              {node.label}
                            </div>
                            {node.summary && (
                              <div
                                style={{
                                  fontSize: '10px',
                                  opacity: 0.82,
                                  marginTop: '3px',
                                  lineHeight: 1.2,
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
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>

          {/* PANNELLO ISPEZIONE / MODIFICA NODO */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#2a2b2f] bg-white dark:bg-[#1e1f20] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm flex items-center gap-1.5">
                <Edit3 size={15} className="text-blue-500" />
                Dettaglio Nodo
              </h4>
              {selectedNode && (
                <button onClick={() => setSelectedNodeId(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={15} />
                </button>
              )}
            </div>

            {selectedNode ? (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1 text-slate-500 dark:text-gray-400">Titolo concetto</label>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={(e) => handleUpdateNode(selectedNode.id, { label: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#2a2b2f] outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-500 dark:text-gray-400">Spiegazione sintetica</label>
                  <textarea
                    rows={4}
                    value={selectedNode.summary || ''}
                    onChange={(e) => handleUpdateNode(selectedNode.id, { summary: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#2a2b2f] outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                {selectedNode.parentId && (
                  <div>
                    <label className="block font-semibold mb-1 text-slate-500 dark:text-gray-400">Nesso logico (freccia)</label>
                    <input
                      type="text"
                      value={selectedNode.edgeLabel || ''}
                      onChange={(e) => handleUpdateNode(selectedNode.id, { edgeLabel: e.target.value })}
                      placeholder="es. causa, include, porta a..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#2a2b2f] outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold mb-1.5 text-slate-500 dark:text-gray-400">Colore ramo</label>
                  <div className="flex items-center gap-2">
                    {Object.entries(COLOR_STYLES).map(([name, st]) => (
                      <button
                        key={name}
                        onClick={() => handleUpdateNode(selectedNode.id, { color: name })}
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition ${
                          selectedNode.color === name ? 'ring-2 ring-offset-2 ring-blue-500' : ''
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
                    className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} /> Aggiungi sotto-nodo
                  </button>
                  {selectedNode.parentId && (
                    <button
                      onClick={() => handleDeleteNode(selectedNode.id)}
                      className="w-full py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={14} /> Elimina ramo
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-gray-400 leading-relaxed">
                Clicca su un nodo nella mappa per visualizzare la definizione completa, modificarne testo e colore oppure aggiungere nuovi sotto-concetti. Trascina lo sfondo per spostare la mappa.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="p-10 rounded-2xl border border-dashed border-slate-300 dark:border-[#37393b] text-center space-y-2">
          <Network size={32} className="mx-auto text-emerald-500 opacity-80" />
          <p className="font-semibold text-sm">Nessuna mappa concettuale generata per questo progetto</p>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            Scrivi un argomento nella barra in alto e clicca su “Genera Mappa AI” per creare la tua prima mappa interattiva.
          </p>
        </div>
      )}
    </div>
  );
}
