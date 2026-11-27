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

const BRANCH_PALETTE_ORDER = ['crimson', 'orange', 'emerald', 'violet', 'teal', 'blue'];

const COLOR_STYLES = {
  crimson: {
    solid: '#e11d48',
    pastel: '#ffe4e6',
    darkPastel: '#3d1022',
    border: '#e11d48',
    pastelText: '#881337',
    darkPastelText: '#fecdd3',
    dot: '#e11d48',
  },
  orange: {
    solid: '#ea580c',
    pastel: '#ffedd5',
    darkPastel: '#3b1c0c',
    border: '#ea580c',
    pastelText: '#9a3412',
    darkPastelText: '#fed7aa',
    dot: '#ea580c',
  },
  emerald: {
    solid: '#16a34a',
    pastel: '#dcfce7',
    darkPastel: '#0e2e1b',
    border: '#16a34a',
    pastelText: '#14532d',
    darkPastelText: '#bbf7d0',
    dot: '#16a34a',
  },
  violet: {
    solid: '#7c3aed',
    pastel: '#f3e8ff',
    darkPastel: '#28133e',
    border: '#7c3aed',
    pastelText: '#581c87',
    darkPastelText: '#e9d5ff',
    dot: '#7c3aed',
  },
  teal: {
    solid: '#0d9488',
    pastel: '#ccfbf1',
    darkPastel: '#0d2c2a',
    border: '#0d9488',
    pastelText: '#115e59',
    darkPastelText: '#99f6e4',
    dot: '#0d9488',
  },
  blue: {
    solid: '#2563eb',
    pastel: '#dbeafe',
    darkPastel: '#102142',
    border: '#2563eb',
    pastelText: '#1e3a8a',
    darkPastelText: '#bfdbfe',
    dot: '#2563eb',
  },
};

function resolvePaletteKey(rawColor, fallbackIdx = 0) {
  const c = String(rawColor || '').toLowerCase();
  if (COLOR_STYLES[c]) return c;
  if (c === 'rose' || c === 'red') return 'crimson';
  if (c === 'amber' || c === 'yellow') return 'orange';
  if (c === 'green') return 'emerald';
  if (c === 'purple' || c === 'indigo') return 'violet';
  if (c === 'cyan') return 'teal';
  return BRANCH_PALETTE_ORDER[fallbackIdx % BRANCH_PALETTE_ORDER.length];
}

function getDisplayText(node, depth) {
  const label = (node.label || '').trim();
  const summary = (node.summary || '').trim();
  if (depth >= 3) {
    if (label.length < 40 && summary && summary.length > label.length) {
      return `${label}: ${summary}`;
    }
    return label || summary;
  }
  return label || summary;
}

function measureNodeSize(node, depth) {
  const text = getDisplayText(node, depth);
  if (depth === 0) {
    const w = 230;
    const lines = Math.max(2, Math.ceil(text.length / 22));
    const h = Math.max(66, lines * 18 + 26);
    return { w, h };
  }
  if (depth === 1) {
    const w = 196;
    const lines = Math.max(2, Math.ceil(text.length / 20));
    const h = Math.max(48, lines * 16 + 22);
    return { w, h };
  }
  if (depth === 2) {
    const w = 176;
    const lines = Math.max(1, Math.ceil(text.length / 19));
    const h = Math.max(42, lines * 15 + 20);
    return { w, h };
  }
  // Depth 3+ (Schede foglia dettagliate, leggibili al 100% senza troncamento)
  const w = 276;
  const lines = Math.max(2, Math.ceil(text.length / 32));
  const h = Math.max(60, lines * 15 + 24);
  return { w, h };
}

const MINDMAP_H_GAP = 56;
const MINDMAP_V_GAP = 14;
const MINDMAP_BRANCH_GAP = 32;
const TREE_H_GAP = 28;
const TREE_V_GAP = 72;

// Calcola layout Mappa Mentale Bilaterale (sx/dx dal centro) oppure Albero Verticale
function computeMapLayout(nodes, orientation = 'mindmap', collapsedIds = new Set()) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { positioned: [], edges: [], width: 1200, height: 640, childCounts: new Map() };
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

  // Assegna un colore coerente per ramo (ereditato da ogni nodo di livello 1)
  const branchColorById = new Map();
  const l1KidsAll = allChildrenMap.get(root.id) || [];
  l1KidsAll.forEach((k, idx) => {
    const col = resolvePaletteKey(k.color, idx);
    const assignRec = (id, depth = 1) => {
      if (branchColorById.has(id) || depth > 8) return;
      branchColorById.set(id, col);
      (allChildrenMap.get(id) || []).forEach((c) => assignRec(c.id, depth + 1));
    };
    assignRec(k.id, 1);
  });

  const positioned = [];
  const posById = new Map();

  if (orientation === 'mindmap') {
    const rootSize = measureNodeSize(root, 0);
    const l1Visible = getVisibleKids(root.id);
    const leftCount = Math.ceil(l1Visible.length / 2);
    const leftBranches = l1Visible.slice(0, leftCount);
    const rightBranches = l1Visible.slice(leftCount);

    const subtreeH = new Map();
    const subtreeMaxDepthW = new Map();
    const sizeById = new Map();
    sizeById.set(root.id, rootSize);

    const measureSubtree = (id, depth) => {
      const node = byId.get(id);
      const sz = measureNodeSize(node, depth);
      sizeById.set(id, sz);
      const kids = getVisibleKids(id);
      if (kids.length === 0) {
        subtreeH.set(id, sz.h);
        subtreeMaxDepthW.set(id, sz.w);
        return sz.h;
      }
      let totalKidsH = 0;
      let maxChildSpan = 0;
      kids.forEach((k, i) => {
        totalKidsH += measureSubtree(k.id, depth + 1);
        if (i > 0) totalKidsH += depth === 1 ? 20 : MINDMAP_V_GAP;
        maxChildSpan = Math.max(maxChildSpan, subtreeMaxDepthW.get(k.id) || 200);
      });
      const h = Math.max(sz.h, totalKidsH);
      subtreeH.set(id, h);
      subtreeMaxDepthW.set(id, sz.w + MINDMAP_H_GAP + maxChildSpan);
      return h;
    };

    const measureSide = (branches) => {
      let totalH = 0;
      let maxW = 0;
      branches.forEach((b, i) => {
        totalH += measureSubtree(b.id, 1);
        if (i > 0) totalH += MINDMAP_BRANCH_GAP;
        maxW = Math.max(maxW, subtreeMaxDepthW.get(b.id) || 200);
      });
      return { totalH, maxW };
    };

    const leftMetrics = measureSide(leftBranches);
    const rightMetrics = measureSide(rightBranches);

    const padX = 64;
    const padY = 56;
    const contentH = Math.max(rootSize.h, leftMetrics.totalH, rightMetrics.totalH);
    const centerX = padX + (leftBranches.length > 0 ? leftMetrics.maxW + MINDMAP_H_GAP : 0);
    const rootY = padY + contentH / 2 - rootSize.h / 2;

    const rootItem = {
      ...root,
      x: centerX,
      y: rootY,
      w: rootSize.w,
      h: rootSize.h,
      depth: 0,
      side: 0,
      branchColor: 'crimson',
    };
    positioned.push(rootItem);
    posById.set(root.id, rootItem);

    const placeBranch = (id, topY, depth, side, anchorX) => {
      const node = byId.get(id);
      const sz = sizeById.get(id) || measureNodeSize(node, depth);
      const myH = subtreeH.get(id) || sz.h;
      const x = side === -1 ? anchorX - sz.w : anchorX;
      const y = topY + myH / 2 - sz.h / 2;
      const item = {
        ...node,
        x,
        y,
        w: sz.w,
        h: sz.h,
        depth,
        side,
        branchColor: branchColorById.get(id) || 'crimson',
      };
      positioned.push(item);
      posById.set(id, item);

      const kids = getVisibleKids(id);
      if (kids.length > 0) {
        const gap = depth === 1 ? 20 : MINDMAP_V_GAP;
        const kidsTotal = kids.reduce((acc, k) => acc + (subtreeH.get(k.id) || 60), 0) + gap * (kids.length - 1);
        let cursorY = topY + (myH - kidsTotal) / 2;
        const nextAnchorX = side === -1 ? x - MINDMAP_H_GAP : x + sz.w + MINDMAP_H_GAP;
        for (const k of kids) {
          const kh = subtreeH.get(k.id) || 60;
          placeBranch(k.id, cursorY, depth + 1, side, nextAnchorX);
          cursorY += kh + gap;
        }
      }
    };

    // Posiziona rami SINISTRI (si espandono verso sinistra)
    let leftCursorY = padY + (contentH - leftMetrics.totalH) / 2;
    for (const b of leftBranches) {
      const bh = subtreeH.get(b.id) || 80;
      placeBranch(b.id, leftCursorY, 1, -1, centerX - MINDMAP_H_GAP);
      leftCursorY += bh + MINDMAP_BRANCH_GAP;
    }

    // Posiziona rami DESTRI (si espandono verso destra)
    let rightCursorY = padY + (contentH - rightMetrics.totalH) / 2;
    for (const b of rightBranches) {
      const bh = subtreeH.get(b.id) || 80;
      placeBranch(b.id, rightCursorY, 1, 1, centerX + rootSize.w + MINDMAP_H_GAP);
      rightCursorY += bh + MINDMAP_BRANCH_GAP;
    }
  } else {
    // Modalita Albero Verticale (top-down)
    const sizeById = new Map();
    const subtreeW = new Map();
    const maxHByDepth = new Map();
    const visited = new Set();

    const measureW = (id, depth) => {
      if (visited.has(id)) return 220;
      visited.add(id);
      const node = byId.get(id);
      const sz = measureNodeSize(node, depth);
      sizeById.set(id, sz);
      maxHByDepth.set(depth, Math.max(maxHByDepth.get(depth) || 0, sz.h));
      const kids = getVisibleKids(id);
      if (kids.length === 0) {
        subtreeW.set(id, sz.w);
        return sz.w;
      }
      const total = kids.reduce((acc, k) => acc + measureW(k.id, depth + 1), 0) + TREE_H_GAP * (kids.length - 1);
      const w = Math.max(sz.w, total);
      subtreeW.set(id, w);
      return w;
    };
    measureW(root.id, 0);

    const depthY = new Map();
    let accY = 48;
    for (let d = 0; d <= 6; d++) {
      depthY.set(d, accY);
      accY += (maxHByDepth.get(d) || 80) + TREE_V_GAP;
    }

    const placed = new Set();
    const placeW = (id, leftX, depth) => {
      if (placed.has(id)) return;
      placed.add(id);
      const node = byId.get(id);
      const sz = sizeById.get(id) || measureNodeSize(node, depth);
      const myW = subtreeW.get(id) || sz.w;
      const x = leftX + myW / 2 - sz.w / 2;
      const y = depthY.get(depth) || 48 + depth * 150;
      const item = {
        ...node,
        x,
        y,
        w: sz.w,
        h: sz.h,
        depth,
        side: 0,
        branchColor: branchColorById.get(id) || 'crimson',
      };
      positioned.push(item);
      posById.set(id, item);

      const kids = getVisibleKids(id);
      if (kids.length > 0) {
        const kidsTotal = kids.reduce((acc, k) => acc + (subtreeW.get(k.id) || 200), 0) + TREE_H_GAP * (kids.length - 1);
        let cursor = leftX + (myW - kidsTotal) / 2;
        for (const k of kids) {
          const kw = subtreeW.get(k.id) || 200;
          placeW(k.id, cursor, depth + 1);
          cursor += kw + TREE_H_GAP;
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

  const maxX = Math.max(...positioned.map((p) => p.x + p.w), 1100) + 72;
  const maxY = Math.max(...positioned.map((p) => p.y + p.h), 600) + 72;

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
  const [orientation, setOrientation] = useState('mindmap'); // 'mindmap' (bilaterale) | 'tree'
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [zoom, setZoom] = useState(0.72);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const svgRef = useRef(null);
  const canvasBoxRef = useRef(null);

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

  const fitMapToViewport = () => {
    const box = canvasBoxRef.current;
    if (!box || !layout.width || !layout.height) {
      setZoom(0.65);
      setPan({ x: 0, y: 0 });
      return;
    }
    const bw = box.clientWidth || 860;
    const bh = box.clientHeight || 560;
    const pad = 28;
    const scaleX = (bw - pad * 2) / layout.width;
    const scaleY = (bh - pad * 2) / layout.height;
    const nextZoom = Math.max(0.28, Math.min(1.05, Number(Math.min(scaleX, scaleY).toFixed(2))));
    const nextX = Math.round((bw - layout.width * nextZoom) / 2);
    const nextY = Math.round((bh - layout.height * nextZoom) / 2);
    setZoom(nextZoom);
    setPan({ x: nextX, y: nextY });
  };

  useEffect(() => {
    if (!activeMap?.id) return;
    const t = setTimeout(() => fitMapToViewport(), 40);
    return () => clearTimeout(t);
  }, [activeMap?.id, orientation, layout.width, layout.height]);

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
      <div className="p-3.5 sm:p-4 rounded-3xl border border-indigo-500/20 bg-white dark:bg-[#1c1018] shadow-lg shadow-indigo-500/5 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/25">
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
          className="flex-1 px-4 py-2.5 rounded-2xl text-sm bg-slate-100 dark:bg-[#120a10] border border-slate-200 dark:border-[#3e2133] outline-none focus:border-indigo-500 transition"
        />
        <button
          onClick={handleGenerateMap}
          disabled={isGenerating}
          className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition shrink-0"
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
                  : 'bg-white dark:bg-[#1c1018] border-slate-200 dark:border-[#3e2133] hover:border-indigo-400'
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
          <div className="lg:col-span-3 rounded-3xl border border-slate-200 dark:border-[#3e2133] bg-[#fdf7f9] dark:bg-[#120a10] overflow-hidden relative shadow-xl">
            {/* TOP BAR LEGGERA */}
            <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-[#3e2133] bg-white/90 dark:bg-[#1c1018]/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" />
                <span className="font-bold text-xs sm:text-sm truncate">{activeMap.title}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-semibold shrink-0">
                  {activeMap.nodes?.length || 0} nodi
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setOrientation((o) => (o === 'mindmap' ? 'tree' : 'mindmap'))}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#2b1824] hover:bg-indigo-500/15 text-xs font-semibold flex items-center gap-1.5 transition"
                  title="Cambia layout Mappa Mentale Bilaterale / Albero Verticale"
                >
                  {orientation === 'mindmap' ? <Rows3 size={13} className="text-indigo-500" /> : <GitBranch size={13} className="text-indigo-500" />}
                  <span>{orientation === 'mindmap' ? 'Bilaterale' : 'Albero'}</span>
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
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#2b1824] hover:bg-indigo-500/15 text-xs font-semibold flex items-center gap-1.5 transition"
                  title="Modalità Ripasso Attivo: nascondi o mostra i sotto-rami"
                >
                  {collapsedIds.size > 0 ? <Eye size={13} className="text-teal-500" /> : <EyeOff size={13} className="text-amber-500" />}
                  <span className="hidden sm:inline">{collapsedIds.size > 0 ? 'Mostra tutto' : 'Ripasso attivo'}</span>
                </button>
              </div>
            </div>

            {/* LAVAGNA A PUNTINI */}
            <div
              ref={canvasBoxRef}
              onMouseDown={onMouseDownCanvas}
              onMouseMove={onMouseMoveCanvas}
              onMouseUp={onMouseUpCanvas}
              onMouseLeave={onMouseUpCanvas}
              onWheel={onWheelCanvas}
              className={`algor-dot-grid relative ${compact ? 'h-[520px]' : 'h-[620px]'} overflow-hidden select-none ${
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
                      <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity={theme === 'dark' ? '0.45' : '0.07'} />
                    </filter>
                  </defs>

                  {/* CONNETTORI CURVI ORGANICI BILATERALI */}
                  {layout.edges.map((e) => {
                    const isMindmap = orientation === 'mindmap';
                    let x1, y1, x2, y2, d;
                    if (isMindmap) {
                      const goesLeft = e.to.side === -1;
                      x1 = goesLeft ? e.from.x : e.from.x + e.from.w;
                      y1 = e.from.y + e.from.h / 2;
                      x2 = goesLeft ? e.to.x + e.to.w : e.to.x;
                      y2 = e.to.y + e.to.h / 2;
                      const cx = (x1 + x2) / 2;
                      d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
                    } else {
                      x1 = e.from.x + e.from.w / 2;
                      y1 = e.from.y + e.from.h;
                      x2 = e.to.x + e.to.w / 2;
                      y2 = e.to.y;
                      const cy = (y1 + y2) / 2;
                      d = `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
                    }

                    const st = COLOR_STYLES[e.to.branchColor] || COLOR_STYLES.crimson;
                    const strokeColor = theme === 'dark' ? st.border : '#94a3b8';

                    return (
                      <g key={e.id}>
                        <path
                          d={d}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="1.6"
                          strokeOpacity={theme === 'dark' ? '0.55' : '0.7'}
                        />
                      </g>
                    );
                  })}

                  {/* NODI A 4 LIVELLI (RADICE SCURA -> RAMO PIENO -> SOTTONODO PASTELLO -> SCHEDA BIANCA BORDATA) */}
                  {layout.positioned.map((node) => {
                    const st = COLOR_STYLES[node.branchColor] || COLOR_STYLES.crimson;
                    const isSelected = selectedNodeId === node.id;
                    const kidsCount = layout.childCounts.get(node.id) || 0;
                    const isCollapsed = collapsedIds.has(node.id);
                    const displayText = getDisplayText(node, node.depth);

                    let rectFill, rectStroke, rectStrokeW, textColor, fontSize, fontWeight, textTransform;
                    if (node.depth === 0) {
                      rectFill = theme === 'dark' ? '#271422' : '#1e293b';
                      rectStroke = isSelected ? '#fb7185' : theme === 'dark' ? '#f43f5e' : '#0f172a';
                      rectStrokeW = isSelected ? '3' : '2';
                      textColor = '#ffffff';
                      fontSize = '12.5px';
                      fontWeight = 800;
                      textTransform = 'uppercase';
                    } else if (node.depth === 1) {
                      rectFill = st.solid;
                      rectStroke = isSelected ? '#ffffff' : st.solid;
                      rectStrokeW = isSelected ? '3' : '1.5';
                      textColor = '#ffffff';
                      fontSize = '11.5px';
                      fontWeight = 800;
                      textTransform = 'uppercase';
                    } else if (node.depth === 2) {
                      rectFill = theme === 'dark' ? st.darkPastel : st.pastel;
                      rectStroke = isSelected ? '#ffffff' : st.border;
                      rectStrokeW = isSelected ? '2.8' : '1.6';
                      textColor = theme === 'dark' ? st.darkPastelText : st.pastelText;
                      fontSize = '11px';
                      fontWeight = 700;
                      textTransform = 'uppercase';
                    } else {
                      rectFill = theme === 'dark' ? '#1a0f17' : '#ffffff';
                      rectStroke = isSelected ? '#ffffff' : st.border;
                      rectStrokeW = isSelected ? '2.6' : '1.3';
                      textColor = theme === 'dark' ? '#f3e8ee' : '#1e293b';
                      fontSize = '10.5px';
                      fontWeight = 600;
                      textTransform = 'uppercase';
                    }

                    const badgeX =
                      orientation === 'mindmap'
                        ? node.side === -1
                          ? 0
                          : node.side === 1
                            ? node.w
                            : node.w / 2
                        : node.w / 2;
                    const badgeY =
                      orientation === 'mindmap' && node.side !== 0 ? node.h / 2 : node.h;

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
                          width={node.w}
                          height={node.h}
                          rx="11"
                          fill={rectFill}
                          stroke={rectStroke}
                          strokeWidth={rectStrokeW}
                        />
                        <foreignObject x="10" y="6" width={node.w - 20} height={node.h - 12}>
                          <div
                            xmlns="http://www.w3.org/1999/xhtml"
                            style={{
                              color: textColor,
                              fontFamily: '"Plus Jakarta Sans", Inter, sans-serif',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              alignItems: 'center',
                              height: '100%',
                              textAlign: 'center',
                              fontSize,
                              fontWeight,
                              lineHeight: 1.32,
                              letterSpacing: node.depth <= 2 ? '0.02em' : '0.01em',
                              textTransform,
                              wordBreak: 'break-word',
                            }}
                          >
                            {displayText}
                          </div>
                        </foreignObject>

                        {/* Badge espandi / comprimi ramo */}
                        {kidsCount > 0 && node.depth > 0 && (
                          <g
                            transform={`translate(${badgeX}, ${badgeY})`}
                            onClick={(e) => toggleCollapseNode(e, node.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <circle r="9.5" fill={st.solid} stroke={rectFill} strokeWidth="1.8" />
                            <text
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize="10"
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
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-white/95 dark:bg-[#1c1018]/95 backdrop-blur-md border border-slate-200 dark:border-[#3e2133] shadow-xl">
                <button
                  onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.1).toFixed(2))))}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#2b1824] transition"
                  title="Zoom indietro"
                >
                  <ZoomOut size={15} />
                </button>
                <span className="text-[11px] font-bold font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(2))))}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#2b1824] transition"
                  title="Zoom avanti"
                >
                  <ZoomIn size={15} />
                </button>
                <div className="w-px h-4 bg-slate-200 dark:bg-[#3e2133] mx-0.5" />
                <button
                  onClick={fitMapToViewport}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#2b1824] transition"
                  title="Adatta e centra lavagna"
                >
                  <Maximize2 size={15} />
                </button>
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#2b1824] disabled:opacity-30 transition"
                  title="Annulla"
                >
                  <Undo2 size={15} />
                </button>
                <div className="w-px h-4 bg-slate-200 dark:bg-[#3e2133] mx-0.5" />
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
          <div className="rounded-3xl border border-slate-200 dark:border-[#3e2133] bg-white dark:bg-[#1c1018] p-5 space-y-4 shadow-lg">
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#120a10] border border-slate-200 dark:border-[#3e2133] outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-500 dark:text-slate-400">Spiegazione completa</label>
                  <textarea
                    rows={4}
                    value={selectedNode.summary || ''}
                    onChange={(e) => handleUpdateNode(selectedNode.id, { summary: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#120a10] border border-slate-200 dark:border-[#3e2133] outline-none focus:border-indigo-500 resize-none"
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
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#120a10] border border-slate-200 dark:border-[#3e2133] outline-none focus:border-indigo-500"
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
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Network size={28} />
          </div>
          <h3 className="font-extrabold text-base">Trasforma questa lezione in una Mappa Concettuale Interattiva</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Con un clic l&apos;AI organizza i concetti chiave in nodi colorati modificabili, perfetti per memorizzare velocemente e ripassare prima dell&apos;esame.
          </p>
          <button
            onClick={handleGenerateMap}
            disabled={isGenerating}
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 transition"
          >
            {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isGenerating ? 'Generazione in corso...' : 'Crea la tua prima Mappa AI'}
          </button>
        </div>
      )}
    </div>
  );
}
