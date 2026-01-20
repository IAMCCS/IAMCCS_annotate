// IAMCCS Annotate — clean ComfyUI extension with floating button + context menu
console.log('[IAMCCS] Extension file loaded');

// Single-init guard to avoid duplicate loads
if (!window.IAMCCS_ANNOTATE_LOADED) {
  console.log('[IAMCCS] Initializing...');
  window.IAMCCS_ANNOTATE_LOADED = true;
  // Written code by Carmine Cristallo Scalzi (IAMCCS) - AI for debugging - section: Initialization Guard - reason: documents single-run protection preventing duplicate extension setup

  (async () => {
    // Import ComfyUI app (ES module)
    let app;
    try {
      ({ app } = await import('/scripts/app.js'));
      console.log('[IAMCCS] App imported successfully');
    } catch (e) {
      console.error('[IAMCCS] Cannot import /scripts/app.js:', e);
      return;
    }

    const state = {
      enabled: false,
      color: '#ff4444',
      width: 7,
      paths: [], // {points:[{x,y}], color, width} - kept for backward compatibility
      current: null,
  saveWithWorkflow: true,
      // Allow selection/move even when Annotate is OFF
      selOverride: false,
      opacity: 1.0,
      eraser: false,
      constantScreen: false,
      dashed: false,
      hidden: false,
      penOnly: false,
      activePointerId: null,
    hiDPIx2: false,
  // Per-mode memory for brush and opacity
  widthDraw: 7,
  widthErase: 48,
  opacityDraw: 1.0,
  opacityErase: 1.0,
      // Layer system
      currentLayerIdx: 0,
      layers: [{ name: 'Layer 1', visible: true, locked: false, paths: [], style: { color: '#ff4444', dashed: false, widthDraw: 7, widthErase: 48, opacityDraw: 1.0, opacityErase: 1.0 } }],

      // Sticker/post-it objects (Screenshot + Text)
      stickers: [], // {id, x, y, w, h, rot, kind:'image'|'text', dataUrl?, text?, fontFamily?, fontSize?, textColor?, pinned?}
      // Sticker appearance (applies to all stickers in the current graph)
      stickerFrameColor: '#ffffff',
      stickerPaddingPx: 10,
      stickerBorderWidthPx: 2,
      stickerShadow: true,
      stickerShadowStrength: 12,
      shotFlash: null, // {t0:number, rect:{x0,y0,x1,y1}}

      // Direct drag of sticker frame while in draw mode
      stickerDrag: null, // {stickerIdx:number, start:{x,y}, x0:number, y0:number}

      // Resize sticker by corners (Transform tool)
      stickerResize: null, // {stickerIdx:number, corner:'nw'|'ne'|'se'|'sw', start:{x,y}, x0:number, y0:number, w0:number, h0:number, aspect:number, _historyPushed?:boolean}

      // Resize selected items (Transform tool)
      transformDrag: null, // {corner:'nw'|'ne'|'se'|'sw', start:{x,y}, bbox0:{x0,y0,x1,y1}, items:{paths:[], stickers:[]}, aspect:number, _historyPushed?:boolean}

      // Rotate selected items (Rotate tool)
      rotateDrag: null, // {pivot:{x,y}, startAngle:number, angle0:number, items:{paths:[], stickers:[]}, _historyPushed?:boolean}

      // Undo/redo
      undoStack: [],
      redoStack: [],

      // Tools
      tool: 'draw', // 'draw' | 'select' | 'transform' | 'rotate' | 'screenshot' | 'text'
      selectMode: 'rect', // 'rect' | 'lasso'
      transformMode: 'fixed', // 'freeform' | 'fixed'
      selection: null, // {mode, points, rect, selectedPaths, selectedStickers, bbox, dragging...}
      pendingSelection: null, // {tool, kind:'select', mode, start:{x,y}}; created only after drag threshold
      clipboard: null, // {paths:[], stickers:[], bbox}
      lastPointerGraphPos: null,

      // UI timers
      _paletteHideTimer: null,

      // Pin/unpin stickers
      pinMode: false,

      // Text tool
      textFontFamily: 'Arial',
      textFontSize: 28,
      textColor: '#111111',
      textFontWeight: 'normal',
      textFontStyle: 'normal',
      textUnderline: false,
      _textControlsOpen: false,
      textEditor: null, // { stickerId:string, el:HTMLTextAreaElement }
      _textEditorBlurTimer: null,

      // Active graph tracking (root vs subgraph)
      _activeGraphKey: 'root',
      _switchingGraph: false,

      // Local autosave (survive refresh)
      _workflowSig: null,
      _lastAutosaveAt: 0,
      _autosaveTimer: null,
      _autosavePending: null,

      hydrated: false,
      uiShown: false,

      // UI watchdog
      _uiWatchdogId: null,
    };

    const ui = {
      btn: null, // sidebar toggle button
      floating: null, // floating toggle button (fallback/always available)
      widthValue: null, // span for width value
      opacityValue: null,
      eraserBtn: null,
      constantChk: null,
      hiddenChk: null, // hide notes checkbox
      contextMenu: null,
      contextAnchor: null, // { anchor: HTMLElement, dx, dy }
      toastEl: null,
      toastTimer: null,
    };

    function showToast(msg, { ms = 1400, kind = 'info' } = {}) {
      try {
        if (!msg) return;
        if (!ui.toastEl || !document.body.contains(ui.toastEl)) {
          const el = document.createElement('div');
          el.style.cssText = [
            'position:fixed',
            'right:16px',
            'top:16px',
            'z-index:100000',
            'max-width:52vw',
            'padding:10px 12px',
            'border-radius:10px',
            'font:12px/1.25 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
            'color:#fff',
            'box-shadow:0 10px 26px rgba(0,0,0,0.45)',
            'border:1px solid rgba(255,255,255,0.10)',
            'opacity:0',
            'pointer-events:none',
            'transition:opacity 160ms ease',
          ].join(';');
          document.body.appendChild(el);
          ui.toastEl = el;
        }
        const el = ui.toastEl;
        const bg = (kind === 'warn') ? 'rgba(180, 60, 40, 0.92)'
          : (kind === 'ok') ? 'rgba(46, 125, 50, 0.92)'
          : 'rgba(33, 33, 33, 0.92)';
        el.style.background = bg;
        el.textContent = String(msg);
        el.style.opacity = '0';
        if (ui.toastTimer) {
          clearTimeout(ui.toastTimer);
          ui.toastTimer = null;
        }
        requestAnimationFrame(() => { try { el.style.opacity = '1'; } catch {} });
        ui.toastTimer = setTimeout(() => {
          try { el.style.opacity = '0'; } catch {}
        }, Math.max(250, ms | 0));
      } catch {}
    }

  // Offscreen buffer so eraser only affects annotations, not the ComfyUI graph
  let __annoCanvas = null;
  let __annoCtx = null;
  let __annoW = 0, __annoH = 0;

  // Sticker image cache
  const __stickerImageCache = new Map(); // key=dataUrl -> HTMLImageElement

    function loadPos(key, fallback) {
      try {
        const s = localStorage.getItem(key);
        if (!s) return fallback;
        const v = JSON.parse(s);
        if (typeof v?.left === 'number' && typeof v?.top === 'number') return v;
      } catch {}
      return fallback;
    }
    function savePos(key, pos) {
      try { localStorage.setItem(key, JSON.stringify(pos)); } catch {}
    }

    // Store large screenshot sticker images outside of localStorage/workflow JSON.
    // Otherwise ComfyUI's built-in workflow persistence can hit Storage quota and break undo/draw.
    const __IAMCCS_IDB_NAME = 'iamccs_annotate_db_v1';
    const __IAMCCS_IDB_STORE_STICKERS = 'sticker_data_v1';
    const __IAMCCS_IDB_STORE_AUTOSAVE = 'autosave_v1';
    let __iamccsIdbPromise = null;
    const __stickerHydratePending = new Set(); // dataKey strings

    function __openIamccsIdb() {
      try {
        if (__iamccsIdbPromise) return __iamccsIdbPromise;
        __iamccsIdbPromise = new Promise((resolve, reject) => {
          try {
            const req = indexedDB.open(__IAMCCS_IDB_NAME, 1);
            req.onupgradeneeded = () => {
              try {
                const db = req.result;
                if (!db.objectStoreNames.contains(__IAMCCS_IDB_STORE_STICKERS)) {
                  db.createObjectStore(__IAMCCS_IDB_STORE_STICKERS);
                }
                if (!db.objectStoreNames.contains(__IAMCCS_IDB_STORE_AUTOSAVE)) {
                  db.createObjectStore(__IAMCCS_IDB_STORE_AUTOSAVE);
                }
              } catch {}
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          } catch (e) {
            reject(e);
          }
        });
        return __iamccsIdbPromise;
      } catch {
        return Promise.reject(new Error('IndexedDB not available'));
      }
    }

    function __idbGet(storeName, key) {
      return __openIamccsIdb().then((db) => new Promise((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const st = tx.objectStore(storeName);
          const req = st.get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })).catch(() => null);
    }

    function __idbSet(storeName, key, value) {
      return __openIamccsIdb().then((db) => new Promise((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readwrite');
          const st = tx.objectStore(storeName);
          const req = st.put(value, key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      })).catch(() => false);
    }

    function __idbDel(storeName, key) {
      return __openIamccsIdb().then((db) => new Promise((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readwrite');
          const st = tx.objectStore(storeName);
          const req = st.delete(key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      })).catch(() => false);
    }

    function __idbGetAllKeys(storeName) {
      return __openIamccsIdb().then((db) => new Promise((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const st = tx.objectStore(storeName);

          if (typeof st.getAllKeys === 'function') {
            const req = st.getAllKeys();
            req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
            req.onerror = () => resolve([]);
            return;
          }

          const out = [];
          const cur = st.openKeyCursor();
          cur.onsuccess = () => {
            try {
              const c = cur.result;
              if (!c) return resolve(out);
              out.push(c.key);
              c.continue();
            } catch {
              resolve(out);
            }
          };
          cur.onerror = () => resolve(out);
        } catch {
          resolve([]);
        }
      })).catch(() => []);
    }

    async function purgeOldStickerScreenshotCacheForCurrentWorkflow({ skipConfirm = false } = {}) {
      try {
        const ns = ensureWorkflowBlobNamespace();
        const gk = getActiveGraphKey();
        const prefix = `sticker:${String(ns)}:${String(gk)}:`;

        const used = new Set();
        try {
          for (const st of (state.stickers || [])) {
            if (!st || isTextSticker(st)) continue;
            if (typeof st.dataKey === 'string' && st.dataKey.startsWith(prefix)) used.add(st.dataKey);
          }
        } catch {}

        const allKeys = await __idbGetAllKeys(__IAMCCS_IDB_STORE_STICKERS);
        const candidates = (allKeys || []).filter((k) => typeof k === 'string' && k.startsWith(prefix) && !used.has(k));

        if (!candidates.length) {
          showToast('No old screenshots to purge', { kind: 'ok', ms: 1600 });
          return { deleted: 0, candidates: 0 };
        }

        if (!skipConfirm) {
          const ok = confirm(`Purge ${candidates.length} old cached screenshot(s) for this workflow?\n\nThis only removes deleted/unused screenshots from the browser cache (IndexedDB).`);
          if (!ok) return { deleted: 0, candidates: candidates.length, canceled: true };
        }

        let deleted = 0;
        const chunkSize = 25;
        for (let i = 0; i < candidates.length; i += chunkSize) {
          const chunk = candidates.slice(i, i + chunkSize);
          const res = await Promise.all(chunk.map((k) => __idbDel(__IAMCCS_IDB_STORE_STICKERS, k)));
          deleted += res.filter(Boolean).length;
        }

        showToast(`Purged ${deleted} old screenshot(s)`, { kind: 'ok', ms: 1800 });
        return { deleted, candidates: candidates.length };
      } catch (e) {
        console.warn('[IAMCCS] purgeOldStickerScreenshotCacheForCurrentWorkflow failed:', e);
        showToast('Purge failed (see console)', { kind: 'warn', ms: 2200 });
        return { deleted: 0, candidates: 0, error: true };
      }
    }

    function ensureWorkflowBlobNamespace() {
      try {
        if (state.saveWithWorkflow && app?.graph) {
          app.graph.extra = app.graph.extra || {};
          const k = 'iamccs_annotate_blob_ns';
          if (!app.graph.extra[k]) app.graph.extra[k] = `blns_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          return String(app.graph.extra[k]);
        }
      } catch {}
      try { if (!state._workflowSig) state._workflowSig = computeWorkflowSignature(); } catch {}
      return String(state._workflowSig || 'unknown');
    }

    function stickerDataKeyForId(stickerId) {
      try {
        const ns = ensureWorkflowBlobNamespace();
        const gk = getActiveGraphKey();
        return `sticker:${ns}:${gk}:${String(stickerId || '')}`;
      } catch {
        return null;
      }
    }

    function requestHydrateStickerData(stickerId, dataKey) {
      try {
        if (!stickerId || !dataKey) return;
        const k = String(dataKey);
        if (__stickerHydratePending.has(k)) return;
        __stickerHydratePending.add(k);
        __idbGet(__IAMCCS_IDB_STORE_STICKERS, k).then((val) => {
          try {
            __stickerHydratePending.delete(k);
            if (typeof val !== 'string' || !val) return;
            const idx = getStickerIdxById(stickerId);
            const st = idx >= 0 ? state.stickers?.[idx] : null;
            if (!st) return;
            if (st.dataKey !== k) return;
            if (st.dataUrl) return;
            st.dataUrl = val;
            try { app?.canvas?.setDirty(true, true); } catch {}
          } catch {}
        });
      } catch {}
    }

    const __IAMCCS_AUTOSAVE_NS = 'iamccs_annotations_autosave_v2';

    // Legacy migration: older versions stored autosave payloads in localStorage.
    // Large payloads (or many workflows) can fill quota and break ComfyUI workflow persistence.
    // We now store autosave in IndexedDB and migrate legacy keys to free quota WITHOUT data loss.
    async function migrateLegacyAutosaveLocalStorageToIdb({ removeAfter = true } = {}) {
      try {
        const prefix = `${__IAMCCS_AUTOSAVE_NS}:`;
        const keys = [];
        for (let i = 0; i < (localStorage?.length || 0); i++) {
          const k = localStorage.key(i);
          if (k && typeof k === 'string' && k.startsWith(prefix)) keys.push(k);
        }
        if (!keys.length) return { found: 0, migrated: 0, removed: 0 };

        let migrated = 0;
        let removed = 0;
        for (const k of keys) {
          try {
            const s = localStorage.getItem(k);
            if (!s) {
              if (removeAfter) {
                try { localStorage.removeItem(k); removed++; } catch {}
              }
              continue;
            }
            let v = null;
            try { v = JSON.parse(s); } catch { v = null; }
            if (v && typeof v === 'object') {
              const ok = await __idbSet(__IAMCCS_IDB_STORE_AUTOSAVE, k, v);
              if (ok) migrated++;
              if (ok && removeAfter) {
                try { localStorage.removeItem(k); removed++; } catch {}
              }
            }
          } catch {}
        }
        console.log(`[IAMCCS] Migrated legacy autosaves: found=${keys.length}, migrated=${migrated}, removed=${removed}`);
        return { found: keys.length, migrated, removed };
      } catch {
        return { found: 0, migrated: 0, removed: 0, error: true };
      }
    }

    function djb2Hash(str) {
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
      return (h >>> 0).toString(16);
    }

    function computeWorkflowSignature() {
      try {
        const g = app?.graph;
        if (!g || typeof g.serialize !== 'function') return 'unknown';
        const wf0 = g.serialize();
        if (!wf0 || typeof wf0 !== 'object') return 'unknown';

        // Work on a copy so we never mutate the serialized object (some implementations
        // may share references like `extra` with the live graph).
        const wf = (() => {
          try {
            const extra0 = (wf0.extra && typeof wf0.extra === 'object') ? wf0.extra : null;
            const extra = extra0 ? { ...extra0 } : undefined;
            return { ...wf0, ...(extra ? { extra } : {}) };
          } catch {
            return wf0;
          }
        })();

        // Remove our own payload so signature doesn't change when annotations change
        try {
          if (wf.extra && typeof wf.extra === 'object') {
            delete wf.extra.iamccs_annotations;
            delete wf.extra.iamccs_annotations_multi;
          }
        } catch {}

        // IMPORTANT:
        // Previous versions hashed only (node types + links). Two different workflows with the same
        // topology could collide and reuse the same local autosave, leaking layers/options across workflows.
        // Hash the full workflow serialization (minus our extra) to make the signature truly per-workflow.
        let base = '';
        try {
          base = JSON.stringify(wf);
        } catch {
          // Fallback if stringify fails for any reason
          const nodes = Array.isArray(wf.nodes) ? wf.nodes.map(n => `${n?.id}:${n?.type}`) : [];
          nodes.sort();
          const links = Array.isArray(wf.links) ? wf.links.map(l => Array.isArray(l) ? l.join(':') : String(l)) : [];
          links.sort();
          base = nodes.join('|') + '||' + links.join('|');
        }
        return djb2Hash(base);
      } catch {
        return 'unknown';
      }
    }

    function getAutosaveKey(graphKey) {
      const sig = state._workflowSig || (state._workflowSig = computeWorkflowSignature());
      const gk = String(graphKey || getActiveGraphKey() || 'root');
      return `${__IAMCCS_AUTOSAVE_NS}:${sig}:${gk}`;
    }

    function flushLocalAutosave() {
      try {
        const pending = state._autosavePending;
        if (!pending) return;
        state._autosavePending = null;
        state._lastAutosaveAt = Date.now();
        const key = getAutosaveKey(state._activeGraphKey);
        // Store autosave in IndexedDB (not localStorage) to avoid impacting ComfyUI persistence.
        try { __idbSet(__IAMCCS_IDB_STORE_AUTOSAVE, key, { savedAt: state._lastAutosaveAt, payload: pending }); } catch {}
      } catch {}
    }

    function scheduleLocalAutosave(payload, { immediate = false } = {}) {
      try {
        state._autosavePending = payload;
        const now = Date.now();
        if (immediate || (now - (state._lastAutosaveAt || 0) > 250)) {
          flushLocalAutosave();
          return;
        }
        if (state._autosaveTimer) return;
        state._autosaveTimer = setTimeout(() => {
          state._autosaveTimer = null;
          flushLocalAutosave();
        }, 280);
      } catch {}
    }

    function readLocalAutosaveLegacy(graphKey) {
      try {
        const key = getAutosaveKey(graphKey);
        const s = localStorage.getItem(key);
        if (!s) return null;
        const v = JSON.parse(s);
        if (v && typeof v === 'object' && v.payload && typeof v.payload === 'object') return v.payload;
      } catch {}
      return null;
    }

    async function readLocalAutosaveAsync(graphKey) {
      try {
        const key = getAutosaveKey(graphKey);
        const v = await __idbGet(__IAMCCS_IDB_STORE_AUTOSAVE, key);
        if (v && typeof v === 'object' && v.payload && typeof v.payload === 'object') return v.payload;
      } catch {}
      // Fallback for older installations that still have localStorage autosaves.
      return readLocalAutosaveLegacy(graphKey);
    }

    function normalizeRect(r) {
      if (!r) return null;
      const x0 = Math.min(r.x0, r.x1);
      const y0 = Math.min(r.y0, r.y1);
      const x1 = Math.max(r.x0, r.x1);
      const y1 = Math.max(r.y0, r.y1);
      return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    }

    function bboxUnion(a, b) {
      if (!a) return b;
      if (!b) return a;
      return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
    }

    function pointInRect(p, r) {
      if (!p || !r) return false;
      return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
    }

    function pathBBox(path) {
      if (!path || !Array.isArray(path.points) || !path.points.length) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const pt of path.points) {
        if (!pt) continue;
        if (pt.x < x0) x0 = pt.x;
        if (pt.y < y0) y0 = pt.y;
        if (pt.x > x1) x1 = pt.x;
        if (pt.y > y1) y1 = pt.y;
      }
      if (!isFinite(x0)) return null;
      return { x0, y0, x1, y1 };
    }

    function roundedRectPath(ctx, x, y, w, h, r) {
      const rr = Math.max(0, Math.min(r || 0, Math.min(w, h) / 2));
      ctx.beginPath();
      if (rr <= 0.001) {
        ctx.rect(x, y, w, h);
        return;
      }
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    function rectIntersects(a, b) {
      if (!a || !b) return false;
      return !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
    }

    function rectCenter(r) {
      if (!r) return null;
      return { x: (r.x0 + r.x1) * 0.5, y: (r.y0 + r.y1) * 0.5 };
    }

    function pointInPolygon(pt, poly) {
      if (!pt || !Array.isArray(poly) || poly.length < 3) return false;
      // Ray casting
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
          (pt.x < ((xj - xi) * (pt.y - yi)) / ((yj - yi) || 1e-9) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    function clonePath(path) {
      return {
        color: path.color,
        width: path.width,
        opacity: path.opacity,
        mode: path.mode,
        dashed: !!path.dashed,
        parentStickerId: (typeof path.parentStickerId === 'string' && path.parentStickerId) ? path.parentStickerId : undefined,
        points: Array.isArray(path.points) ? path.points.map(p => ({ x: p.x, y: p.y })) : [],
      };
    }

    function cloneSticker(st) {
      return {
        id: st.id,
        x: st.x,
        y: st.y,
        w: st.w,
        h: st.h,
        rot: typeof st.rot === 'number' ? st.rot : 0,
        pinned: !!st.pinned,
        parentStickerId: (typeof st.parentStickerId === 'string' && st.parentStickerId) ? st.parentStickerId : undefined,
        kind: (st.kind === 'text') ? 'text'
          : (st.kind === 'image') ? 'image'
          : ((typeof st.text === 'string' && !st.dataUrl && !st.dataKey) ? 'text' : 'image'),
        dataUrl: st.dataUrl,
        dataKey: (typeof st.dataKey === 'string') ? st.dataKey : undefined,
        text: (typeof st.text === 'string') ? st.text : '',
        fontFamily: (typeof st.fontFamily === 'string') ? st.fontFamily : undefined,
        fontSize: (typeof st.fontSize === 'number') ? st.fontSize : undefined,
        textColor: (typeof st.textColor === 'string') ? st.textColor : undefined,
        fontWeight: (typeof st.fontWeight === 'string') ? st.fontWeight : undefined,
        fontStyle: (typeof st.fontStyle === 'string') ? st.fontStyle : undefined,
        underline: !!st.underline,
      };
    }

    const __HISTORY_LIMIT = 60;
    function __deepCloneJson(obj) {
      return JSON.parse(JSON.stringify(obj));
    }

    function buildHistorySnapshot() {
      return {
        layers: state.layers,
        currentLayerIdx: state.currentLayerIdx,
        stickers: state.stickers,
      };
    }

    function applyHistorySnapshot(snap) {
      if (!snap || typeof snap !== 'object') return false;
      try {
        state.current = null;
        state.selection = null;
        state.stickerDrag = null;

        state.layers = Array.isArray(snap.layers) ? __deepCloneJson(snap.layers) : state.layers;
        state.currentLayerIdx = (typeof snap.currentLayerIdx === 'number') ? snap.currentLayerIdx : 0;
        state.stickers = Array.isArray(snap.stickers) ? __deepCloneJson(snap.stickers) : [];

        // Refresh flat paths for backward compatibility
        state.paths = [];
        for (const lyr of state.layers) for (const p of (lyr.paths || [])) state.paths.push(p);

        // Clamp layer index
        if (state.currentLayerIdx >= state.layers.length) state.currentLayerIdx = Math.max(0, state.layers.length - 1);

        try { applyLayerStyleToState(); } catch {}
        try { syncUI(); } catch {}
        try { syncBrushOpacityUI(); } catch {}
        try { syncToolsUI(); } catch {}
        try { syncStickerUI(); } catch {}

        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true);
        return true;
      } catch (e) {
        console.warn('[IAMCCS] applyHistorySnapshot failed:', e);
        return false;
      }
    }

    function pushHistorySnapshot() {
      try {
        if (state._switchingGraph) return;
        if (state._historyApplying) return;
        const snap = __deepCloneJson(buildHistorySnapshot());
        state.undoStack = state.undoStack || [];
        state.redoStack = state.redoStack || [];
        state.undoStack.push(snap);
        if (state.undoStack.length > __HISTORY_LIMIT) state.undoStack.shift();
        state.redoStack.length = 0;
      } catch {}
    }

    function doUndo() {
      try {
        const undo = state.undoStack || [];
        if (!undo.length) return false;
        const current = __deepCloneJson(buildHistorySnapshot());
        const prev = undo.pop();
        state.redoStack = state.redoStack || [];
        state.redoStack.push(current);
        state._historyApplying = true;
        const ok = applyHistorySnapshot(prev);
        state._historyApplying = false;
        return ok;
      } catch {
        state._historyApplying = false;
        return false;
      }
    }

    function doRedo() {
      try {
        const redo = state.redoStack || [];
        if (!redo.length) return false;
        const current = __deepCloneJson(buildHistorySnapshot());
        const next = redo.pop();
        state.undoStack = state.undoStack || [];
        state.undoStack.push(current);
        if (state.undoStack.length > __HISTORY_LIMIT) state.undoStack.shift();
        state._historyApplying = true;
        const ok = applyHistorySnapshot(next);
        state._historyApplying = false;
        return ok;
      } catch {
        state._historyApplying = false;
        return false;
      }
    }

    function startUIWatchdog() {
      try {
        if (state._uiWatchdogId) return;
        state._uiWatchdogId = setInterval(() => {
          try {
            if (!ui.floating || !document.body.contains(ui.floating)) {
              ensureFloatingToggle();
              state.uiShown = true;
            }
          } catch {}
        }, 1500);
      } catch {}
    }

    function hitTestStickerBorder(graphPos, canvas, borderCssPx = 7) {
      if (!graphPos || !canvas || !Array.isArray(state.stickers) || !state.stickers.length) return -1;
      const ds = canvas?.ds || canvas?.viewport || { scale: canvas?.scale || 1 };
      const sc = (ds.scale || 1);
      const thrG = Math.max(0.5, borderCssPx / sc);
      for (let i = state.stickers.length - 1; i >= 0; i--) {
        const st = state.stickers[i];
        if (!st) continue;
        if (!isTextStickerVisible(st)) continue;
        const w = typeof st.w === 'number' ? st.w : 0;
        const h = typeof st.h === 'number' ? st.h : 0;
        if (w <= 1 || h <= 1) continue;
        const rot = (typeof st.rot === 'number') ? st.rot : 0;
        const cx = (typeof st.x === 'number' ? st.x : 0) + w / 2;
        const cy = (typeof st.y === 'number' ? st.y : 0) + h / 2;

        const dx = graphPos.x - cx;
        const dy = graphPos.y - cy;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        // rotate by -rot into local sticker space
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;

        const hw = w / 2;
        const hh = h / 2;
        if (Math.abs(lx) > hw || Math.abs(ly) > hh) continue;
        const distToEdge = Math.min(hw - Math.abs(lx), hh - Math.abs(ly));
        if (distToEdge <= thrG) return i;
      }
      return -1;
    }

    function movementThresholdGraph(canvas, cssPx = 6) {
      const ds = canvas?.ds || canvas?.viewport || { scale: canvas?.scale || 1 };
      const sc = (ds.scale || 1);
      return Math.max(1e-3, cssPx / sc);
    }

    function schedulePaletteAutoHide(sourceEl) {
      try {
        if (state._paletteHideTimer) clearTimeout(state._paletteHideTimer);
        state._paletteHideTimer = setTimeout(() => {
          // Auto-hide should close only the native color picker (palette), not the whole options panel.
          // Blurring the <input type="color"> is enough; do NOT close context menu / options UI.
          try {
            if (sourceEl && typeof sourceEl.blur === 'function') sourceEl.blur();
          } catch {}
        }, 5000);
      } catch {}
    }

    function hitTestStickerCorner(graphPos, canvas, cornerCssPx = 10) {
      if (!graphPos || !canvas || !Array.isArray(state.stickers) || !state.stickers.length) return null;
      const ds = canvas?.ds || canvas?.viewport || { scale: canvas?.scale || 1 };
      const sc = (ds.scale || 1);
      const thrG = Math.max(0.5, cornerCssPx / sc);
      for (let i = state.stickers.length - 1; i >= 0; i--) {
        const st = state.stickers[i];
        if (!st) continue;
        if (!isTextStickerVisible(st)) continue;
        const w = typeof st.w === 'number' ? st.w : 0;
        const h = typeof st.h === 'number' ? st.h : 0;
        if (w <= 1 || h <= 1) continue;
        const rot = (typeof st.rot === 'number') ? st.rot : 0;
        const cx = (typeof st.x === 'number' ? st.x : 0) + w / 2;
        const cy = (typeof st.y === 'number' ? st.y : 0) + h / 2;
        const c = Math.cos(rot);
        const s = Math.sin(rot);

        const localCorners = [
          { c: 'nw', x: -w / 2, y: -h / 2 },
          { c: 'ne', x: w / 2, y: -h / 2 },
          { c: 'se', x: w / 2, y: h / 2 },
          { c: 'sw', x: -w / 2, y: h / 2 },
        ];
        for (const k of localCorners) {
          const gx = cx + (k.x * c - k.y * s);
          const gy = cy + (k.x * s + k.y * c);
          if (Math.abs(graphPos.x - gx) <= thrG && Math.abs(graphPos.y - gy) <= thrG) return { stickerIdx: i, corner: k.c };
        }
      }
      return null;
    }

    function hitTestStickerInside(graphPos, canvas) {
      if (!graphPos || !canvas || !Array.isArray(state.stickers) || !state.stickers.length) return -1;
      for (let i = state.stickers.length - 1; i >= 0; i--) {
        const st = state.stickers[i];
        if (!st) continue;
        if (!isTextStickerVisible(st)) continue;
        const w = typeof st.w === 'number' ? st.w : 0;
        const h = typeof st.h === 'number' ? st.h : 0;
        if (w <= 1 || h <= 1) continue;
        const rot = (typeof st.rot === 'number') ? st.rot : 0;
        const cx = (typeof st.x === 'number' ? st.x : 0) + w / 2;
        const cy = (typeof st.y === 'number' ? st.y : 0) + h / 2;

        const dx = graphPos.x - cx;
        const dy = graphPos.y - cy;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        const hw = w / 2;
        const hh = h / 2;
        if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return i;
      }
      return -1;
    }

    function isImageSticker(st) {
      if (!st) return false;
      if (st.kind === 'image') return true;
      if (st.kind === 'text') return false;
      return (!!st.dataUrl || !!st.dataKey) && !isTextSticker(st);
    }

    function hitTestImageStickerInside(graphPos, canvas) {
      if (!graphPos || !canvas || !Array.isArray(state.stickers) || !state.stickers.length) return -1;
      for (let i = state.stickers.length - 1; i >= 0; i--) {
        const st = state.stickers[i];
        if (!st) continue;
        if (!isImageSticker(st)) continue;
        if (!isTextStickerVisible(st)) continue;
        const w = typeof st.w === 'number' ? st.w : 0;
        const h = typeof st.h === 'number' ? st.h : 0;
        if (w <= 1 || h <= 1) continue;
        const rot = (typeof st.rot === 'number') ? st.rot : 0;
        const cx = (typeof st.x === 'number' ? st.x : 0) + w / 2;
        const cy = (typeof st.y === 'number' ? st.y : 0) + h / 2;

        const dx = graphPos.x - cx;
        const dy = graphPos.y - cy;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        const hw = w / 2;
        const hh = h / 2;
        if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return i;
      }
      return -1;
    }

    function collectAnchoredChildrenSnapshot(parentStickerId, { skipStickerIds, skipPathKeys } = {}) {
      const snap = { paths: [], stickers: [] };
      if (!parentStickerId) return snap;

      const skipSt = skipStickerIds || null;
      const skipPk = skipPathKeys || null;

      // Paths anchored to parentStickerId
      for (let li = 0; li < (state.layers?.length || 0); li++) {
        const layer = state.layers[li];
        if (!layer || !Array.isArray(layer.paths)) continue;
        for (let pi = 0; pi < layer.paths.length; pi++) {
          const p = layer.paths[pi];
          if (!p) continue;
          if (p.parentStickerId !== parentStickerId) continue;
          const key = `${li}:${pi}`;
          if (skipPk && skipPk.has(key)) continue;
          snap.paths.push({
            layerIdx: li,
            pathIdx: pi,
            points0: Array.isArray(p.points) ? p.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
          });
        }
      }

      // Stickers anchored to parentStickerId
      for (let si = 0; si < (state.stickers?.length || 0); si++) {
        const st = state.stickers[si];
        if (!st) continue;
        if (st.id === parentStickerId) continue;
        if (st.parentStickerId !== parentStickerId) continue;
        if (skipSt && st.id && skipSt.has(st.id)) continue;
        snap.stickers.push({
          stickerIdx: si,
          x0: st.x,
          y0: st.y,
          w0: st.w,
          h0: st.h,
          rot0: (typeof st.rot === 'number') ? st.rot : 0,
        });
      }

      return snap;
    }

    function applyAnchoredSnapshotDelta(snap, dx, dy) {
      if (!snap) return;

      for (const it of (snap.paths || [])) {
        const layer = state.layers?.[it.layerIdx];
        const p = layer?.paths?.[it.pathIdx];
        if (!p || !Array.isArray(it.points0)) continue;
        p.points = it.points0.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
      }

      for (const it of (snap.stickers || [])) {
        const st = state.stickers?.[it.stickerIdx];
        if (!st) continue;
        st.x = it.x0 + dx;
        st.y = it.y0 + dy;
      }
    }

    function applyAnchoredSnapshotStickerResize(snap, parent0, parent1) {
      if (!snap || !parent0 || !parent1) return;
      const w0 = Number(parent0.w) || 0;
      const h0 = Number(parent0.h) || 0;
      const w1 = Number(parent1.w) || 0;
      const h1 = Number(parent1.h) || 0;
      if (w0 <= 1e-6 || h0 <= 1e-6 || w1 <= 1e-6 || h1 <= 1e-6) return;

      const rot = (typeof parent0.rot === 'number') ? parent0.rot : ((typeof parent1.rot === 'number') ? parent1.rot : 0);
      const c0 = { x: (Number(parent0.x) || 0) + w0 / 2, y: (Number(parent0.y) || 0) + h0 / 2 };
      const c1 = { x: (Number(parent1.x) || 0) + w1 / 2, y: (Number(parent1.y) || 0) + h1 / 2 };
      const sx = w1 / w0;
      const sy = h1 / h0;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);

      const mapPoint = (pt0) => {
        const dx = pt0.x - c0.x;
        const dy = pt0.y - c0.y;
        // local coords (unrotate)
        const lx0 = dx * cr + dy * sr;
        const ly0 = -dx * sr + dy * cr;
        // scale in local coords
        const lx1 = lx0 * sx;
        const ly1 = ly0 * sy;
        // rotate back
        const wx = lx1 * cr - ly1 * sr;
        const wy = lx1 * sr + ly1 * cr;
        return { x: c1.x + wx, y: c1.y + wy };
      };

      // Paths
      for (const it of (snap.paths || [])) {
        const layer = state.layers?.[it.layerIdx];
        const p = layer?.paths?.[it.pathIdx];
        if (!p || !Array.isArray(it.points0)) continue;
        p.points = it.points0.map(mapPoint);
      }

      // Stickers
      for (const it of (snap.stickers || [])) {
        const st = state.stickers?.[it.stickerIdx];
        if (!st) continue;
        const sw0 = Number(it.w0) || Number(st.w) || 0;
        const sh0 = Number(it.h0) || Number(st.h) || 0;
        const cc0 = { x: (Number(it.x0) || 0) + sw0 / 2, y: (Number(it.y0) || 0) + sh0 / 2 };
        const cc1 = mapPoint(cc0);
        const sw1 = Math.max(5, sw0 * sx);
        const sh1 = Math.max(5, sh0 * sy);
        st.w = sw1;
        st.h = sh1;
        st.x = cc1.x - sw1 / 2;
        st.y = cc1.y - sh1 / 2;
        // No rotation delta during resize; keep original rotation
        if (typeof it.rot0 === 'number') st.rot = it.rot0;
      }
    }

    function hitTestBBoxCorner(graphPos, bbox, canvas, cornerCssPx = 10) {
      if (!graphPos || !bbox || !canvas) return null;
      const dpr = getCanvasEffectiveDpr(canvas);
      const thr = Math.max(1, cornerCssPx * dpr);
      const p = graphToCanvasPx(graphPos, canvas);
      const r = graphRectToCanvasPxRect(bbox, canvas);
      if (!r) return null;
      const corners = [
        { c: 'nw', x: r.x, y: r.y },
        { c: 'ne', x: r.x + r.w, y: r.y },
        { c: 'se', x: r.x + r.w, y: r.y + r.h },
        { c: 'sw', x: r.x, y: r.y + r.h },
      ];
      for (const k of corners) {
        if (Math.abs(p.x - k.x) <= thr && Math.abs(p.y - k.y) <= thr) return k.c;
      }
      return null;
    }

    function getCanvasEffectiveDpr(canvas) {
      try {
        const el = canvas?.canvas || canvas;
        if (!el || typeof el.getBoundingClientRect !== 'function') return (window.devicePixelRatio || 1);
        const r = el.getBoundingClientRect();
        const cssW = Number(r?.width) || 0;
        const cssH = Number(r?.height) || 0;
        const pxW = Number(el.width) || 0;
        const pxH = Number(el.height) || 0;
        if (cssW > 0 && pxW > 0) return pxW / cssW;
        if (cssH > 0 && pxH > 0) return pxH / cssH;
      } catch {}
      return (window.devicePixelRatio || 1);
    }

    function graphToCanvasPx(pt, canvas, dprOverride) {
      const ds = canvas?.ds || canvas?.viewport || { scale: canvas?.scale || 1, offset: canvas?.offset || [0, 0] };
      const dpr = (typeof dprOverride === 'number' ? dprOverride : getCanvasEffectiveDpr(canvas));
      const sc = ds.scale || 1;
      const off0 = ds.offset?.[0] || 0;
      const off1 = ds.offset?.[1] || 0;
      return {
        // In litegraph: screen = (graph + offset) * scale
        x: ((pt.x + off0) * sc) * dpr,
        y: ((pt.y + off1) * sc) * dpr,
      };
    }

    function graphRectToCanvasPxRect(rectGraph, canvas) {
      const r = normalizeRect(rectGraph);
      if (!r) return null;
      const p0 = graphToCanvasPx({ x: r.x0, y: r.y0 }, canvas);
      const p1 = graphToCanvasPx({ x: r.x1, y: r.y1 }, canvas);
      const x = Math.min(p0.x, p1.x);
      const y = Math.min(p0.y, p1.y);
      const w = Math.max(1, Math.abs(p1.x - p0.x));
      const h = Math.max(1, Math.abs(p1.y - p0.y));
      return { x, y, w, h };
    }

    function cropCanvasToDataUrl(canvasEl, rectPx) {
      if (!canvasEl || !rectPx) return null;
      const sx = Math.max(0, Math.floor(rectPx.x));
      const sy = Math.max(0, Math.floor(rectPx.y));
      const sw = Math.max(1, Math.floor(rectPx.w));
      const sh = Math.max(1, Math.floor(rectPx.h));
      const maxW = canvasEl.width | 0;
      const maxH = canvasEl.height | 0;
      const cw = Math.max(1, Math.min(sw, maxW - sx));
      const ch = Math.max(1, Math.min(sh, maxH - sy));
      if (cw <= 1 || ch <= 1) return null;
      const tmp = document.createElement('canvas');
      tmp.width = cw;
      tmp.height = ch;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(canvasEl, sx, sy, cw, ch, 0, 0, cw, ch);
      return tmp.toDataURL('image/png');
    }

    function newStickerId() {
      return `st_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function isTextSticker(st) {
      if (!st) return false;
      if (st.kind === 'text') return true;
      // Only infer text when there is no image payload (dataUrl or dataKey)
      return (typeof st.text === 'string' && !st.dataUrl && !st.dataKey);
    }

    function findTextLayerIndexByStickerId(stickerId) {
      if (!stickerId) return -1;
      for (let i = 0; i < (state.layers?.length || 0); i++) {
        const lyr = state.layers[i];
        if (lyr && lyr.kind === 'text' && lyr.textStickerId === stickerId) return i;
      }
      return -1;
    }

    function isTextStickerVisible(st) {
      if (!st || !isTextSticker(st)) return true;
      const li = findTextLayerIndexByStickerId(st.id);
      if (li < 0) return true;
      const lyr = state.layers?.[li];
      return lyr?.visible !== false;
    }

    function nextTextLayerName() {
      let maxN = 0;
      for (const lyr of (state.layers || [])) {
        const name = String(lyr?.name || '');
        const m = name.match(/^Text Layer\s+(\d+)$/i);
        if (!m) continue;
        const n = parseInt(m[1], 10);
        if (isFinite(n)) maxN = Math.max(maxN, n);
      }
      return `Text Layer ${maxN + 1}`;
    }

    function syncTextLayerFromStateColor(layerIdx) {
      const li = (typeof layerIdx === 'number') ? layerIdx : state.currentLayerIdx;
      const lyr = state.layers?.[li];
      if (!lyr || lyr.kind !== 'text') return false;
      lyr.style = lyr.style || {};
      lyr.style.color = state.color;
      const sid = lyr.textStickerId;
      if (sid) {
        const si = getStickerIdxById(sid);
        const st = si >= 0 ? state.stickers?.[si] : null;
        if (st && isTextSticker(st)) {
          st.textColor = state.color;
          if (state.textEditor?.stickerId === sid && state.textEditor?.el) {
            state.textEditor.el.style.color = state.color;
          }
        }
      }
      persistToGraphExtra();
      app?.canvas?.setDirty(true, true);
      return true;
    }

    function getStickerIdxById(stickerId) {
      if (!stickerId) return -1;
      const arr = state.stickers || [];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].id === stickerId) return i;
      }
      return -1;
    }

    function closeTextEditor({ commit = true } = {}) {
      let closedStickerIdx = -1;
      try {
        try {
          if (state._textEditorBlurTimer) {
            clearTimeout(state._textEditorBlurTimer);
            state._textEditorBlurTimer = null;
          }
        } catch {}
        const te = state.textEditor;
        if (!te || !te.el) {
          state.textEditor = null;
          return;
        }
        const el = te.el;
        const idx = getStickerIdxById(te.stickerId);
        const st = idx >= 0 ? state.stickers[idx] : null;
        closedStickerIdx = idx;
        if (commit && st && isTextSticker(st)) {
          st.text = String(el.value || '');
          persistToGraphExtra(true);
        }
        try { el.remove(); } catch {}
      } catch {}
      state.textEditor = null;
      // UX: after typing, go back to Select tool
      try {
        if (commit && state.tool === 'text') setTool('select');
      } catch {}

      // UX: after closing editor, select that text sticker immediately
      try {
        if (commit && closedStickerIdx >= 0) {
          const st = state.stickers?.[closedStickerIdx];
          const bb = stickerBBox(st);
          if (bb) {
            state.selection = {
              kind: 'select',
              mode: 'rect',
              points: [],
              rect: null,
              bbox: bb,
              selectedPaths: [],
              selectedStickers: [{ stickerIdx: closedStickerIdx, bbox: bb }],
              dragging: false,
            };
          }
        }
      } catch {}
      try { app?.canvas?.setDirty(true, true); } catch {}
    }

    function openTextEditorForStickerId(stickerId, canvas) {
      // Close any existing editor first
      closeTextEditor({ commit: true });
      const idx = getStickerIdxById(stickerId);
      const st = idx >= 0 ? state.stickers[idx] : null;
      if (!st || !isTextSticker(st)) return;

      // If linked to a Text Layer, select it so palette changes affect this text
      try {
        const li = findTextLayerIndexByStickerId(stickerId);
        if (li >= 0) setCurrentLayer(li);
      } catch {}

      // Sync global Text tool settings to this sticker (so UI reflects current style)
      try {
        if (typeof st.fontFamily === 'string') state.textFontFamily = st.fontFamily;
        if (typeof st.fontSize === 'number') state.textFontSize = st.fontSize;
        state.textFontWeight = String(st.fontWeight || state.textFontWeight || 'normal');
        state.textFontStyle = String(st.fontStyle || state.textFontStyle || 'normal');
        state.textUnderline = !!(st.underline ?? state.textUnderline);
        if (ui.contextMenu) {
          const tf = ui.contextMenu.querySelector('#ctx_text_font');
          const ts = ui.contextMenu.querySelector('#ctx_text_size');
          const tb = ui.contextMenu.querySelector('#ctx_text_bold');
          const ti = ui.contextMenu.querySelector('#ctx_text_italic');
          const tu = ui.contextMenu.querySelector('#ctx_text_underline');
          if (tf) tf.value = String(state.textFontFamily || 'Arial');
          if (ts) ts.value = String(Number(state.textFontSize) || 28);
          if (tb) tb.style.background = (state.textFontWeight === 'bold') ? '#fb8c00' : '#37474f';
          if (ti) ti.style.background = (state.textFontStyle === 'italic') ? '#fb8c00' : '#37474f';
          if (tu) tu.style.background = state.textUnderline ? '#fb8c00' : '#37474f';
        }
      } catch {}

      const el = document.createElement('textarea');
      el.value = (typeof st.text === 'string') ? st.text : '';
      el.spellcheck = false;
      el.wrap = 'soft';
      el.autocomplete = 'off';
      el.autocapitalize = 'off';
      el.rows = 1;
      el.style.position = 'fixed';
      el.style.zIndex = '100000';
      el.style.padding = '6px';
      el.style.margin = '0';
      el.style.borderRadius = '8px';
      el.style.border = '1px solid rgba(0,0,0,0.35)';
      el.style.background = 'rgba(255,255,255,0.92)';
      el.style.color = String(st.textColor || state.color || state.textColor || '#111111');
      el.style.fontFamily = String(st.fontFamily || state.textFontFamily || 'Arial');
      el.style.fontSize = String((Number(st.fontSize) || Number(state.textFontSize) || 28)) + 'px';
      el.style.fontWeight = String(st.fontWeight || state.textFontWeight || 'normal');
      el.style.fontStyle = String(st.fontStyle || state.textFontStyle || 'normal');
      el.style.textDecoration = (st.underline ?? state.textUnderline) ? 'underline' : 'none';
      el.style.lineHeight = '1.2';
      el.style.resize = 'none';
      el.style.overflow = 'hidden';
      el.style.outline = 'none';

      // Prevent ComfyUI shortcuts while typing
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          ev.stopPropagation();
          closeTextEditor({ commit: true });
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          closeTextEditor({ commit: false });
        }
      }, true);
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
      }, true);
      // Blur can happen transiently (e.g. focus shuffles while dragging the viewport).
      // Defer close slightly and cancel if focus returns.
      el.addEventListener('focus', () => {
        try {
          if (state._textEditorBlurTimer) {
            clearTimeout(state._textEditorBlurTimer);
            state._textEditorBlurTimer = null;
          }
        } catch {}
      }, true);
      el.addEventListener('blur', () => {
        try {
          if (state._textEditorBlurTimer) clearTimeout(state._textEditorBlurTimer);
          state._textEditorBlurTimer = setTimeout(() => {
            try {
              // Editor may have been closed/reopened in the meantime
              if (state.textEditor?.el !== el) return;
              if (document.activeElement === el) return;
              closeTextEditor({ commit: true });
            } catch {}
          }, 60);
        } catch {}
      });

      document.body.appendChild(el);
      state.textEditor = { stickerId, el };
      try { syncTextEditorPosition(canvas); } catch {}
      try { el.focus(); } catch {}
      try { el.setSelectionRange(el.value.length, el.value.length); } catch {}
    }

    function syncTextEditorPosition(canvas) {
      const te = state.textEditor;
      if (!te || !te.el) return;
      const idx = getStickerIdxById(te.stickerId);
      const st = idx >= 0 ? state.stickers[idx] : null;
      if (!st || !isTextSticker(st)) {
        closeTextEditor({ commit: true });
        return;
      }
      // Keep editor font size aligned with zoom (so it matches rendered text)
      try {
        const ds = canvas?.ds || canvas?.viewport || { scale: canvas?.scale || 1 };
        const sc = (ds.scale || 1);
        const base = (Number(st.fontSize) || Number(state.textFontSize) || 28);
        te.el.style.fontSize = String(Math.max(8, base * sc)) + 'px';
      } catch {}
      const dpr = getCanvasEffectiveDpr(canvas);
      const rPx = graphRectToCanvasPxRect({ x0: st.x, y0: st.y, x1: st.x + st.w, y1: st.y + st.h }, canvas);
      if (!rPx) return;
      const pad = 2;
      te.el.style.left = Math.round((rPx.x / dpr) + pad) + 'px';
      te.el.style.top = Math.round((rPx.y / dpr) + pad) + 'px';
      te.el.style.width = Math.max(40, Math.round((rPx.w / dpr) - pad * 2)) + 'px';
      te.el.style.height = Math.max(28, Math.round((rPx.h / dpr) - pad * 2)) + 'px';
    }

    function wrapTextLines(ctx, text, maxWidth) {
      const s = String(text || '');
      const rawLines = s.split(/\r?\n/);
      const out = [];
      for (const raw of rawLines) {
        const line = String(raw);
        if (!line) {
          out.push('');
          continue;
        }
        const words = line.split(/\s+/).filter(Boolean);
        if (!words.length) {
          out.push('');
          continue;
        }
        let cur = words[0];
        for (let i = 1; i < words.length; i++) {
          const next = cur + ' ' + words[i];
          if (ctx.measureText(next).width <= maxWidth) {
            cur = next;
          } else {
            out.push(cur);
            cur = words[i];
          }
        }
        out.push(cur);
      }
      return out;
    }

    function stickerBBox(st) {
      if (!st) return null;
      const x = (typeof st.x === 'number') ? st.x : 0;
      const y = (typeof st.y === 'number') ? st.y : 0;
      const w = (typeof st.w === 'number') ? st.w : 0;
      const h = (typeof st.h === 'number') ? st.h : 0;
      if (w <= 0 || h <= 0) return null;
      const rot = (typeof st.rot === 'number') ? st.rot : 0;
      if (!rot) return { x0: x, y0: y, x1: x + w, y1: y + h };
      const cx = x + w / 2;
      const cy = y + h / 2;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const localCorners = [
        { x: -w / 2, y: -h / 2 },
        { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 },
        { x: -w / 2, y: h / 2 },
      ];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const k of localCorners) {
        const gx = cx + (k.x * c - k.y * s);
        const gy = cy + (k.x * s + k.y * c);
        x0 = Math.min(x0, gx);
        y0 = Math.min(y0, gy);
        x1 = Math.max(x1, gx);
        y1 = Math.max(y1, gy);
      }
      return { x0, y0, x1, y1 };
    }

    function selectionFromRect(rect) {
      const r = normalizeRect(rect);
      if (!r || r.w < 1e-6 || r.h < 1e-6) {
        return { selectedPaths: [], selectedStickers: [], bbox: null };
      }

      const selectedPaths = [];
      for (let li = 0; li < state.layers.length; li++) {
        const layer = state.layers[li];
        if (!layer || !Array.isArray(layer.paths)) continue;
        for (let pi = 0; pi < layer.paths.length; pi++) {
          const p = layer.paths[pi];
          const bb = pathBBox(p);
          if (!bb) continue;
          if (rectIntersects(r, bb)) selectedPaths.push({ layerIdx: li, pathIdx: pi, bbox: bb });
        }
      }

      const selectedStickers = [];
      for (let si = 0; si < (state.stickers?.length || 0); si++) {
        const st = state.stickers[si];
        const bb = stickerBBox(st);
        if (!bb) continue;
        if (rectIntersects(r, bb)) selectedStickers.push({ stickerIdx: si, bbox: bb });
      }

      let bbox = null;
      for (const sp of selectedPaths) bbox = bboxUnion(bbox, sp.bbox);
      for (const ss of selectedStickers) bbox = bboxUnion(bbox, ss.bbox);
      return { selectedPaths, selectedStickers, bbox };
    }

    function selectionFromPolygon(poly) {
      if (!Array.isArray(poly) || poly.length < 3) {
        return { selectedPaths: [], selectedStickers: [], bbox: null };
      }
      // Use polygon bbox as a first pass, then point-in-polygon on representative points.
      let pb = null;
      for (const pt of poly) {
        if (!pt) continue;
        const bb = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
        pb = bboxUnion(pb, bb);
      }
      if (!pb) return { selectedPaths: [], selectedStickers: [], bbox: null };

      const selectedPaths = [];
      for (let li = 0; li < state.layers.length; li++) {
        const layer = state.layers[li];
        if (!layer || !Array.isArray(layer.paths)) continue;
        for (let pi = 0; pi < layer.paths.length; pi++) {
          const p = layer.paths[pi];
          const bb = pathBBox(p);
          if (!bb) continue;
          if (!rectIntersects(pb, bb)) continue;
          const c = rectCenter(bb);
          if (c && pointInPolygon(c, poly)) selectedPaths.push({ layerIdx: li, pathIdx: pi, bbox: bb });
        }
      }

      const selectedStickers = [];
      for (let si = 0; si < (state.stickers?.length || 0); si++) {
        const st = state.stickers[si];
        const bb = stickerBBox(st);
        if (!bb) continue;
        if (!rectIntersects(pb, bb)) continue;
        const c = rectCenter(bb);
        if (c && pointInPolygon(c, poly)) selectedStickers.push({ stickerIdx: si, bbox: bb });
      }

      let bbox = null;
      for (const sp of selectedPaths) bbox = bboxUnion(bbox, sp.bbox);
      for (const ss of selectedStickers) bbox = bboxUnion(bbox, ss.bbox);
      return { selectedPaths, selectedStickers, bbox };
    }

    function __iamccs_pointSegDist(p, a, b) {
      const ax = a.x, ay = a.y;
      const bx = b.x, by = b.y;
      const px = p.x, py = p.y;
      const abx = bx - ax;
      const aby = by - ay;
      const apx = px - ax;
      const apy = py - ay;
      const ab2 = abx * abx + aby * aby;
      if (ab2 <= 1e-12) {
        return Math.hypot(px - ax, py - ay);
      }
      let t = (apx * abx + apy * aby) / ab2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const cx = ax + abx * t;
      const cy = ay + aby * t;
      return Math.hypot(px - cx, py - cy);
    }

    function __iamccs_hitTestPathNearPoint(graphPos, canvas, { tolPx = 12 } = {}) {
      try {
        const ds = canvas?.ds || canvas?.viewport || { scale: canvas?.scale || 1 };
        const sc = (ds.scale || 1);
        const tolGBase = Math.max(0.5 / sc, (tolPx || 12) / sc);
        const hideNonLocked = !!state.hidden;

        let best = null;
        let bestDist = Infinity;

        for (let li = (state.layers?.length || 0) - 1; li >= 0; li--) {
          const layer = state.layers?.[li];
          if (!layer || layer.visible === false || !Array.isArray(layer.paths)) continue;
          if (hideNonLocked && !layer.locked) continue;
          for (let pi = layer.paths.length - 1; pi >= 0; pi--) {
            const path = layer.paths[pi];
            if (!path || !Array.isArray(path.points) || path.points.length < 1) continue;
            // UX: ignore eraser strokes for click-to-select (they can create tiny bboxes).
            if (path.mode === 'erase') continue;
            const bb = pathBBox(path);
            if (!bb) continue;
            const bbExp = { x0: bb.x0 - tolGBase, y0: bb.y0 - tolGBase, x1: bb.x1 + tolGBase, y1: bb.y1 + tolGBase };
            if (!pointInRect(graphPos, bbExp)) continue;

            const w = (typeof path.width === 'number') ? path.width : 3;
            const strokeWg = state.constantScreen ? (w / sc) : w;
            const tolG = tolGBase + Math.max(1e-6, strokeWg * 0.5);

            let minD = Infinity;
            if (path.points.length === 1) {
              minD = Math.hypot(graphPos.x - path.points[0].x, graphPos.y - path.points[0].y);
            } else {
              for (let i = 0; i < path.points.length - 1; i++) {
                const a = path.points[i];
                const b = path.points[i + 1];
                const d = __iamccs_pointSegDist(graphPos, a, b);
                if (d < minD) minD = d;
                if (minD <= tolG) break;
              }
            }
            if (minD <= tolG && minD < bestDist) {
              bestDist = minD;
              best = { layerIdx: li, pathIdx: pi, bbox: bb };
            }
          }
        }
        return best;
      } catch {
        return null;
      }
    }

    function __iamccs_selectSingleAtPoint(graphPos, canvas) {
      if (!graphPos || !canvas) return null;
      if (state.hidden) return null;

      // Prefer stickers (topmost first)
      try {
        for (let si = (state.stickers?.length || 0) - 1; si >= 0; si--) {
          const st = state.stickers?.[si];
          const bb = stickerBBox(st);
          if (!bb) continue;
          if (pointInRect(graphPos, bb)) {
            return {
              kind: 'select',
              mode: 'rect',
              points: [],
              rect: null,
              bbox: bb,
              selectedPaths: [],
              selectedStickers: [{ stickerIdx: si, bbox: bb }],
              dragging: false,
              pendingDrag: false,
              creating: false,
            };
          }
        }
      } catch {}

      // Then paths near point
      const hitP = __iamccs_hitTestPathNearPoint(graphPos, canvas, { tolPx: 12 });
      if (hitP) {
        let bb = hitP.bbox || null;
        // Expand bbox by stroke width (so the visible selection frame matches what you see on screen)
        try {
          const ds = canvas?.ds || canvas?.viewport || { scale: canvas?.scale || 1 };
          const sc = (ds.scale || 1);
          const layer = state.layers?.[hitP.layerIdx];
          const path = layer?.paths?.[hitP.pathIdx];
          const w = (typeof path?.width === 'number') ? path.width : 3;
          const strokeWg = state.constantScreen ? (w / sc) : w;
          const pad = Math.max(1.5 / sc, Math.max(1e-6, strokeWg * 0.5));
          if (bb) bb = { x0: bb.x0 - pad, y0: bb.y0 - pad, x1: bb.x1 + pad, y1: bb.y1 + pad };
        } catch {}
        return {
          kind: 'select',
          mode: 'rect',
          points: [],
          rect: null,
          bbox: bb,
          selectedPaths: [{ layerIdx: hitP.layerIdx, pathIdx: hitP.pathIdx, bbox: bb }],
          selectedStickers: [],
          dragging: false,
          pendingDrag: false,
          creating: false,
        };
      }
      return null;
    }

    function clearSelection() {
      state.selection = null;
      app?.canvas?.setDirty(true, true);
    }

    function deleteSelection({ allowLocked = false } = {}) {
      const sel = state.selection;
      if (!sel) return false;

      const isPinnedStickerId = (sid) => {
        if (!sid) return false;
        try {
          for (const st of (state.stickers || [])) {
            if (st?.id === sid) return !!st.pinned;
          }
        } catch {}
        return false;
      };

      // Determine what we can actually delete (so we don't create undo entries when blocked)
      const stickerIdxsToDelete = [];
      const deletableStickerIds = new Set();
      if (Array.isArray(sel.selectedStickers) && sel.selectedStickers.length) {
        for (const it of sel.selectedStickers) {
          const st = (typeof it?.stickerIdx === 'number') ? state.stickers?.[it.stickerIdx] : null;
          if (!st || st.pinned) continue;
          if (typeof it?.stickerIdx === 'number') stickerIdxsToDelete.push(it.stickerIdx);
          if (st?.id) deletableStickerIds.add(st.id);
        }
      }

      const byLayer = new Map();
      for (const it of (sel.selectedPaths || [])) {
        if (typeof it?.layerIdx !== 'number' || typeof it?.pathIdx !== 'number') continue;
        const layer = state.layers?.[it.layerIdx];
        if (!layer || !Array.isArray(layer.paths)) continue;
        if (layer.locked && !allowLocked) continue;
        const path = layer.paths?.[it.pathIdx];
        if (!path) continue;
        // Do not delete paths anchored to a pinned sticker (treat pinned as protected)
        if (path?.parentStickerId && isPinnedStickerId(path.parentStickerId)) continue;
        if (!byLayer.has(it.layerIdx)) byLayer.set(it.layerIdx, []);
        byLayer.get(it.layerIdx).push(it.pathIdx);
      }

      if (!stickerIdxsToDelete.length && !byLayer.size) return false;

      // Undo snapshot before destructive operation
      pushHistorySnapshot();

      // If we're editing a text sticker and it gets deleted, close editor first
      try {
        if (state.textEditor?.stickerId && deletableStickerIds?.has?.(state.textEditor.stickerId)) {
          closeTextEditor({ commit: true });
        }
      } catch {}

      // Delete stickers first (descending indices). Pinned stickers are not deletable.
      const deletedStickerIds = new Set();
      try {
        for (const sid of deletableStickerIds) deletedStickerIds.add(sid);
      } catch {}

      // Best-effort cleanup of screenshot blobs in IndexedDB
      try {
        for (const it of (sel.selectedStickers || [])) {
          const st = (typeof it?.stickerIdx === 'number') ? state.stickers?.[it.stickerIdx] : null;
          if (!st || isTextSticker(st)) continue;
          if (st.dataKey) {
            try { __idbDel(__IAMCCS_IDB_STORE_STICKERS, st.dataKey); } catch {}
          }
        }
      } catch {}

      const idxs = stickerIdxsToDelete
        .filter(i => typeof i === 'number')
        .sort((a, b) => b - a);
      for (const i of idxs) {
        if (i >= 0 && i < state.stickers.length) state.stickers.splice(i, 1);
      }

      // If a parent sticker was deleted, also delete any anchored children (paths + stickers)
      if (deletedStickerIds.size) {
        try {
          // Stickers
          state.stickers = (state.stickers || []).filter(st => {
            if (!st) return false;
            const pid = st.parentStickerId;
            return !(typeof pid === 'string' && pid && deletedStickerIds.has(pid));
          });
        } catch {}
        try {
          // Paths
          for (const layer of (state.layers || [])) {
            if (!layer || !Array.isArray(layer.paths)) continue;
            layer.paths = layer.paths.filter(p => {
              if (!p) return false;
              const pid = p.parentStickerId;
              return !(typeof pid === 'string' && pid && deletedStickerIds.has(pid));
            });
          }
        } catch {}
      }

      // Delete paths grouped by layer (descending path indices)
      for (const [li, pathIdxs] of byLayer.entries()) {
        const layer = state.layers[li];
        if (!layer || !Array.isArray(layer.paths)) continue;
        pathIdxs.sort((a, b) => b - a);
        for (const pi of pathIdxs) {
          if (pi >= 0 && pi < layer.paths.length) layer.paths.splice(pi, 1);
        }
      }

      // Refresh flat paths
      state.paths = [];
      for (const lyr of state.layers) for (const p of (lyr.paths || [])) state.paths.push(p);

      clearSelection();
      persistToGraphExtra(true);
      return true;
    }

    function copySelectionToClipboard(opts) {
      const sel = state.selection;
      if (!sel) return false;

      const clearAfter = opts?.clearAfter !== false;

      const clipPaths = [];
      for (const it of (sel.selectedPaths || [])) {
        const layer = state.layers[it.layerIdx];
        const p = layer?.paths?.[it.pathIdx];
        if (!p) continue;
        clipPaths.push({ layerIdx: it.layerIdx, path: clonePath(p) });
      }
      const clipStickers = [];
      for (const it of (sel.selectedStickers || [])) {
        const st = state.stickers?.[it.stickerIdx];
        if (!st) continue;
        clipStickers.push(cloneSticker(st));
      }

      state.clipboard = {
        paths: clipPaths,
        stickers: clipStickers,
        bbox: sel.bbox ? { ...sel.bbox } : null,
      };

      // Requirement: after copy the selection frame should disappear
      if (clearAfter) clearSelection();
      return true;
    }

    function pasteClipboardAt(pos) {
      const clip = state.clipboard;
      if (!clip || (!clip.paths?.length && !clip.stickers?.length)) return false;

      pushHistorySnapshot();

      const dst = pos || state.lastPointerGraphPos || null;
      const srcB = clip.bbox;
      const dx = (dst && srcB) ? (dst.x - srcB.x0) : 20;
      const dy = (dst && srcB) ? (dst.y - srcB.y0) : 20;

      // Remap sticker IDs so anchored children in the pasted group keep pointing to the pasted parent
      const idMap = new Map();
      try {
        for (const st0 of (clip.stickers || [])) {
          const oldId = st0?.id;
          if (!oldId || idMap.has(oldId)) continue;
          idMap.set(oldId, `st_${Date.now()}_${Math.random().toString(16).slice(2)}`);
        }
      } catch {}

      // Paste paths into their original layers when possible
      for (const it of clip.paths || []) {
        const li = it.layerIdx;
        const layer = state.layers[li] || state.layers[state.currentLayerIdx];
        if (!layer || layer.locked) continue;
        const p = clonePath(it.path);
        try {
          if (p?.parentStickerId && idMap.has(p.parentStickerId)) p.parentStickerId = idMap.get(p.parentStickerId);
        } catch {}
        for (const pt of p.points) {
          pt.x += dx;
          pt.y += dy;
        }
        layer.paths.push(p);
        state.paths.push(p);
      }

      // Paste stickers
      for (const st0 of clip.stickers || []) {
        const st = cloneSticker(st0);
        try {
          const oldId = st.id;
          if (oldId && idMap.has(oldId)) st.id = idMap.get(oldId);
          if (st.parentStickerId && idMap.has(st.parentStickerId)) st.parentStickerId = idMap.get(st.parentStickerId);
        } catch {}
        st.x += dx;
        st.y += dy;
        state.stickers.push(st);
      }

      app?.canvas?.setDirty(true, true);
      persistToGraphExtra(true);
      return true;
    }

    // --- Interop with ComfyUI/LiteGraph node clipboard (Ctrl+C/Ctrl+V on nodes) ---
    // ComfyUI's node clipboard may serialize the whole graph, including `graph.extra`.
    // This extension stores drawings/screenshots in `graph.extra`, so without filtering
    // they get copied alongside nodes. Correct behavior: include notes only when
    // explicitly selected AND Annotate is ON.

    function __iamccs_hasSelectedAnnotations() {
      const sel = state.selection;
      if (!sel || sel.kind !== 'select') return false;
      return ((sel.selectedPaths?.length || 0) > 0) || ((sel.selectedStickers?.length || 0) > 0);
    }

    function __iamccs_buildSelectedAnnotationsClip() {
      const sel = state.selection;
      if (!sel || sel.kind !== 'select') return null;

      const clipPaths = [];
      for (const it of (sel.selectedPaths || [])) {
        const layer = state.layers?.[it.layerIdx];
        const p = layer?.paths?.[it.pathIdx];
        if (!p) continue;
        clipPaths.push({ layerIdx: it.layerIdx, path: clonePath(p) });
      }
      const clipStickers = [];
      for (const it of (sel.selectedStickers || [])) {
        const st = state.stickers?.[it.stickerIdx];
        if (!st) continue;
        clipStickers.push(cloneSticker(st));
      }

      if (!clipPaths.length && !clipStickers.length) return null;

      return {
        version: 1,
        bbox: sel.bbox ? { ...sel.bbox } : null,
        paths: clipPaths,
        stickers: clipStickers,
      };
    }

    function __iamccs_pasteAnnotationsClip(clip, { dx = 20, dy = 20 } = {}) {
      if (!clip || (!clip.paths?.length && !clip.stickers?.length)) return false;

      // Undo snapshot for annotations (node paste has its own undo stack)
      try { pushHistorySnapshot(); } catch {}

      // Remap sticker IDs so anchored children in the pasted group keep pointing to the pasted parent
      const idMap = new Map();
      try {
        for (const st0 of (clip.stickers || [])) {
          const oldId = st0?.id;
          if (!oldId || idMap.has(oldId)) continue;
          idMap.set(oldId, `st_${Date.now()}_${Math.random().toString(16).slice(2)}`);
        }
      } catch {}

      // Paste paths
      for (const it of clip.paths || []) {
        const li = it.layerIdx;
        const layer = state.layers?.[li] || state.layers?.[state.currentLayerIdx];
        if (!layer || layer.locked) continue;
        const p = clonePath(it.path);
        try {
          if (p?.parentStickerId && idMap.has(p.parentStickerId)) p.parentStickerId = idMap.get(p.parentStickerId);
        } catch {}
        for (const pt of p.points || []) {
          pt.x += dx;
          pt.y += dy;
        }
        layer.paths.push(p);
        state.paths.push(p);
      }

      // Paste stickers
      for (const st0 of clip.stickers || []) {
        const st = cloneSticker(st0);
        try {
          const oldId = st.id;
          if (oldId && idMap.has(oldId)) st.id = idMap.get(oldId);
          if (st.parentStickerId && idMap.has(st.parentStickerId)) st.parentStickerId = idMap.get(st.parentStickerId);
        } catch {}
        st.x += dx;
        st.y += dy;
        state.stickers.push(st);
      }

      app?.canvas?.setDirty(true, true);
      persistToGraphExtra(true);
      return true;
    }

    function __iamccs_stripAnnotationsFromClipboardData(data) {
      const STRIP_KEYS = new Set([
        'iamccs_annotations',
        'iamccs_annotations_multi',
        'iamccs_annotations_clip',
        // Used to namespace large blobs for this workflow; must not hitchhike on node clipboard.
        'iamccs_annotate_blob_ns',
      ]);

      function deepStrip(obj, depth, seen) {
        try {
          if (!obj || typeof obj !== 'object') return;
          if (seen.has(obj)) return;
          seen.add(obj);
          if (depth > 10) return;

          // Strip direct keys on objects
          for (const k of Object.keys(obj)) {
            if (STRIP_KEYS.has(k)) {
              try { delete obj[k]; } catch {}
              continue;
            }
            const v = obj[k];
            if (v && typeof v === 'object') deepStrip(v, depth + 1, seen);
          }
        } catch {}
      }

      try {
        deepStrip(data, 0, new WeakSet());
      } catch {}
      return data;
    }

    function __iamccs_nodesClipboardBBox(data) {
      try {
        const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
        let x0 = Infinity, y0 = Infinity;
        for (const n of nodes) {
          const pos = n?.pos || n?.position;
          if (Array.isArray(pos) && pos.length >= 2) {
            const x = Number(pos[0]);
            const y = Number(pos[1]);
            if (isFinite(x)) x0 = Math.min(x0, x);
            if (isFinite(y)) y0 = Math.min(y0, y);
          }
        }
        if (!isFinite(x0) || !isFinite(y0)) return null;
        return { x0, y0 };
      } catch {
        return null;
      }
    }

    function installNodeClipboardHooks() {
      try {
        if (window.__IAMCCS_NODE_CLIPBOARD_HOOKED) return;

        const LG = window.LiteGraph;
        const CanvasProto = window.LGraphCanvas?.prototype || LG?.LGraphCanvas?.prototype;
        if (!LG || !CanvasProto) return;

        const origCopy = CanvasProto.copyToClipboard;
        const origPaste = CanvasProto.pasteFromClipboard;
        if (typeof origCopy !== 'function' || typeof origPaste !== 'function') return;

        CanvasProto.copyToClipboard = function (...args) {
          const r = origCopy.apply(this, args);
          try {
            const s = LG.clipboard;
            if (typeof s !== 'string' || !s.length) return r;
            let data;
            try { data = JSON.parse(s); } catch { return r; }

            // Always remove full-workflow annotations from the node clipboard
            data = __iamccs_stripAnnotationsFromClipboardData(data);

            // IMPORTANT: never attach notes/screenshots to the node clipboard.
            delete data.iamccs_annotations_clip;

            LG.clipboard = JSON.stringify(data);
          } catch {}
          return r;
        };

        CanvasProto.pasteFromClipboard = function (...args) {
          // Defensive: ensure node clipboard never contains our workflow annotations.
          try {
            const s = LG.clipboard;
            if (typeof s === 'string' && s.length) {
              let data;
              try { data = JSON.parse(s); } catch { data = null; }
              if (data) {
                data = __iamccs_stripAnnotationsFromClipboardData(data);
                delete data.iamccs_annotations_clip;
                LG.clipboard = JSON.stringify(data);
              }
            }
          } catch {}

          // Paste nodes only (native behavior)
          return origPaste.apply(this, args);
        };

        window.__IAMCCS_NODE_CLIPBOARD_HOOKED = true;
        console.log('[IAMCCS] Node clipboard hooks installed');
      } catch (e) {
        console.warn('[IAMCCS] installNodeClipboardHooks failed:', e);
      }
    }
  // Written code by Carmine Cristallo Scalzi (IAMCCS) - AI for debugging - section: Draggable Utility - reason: clarifies helper enabling persistent movable UI panels/buttons
  function makeDraggable(el, { storageKey, handle, isFixed = true, onDrag, onDragStart }) {
      const target = handle || el;
      let dragging = false;
      let startX = 0, startY = 0, startLeft = 0, startTop = 0;
      let dragStarted = false;
      const onDown = (e) => {
        if (e.button !== 0) return; // left only
        dragging = true;
        dragStarted = false;
        const rect = el.getBoundingClientRect();
        // Switch to top positioning for fixed elements to avoid bottom conflicts
        if (isFixed) {
          el.style.position = 'fixed';
          el.style.bottom = '';
        }
        startX = e.clientX; startY = e.clientY;
        startLeft = rect.left; startTop = rect.top;
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        e.preventDefault(); e.stopPropagation();
      };
      const onMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        // Only start dragging if movement > 5px (threshold for click vs drag)
        if (!dragStarted && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
          dragStarted = true;
          if (typeof onDragStart === 'function') onDragStart();
        }
        if (!dragStarted) return; // Don't move until threshold is met
        const left = Math.max(0, Math.min((isFixed ? window.innerWidth : document.body.clientWidth) - el.offsetWidth, startLeft + dx));
        const top = Math.max(0, Math.min((isFixed ? window.innerHeight : document.body.clientHeight) - el.offsetHeight, startTop + dy));
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        savePos(storageKey, { left, top });
        try { if (typeof onDrag === 'function') onDrag({ left, top }); } catch {}
      };
      const onUp = () => {
        dragging = false;
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
      };
      target.style.cursor = 'move';
      target.addEventListener('pointerdown', onDown, true);
    }

    function syncUI() {
      // Sidebar button
      if (ui.btn) {
        ui.btn.textContent = state.enabled ? 'ENABLED' : 'DISABLED';
        ui.btn.style.background = state.enabled ? '#4CAF50' : '#f44336';
        // Persistent ON badge
        try { __iamccsSetCornerBadge(ui.btn, 'enabled', !!state.enabled, 'ON', { bg: '#ff9800' }); } catch {}
      }
      // Floating button
      if (ui.floating) {
        ui.floating.textContent = state.enabled ? 'Annotate: ON' : 'Annotate: OFF';
        ui.floating.style.background = state.enabled ? '#2e7d32' : '#9e2b25';
        ui.floating.style.borderColor = state.enabled ? '#66bb6a' : '#ef5350';
        // Persistent ON badge
        try { __iamccsSetCornerBadge(ui.floating, 'enabled', !!state.enabled, 'ON', { bg: '#ff9800' }); } catch {}
      }
      // Sync context menu if open
      if (ui.contextMenu && ui.contextMenu.parentElement) {
        const tgl = ui.contextMenu.querySelector('#ctx_toggle');
        if (tgl) {
          tgl.textContent = state.enabled ? 'ENABLED' : 'DISABLED';
          tgl.style.background = state.enabled ? '#4CAF50' : '#f44336';
          // Persistent ON badge
          try { __iamccsSetCornerBadge(tgl, 'enabled', !!state.enabled, 'ON', { bg: '#ff9800' }); } catch {}
        }
      }
    }

    function syncFlagsUI() {
      const syncToggleBadgesUI = () => {
        try {
          const showPen = !!state.penOnly;
          for (const el of document.querySelectorAll('[data-iam-penonly-badge]')) el.style.display = showPen ? 'inline-flex' : 'none';

          const showSel = !!state.selOverride;
          for (const el of document.querySelectorAll('[data-iam-sel-badge]')) el.style.display = showSel ? 'inline-flex' : 'none';

          const showPin = !!state.pinMode;
          for (const el of document.querySelectorAll('[data-iam-pin-badge]')) el.style.display = showPin ? 'inline-flex' : 'none';

          const showHidden = !!state.hidden;
          for (const el of document.querySelectorAll('[data-iam-hidden-badge]')) el.style.display = showHidden ? 'inline-flex' : 'none';
        } catch {}
      };
      // Sync checkboxes in sidebar/dock
      try {
        const dashed = document.getElementById('iam_dashed');
        if (dashed) dashed.checked = !!state.dashed;
        const constant = document.getElementById('iam_constant');
        if (constant) constant.checked = !!state.constantScreen;
        const hidpi = document.getElementById('iam_hidpi');
        if (hidpi) hidpi.checked = !!state.hiDPIx2;
        const hidden = document.getElementById('iam_hidden');
        if (hidden) hidden.checked = !!state.hidden;
        const penonly = document.getElementById('iam_penonly');
        if (penonly) penonly.checked = !!state.penOnly;
        const pinm = document.getElementById('iam_pinmode');
        if (pinm) pinm.checked = !!state.pinMode;
        const selovr = document.getElementById('iam_sel_override');
        if (selovr) selovr.checked = !!state.selOverride;
      } catch {}
      // Sync checkboxes in context menu
      try {
        if (ui.contextMenu) {
          const dsh = ui.contextMenu.querySelector('#ctx_dashed');
          if (dsh) dsh.checked = !!state.dashed;
          const cst = ui.contextMenu.querySelector('#ctx_constant');
          if (cst) cst.checked = !!state.constantScreen;
          const hdp = ui.contextMenu.querySelector('#ctx_hidpi');
          if (hdp) hdp.checked = !!state.hiDPIx2;
          const hid = ui.contextMenu.querySelector('#ctx_hidden');
          if (hid) hid.checked = !!state.hidden;
          const pen = ui.contextMenu.querySelector('#ctx_penonly');
          if (pen) pen.checked = !!state.penOnly;
          const pinm = ui.contextMenu.querySelector('#ctx_pinmode');
          if (pinm) pinm.checked = !!state.pinMode;
          const selovr = ui.contextMenu.querySelector('#ctx_sel_override');
          if (selovr) selovr.checked = !!state.selOverride;
        }
      } catch {}

      // Keep always-on indicators in sync
      syncToggleBadgesUI();
    }

    function setEnabled(val) {
      const prev = !!state.enabled;
      state.enabled = !!val;
      if (!state.enabled && state.pinMode) {
        state.pinMode = false;
      }
      if (!state.enabled) {
        try { closeTextEditor({ commit: true }); } catch {}
      }
      // When disabling, ensure we stop consuming pointer events (so ComfyUI can pan/drag the workflow).
      // Keep sticker border drag available via the early hit-test path in the pointerdown handler.
      if (!state.enabled) {
        try {
          const el = app?.canvas?.canvas;
          const pid = state.activePointerId;
          if (el && typeof el.releasePointerCapture === 'function' && typeof pid === 'number') {
            try { el.releasePointerCapture(pid); } catch {}
          }
        } catch {}
        state.activePointerId = null;
        state.pendingSelection = null;
        state.stickerDrag = null;
        state.stickerResize = null;
        state.transformDrag = null;
        state.rotateDrag = null;
        if (!state.selOverride) state.selection = null;
      }
      // Ensure the floating toggle exists even after workflow reload/DOM resets
      try {
        if (!ui.floating || !document.body.contains(ui.floating)) {
          ensureFloatingToggle();
          state.uiShown = true;
        }
      } catch {}
      // If disabling while drawing, finish current stroke gracefully
      if (!state.enabled && state.current) {
        state.paths.push(state.current);
        state.current = null;
      }
      // Preserve user brush settings; but on enable force dashed back to off per requirement
      if (state.enabled && state.dashed) {
        state.dashed = false;
        try { saveStateToLayerStyle(undefined, { persist: true }); } catch {}
        syncFlagsUI();
      }
      // Keep current color, width, opacity, constant width, and mode choices intact
      // Sync UI to reflect current state
      if (ui.eraserBtn) {
        ui.eraserBtn.textContent = state.eraser ? '🩹 Eraser' : '✏️ Draw';
        ui.eraserBtn.style.background = state.eraser ? '#c2185b' : '#795548';
      }
      syncBrushOpacityUI();
      syncFlagsUI();
      syncUI();
      syncToolsUI();
      app?.canvas?.setDirty(true, true);
      try {
        if (prev !== !!state.enabled) {
          showToast(state.enabled ? 'Annotate enabled' : 'Annotate disabled', { kind: 'info', ms: 1100 });
        }
      } catch {}
      console.log('[IAMCCS] Annotate:', state.enabled ? 'ON' : 'OFF');
    }

    function setTool(next) {
      const t = (next === 'select' || next === 'transform' || next === 'rotate' || next === 'screenshot' || next === 'text' || next === 'draw') ? next : 'draw';
      state.tool = t;
      // Cancel any in-progress stroke when leaving draw
      if (t !== 'draw') state.current = null;
      // Clear selection when leaving select/screenshot
      if (t === 'draw') state.selection = null;
      // Clear a pending text placement rectangle if leaving text
      if (t !== 'text' && state.selection?.kind === 'text') state.selection = null;
      state.pendingSelection = null;
      // Reset pointer id in case a capture was active
      state.activePointerId = null;
      state.stickerDrag = null;
      state.stickerResize = null;
      state.transformDrag = null;
      state.rotateDrag = null;
      syncToolsUI();
      app?.canvas?.setDirty(true, true);
    }

    function setTransformMode(mode) {
      const m = (mode === 'freeform' || mode === 'fixed') ? mode : 'fixed';
      state.transformMode = m;
      syncToolsUI();
      app?.canvas?.setDirty(true, true);
    }

    function setSelectMode(mode) {
      const m0 = (mode === 'free') ? 'lasso' : mode;
      const m = (m0 === 'rect' || m0 === 'lasso') ? m0 : 'rect';
      state.selectMode = m;
      syncToolsUI();
      app?.canvas?.setDirty(true, true);
    }

    function __iamccsEnsureCornerBadge(btn, key) {
      if (!btn) return null;
      try {
        if (!btn.style.position || btn.style.position === 'static') btn.style.position = 'relative';
      } catch {}
      let badge = null;
      try { badge = btn.querySelector(`span[data-iam-corner-badge="${key}"]`); } catch {}
      if (badge) return badge;
      try {
        badge = document.createElement('span');
        badge.dataset.iamCornerBadge = key;
        badge.style.cssText = [
          'position:absolute',
          'top:-7px',
          'right:-7px',
          'display:none',
          'align-items:center',
          'justify-content:center',
          'height:16px',
          'min-width:16px',
          'padding:0 6px',
          'border-radius:999px',
          'background:#ff9800',
          'color:#111',
          'font-weight:900',
          'font-size:10px',
          'letter-spacing:0.6px',
          'border:1px solid rgba(0,0,0,0.35)',
          'box-shadow:0 1px 2px rgba(0,0,0,0.25)',
          'pointer-events:none',
          'user-select:none',
          'z-index:5',
        ].join(';');
        badge.textContent = 'ON';
        btn.appendChild(badge);
      } catch {}
      return badge;
    }

    function __iamccsSetCornerBadge(btn, key, show, text, opts) {
      const badge = __iamccsEnsureCornerBadge(btn, key);
      if (!badge) return;
      try {
        if (typeof text === 'string') badge.textContent = text;
        badge.style.display = show ? 'inline-flex' : 'none';
        if (opts?.bg) badge.style.background = opts.bg;
        if (opts?.color) badge.style.color = opts.color;
      } catch {}
    }

    function __iamccsFlashCornerBadge(btn, key, text, opts) {
      if (!btn) return;
      const ms = Math.max(200, Math.min(2500, Number(opts?.ms) || 900));
      __iamccsSetCornerBadge(btn, key, true, text, opts);
      try {
        if (!btn.__iamBadgeTimers) btn.__iamBadgeTimers = {};
        if (btn.__iamBadgeTimers[key]) clearTimeout(btn.__iamBadgeTimers[key]);
        btn.__iamBadgeTimers[key] = setTimeout(() => {
          try { __iamccsSetCornerBadge(btn, key, false); } catch {}
          try { btn.__iamBadgeTimers[key] = null; } catch {}
        }, ms);
      } catch {}
    }

    function syncBrushOpacityUI() {
      // Sidebar/dock
      const sec = document.getElementById('iamccs-sidebar');
      const wEl = sec?.querySelector('#iam_width');
      const wvEl = sec?.querySelector('#iam_wv');
      const opEl = sec?.querySelector('#iam_opacity');
      const ovEl = sec?.querySelector('#iam_ov');
      if (wEl) wEl.value = String(state.width);
      if (wvEl) wvEl.textContent = String(state.width);
      if (opEl) opEl.value = String(Math.round((state.opacity||1)*100));
      if (ovEl) ovEl.textContent = String(Math.round((state.opacity||1)*100));
      // Context menu, if open
      if (ui.contextMenu) {
        const cw = ui.contextMenu.querySelector('#ctx_width');
        const cwv = ui.contextMenu.querySelector('#ctx_wv');
        const cop = ui.contextMenu.querySelector('#ctx_opacity');
        const cov = ui.contextMenu.querySelector('#ctx_ov');
        if (cw) cw.value = String(state.width);
        if (cwv) cwv.textContent = String(state.width);
        if (cop) cop.value = String(Math.round((state.opacity||1)*100));
        if (cov) cov.textContent = String(Math.round((state.opacity||1)*100));
      }
    }

    function syncColorUI() {
      try {
        const c = String(state.color || '#ff4444');
        // Sidebar / dock (only one exists at a time)
        try {
          const sec = document.getElementById('iamccs-sidebar');
          const el = sec?.querySelector('#iam_color');
          if (el && el.value !== c) el.value = c;
        } catch {}
        // Context menu (if open)
        try {
          const el = ui.contextMenu?.querySelector?.('#ctx_color');
          if (el && el.value !== c) el.value = c;
        } catch {}
      } catch {}
    }

    function applyMacroSizing() {
      // Macro UI removed.
    }

    function syncToolsUI() {
      try {
        const panel = document.getElementById('iamccs-sidebar');
        if (panel) {
          const toolDrawBtn = panel.querySelector('#iam_tool_draw');
          const toolSelectBtn = panel.querySelector('#iam_tool_select');
          const toolTransformBtn = panel.querySelector('#iam_tool_transform');
          const toolRotateBtn = panel.querySelector('#iam_tool_rotate');
          const toolShotBtn = panel.querySelector('#iam_tool_shot');
          const selMode = panel.querySelector('#iam_select_mode');
          const tfMode = panel.querySelector('#iam_transform_mode');
          const selClearBtn = panel.querySelector('#iam_sel_clear');
          const selCopyBtn = panel.querySelector('#iam_sel_copy');
          const selCutBtn = panel.querySelector('#iam_sel_cut');
          const selPasteBtn = panel.querySelector('#iam_sel_paste');

          const inactive = '#455a64';
          const drawOn = '#43a047';
          const selectOn = '#039be5';
          const shotOn = '#8e24aa';
          const isSelect = state.tool === 'select';
          const isTransform = state.tool === 'transform';
          const isRotate = state.tool === 'rotate';
          const selAction = (isSelect || isTransform || isRotate) ? '#fb8c00' : '#37474f';

          if (toolDrawBtn) toolDrawBtn.style.background = state.tool === 'draw' ? drawOn : inactive;
          if (toolSelectBtn) toolSelectBtn.style.background = isSelect ? selectOn : inactive;
          if (toolTransformBtn) toolTransformBtn.style.background = isTransform ? selectOn : inactive;
          if (toolRotateBtn) toolRotateBtn.style.background = isRotate ? selectOn : inactive;
          if (toolShotBtn) toolShotBtn.style.background = state.tool === 'screenshot' ? shotOn : inactive;

          // Active tool badges (persistent)
          __iamccsSetCornerBadge(toolDrawBtn, 'active', state.tool === 'draw', 'ON', { bg: '#ff9800' });
          __iamccsSetCornerBadge(toolSelectBtn, 'active', isSelect, 'ON', { bg: '#ff9800' });
          __iamccsSetCornerBadge(toolTransformBtn, 'active', isTransform, 'ON', { bg: '#ff9800' });
          __iamccsSetCornerBadge(toolRotateBtn, 'active', isRotate, 'ON', { bg: '#ff9800' });
          __iamccsSetCornerBadge(toolShotBtn, 'active', state.tool === 'screenshot', 'ON', { bg: '#ff9800' });

          // Eraser badge (persistent)
          const er = panel.querySelector('#iam_eraser');
          __iamccsSetCornerBadge(er, 'mode', !!state.eraser, 'ER', { bg: '#ff9800' });
          for (const b of [selClearBtn, selCopyBtn, selCutBtn, selPasteBtn]) {
            if (b) b.style.background = selAction;
          }
          if (selMode) selMode.value = state.selectMode || 'rect';
          if (selMode) selMode.style.borderColor = (isSelect || isTransform || isRotate) ? selectOn : '#444';
          if (selMode) selMode.style.display = (isSelect || isTransform || isRotate) ? '' : 'none';
          if (tfMode) tfMode.value = state.transformMode || 'fixed';
          if (tfMode) tfMode.style.borderColor = isTransform ? selectOn : '#444';
          if (tfMode) tfMode.style.display = isTransform ? '' : 'none';
        }
      } catch {}
      try {
        if (ui.contextMenu) {
          const toolDrawBtn = ui.contextMenu.querySelector('#ctx_tool_draw');
          const toolSelectBtn = ui.contextMenu.querySelector('#ctx_tool_select');
          const toolTransformBtn = ui.contextMenu.querySelector('#ctx_tool_transform');
          const toolRotateBtn = ui.contextMenu.querySelector('#ctx_tool_rotate');
          const toolShotBtn = ui.contextMenu.querySelector('#ctx_tool_shot');
          const selMode = ui.contextMenu.querySelector('#ctx_select_mode');
          const tfMode = ui.contextMenu.querySelector('#ctx_transform_mode');
          const selClearBtn = ui.contextMenu.querySelector('#ctx_sel_clear');
          const selCopyBtn = ui.contextMenu.querySelector('#ctx_sel_copy');
          const selCutBtn = ui.contextMenu.querySelector('#ctx_sel_cut');
          const selPasteBtn = ui.contextMenu.querySelector('#ctx_sel_paste');

          const inactive = '#455a64';
          const drawOn = '#43a047';
          const selectOn = '#039be5';
          const shotOn = '#8e24aa';
          const isSelect = state.tool === 'select';
          const isTransform = state.tool === 'transform';
          const isRotate = state.tool === 'rotate';
          const selAction = (isSelect || isTransform || isRotate) ? '#fb8c00' : '#37474f';

          if (toolDrawBtn) toolDrawBtn.style.background = state.tool === 'draw' ? drawOn : inactive;
          if (toolSelectBtn) toolSelectBtn.style.background = isSelect ? selectOn : inactive;
          if (toolTransformBtn) toolTransformBtn.style.background = isTransform ? selectOn : inactive;
          if (toolRotateBtn) toolRotateBtn.style.background = isRotate ? selectOn : inactive;
          if (toolShotBtn) toolShotBtn.style.background = state.tool === 'screenshot' ? shotOn : inactive;

          // Active tool badges (persistent)
          __iamccsSetCornerBadge(toolDrawBtn, 'active', state.tool === 'draw', 'ON', { bg: '#ff9800' });
          __iamccsSetCornerBadge(toolSelectBtn, 'active', isSelect, 'ON', { bg: '#ff9800' });
          __iamccsSetCornerBadge(toolTransformBtn, 'active', isTransform, 'ON', { bg: '#ff9800' });
          __iamccsSetCornerBadge(toolRotateBtn, 'active', isRotate, 'ON', { bg: '#ff9800' });
          __iamccsSetCornerBadge(toolShotBtn, 'active', state.tool === 'screenshot', 'ON', { bg: '#ff9800' });
          for (const b of [selClearBtn, selCopyBtn, selCutBtn, selPasteBtn]) {
            if (b) b.style.background = selAction;
          }
          if (selMode) selMode.value = state.selectMode || 'rect';
          if (selMode) selMode.style.borderColor = (isSelect || isTransform || isRotate) ? selectOn : '#444';
          if (selMode) selMode.style.display = (isSelect || isTransform || isRotate) ? '' : 'none';
          if (tfMode) tfMode.value = state.transformMode || 'fixed';
          if (tfMode) tfMode.style.borderColor = isTransform ? selectOn : '#444';
          if (tfMode) tfMode.style.display = isTransform ? '' : 'none';
        }
      } catch {}
    }

    function syncStickerUI() {
      try {
        const panel = document.getElementById('iamccs-sidebar');
        if (panel) {
          const c = panel.querySelector('#iam_sticker_color');
          const pad = panel.querySelector('#iam_sticker_pad');
          const bw = panel.querySelector('#iam_sticker_border');
          const sh = panel.querySelector('#iam_sticker_shadow');
          const ss = panel.querySelector('#iam_sticker_shadow_strength');
          if (c) c.value = String(state.stickerFrameColor || '#ffffff');
          if (pad) pad.value = String(Number(state.stickerPaddingPx) || 0);
          if (bw) bw.value = String(Number(state.stickerBorderWidthPx) || 0);
          if (sh) sh.checked = !!state.stickerShadow;
          if (ss) {
            ss.value = String(Number(state.stickerShadowStrength) || 0);
            ss.disabled = !state.stickerShadow;
          }
        }
      } catch {}
      try {
        if (ui.contextMenu) {
          const c = ui.contextMenu.querySelector('#ctx_sticker_color');
          const pad = ui.contextMenu.querySelector('#ctx_sticker_pad');
          const bw = ui.contextMenu.querySelector('#ctx_sticker_border');
          const sh = ui.contextMenu.querySelector('#ctx_sticker_shadow');
          const ss = ui.contextMenu.querySelector('#ctx_sticker_shadow_strength');
          if (c) c.value = String(state.stickerFrameColor || '#ffffff');
          if (pad) pad.value = String(Number(state.stickerPaddingPx) || 0);
          if (bw) bw.value = String(Number(state.stickerBorderWidthPx) || 0);
          if (sh) sh.checked = !!state.stickerShadow;
          if (ss) {
            ss.value = String(Number(state.stickerShadowStrength) || 0);
            ss.disabled = !state.stickerShadow;
          }
        }
      } catch {}
    }

    function setEraserMode(on) {
      const next = !!on;
      if (state.eraser === next) return;
      const sty = getCurrentLayerStyle();
      if (next) {
        // switching to eraser: remember current draw values, apply eraser values
        sty.widthDraw = state.width;
        sty.opacityDraw = state.opacity;
        state.widthDraw = sty.widthDraw;
        state.opacityDraw = sty.opacityDraw;
        state.width = sty.widthErase || state.width;
        state.opacity = (typeof sty.opacityErase === 'number') ? sty.opacityErase : state.opacity;
      } else {
        // switching to draw: remember current eraser values, apply draw values
        sty.widthErase = state.width;
        sty.opacityErase = state.opacity;
        state.widthErase = sty.widthErase;
        state.opacityErase = sty.opacityErase;
        state.width = sty.widthDraw || state.width;
        state.opacity = (typeof sty.opacityDraw === 'number') ? sty.opacityDraw : state.opacity;
      }
      state.eraser = next;
      if (ui.eraserBtn) {
        ui.eraserBtn.textContent = state.eraser ? '🩹 Eraser' : '✏️ Draw';
        ui.eraserBtn.style.background = state.eraser ? '#c2185b' : '#795548';
      }
      syncBrushOpacityUI();
      app?.canvas?.setDirty(true, true);
      try { persistToGraphExtra(); } catch {}
    }

    function findSidebarElement() {
      // Try several known selectors; return the first match or null
      const selectors = [
        '.sidebar',
        '#sidebar',
        '.left-panel',
        '.left-sidebar',
        '.comfyui-sidebar',
        '.comfy-menu + div',
        '[class*="sidebar"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }

    function ensureSidebarSection() {
      let section = document.getElementById('iamccs-sidebar');
      if (section) return section;

      const sidebar = findSidebarElement();
      if (!sidebar) {
        // Do not create fallback here; we'll use a dock near the canvas instead
        return null;
      }
      const container = sidebar;

      section = document.createElement('div');
      section.id = 'iamccs-sidebar';
      section.style.cssText = 'padding:10px;border-top:1px solid #444;background:rgba(0,0,0,0.25);margin:6px 0;';

      section.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-weight:700;color:#fff;">🎨 Annotate</div>
          <div style="font-size:11px;color:#bbb;">graph-locked</div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button id="iam_toggle" style="flex:1;padding:8px;border:none;border-radius:6px;background:#f44336;color:#fff;font-weight:700;cursor:pointer;">DISABLED</button>
          <button id="iam_clear" title="Clear all" style="padding:8px 10px;border:none;border-radius:6px;background:#666;color:#fff;cursor:pointer;">🗑️</button>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <input id="iam_color" type="color" value="${state.color}" style="width:36px;height:28px;border:none;border-radius:4px;background:transparent;cursor:pointer;">
          <div style="flex:1;">
            <div style="font-size:11px;color:#bbb;">Brush: <span id="iam_wv">15</span>px</div>
            <input id="iam_width" type="range" min="1" max="48" value="15" style="width:100%;">
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:8px;">
          <div style="font-size:11px;color:#bbb;">Opacity: <span id="iam_ov">100</span>%</div>
          <input id="iam_opacity" type="range" min="10" max="100" step="5" value="100" style="flex:1;">
        </div>

        <div style="margin-top:10px;border-top:1px solid #555;padding-top:8px;">
          <div style="font-weight:600;color:#fff;font-size:12px;margin-bottom:6px;">Tools</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <button id="iam_tool_draw" style="padding:6px 8px;border:none;border-radius:6px;background:#4CAF50;color:#fff;cursor:pointer;font-size:12px;">✏️ Draw</button>
            <button id="iam_tool_select" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;">🔲 Select</button>
              <button id="iam_tool_transform" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;">⛶ Transform</button>
            <button id="iam_tool_rotate" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;">⟲ Rotate</button>
            <button id="iam_tool_shot" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;">📸 Shot</button>
            <select id="iam_select_mode" style="padding:6px 8px;border-radius:6px;background:#263238;color:#fff;border:1px solid #444;font-size:12px;">
              <option value="rect">Rect</option>
              <option value="lasso">Lasso</option>
            </select>
            <select id="iam_transform_mode" style="padding:6px 8px;border-radius:6px;background:#263238;color:#fff;border:1px solid #444;font-size:12px;">
              <option value="fixed">Fixed</option>
              <option value="freeform">Freeform</option>
            </select>
            <button id="iam_sel_clear" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Clear Sel</button>
            <button id="iam_sel_copy" title="Ctrl+C" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Copy</button>
            <button id="iam_sel_cut" title="Ctrl+X" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Cut</button>
            <button id="iam_sel_paste" title="Ctrl+V" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Paste</button>
            <button id="iam_undo" title="Undo" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Undo</button>
            <button id="iam_redo" title="Redo" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Redo</button>
          </div>
        </div>

        <div style="margin-top:10px;border-top:1px solid #555;padding-top:8px;">
          <div style="font-weight:600;color:#fff;font-size:12px;margin-bottom:6px;">Screenshot Post-it</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input id="iam_sticker_color" type="color" value="${state.stickerFrameColor || '#ffffff'}" style="width:36px;height:28px;border:none;border-radius:4px;background:transparent;cursor:pointer;" title="Frame color">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">Pad
              <input id="iam_sticker_pad" type="range" min="0" max="40" value="${Number(state.stickerPaddingPx) || 0}" style="width:120px;">
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">Border
              <input id="iam_sticker_border" type="range" min="0" max="10" value="${Number(state.stickerBorderWidthPx) || 0}" style="width:90px;">
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
              <input id="iam_sticker_shadow" type="checkbox" ${state.stickerShadow ? 'checked' : ''}>
              <span>Shadow</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">Strength
              <input id="iam_sticker_shadow_strength" type="range" min="0" max="30" value="${Number(state.stickerShadowStrength) || 0}" style="width:110px;">
            </label>
            <button id="iam_sticker_clear" title="Remove all post-its" style="padding:6px 8px;border:none;border-radius:6px;background:#6d4c41;color:#fff;cursor:pointer;font-size:12px;">Clear Post-its</button>
            <button id="iam_sticker_purge" title="Remove old screenshot cache blobs (IndexedDB)" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;">Purge old</button>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
          <button id="iam_eraser" style="padding:6px 10px;border:none;border-radius:6px;background:#795548;color:#fff;cursor:pointer;">✏️ Draw</button>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="iam_constant" type="checkbox">
            <span>Constant width</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="iam_dashed" type="checkbox">
            <span>Dashed</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="iam_hidpi" type="checkbox">
            <span>HiDPI ×2</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="iam_hidden" type="checkbox">
            <span>Hide notes</span>
            <span data-iam-hidden-badge style="display:${state.hidden ? 'inline-flex' : 'none'};align-items:center;justify-content:center;height:16px;padding:0 6px;border-radius:999px;background:#ff9800;color:#111;font-weight:800;font-size:10px;letter-spacing:0.6px;border:1px solid rgba(0,0,0,0.35);box-shadow:0 1px 2px rgba(0,0,0,0.25);">HIDE</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="iam_penonly" type="checkbox">
            <span>Pen only</span>
            <span data-iam-penonly-badge style="display:${state.penOnly ? 'inline-flex' : 'none'};align-items:center;justify-content:center;height:16px;padding:0 6px;border-radius:999px;background:#ff9800;color:#111;font-weight:800;font-size:10px;letter-spacing:0.6px;border:1px solid rgba(0,0,0,0.35);box-shadow:0 1px 2px rgba(0,0,0,0.25);">PEN</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="iam_pinmode" type="checkbox">
            <span>Pin/unpin</span>
            <span data-iam-pin-badge style="display:${state.pinMode ? 'inline-flex' : 'none'};align-items:center;justify-content:center;height:16px;padding:0 6px;border-radius:999px;background:#ff9800;color:#111;font-weight:800;font-size:10px;letter-spacing:0.6px;border:1px solid rgba(0,0,0,0.35);box-shadow:0 1px 2px rgba(0,0,0,0.25);">PIN</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="iam_sel_override" type="checkbox">
            <span>sel</span>
            <span data-iam-sel-badge style="display:${state.selOverride ? 'inline-flex' : 'none'};align-items:center;justify-content:center;height:16px;padding:0 6px;border-radius:999px;background:#ff9800;color:#111;font-weight:800;font-size:10px;letter-spacing:0.6px;border:1px solid rgba(0,0,0,0.35);box-shadow:0 1px 2px rgba(0,0,0,0.25);">SEL</span>
          </label>
          <div style="flex:1"></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="iam_save_with_wf" type="checkbox" ${state.saveWithWorkflow ? 'checked' : ''}>
            <span>Save into workflow</span>
          </label>
          <div style="flex:1"></div>
          <button id="iam_save_now" title="Save now into workflow extra" style="padding:6px 8px;border:none;border-radius:6px;background:#607d8b;color:#fff;cursor:pointer;font-size:11px;">Save WF</button>
          <button id="iam_load_now" title="Load from workflow extra" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:11px;">Load WF</button>
        </div>
        <div style="margin-top:8px;font-size:10px;color:#9aa;opacity:0.85;text-align:right;line-height:1.2;">IAMCCS_annotate - draw & note on ComfyUI . v-2.0.0<br>www.carminecristalloscalzi.com</div>
      `;

      container.appendChild(section);

      // Wire events
      ui.btn = section.querySelector('#iam_toggle');
      const clr = section.querySelector('#iam_clear');
      const color = section.querySelector('#iam_color');
      const width = section.querySelector('#iam_width');
  ui.widthValue = section.querySelector('#iam_wv');
  ui.opacityValue = section.querySelector('#iam_ov');
  const opacity = section.querySelector('#iam_opacity');
  ui.eraserBtn = section.querySelector('#iam_eraser');
  ui.constantChk = section.querySelector('#iam_constant');
  const dashedChk = section.querySelector('#iam_dashed');
  const hidpiChk = section.querySelector('#iam_hidpi');
  const hiddenChk = section.querySelector('#iam_hidden');
  const penOnlyChk = section.querySelector('#iam_penonly');
  const pinModeChk = section.querySelector('#iam_pinmode');
  const selOvrChk = section.querySelector('#iam_sel_override');
    const toolDrawBtn = section.querySelector('#iam_tool_draw');
    const toolSelectBtn = section.querySelector('#iam_tool_select');
    const toolTransformBtn = section.querySelector('#iam_tool_transform');
    const toolRotateBtn = section.querySelector('#iam_tool_rotate');
    const toolShotBtn = section.querySelector('#iam_tool_shot');
    const selMode = section.querySelector('#iam_select_mode');
    const tfMode = section.querySelector('#iam_transform_mode');
    const selClearBtn = section.querySelector('#iam_sel_clear');
    const selCopyBtn = section.querySelector('#iam_sel_copy');
    const selCutBtn = section.querySelector('#iam_sel_cut');
    const selPasteBtn = section.querySelector('#iam_sel_paste');
    const undoBtn = section.querySelector('#iam_undo');
    const redoBtn = section.querySelector('#iam_redo');
    const stColor = section.querySelector('#iam_sticker_color');
    const stPad = section.querySelector('#iam_sticker_pad');
    const stBorder = section.querySelector('#iam_sticker_border');
    const stShadow = section.querySelector('#iam_sticker_shadow');
    const stShadowStrength = section.querySelector('#iam_sticker_shadow_strength');
    const stClearBtn = section.querySelector('#iam_sticker_clear');
    const stPurgeBtn = section.querySelector('#iam_sticker_purge');
        const saveChk = section.querySelector('#iam_save_with_wf');
        const saveNow = section.querySelector('#iam_save_now');
        const loadNow = section.querySelector('#iam_load_now');

      ui.btn.addEventListener('click', () => {
        setEnabled(!state.enabled);
        try { __iamccsFlashCornerBadge(ui.btn, 'done', state.enabled ? 'ON' : 'OFF', { ms: 800, bg: '#ff9800' }); } catch {}
      });
      clr.addEventListener('click', () => {
        // Clear all non-locked layers
        for (const lyr of state.layers) if (!lyr.locked) lyr.paths = [];
        // Refresh flat paths for backward compatibility
        state.paths = [];
        for (const lyr of state.layers) for (const p of lyr.paths) state.paths.push(p);
        app?.canvas?.setDirty(true, true);
        console.log('[IAMCCS] Cleared (unlocked layers)');
        // Always persist locally; optionally also keep workflow.extra clean when disabled.
        persistToGraphExtra(true);
        if (!state.saveWithWorkflow) removeFromGraphExtra();
        try { __iamccsFlashCornerBadge(clr, 'done', 'OK', { ms: 900, bg: '#ff9800' }); } catch {}
        try { showToast('Annotations cleared (unlocked layers)', { kind: 'info', ms: 1200 }); } catch {}
      });
      color.addEventListener('input', () => {
        state.color = color.value;
        schedulePaletteAutoHide(color);
        try { saveStateToLayerStyle(); } catch {}
        try {
          const didText = syncTextLayerFromStateColor();
          if (!didText) persistToGraphExtra();
        } catch { try { persistToGraphExtra(); } catch {} }
      });
      width.addEventListener('input', () => {
        state.width = parseInt(width.value, 10) || 3;
        if (state.eraser) state.widthErase = state.width; else state.widthDraw = state.width;
        if (ui.widthValue) ui.widthValue.textContent = String(state.width);
        try { saveStateToLayerStyle(undefined, { persist: true }); } catch {}
      });
      opacity.addEventListener('input', () => {
        const pct = parseInt(opacity.value, 10) || 100;
        state.opacity = Math.max(0.1, Math.min(1, pct / 100));
        if (state.eraser) state.opacityErase = state.opacity; else state.opacityDraw = state.opacity;
        if (ui.opacityValue) ui.opacityValue.textContent = String(Math.round(state.opacity * 100));
        try { saveStateToLayerStyle(undefined, { persist: true }); } catch {}
      });
      ui.eraserBtn.addEventListener('click', () => {
        setEraserMode(!state.eraser);
        try { showToast(state.eraser ? 'Eraser enabled' : 'Eraser disabled', { kind: 'info', ms: 1100 }); } catch {}
        try { __iamccsFlashCornerBadge(ui.eraserBtn, 'done', state.eraser ? 'ER' : 'DR', { ms: 800, bg: '#ff9800' }); } catch {}
        try { syncToolsUI(); } catch {}
      });
      ui.constantChk.addEventListener('change', () => {
        state.constantScreen = !!ui.constantChk.checked;
        app?.canvas?.setDirty(true, true);
      });
      dashedChk.addEventListener('change', () => {
        state.dashed = !!dashedChk.checked;
        try { saveStateToLayerStyle(undefined, { persist: true }); } catch {}
        app?.canvas?.setDirty(true, true);
      });
      hidpiChk.addEventListener('change', () => {
        state.hiDPIx2 = !!hidpiChk.checked;
        app?.canvas?.setDirty(true, true);
      });
      hiddenChk.addEventListener('change', () => {
        state.hidden = !!hiddenChk.checked;
        try { showToast(state.hidden ? 'Hide notes enabled' : 'Hide notes disabled', { kind: 'info', ms: 1200 }); } catch {}
        try { syncFlagsUI(); } catch {}
        app?.canvas?.setDirty(true, true);
      });
      penOnlyChk.addEventListener('change', () => {
        state.penOnly = !!penOnlyChk.checked;
        try { showToast(state.penOnly ? 'Pen only enabled' : 'Pen only disabled', { kind: 'info', ms: 1200 }); } catch {}
        try { syncFlagsUI(); } catch {}
        app?.canvas?.setDirty(true, true);
      });

      pinModeChk?.addEventListener('change', () => {
        state.pinMode = !!pinModeChk.checked;
        try { showToast(state.pinMode ? 'Pin mode enabled' : 'Pin mode disabled', { kind: 'info', ms: 1200 }); } catch {}
        try { syncFlagsUI(); } catch {}
        app?.canvas?.setDirty(true, true);
      });

      selOvrChk?.addEventListener('change', () => {
        state.selOverride = !!selOvrChk.checked;
        // If Annotate is ON, enabling SEL means the user expects to select, not draw.
        if (state.enabled && state.selOverride) {
          try { setTool('select'); } catch {}
        }
        try { showToast(state.selOverride ? 'Selection mode enabled' : 'Selection mode disabled', { kind: 'info', ms: 1200 }); } catch {}
        if (!state.selOverride && !state.enabled) {
          try { clearSelection(); } catch {}
        }
        try { syncFlagsUI(); } catch {}
        app?.canvas?.setDirty(true, true);
      });

      const setToolAutoEnable = (t) => {
        try {
          if (!state.enabled) setEnabled(true);
        } catch {}
        setTool(t);
      };

      toolDrawBtn?.addEventListener('click', () => { setToolAutoEnable('draw'); try { __iamccsFlashCornerBadge(toolDrawBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Draw enabled', { kind: 'info', ms: 900 }); } catch {} });
      toolSelectBtn?.addEventListener('click', () => { setToolAutoEnable('select'); try { __iamccsFlashCornerBadge(toolSelectBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Select enabled', { kind: 'info', ms: 900 }); } catch {} });
      toolTransformBtn?.addEventListener('click', () => { setToolAutoEnable('transform'); try { __iamccsFlashCornerBadge(toolTransformBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Transform enabled', { kind: 'info', ms: 900 }); } catch {} });
      toolRotateBtn?.addEventListener('click', () => { setToolAutoEnable('rotate'); try { __iamccsFlashCornerBadge(toolRotateBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Rotate enabled', { kind: 'info', ms: 900 }); } catch {} });
      toolShotBtn?.addEventListener('click', () => { setToolAutoEnable('screenshot'); try { __iamccsFlashCornerBadge(toolShotBtn, 'done', 'ON', { ms: 750, bg: '#ff9800' }); } catch {} try { showToast('Screenshot tool enabled', { kind: 'info', ms: 1000 }); } catch {} });
      selMode?.addEventListener('change', () => { setSelectMode(selMode.value); try { showToast(`Selection shape: ${String(selMode.value || 'rect')}`, { kind: 'info', ms: 1000 }); } catch {} });
      tfMode?.addEventListener('change', () => { setTransformMode(tfMode.value); try { showToast(`Transform mode: ${String(tfMode.value || 'fixed')}`, { kind: 'info', ms: 1000 }); } catch {} });
      selClearBtn?.addEventListener('click', () => { clearSelection(); try { __iamccsFlashCornerBadge(selClearBtn, 'done', 'OK', { ms: 800, bg: '#ff9800' }); } catch {} try { showToast('Selection cleared', { kind: 'info', ms: 900 }); } catch {} });
      selCopyBtn?.addEventListener('click', () => { const ok = copySelectionToClipboard(); try { __iamccsFlashCornerBadge(selCopyBtn, 'done', ok ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' }); } catch {} try { showToast(ok ? 'Selection copied' : 'Nothing selected', { kind: ok ? 'info' : 'warn', ms: 1000 }); } catch {} });
      selCutBtn?.addEventListener('click', () => {
        const ok = copySelectionToClipboard({ clearAfter: false });
        if (ok) deleteSelection({ allowLocked: false });
        try { __iamccsFlashCornerBadge(selCutBtn, 'done', ok ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' }); } catch {}
        try { showToast(ok ? 'Selection cut' : 'Nothing selected', { kind: ok ? 'info' : 'warn', ms: 1000 }); } catch {}
      });
      selPasteBtn?.addEventListener('click', () => { const ok = pasteClipboardAt(state.lastPointerGraphPos); try { __iamccsFlashCornerBadge(selPasteBtn, 'done', ok ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' }); } catch {} try { showToast(ok ? 'Pasted' : 'Clipboard empty', { kind: ok ? 'info' : 'warn', ms: 1000 }); } catch {} });

      undoBtn?.addEventListener('click', () => {
        const ok = doUndo();
        if (ok) persistToGraphExtra(true);
        try { __iamccsFlashCornerBadge(undoBtn, 'done', ok ? 'OK' : 'NO', { ms: 850, bg: '#ff9800' }); } catch {}
        try { showToast(ok ? 'Undo' : 'Nothing to undo', { kind: ok ? 'info' : 'warn', ms: 900 }); } catch {}
      });
      redoBtn?.addEventListener('click', () => {
        const ok = doRedo();
        if (ok) persistToGraphExtra(true);
        try { __iamccsFlashCornerBadge(redoBtn, 'done', ok ? 'OK' : 'NO', { ms: 850, bg: '#ff9800' }); } catch {}
        try { showToast(ok ? 'Redo' : 'Nothing to redo', { kind: ok ? 'info' : 'warn', ms: 900 }); } catch {}
      });

      stColor?.addEventListener('input', () => {
        state.stickerFrameColor = stColor.value;
        schedulePaletteAutoHide(stColor);
        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true);
      });
      stPad?.addEventListener('input', () => {
        state.stickerPaddingPx = parseInt(stPad.value, 10) || 0;
        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true);
      });
      stBorder?.addEventListener('input', () => {
        state.stickerBorderWidthPx = parseInt(stBorder.value, 10) || 0;
        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true);
      });
      stShadow?.addEventListener('change', () => {
        state.stickerShadow = !!stShadow.checked;
        syncStickerUI();
        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true);
      });
      stShadowStrength?.addEventListener('input', () => {
        state.stickerShadowStrength = parseInt(stShadowStrength.value, 10) || 0;
        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true);
      });
      stClearBtn?.addEventListener('click', () => {
        state.stickers = [];
        clearSelection();
        app?.canvas?.setDirty(true, true);
        persistToGraphExtra(true);
        try { __iamccsFlashCornerBadge(stClearBtn, 'done', 'OK', { ms: 900, bg: '#ff9800' }); } catch {}
        try { showToast('Post-its cleared', { kind: 'info', ms: 1100 }); } catch {}
      });

      stPurgeBtn?.addEventListener('click', async () => {
        await purgeOldStickerScreenshotCacheForCurrentWorkflow();
        try { __iamccsFlashCornerBadge(stPurgeBtn, 'done', 'OK', { ms: 900, bg: '#ff9800' }); } catch {}
        try { showToast('Old screenshot cache purged', { kind: 'info', ms: 1200 }); } catch {}
      });
        saveChk?.addEventListener('change', () => {
          state.saveWithWorkflow = !!saveChk.checked;
          if (state.saveWithWorkflow) persistToGraphExtra(); else removeFromGraphExtra();
        });
        saveNow?.addEventListener('click', () => {
          persistToGraphExtra(true);
          try { __iamccsFlashCornerBadge(saveNow, 'done', 'OK', { ms: 850, bg: '#ff9800' }); } catch {}
          try { showToast('Saved into workflow', { kind: 'info', ms: 1000 }); } catch {}
        });
        loadNow?.addEventListener('click', () => {
          const loaded = loadFromGraphExtra();
          if (!loaded) console.warn('[IAMCCS] Nessuna annotazione trovata in workflow.extra');
          try { __iamccsFlashCornerBadge(loadNow, 'done', loaded ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' }); } catch {}
          try { showToast(loaded ? 'Loaded from workflow' : 'No annotations found in workflow', { kind: loaded ? 'info' : 'warn', ms: 1400 }); } catch {}
        });

      // If we mounted to body (fallback), try to re-parent to real sidebar when it appears
      if (!sidebar) {
        let tries = 0;
        const reparent = () => {
          const sb = findSidebarElement();
          if (sb) {
            sb.appendChild(section);
            section.style.cssText = 'padding:10px;border-top:1px solid #444;background:rgba(0,0,0,0.25);margin:6px 0;';
            console.log('[IAMCCS] Sidebar found later — UI moved into sidebar');
            return;
          }
          if (tries++ < 20) setTimeout(reparent, 500);
        };
        setTimeout(reparent, 500);
      }

      // Initial UI state
      syncUI();
      syncBrushOpacityUI();
      syncToolsUI();
      syncStickerUI();
      return section;
    }

  function ensureCanvasDock() {
      // Create or reposition the panel next to the canvas when real sidebar is unavailable
      const section = document.getElementById('iamccs-sidebar');
      const canvasEl = app?.canvas?.canvas;
      if (!canvasEl) return null;
      const host = canvasEl.parentElement || document.body;
      let panel = section;
      if (!panel) {
        // Build a new panel identical to sidebar section (English, full controls)
        panel = document.createElement('div');
        panel.id = 'iamccs-sidebar';
        panel.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-weight:700;color:#fff;">🎨 Annotate</div>
            <div style="font-size:11px;color:#bbb;">graph-locked</div>
          </div>
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <button id=\"iam_toggle\" style=\"flex:1;padding:8px;border:none;border-radius:6px;background:#f44336;color:#fff;font-weight:700;cursor:pointer;\">DISABLED</button>
            <button id=\"iam_clear\" title=\"Clear all\" style=\"padding:8px 10px;border:none;border-radius:6px;background:#666;color:#fff;cursor:pointer;\">🗑️</button>
          </div>
          <div style=\"display:flex;gap:10px;align-items:center;\">
            <input id=\"iam_color\" type=\"color\" value=\"${state.color}\" style=\"width:36px;height:28px;border:none;border-radius:4px;background:transparent;cursor:pointer;\">
            <div style=\"flex:1;\">
              <div style=\"font-size:11px;color:#bbb;\">Brush: <span id=\"iam_wv\">15</span>px</div>
              <input id=\"iam_width\" type=\"range\" min=\"1\" max=\"48\" value=\"15\" style=\"width:100%;\">
            </div>
          </div>
          <div style=\"display:flex;gap:10px;align-items:center;margin-top:8px;\">
            <div style=\"font-size:11px;color:#bbb;\">Opacity: <span id=\"iam_ov\">100</span>%</div>
            <input id=\"iam_opacity\" type=\"range\" min=\"10\" max=\"100\" step=\"5\" value=\"100\" style=\"flex:1;\">
          </div>

          <div style=\"margin-top:10px;border-top:1px solid #555;padding-top:8px;\">
            <div style=\"font-weight:600;color:#fff;font-size:12px;margin-bottom:6px;\">Tools</div>
            <div style=\"display:flex;gap:6px;flex-wrap:wrap;align-items:center;\">
              <button id=\"iam_tool_draw\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#4CAF50;color:#fff;cursor:pointer;font-size:12px;\">✏️ Draw</button>
              <button id=\"iam_tool_select\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;\">🔲 Select</button>
                <button id=\"iam_tool_transform\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;\">⛶ Transform</button>
              <button id=\"iam_tool_shot\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;\">📸 Shot</button>
              <select id=\"iam_select_mode\" style=\"padding:6px 8px;border-radius:6px;background:#263238;color:#fff;border:1px solid #444;font-size:12px;\">
                <option value=\"rect\">Rect</option>
                <option value=\"lasso\">Lasso</option>
              </select>
                <select id=\"iam_transform_mode\" style=\"padding:6px 8px;border-radius:6px;background:#263238;color:#fff;border:1px solid #444;font-size:12px;\">
                  <option value=\"fixed\">Fixed</option>
                  <option value=\"freeform\">Freeform</option>
                </select>
              <button id=\"iam_sel_clear\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;\">Clear Sel</button>
              <button id=\"iam_sel_copy\" title=\"Ctrl+C\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;\">Copy</button>
              <button id=\"iam_sel_cut\" title=\"Ctrl+X\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;\">Cut</button>
              <button id=\"iam_sel_paste\" title=\"Ctrl+V\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;\">Paste</button>
              <button id=\"iam_undo\" title=\"Undo\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;\">Undo</button>
              <button id=\"iam_redo\" title=\"Redo\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;\">Redo</button>
            </div>
          </div>

          <div style=\"margin-top:10px;border-top:1px solid #555;padding-top:8px;\">
            <div style=\"font-weight:600;color:#fff;font-size:12px;margin-bottom:6px;\">Screenshot Post-it</div>
            <div style=\"display:flex;gap:8px;align-items:center;flex-wrap:wrap;\">
              <input id=\"iam_sticker_color\" type=\"color\" value=\"${state.stickerFrameColor || '#ffffff'}\" style=\"width:36px;height:28px;border:none;border-radius:4px;background:transparent;cursor:pointer;\" title=\"Frame color\">
              <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">Pad
                <input id=\"iam_sticker_pad\" type=\"range\" min=\"0\" max=\"40\" value=\"${Number(state.stickerPaddingPx) || 0}\" style=\"width:120px;\">
              </label>
              <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">Border
                <input id=\"iam_sticker_border\" type=\"range\" min=\"0\" max=\"10\" value=\"${Number(state.stickerBorderWidthPx) || 0}\" style=\"width:90px;\">
              </label>
              <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">
                <input id=\"iam_sticker_shadow\" type=\"checkbox\" ${state.stickerShadow ? 'checked' : ''}>
                <span>Shadow</span>
              </label>
              <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">Strength
                <input id=\"iam_sticker_shadow_strength\" type=\"range\" min=\"0\" max=\"30\" value=\"${Number(state.stickerShadowStrength) || 0}\" style=\"width:110px;\">
              </label>
              <button id=\"iam_sticker_clear\" title=\"Remove all post-its\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#6d4c41;color:#fff;cursor:pointer;font-size:12px;\">Clear Post-its</button>
              <button id=\"iam_sticker_purge\" title=\"Remove old screenshot cache blobs (IndexedDB)\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;\">Purge old</button>
            </div>
          </div>
          <div style=\"display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;\">
            <button id=\"iam_eraser\" style=\"padding:6px 10px;border:none;border-radius:6px;background:#795548;color:#fff;cursor:pointer;\">✏️ Draw</button>
            <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">
              <input id=\"iam_constant\" type=\"checkbox\">
              <span>Constant width</span>
            </label>
            <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">
              <input id=\"iam_dashed\" type=\"checkbox\">
              <span>Dashed</span>
            </label>
            <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">
              <input id=\"iam_hidpi\" type=\"checkbox\">
              <span>HiDPI ×2</span>
            </label>
            <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">
              <input id=\"iam_hidden\" type=\"checkbox\">
              <span>Hide notes</span>
              <span data-iam-hidden-badge style=\"display:${state.hidden ? 'inline-flex' : 'none'};align-items:center;justify-content:center;height:16px;padding:0 6px;border-radius:999px;background:#ff9800;color:#111;font-weight:800;font-size:10px;letter-spacing:0.6px;border:1px solid rgba(0,0,0,0.35);box-shadow:0 1px 2px rgba(0,0,0,0.25);\">HIDE</span>
            </label>
            <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">
              <input id=\"iam_penonly\" type=\"checkbox\">
              <span>Pen only</span>
              <span data-iam-penonly-badge style=\"display:${state.penOnly ? 'inline-flex' : 'none'};align-items:center;justify-content:center;height:16px;padding:0 6px;border-radius:999px;background:#ff9800;color:#111;font-weight:800;font-size:10px;letter-spacing:0.6px;border:1px solid rgba(0,0,0,0.35);box-shadow:0 1px 2px rgba(0,0,0,0.25);\">PEN</span>
            </label>
            <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">
              <input id=\"iam_sel_override\" type=\"checkbox\">
              <span>sel</span>
              <span data-iam-sel-badge style=\"display:${state.selOverride ? 'inline-flex' : 'none'};align-items:center;justify-content:center;height:16px;padding:0 6px;border-radius:999px;background:#ff9800;color:#111;font-weight:800;font-size:10px;letter-spacing:0.6px;border:1px solid rgba(0,0,0,0.35);box-shadow:0 1px 2px rgba(0,0,0,0.25);\">SEL</span>
            </label>
            <div style=\"flex:1\"></div>
          </div>
          <div style=\"display:flex;gap:8px;align-items:center;margin-top:8px;\">
            <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">
              <input id=\"iam_save_with_wf\" type=\"checkbox\" ${state.saveWithWorkflow ? 'checked' : ''}>
              <span>Save into workflow</span>
            </label>
            <div style=\"flex:1\"></div>
            <button id=\"iam_save_now\" title=\"Save now into workflow extra\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#607d8b;color:#fff;cursor:pointer;font-size:11px;\">Save WF</button>
            <button id=\"iam_load_now\" title=\"Load from workflow extra\" style=\"padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:11px;\">Load WF</button>
          </div>
          <div style=\"margin-top:8px;font-size:10px;color:#9aa;opacity:0.85;text-align:right;line-height:1.2;\">IAMCCS_annotate - draw & note on ComfyUI . v-2.0.0<br>www.carminecristalloscalzi.com</div>
        `;
        // Wire events (same as sidebar)
        ui.btn = panel.querySelector('#iam_toggle');
        const clr = panel.querySelector('#iam_clear');
        const color = panel.querySelector('#iam_color');
        const width = panel.querySelector('#iam_width');
        const opacity = panel.querySelector('#iam_opacity');
        ui.widthValue = panel.querySelector('#iam_wv');
        ui.opacityValue = panel.querySelector('#iam_ov');
        ui.eraserBtn = panel.querySelector('#iam_eraser');
        ui.constantChk = panel.querySelector('#iam_constant');
        const dashedChk = panel.querySelector('#iam_dashed');
  const hidpiChk = panel.querySelector('#iam_hidpi');
        const hiddenChk = panel.querySelector('#iam_hidden');
        const penOnlyChk = panel.querySelector('#iam_penonly');
        const selOvrChk = panel.querySelector('#iam_sel_override');
          const toolDrawBtn = panel.querySelector('#iam_tool_draw');
          const toolSelectBtn = panel.querySelector('#iam_tool_select');
          const toolTransformBtn = panel.querySelector('#iam_tool_transform');
          const toolRotateBtn = panel.querySelector('#iam_tool_rotate');
          const toolShotBtn = panel.querySelector('#iam_tool_shot');
          const selMode = panel.querySelector('#iam_select_mode');
          const tfMode = panel.querySelector('#iam_transform_mode');
          const selClearBtn = panel.querySelector('#iam_sel_clear');
          const selCopyBtn = panel.querySelector('#iam_sel_copy');
          const selCutBtn = panel.querySelector('#iam_sel_cut');
          const selPasteBtn = panel.querySelector('#iam_sel_paste');
          const undoBtn = panel.querySelector('#iam_undo');
          const redoBtn = panel.querySelector('#iam_redo');
          const stColor = panel.querySelector('#iam_sticker_color');
          const stPad = panel.querySelector('#iam_sticker_pad');
          const stBorder = panel.querySelector('#iam_sticker_border');
          const stShadow = panel.querySelector('#iam_sticker_shadow');
          const stShadowStrength = panel.querySelector('#iam_sticker_shadow_strength');
          const stClearBtn = panel.querySelector('#iam_sticker_clear');
          const stPurgeBtn = panel.querySelector('#iam_sticker_purge');
        const saveChk = panel.querySelector('#iam_save_with_wf');
        const saveNow = panel.querySelector('#iam_save_now');
        const loadNow = panel.querySelector('#iam_load_now');

        ui.btn.addEventListener('click', () => {
          setEnabled(!state.enabled);
          try { __iamccsFlashCornerBadge(ui.btn, 'done', state.enabled ? 'ON' : 'OFF', { ms: 800, bg: '#ff9800' }); } catch {}
        });
        clr.addEventListener('click', () => {
          // Clear all non-locked layers
          for (const lyr of state.layers) if (!lyr.locked) lyr.paths = [];
          // Refresh flat paths for backward compatibility
          state.paths = [];
          for (const lyr of state.layers) for (const p of lyr.paths) state.paths.push(p);
          app?.canvas?.setDirty(true, true);
          console.log('[IAMCCS] Cleared (unlocked layers)');
          persistToGraphExtra(true);
          if (!state.saveWithWorkflow) removeFromGraphExtra();
          try { __iamccsFlashCornerBadge(clr, 'done', 'OK', { ms: 900, bg: '#ff9800' }); } catch {}
          try { showToast('Annotations cleared (unlocked layers)', { kind: 'info', ms: 1200 }); } catch {}
        });
        color.addEventListener('input', () => {
          state.color = color.value;
          try { schedulePaletteAutoHide(color); } catch {}
          try { saveStateToLayerStyle(); } catch {}
          try {
            const didText = syncTextLayerFromStateColor();
            if (!didText) persistToGraphExtra();
          } catch { try { persistToGraphExtra(); } catch {} }
        });
        width.addEventListener('input', () => {
          state.width = parseInt(width.value, 10) || 3;
          if (state.eraser) state.widthErase = state.width; else state.widthDraw = state.width;
          if (ui.widthValue) ui.widthValue.textContent = String(state.width);
          try { saveStateToLayerStyle(undefined, { persist: true }); } catch {}
        });
        opacity.addEventListener('input', () => {
          const pct = parseInt(opacity.value, 10) || 100;
          state.opacity = Math.max(0.1, Math.min(1, pct / 100));
          if (state.eraser) state.opacityErase = state.opacity; else state.opacityDraw = state.opacity;
          if (ui.opacityValue) ui.opacityValue.textContent = String(Math.round(state.opacity * 100));
          try { saveStateToLayerStyle(undefined, { persist: true }); } catch {}
        });
        ui.eraserBtn.addEventListener('click', () => {
          setEraserMode(!state.eraser);
          try { showToast(state.eraser ? 'Eraser enabled' : 'Eraser disabled', { kind: 'info', ms: 1100 }); } catch {}
          try { __iamccsFlashCornerBadge(ui.eraserBtn, 'done', state.eraser ? 'ER' : 'DR', { ms: 800, bg: '#ff9800' }); } catch {}
          try { syncToolsUI(); } catch {}
        });
        ui.constantChk.addEventListener('change', () => {
          state.constantScreen = !!ui.constantChk.checked;
          app?.canvas?.setDirty(true, true);
        });
        dashedChk.addEventListener('change', () => {
          state.dashed = !!dashedChk.checked;
          try { saveStateToLayerStyle(undefined, { persist: true }); } catch {}
          app?.canvas?.setDirty(true, true);
        });
        hidpiChk.addEventListener('change', () => {
          state.hiDPIx2 = !!hidpiChk.checked;
          app?.canvas?.setDirty(true, true);
        });
        hiddenChk.addEventListener('change', () => {
          state.hidden = !!hiddenChk.checked;
          try { showToast(state.hidden ? 'Hide notes enabled' : 'Hide notes disabled', { kind: 'info', ms: 1200 }); } catch {}
          try { syncFlagsUI(); } catch {}
          app?.canvas?.setDirty(true, true);
        });
        penOnlyChk.addEventListener('change', () => {
          state.penOnly = !!penOnlyChk.checked;
          try { showToast(state.penOnly ? 'Pen only enabled' : 'Pen only disabled', { kind: 'info', ms: 1200 }); } catch {}
          try { syncFlagsUI(); } catch {}
          app?.canvas?.setDirty(true, true);
        });

        selOvrChk?.addEventListener('change', () => {
          state.selOverride = !!selOvrChk.checked;
          // If Annotate is ON, enabling SEL means the user expects to select, not draw.
          if (state.enabled && state.selOverride) {
            try { setTool('select'); } catch {}
          }
          try { showToast(state.selOverride ? 'Selection mode enabled' : 'Selection mode disabled', { kind: 'info', ms: 1200 }); } catch {}
          if (!state.selOverride && !state.enabled) {
            try { clearSelection(); } catch {}
          }
          try { syncFlagsUI(); } catch {}
          app?.canvas?.setDirty(true, true);
        });

        const setToolAutoEnable = (t) => {
          try {
            if (!state.enabled) setEnabled(true);
          } catch {}
          setTool(t);
        };

        toolDrawBtn?.addEventListener('click', () => { setToolAutoEnable('draw'); try { __iamccsFlashCornerBadge(toolDrawBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Draw enabled', { kind: 'info', ms: 900 }); } catch {} });
        toolSelectBtn?.addEventListener('click', () => { setToolAutoEnable('select'); try { __iamccsFlashCornerBadge(toolSelectBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Select enabled', { kind: 'info', ms: 900 }); } catch {} });
        toolTransformBtn?.addEventListener('click', () => { setToolAutoEnable('transform'); try { __iamccsFlashCornerBadge(toolTransformBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Transform enabled', { kind: 'info', ms: 900 }); } catch {} });
        toolRotateBtn?.addEventListener('click', () => { setToolAutoEnable('rotate'); try { __iamccsFlashCornerBadge(toolRotateBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Rotate enabled', { kind: 'info', ms: 900 }); } catch {} });
        toolShotBtn?.addEventListener('click', () => { setToolAutoEnable('screenshot'); try { __iamccsFlashCornerBadge(toolShotBtn, 'done', 'ON', { ms: 750, bg: '#ff9800' }); } catch {} try { showToast('Screenshot tool enabled', { kind: 'info', ms: 1000 }); } catch {} });
        selMode?.addEventListener('change', () => { setSelectMode(selMode.value); try { showToast(`Selection shape: ${String(selMode.value || 'rect')}`, { kind: 'info', ms: 1000 }); } catch {} });
        tfMode?.addEventListener('change', () => { setTransformMode(tfMode.value); try { showToast(`Transform mode: ${String(tfMode.value || 'fixed')}`, { kind: 'info', ms: 1000 }); } catch {} });
        selClearBtn?.addEventListener('click', () => { clearSelection(); try { __iamccsFlashCornerBadge(selClearBtn, 'done', 'OK', { ms: 800, bg: '#ff9800' }); } catch {} try { showToast('Selection cleared', { kind: 'info', ms: 900 }); } catch {} });
        selCopyBtn?.addEventListener('click', () => { const ok = copySelectionToClipboard(); try { __iamccsFlashCornerBadge(selCopyBtn, 'done', ok ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' }); } catch {} try { showToast(ok ? 'Selection copied' : 'Nothing selected', { kind: ok ? 'info' : 'warn', ms: 1000 }); } catch {} });
        selCutBtn?.addEventListener('click', () => {
          const ok = copySelectionToClipboard({ clearAfter: false });
          if (ok) deleteSelection({ allowLocked: false });
          try { __iamccsFlashCornerBadge(selCutBtn, 'done', ok ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' }); } catch {}
          try { showToast(ok ? 'Selection cut' : 'Nothing selected', { kind: ok ? 'info' : 'warn', ms: 1000 }); } catch {}
        });
        selPasteBtn?.addEventListener('click', () => { const ok = pasteClipboardAt(state.lastPointerGraphPos); try { __iamccsFlashCornerBadge(selPasteBtn, 'done', ok ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' }); } catch {} try { showToast(ok ? 'Pasted' : 'Clipboard empty', { kind: ok ? 'info' : 'warn', ms: 1000 }); } catch {} });

        undoBtn?.addEventListener('click', () => {
          const ok = doUndo();
          if (ok) persistToGraphExtra(true);
          try { __iamccsFlashCornerBadge(undoBtn, 'done', ok ? 'OK' : 'NO', { ms: 850, bg: '#ff9800' }); } catch {}
          try { showToast(ok ? 'Undo' : 'Nothing to undo', { kind: ok ? 'info' : 'warn', ms: 900 }); } catch {}
        });
        redoBtn?.addEventListener('click', () => {
          const ok = doRedo();
          if (ok) persistToGraphExtra(true);
          try { __iamccsFlashCornerBadge(redoBtn, 'done', ok ? 'OK' : 'NO', { ms: 850, bg: '#ff9800' }); } catch {}
          try { showToast(ok ? 'Redo' : 'Nothing to redo', { kind: ok ? 'info' : 'warn', ms: 900 }); } catch {}
        });

        stColor?.addEventListener('input', () => {
          state.stickerFrameColor = stColor.value;
          app?.canvas?.setDirty(true, true);
          if (state.saveWithWorkflow) persistToGraphExtra(true);
        });
        stPad?.addEventListener('input', () => {
          state.stickerPaddingPx = parseInt(stPad.value, 10) || 0;
          app?.canvas?.setDirty(true, true);
          if (state.saveWithWorkflow) persistToGraphExtra(true);
        });
        stBorder?.addEventListener('input', () => {
          state.stickerBorderWidthPx = parseInt(stBorder.value, 10) || 0;
          app?.canvas?.setDirty(true, true);
          if (state.saveWithWorkflow) persistToGraphExtra(true);
        });
        stShadow?.addEventListener('change', () => {
          state.stickerShadow = !!stShadow.checked;
          syncStickerUI();
          app?.canvas?.setDirty(true, true);
          if (state.saveWithWorkflow) persistToGraphExtra(true);
        });
        stShadowStrength?.addEventListener('input', () => {
          state.stickerShadowStrength = parseInt(stShadowStrength.value, 10) || 0;
          app?.canvas?.setDirty(true, true);
          if (state.saveWithWorkflow) persistToGraphExtra(true);
        });
        stClearBtn?.addEventListener('click', () => {
          state.stickers = [];
          clearSelection();
          app?.canvas?.setDirty(true, true);
          persistToGraphExtra(true);
          try { __iamccsFlashCornerBadge(stClearBtn, 'done', 'OK', { ms: 900, bg: '#ff9800' }); } catch {}
          try { showToast('Post-its cleared', { kind: 'info', ms: 1100 }); } catch {}
        });

        stPurgeBtn?.addEventListener('click', async () => {
          await purgeOldStickerScreenshotCacheForCurrentWorkflow();
          try { __iamccsFlashCornerBadge(stPurgeBtn, 'done', 'OK', { ms: 900, bg: '#ff9800' }); } catch {}
          try { showToast('Old screenshot cache purged', { kind: 'info', ms: 1200 }); } catch {}
        });
        saveChk?.addEventListener('change', () => {
          state.saveWithWorkflow = !!saveChk.checked;
          if (state.saveWithWorkflow) persistToGraphExtra(); else removeFromGraphExtra();
        });
        saveNow?.addEventListener('click', () => {
          persistToGraphExtra(true);
          try { __iamccsFlashCornerBadge(saveNow, 'done', 'OK', { ms: 850, bg: '#ff9800' }); } catch {}
          try { showToast('Saved into workflow', { kind: 'info', ms: 1000 }); } catch {}
        });
        loadNow?.addEventListener('click', () => {
          const loaded = loadFromGraphExtra();
          if (!loaded) console.warn('[IAMCCS] Nessuna annotazione trovata in workflow.extra');
          try { __iamccsFlashCornerBadge(loadNow, 'done', loaded ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' }); } catch {}
          try { showToast(loaded ? 'Loaded from workflow' : 'No annotations found in workflow', { kind: loaded ? 'info' : 'warn', ms: 1400 }); } catch {}
        });
      }

  // Style as dock next to canvas
  panel.style.position = 'absolute';
    // restored position if saved
    const saved = loadPos('iamccs_dock_pos', { left: 180, top: 80 });
    panel.style.left = saved.left + 'px';
  panel.style.top = saved.top + 'px';
      panel.style.width = '220px';
      panel.style.background = 'rgba(0,0,0,0.9)';
      panel.style.border = '1px solid #444';
      panel.style.borderRadius = '8px';
      panel.style.padding = '12px';
      panel.style.color = '#fff';
      panel.style.zIndex = '10';
      panel.style.fontFamily = 'Segoe UI, Arial';

      if (panel.parentElement !== host) host.appendChild(panel);
      // Make panel draggable by its header
      const header = panel.firstElementChild;
      makeDraggable(panel, { storageKey: 'iamccs_dock_pos', handle: header, isFixed: false });
  syncUI();
  syncBrushOpacityUI();
  syncToolsUI();
  syncStickerUI();
      // Hide floating toggle if dock is visible
      if (ui.floating) ui.floating.style.display = 'none';
      return panel;
    }

      function ensureStateHydratedFromExisting() {
        try {
          if (state.hydrated) return;
          const existing = readAnnotationsFromExtra(getActiveGraphKey());
          if (!existing) return;
          // Build merged layers from existing
          let mergedLayers = [];
          if (Array.isArray(existing.layers) && existing.layers.length) {
            mergedLayers = existing.layers.map((layer) => ({
              name: layer.name || 'Layer',
              visible: layer.visible !== false,
              locked: !!layer.locked,
              paths: Array.isArray(layer.paths) ? layer.paths.map(p => ({
                color: p.color || '#ff4444',
                width: p.width || 3,
                opacity: (typeof p.opacity === 'number') ? p.opacity : 1,
                mode: p.mode === 'erase' ? 'erase' : 'draw',
                dashed: !!p.dashed,
                points: Array.isArray(p.points) ? p.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
              })) : [],
              style: (layer.style && typeof layer.style === 'object') ? {
                color: typeof layer.style.color === 'string' ? layer.style.color : (state.color || '#ff4444'),
                dashed: !!layer.style.dashed,
                widthDraw: (typeof layer.style.widthDraw === 'number') ? layer.style.widthDraw : (state.widthDraw || 7),
                widthErase: (typeof layer.style.widthErase === 'number') ? layer.style.widthErase : (state.widthErase || 48),
                opacityDraw: (typeof layer.style.opacityDraw === 'number') ? layer.style.opacityDraw : (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0),
                opacityErase: (typeof layer.style.opacityErase === 'number') ? layer.style.opacityErase : (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0),
              } : {
                color: state.color || '#ff4444', dashed: !!state.dashed,
                widthDraw: state.widthDraw || 7, widthErase: state.widthErase || 48,
                opacityDraw: (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0),
                opacityErase: (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0),
              },
            }));
          } else if (Array.isArray(existing.paths)) {
            mergedLayers = [{ name: 'Layer 1', visible: true, locked: false, paths: existing.paths.map(p => ({
              color: p.color || '#ff4444',
              width: p.width || 3,
              opacity: (typeof p.opacity === 'number') ? p.opacity : 1,
              mode: p.mode === 'erase' ? 'erase' : 'draw',
              dashed: !!p.dashed,
              points: Array.isArray(p.points) ? p.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
            })), style: { color: state.color || '#ff4444', dashed: !!state.dashed, widthDraw: state.widthDraw || 7, widthErase: state.widthErase || 48, opacityDraw: (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0), opacityErase: (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0) } }];
          }
          // Overlay current, appending new paths and style tweaks
          for (let i = 0; i < state.layers.length; i++) {
            const cur = state.layers[i];
            ensureLayerStyle(cur);
            if (!mergedLayers[i]) {
              mergedLayers[i] = { name: cur.name || `Layer ${i+1}`, visible: cur.visible !== false, locked: !!cur.locked, paths: [], style: { ...cur.style } };
            }
            if (Array.isArray(cur.paths) && cur.paths.length) mergedLayers[i].paths.push(...cur.paths);
            // Update style with current layer's style as most recent
            mergedLayers[i].style = { ...mergedLayers[i].style, ...cur.style };
          }
          state.layers = mergedLayers;
          // Flatten paths for backward compatibility
          state.paths = [];
          for (const lyr of state.layers) for (const p of lyr.paths) state.paths.push(p);

          // Stickers + sticker style (hydrate once, without clobbering new in-session stickers)
          if (Array.isArray(existing.stickers)) {
            const have = new Set((state.stickers || []).map(s => s?.id).filter(Boolean));
            const incoming = existing.stickers.map(s => {
              const id = s.id || newStickerId();
              const kind = (s.kind === 'text') ? 'text'
                : (s.kind === 'image') ? 'image'
                : ((typeof s.text === 'string' && !s.dataUrl && !s.dataKey) ? 'text' : 'image');
              const dataUrl = (typeof s.dataUrl === 'string' && s.dataUrl) ? s.dataUrl : null;
              const dataKey = (typeof s.dataKey === 'string' && s.dataKey) ? s.dataKey : ((kind === 'image') ? stickerDataKeyForId(id) : undefined);
              if (kind === 'image' && dataUrl && dataKey) {
                try { __idbSet(__IAMCCS_IDB_STORE_STICKERS, dataKey, dataUrl); } catch {}
              }
              return {
                id,
                x: typeof s.x === 'number' ? s.x : 0,
                y: typeof s.y === 'number' ? s.y : 0,
                w: typeof s.w === 'number' ? s.w : 120,
                h: typeof s.h === 'number' ? s.h : 120,
                rot: typeof s.rot === 'number' ? s.rot : 0,
                kind,
                pinned: !!s.pinned,
                parentStickerId: (typeof s.parentStickerId === 'string' && s.parentStickerId) ? s.parentStickerId : undefined,
                dataUrl,
                dataKey,
                text: (typeof s.text === 'string') ? s.text : '',
              };
            }).filter(s => (s.kind === 'text') ? true : (!!s.dataUrl || !!s.dataKey));
            if (!Array.isArray(state.stickers) || !state.stickers.length) {
              state.stickers = incoming;
            } else {
              for (const st of incoming) {
                if (!have.has(st.id)) state.stickers.push(st);
              }
            }

            // Lazy-load any missing screenshot blobs from IndexedDB
            try {
              for (const st of (state.stickers || [])) {
                if (!st || isTextSticker(st)) continue;
                if (!st.dataUrl && st.dataKey) requestHydrateStickerData(st.id, st.dataKey);
              }
            } catch {}
          }
          if (existing.stickerStyle && typeof existing.stickerStyle === 'object') {
            if (typeof existing.stickerStyle.frameColor === 'string') state.stickerFrameColor = existing.stickerStyle.frameColor;
            if (typeof existing.stickerStyle.paddingPx === 'number') state.stickerPaddingPx = existing.stickerStyle.paddingPx;
            if (typeof existing.stickerStyle.borderWidthPx === 'number') state.stickerBorderWidthPx = existing.stickerStyle.borderWidthPx;
            if (typeof existing.stickerStyle.shadow === 'boolean') state.stickerShadow = existing.stickerStyle.shadow;
            if (typeof existing.stickerStyle.shadowStrength === 'number') state.stickerShadowStrength = existing.stickerStyle.shadowStrength;
          }

          // Clamp current layer index
          if (state.currentLayerIdx >= state.layers.length) state.currentLayerIdx = Math.max(0, state.layers.length - 1);
          state.hydrated = true;
        } catch (e) {
          console.warn('[IAMCCS] ensureStateHydratedFromExisting failed:', e);
        }
      }

      function persistToGraphExtra(force = false) {
        if (!app?.graph) return;
        // Merge existing annotations if we haven't hydrated yet (prevents overwriting)
        ensureStateHydratedFromExisting();
        app.graph.extra = app.graph.extra || {};
        const key = getActiveGraphKey();
        state._activeGraphKey = key;
        // Keep a stable workflow signature for autosave (survive refresh)
        try { if (!state._workflowSig) state._workflowSig = computeWorkflowSignature(); } catch {}
        const payload = buildAnnotationsPayload();

        // Always autosave locally so deletes/modifications survive refresh.
        // Debounced to avoid spamming localStorage during drags.
        scheduleLocalAutosave(payload, { immediate: !!force });

        if (!state.saveWithWorkflow) return;
        writeAnnotationsToExtra(key, payload);
        console.log('[IAMCCS] Annotazioni salvate in workflow.extra');
      }

      function applyAnnotationsData(data) {
        if (!data) return false;

        // Restore per-workflow options (backward compatible: only apply if present)
        // NOTE: Annotate must always start DISABLED when opening a workflow.
        // We intentionally ignore any persisted `enabled` value.
        if (typeof data.color === 'string') state.color = data.color;
        if (typeof data.width === 'number') state.width = data.width;
        if (typeof data.opacity === 'number') state.opacity = data.opacity;
        if (typeof data.eraser === 'boolean') state.eraser = data.eraser;
        if (typeof data.constantScreen === 'boolean') state.constantScreen = data.constantScreen;
        if (typeof data.dashed === 'boolean') state.dashed = data.dashed;
        if (typeof data.hidden === 'boolean') state.hidden = data.hidden;
        if (typeof data.penOnly === 'boolean') state.penOnly = data.penOnly;
        if (typeof data.hiDPIx2 === 'boolean') state.hiDPIx2 = data.hiDPIx2;
        if (typeof data.selOverride === 'boolean') state.selOverride = data.selOverride;
        if (typeof data.pinMode === 'boolean') state.pinMode = data.pinMode;

        if (typeof data.widthDraw === 'number') state.widthDraw = data.widthDraw;
        if (typeof data.widthErase === 'number') state.widthErase = data.widthErase;
        if (typeof data.opacityDraw === 'number') state.opacityDraw = data.opacityDraw;
        if (typeof data.opacityErase === 'number') state.opacityErase = data.opacityErase;

        if (typeof data.tool === 'string') {
          try { setTool(data.tool); } catch { state.tool = data.tool; }
        }
        if (typeof data.selectMode === 'string') {
          try { setSelectMode(data.selectMode); } catch { state.selectMode = data.selectMode; }
        }
        if (typeof data.transformMode === 'string') {
          try { setTransformMode(data.transformMode); } catch { state.transformMode = data.transformMode; }
        }

        if (typeof data.textFontFamily === 'string') state.textFontFamily = data.textFontFamily;
        if (typeof data.textFontSize === 'number') state.textFontSize = data.textFontSize;
        if (typeof data.textColor === 'string') state.textColor = data.textColor;
        if (typeof data.textFontWeight === 'string') state.textFontWeight = data.textFontWeight;
        if (typeof data.textFontStyle === 'string') state.textFontStyle = data.textFontStyle;
        if (typeof data.textUnderline === 'boolean') state.textUnderline = data.textUnderline;

        // Load layers if available (v2), otherwise load paths (v1)
        if (Array.isArray(data.layers) && data.layers.length > 0) {
          state.layers = data.layers.map(layer => ({
            name: layer.name || 'Layer',
            kind: (layer.kind === 'text') ? 'text' : 'draw',
            textStickerId: (typeof layer.textStickerId === 'string') ? layer.textStickerId : undefined,
            visible: layer.visible !== false,
            locked: !!layer.locked,
            paths: Array.isArray(layer.paths) ? layer.paths.map(p => ({
              color: p.color || '#ff4444',
              width: p.width || 3,
              opacity: typeof p.opacity === 'number' ? p.opacity : 1,
              mode: p.mode === 'erase' ? 'erase' : 'draw',
              dashed: !!p.dashed,
              points: Array.isArray(p.points) ? p.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
            })) : [],
            style: (layer.style && typeof layer.style === 'object') ? {
              color: typeof layer.style.color === 'string' ? layer.style.color : (state.color || '#ff4444'),
              dashed: !!layer.style.dashed,
              widthDraw: (typeof layer.style.widthDraw === 'number') ? layer.style.widthDraw : (state.widthDraw || 7),
              widthErase: (typeof layer.style.widthErase === 'number') ? layer.style.widthErase : (state.widthErase || 48),
              opacityDraw: (typeof layer.style.opacityDraw === 'number') ? layer.style.opacityDraw : (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0),
              opacityErase: (typeof layer.style.opacityErase === 'number') ? layer.style.opacityErase : (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0),
            } : { color: state.color || '#ff4444', dashed: !!state.dashed, widthDraw: state.widthDraw || 7, widthErase: state.widthErase || 48, opacityDraw: (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0), opacityErase: (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0) },
          }));
          state.currentLayerIdx = typeof data.currentLayerIdx === 'number' ? data.currentLayerIdx : 0;
        } else if (Array.isArray(data.paths)) {
          // Fallback to v1 format: migrate paths into layers
          state.paths = data.paths.map(p => ({
            color: p.color || '#ff4444',
            width: p.width || 3,
            opacity: typeof p.opacity === 'number' ? p.opacity : 1,
            mode: p.mode === 'erase' ? 'erase' : 'draw',
            dashed: !!p.dashed,
            points: Array.isArray(p.points) ? p.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
          }));
          // Also populate first layer
          if (state.layers[0]) {
            ensureLayerStyle(state.layers[0]);
            state.layers[0].paths = [...state.paths];
          } else {
            state.layers = [{ name: 'Layer 1', visible: true, locked: false, paths: [...state.paths], style: { color: state.color || '#ff4444', dashed: !!state.dashed, widthDraw: state.widthDraw || 7, widthErase: state.widthErase || 48, opacityDraw: (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0), opacityErase: (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0) } }];
          }
        } else {
          return false;
        }

        // Stickers + sticker style
        // NOTE: screenshots can be huge; we keep them in IndexedDB and persist only a small dataKey.
        let __needsShrink = false;
        if (Array.isArray(data.stickers)) {
          state.stickers = data.stickers.map(s => {
            const id = s.id || newStickerId();
            const kind = (s.kind === 'text') ? 'text'
              : (s.kind === 'image') ? 'image'
              : ((typeof s.text === 'string' && !s.dataUrl && !s.dataKey) ? 'text' : 'image');
            const dataUrl = (typeof s.dataUrl === 'string' && s.dataUrl) ? s.dataUrl : null;
            const dataKey = (typeof s.dataKey === 'string' && s.dataKey) ? s.dataKey : ((kind === 'image') ? stickerDataKeyForId(id) : undefined);
            if (kind === 'image' && dataUrl && dataKey) {
              __needsShrink = true;
              try { __idbSet(__IAMCCS_IDB_STORE_STICKERS, dataKey, dataUrl); } catch {}
            }
            return {
              id,
              x: typeof s.x === 'number' ? s.x : 0,
              y: typeof s.y === 'number' ? s.y : 0,
              w: typeof s.w === 'number' ? s.w : 120,
              h: typeof s.h === 'number' ? s.h : 120,
              rot: typeof s.rot === 'number' ? s.rot : 0,
              kind,
              pinned: !!s.pinned,
              parentStickerId: (typeof s.parentStickerId === 'string' && s.parentStickerId) ? s.parentStickerId : undefined,
              dataUrl,
              dataKey,
              text: (typeof s.text === 'string') ? s.text : '',
              fontFamily: (typeof s.fontFamily === 'string') ? s.fontFamily : (state.textFontFamily || 'Arial'),
              fontSize: (typeof s.fontSize === 'number') ? s.fontSize : (Number(state.textFontSize) || 28),
              textColor: (typeof s.textColor === 'string') ? s.textColor : (state.textColor || '#111111'),
              fontWeight: (typeof s.fontWeight === 'string') ? s.fontWeight : undefined,
              fontStyle: (typeof s.fontStyle === 'string') ? s.fontStyle : undefined,
              underline: (typeof s.underline === 'boolean') ? s.underline : undefined,
            };
          }).filter(s => (s.kind === 'text') ? true : (!!s.dataUrl || !!s.dataKey));
        } else {
          state.stickers = state.stickers || [];
        }
        if (data.stickerStyle && typeof data.stickerStyle === 'object') {
          if (typeof data.stickerStyle.frameColor === 'string') state.stickerFrameColor = data.stickerStyle.frameColor;
          if (typeof data.stickerStyle.paddingPx === 'number') state.stickerPaddingPx = data.stickerStyle.paddingPx;
          if (typeof data.stickerStyle.borderWidthPx === 'number') state.stickerBorderWidthPx = data.stickerStyle.borderWidthPx;
          if (typeof data.stickerStyle.shadow === 'boolean') state.stickerShadow = data.stickerStyle.shadow;
          if (typeof data.stickerStyle.shadowStrength === 'number') state.stickerShadowStrength = data.stickerStyle.shadowStrength;
        }

        // Refresh flat paths from layers to keep v1 compatibility
        state.paths = [];
        for (const lyr of state.layers) for (const p of lyr.paths) state.paths.push(p);
        state.hydrated = true;

        // If legacy workflows embedded screenshots directly, immediately shrink the workflow payload
        // (data moved to IndexedDB) to avoid ComfyUI workflow persistence quota errors.
        try {
          if (__needsShrink && state.saveWithWorkflow) {
            persistToGraphExtra(true);
          }
        } catch {}

        // Lazy-load any screenshot blobs that weren't embedded
        try {
          for (const st of (state.stickers || [])) {
            if (!st || isTextSticker(st)) continue;
            if (!st.dataUrl && st.dataKey) requestHydrateStickerData(st.id, st.dataKey);
          }
        } catch {}

        app?.canvas?.setDirty(true, true);
        console.log('[IAMCCS] Annotazioni caricate');
        // Apply style of selected layer to current brush
        try { applyLayerStyleToState(); } catch {}
        try { syncStickerUI(); } catch {}
        try { syncToolsUI(); } catch {}
        try { syncBrushOpacityUI(); } catch {}
        try { syncFlagsUI(); } catch {}
        try { syncUI(); } catch {}
        return true;
      }

      function buildAnnotationsPayload() {
        return {
          version: 2,
          enabled: !!state.enabled,
          color: state.color,
          width: state.width,
          // Per-workflow options (so switching workflows does not leak UI/options)
          opacity: state.opacity,
          eraser: !!state.eraser,
          constantScreen: !!state.constantScreen,
          dashed: !!state.dashed,
          hidden: !!state.hidden,
          penOnly: !!state.penOnly,
          hiDPIx2: !!state.hiDPIx2,
          selOverride: !!state.selOverride,
          pinMode: !!state.pinMode,
          tool: state.tool,
          selectMode: state.selectMode,
          transformMode: state.transformMode,
          widthDraw: state.widthDraw,
          widthErase: state.widthErase,
          opacityDraw: state.opacityDraw,
          opacityErase: state.opacityErase,
          textFontFamily: state.textFontFamily,
          textFontSize: state.textFontSize,
          textColor: state.textColor,
          textFontWeight: state.textFontWeight,
          textFontStyle: state.textFontStyle,
          textUnderline: !!state.textUnderline,
          paths: state.paths,
          layers: state.layers,
          currentLayerIdx: state.currentLayerIdx,
          stickers: Array.isArray(state.stickers) ? state.stickers.map(s => ({
            id: s.id,
            x: s.x,
            y: s.y,
            w: s.w,
            h: s.h,
            rot: typeof s.rot === 'number' ? s.rot : 0,
            kind: (s.kind === 'text') ? 'text'
              : (s.kind === 'image') ? 'image'
              : ((typeof s.text === 'string' && !s.dataUrl && !s.dataKey) ? 'text' : 'image'),
            pinned: !!s.pinned,
            parentStickerId: (typeof s.parentStickerId === 'string' && s.parentStickerId) ? s.parentStickerId : undefined,
            // For screenshots, persist only a key and store data in IndexedDB to avoid quota issues.
            dataKey: (() => {
              try {
                const kind = (s.kind === 'text') ? 'text'
                  : (s.kind === 'image') ? 'image'
                  : ((typeof s.text === 'string' && !s.dataUrl && !s.dataKey) ? 'text' : 'image');
                if (kind !== 'image') return undefined;
                const dk = (typeof s.dataKey === 'string' && s.dataKey) ? s.dataKey : stickerDataKeyForId(s.id);
                if (dk && s.dataUrl) {
                  try { __idbSet(__IAMCCS_IDB_STORE_STICKERS, dk, s.dataUrl); } catch {}
                }
                return dk || undefined;
              } catch {
                return undefined;
              }
            })(),
            text: (typeof s.text === 'string') ? s.text : undefined,
            fontFamily: (typeof s.fontFamily === 'string') ? s.fontFamily : undefined,
            fontSize: (typeof s.fontSize === 'number') ? s.fontSize : undefined,
            textColor: (typeof s.textColor === 'string') ? s.textColor : undefined,
            fontWeight: (typeof s.fontWeight === 'string') ? s.fontWeight : undefined,
            fontStyle: (typeof s.fontStyle === 'string') ? s.fontStyle : undefined,
            underline: (typeof s.underline === 'boolean') ? s.underline : undefined,
          })) : [],
          stickerStyle: {
            frameColor: state.stickerFrameColor,
            paddingPx: state.stickerPaddingPx,
            borderWidthPx: state.stickerBorderWidthPx,
            shadow: !!state.stickerShadow,
            shadowStrength: state.stickerShadowStrength,
          },
        };
      }

      function removeFromGraphExtra() {
        if (!app?.graph?.extra) return;
        const key = getActiveGraphKey();
        try {
          if (app.graph.extra.iamccs_annotations_multi?.graphs) {
            delete app.graph.extra.iamccs_annotations_multi.graphs[key];
          }
        } catch {}
        delete app.graph.extra.iamccs_annotations;
        console.log('[IAMCCS] Annotazioni rimosse da workflow.extra');
      }

      function loadFromGraphExtra() {
        const key = getActiveGraphKey();
        state._activeGraphKey = key;
        const data = readAnnotationsFromExtra(key);
        if (!data) return false;
        return applyAnnotationsData(data);
      }

      function getActiveGraphKey() {
        try {
          const g = (app?.canvas?.graph) || app?.graph;
          const base = (
            (g && (g._uid ?? g._id ?? g.uid ?? g.id ?? g.name)) ??
            (g === app?.graph ? 'root' : 'sub')
          );
          const sub = g && g._subgraph_node ? (g._subgraph_node.id ?? g._subgraph_node.title ?? g._subgraph_node.type) : null;
          return String(base) + (sub != null ? `:${String(sub)}` : '');
        } catch {
          return 'root';
        }
      }

      function readAnnotationsFromExtra(key) {
        const extra = app?.graph?.extra;
        if (!extra) return null;
        const multi = extra.iamccs_annotations_multi;
        if (multi && multi.graphs && Object.prototype.hasOwnProperty.call(multi.graphs, key)) {
          return multi.graphs[key];
        }
        return extra.iamccs_annotations || null;
      }

      function writeAnnotationsToExtra(key, payload) {
        if (!app?.graph) return;
        app.graph.extra = app.graph.extra || {};
        // Keep legacy field for compatibility (current graph only)
        app.graph.extra.iamccs_annotations = payload;
        // Multi-graph storage
        const multi = app.graph.extra.iamccs_annotations_multi || { version: 2, graphs: {} };
        multi.version = 2;
        multi.graphs = multi.graphs || {};
        multi.graphs[key] = payload;
        app.graph.extra.iamccs_annotations_multi = multi;
      }

      function exportAnnotations() {
        try {
          // Include current in-progress stroke if any (without mutating state)
          const paths = state.current ? [...state.paths, state.current] : state.paths;
          // Serialize full workflow (if available) and inject annotations into extra
          let wf = null;
          try { wf = app?.graph?.serialize ? app.graph.serialize() : null; } catch {}
          if (!wf) wf = { last_node_id: undefined, last_link_id: undefined, nodes: [], links: [], groups: [], config: {}, extra: {} };
          wf.extra = wf.extra || {};
          wf.extra.iamccs_annotations = { version: 1, color: state.color, width: state.width, paths };
          const blob = new Blob([JSON.stringify(wf, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const date = new Date().toISOString().replace(/[:.]/g, '-');
          a.href = url;
          a.download = `workflow-with-annotations-${date}.json`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
        } catch (e) {
          console.error('[IAMCCS] Export failed:', e);
        }
      }

      function importAnnotations(file) {
        try {
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const data = JSON.parse(String(reader.result||'{}'));
              const ann = (data && data.extra && data.extra.iamccs_annotations) ? data.extra.iamccs_annotations : data;
              const paths = Array.isArray(ann) ? ann : (Array.isArray(ann.paths) ? ann.paths : []);
              state.paths = paths.map(p => ({
                color: p.color || state.color,
                width: p.width || state.width,
                opacity: typeof p.opacity === 'number' ? p.opacity : 1,
                mode: p.mode === 'erase' ? 'erase' : 'draw',
                dashed: !!p.dashed,
                points: Array.isArray(p.points) ? p.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
              }));
              app?.canvas?.setDirty(true, true);
              // Put into first layer for compatibility
              if (!state.layers[0]) state.layers[0] = { name: 'Layer 1', visible: true, locked: false, paths: [], style: { color: state.color || '#ff4444', dashed: !!state.dashed, widthDraw: state.widthDraw || 7, widthErase: state.widthErase || 48, opacityDraw: (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0), opacityErase: (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0) } };
              ensureLayerStyle(state.layers[0]);
              state.layers[0].paths = [...state.paths];
              state.hydrated = true;
              if (state.saveWithWorkflow) persistToGraphExtra(true);
              console.log('[IAMCCS] Annotations imported:', state.paths.length);
            } catch (err) {
              console.error('[IAMCCS] Invalid JSON for import:', err);
            }
          };
          reader.readAsText(file);
        } catch (e) {
          console.error('[IAMCCS] Import failed:', e);
        }
      }

      // Import workflow or annotations from an object
      async function importFromObject(obj) {
        try {
          // Workflow JSON usually has nodes array
          if (obj && Array.isArray(obj.nodes)) {
            if (typeof app?.loadGraphData === 'function') {
              await app.loadGraphData(obj);
              // handleWorkflowChange will run via our wrapped loadGraphData
              console.log('[IAMCCS] Workflow imported');
              return true;
            } else {
              console.warn('[IAMCCS] app.loadGraphData is not available');
              return false;
            }
          }
          // Otherwise, try to import annotations only
          const ann = (obj && obj.extra && obj.extra.iamccs_annotations) ? obj.extra.iamccs_annotations : obj;
          const paths = Array.isArray(ann) ? ann : (Array.isArray(ann?.paths) ? ann.paths : []);
          if (paths && Array.isArray(paths)) {
            state.paths = paths.map(p => ({
              color: p.color || state.color,
              width: p.width || state.width,
              opacity: typeof p.opacity === 'number' ? p.opacity : 1,
              mode: p.mode === 'erase' ? 'erase' : 'draw',
              dashed: !!p.dashed,
              points: Array.isArray(p.points) ? p.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
            }));
            // Put into the first layer for compatibility
            if (state.layers[0]) state.layers[0].paths = [...state.paths];
            app?.canvas?.setDirty(true, true);
            state.hydrated = true;
            if (state.saveWithWorkflow) persistToGraphExtra(true);
            console.log('[IAMCCS] Annotations imported (from object):', state.paths.length);
            return true;
          }
        } catch (e) {
          console.error('[IAMCCS] Import from object failed:', e);
        }
        return false;
      }

      // Open file picker and import workflow (Ctrl+I)
      function promptImportWorkflow() {
        try {
          const inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = 'application/json,.json';
          inp.onchange = async () => {
            try {
              const f = inp.files && inp.files[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = async () => {
                try {
                  const obj = JSON.parse(String(reader.result||'{}'));
                  await importFromObject(obj);
                } catch (e) {
                  console.error('[IAMCCS] Invalid workflow JSON:', e);
                }
              };
              reader.readAsText(f);
            } catch (e) {
              console.error('[IAMCCS] Could not import workflow:', e);
            }
          };
          inp.click();
        } catch (e) {
          console.error('[IAMCCS] Could not open file picker:', e);
        }
      }

      // Expose a minimal bridge for workflow change handling
      try {
        window.IAMCCS_ANNOTATE_MODULE = {
          _handleWorkflowChange() {
            // New graph loaded: reset workflow signature so autosave key matches
            try { state._workflowSig = null; } catch {}
            // Prevent cross-workflow paste of annotations via the extension clipboard
            try { state.clipboard = null; } catch {}
            try { state.pendingSelection = null; } catch {}
            try { state.activePointerId = null; } catch {}
            try { state.undoStack = []; state.redoStack = []; } catch {}

            // Requirement: whenever a workflow is opened/switched, Annotate starts DISABLED.
            // Keep per-workflow memory (layers/options) but do not stay enabled across workflows.
            try { setEnabled(false); } catch { state.enabled = false; }
            // If the workflow was loaded via app.loadGraphData, we can detect whether that JSON
            // actually contains annotations. ComfyUI may keep app.graph.extra between loads,
            // so we must proactively clear stale annotations to avoid copying between workflows.
            try {
              const last = window.__IAMCCS_LAST_LOADED_WORKFLOW;
              if (last && last.hasIamccsAnnotations === false) {
                // Incoming workflow has no annotations -> ensure graph.extra doesn't keep old ones.
                try { removeFromGraphExtra(); } catch {}
              } else if (last && last.hasIamccsAnnotations === true) {
                // Incoming workflow has annotations -> ensure graph.extra reflects the loaded JSON.
                try {
                  app.graph.extra = app.graph.extra || {};
                  if (last.iamccs_annotations != null) app.graph.extra.iamccs_annotations = last.iamccs_annotations;
                  if (last.iamccs_annotations_multi != null) app.graph.extra.iamccs_annotations_multi = last.iamccs_annotations_multi;
                } catch {}
              }
            } catch {}

            // If the new graph contains annotations, load them; otherwise clear local state.
            // IMPORTANT: when Save-with-workflow is OFF, do not auto-load from workflow.extra
            // (it may contain stale data from a previous session and would resurrect deleted items).
            const loaded = state.saveWithWorkflow ? loadFromGraphExtra() : false;
            if (!loaded) {
              // Fallback: restore from local autosave (survive refresh)
              try {
                const key = getActiveGraphKey();
                state._activeGraphKey = key;
                // Legacy autosaves (older versions): localStorage-based (sync)
                const legacy = readLocalAutosaveLegacy(key);
                if (legacy && applyAnnotationsData(legacy)) return;

                // Current autosaves: IndexedDB-based (async)
                readLocalAutosaveAsync(key).then((local) => {
                  try {
                    if (local && applyAnnotationsData(local)) {
                      // Enforce disabled state even after async restore
                      try { setEnabled(false); } catch { state.enabled = false; }
                    }
                  } catch {}
                });
              } catch {}
              // Reset to default state (layers + options) so nothing leaks across workflows
              state.enabled = false;
              state.tool = 'draw';
              state.selectMode = 'rect';
              state.transformMode = 'fixed';
              state.pinMode = false;
              state.selOverride = false;
              state.eraser = false;
              state.constantScreen = false;
              state.dashed = false;
              state.hidden = false;
              state.penOnly = false;
              state.hiDPIx2 = false;
              state.activePointerId = null;

              state.color = '#ff4444';
              state.width = 7;
              state.opacity = 1.0;
              state.widthDraw = 7;
              state.widthErase = 48;
              state.opacityDraw = 1.0;
              state.opacityErase = 1.0;

              state.textFontFamily = 'Arial';
              state.textFontSize = 28;
              state.textColor = '#111111';
              state.textFontWeight = 'normal';
              state.textFontStyle = 'normal';
              state.textUnderline = false;
              try { closeTextEditor({ commit: true }); } catch {}
              state._textControlsOpen = false;

              state.paths = [];
              state.current = null;
              state.stickers = [];
              state.selection = null;
              state.pendingSelection = null;
              state.stickerDrag = null;
              state.stickerResize = null;
              state.transformDrag = null;
              state.rotateDrag = null;

              state.stickerFrameColor = '#ffffff';
              state.stickerPaddingPx = 10;
              state.stickerBorderWidthPx = 2;
              state.stickerShadow = true;
              state.stickerShadowStrength = 12;

              state.currentLayerIdx = 0;
              state.layers = [{ name: 'Layer 1', visible: true, locked: false, paths: [], style: { color: '#ff4444', dashed: false, widthDraw: 7, widthErase: 48, opacityDraw: 1.0, opacityErase: 1.0 } }];
              state.hydrated = true;

              try { syncStickerUI(); } catch {}
              try { syncToolsUI(); } catch {}
              try { syncBrushOpacityUI(); } catch {}
              try { syncFlagsUI(); } catch {}
              try { syncUI(); } catch {}
              app?.canvas?.setDirty(true, true);
            }

            // Enforce disabled state after load/reset as well.
            try { setEnabled(false); } catch { state.enabled = false; }
          }
        };
      } catch {}

    // Layer management + per-layer style
    function ensureLayerStyle(layer) {
      if (!layer) return;
      layer.style = layer.style || {};
      if (typeof layer.style.color !== 'string') layer.style.color = state.color || '#ff4444';
      if (typeof layer.style.dashed !== 'boolean') layer.style.dashed = !!state.dashed;
      if (typeof layer.style.widthDraw !== 'number') layer.style.widthDraw = state.widthDraw || 7;
      if (typeof layer.style.widthErase !== 'number') layer.style.widthErase = state.widthErase || 48;
      if (typeof layer.style.opacityDraw !== 'number') layer.style.opacityDraw = (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0);
      if (typeof layer.style.opacityErase !== 'number') layer.style.opacityErase = (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0);
    }

    function saveStateToLayerStyle(layerIdx, { persist = false } = {}) {
      const li = (typeof layerIdx === 'number') ? layerIdx : state.currentLayerIdx;
      const lyr = state.layers?.[li];
      if (!lyr) return false;
      ensureLayerStyle(lyr);
      const sty = lyr.style;
      // Color + dashed are always stored per-layer
      if (typeof state.color === 'string') sty.color = state.color;
      sty.dashed = !!state.dashed;

      // Keep draw/erase values in sync (per-layer memory)
      if (typeof state.widthDraw === 'number') sty.widthDraw = state.widthDraw;
      if (typeof state.widthErase === 'number') sty.widthErase = state.widthErase;
      if (typeof state.opacityDraw === 'number') sty.opacityDraw = state.opacityDraw;
      if (typeof state.opacityErase === 'number') sty.opacityErase = state.opacityErase;

      // Also reflect the *currently active* mode values (covers keyboard-driven changes)
      if (state.eraser) {
        if (typeof state.width === 'number') sty.widthErase = state.width;
        if (typeof state.opacity === 'number') sty.opacityErase = state.opacity;
      } else {
        if (typeof state.width === 'number') sty.widthDraw = state.width;
        if (typeof state.opacity === 'number') sty.opacityDraw = state.opacity;
      }

      if (persist) {
        try { persistToGraphExtra(); } catch {}
      }
      return true;
    }

    function syncTextToolStateFromActiveTextLayer() {
      try {
        const lyr = state.layers?.[state.currentLayerIdx];
        if (!lyr || lyr.kind !== 'text' || !lyr.textStickerId) return false;
        const si = getStickerIdxById(lyr.textStickerId);
        const st = si >= 0 ? state.stickers?.[si] : null;
        if (!st || !isTextSticker(st)) return false;

        if (typeof st.fontFamily === 'string') state.textFontFamily = st.fontFamily;
        if (typeof st.fontSize === 'number') state.textFontSize = st.fontSize;
        state.textFontWeight = String(st.fontWeight || state.textFontWeight || 'normal');
        state.textFontStyle = String(st.fontStyle || state.textFontStyle || 'normal');
        state.textUnderline = !!(st.underline ?? state.textUnderline);
        if (typeof st.textColor === 'string') state.textColor = st.textColor;

        // If context menu is open, update its text controls to reflect the selected text layer
        try {
          if (ui.contextMenu) {
            const textFont = ui.contextMenu.querySelector('#ctx_text_font');
            const textSize = ui.contextMenu.querySelector('#ctx_text_size');
            const textBold = ui.contextMenu.querySelector('#ctx_text_bold');
            const textItalic = ui.contextMenu.querySelector('#ctx_text_italic');
            const textUnderline = ui.contextMenu.querySelector('#ctx_text_underline');
            if (textFont) textFont.value = String(state.textFontFamily || 'Arial');
            if (textSize) textSize.value = String(Number(state.textFontSize) || 28);
            if (textBold) textBold.style.background = (state.textFontWeight === 'bold') ? '#fb8c00' : '#37474f';
            if (textItalic) textItalic.style.background = (state.textFontStyle === 'italic') ? '#fb8c00' : '#37474f';
            if (textUnderline) textUnderline.style.background = state.textUnderline ? '#fb8c00' : '#37474f';
          }
        } catch {}

        return true;
      } catch {
        return false;
      }
    }
    function getCurrentLayer() {
      const lyr = state.layers[state.currentLayerIdx];
      ensureLayerStyle(lyr);
      return lyr;
    }
    function getCurrentLayerStyle() {
      const lyr = getCurrentLayer();
      return lyr?.style || {};
    }
    function applyLayerStyleToState() {
      const style = getCurrentLayerStyle();
      state.color = style.color;
      state.dashed = !!style.dashed;
      if (state.eraser) {
        state.width = style.widthErase;
        state.opacity = style.opacityErase;
      } else {
        state.width = style.widthDraw;
        state.opacity = style.opacityDraw;
      }
      state.widthDraw = style.widthDraw;
      state.widthErase = style.widthErase;
      state.opacityDraw = style.opacityDraw;
      state.opacityErase = style.opacityErase;
      syncFlagsUI();
      syncBrushOpacityUI();
      syncColorUI();
      syncUI();
      try { syncTextToolStateFromActiveTextLayer(); } catch {}
      app?.canvas?.setDirty(true, true);
    }
    function addLayer() {
      // Undo snapshot before structural operation
      pushHistorySnapshot();
      const layerNum = state.layers.length + 1;
      const base = { ...getCurrentLayerStyle() };
      state.layers.push({ name: `Layer ${layerNum}`, visible: true, locked: false, paths: [], style: {
        color: typeof base.color === 'string' ? base.color : (state.color || '#ff4444'),
        dashed: !!base.dashed,
        widthDraw: typeof base.widthDraw === 'number' ? base.widthDraw : (state.widthDraw || 7),
        widthErase: typeof base.widthErase === 'number' ? base.widthErase : (state.widthErase || 48),
        opacityDraw: typeof base.opacityDraw === 'number' ? base.opacityDraw : (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0),
        opacityErase: typeof base.opacityErase === 'number' ? base.opacityErase : (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0),
      } });
      state.currentLayerIdx = state.layers.length - 1;
      app?.canvas?.setDirty(true, true);
      persistToGraphExtra(true);
      return state.layers.length - 1;
    }
    function deleteLayer(idx) {
      if (!Array.isArray(state.layers) || idx < 0 || idx >= state.layers.length) return false;

      const target = state.layers[idx];
      const isTextLayer = (target?.kind === 'text');
      const normalCount = state.layers.reduce((acc, lyr) => acc + ((lyr?.kind === 'text') ? 0 : 1), 0);

      // Keep at least one *normal* (non-text) layer at all times
      if (!isTextLayer && normalCount <= 1) return false;

      // Also avoid leaving zero layers in weird states
      if (state.layers.length <= 1 && isTextLayer) return false;

      // Undo snapshot before destructive operation
      pushHistorySnapshot();

      try {
        const lyr = state.layers[idx];
        if (lyr?.kind === 'text' && lyr.textStickerId) {
          const sid = lyr.textStickerId;
          const si = getStickerIdxById(sid);
          if (si >= 0) {
            if (state.textEditor?.stickerId === sid) {
              try { closeTextEditor({ commit: true }); } catch {}
            }
            state.stickers.splice(si, 1);
          }
        }
      } catch {}
      state.layers.splice(idx, 1);
      if (state.currentLayerIdx >= state.layers.length) state.currentLayerIdx = state.layers.length - 1;

      // Safety: if we ever end up with no normal layer (legacy state), recreate one
      try {
        const normalCount2 = state.layers.reduce((acc, lyr) => acc + ((lyr?.kind === 'text') ? 0 : 1), 0);
        if (normalCount2 <= 0) {
          const layerNum = state.layers.length + 1;
          const baseColor = state.color || '#ff4444';
          state.layers.push({
            name: `Layer ${layerNum}`,
            visible: true,
            locked: false,
            paths: [],
            style: {
              color: baseColor,
              dashed: !!state.dashed,
              widthDraw: state.widthDraw || 7,
              widthErase: state.widthErase || 48,
              opacityDraw: (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0),
              opacityErase: (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0),
            }
          });
          if (state.currentLayerIdx < 0) state.currentLayerIdx = 0;
        }
      } catch {}

      // Refresh flat paths so deleted layer strokes don't linger
      try {
        state.paths = [];
        for (const lyr of state.layers) for (const p of (lyr?.paths || [])) state.paths.push(p);
      } catch {}

      app?.canvas?.setDirty(true, true);
      persistToGraphExtra(true);
      return true;
    }
    function toggleLayerVisibility(idx) {
      // Undo snapshot before structural operation
      pushHistorySnapshot();
      if (state.layers[idx]) state.layers[idx].visible = !state.layers[idx].visible;
      app?.canvas?.setDirty(true, true);
      persistToGraphExtra(true);
    }
    function toggleLayerLock(idx) {
      // Undo snapshot before structural operation
      pushHistorySnapshot();
      if (state.layers[idx]) state.layers[idx].locked = !state.layers[idx].locked;
      persistToGraphExtra(true);
    }
    function setCurrentLayer(idx) {
      if (idx >= 0 && idx < state.layers.length) {
        try { saveStateToLayerStyle(state.currentLayerIdx); } catch {}
        state.currentLayerIdx = idx;
        applyLayerStyleToState();
      }
    }

    // Keep menu anchored to the floating button when it moves/resizes
    function repositionContextMenuIfAnchored() {
      try {
        if (!ui.contextMenu || !ui.contextAnchor) return;
        let anchor = ui.contextAnchor.anchor;
        if (!anchor || !document.body.contains(anchor)) {
          // If anchor was recreated, prefer current floating button
          if (ui.floating && document.body.contains(ui.floating)) {
            // Keep relative offset to the new button using previous dx/dy if possible
            const r = ui.floating.getBoundingClientRect();
            const nx = Math.max(0, Math.min(window.innerWidth - ui.contextMenu.offsetWidth, r.left + (ui.contextAnchor.dx || 0)));
            const ny = Math.max(0, Math.min(window.innerHeight - ui.contextMenu.offsetHeight, r.top + (ui.contextAnchor.dy || -ui.contextMenu.offsetHeight - 8)));
            ui.contextMenu.style.left = nx + 'px';
            ui.contextMenu.style.top = ny + 'px';
            ui.contextAnchor = { anchor: ui.floating, dx: (ui.contextAnchor.dx||0), dy: (ui.contextAnchor.dy||-ui.contextMenu.offsetHeight - 8) };
            return;
          }
          return;
        }
        const r = anchor.getBoundingClientRect();
        const nx = Math.max(0, Math.min(window.innerWidth - ui.contextMenu.offsetWidth, r.left + (ui.contextAnchor.dx||0)));
        const ny = Math.max(0, Math.min(window.innerHeight - ui.contextMenu.offsetHeight, r.top + (ui.contextAnchor.dy||0)));
        ui.contextMenu.style.left = nx + 'px';
        ui.contextMenu.style.top = ny + 'px';
      } catch {}
    }

    function snapFloatingToggleToContextMenu(menu) {
      try {
        if (!menu || !ui.floating || !document.body.contains(ui.floating)) return;
        const btn = ui.floating;
        const mr = menu.getBoundingClientRect();
        const br = btn.getBoundingClientRect();
        const gap = 6;
        const side = ((mr.left + mr.width / 2) < (window.innerWidth / 2)) ? 'left' : 'right';

        // Prefer placing the button just above the menu corner; if it doesn't fit, place below.
        let top = mr.top - br.height - gap;
        if (top < 0) top = mr.bottom + gap;
        top = Math.max(0, Math.min(window.innerHeight - br.height, top));

        let left = (side === 'left') ? mr.left : (mr.right - br.width);
        left = Math.max(0, Math.min(window.innerWidth - br.width, left));

        btn.style.left = Math.round(left) + 'px';
        btn.style.top = Math.round(top) + 'px';
        btn.style.bottom = 'auto';
        savePos('iamccs_float_pos', { left: Math.round(left), top: Math.round(top) });

        // Re-anchor the menu so it keeps its current screen position relative to the snapped button.
        try {
          const br2 = btn.getBoundingClientRect();
          ui.contextAnchor = { anchor: btn, dx: mr.left - br2.left, dy: mr.top - br2.top };
        } catch {}
      } catch {}
    }

    function ensureFloatingToggle() {
      if (ui.floating && document.body.contains(ui.floating)) return ui.floating;
      const btn = document.createElement('button');
      btn.id = 'iamccs-floating-toggle';
      btn.textContent = state.enabled ? 'Annotate: ON' : 'Annotate: OFF';
      const saved = loadPos('iamccs_float_pos', { left: 180, top: null });
      btn.style.cssText = [
        'position:fixed',
        (saved.top == null ? 'bottom:12px' : ('top:' + Math.max(60, Math.min(window.innerHeight - 40, saved.top)) + 'px')),
        'left:' + Math.max(0, Math.min(window.innerWidth - 120, saved.left)) + 'px',
        'padding:8px 12px',
        'font-weight:600',
        'font-size:12px',
        'color:#fff',
        'background:' + (state.enabled ? '#2e7d32' : '#9e2b25'),
        'border:1px solid ' + (state.enabled ? '#66bb6a' : '#ef5350'),
        'border-radius:8px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.35)',
        'z-index:2000',
        'cursor:pointer',
      ].join(';');
      // Track if button was dragged (to avoid toggle on drag)
      let btnDragging = false;
      btn.addEventListener('pointerdown', () => { btnDragging = false; }, true);
      btn.addEventListener('click', (e) => {
        // Only toggle if not dragging
        if (!btnDragging) {
          e.preventDefault();
          e.stopPropagation();
          setEnabled(!state.enabled);
          try { __iamccsFlashCornerBadge(btn, 'done', state.enabled ? 'ON' : 'OFF', { ms: 800, bg: '#ff9800' }); } catch {}
        }
      }, true);
      // Right-click toggles context menu (and always closes if currently open)
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // If any menu is open, close it and stop propagation so global right-click closer doesn't interfere
        if (ui.contextMenu) {
          e.stopPropagation();
          closeContextMenu('toggle-btn');
          return;
        }
        showContextMenu(e.clientX, e.clientY, btn);
      }, true);
      document.body.appendChild(btn);
      try { __iamccsSetCornerBadge(btn, 'enabled', !!state.enabled, 'ON', { bg: '#ff9800' }); } catch {}
      ui.floating = btn;
      // Make draggable (whole button) and move menu with it if open
      makeDraggable(btn, {
        storageKey: 'iamccs_float_pos',
        isFixed: true,
        onDragStart: () => { btnDragging = true; }, // Set flag when drag starts
        onDrag: ({ left, top }) => {
          if (ui.contextMenu && ui.contextAnchor && ui.contextAnchor.anchor === btn) {
            const nx = Math.max(0, Math.min(window.innerWidth - ui.contextMenu.offsetWidth, left + ui.contextAnchor.dx));
            const ny = Math.max(0, Math.min(window.innerHeight - ui.contextMenu.offsetHeight, top + ui.contextAnchor.dy));
            ui.contextMenu.style.left = nx + 'px';
            ui.contextMenu.style.top = ny + 'px';
          }
        }
      });
      // Keep anchored on window resize/scroll
      window.addEventListener('resize', repositionContextMenuIfAnchored, true);
      window.addEventListener('scroll', repositionContextMenuIfAnchored, true);
      return btn;
    }

    let __ctxOffClick = null;
    let __ctxOffRight = null;
    function closeContextMenu(reason) {
      try {
        if (ui.contextMenu && document.body.contains(ui.contextMenu)) ui.contextMenu.remove();
        ui.contextMenu = null;
        ui.contextAnchor = null;
        if (__ctxOffClick) {
          window.removeEventListener('mousedown', __ctxOffClick, true);
          __ctxOffClick = null;
        }
        if (__ctxOffRight) {
          window.removeEventListener('contextmenu', __ctxOffRight, true);
          __ctxOffRight = null;
        }
      } catch {}
    }

    function showContextMenu(x, y, anchorEl) {
      // Remove existing
      if (ui.contextMenu && document.body.contains(ui.contextMenu)) closeContextMenu('reopen');
      const menu = document.createElement('div');
      menu.id = 'iamccs-context-menu';
      menu.style.cssText = [
        'position:fixed',
        // left/top set after append so we can clamp using size
        'min-width:220px',
        'background:rgba(0,0,0,0.95)',
        'border:1px solid #444',
        'border-radius:8px',
        'padding:10px',
        'color:#fff',
        'z-index:3000',
        'font-family:Segoe UI, Arial',
        'box-shadow:0 4px 16px rgba(0,0,0,0.4)'
      ].join(';');
      menu.innerHTML = `
        <div style="font-weight:700;margin-bottom:8px;">IAMCCS_annotate - Options</div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button id="ctx_toggle" style="flex:1;padding:6px 8px;border:none;border-radius:6px;background:${state.enabled ? '#4CAF50' : '#f44336'};color:#fff;cursor:pointer;">${state.enabled ? 'ENABLED' : 'DISABLED'}</button>
          <button id="ctx_clear" title="Clear all" style="padding:6px 8px;border:none;border-radius:6px;background:#666;color:#fff;cursor:pointer;">🗑️</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
          <input id="ctx_color" type="color" value="${state.color}" style="width:36px;height:28px;border:none;border-radius:4px;background:transparent;cursor:pointer;">
          <div style="flex:1;">
            <div style="font-size:11px;color:#bbb;">Brush: <span id="ctx_wv">${state.width}</span>px</div>
            <input id="ctx_width" type="range" min="1" max="48" value="${state.width}" style="width:100%;">
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;">
          <div style="font-size:11px;color:#bbb;">Opacity: <span id="ctx_ov">${Math.round(state.opacity*100)}</span>%</div>
          <input id="ctx_opacity" type="range" min="10" max="100" step="5" value="${Math.round(state.opacity*100)}" style="flex:1;">
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
          <button id="ctx_eraser" style="padding:6px 8px;border:none;border-radius:6px;background:${state.eraser ? '#c2185b' : '#795548'};color:#fff;cursor:pointer;">${state.eraser ? '🩹 Eraser' : '✏️ Draw'}</button>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="ctx_constant" type="checkbox" ${state.constantScreen ? 'checked' : ''}>
            <span>Constant width</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="ctx_dashed" type="checkbox" ${state.dashed ? 'checked' : ''}>
            <span>Dashed</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="ctx_hidpi" type="checkbox" ${state.hiDPIx2 ? 'checked' : ''}>
            <span>HiDPI ×2</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="ctx_hidden" type="checkbox" ${state.hidden ? 'checked' : ''}>
            <span>Hide notes</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="ctx_penonly" type="checkbox" ${state.penOnly ? 'checked' : ''}>
            <span>Pen only</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="ctx_pinmode" type="checkbox" ${state.pinMode ? 'checked' : ''}>
            <span>Pin/unpin</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="ctx_sel_override" type="checkbox" ${state.selOverride ? 'checked' : ''}>
            <span>sel</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="ctx_savewf" type="checkbox" ${state.saveWithWorkflow ? 'checked' : ''}>
            <span>Save into WF</span>
          </label>
        </div>

        <div style="margin-top:10px;border-top:1px solid #555;padding-top:8px;">
          <div style="font-weight:600;color:#fff;font-size:12px;margin-bottom:6px;">Tools</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <button id="ctx_tool_draw" style="padding:6px 8px;border:none;border-radius:6px;background:#4CAF50;color:#fff;cursor:pointer;font-size:12px;">✏️ Draw</button>
            <button id="ctx_tool_select" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;">🔲 Select</button>
            <button id="ctx_tool_transform" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;">⛶ Transform</button>
            <button id="ctx_tool_rotate" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;">⟲ Rotate</button>
            <button id="ctx_tool_shot" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;">📸 Shot</button>
            <select id="ctx_select_mode" style="padding:6px 8px;border-radius:6px;background:#263238;color:#fff;border:1px solid #444;font-size:12px;">
              <option value="rect">Rect</option>
              <option value="lasso">Lasso</option>
            </select>
            <select id="ctx_transform_mode" style="padding:6px 8px;border-radius:6px;background:#263238;color:#fff;border:1px solid #444;font-size:12px;">
              <option value="fixed">Fixed</option>
              <option value="freeform">Freeform</option>
            </select>
            <button id="ctx_sel_clear" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Clear Sel</button>
            <button id="ctx_sel_copy" title="Ctrl+C" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Copy</button>
            <button id="ctx_sel_cut" title="Ctrl+X" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Cut</button>
            <button id="ctx_sel_paste" title="Ctrl+V" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Paste</button>
            <button id="ctx_undo" title="Undo" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Undo</button>
            <button id="ctx_redo" title="Redo" style="padding:6px 8px;border:none;border-radius:6px;background:#37474f;color:#fff;cursor:pointer;font-size:12px;">Redo</button>
          </div>
        </div>

        <div style="margin-top:10px;border-top:1px solid #555;padding-top:8px;">
          <div style="font-weight:600;color:#fff;font-size:12px;margin-bottom:6px;">Screenshot Post-it</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input id="ctx_sticker_color" type="color" value="${state.stickerFrameColor || '#ffffff'}" style="width:36px;height:28px;border:none;border-radius:4px;background:transparent;cursor:pointer;" title="Frame color">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">Pad
              <input id="ctx_sticker_pad" type="range" min="0" max="40" value="${Number(state.stickerPaddingPx) || 0}" style="width:120px;">
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">Border
              <input id="ctx_sticker_border" type="range" min="0" max="10" value="${Number(state.stickerBorderWidthPx) || 0}" style="width:90px;">
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
              <input id="ctx_sticker_shadow" type="checkbox" ${state.stickerShadow ? 'checked' : ''}>
              <span>Shadow</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">Strength
              <input id="ctx_sticker_shadow_strength" type="range" min="0" max="30" value="${Number(state.stickerShadowStrength) || 0}" style="width:110px;">
            </label>
            <button id="ctx_sticker_clear" title="Remove all post-its" style="padding:6px 8px;border:none;border-radius:6px;background:#6d4c41;color:#fff;cursor:pointer;font-size:12px;">Clear Post-its</button>
            <button id="ctx_sticker_purge" title="Remove old screenshot cache blobs (IndexedDB)" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;font-size:12px;">Purge old</button>
          </div>
        </div>
        <div style="margin-top:10px;border-top:1px solid #555;padding-top:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="font-weight:600;color:#fff;font-size:12px;">Layers</div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
              <span id="ctx_text_controls" style="display:${state._textControlsOpen ? 'flex' : 'none'};gap:6px;align-items:center;">
                <select id="ctx_text_font" style="padding:2px 6px;border-radius:4px;background:#263238;color:#fff;border:1px solid #444;font-size:11px;max-width:160px;"></select>
                <input id="ctx_text_size" type="number" min="8" max="200" step="1" value="${Number(state.textFontSize) || 28}" style="width:66px;padding:2px 6px;border-radius:4px;background:#263238;color:#fff;border:1px solid #444;font-size:11px;" title="Font size">
                <button id="ctx_text_norm" title="Normal" style="padding:2px 6px;border:none;border-radius:4px;background:#37474f;color:#fff;cursor:pointer;font-size:11px;">N</button>
                <button id="ctx_text_bold" title="Bold" style="padding:2px 6px;border:none;border-radius:4px;background:${state.textFontWeight === 'bold' ? '#fb8c00' : '#37474f'};color:#fff;cursor:pointer;font-size:11px;">B</button>
                <button id="ctx_text_italic" title="Italic" style="padding:2px 6px;border:none;border-radius:4px;background:${state.textFontStyle === 'italic' ? '#fb8c00' : '#37474f'};color:#fff;cursor:pointer;font-size:11px;">I</button>
                <button id="ctx_text_underline" title="Underline" style="padding:2px 6px;border:none;border-radius:4px;background:${state.textUnderline ? '#fb8c00' : '#37474f'};color:#fff;cursor:pointer;font-size:11px;">U</button>
              </span>
              <button id="ctx_add_text" title="Create a Text layer (drag to size, then type)" style="padding:2px 6px;border:none;border-radius:4px;background:#039be5;color:#fff;cursor:pointer;font-size:11px;">+ Text</button>
              <button id="ctx_add_layer" title="Add new layer" style="padding:2px 6px;border:none;border-radius:4px;background:#4CAF50;color:#fff;cursor:pointer;font-size:11px;">+ Layer</button>
            </div>
          </div>
          <div id="ctx_layers_list" style="max-height:150px;overflow-y:auto;"></div>
        </div>
        <div style="display:flex;gap:6px;justify-content:space-between;align-items:center;margin-top:8px;">
          <div style="font-size:10px;color:#9aa;opacity:0.85;line-height:1.2;">IAMCCS_annotate - draw & note on ComfyUI . v-2.0.0<br>www.carminecristalloscalzi.com</div>
          <div>
            <button id="ctx_export" title="Export workflow + annotations" style="padding:6px 8px;border:none;border-radius:6px;background:#00695c;color:#fff;cursor:pointer;">Export Workflow+Notes</button>
            <button id="ctx_import" title="Import annotations from JSON" style="padding:6px 8px;border:none;border-radius:6px;background:#455a64;color:#fff;cursor:pointer;">Import JSON</button>
            <button id="ctx_close" style="padding:6px 10px;border:none;border-radius:6px;background:#263238;color:#fff;cursor:pointer;">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(menu);

      // Function to render layers list
      function renderLayersList() {
        const list = menu.querySelector('#ctx_layers_list');
        if (!list) return;
        // Timer to allow double-click to cancel the single-click re-render
        let nameClickTimer = null;
        // Render layers with newest at the top of the list (visual order),
        // but keep indices mapped to the underlying state.layers
        const order = state.layers.map((_, i) => i).reverse();
        const normalCount = state.layers.reduce((acc, lyr) => acc + ((lyr?.kind === 'text') ? 0 : 1), 0);
        list.innerHTML = order.map((idx) => {
          const layer = state.layers[idx];
          const isTextLayer = (layer?.kind === 'text');
          const canDelete = isTextLayer ? (state.layers.length > 1) : (normalCount > 1);
          return `
          <div data-layer-row="${idx}" style="display:flex;gap:4px;align-items:center;padding:4px 6px;margin:2px 0;background:${idx === state.currentLayerIdx ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.05)'};border-radius:4px;border:1px solid ${idx === state.currentLayerIdx ? '#4CAF50' : 'transparent'};">
            <input data-layer-name="${idx}" type="text" value="${layer.name}" readonly style="flex:1;padding:2px 4px;border:none;border-radius:3px;background:rgba(0,0,0,0.3);color:#fff;font-size:11px;cursor:pointer;" title="Double-click to rename; click to select">
            <button data-layer-toggle-vis="${idx}" title="Toggle visibility" style="padding:2px 4px;border:none;border-radius:3px;background:#555;color:#fff;cursor:pointer;font-size:10px;">${layer.visible ? '👁️' : '🚫'}</button>
            <button data-layer-toggle-lock="${idx}" title="Toggle lock" style="padding:2px 4px;border:none;border-radius:3px;background:${layer.locked ? '#d32f2f' : '#2e7d32'};color:#fff;cursor:pointer;font-size:10px;">${layer.locked ? '🔒' : '🔓'}</button>
            ${layer.kind === 'text' ? `<button data-layer-edit-text="${idx}" title="Edit text" style="padding:2px 4px;border:none;border-radius:3px;background:#0277bd;color:#fff;cursor:pointer;font-size:10px;">✎</button>` : ''}
            <button data-layer-delete="${idx}" ${canDelete ? '' : 'disabled'} title="${canDelete ? 'Delete layer' : 'At least one normal layer must remain'}" style="padding:2px 4px;border:none;border-radius:3px;background:${canDelete ? '#d32f2f' : '#555'};color:#fff;cursor:${canDelete ? 'pointer' : 'not-allowed'};font-size:10px;opacity:${canDelete ? '1' : '0.6'};">✕</button>
          </div>`;
        }).join('');

        // Add event listeners
        list.querySelectorAll('[data-layer-row]').forEach(row => {
          row.addEventListener('click', () => {
            const idx = parseInt(row.dataset.layerRow, 10);
            setCurrentLayer(idx);
            try {
              const nm = state.layers?.[idx]?.name || `Layer ${idx + 1}`;
              showToast(`${nm} selected`, { kind: 'info', ms: 900 });
            } catch {}

            // If a Text Layer is selected, ensure text controls are visible and synced
            try {
              const lyr = state.layers?.[idx];
              if (lyr?.kind === 'text') {
                state._textControlsOpen = true;
                const tc = menu.querySelector('#ctx_text_controls');
                if (tc) tc.style.display = 'flex';
                if (lyr.textStickerId) {
                  const si = getStickerIdxById(lyr.textStickerId);
                  const st = si >= 0 ? state.stickers?.[si] : null;
                  if (st && isTextSticker(st)) {
                    state.textFontFamily = String(st.fontFamily || state.textFontFamily || 'Arial');
                    state.textFontSize = Number(st.fontSize) || Number(state.textFontSize) || 28;
                    state.textFontWeight = String(st.fontWeight || state.textFontWeight || 'normal');
                    state.textFontStyle = String(st.fontStyle || state.textFontStyle || 'normal');
                    state.textUnderline = !!(st.underline ?? state.textUnderline);
                  }
                }
                const tf = menu.querySelector('#ctx_text_font');
                const ts = menu.querySelector('#ctx_text_size');
                const tb = menu.querySelector('#ctx_text_bold');
                const ti = menu.querySelector('#ctx_text_italic');
                const tu = menu.querySelector('#ctx_text_underline');
                if (tf) tf.value = String(state.textFontFamily || 'Arial');
                if (ts) ts.value = String(Number(state.textFontSize) || 28);
                if (tb) tb.style.background = (state.textFontWeight === 'bold') ? '#fb8c00' : '#37474f';
                if (ti) ti.style.background = (state.textFontStyle === 'italic') ? '#fb8c00' : '#37474f';
                if (tu) tu.style.background = state.textUnderline ? '#fb8c00' : '#37474f';
              }
            } catch {}

            renderLayersList();
          });
          row.addEventListener('dblclick', (e) => {
            const idx = parseInt(row.dataset.layerRow, 10);
            const lyr = state.layers?.[idx];
            if (lyr?.kind === 'text' && lyr.textStickerId) {
              e.preventDefault();
              e.stopPropagation();
              try { openTextEditorForStickerId(lyr.textStickerId, app?.canvas); } catch {}
            }
          });
        });
        list.querySelectorAll('[data-layer-name]').forEach(inp => {
          // Single click selects; does not start editing
          inp.addEventListener('click', (e) => {
            const idx = parseInt(inp.dataset.layerName, 10);
            setCurrentLayer(idx);

            // If a Text Layer is selected, ensure text controls are visible and synced
            try {
              const lyr = state.layers?.[idx];
              if (lyr?.kind === 'text') {
                state._textControlsOpen = true;
                const tc = menu.querySelector('#ctx_text_controls');
                if (tc) tc.style.display = 'flex';
                if (lyr.textStickerId) {
                  const si = getStickerIdxById(lyr.textStickerId);
                  const st = si >= 0 ? state.stickers?.[si] : null;
                  if (st && isTextSticker(st)) {
                    state.textFontFamily = String(st.fontFamily || state.textFontFamily || 'Arial');
                    state.textFontSize = Number(st.fontSize) || Number(state.textFontSize) || 28;
                    state.textFontWeight = String(st.fontWeight || state.textFontWeight || 'normal');
                    state.textFontStyle = String(st.fontStyle || state.textFontStyle || 'normal');
                    state.textUnderline = !!(st.underline ?? state.textUnderline);
                  }
                }
                const tf = menu.querySelector('#ctx_text_font');
                const ts = menu.querySelector('#ctx_text_size');
                const tb = menu.querySelector('#ctx_text_bold');
                const ti = menu.querySelector('#ctx_text_italic');
                const tu = menu.querySelector('#ctx_text_underline');
                if (tf) tf.value = String(state.textFontFamily || 'Arial');
                if (ts) ts.value = String(Number(state.textFontSize) || 28);
                if (tb) tb.style.background = (state.textFontWeight === 'bold') ? '#fb8c00' : '#37474f';
                if (ti) ti.style.background = (state.textFontStyle === 'italic') ? '#fb8c00' : '#37474f';
                if (tu) tu.style.background = state.textUnderline ? '#fb8c00' : '#37474f';
              }
            } catch {}

            // Delay re-render slightly so a double-click can cancel it
            if (nameClickTimer) clearTimeout(nameClickTimer);
            nameClickTimer = setTimeout(() => {
              renderLayersList();
            }, 220);
            e.stopPropagation();
          });
          // Enable editing on double-click (or double tap)
          inp.addEventListener('dblclick', (e) => {
            if (nameClickTimer) { clearTimeout(nameClickTimer); nameClickTimer = null; }
            e.stopPropagation();
            inp.readOnly = false;
            inp.style.cursor = 'text';
            inp.focus();
            try { inp.select(); } catch {}
          });
          // Commit change on blur or change; then return to readOnly
          const commit = () => {
            const idx = parseInt(inp.dataset.layerName, 10);
            const newName = inp.value.trim();
            if (newName) {
              state.layers[idx].name = newName;
            } else {
              inp.value = state.layers[idx].name; // Revert if empty
            }
            inp.readOnly = true;
            inp.style.cursor = 'pointer';
          };
          inp.addEventListener('change', commit);
          inp.addEventListener('blur', commit);
          // Allow Enter to confirm, Escape to cancel
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              inp.blur();
            } else if (e.key === 'Escape') {
              inp.value = state.layers[parseInt(inp.dataset.layerName, 10)].name;
              inp.blur();
            }
          });
        });
        list.querySelectorAll('[data-layer-toggle-vis]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.layerToggleVis, 10);
            toggleLayerVisibility(idx);
            try {
              const nm = state.layers?.[idx]?.name || `Layer ${idx + 1}`;
              const vis = !!state.layers?.[idx]?.visible;
              __iamccsFlashCornerBadge(btn, 'done', vis ? 'ON' : 'OFF', { ms: 850, bg: '#ff9800' });
              showToast(`${nm}: visibility ${vis ? 'enabled' : 'disabled'}`, { kind: 'info', ms: 1100 });
            } catch {}
            renderLayersList();
          });
        });
        list.querySelectorAll('[data-layer-toggle-lock]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.layerToggleLock, 10);
            toggleLayerLock(idx);
            try {
              const nm = state.layers?.[idx]?.name || `Layer ${idx + 1}`;
              const locked = !!state.layers?.[idx]?.locked;
              __iamccsFlashCornerBadge(btn, 'done', locked ? 'ON' : 'OFF', { ms: 850, bg: '#ff9800' });
              showToast(`${nm}: lock ${locked ? 'enabled' : 'disabled'}`, { kind: 'info', ms: 1100 });
            } catch {}
            renderLayersList();
          });
        });
        list.querySelectorAll('[data-layer-delete]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.layerDelete, 10);
            const nm = state.layers?.[idx]?.name || `Layer ${idx + 1}`;
            const ok = deleteLayer(idx);
            try {
              __iamccsFlashCornerBadge(btn, 'done', ok ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' });
              showToast(ok ? `${nm} deleted` : `Cannot delete ${nm}`, { kind: ok ? 'info' : 'warn', ms: 1300 });
            } catch {}
            if (ok) renderLayersList();
          });
        });

        list.querySelectorAll('[data-layer-edit-text]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.layerEditText, 10);
            const lyr = state.layers?.[idx];
            if (lyr?.kind === 'text' && lyr.textStickerId) {
              setCurrentLayer(idx);
              try { __iamccsFlashCornerBadge(btn, 'done', 'OK', { ms: 850, bg: '#ff9800' }); } catch {}
              try { showToast('Text editor opened', { kind: 'info', ms: 1000 }); } catch {}
              try { openTextEditorForStickerId(lyr.textStickerId, app?.canvas); } catch {}
              renderLayersList();
            }
          });
        });
      }

      // Expose so other parts (e.g. Text tool creation) can refresh the list
      ui.renderLayersList = renderLayersList;

      // Initial render
      renderLayersList();

      // Add layer button
      const addLayerBtn = menu.querySelector('#ctx_add_layer');
      if (addLayerBtn) {
        addLayerBtn.addEventListener('click', () => {
          const idx = addLayer();
          try {
            const nm = state.layers?.[idx]?.name || `Layer ${idx + 1}`;
            __iamccsFlashCornerBadge(addLayerBtn, 'done', 'OK', { ms: 900, bg: '#ff9800' });
            showToast(`${nm} created`, { kind: 'info', ms: 1100 });
          } catch {}
          renderLayersList();
        });
      }

      // Text tool UI (button + font + size)
      const addTextBtn = menu.querySelector('#ctx_add_text');
      const textControls = menu.querySelector('#ctx_text_controls');
      const textFont = menu.querySelector('#ctx_text_font');
      const textSize = menu.querySelector('#ctx_text_size');
      const textNorm = menu.querySelector('#ctx_text_norm');
      const textBold = menu.querySelector('#ctx_text_bold');
      const textItalic = menu.querySelector('#ctx_text_italic');
      const textUnderline = menu.querySelector('#ctx_text_underline');
      try {
        if (textFont) {
          const fonts = [
            'Arial',
            'Verdana',
            'Tahoma',
            'Trebuchet MS',
            'Times New Roman',
            'Georgia',
            'Courier',
            'Courier New',
            'Lucida Console',
            'Consolas',
            'Cascadia Mono',
            'Cascadia Code',
            'Roboto Mono',
            'American Typewriter',
            'Typewriter',
            'monospace',
            'Impact',
            'Comic Sans MS',
            'system-ui',
          ];
          textFont.innerHTML = fonts.map(f => `<option value="${f}">${f}</option>`).join('');
          textFont.value = String(state.textFontFamily || 'Arial');
          textFont.addEventListener('change', () => {
            state.textFontFamily = String(textFont.value || 'Arial');
            // If editing a text sticker, update textarea style live
            try {
              if (state.textEditor?.el) state.textEditor.el.style.fontFamily = state.textFontFamily;
            } catch {}

            // If current layer is a Text Layer, persist font choice into that text box
            try {
              const lyr = state.layers?.[state.currentLayerIdx];
              if (lyr?.kind === 'text' && lyr.textStickerId) {
                const si = getStickerIdxById(lyr.textStickerId);
                const st = si >= 0 ? state.stickers?.[si] : null;
                if (st && isTextSticker(st)) {
                  st.fontFamily = state.textFontFamily;
                  persistToGraphExtra(true);
                  app?.canvas?.setDirty(true, true);
                }
              }
            } catch {}
          });
        }
        if (textSize) {
          textSize.value = String(Number(state.textFontSize) || 28);
          textSize.addEventListener('input', () => {
            const v = Math.max(8, Math.min(200, Number(textSize.value) || 28));
            state.textFontSize = v;
            try {
              if (state.textEditor?.el) state.textEditor.el.style.fontSize = String(v) + 'px';
            } catch {}

            // If current layer is a Text Layer, persist font size into that text box
            try {
              const lyr = state.layers?.[state.currentLayerIdx];
              if (lyr?.kind === 'text' && lyr.textStickerId) {
                const si = getStickerIdxById(lyr.textStickerId);
                const st = si >= 0 ? state.stickers?.[si] : null;
                if (st && isTextSticker(st)) {
                  st.fontSize = v;
                  persistToGraphExtra(true);
                  app?.canvas?.setDirty(true, true);
                }
              }
            } catch {}
          });
        }
        if (textControls) {
          textControls.style.display = state._textControlsOpen ? 'flex' : 'none';
        }

        const syncTextStyleBtns = () => {
          try {
            if (textBold) textBold.style.background = (state.textFontWeight === 'bold') ? '#fb8c00' : '#37474f';
            if (textItalic) textItalic.style.background = (state.textFontStyle === 'italic') ? '#fb8c00' : '#37474f';
            if (textUnderline) textUnderline.style.background = state.textUnderline ? '#fb8c00' : '#37474f';
          } catch {}
        };

        const applyTextStyleToActive = () => {
          try {
            const lyr = state.layers?.[state.currentLayerIdx];
            if (lyr?.kind === 'text' && lyr.textStickerId) {
              const si = getStickerIdxById(lyr.textStickerId);
              const st = si >= 0 ? state.stickers?.[si] : null;
              if (st && isTextSticker(st)) {
                st.fontWeight = String(state.textFontWeight || 'normal');
                st.fontStyle = String(state.textFontStyle || 'normal');
                st.underline = !!state.textUnderline;
                if (state.textEditor?.stickerId === st.id && state.textEditor?.el) {
                  state.textEditor.el.style.fontWeight = st.fontWeight;
                  state.textEditor.el.style.fontStyle = st.fontStyle;
                  state.textEditor.el.style.textDecoration = st.underline ? 'underline' : 'none';
                }
                persistToGraphExtra(true);
                app?.canvas?.setDirty(true, true);
              }
            }
          } catch {}
        };

        textNorm?.addEventListener('click', () => {
          state.textFontWeight = 'normal';
          state.textFontStyle = 'normal';
          state.textUnderline = false;
          syncTextStyleBtns();
          applyTextStyleToActive();
          try { __iamccsFlashCornerBadge(textNorm, 'done', 'OK', { ms: 750, bg: '#ff9800' }); } catch {}
          try { showToast('Text style: normal', { kind: 'info', ms: 950 }); } catch {}
        });
        textBold?.addEventListener('click', () => {
          state.textFontWeight = (state.textFontWeight === 'bold') ? 'normal' : 'bold';
          syncTextStyleBtns();
          applyTextStyleToActive();
          try {
            const on = state.textFontWeight === 'bold';
            __iamccsFlashCornerBadge(textBold, 'done', on ? 'ON' : 'OFF', { ms: 800, bg: '#ff9800' });
            showToast(`Bold ${on ? 'enabled' : 'disabled'}`, { kind: 'info', ms: 950 });
          } catch {}
        });
        textItalic?.addEventListener('click', () => {
          state.textFontStyle = (state.textFontStyle === 'italic') ? 'normal' : 'italic';
          syncTextStyleBtns();
          applyTextStyleToActive();
          try {
            const on = state.textFontStyle === 'italic';
            __iamccsFlashCornerBadge(textItalic, 'done', on ? 'ON' : 'OFF', { ms: 800, bg: '#ff9800' });
            showToast(`Italic ${on ? 'enabled' : 'disabled'}`, { kind: 'info', ms: 950 });
          } catch {}
        });
        textUnderline?.addEventListener('click', () => {
          state.textUnderline = !state.textUnderline;
          syncTextStyleBtns();
          applyTextStyleToActive();
          try {
            const on = !!state.textUnderline;
            __iamccsFlashCornerBadge(textUnderline, 'done', on ? 'ON' : 'OFF', { ms: 800, bg: '#ff9800' });
            showToast(`Underline ${on ? 'enabled' : 'disabled'}`, { kind: 'info', ms: 950 });
          } catch {}
        });

        syncTextStyleBtns();
      } catch {}
      if (addTextBtn) {
        addTextBtn.addEventListener('click', () => {
          state._textControlsOpen = true;
          if (textControls) textControls.style.display = 'flex';
          if (!state.enabled) setEnabled(true);
          setTool('text');
          try { __iamccsFlashCornerBadge(addTextBtn, 'done', 'ON', { ms: 750, bg: '#ff9800' }); } catch {}
          try { showToast('Text tool enabled', { kind: 'info', ms: 1000 }); } catch {}
          try { if (textFont) textFont.value = String(state.textFontFamily || 'Arial'); } catch {}
          try { if (textSize) textSize.value = String(Number(state.textFontSize) || 28); } catch {}
          try {
            if (textBold) textBold.style.background = (state.textFontWeight === 'bold') ? '#fb8c00' : '#37474f';
            if (textItalic) textItalic.style.background = (state.textFontStyle === 'italic') ? '#fb8c00' : '#37474f';
            if (textUnderline) textUnderline.style.background = state.textUnderline ? '#fb8c00' : '#37474f';
          } catch {}
          app?.canvas?.setDirty(true, true);
        });
      }

      // Clamp initial position and anchor to button
      const clamp = (px, py) => {
        const nx = Math.max(0, Math.min(window.innerWidth - menu.offsetWidth, px));
        const ny = Math.max(0, Math.min(window.innerHeight - menu.offsetHeight, py));
        return { nx, ny };
      };
      let px = x, py = y;
      if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        ui.contextAnchor = { anchor: anchorEl, dx: x - r.left, dy: y - r.top };
      } else {
        ui.contextAnchor = null;
      }
      const cl = clamp(px, py);
      menu.style.left = cl.nx + 'px';
      menu.style.top = cl.ny + 'px';
      ui.contextMenu = menu;

      // UX: when opening Options from the floating button, snap the button to the menu corner
      // so it looks "attached" (left corner when menu is on the left, right corner when on the right).
      try {
        if (anchorEl && ui.floating && anchorEl === ui.floating) {
          snapFloatingToggleToContextMenu(menu);
        }
      } catch {}

      // Wire context controls
      const tgl = menu.querySelector('#ctx_toggle');
      const clr = menu.querySelector('#ctx_clear');
      const col = menu.querySelector('#ctx_color');
      const w = menu.querySelector('#ctx_width');
      const wv = menu.querySelector('#ctx_wv');
      const op = menu.querySelector('#ctx_opacity');
      const ov = menu.querySelector('#ctx_ov');
      const ers = menu.querySelector('#ctx_eraser');
  const cst = menu.querySelector('#ctx_constant');
  const dsh = menu.querySelector('#ctx_dashed');
  const hdp = menu.querySelector('#ctx_hidpi');
  const hid = menu.querySelector('#ctx_hidden');
  const pen = menu.querySelector('#ctx_penonly');
  const pinm = menu.querySelector('#ctx_pinmode');
      const selovr = menu.querySelector('#ctx_sel_override');
  ui.hiddenChk = hid; // Store reference for keyboard shortcut
      const swf = menu.querySelector('#ctx_savewf');
      const toolDrawBtn = menu.querySelector('#ctx_tool_draw');
      const toolSelectBtn = menu.querySelector('#ctx_tool_select');
      const toolTransformBtn = menu.querySelector('#ctx_tool_transform');
      const toolRotateBtn = menu.querySelector('#ctx_tool_rotate');
      const toolShotBtn = menu.querySelector('#ctx_tool_shot');
      const selMode = menu.querySelector('#ctx_select_mode');
      const tfMode = menu.querySelector('#ctx_transform_mode');
      const selClearBtn = menu.querySelector('#ctx_sel_clear');
      const selCopyBtn = menu.querySelector('#ctx_sel_copy');
      const selCutBtn = menu.querySelector('#ctx_sel_cut');
      const selPasteBtn = menu.querySelector('#ctx_sel_paste');
      const undoBtn = menu.querySelector('#ctx_undo');
      const redoBtn = menu.querySelector('#ctx_redo');
      const stColor = menu.querySelector('#ctx_sticker_color');
      const stPad = menu.querySelector('#ctx_sticker_pad');
      const stBorder = menu.querySelector('#ctx_sticker_border');
      const stShadow = menu.querySelector('#ctx_sticker_shadow');
      const stShadowStrength = menu.querySelector('#ctx_sticker_shadow_strength');
      const stClearBtn = menu.querySelector('#ctx_sticker_clear');
        const stPurgeBtn = menu.querySelector('#ctx_sticker_purge');
  const exp = menu.querySelector('#ctx_export');
  const imp = menu.querySelector('#ctx_import');
      const cls = menu.querySelector('#ctx_close');

      tgl.addEventListener('click', () => {
        setEnabled(!state.enabled);
        // Update menu button color immediately
        tgl.style.background = state.enabled ? '#4CAF50' : '#f44336';
        tgl.textContent = state.enabled ? 'ENABLED' : 'DISABLED';
        try { __iamccsFlashCornerBadge(tgl, 'done', state.enabled ? 'ON' : 'OFF', { ms: 800, bg: '#ff9800' }); } catch {}
      });
      clr.addEventListener('click', () => {
        // Clear all non-locked layers
        for (const lyr of state.layers) if (!lyr.locked) lyr.paths = [];
        // Refresh flat paths for backward compatibility
        state.paths = [];
        for (const lyr of state.layers) for (const p of lyr.paths) state.paths.push(p);
        app?.canvas?.setDirty(true, true);
        persistToGraphExtra(true);
        if (!state.saveWithWorkflow) removeFromGraphExtra();
        try { __iamccsFlashCornerBadge(clr, 'done', 'OK', { ms: 900, bg: '#ff9800' }); } catch {}
        try { showToast('Annotations cleared (unlocked layers)', { kind: 'info', ms: 1200 }); } catch {}
      });
      col.addEventListener('input', () => {
        state.color = col.value;
        schedulePaletteAutoHide(col);
        try { saveStateToLayerStyle(); } catch {}
        try {
          const didText = syncTextLayerFromStateColor();
          if (!didText) persistToGraphExtra();
        } catch { try { persistToGraphExtra(); } catch {} }
      });
      w.addEventListener('input', () => {
        state.width = parseInt(w.value, 10) || 3;
        if (state.eraser) state.widthErase = state.width; else state.widthDraw = state.width;
        wv.textContent = String(state.width);
        try { saveStateToLayerStyle(undefined, { persist: true }); } catch {}
      });
      op.addEventListener('input', () => {
        const pct = parseInt(op.value,10)||100;
        state.opacity = Math.max(0.1, Math.min(1, pct/100));
        if (state.eraser) state.opacityErase = state.opacity; else state.opacityDraw = state.opacity;
        ov.textContent = String(Math.round(state.opacity*100));
        try { saveStateToLayerStyle(undefined, { persist: true }); } catch {}
      });
      ers.addEventListener('click', () => {
        setEraserMode(!state.eraser);
        // Update context button state immediately
        ers.textContent = state.eraser ? '🩹 Eraser' : '✏️ Draw';
        ers.style.background = state.eraser ? '#c2185b' : '#795548';
        try { showToast(state.eraser ? 'Eraser enabled' : 'Eraser disabled', { kind: 'info', ms: 1100 }); } catch {}
        try { __iamccsFlashCornerBadge(ers, 'done', state.eraser ? 'ER' : 'DR', { ms: 800, bg: '#ff9800' }); } catch {}
        try { syncToolsUI(); } catch {}
      });
      cst.addEventListener('change', () => { state.constantScreen = !!cst.checked; app?.canvas?.setDirty(true,true); });
      dsh.addEventListener('change', () => {
        state.dashed = !!dsh.checked;
        try { saveStateToLayerStyle(undefined, { persist: true }); } catch {}
        app?.canvas?.setDirty(true,true);
      });
  hdp.addEventListener('change', () => { state.hiDPIx2 = !!hdp.checked; app?.canvas?.setDirty(true,true); });
      hid.addEventListener('change', () => { state.hidden = !!hid.checked; try { showToast(state.hidden ? 'Hide notes enabled' : 'Hide notes disabled', { kind: 'info', ms: 1200 }); } catch {} try { syncFlagsUI(); } catch {} app?.canvas?.setDirty(true,true); });
      pen.addEventListener('change', () => { state.penOnly = !!pen.checked; try { showToast(state.penOnly ? 'Pen only enabled' : 'Pen only disabled', { kind: 'info', ms: 1200 }); } catch {} try { syncFlagsUI(); } catch {} });
      pinm?.addEventListener('change', () => { state.pinMode = !!pinm.checked; try { showToast(state.pinMode ? 'Pin mode enabled' : 'Pin mode disabled', { kind: 'info', ms: 1200 }); } catch {} try { syncFlagsUI(); } catch {} app?.canvas?.setDirty(true, true); });
      selovr?.addEventListener('change', () => {
        state.selOverride = !!selovr.checked;
        // If Annotate is ON, enabling SEL means the user expects to select, not draw.
        if (state.enabled && state.selOverride) {
          try { setTool('select'); } catch {}
        }
        if (!state.selOverride && !state.enabled) {
          try { clearSelection(); } catch {}
        }
        try { showToast(state.selOverride ? 'Selection mode enabled' : 'Selection mode disabled', { kind: 'info', ms: 1200 }); } catch {}
        try { syncFlagsUI(); } catch {}
        app?.canvas?.setDirty(true, true);
      });
      swf.addEventListener('change', () => {
        state.saveWithWorkflow = !!swf.checked;
        if (state.saveWithWorkflow) persistToGraphExtra(); else removeFromGraphExtra();
        try { showToast(state.saveWithWorkflow ? 'Save into workflow enabled' : 'Save into workflow disabled', { kind: 'info', ms: 1200 }); } catch {}
      });

      const setToolAutoEnable = (t) => {
        try {
          if (!state.enabled) setEnabled(true);
        } catch {}
        setTool(t);
        syncToolsUI();
      };

      toolDrawBtn?.addEventListener('click', () => { setToolAutoEnable('draw'); try { __iamccsFlashCornerBadge(toolDrawBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Draw enabled', { kind: 'info', ms: 900 }); } catch {} });
      toolSelectBtn?.addEventListener('click', () => { setToolAutoEnable('select'); try { __iamccsFlashCornerBadge(toolSelectBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Select enabled', { kind: 'info', ms: 900 }); } catch {} });
      toolTransformBtn?.addEventListener('click', () => { setToolAutoEnable('transform'); try { __iamccsFlashCornerBadge(toolTransformBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Transform enabled', { kind: 'info', ms: 900 }); } catch {} });
      toolRotateBtn?.addEventListener('click', () => { setToolAutoEnable('rotate'); try { __iamccsFlashCornerBadge(toolRotateBtn, 'done', 'ON', { ms: 700, bg: '#ff9800' }); } catch {} try { showToast('Rotate enabled', { kind: 'info', ms: 900 }); } catch {} });
      toolShotBtn?.addEventListener('click', () => { setToolAutoEnable('screenshot'); try { __iamccsFlashCornerBadge(toolShotBtn, 'done', 'ON', { ms: 750, bg: '#ff9800' }); } catch {} try { showToast('Screenshot tool enabled', { kind: 'info', ms: 1000 }); } catch {} });
      selMode?.addEventListener('change', () => { setSelectMode(selMode.value); try { showToast(`Selection shape: ${String(selMode.value || 'rect')}`, { kind: 'info', ms: 1000 }); } catch {} });
      tfMode?.addEventListener('change', () => { setTransformMode(tfMode.value); try { showToast(`Transform mode: ${String(tfMode.value || 'fixed')}`, { kind: 'info', ms: 1000 }); } catch {} });
      selClearBtn?.addEventListener('click', () => { clearSelection(); try { __iamccsFlashCornerBadge(selClearBtn, 'done', 'OK', { ms: 800, bg: '#ff9800' }); } catch {} try { showToast('Selection cleared', { kind: 'info', ms: 900 }); } catch {} });
      selCopyBtn?.addEventListener('click', () => { const ok = copySelectionToClipboard(); try { __iamccsFlashCornerBadge(selCopyBtn, 'done', ok ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' }); } catch {} try { showToast(ok ? 'Selection copied' : 'Nothing selected', { kind: ok ? 'info' : 'warn', ms: 1000 }); } catch {} });
      selCutBtn?.addEventListener('click', () => { const ok = copySelectionToClipboard({ clearAfter: false }); if (ok) deleteSelection({ allowLocked: false }); try { __iamccsFlashCornerBadge(selCutBtn, 'done', ok ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' }); } catch {} try { showToast(ok ? 'Selection cut' : 'Nothing selected', { kind: ok ? 'info' : 'warn', ms: 1000 }); } catch {} });
      selPasteBtn?.addEventListener('click', () => { const ok = pasteClipboardAt(state.lastPointerGraphPos); try { __iamccsFlashCornerBadge(selPasteBtn, 'done', ok ? 'OK' : 'NO', { ms: 900, bg: '#ff9800' }); } catch {} try { showToast(ok ? 'Pasted' : 'Clipboard empty', { kind: ok ? 'info' : 'warn', ms: 1000 }); } catch {} });

      undoBtn?.addEventListener('click', () => {
        const ok = doUndo();
        if (ok) persistToGraphExtra(true);
        try { __iamccsFlashCornerBadge(undoBtn, 'done', ok ? 'OK' : 'NO', { ms: 850, bg: '#ff9800' }); } catch {}
        try { showToast(ok ? 'Undo' : 'Nothing to undo', { kind: ok ? 'info' : 'warn', ms: 900 }); } catch {}
      });
      redoBtn?.addEventListener('click', () => {
        const ok = doRedo();
        if (ok) persistToGraphExtra(true);
        try { __iamccsFlashCornerBadge(redoBtn, 'done', ok ? 'OK' : 'NO', { ms: 850, bg: '#ff9800' }); } catch {}
        try { showToast(ok ? 'Redo' : 'Nothing to redo', { kind: ok ? 'info' : 'warn', ms: 900 }); } catch {}
      });

      stColor?.addEventListener('input', () => {
        state.stickerFrameColor = stColor.value;
        schedulePaletteAutoHide(stColor);
        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true);
      });
      stPad?.addEventListener('input', () => {
        state.stickerPaddingPx = parseInt(stPad.value, 10) || 0;
        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true);
      });
      stBorder?.addEventListener('input', () => {
        state.stickerBorderWidthPx = parseInt(stBorder.value, 10) || 0;
        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true);
      });
      stShadow?.addEventListener('change', () => {
        state.stickerShadow = !!stShadow.checked;
        syncStickerUI();
        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true);
      });
      stShadowStrength?.addEventListener('input', () => {
        state.stickerShadowStrength = parseInt(stShadowStrength.value, 10) || 0;
        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true);
      });
      stClearBtn?.addEventListener('click', () => {
        state.stickers = [];
        clearSelection();
        app?.canvas?.setDirty(true, true);
        persistToGraphExtra(true);
        try { __iamccsFlashCornerBadge(stClearBtn, 'done', 'OK', { ms: 900, bg: '#ff9800' }); } catch {}
        try { showToast('Post-its cleared', { kind: 'info', ms: 1100 }); } catch {}
      });

      stPurgeBtn?.addEventListener('click', async () => {
        await purgeOldStickerScreenshotCacheForCurrentWorkflow();
        try { __iamccsFlashCornerBadge(stPurgeBtn, 'done', 'OK', { ms: 900, bg: '#ff9800' }); } catch {}
        try { showToast('Old screenshot cache purged', { kind: 'info', ms: 1200 }); } catch {}
      });

      exp.addEventListener('click', () => {
        exportAnnotations();
        try { __iamccsFlashCornerBadge(exp, 'done', 'OK', { ms: 900, bg: '#ff9800' }); } catch {}
        try { showToast('Export started', { kind: 'info', ms: 1100 }); } catch {}
      });
      imp.addEventListener('click', () => {
        try { __iamccsFlashCornerBadge(imp, 'done', 'OK', { ms: 900, bg: '#ff9800' }); } catch {}
        try { showToast('Choose JSON to import', { kind: 'info', ms: 1100 }); } catch {}
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'application/json';
        inp.onchange = () => { if (inp.files && inp.files[0]) importAnnotations(inp.files[0]); };
        inp.click();
      });
      cls.addEventListener('click', () => {
        try { __iamccsFlashCornerBadge(cls, 'done', 'OK', { ms: 700, bg: '#ff9800' }); } catch {}
        try { showToast('Options closed', { kind: 'info', ms: 900 }); } catch {}
        menu.remove();
      });

      syncUI();
      syncToolsUI();
      syncStickerUI();
      __ctxOffClick = (ev) => {
        if (!menu.contains(ev.target) && ev.target !== ui.floating) {
          closeContextMenu('off-click');
        }
      };
      window.addEventListener('mousedown', __ctxOffClick, true);
      // Close also on any right-click outside the menu
      __ctxOffRight = (ev) => {
        // Ignore right-click on the floating toggle; button handler will manage toggle/close
        if (!menu.contains(ev.target) && ev.target !== ui.floating) closeContextMenu('right-click');
      };
      window.addEventListener('contextmenu', __ctxOffRight, true);
    }

    function toGraphPos(e, canvas) {
      if (!canvas) return null;
      if (typeof canvas.convertEventToCanvasOffset === 'function') {
        const p = canvas.convertEventToCanvasOffset(e);
        return { x: p[0], y: p[1] };
      }
      // Fallback: compute from ds and bounding rect
      const rect = canvas.canvas.getBoundingClientRect();
      const ds = canvas.ds || canvas.viewport || { scale: canvas.scale || 1, offset: canvas.offset || [0, 0] };
      const dpr = getCanvasEffectiveDpr(canvas);
      const x = (e.clientX - rect.left) / dpr;
      const y = (e.clientY - rect.top) / dpr;
      // In litegraph: screen = (graph + offset) * scale -> graph = (screen/scale) - offset
      return { x: x / ds.scale - ds.offset[0], y: y / ds.scale - ds.offset[1] };
    }

    function attachCanvasHooks() {
      const canvas = app?.canvas;
      if (!canvas || !canvas.canvas) {
        console.log('[IAMCCS] Canvas not ready');
        return false;
      }

      console.log('[IAMCCS] Attaching canvas hooks...');

      // Draw annotations into an offscreen buffer, then composite on top (so eraser doesn't reveal black background)
      const prev = canvas.onDrawForeground;
      canvas.onDrawForeground = function (ctx) {
        if (typeof prev === 'function') prev.call(this, ctx);
        // Written code by Carmine Cristallo Scalzi (IAMCCS) - AI for debugging - section: Foreground Rendering Pipeline - reason: explains offscreen buffer compositing to preserve correct eraser behavior and stroke quality
        // Create (or recreate) floating button on draw (proper timing)
        if (!state.uiShown || !ui.floating || !document.body.contains(ui.floating)) {
          console.log('[IAMCCS] Creating floating button...');
          ensureFloatingToggle();
          state.uiShown = true;
        }

        // Subgraph separation: switch stored annotation set when active graph changes
        try {
          const keyNow = getActiveGraphKey();
          if (!state._switchingGraph && keyNow !== state._activeGraphKey) {
            state._switchingGraph = true;
            const prevKey = state._activeGraphKey || 'root';
            // Save current state into previous key before switching
            if (state.saveWithWorkflow && app?.graph) {
              try { writeAnnotationsToExtra(prevKey, buildAnnotationsPayload()); } catch {}
            }
            // Switch and load
            state._activeGraphKey = keyNow;
            state.hydrated = false;
            const loaded = loadFromGraphExtra();
            if (!loaded) {
              state.paths = [];
              state.current = null;
              state.stickers = [];
              state.selection = null;
              state.currentLayerIdx = 0;
              state.layers = [{
                name: 'Layer 1',
                visible: true,
                locked: false,
                paths: [],
                style: {
                  color: state.color || '#ff4444',
                  dashed: !!state.dashed,
                  widthDraw: state.widthDraw || 7,
                  widthErase: state.widthErase || 48,
                  opacityDraw: (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0),
                  opacityErase: (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0),
                }
              }];
              state.hydrated = true;
            }
            try { syncUI(); } catch {}
            try { syncBrushOpacityUI(); } catch {}
            try { syncToolsUI(); } catch {}
            try { syncStickerUI(); } catch {}
            // macro removed
            state._switchingGraph = false;
          }
        } catch {
          state._switchingGraph = false;
        }
        const hideNonLocked = !!state.hidden;
        const cw = ctx.canvas.width | 0;
        const ch = ctx.canvas.height | 0;

        // Supersampling factor for the offscreen stroke buffer (keep at 1 for stability)
        const supersample = 1;

        if (!__annoCanvas) {
          __annoCanvas = document.createElement('canvas');
          __annoCtx = __annoCanvas.getContext('2d');
        }

        const targetW = Math.max(1, Math.floor(cw * supersample));
        const targetH = Math.max(1, Math.floor(ch * supersample));
        if (__annoW !== targetW || __annoH !== targetH) {
          __annoW = __annoCanvas.width = targetW;
          __annoH = __annoCanvas.height = targetH;
        } else {
          __annoCtx.clearRect(0, 0, __annoW, __annoH);
        }

        const ds = canvas.ds || canvas.viewport || { scale: canvas.scale || 1, offset: canvas.offset || [0, 0] };
        const dpr = getCanvasEffectiveDpr(canvas) * supersample;
        const sc = (ds.scale || 1);
        const off0 = (ds.offset?.[0] || 0);
        const off1 = (ds.offset?.[1] || 0);
        const g2s = (pt) => ({
          x: ((pt.x + off0) * sc) * dpr,
          y: ((pt.y + off1) * sc) * dpr,
        });
        const widthPx = (w) => state.constantScreen ? (w * dpr) : (w * sc * dpr);
        const dashForWidth = (wpx) => {
          // Dash pattern scales with stroke width so it remains visible at any size
          const a = Math.max(2, Math.min(200, Math.round(3 * wpx)));
          const b = Math.max(2, Math.min(200, Math.round(2 * wpx)));
          return [a, b];
        };

        __annoCtx.save();
        __annoCtx.imageSmoothingEnabled = true;
        __annoCtx.setTransform(1,0,0,1,0,0);
        __annoCtx.lineCap = 'round';
        __annoCtx.lineJoin = 'round';
        // Draw stored strokes
        for (const layer of state.layers) {
          if (!layer.visible) continue;
          if (hideNonLocked && !layer.locked) continue;
          for (const path of layer.paths) {
            if (!Array.isArray(path.points) || !path.points.length) continue;
            const wpx = widthPx(path.width);
            __annoCtx.globalAlpha = typeof path.opacity === 'number' ? path.opacity : 1;
            if (path.dashed) __annoCtx.setLineDash(dashForWidth(wpx)); else __annoCtx.setLineDash([]);
            if (path.mode === 'erase') {
              __annoCtx.save();
              __annoCtx.globalCompositeOperation = 'destination-out';
              const pts = path.points.map(g2s);
              if (pts.length === 1) {
                // Erase a dot
                const r = Math.max(0.5, wpx / 2);
                __annoCtx.beginPath();
                __annoCtx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
                __annoCtx.fillStyle = 'rgba(0,0,0,1)';
                __annoCtx.fill();
              } else if (pts.length === 2) {
                __annoCtx.beginPath();
                __annoCtx.moveTo(pts[0].x, pts[0].y);
                __annoCtx.lineTo(pts[1].x, pts[1].y);
                __annoCtx.lineWidth = Math.max(1, wpx);
                __annoCtx.strokeStyle = 'rgba(0,0,0,1)';
                __annoCtx.stroke();
              } else {
                __annoCtx.beginPath();
                __annoCtx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length - 1; i++) {
                  const cx = pts[i].x;
                  const cy = pts[i].y;
                  const nx = (pts[i].x + pts[i+1].x) * 0.5;
                  const ny = (pts[i].y + pts[i+1].y) * 0.5;
                  __annoCtx.quadraticCurveTo(cx, cy, nx, ny);
                }
                __annoCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
                __annoCtx.lineWidth = Math.max(1, wpx);
                __annoCtx.strokeStyle = 'rgba(0,0,0,1)';
                __annoCtx.stroke();
              }
              __annoCtx.restore();
            } else {
              __annoCtx.globalCompositeOperation = 'source-over';
              __annoCtx.strokeStyle = path.color || '#ff4444';
              __annoCtx.lineWidth = Math.max(1, wpx);
              const pts = path.points.map(g2s);
              if (pts.length === 1) {
                __annoCtx.beginPath();
                __annoCtx.arc(pts[0].x, pts[0].y, Math.max(0.5, wpx/2), 0, Math.PI*2);
                __annoCtx.fillStyle = path.color || '#ff4444';
                __annoCtx.fill();
              } else if (pts.length === 2) {
                __annoCtx.beginPath();
                __annoCtx.moveTo(pts[0].x, pts[0].y);
                __annoCtx.lineTo(pts[1].x, pts[1].y);
                __annoCtx.stroke();
              } else {
                __annoCtx.beginPath();
                __annoCtx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length - 1; i++) {
                  const cx = pts[i].x;
                  const cy = pts[i].y;
                  const nx = (pts[i].x + pts[i+1].x) * 0.5;
                  const ny = (pts[i].y + pts[i+1].y) * 0.5;
                  __annoCtx.quadraticCurveTo(cx, cy, nx, ny);
                }
                // Ensure we reach the last point
                __annoCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
                __annoCtx.stroke();
              }
            }
          }
        }
        // Draw current stroke
        const cur = state.current;
        if (!hideNonLocked && cur && Array.isArray(cur.points) && cur.points.length) {
          const wpx = widthPx(cur.width);
          __annoCtx.globalAlpha = typeof cur.opacity === 'number' ? cur.opacity : 1;
          if (cur.dashed) __annoCtx.setLineDash(dashForWidth(wpx)); else __annoCtx.setLineDash([]);
          if (cur.mode === 'erase') {
            __annoCtx.save();
            __annoCtx.globalCompositeOperation = 'destination-out';
            const pts = cur.points.map(g2s);
            if (pts.length === 1) {
              const r = Math.max(0.5, wpx / 2);
              __annoCtx.beginPath();
              __annoCtx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
              __annoCtx.fillStyle = 'rgba(0,0,0,1)';
              __annoCtx.fill();
            } else if (pts.length === 2) {
              __annoCtx.beginPath();
              __annoCtx.moveTo(pts[0].x, pts[0].y);
              __annoCtx.lineTo(pts[1].x, pts[1].y);
              __annoCtx.lineWidth = Math.max(1, wpx);
              __annoCtx.strokeStyle = 'rgba(0,0,0,1)';
              __annoCtx.stroke();
            } else {
              __annoCtx.beginPath();
              __annoCtx.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i < pts.length - 1; i++) {
                const cx = pts[i].x;
                const cy = pts[i].y;
                const nx = (pts[i].x + pts[i+1].x) * 0.5;
                const ny = (pts[i].y + pts[i+1].y) * 0.5;
                __annoCtx.quadraticCurveTo(cx, cy, nx, ny);
              }
              __annoCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
              __annoCtx.lineWidth = Math.max(1, wpx);
              __annoCtx.strokeStyle = 'rgba(0,0,0,1)';
              __annoCtx.stroke();
            }
            __annoCtx.restore();
          } else {
            __annoCtx.globalCompositeOperation = 'source-over';
            __annoCtx.strokeStyle = cur.color || '#ff4444';
            __annoCtx.lineWidth = Math.max(1, wpx);
            const pts = cur.points.map(g2s);
            if (pts.length === 1) {
              __annoCtx.beginPath();
              __annoCtx.arc(pts[0].x, pts[0].y, Math.max(0.5, wpx/2), 0, Math.PI*2);
              __annoCtx.fillStyle = cur.color || '#ff4444';
              __annoCtx.fill();
            } else if (pts.length === 2) {
              __annoCtx.beginPath();
              __annoCtx.moveTo(pts[0].x, pts[0].y);
              __annoCtx.lineTo(pts[1].x, pts[1].y);
              __annoCtx.stroke();
            } else {
              __annoCtx.beginPath();
              __annoCtx.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i < pts.length - 1; i++) {
                const cx = pts[i].x;
                const cy = pts[i].y;
                const nx = (pts[i].x + pts[i+1].x) * 0.5;
                const ny = (pts[i].y + pts[i+1].y) * 0.5;
                __annoCtx.quadraticCurveTo(cx, cy, nx, ny);
              }
              __annoCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
              __annoCtx.stroke();
            }
          }
        }
        __annoCtx.restore();

        // Stickers + screenshot flash
        // Order: image post-its -> strokes -> text boxes
        try {
          const dprMain = getCanvasEffectiveDpr(canvas);
          const off0 = (ds.offset?.[0] || 0);
          const off1 = (ds.offset?.[1] || 0);
          const sc = (ds.scale || 1);
          const g2c = (pt) => ({
            x: ((pt.x + off0) * sc) * dprMain,
            y: ((pt.y + off1) * sc) * dprMain,
          });

          const pad = Math.max(0, state.stickerPaddingPx || 0) * dprMain;
          const bw = Math.max(0, state.stickerBorderWidthPx || 0) * dprMain;
          const radius = 10 * dprMain;

          // 1) IMAGE post-its (screenshots)
          if (!hideNonLocked && Array.isArray(state.stickers) && state.stickers.length) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.imageSmoothingEnabled = true;
            for (const st of state.stickers) {
              if (!st || isTextSticker(st)) continue;
              if (!st.dataUrl && st.dataKey) {
                // Lazy-load screenshot from IndexedDB if available
                requestHydrateStickerData(st.id, st.dataKey);
              }
              const rot = (typeof st.rot === 'number') ? st.rot : 0;
              const pC = g2c({ x: (st.x + (st.w || 0) / 2), y: (st.y + (st.h || 0) / 2) });
              const p0 = g2c({ x: st.x, y: st.y });
              const p1 = g2c({ x: st.x + st.w, y: st.y + st.h });
              const w = Math.max(1, Math.abs(p1.x - p0.x));
              const h = Math.max(1, Math.abs(p1.y - p0.y));
              ctx.save();
              ctx.translate(pC.x, pC.y);
              if (rot) ctx.rotate(rot);
              const x = -w / 2;
              const y = -h / 2;

              if (state.stickerShadow) {
                ctx.shadowColor = 'rgba(0,0,0,0.35)';
                ctx.shadowBlur = Math.max(0, (state.stickerShadowStrength || 0) * dprMain);
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = Math.max(1, 3 * dprMain);
              } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
              }
              roundedRectPath(ctx, x, y, w, h, radius);
              ctx.fillStyle = state.stickerFrameColor || '#ffffff';
              ctx.fill();

              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;
              if (bw > 0.25) {
                roundedRectPath(ctx, x, y, w, h, radius);
                ctx.lineWidth = Math.max(1, bw);
                ctx.strokeStyle = 'rgba(0,0,0,0.45)';
                ctx.stroke();
              }

              if (st.pinned) {
                const pr = 7 * dprMain;
                const px = x + pr + 6 * dprMain;
                const py = y + pr + 6 * dprMain;
                ctx.save();
                ctx.fillStyle = 'rgba(220,40,40,0.95)';
                ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                ctx.lineWidth = Math.max(1, 1.5 * dprMain);
                ctx.beginPath();
                ctx.arc(px, py, pr, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(px, py + pr * 0.2);
                ctx.lineTo(px, py + pr * 1.65);
                ctx.stroke();
                ctx.restore();
              }

              const ix = x + pad + bw;
              const iy = y + pad + bw;
              const iw = Math.max(1, w - 2 * (pad + bw));
              const ih = Math.max(1, h - 2 * (pad + bw));
              if (st.dataUrl) {
                let img = __stickerImageCache.get(st.dataUrl);
                if (!img) {
                  img = new Image();
                  img.onload = () => app?.canvas?.setDirty(true, true);
                  img.src = st.dataUrl;
                  __stickerImageCache.set(st.dataUrl, img);
                }
                if (img && img.complete && img.naturalWidth > 0) {
                  ctx.save();
                  roundedRectPath(ctx, ix, iy, iw, ih, Math.max(0, radius - (pad + bw)));
                  ctx.clip();
                  ctx.drawImage(img, ix, iy, iw, ih);
                  ctx.restore();
                }
              } else {
                // Placeholder while screenshot loads
                ctx.save();
                roundedRectPath(ctx, ix, iy, iw, ih, Math.max(0, radius - (pad + bw)));
                ctx.clip();
                ctx.fillStyle = 'rgba(0,0,0,0.10)';
                ctx.fillRect(ix, iy, iw, ih);
                ctx.strokeStyle = 'rgba(0,0,0,0.18)';
                ctx.lineWidth = Math.max(1, 1 * dprMain);
                ctx.strokeRect(ix, iy, iw, ih);
                ctx.restore();
              }
              ctx.restore();
            }
            ctx.restore();
          }

          // 2) Strokes (annotations) above screenshots
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.imageSmoothingEnabled = true;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(__annoCanvas, 0, 0, __annoW, __annoH, 0, 0, cw, ch);
          ctx.restore();

          // 3) TEXT boxes above strokes
          if (Array.isArray(state.stickers) && state.stickers.length) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.imageSmoothingEnabled = true;
            for (const st of state.stickers) {
              if (!st || !isTextSticker(st)) continue;
              if (!isTextStickerVisible(st)) continue;
              if (hideNonLocked) {
                let keep = false;
                try {
                  const li = findTextLayerIndexByStickerId(st.id);
                  const lyr = li >= 0 ? state.layers?.[li] : null;
                  keep = !!(lyr && lyr.locked);
                } catch {}
                if (!keep) continue;
              }
              const rot = (typeof st.rot === 'number') ? st.rot : 0;
              const pC = g2c({ x: (st.x + (st.w || 0) / 2), y: (st.y + (st.h || 0) / 2) });
              const p0 = g2c({ x: st.x, y: st.y });
              const p1 = g2c({ x: st.x + st.w, y: st.y + st.h });
              const w = Math.max(1, Math.abs(p1.x - p0.x));
              const h = Math.max(1, Math.abs(p1.y - p0.y));
              ctx.save();
              ctx.translate(pC.x, pC.y);
              if (rot) ctx.rotate(rot);
              const x = -w / 2;
              const y = -h / 2;

              // No frame/background for text boxes (text only)
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;

              if (st.pinned) {
                const pr = 7 * dprMain;
                const px = x + pr + 6 * dprMain;
                const py = y + pr + 6 * dprMain;
                ctx.save();
                ctx.fillStyle = 'rgba(220,40,40,0.95)';
                ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                ctx.lineWidth = Math.max(1, 1.5 * dprMain);
                ctx.beginPath();
                ctx.arc(px, py, pr, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(px, py + pr * 0.2);
                ctx.lineTo(px, py + pr * 1.65);
                ctx.stroke();
                ctx.restore();
              }

              // Text boxes are text-only (no frame/background). Do NOT reuse screenshot padding/border,
              // otherwise increasing Post-it padding/border can clip text and make it appear to “disappear”.
              const textInset = 6 * dprMain;
              const ix = x + textInset;
              const iy = y + textInset;
              const iw = Math.max(1, w - 2 * textInset);
              const ih = Math.max(1, h - 2 * textInset);
              ctx.save();
              roundedRectPath(ctx, ix, iy, iw, ih, Math.max(0, radius - textInset));
              ctx.clip();
              // Scale font with zoom so it behaves like strokes/screenshots
              const fsBase = (Number(st.fontSize) || Number(state.textFontSize) || 28);
              const fs = Math.max(8, fsBase * (ds.scale || 1) * dprMain);
              const fam = String(st.fontFamily || state.textFontFamily || 'Arial');
              const fw = String(st.fontWeight || state.textFontWeight || 'normal');
              const fst = String(st.fontStyle || state.textFontStyle || 'normal');
              ctx.font = `${fst} ${fw} ${fs}px ${fam}`;
              let textFill = st.textColor || state.color || state.textColor || '#111111';
              try {
                const li = findTextLayerIndexByStickerId(st.id);
                const lyr = li >= 0 ? state.layers[li] : null;
                if (lyr?.style?.color) textFill = lyr.style.color;
              } catch {}
              ctx.fillStyle = String(textFill);
              ctx.textAlign = 'left';
              ctx.textBaseline = 'top';
              const underline = (st.underline ?? state.textUnderline) ? true : false;
              const lh = fs * 1.22;
              const lines = wrapTextLines(ctx, st.text || '', Math.max(1, iw));
              let yy = iy;
              for (const line of lines) {
                if (yy + lh > iy + ih + 0.5) break;
                ctx.fillText(line, ix, yy);
                if (underline && line) {
                  const mw = ctx.measureText(line).width;
                  const uy = yy + fs * 1.05;
                  ctx.save();
                  ctx.strokeStyle = String(textFill);
                  ctx.lineWidth = Math.max(1, fs / 14);
                  ctx.beginPath();
                  ctx.moveTo(ix, uy);
                  ctx.lineTo(ix + mw, uy);
                  ctx.stroke();
                  ctx.restore();
                }
                yy += lh;
              }
              ctx.restore();
              ctx.restore();
            }
            ctx.restore();
          }
          // Flash feedback for screenshot capture (after capture)
          if (state.shotFlash && state.shotFlash.t0) {
            const dt = performance.now() - state.shotFlash.t0;
            const dur = 180;
            if (dt < dur) {
              const a = Math.max(0, 1 - dt / dur);
              const r = normalizeRect(state.shotFlash.rect);
              if (r) {
                const p0 = g2c({ x: r.x0, y: r.y0 });
                const p1 = g2c({ x: r.x1, y: r.y1 });
                const x = Math.min(p0.x, p1.x);
                const y = Math.min(p0.y, p1.y);
                const w = Math.max(1, Math.abs(p1.x - p0.x));
                const h = Math.max(1, Math.abs(p1.y - p0.y));
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`;
                ctx.fillRect(x, y, w, h);
                ctx.restore();
              }
            } else {
              state.shotFlash = null;
            }
          }
        } catch {
          // Fallback: ensure strokes are visible even if sticker rendering failed
          try {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(__annoCanvas, 0, 0, __annoW, __annoH, 0, 0, cw, ch);
            ctx.restore();
          } catch {}
        }

        // Keep text editor (if any) aligned with the graph
        try { if (state.textEditor) syncTextEditorPosition(canvas); } catch {}

        // When hidden, preserve legacy behavior: no selection/creation overlays
        if (hideNonLocked) return;

        // Overlays (selection/screenshot rectangle)
        if (state.selection) {
          try {
            const sel = state.selection;
            const dprMain = getCanvasEffectiveDpr(canvas);
            const off0 = (ds.offset?.[0] || 0);
            const off1 = (ds.offset?.[1] || 0);
            const sc = (ds.scale || 1);
            const g2c = (pt) => ({
              x: ((pt.x + off0) * sc) * dprMain,
              y: ((pt.y + off1) * sc) * dprMain,
            });

            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(1, 2 * dprMain);
            ctx.setLineDash([6 * dprMain, 4 * dprMain]);

            // Screenshot tool: always show live selection rectangle
            if (sel.kind === 'screenshot') {
              ctx.strokeStyle = 'rgba(255,255,255,0.95)';
              ctx.fillStyle = 'rgba(255,255,255,0.08)';
              if (sel.mode === 'rect' && sel.rect) {
                const r = normalizeRect(sel.rect);
                if (r && r.w > 0.0001 && r.h > 0.0001) {
                  const p0 = g2c({ x: r.x0, y: r.y0 });
                  const p1 = g2c({ x: r.x1, y: r.y1 });
                  const x = Math.min(p0.x, p1.x);
                  const y = Math.min(p0.y, p1.y);
                  const w = Math.abs(p1.x - p0.x);
                  const h = Math.abs(p1.y - p0.y);
                  ctx.beginPath();
                  ctx.rect(x, y, w, h);
                  ctx.fill();
                  ctx.stroke();
                }
              }
              ctx.restore();
              return;
            }

            // Text tool: show live sizing rectangle while dragging
            if (sel.kind === 'text') {
              ctx.strokeStyle = 'rgba(3,155,229,0.95)';
              ctx.fillStyle = 'rgba(3,155,229,0.10)';
              if (sel.mode === 'rect' && sel.rect) {
                const r = normalizeRect(sel.rect);
                if (r && r.w > 0.0001 && r.h > 0.0001) {
                  const p0 = g2c({ x: r.x0, y: r.y0 });
                  const p1 = g2c({ x: r.x1, y: r.y1 });
                  const x = Math.min(p0.x, p1.x);
                  const y = Math.min(p0.y, p1.y);
                  const w = Math.abs(p1.x - p0.x);
                  const h = Math.abs(p1.y - p0.y);
                  ctx.beginPath();
                  ctx.rect(x, y, w, h);
                  ctx.fill();
                  ctx.stroke();
                }
              }
              ctx.restore();
              return;
            }

            // Select/Transform/Rotate: show a selection rectangle ONLY while the user is dragging to create it.
            if (sel.kind === 'select' && sel.creating) {
              ctx.strokeStyle = 'rgba(0,200,255,0.95)';
              ctx.fillStyle = 'rgba(0,200,255,0.08)';
              if (sel.mode === 'rect' && sel.rect) {
                const r = normalizeRect(sel.rect);
                if (r && r.w > 0.0001 && r.h > 0.0001) {
                  const p0 = g2c({ x: r.x0, y: r.y0 });
                  const p1 = g2c({ x: r.x1, y: r.y1 });
                  const x = Math.min(p0.x, p1.x);
                  const y = Math.min(p0.y, p1.y);
                  const w = Math.abs(p1.x - p0.x);
                  const h = Math.abs(p1.y - p0.y);
                  ctx.beginPath();
                  ctx.rect(x, y, w, h);
                  ctx.fill();
                  ctx.stroke();
                }
              } else if (Array.isArray(sel.points) && sel.points.length > 1) {
                const pts = sel.points.map(g2c);
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.stroke();
              }
              ctx.restore();
              return;
            }

            // Once selection exists, highlight selected items (no large group frame)
            if (sel.kind === 'select' && ((sel.selectedPaths?.length || 0) > 0 || (sel.selectedStickers?.length || 0) > 0)) {
              ctx.strokeStyle = 'rgba(255,180,0,0.95)';
              ctx.fillStyle = 'rgba(255,180,0,0.00)';

              // Highlight selected paths by their bboxes
              for (const it of sel.selectedPaths || []) {
                const layer = state.layers?.[it.layerIdx];
                const path = layer?.paths?.[it.pathIdx];
                // Always compute live bbox so the frame follows while items move
                const bb = pathBBox(path);
                if (!bb) continue;
                const r = normalizeRect(bb);
                const p0 = g2c({ x: r.x0, y: r.y0 });
                const p1 = g2c({ x: r.x1, y: r.y1 });
                const x = Math.min(p0.x, p1.x);
                const y = Math.min(p0.y, p1.y);
                const w = Math.abs(p1.x - p0.x);
                const h = Math.abs(p1.y - p0.y);
                ctx.beginPath();
                ctx.rect(x, y, w, h);
                ctx.stroke();
              }

              // Highlight selected stickers by their (axis-aligned) bbox
              for (const it of sel.selectedStickers || []) {
                const st = state.stickers?.[it.stickerIdx];
                // Always compute live bbox so the frame follows while items move
                const bb = stickerBBox(st);
                if (!bb) continue;
                const r = normalizeRect(bb);
                const p0 = g2c({ x: r.x0, y: r.y0 });
                const p1 = g2c({ x: r.x1, y: r.y1 });
                const x = Math.min(p0.x, p1.x);
                const y = Math.min(p0.y, p1.y);
                const w = Math.abs(p1.x - p0.x);
                const h = Math.abs(p1.y - p0.y);
                ctx.beginPath();
                ctx.rect(x, y, w, h);
                ctx.stroke();
              }

              // Transform/Rotate: draw only the 4 corner handles of the overall bbox
              if (state.tool === 'transform' || state.tool === 'rotate') {
                // Derive bbox from current selection (avoids stale sel.bbox causing slight offsets)
                let bbAll = null;
                try {
                  for (const it of sel.selectedPaths || []) {
                    const layer = state.layers?.[it.layerIdx];
                    const path = layer?.paths?.[it.pathIdx];
                    const bb = pathBBox(path);
                    if (bb) bbAll = bbAll ? bboxUnion(bbAll, bb) : bb;
                  }
                  for (const it of sel.selectedStickers || []) {
                    const st = state.stickers?.[it.stickerIdx];
                    const bb = stickerBBox(st);
                    if (bb) bbAll = bbAll ? bboxUnion(bbAll, bb) : bb;
                  }
                } catch {}

                const bbUse = bbAll || sel.bbox;
                if (!bbUse) {
                  // nothing
                } else {
                  const r = normalizeRect(bbUse);
                if (r && isFinite(r.x0) && isFinite(r.y0) && isFinite(r.x1) && isFinite(r.y1)) {
                  const p0 = g2c({ x: r.x0, y: r.y0 });
                  const p1 = g2c({ x: r.x1, y: r.y1 });
                  const x0 = Math.min(p0.x, p1.x);
                  const y0 = Math.min(p0.y, p1.y);
                  const x1 = Math.max(p0.x, p1.x);
                  const y1 = Math.max(p0.y, p1.y);
                  const hs = 7 * dprMain; // half-size of handle
                  ctx.save();
                  ctx.setLineDash([]);
                  ctx.lineWidth = Math.max(1, 2 * dprMain);
                  ctx.fillStyle = 'rgba(0,200,255,0.95)';
                  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                  const corners = [
                    { x: x0, y: y0 },
                    { x: x1, y: y0 },
                    { x: x1, y: y1 },
                    { x: x0, y: y1 },
                  ];
                  for (const c of corners) {
                    ctx.beginPath();
                    ctx.rect(c.x - hs, c.y - hs, hs * 2, hs * 2);
                    ctx.fill();
                    ctx.stroke();
                  }
                  ctx.restore();
                }
                }
              }
            }

            ctx.restore();
          } catch {}
        }
      };

      // Pointer events on the graph canvas only
      const el = canvas.canvas;
      const onDown = (e) => {
        if (e.target && e.target.closest('#iamccs-sidebar')) return;
        if (e.button !== 0) return; // only left button draws; allow middle-button pan
        const p = toGraphPos(e, canvas);
        if (!p) return;
        state.lastPointerGraphPos = p;

        // Pin/unpin mode: click a sticker to toggle pinned state (prevents moving/resizing/rotating)
        if (state.enabled && state.pinMode) {
          const hit = hitTestStickerInside(p, canvas);
          if (hit >= 0) {
            const st = state.stickers?.[hit];
            if (st) {
              pushHistorySnapshot();
              st.pinned = !st.pinned;
              // If we pinned it while dragging was in progress, clear drags
              state.stickerDrag = null;
              state.stickerResize = null;
              state.transformDrag = null;
              state.rotateDrag = null;
              state.activePointerId = null;
              persistToGraphExtra(true);
              app?.canvas?.setDirty(true, true);
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        }

        // When sel override is enabled while Annotate is OFF, route sticker clicks through the selection pipeline
        // so the selection rectangle is visible.
        const allowDirectStickerDrag = state.enabled || !state.selOverride;
        if (allowDirectStickerDrag) {
          // Sticker border drag should work regardless of tool (unless the tool needs the corner for resize/rotate)
          const cornerHitForTool = (state.enabled && (state.tool === 'transform' || state.tool === 'rotate')) ? hitTestStickerCorner(p, canvas, 14) : null;
          const stBorderIdx = hitTestStickerBorder(p, canvas, 20);
          if (stBorderIdx >= 0 && !(cornerHitForTool && cornerHitForTool.stickerIdx === stBorderIdx)) {
            try { if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId); } catch {}
            state.activePointerId = e.pointerId;
            const st = state.stickers?.[stBorderIdx];
            if (st) {
              // If pinned, don't drag the sticker; allow the current tool (e.g. Draw) to handle the gesture.
              if (st.pinned) {
                try { if (typeof el.releasePointerCapture === 'function') el.releasePointerCapture(e.pointerId); } catch {}
                state.activePointerId = null;
              } else {
              const anchored0 = (isImageSticker(st) && st.id) ? collectAnchoredChildrenSnapshot(st.id) : null;
              state.stickerDrag = { stickerIdx: stBorderIdx, start: { x: p.x, y: p.y }, x0: st.x, y0: st.y, anchored0 };
              el.style.cursor = 'move';
              e.preventDefault();
              e.stopPropagation();
              app.canvas.setDirty(true, true);
              return;
              }
            }
          }

          // Allow moving screenshot post-its (image stickers) by dragging anywhere inside (not only borders).
          // Keep corner interactions for Transform/Rotate tools.
          const stInsideImgIdx = hitTestImageStickerInside(p, canvas);
          if (stInsideImgIdx >= 0 && !(cornerHitForTool && cornerHitForTool.stickerIdx === stInsideImgIdx)) {
            try { if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId); } catch {}
            state.activePointerId = e.pointerId;
            const st = state.stickers?.[stInsideImgIdx];
            if (st) {
              // If pinned, don't drag the sticker; allow the current tool (e.g. Draw) to handle the gesture.
              if (st.pinned) {
                try { if (typeof el.releasePointerCapture === 'function') el.releasePointerCapture(e.pointerId); } catch {}
                state.activePointerId = null;
              } else {
              const anchored0 = (isImageSticker(st) && st.id) ? collectAnchoredChildrenSnapshot(st.id) : null;
              state.stickerDrag = { stickerIdx: stInsideImgIdx, start: { x: p.x, y: p.y }, x0: st.x, y0: st.y, anchored0 };
              el.style.cursor = 'move';
              e.preventDefault();
              e.stopPropagation();
              app.canvas.setDirty(true, true);
              return;
              }
            }
          }
        }

        // When Annotate is OFF, allow only selection/move (sel override) or sticker dragging; otherwise let everything pass through.
        if (!state.enabled) {
          if (!state.selOverride) return;

          // Click-to-select a single sticker/path and drag-move it (like the Selection tool)
          const hitSel = __iamccs_selectSingleAtPoint(p, canvas);
          if (!hitSel) {
            // Don't consume the gesture so ComfyUI can still pan/drag nodes
            state.selection = null;
            app?.canvas?.setDirty(true, true);
            return;
          }

          try { if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId); } catch {}
          state.activePointerId = e.pointerId;
          state.selection = hitSel;

          const sel = state.selection;
          if (sel?.bbox) {
            sel.dragging = false;
            sel.pendingDrag = true;
            sel.dragStart = { x: p.x, y: p.y };
            sel.dragData = { bbox0: sel.bbox ? { ...sel.bbox } : null, paths: [], stickers: [] };

            for (const it of sel.selectedPaths || []) {
              const layer = state.layers[it.layerIdx];
              const path = layer?.paths?.[it.pathIdx];
              if (!path) continue;
              if (layer?.locked) continue;
              sel.dragData.paths.push({
                layerIdx: it.layerIdx,
                pathIdx: it.pathIdx,
                points0: Array.isArray(path.points) ? path.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
              });
            }
            for (const it of sel.selectedStickers || []) {
              const st = state.stickers?.[it.stickerIdx];
              if (!st) continue;
              if (st.pinned) continue;
              sel.dragData.stickers.push({ stickerIdx: it.stickerIdx, x0: st.x, y0: st.y });
            }

            // Move anchored children with an image sticker even if not explicitly selected
            try {
              const skipStickerIds = new Set();
              for (const it of (sel.selectedStickers || [])) {
                const st = state.stickers?.[it.stickerIdx];
                if (st?.id) skipStickerIds.add(st.id);
              }
              const skipPathKeys = new Set();
              for (const it of (sel.selectedPaths || [])) {
                if (typeof it?.layerIdx === 'number' && typeof it?.pathIdx === 'number') skipPathKeys.add(`${it.layerIdx}:${it.pathIdx}`);
              }
              const agg = { paths: [], stickers: [] };
              for (const it of (sel.selectedStickers || [])) {
                const st = state.stickers?.[it.stickerIdx];
                if (!st || !isImageSticker(st) || !st.id) continue;
                const s0 = collectAnchoredChildrenSnapshot(st.id, { skipStickerIds, skipPathKeys });
                if (s0?.paths?.length) agg.paths.push(...s0.paths);
                if (s0?.stickers?.length) agg.stickers.push(...s0.stickers);
              }
              sel.dragData.anchored0 = agg;
            } catch {}
          }

          el.style.cursor = 'move';
          e.preventDefault();
          e.stopPropagation();
          app?.canvas?.setDirty(true, true);
          return;
        }

        // Double-click a text sticker to edit its contents
        try {
          if (e.detail === 2) {
            const hitIdx = hitTestStickerInside(p, canvas);
            const st = (hitIdx >= 0) ? state.stickers?.[hitIdx] : null;
            if (st && isTextSticker(st) && !st.pinned) {
              openTextEditorForStickerId(st.id, canvas);
              e.preventDefault();
              e.stopPropagation();
              app.canvas.setDirty(true, true);
              return;
            }
          }
        } catch {}

        // Tool routing: keep draw pipeline intact, add non-draw tools around it.
        if (state.tool === 'select') {
          try { if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId); } catch {}
          state.activePointerId = e.pointerId;
          const sel = state.selection;
          if (sel?.bbox && pointInRect(p, sel.bbox)) {
            // Start dragging selection
            sel.dragging = false;
            sel.pendingDrag = true;
            sel.dragStart = { x: p.x, y: p.y };
            sel.dragData = {
              bbox0: sel.bbox ? { ...sel.bbox } : null,
              paths: [],
              stickers: [],
            };
            for (const it of sel.selectedPaths || []) {
              const layer = state.layers[it.layerIdx];
              const path = layer?.paths?.[it.pathIdx];
              if (!path) continue;
              if (layer.locked) continue;
              sel.dragData.paths.push({
                layerIdx: it.layerIdx,
                pathIdx: it.pathIdx,
                points0: Array.isArray(path.points) ? path.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
              });
            }
            for (const it of sel.selectedStickers || []) {
              const st = state.stickers?.[it.stickerIdx];
              if (!st) continue;
              if (st.pinned) continue;
              sel.dragData.stickers.push({
                stickerIdx: it.stickerIdx,
                x0: st.x,
                y0: st.y,
              });
            }

            // If an image sticker (screenshot) is moved without selecting its children,
            // still move anchored children with it.
            try {
              const skipStickerIds = new Set();
              for (const it of (sel.selectedStickers || [])) {
                const st = state.stickers?.[it.stickerIdx];
                if (st?.id) skipStickerIds.add(st.id);
              }
              const skipPathKeys = new Set();
              for (const it of (sel.selectedPaths || [])) {
                if (typeof it?.layerIdx === 'number' && typeof it?.pathIdx === 'number') skipPathKeys.add(`${it.layerIdx}:${it.pathIdx}`);
              }
              const agg = { paths: [], stickers: [] };
              for (const it of (sel.selectedStickers || [])) {
                const st = state.stickers?.[it.stickerIdx];
                if (!st || !isImageSticker(st) || !st.id) continue;
                const s0 = collectAnchoredChildrenSnapshot(st.id, { skipStickerIds, skipPathKeys });
                if (s0?.paths?.length) agg.paths.push(...s0.paths);
                if (s0?.stickers?.length) agg.stickers.push(...s0.stickers);
              }
              sel.dragData.anchored0 = agg;
            } catch {}
          } else {
            // Click-to-select (single item) when Annotate is enabled.
            // This matches the behavior of selOverride selection when Annotate is disabled.
            const hitSel = __iamccs_selectSingleAtPoint(p, canvas);
            if (hitSel) {
              state.selection = hitSel;
              const s2 = state.selection;
              if (s2?.bbox) {
                s2.dragging = false;
                s2.pendingDrag = true;
                s2.dragStart = { x: p.x, y: p.y };
                s2.dragData = { bbox0: s2.bbox ? { ...s2.bbox } : null, paths: [], stickers: [] };

                for (const it of s2.selectedPaths || []) {
                  const layer = state.layers?.[it.layerIdx];
                  const path = layer?.paths?.[it.pathIdx];
                  if (!path) continue;
                  if (layer?.locked) continue;
                  s2.dragData.paths.push({
                    layerIdx: it.layerIdx,
                    pathIdx: it.pathIdx,
                    points0: Array.isArray(path.points) ? path.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
                  });
                }
                for (const it of s2.selectedStickers || []) {
                  const st = state.stickers?.[it.stickerIdx];
                  if (!st) continue;
                  if (st.pinned) continue;
                  s2.dragData.stickers.push({ stickerIdx: it.stickerIdx, x0: st.x, y0: st.y });
                }

                // Move anchored children with selected image stickers even if not explicitly selected
                try {
                  const skipStickerIds = new Set();
                  for (const it of (s2.selectedStickers || [])) {
                    const st = state.stickers?.[it.stickerIdx];
                    if (st?.id) skipStickerIds.add(st.id);
                  }
                  const skipPathKeys = new Set();
                  for (const it of (s2.selectedPaths || [])) {
                    if (typeof it?.layerIdx === 'number' && typeof it?.pathIdx === 'number') skipPathKeys.add(`${it.layerIdx}:${it.pathIdx}`);
                  }
                  const agg = { paths: [], stickers: [] };
                  for (const it of (s2.selectedStickers || [])) {
                    const st = state.stickers?.[it.stickerIdx];
                    if (!st || !isImageSticker(st) || !st.id) continue;
                    const s0 = collectAnchoredChildrenSnapshot(st.id, { skipStickerIds, skipPathKeys });
                    if (s0?.paths?.length) agg.paths.push(...s0.paths);
                    if (s0?.stickers?.length) agg.stickers.push(...s0.stickers);
                  }
                  s2.dragData.anchored0 = agg;
                } catch {}
              }
              el.style.cursor = 'move';
            } else {
              // Start a pending selection: we will create the rectangle/lasso only after a real drag.
              state.pendingSelection = { tool: state.tool, kind: 'select', mode: state.selectMode, start: { x: p.x, y: p.y } };
            }
          }
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, true);
          return;
        }

        if (state.tool === 'screenshot') {
          try { if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId); } catch {}
          state.activePointerId = e.pointerId;
          // Start a screenshot rectangle (capture happens on pointerup)
          state.selection = {
            kind: 'screenshot',
            mode: 'rect',
            start: { x: p.x, y: p.y },
            points: [{ x: p.x, y: p.y }],
            rect: { x0: p.x, y0: p.y, x1: p.x, y1: p.y },
            bbox: null,
            dragging: false,
          };
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, true);
          return;
        }

        if (state.tool === 'text') {
          try { if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId); } catch {}
          state.activePointerId = e.pointerId;
          // Start sizing rectangle (text insert happens on pointerup)
          state.selection = {
            kind: 'text',
            mode: 'rect',
            start: { x: p.x, y: p.y },
            points: [{ x: p.x, y: p.y }],
            rect: { x0: p.x, y0: p.y, x1: p.x, y1: p.y },
            bbox: null,
            dragging: false,
          };
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, true);
          return;
        }

        if (state.tool === 'transform') {
          try { if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId); } catch {}
          state.activePointerId = e.pointerId;

          // 1) Stickers: resize by corners without selection
          const hitC = hitTestStickerCorner(p, canvas, 12);
          if (hitC && hitC.stickerIdx >= 0) {
            const st = state.stickers?.[hitC.stickerIdx];
            if (st) {
              if (st.pinned) {
                e.preventDefault();
                e.stopPropagation();
                app.canvas.setDirty(true, true);
                return;
              }
              const anchored0 = (isImageSticker(st) && st.id) ? collectAnchoredChildrenSnapshot(st.id) : null;
              state.stickerResize = {
                stickerIdx: hitC.stickerIdx,
                corner: hitC.corner,
                start: { x: p.x, y: p.y },
                x0: st.x,
                y0: st.y,
                w0: st.w,
                h0: st.h,
                aspect: (st.h ? (st.w / st.h) : 1),
                rot0: (typeof st.rot === 'number') ? st.rot : 0,
                anchored0,
              };
              el.style.cursor = 'nwse-resize';
              e.preventDefault();
              e.stopPropagation();
              app.canvas.setDirty(true, true);
              return;
            }
          }

          // 2) Stickers: move by border (optional) while in transform
          const hitB = hitTestStickerBorder(p, canvas, 20);
          if (hitB >= 0) {
            const st = state.stickers?.[hitB];
            if (st) {
              if (st.pinned) {
                e.preventDefault();
                e.stopPropagation();
                app.canvas.setDirty(true, true);
                return;
              }
              const anchored0 = (isImageSticker(st) && st.id) ? collectAnchoredChildrenSnapshot(st.id) : null;
              state.stickerDrag = { stickerIdx: hitB, start: { x: p.x, y: p.y }, x0: st.x, y0: st.y, anchored0 };
              el.style.cursor = 'move';
              e.preventDefault();
              e.stopPropagation();
              app.canvas.setDirty(true, true);
              return;
            }
          }

          // 3) Selection bbox: resize selected items (requires a selection already)
          const sel = state.selection;
          if (sel?.bbox && (sel.selectedPaths?.length || sel.selectedStickers?.length)) {
            // Use a live bbox (union of selected items) to avoid stale sel.bbox offset
            let bbAll = null;
            try {
              for (const it of sel.selectedPaths || []) {
                const layer = state.layers?.[it.layerIdx];
                const path = layer?.paths?.[it.pathIdx];
                const bb = pathBBox(path);
                if (bb) bbAll = bbAll ? bboxUnion(bbAll, bb) : bb;
              }
              for (const it of sel.selectedStickers || []) {
                const st = state.stickers?.[it.stickerIdx];
                const bb = stickerBBox(st);
                if (bb) bbAll = bbAll ? bboxUnion(bbAll, bb) : bb;
              }
            } catch {}
            const bboxUse = bbAll || sel.bbox;
            const corner = bboxUse ? hitTestBBoxCorner(p, bboxUse, canvas, 20) : null;
            if (corner) {
              const bbox0 = { ...bboxUse };
              const items = { paths: [], stickers: [] };
              for (const it of sel.selectedPaths || []) {
                const layer = state.layers[it.layerIdx];
                const path = layer?.paths?.[it.pathIdx];
                if (!path || layer?.locked) continue;
                items.paths.push({ layerIdx: it.layerIdx, pathIdx: it.pathIdx, points0: path.points.map(pt => ({ x: pt.x, y: pt.y })) });
              }
              for (const it of sel.selectedStickers || []) {
                const st = state.stickers?.[it.stickerIdx];
                if (!st || st.pinned) continue;
                items.stickers.push({ stickerIdx: it.stickerIdx, x0: st.x, y0: st.y, w0: st.w, h0: st.h });
              }

              // Also scale anchored children of selected image stickers (screenshots), if not already selected
              try {
                const skipStickerIds = new Set();
                for (const it of (sel.selectedStickers || [])) {
                  const st = state.stickers?.[it.stickerIdx];
                  if (st?.id) skipStickerIds.add(st.id);
                }
                const skipPathKeys = new Set();
                for (const it of (sel.selectedPaths || [])) {
                  if (typeof it?.layerIdx === 'number' && typeof it?.pathIdx === 'number') skipPathKeys.add(`${it.layerIdx}:${it.pathIdx}`);
                }
                const addPathKeys = new Set();
                for (const it of (items.paths || [])) addPathKeys.add(`${it.layerIdx}:${it.pathIdx}`);
                const addStickerIdx = new Set();
                for (const it of (items.stickers || [])) addStickerIdx.add(it.stickerIdx);

                for (const it of (sel.selectedStickers || [])) {
                  const st = state.stickers?.[it.stickerIdx];
                  if (!st || !isImageSticker(st) || !st.id) continue;
                  const s0 = collectAnchoredChildrenSnapshot(st.id, { skipStickerIds, skipPathKeys });
                  for (const pp of (s0.paths || [])) {
                    const k = `${pp.layerIdx}:${pp.pathIdx}`;
                    if (addPathKeys.has(k)) continue;
                    addPathKeys.add(k);
                    items.paths.push(pp);
                  }
                  for (const ss of (s0.stickers || [])) {
                    if (addStickerIdx.has(ss.stickerIdx)) continue;
                    addStickerIdx.add(ss.stickerIdx);
                    items.stickers.push({ stickerIdx: ss.stickerIdx, x0: ss.x0, y0: ss.y0, w0: ss.w0, h0: ss.h0 });
                  }
                }
              } catch {}
              const bw = Math.max(1e-6, (bbox0.x1 - bbox0.x0));
              const bh = Math.max(1e-6, (bbox0.y1 - bbox0.y0));
              state.transformDrag = { corner, start: { x: p.x, y: p.y }, bbox0, items, aspect: bw / bh };
              el.style.cursor = 'nwse-resize';
              e.preventDefault();
              e.stopPropagation();
              app.canvas.setDirty(true, true);
              return;
            }
          }

          // Otherwise: behave like Select so user can create/select a group, then resize via corners
          let bboxForMove = sel?.bbox;
          try {
            if (sel?.bbox && (sel.selectedPaths?.length || sel.selectedStickers?.length)) {
              let bbAll2 = null;
              for (const it of sel.selectedPaths || []) {
                const layer = state.layers?.[it.layerIdx];
                const path = layer?.paths?.[it.pathIdx];
                const bb = pathBBox(path);
                if (bb) bbAll2 = bbAll2 ? bboxUnion(bbAll2, bb) : bb;
              }
              for (const it of sel.selectedStickers || []) {
                const st = state.stickers?.[it.stickerIdx];
                const bb = stickerBBox(st);
                if (bb) bbAll2 = bbAll2 ? bboxUnion(bbAll2, bb) : bb;
              }
              bboxForMove = bbAll2 || bboxForMove;
            }
          } catch {}
          if (bboxForMove && pointInRect(p, bboxForMove)) {
            sel.dragging = false;
            sel.pendingDrag = true;
            sel.dragStart = { x: p.x, y: p.y };
            sel.dragData = {
              bbox0: bboxForMove ? { ...bboxForMove } : null,
              paths: [],
              stickers: [],
            };
            for (const it of sel.selectedPaths || []) {
              const layer = state.layers[it.layerIdx];
              const path = layer?.paths?.[it.pathIdx];
              if (!path) continue;
              if (layer.locked) continue;
              sel.dragData.paths.push({
                layerIdx: it.layerIdx,
                pathIdx: it.pathIdx,
                points0: Array.isArray(path.points) ? path.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
              });
            }
            for (const it of sel.selectedStickers || []) {
              const st = state.stickers?.[it.stickerIdx];
              if (!st) continue;
              if (st.pinned) continue;
              sel.dragData.stickers.push({ stickerIdx: it.stickerIdx, x0: st.x, y0: st.y });
            }

            // Also move anchored children of any selected image sticker (screenshot)
            try {
              const skipStickerIds = new Set();
              for (const it of (sel.selectedStickers || [])) {
                const st = state.stickers?.[it.stickerIdx];
                if (st?.id) skipStickerIds.add(st.id);
              }
              const skipPathKeys = new Set();
              for (const it of (sel.selectedPaths || [])) {
                if (typeof it?.layerIdx === 'number' && typeof it?.pathIdx === 'number') skipPathKeys.add(`${it.layerIdx}:${it.pathIdx}`);
              }
              const agg = { paths: [], stickers: [] };
              for (const it of (sel.selectedStickers || [])) {
                const st = state.stickers?.[it.stickerIdx];
                if (!st || !isImageSticker(st) || !st.id) continue;
                const s0 = collectAnchoredChildrenSnapshot(st.id, { skipStickerIds, skipPathKeys });
                if (s0?.paths?.length) agg.paths.push(...s0.paths);
                if (s0?.stickers?.length) agg.stickers.push(...s0.stickers);
              }
              sel.dragData.anchored0 = agg;
            } catch {}
          } else {
            state.pendingSelection = { tool: state.tool, kind: 'select', mode: state.selectMode, start: { x: p.x, y: p.y } };
          }
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, true);
          return;
        }

        if (state.tool === 'rotate') {
          try { if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId); } catch {}
          state.activePointerId = e.pointerId;

          // 1) Stickers: rotate by dragging corners without needing selection
          const hitC = hitTestStickerCorner(p, canvas, 12);
          if (hitC && hitC.stickerIdx >= 0) {
            const st = state.stickers?.[hitC.stickerIdx];
            if (st) {
              if (st.pinned) {
                e.preventDefault();
                e.stopPropagation();
                app.canvas.setDirty(true, true);
                return;
              }
              const w = (typeof st.w === 'number') ? st.w : 0;
              const h = (typeof st.h === 'number') ? st.h : 0;
              const pivot = { x: (st.x + w / 2), y: (st.y + h / 2) };
              const items = {
                paths: [],
                stickers: [{
                  stickerIdx: hitC.stickerIdx,
                  x0: st.x,
                  y0: st.y,
                  w0: st.w,
                  h0: st.h,
                  rot0: (typeof st.rot === 'number') ? st.rot : 0,
                }],
              };

              // If rotating an image sticker (screenshot), rotate anchored children together
              try {
                if (isImageSticker(st) && st.id) {
                  const s0 = collectAnchoredChildrenSnapshot(st.id);
                  if (s0?.paths?.length) items.paths.push(...s0.paths);
                  if (s0?.stickers?.length) items.stickers.push(...s0.stickers);
                }
              } catch {}
              state.rotateDrag = {
                pivot,
                startAngle: Math.atan2(p.y - pivot.y, p.x - pivot.x),
                items,
              };
              el.style.cursor = 'grabbing';
              e.preventDefault();
              e.stopPropagation();
              app.canvas.setDirty(true, true);
              return;
            }
          }

          // 2) Selection: rotate by dragging bbox corners
          const sel = state.selection;
          if (sel?.bbox && (sel.selectedPaths?.length || sel.selectedStickers?.length)) {
            // Use a live bbox (union of selected items) to avoid stale sel.bbox offset
            let bbAll = null;
            try {
              for (const it of sel.selectedPaths || []) {
                const layer = state.layers?.[it.layerIdx];
                const path = layer?.paths?.[it.pathIdx];
                const bb = pathBBox(path);
                if (bb) bbAll = bbAll ? bboxUnion(bbAll, bb) : bb;
              }
              for (const it of sel.selectedStickers || []) {
                const st = state.stickers?.[it.stickerIdx];
                const bb = stickerBBox(st);
                if (bb) bbAll = bbAll ? bboxUnion(bbAll, bb) : bb;
              }
            } catch {}
            const bboxUse = bbAll || sel.bbox;
            const corner = bboxUse ? hitTestBBoxCorner(p, bboxUse, canvas, 20) : null;
            if (corner) {
              const pivot = rectCenter(bboxUse) || { x: (bboxUse.x0 + bboxUse.x1) / 2, y: (bboxUse.y0 + bboxUse.y1) / 2 };
              const items = { paths: [], stickers: [] };
              for (const it of sel.selectedPaths || []) {
                const layer = state.layers[it.layerIdx];
                const path = layer?.paths?.[it.pathIdx];
                if (!path || layer?.locked) continue;
                items.paths.push({ layerIdx: it.layerIdx, pathIdx: it.pathIdx, points0: path.points.map(pt => ({ x: pt.x, y: pt.y })) });
              }
              for (const it of sel.selectedStickers || []) {
                const st = state.stickers?.[it.stickerIdx];
                if (!st || st.pinned) continue;
                items.stickers.push({
                  stickerIdx: it.stickerIdx,
                  x0: st.x,
                  y0: st.y,
                  w0: st.w,
                  h0: st.h,
                  rot0: (typeof st.rot === 'number') ? st.rot : 0,
                });
              }

              // Also rotate anchored children of selected image stickers (screenshots), if not already selected
              try {
                const skipStickerIds = new Set();
                for (const it of (sel.selectedStickers || [])) {
                  const st = state.stickers?.[it.stickerIdx];
                  if (st?.id) skipStickerIds.add(st.id);
                }
                const skipPathKeys = new Set();
                for (const it of (sel.selectedPaths || [])) {
                  if (typeof it?.layerIdx === 'number' && typeof it?.pathIdx === 'number') skipPathKeys.add(`${it.layerIdx}:${it.pathIdx}`);
                }
                const addPathKeys = new Set();
                for (const it of (items.paths || [])) addPathKeys.add(`${it.layerIdx}:${it.pathIdx}`);
                const addStickerIdx = new Set();
                for (const it of (items.stickers || [])) addStickerIdx.add(it.stickerIdx);

                for (const it of (sel.selectedStickers || [])) {
                  const st = state.stickers?.[it.stickerIdx];
                  if (!st || !isImageSticker(st) || !st.id) continue;
                  const s0 = collectAnchoredChildrenSnapshot(st.id, { skipStickerIds, skipPathKeys });
                  for (const pp of (s0.paths || [])) {
                    const k = `${pp.layerIdx}:${pp.pathIdx}`;
                    if (addPathKeys.has(k)) continue;
                    addPathKeys.add(k);
                    items.paths.push(pp);
                  }
                  for (const ss of (s0.stickers || [])) {
                    if (addStickerIdx.has(ss.stickerIdx)) continue;
                    addStickerIdx.add(ss.stickerIdx);
                    items.stickers.push(ss);
                  }
                }
              } catch {}
              state.rotateDrag = {
                pivot,
                startAngle: Math.atan2(p.y - pivot.y, p.x - pivot.x),
                items,
              };
              el.style.cursor = 'grabbing';
              e.preventDefault();
              e.stopPropagation();
              app.canvas.setDirty(true, true);
              return;
            }
          }

          // Otherwise: behave like Select so user can build a selection to rotate
          let bboxForMove = sel?.bbox;
          try {
            if (sel?.bbox && (sel.selectedPaths?.length || sel.selectedStickers?.length)) {
              let bbAll2 = null;
              for (const it of sel.selectedPaths || []) {
                const layer = state.layers?.[it.layerIdx];
                const path = layer?.paths?.[it.pathIdx];
                const bb = pathBBox(path);
                if (bb) bbAll2 = bbAll2 ? bboxUnion(bbAll2, bb) : bb;
              }
              for (const it of sel.selectedStickers || []) {
                const st = state.stickers?.[it.stickerIdx];
                const bb = stickerBBox(st);
                if (bb) bbAll2 = bbAll2 ? bboxUnion(bbAll2, bb) : bb;
              }
              bboxForMove = bbAll2 || bboxForMove;
            }
          } catch {}
          if (bboxForMove && pointInRect(p, bboxForMove)) {
            sel.dragging = false;
            sel.pendingDrag = true;
            sel.dragStart = { x: p.x, y: p.y };
            sel.dragData = {
              bbox0: bboxForMove ? { ...bboxForMove } : null,
              paths: [],
              stickers: [],
            };
            for (const it of sel.selectedPaths || []) {
              const layer = state.layers[it.layerIdx];
              const path = layer?.paths?.[it.pathIdx];
              if (!path) continue;
              if (layer.locked) continue;
              sel.dragData.paths.push({
                layerIdx: it.layerIdx,
                pathIdx: it.pathIdx,
                points0: Array.isArray(path.points) ? path.points.map(pt => ({ x: pt.x, y: pt.y })) : [],
              });
            }
            for (const it of sel.selectedStickers || []) {
              const st = state.stickers?.[it.stickerIdx];
              if (!st) continue;
              if (st.pinned) continue;
              sel.dragData.stickers.push({ stickerIdx: it.stickerIdx, x0: st.x, y0: st.y });
            }

            // Also move anchored children of any selected image sticker (screenshot)
            try {
              const skipStickerIds = new Set();
              for (const it of (sel.selectedStickers || [])) {
                const st = state.stickers?.[it.stickerIdx];
                if (st?.id) skipStickerIds.add(st.id);
              }
              const skipPathKeys = new Set();
              for (const it of (sel.selectedPaths || [])) {
                if (typeof it?.layerIdx === 'number' && typeof it?.pathIdx === 'number') skipPathKeys.add(`${it.layerIdx}:${it.pathIdx}`);
              }
              const agg = { paths: [], stickers: [] };
              for (const it of (sel.selectedStickers || [])) {
                const st = state.stickers?.[it.stickerIdx];
                if (!st || !isImageSticker(st) || !st.id) continue;
                const s0 = collectAnchoredChildrenSnapshot(st.id, { skipStickerIds, skipPathKeys });
                if (s0?.paths?.length) agg.paths.push(...s0.paths);
                if (s0?.stickers?.length) agg.stickers.push(...s0.stickers);
              }
              sel.dragData.anchored0 = agg;
            } catch {}
          } else {
            state.pendingSelection = { tool: state.tool, kind: 'select', mode: state.selectMode, start: { x: p.x, y: p.y } };
          }
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, true);
          return;
        }

        // Draw tool
        try {
          const curLayer = getCurrentLayer();
          if (curLayer?.kind === 'text') {
            console.log('[IAMCCS] Cannot draw on a Text layer. Open a draw layer to draw.');
            try {
              const now = Date.now();
              if (!state._lastTextLayerDrawWarnAt || (now - state._lastTextLayerDrawWarnAt) > 900) {
                state._lastTextLayerDrawWarnAt = now;
                showToast('Cannot draw on a Text layer. Open a draw layer to draw.', { kind: 'warn', ms: 1800 });
              }
            } catch {}
            e.preventDefault();
            e.stopPropagation();
            app?.canvas?.setDirty(true, false);
            return;
          }
        } catch {}
        if (state.penOnly && e.pointerType && e.pointerType !== 'pen') {
          try {
            const now = Date.now();
            if (!state._lastPenOnlyWarnAt || (now - state._lastPenOnlyWarnAt) > 900) {
              state._lastPenOnlyWarnAt = now;
              showToast('Pen-only mode is enabled. Use a pen or disable Pen-only.', { kind: 'warn', ms: 1800 });
            }
          } catch {}
          e.preventDefault();
          e.stopPropagation();
          app?.canvas?.setDirty(true, false);
          return;
        }
        // Capture pointer so we always receive pointerup even if leaving the canvas
        try { if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId); } catch {}
        state.activePointerId = e.pointerId;

        // Undo snapshot: one per stroke (draw/erase)
        try {
          const lyr = getCurrentLayer();
          if (lyr && !lyr.locked) pushHistorySnapshot();
        } catch {}

        let parentStickerId = null;
        try {
          const hitImg = hitTestImageStickerInside(p, canvas);
          parentStickerId = (hitImg >= 0) ? (state.stickers?.[hitImg]?.id || null) : null;
        } catch {}
        state.current = { color: state.color, width: state.width, opacity: state.opacity, dashed: state.dashed, mode: state.eraser ? 'erase' : 'draw', parentStickerId: parentStickerId || undefined, points: [p] };
        e.preventDefault();
        e.stopPropagation();
        app.canvas.setDirty(true, true);
      };
      const onMove = (e) => {
        const p = toGraphPos(e, canvas);
        if (!p) return;
        state.lastPointerGraphPos = p;

        // Sticker drag (draw/transform tools)
        if (state.stickerDrag && state.activePointerId != null && e.pointerId === state.activePointerId) {
          const d = state.stickerDrag;
          const st = state.stickers?.[d.stickerIdx];
          if (!st) return;
          if (st.pinned) {
            state.stickerDrag = null;
          } else {
          if (!d._historyPushed) {
            d._historyPushed = true;
            pushHistorySnapshot();
          }
          const dx = p.x - d.start.x;
          const dy = p.y - d.start.y;
          st.x = d.x0 + dx;
          st.y = d.y0 + dy;
          if (d.anchored0) {
            try { applyAnchoredSnapshotDelta(d.anchored0, dx, dy); } catch {}
          }
          el.style.cursor = 'move';
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, false);
          persistToGraphExtra();
          return;
          }
        }

        // When Annotate is OFF, allow moving a selected item only when sel override is enabled.
        if (!state.enabled) {
          if (!state.selOverride) return;
          if (state.activePointerId != null && typeof e.pointerId === 'number' && e.pointerId !== state.activePointerId) return;
          const leftDown = (e.buttons & 1) === 1;
          const sel = state.selection;
          if (!sel || sel.kind !== 'select') {
            if (!leftDown) el.style.cursor = 'default';
            return;
          }

          if (!leftDown) {
            if (sel.dragging || sel.pendingDrag) {
              sel.dragging = false;
              sel.pendingDrag = false;
              sel.dragStart = null;
              sel.dragData = null;
              state.activePointerId = null;
              el.style.cursor = 'default';
              app?.canvas?.setDirty(true, true);
            } else {
              el.style.cursor = sel?.bbox && pointInRect(p, sel.bbox) ? 'move' : 'default';
            }
            return;
          }

          // Start dragging only after a small threshold (prevents click from becoming a drag)
          if (!sel.dragging && sel.pendingDrag && sel.dragStart) {
            const dx0 = p.x - sel.dragStart.x;
            const dy0 = p.y - sel.dragStart.y;
            if (Math.abs(dx0) > 2 || Math.abs(dy0) > 2) {
              if (!sel._historyPushed) {
                sel._historyPushed = true;
                pushHistorySnapshot();
              }
              sel.dragging = true;
              sel.pendingDrag = false;
            }
          }

          if (sel.dragging && sel.dragStart && sel.dragData) {
            const dx = p.x - sel.dragStart.x;
            const dy = p.y - sel.dragStart.y;
            for (const it of sel.dragData.paths || []) {
              const layer = state.layers[it.layerIdx];
              const path = layer?.paths?.[it.pathIdx];
              if (!path || layer?.locked) continue;
              path.points = it.points0.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
            }
            for (const it of sel.dragData.stickers || []) {
              const st = state.stickers?.[it.stickerIdx];
              if (!st) continue;
              st.x = it.x0 + dx;
              st.y = it.y0 + dy;
            }
            try { if (sel.dragData.anchored0) applyAnchoredSnapshotDelta(sel.dragData.anchored0, dx, dy); } catch {}
            if (sel.dragData.bbox0) {
              sel.bbox = {
                x0: sel.dragData.bbox0.x0 + dx,
                y0: sel.dragData.bbox0.y0 + dy,
                x1: sel.dragData.bbox0.x1 + dx,
                y1: sel.dragData.bbox0.y1 + dy,
              };
            }
          }

          el.style.cursor = sel?.bbox && pointInRect(p, sel.bbox) ? 'move' : 'default';
          e.preventDefault();
          e.stopPropagation();
          app?.canvas?.setDirty(true, false);
          return;
        }

        // If a selection is pending (user pressed down but hasn't crossed threshold),
        // consume events so the underlying workflow doesn't pan/move.
        if (state.pendingSelection && state.activePointerId != null && e.pointerId === state.activePointerId) {
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, false);
        }

        // Sticker resize (transform tool)
        if (state.stickerResize && state.activePointerId != null && e.pointerId === state.activePointerId) {
          const d = state.stickerResize;
          const st = state.stickers?.[d.stickerIdx];
          if (!st) return;
          if (st.pinned) {
            state.stickerResize = null;
          } else {
          if (!d._historyPushed) {
            d._historyPushed = true;
            pushHistorySnapshot();
          }

          const minSize = 5;
          let x = d.x0, y = d.y0, w = d.w0, h = d.h0;
          const dx = p.x - d.start.x;
          const dy = p.y - d.start.y;

          if (d.corner === 'se') { w = d.w0 + dx; h = d.h0 + dy; }
          if (d.corner === 'ne') { w = d.w0 + dx; h = d.h0 - dy; y = d.y0 + dy; }
          if (d.corner === 'sw') { w = d.w0 - dx; h = d.h0 + dy; x = d.x0 + dx; }
          if (d.corner === 'nw') { w = d.w0 - dx; h = d.h0 - dy; x = d.x0 + dx; y = d.y0 + dy; }

          if (state.transformMode === 'fixed') {
            const asp = d.aspect || 1;
            const ww = Math.abs(w);
            const hh = Math.abs(h);
            if (ww / Math.max(1e-6, hh) > asp) {
              h = Math.sign(h || 1) * (ww / asp);
            } else {
              w = Math.sign(w || 1) * (hh * asp);
            }
            // Re-anchor based on corner
            if (d.corner === 'ne') y = (d.y0 + d.h0) - h;
            if (d.corner === 'sw') x = (d.x0 + d.w0) - w;
            if (d.corner === 'nw') { x = (d.x0 + d.w0) - w; y = (d.y0 + d.h0) - h; }
          }

          w = Math.max(minSize, w);
          h = Math.max(minSize, h);
          st.x = x;
          st.y = y;
          st.w = w;
          st.h = h;

          // If this is an image sticker (screenshot), scale anchored children with it
          if (d.anchored0 && isImageSticker(st)) {
            try {
              const parent0 = { x: d.x0, y: d.y0, w: d.w0, h: d.h0, rot: (typeof d.rot0 === 'number') ? d.rot0 : ((typeof st.rot === 'number') ? st.rot : 0) };
              const parent1 = { x, y, w, h, rot: parent0.rot };
              applyAnchoredSnapshotStickerResize(d.anchored0, parent0, parent1);
            } catch {}
          }
          el.style.cursor = 'nwse-resize';
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, false);
          persistToGraphExtra();
          return;
          }
        }

        // Transform selected items resize
        if (state.transformDrag && state.activePointerId != null && e.pointerId === state.activePointerId) {
          const d = state.transformDrag;
          if (!d._historyPushed) {
            d._historyPushed = true;
            pushHistorySnapshot();
          }
          const b0 = d.bbox0;
          const anchor = {
            x: (d.corner === 'nw' || d.corner === 'sw') ? b0.x1 : b0.x0,
            y: (d.corner === 'nw' || d.corner === 'ne') ? b0.y1 : b0.y0,
          };
          const cur = { x: p.x, y: p.y };
          let w = Math.max(1e-6, Math.abs(cur.x - anchor.x));
          let h = Math.max(1e-6, Math.abs(cur.y - anchor.y));
          if (state.transformMode === 'fixed') {
            const asp = d.aspect || 1;
            if (w / h > asp) h = w / asp; else w = h * asp;
          }
          const x0 = (cur.x < anchor.x) ? (anchor.x - w) : anchor.x;
          const y0 = (cur.y < anchor.y) ? (anchor.y - h) : anchor.y;
          const x1 = x0 + w;
          const y1 = y0 + h;

          const sx = w / Math.max(1e-6, (b0.x1 - b0.x0));
          const sy = h / Math.max(1e-6, (b0.y1 - b0.y0));
          for (const it of d.items.paths || []) {
            const layer = state.layers[it.layerIdx];
            const path = layer?.paths?.[it.pathIdx];
            if (!path || layer?.locked) continue;
            path.points = it.points0.map(pt => ({
              x: x0 + (pt.x - b0.x0) * sx,
              y: y0 + (pt.y - b0.y0) * sy,
            }));
          }
          for (const it of d.items.stickers || []) {
            const st = state.stickers?.[it.stickerIdx];
            if (!st) continue;
            st.x = x0 + (it.x0 - b0.x0) * sx;
            st.y = y0 + (it.y0 - b0.y0) * sy;
            st.w = Math.max(5, it.w0 * sx);
            st.h = Math.max(5, it.h0 * sy);
          }
          // Update selection bbox live
          if (state.selection?.bbox) state.selection.bbox = { x0, y0, x1, y1 };

          // Refresh flat paths
          state.paths = [];
          for (const lyr of state.layers) for (const pp of (lyr.paths || [])) state.paths.push(pp);

          el.style.cursor = 'nwse-resize';
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, false);
          persistToGraphExtra();
          return;
        }

        // Rotate selected items (stickers and/or paths)
        if (state.rotateDrag && state.activePointerId != null && e.pointerId === state.activePointerId) {
          const d = state.rotateDrag;
          if (!d._historyPushed) {
            d._historyPushed = true;
            pushHistorySnapshot();
          }
          const pivot = d.pivot;
          const a0 = d.startAngle || 0;
          const a1 = Math.atan2(p.y - pivot.y, p.x - pivot.x);
          const da = a1 - a0;
          const c = Math.cos(da);
          const s = Math.sin(da);

          // Rotate paths
          for (const it of d.items.paths || []) {
            const layer = state.layers[it.layerIdx];
            const path = layer?.paths?.[it.pathIdx];
            if (!path || layer?.locked) continue;
            path.points = it.points0.map(pt => {
              const dx = pt.x - pivot.x;
              const dy = pt.y - pivot.y;
              return {
                x: pivot.x + (dx * c - dy * s),
                y: pivot.y + (dx * s + dy * c),
              };
            });
          }

          // Rotate stickers (around pivot, keep w/h)
          for (const it of d.items.stickers || []) {
            const st = state.stickers?.[it.stickerIdx];
            if (!st) continue;
            const w0 = (typeof it.w0 === 'number') ? it.w0 : st.w;
            const h0 = (typeof it.h0 === 'number') ? it.h0 : st.h;
            const cx0 = (typeof it.x0 === 'number' ? it.x0 : st.x) + w0 / 2;
            const cy0 = (typeof it.y0 === 'number' ? it.y0 : st.y) + h0 / 2;
            const dx = cx0 - pivot.x;
            const dy = cy0 - pivot.y;
            const cx1 = pivot.x + (dx * c - dy * s);
            const cy1 = pivot.y + (dx * s + dy * c);
            st.x = cx1 - w0 / 2;
            st.y = cy1 - h0 / 2;
            st.w = w0;
            st.h = h0;
            const rot0 = (typeof it.rot0 === 'number') ? it.rot0 : ((typeof st.rot === 'number') ? st.rot : 0);
            st.rot = rot0 + da;
          }

          // Update selection bbox live (axis-aligned bbox union)
          if (state.selection) {
            let bb = null;
            for (const it of d.items.paths || []) {
              const layer = state.layers[it.layerIdx];
              const path = layer?.paths?.[it.pathIdx];
              const pb = pathBBox(path);
              if (pb) bb = bboxUnion(bb, pb);
            }
            for (const it of d.items.stickers || []) {
              const st = state.stickers?.[it.stickerIdx];
              const sb = stickerBBox(st);
              if (sb) bb = bboxUnion(bb, sb);
            }
            state.selection.bbox = bb;
          }

          // Refresh flat paths
          state.paths = [];
          for (const lyr of state.layers) for (const pp of (lyr.paths || [])) state.paths.push(pp);

          el.style.cursor = 'grabbing';
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, false);
          persistToGraphExtra();
          return;
        }

        if (state.tool === 'select' || state.tool === 'transform' || state.tool === 'rotate') {
          if (state.activePointerId != null && typeof e.pointerId === 'number' && e.pointerId !== state.activePointerId) return;
          const leftDown = (e.buttons & 1) === 1;

          // If we have a pending selection (started on pointerdown), create it only after real drag.
          if (state.pendingSelection && leftDown) {
            const ps = state.pendingSelection;
            const thr = movementThresholdGraph(canvas, 8);
            const dx0 = p.x - ps.start.x;
            const dy0 = p.y - ps.start.y;
            if (Math.abs(dx0) > thr || Math.abs(dy0) > thr) {
              state.selection = {
                kind: 'select',
                mode: ps.mode,
                start: { x: ps.start.x, y: ps.start.y },
                points: (ps.mode === 'lasso') ? [{ x: ps.start.x, y: ps.start.y }, { x: p.x, y: p.y }] : [{ x: ps.start.x, y: ps.start.y }],
                rect: (ps.mode === 'rect') ? { x0: ps.start.x, y0: ps.start.y, x1: p.x, y1: p.y } : null,
                selectedPaths: [],
                selectedStickers: [],
                bbox: null,
                dragging: false,
                pendingDrag: false,
                creating: true,
              };
              state.pendingSelection = null;
            }
          }

          const sel = state.selection;
          if (!sel || sel.kind !== 'select') {
            if (!leftDown) el.style.cursor = 'default';
            return;
          }

          if (!leftDown) {
            // Defensive: if pointerup was missed, ensure we stop moving on release
            if (sel.dragging || sel.pendingDrag) {
              sel.dragging = false;
              sel.pendingDrag = false;
              sel.dragStart = null;
              sel.dragData = null;
              state.activePointerId = null;
              el.style.cursor = 'default';
              app.canvas.setDirty(true, true);
            } else {
              el.style.cursor = sel?.bbox && pointInRect(p, sel.bbox) ? 'move' : 'default';
            }
            return;
          }

          // Start dragging only after a small threshold (prevents click from becoming a drag)
          if (!sel.dragging && sel.pendingDrag && sel.dragStart) {
            const dx0 = p.x - sel.dragStart.x;
            const dy0 = p.y - sel.dragStart.y;
            if (Math.abs(dx0) > 2 || Math.abs(dy0) > 2) {
              if (!sel._historyPushed) {
                sel._historyPushed = true;
                pushHistorySnapshot();
              }
              sel.dragging = true;
              sel.pendingDrag = false;
            }
          }

          if (sel.dragging && sel.dragStart && sel.dragData) {
            const dx = p.x - sel.dragStart.x;
            const dy = p.y - sel.dragStart.y;
            // Move selected paths
            for (const it of sel.dragData.paths || []) {
              const layer = state.layers[it.layerIdx];
              const path = layer?.paths?.[it.pathIdx];
              if (!path || layer.locked) continue;
              path.points = it.points0.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
            }
            // Move stickers
            for (const it of sel.dragData.stickers || []) {
              const st = state.stickers?.[it.stickerIdx];
              if (!st) continue;
              st.x = it.x0 + dx;
              st.y = it.y0 + dy;
            }

            // Move anchored children of moved image stickers (if not already selected)
            try { if (sel.dragData.anchored0) applyAnchoredSnapshotDelta(sel.dragData.anchored0, dx, dy); } catch {}
            // Update bbox
            if (sel.dragData.bbox0) {
              sel.bbox = {
                x0: sel.dragData.bbox0.x0 + dx,
                y0: sel.dragData.bbox0.y0 + dy,
                x1: sel.dragData.bbox0.x1 + dx,
                y1: sel.dragData.bbox0.y1 + dy,
              };
            }
          } else if (sel.creating) {
            if (sel.mode === 'rect') {
              sel.rect = { x0: sel.start.x, y0: sel.start.y, x1: p.x, y1: p.y };
              const res = selectionFromRect(sel.rect);
              sel.selectedPaths = res.selectedPaths;
              sel.selectedStickers = res.selectedStickers;
              sel.bbox = res.bbox;
            } else {
              sel.points.push({ x: p.x, y: p.y });
              const res = selectionFromPolygon(sel.points);
              sel.selectedPaths = res.selectedPaths;
              sel.selectedStickers = res.selectedStickers;
              sel.bbox = res.bbox;
            }
          }
          el.style.cursor = sel?.bbox && pointInRect(p, sel.bbox) ? 'move' : (sel.creating ? 'crosshair' : 'default');
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, false);
          return;
        }

        if (state.tool === 'screenshot') {
          if (state.activePointerId != null && typeof e.pointerId === 'number' && e.pointerId !== state.activePointerId) return;
          const leftDown = (e.buttons & 1) === 1;
          if (!leftDown) {
            el.style.cursor = 'default';
            return;
          }
          const sel = state.selection;
          if (!sel || sel.kind !== 'screenshot') return;
          sel.rect = { x0: sel.start.x, y0: sel.start.y, x1: p.x, y1: p.y };
          sel.bbox = normalizeRect(sel.rect);
          el.style.cursor = 'crosshair';
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, false);
          return;
        }

        if (state.tool === 'text') {
          if (state.activePointerId != null && typeof e.pointerId === 'number' && e.pointerId !== state.activePointerId) return;
          const sel = state.selection;
          if (!sel || sel.kind !== 'text') return;
          sel.rect = { x0: sel.start.x, y0: sel.start.y, x1: p.x, y1: p.y };
          sel.bbox = normalizeRect(sel.rect);
          el.style.cursor = 'crosshair';
          e.preventDefault();
          e.stopPropagation();
          app.canvas.setDirty(true, false);
          return;
        }

        // Draw tool move
        if (!state.current) return;
        if (state.penOnly && state.activePointerId != null && e.pointerId !== state.activePointerId) return;
        state.current.points.push(p);
        // Change cursor to pen while drawing
        el.style.cursor = state.eraser ? 'cell' : 'crosshair';
        e.preventDefault();
        e.stopPropagation();
        app.canvas.setDirty(true, false);
      };
      const onUp = (e) => {
        // Release pointer capture if active
        try { if (e && typeof e.pointerId === 'number' && typeof el.releasePointerCapture === 'function') el.releasePointerCapture(e.pointerId); } catch {}

        // End sticker drag/resize/transform/rotate
        if (state.activePointerId != null && typeof e.pointerId === 'number' && e.pointerId === state.activePointerId) {
          if (state.stickerDrag) {
            state.stickerDrag = null;
            state.activePointerId = null;
            el.style.cursor = 'default';
            app.canvas.setDirty(true, true);
            persistToGraphExtra(true);
            return;
          }
          if (state.stickerResize) {
            state.stickerResize = null;
            state.activePointerId = null;
            el.style.cursor = 'default';
            app.canvas.setDirty(true, true);
            persistToGraphExtra(true);
            return;
          }
          if (state.transformDrag) {
            state.transformDrag = null;
            state.activePointerId = null;
            el.style.cursor = 'default';
            app.canvas.setDirty(true, true);
            persistToGraphExtra(true);
            return;
          }
          if (state.rotateDrag) {
            state.rotateDrag = null;
            state.activePointerId = null;
            el.style.cursor = 'default';
            app.canvas.setDirty(true, true);
            persistToGraphExtra(true);
            return;
          }
        }

        // When Annotate is OFF, only finalize selection moves when sel override is enabled.
        if (!state.enabled) {
          if (!state.selOverride) {
            state.pendingSelection = null;
            state.activePointerId = null;
            el.style.cursor = 'default';
            return;
          }

          state.pendingSelection = null;
          const sel = state.selection;
          if (sel?.kind === 'select' && (sel.dragging || sel.pendingDrag)) {
            sel.dragging = false;
            sel.pendingDrag = false;
            sel.dragStart = null;
            sel.dragData = null;
            state.activePointerId = null;
            el.style.cursor = 'default';
            // Refresh flat paths (in case we moved something)
            state.paths = [];
            for (const lyr of state.layers) for (const p of (lyr.paths || [])) state.paths.push(p);
            app?.canvas?.setDirty(true, true);
            persistToGraphExtra(true);
            return;
          }

          state.activePointerId = null;
          el.style.cursor = 'default';
          app?.canvas?.setDirty(true, true);
          return;
        }

        if (state.tool === 'select' || state.tool === 'transform' || state.tool === 'rotate') {
          if (state.activePointerId != null && typeof e.pointerId === 'number' && e.pointerId !== state.activePointerId) return;
          const sel = state.selection;

          // If we had a pending selection, create it now ONLY if drag distance exceeded threshold.
          try {
            if (state.pendingSelection) {
              const ps = state.pendingSelection;
              const pUp = toGraphPos(e, canvas);
              if (pUp) {
                const thr = movementThresholdGraph(canvas, 8);
                const dx0 = pUp.x - ps.start.x;
                const dy0 = pUp.y - ps.start.y;
                if (Math.abs(dx0) > thr || Math.abs(dy0) > thr) {
                  const tmpSel = {
                    kind: 'select',
                    mode: ps.mode,
                    start: { x: ps.start.x, y: ps.start.y },
                    points: (ps.mode === 'lasso') ? [{ x: ps.start.x, y: ps.start.y }, { x: pUp.x, y: pUp.y }] : [{ x: ps.start.x, y: ps.start.y }],
                    rect: (ps.mode === 'rect') ? { x0: ps.start.x, y0: ps.start.y, x1: pUp.x, y1: pUp.y } : null,
                    selectedPaths: [],
                    selectedStickers: [],
                    bbox: null,
                    dragging: false,
                    pendingDrag: false,
                    creating: true,
                  };
                  if (tmpSel.mode === 'rect' && tmpSel.rect) {
                    const res = selectionFromRect(tmpSel.rect);
                    tmpSel.selectedPaths = res.selectedPaths;
                    tmpSel.selectedStickers = res.selectedStickers;
                    tmpSel.bbox = res.bbox;
                  } else {
                    const res = selectionFromPolygon(tmpSel.points);
                    tmpSel.selectedPaths = res.selectedPaths;
                    tmpSel.selectedStickers = res.selectedStickers;
                    tmpSel.bbox = res.bbox;
                  }
                  tmpSel.creating = false;
                  state.selection = tmpSel;
                }
              }
              state.pendingSelection = null;
            }
          } catch {
            state.pendingSelection = null;
          }

          if (sel?.kind === 'select' && (sel.dragging || sel.pendingDrag)) {
            sel.dragging = false;
            sel.pendingDrag = false;
            sel.dragStart = null;
            sel.dragData = null;
            state.activePointerId = null;
            el.style.cursor = 'default';
            // Refresh flat paths (in case we moved something)
            state.paths = [];
            for (const lyr of state.layers) for (const p of (lyr.paths || [])) state.paths.push(p);
            // Requirement: after move the selection frame should disappear (only Select tool)
            if (state.tool === 'select') clearSelection();
            app.canvas.setDirty(true, true);
            persistToGraphExtra(true);
            return;
          }

          // Stop live selection creation on release.
          if (sel?.kind === 'select' && sel.creating) {
            sel.creating = false;
          }

          state.activePointerId = null;
          el.style.cursor = 'default';
          app.canvas.setDirty(true, true);
          return;
        }

        if (state.tool === 'screenshot') {
          if (state.activePointerId != null && typeof e.pointerId === 'number' && e.pointerId !== state.activePointerId) return;
          const sel = state.selection;
          const rectGraph = sel?.rect;
          const rectN = normalizeRect(rectGraph);
          if (!rectN || rectN.w < 5 || rectN.h < 5) {
            clearSelection();
            state.activePointerId = null;
            el.style.cursor = 'default';
            app.canvas.setDirty(true, true);
            return;
          }

          const newShotId = newStickerId();

          // Capture on next frame to maximize chance the canvas is up-to-date
          const rectPx = graphRectToCanvasPxRect(rectN, canvas);
          requestAnimationFrame(() => {
            try {
              const dataUrl = cropCanvasToDataUrl(canvas?.canvas, rectPx);
              if (!dataUrl) return;
              const dataKey = stickerDataKeyForId(newShotId);
              try {
                if (dataKey) __idbSet(__IAMCCS_IDB_STORE_STICKERS, dataKey, dataUrl);
              } catch {}
              state.stickers = state.stickers || [];
              state.stickers.push({
                id: newShotId,
                x: rectN.x0,
                y: rectN.y0,
                w: rectN.w,
                h: rectN.h,
                rot: 0,
                pinned: false,
                kind: 'image',
                dataUrl,
                dataKey,
              });

              // UX: after capture, go back to Select tool and keep the new screenshot selected
              try { setTool('select'); } catch {}
              try {
                const idx = getStickerIdxById(newShotId);
                const st = idx >= 0 ? state.stickers?.[idx] : null;
                const bb = stickerBBox(st);
                if (idx >= 0 && bb) {
                  state.selection = {
                    kind: 'select',
                    mode: 'rect',
                    points: [],
                    rect: null,
                    bbox: bb,
                    selectedPaths: [],
                    selectedStickers: [{ stickerIdx: idx, bbox: bb }],
                    dragging: false,
                  };
                }
              } catch {}

              // Flash feedback AFTER capture so it doesn't overexpose the screenshot
              state.shotFlash = { t0: performance.now(), rect: { x0: rectN.x0, y0: rectN.y0, x1: rectN.x1, y1: rectN.y1 } };
              persistToGraphExtra(true);
              app?.canvas?.setDirty(true, true);
            } catch (err) {
              console.warn('[IAMCCS] Screenshot capture failed:', err);
            }
          });

          clearSelection();
          state.activePointerId = null;
          el.style.cursor = 'default';
          app.canvas.setDirty(true, true);
          return;
        }

        if (state.tool === 'text') {
          if (state.activePointerId != null && typeof e.pointerId === 'number' && e.pointerId !== state.activePointerId) return;
          const sel = state.selection;
          const rectGraph = sel?.rect;
          const rectN = normalizeRect(rectGraph);
          if (!rectN || rectN.w < 8 || rectN.h < 8) {
            clearSelection();
            state.activePointerId = null;
            el.style.cursor = 'default';
            app.canvas.setDirty(true, true);
            return;
          }

          // Create a new text sticker and start editing
          pushHistorySnapshot();
          const id = newStickerId();
          state.stickers = state.stickers || [];
          // Default text color comes from the current brush palette
          state.textColor = String(state.color || state.textColor || '#111111');
          // Make new text size feel proportional to the dragged box
          const boxDrivenFontSize = Math.max(10, Math.min(220, rectN.h * 0.65));

          // If the text is created over a screenshot sticker, anchor it to that sticker
          let parentStickerId = null;
          try {
            const c = { x: rectN.x0 + rectN.w * 0.5, y: rectN.y0 + rectN.h * 0.5 };
            const hitImg = hitTestImageStickerInside(c, canvas);
            parentStickerId = (hitImg >= 0) ? (state.stickers?.[hitImg]?.id || null) : null;
          } catch {}
          state.stickers.push({
            id,
            x: rectN.x0,
            y: rectN.y0,
            w: rectN.w,
            h: rectN.h,
            rot: 0,
            pinned: false,
            kind: 'text',
            parentStickerId: parentStickerId || undefined,
            text: '',
            fontFamily: String(state.textFontFamily || 'Arial'),
            fontSize: boxDrivenFontSize,
            textColor: String(state.color || state.textColor || '#111111'),
            fontWeight: String(state.textFontWeight || 'normal'),
            fontStyle: String(state.textFontStyle || 'normal'),
            underline: !!state.textUnderline,
          });

          // Create a real Text Layer entry linked to this text sticker
          try {
            const base = { ...getCurrentLayerStyle() };
            state.layers.push({
              name: nextTextLayerName(),
              kind: 'text',
              textStickerId: id,
              visible: true,
              locked: false,
              paths: [],
              style: {
                color: String(state.color || base.color || '#111111'),
                dashed: !!base.dashed,
                widthDraw: typeof base.widthDraw === 'number' ? base.widthDraw : (state.widthDraw || 7),
                widthErase: typeof base.widthErase === 'number' ? base.widthErase : (state.widthErase || 48),
                opacityDraw: typeof base.opacityDraw === 'number' ? base.opacityDraw : (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0),
                opacityErase: typeof base.opacityErase === 'number' ? base.opacityErase : (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0),
              }
            });
            setCurrentLayer(state.layers.length - 1);
            try { syncTextLayerFromStateColor(state.currentLayerIdx); } catch {}
            try { ui.renderLayersList?.(); } catch {}
          } catch {}
          persistToGraphExtra(true);

          clearSelection();
          state.activePointerId = null;
          el.style.cursor = 'default';
          app.canvas.setDirty(true, true);
          try { openTextEditorForStickerId(id, canvas); } catch {}
          return;
        }

        if (!state.current) return;
        if (state.penOnly && state.activePointerId != null && e.pointerId !== state.activePointerId) return;
        const layer = getCurrentLayer();
        if (layer && !layer.locked) {
          layer.paths.push(state.current);
          // Also add to state.paths for backward compatibility
          state.paths.push(state.current);
        }
        state.current = null;
        state.activePointerId = null;
        // Reset cursor after drawing
        el.style.cursor = 'default';
        app.canvas.setDirty(true, true);
        persistToGraphExtra(true);
      };

    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    // Prefer element-level pointerup with pointer capture; add window fallback
    el.addEventListener('pointerup', onUp, true);
    el.addEventListener('pointercancel', onUp, true);
    el.addEventListener('lostpointercapture', onUp, true);
    window.addEventListener('pointerup', onUp, false);

      console.log('[IAMCCS] Hooks attached');
      return true;
    }

    // Register as ComfyUI extension
    // Written code by Carmine Cristallo Scalzi (IAMCCS) - AI for debugging - section: Extension Registration - reason: marks lifecycle hook integration (init/setup) with ComfyUI for event binding & canvas hooks
    app.registerExtension({
      name: 'IAMCCS.Annotate',
      init() {
        // Keep UI resilient to ComfyUI DOM resets
        try { startUIWatchdog(); } catch {}
        // Defer creating any UI until the canvas exists (prevents top bar flash)
        // Keyboard shortcuts: Alt+A toggle, Esc cancella path corrente
        window.addEventListener('keydown', (e) => {
          // Avoid intercepting when typing into inputs/editable fields
          const target = e.target;
          const isEditing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || target.closest?.('[contenteditable="true"]'));
          if (isEditing) return;
          if (e.altKey && (e.key === 'a' || e.key === 'A')) {
            setEnabled(!state.enabled);
            e.preventDefault();
          } else if (state.enabled && e.altKey && !e.ctrlKey && !e.shiftKey) {
            // Tool shortcuts
            if (e.key === '1') { setTool('draw'); try { showToast('Draw enabled', { kind: 'info', ms: 900 }); } catch {} e.preventDefault(); }
            else if (e.key === '2') { setTool('select'); try { showToast('Select enabled', { kind: 'info', ms: 900 }); } catch {} e.preventDefault(); }
            else if (e.key === '3') { setTool('transform'); try { showToast('Transform enabled', { kind: 'info', ms: 900 }); } catch {} e.preventDefault(); }
            else if (e.key === '4') { setTool('rotate'); try { showToast('Rotate enabled', { kind: 'info', ms: 900 }); } catch {} e.preventDefault(); }
            else if (e.key === '5') { setTool('screenshot'); try { showToast('Screenshot tool enabled', { kind: 'info', ms: 1000 }); } catch {} e.preventDefault(); }
            else if (e.key === 'p' || e.key === 'P') {
              state.pinMode = !state.pinMode;
              syncFlagsUI();
              try { showToast(state.pinMode ? 'Pin mode enabled' : 'Pin mode disabled', { kind: 'info', ms: 1200 }); } catch {}
              app?.canvas?.setDirty(true, true);
              e.preventDefault();
            }
          } else if (e.altKey && (e.key === 'd' || e.key === 'D')) {
            // Toggle eraser/draw with Alt+D
            setEraserMode(!state.eraser);
            console.log('[IAMCCS] Eraser:', state.eraser ? 'ON' : 'OFF');
            try { showToast(state.eraser ? 'Eraser enabled' : 'Eraser disabled', { kind: 'info', ms: 1100 }); } catch {}
            try { syncToolsUI(); } catch {}
            e.preventDefault();
          } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
            // Toggle hide notes with Option+S (Alt+S on Windows)
            state.hidden = !state.hidden;
            if (ui.hiddenChk) ui.hiddenChk.checked = state.hidden;
            try { syncFlagsUI(); } catch {}
            try { showToast(state.hidden ? 'Hide notes enabled' : 'Hide notes disabled', { kind: 'info', ms: 1200 }); } catch {}
            app?.canvas?.setDirty(true, true);
            e.preventDefault();
          } else if (state.enabled && state.tool === 'select' && e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
            // Ctrl+C: Copy selection
            const ok = copySelectionToClipboard();
            if (ok) console.log('[IAMCCS] Copied selection');
            try { showToast(ok ? 'Selection copied' : 'Nothing selected', { kind: ok ? 'info' : 'warn', ms: 1000 }); } catch {}
            e.preventDefault();
          } else if (state.enabled && state.tool === 'select' && e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'x' || e.key === 'X')) {
            // Ctrl+X: Cut selection
            const ok = copySelectionToClipboard({ clearAfter: false });
            if (ok) {
              deleteSelection({ allowLocked: false });
              console.log('[IAMCCS] Cut selection');
            }
            try { showToast(ok ? 'Selection cut' : 'Nothing selected', { kind: ok ? 'info' : 'warn', ms: 1000 }); } catch {}
            e.preventDefault();
          } else if (state.enabled && state.tool === 'select' && e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'v' || e.key === 'V')) {
            // Ctrl+V: Paste selection
            pasteClipboardAt(state.lastPointerGraphPos);
            e.preventDefault();
          } else if ((state.enabled || state.selOverride) && (e.key === 'Delete' || e.key === 'Backspace')) {
            // Delete/Backspace: delete current selection (any tool)
            const sel = state.selection;
            if (sel?.kind === 'select' && ((sel.selectedPaths?.length || 0) > 0 || (sel.selectedStickers?.length || 0) > 0)) {
              const did = deleteSelection({ allowLocked: false });
              if (!did) {
                showToast('Cannot delete: selection is locked or pinned', { kind: 'warn', ms: 1700 });
              }
              e.preventDefault();
            }
          } else if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'i' || e.key === 'I')) {
            // Ctrl+I: Import workflow (or annotations JSON)
            e.preventDefault();
            promptImportWorkflow();
          } else if (e.key === 'Escape') {
            if (state.current) {
              state.paths.push(state.current);
              state.current = null;
              app?.canvas?.setDirty(true, true);
            } else if (state.selection) {
              clearSelection();
            }
          }
        });
      },
      setup() {
        const wait = () => {
          if (app?.canvas?.canvas) {
            console.log('[IAMCCS] Setup called - canvas ready');
            try { startUIWatchdog(); } catch {}
            // Migrate older localStorage autosaves to IndexedDB to free quota without losing data.
            // Fire-and-forget: we don't want to block ComfyUI startup.
            try { migrateLegacyAutosaveLocalStorageToIdb({ removeAfter: true }); } catch {}
            // Create button early (not only during draw)
            try {
              if (!ui.floating || !document.body.contains(ui.floating)) {
                ensureFloatingToggle();
                state.uiShown = true;
              }
            } catch {}
            attachCanvasHooks();
            // Fallback: create button after 1 second if not created by draw
            setTimeout(() => {
              if (!state.uiShown || !ui.floating || !document.body.contains(ui.floating)) {
                console.log('[IAMCCS] Fallback: creating floating button...');
                ensureFloatingToggle();
                state.uiShown = true;
              }
            }, 1000);
            // Attempt to load from workflow.extra after initial render
            setTimeout(() => handleWorkflowChange(), 300);
            // Safely wrap app.loadGraphData to update annotations when workflows change
            try {
              if (!app.__iamccs_wrapped_load) {
                const orig = app.loadGraphData?.bind(app);
                if (typeof orig === 'function') {
                  app.loadGraphData = async function(...args) {
                    // Track whether the workflow JSON being loaded contains IAMCCS annotations.
                    // This allows us to clear stale app.graph.extra fields that would otherwise
                    // cause texts/layers to appear copied into workflows that don't have them.
                    try {
                      const obj = args?.[0];
                      const ex = (obj && typeof obj === 'object') ? obj.extra : null;
                      const has = !!(ex && (ex.iamccs_annotations || ex.iamccs_annotations_multi));
                      window.__IAMCCS_LAST_LOADED_WORKFLOW = {
                        at: Date.now(),
                        hasIamccsAnnotations: has,
                        iamccs_annotations: ex ? (ex.iamccs_annotations || null) : null,
                        iamccs_annotations_multi: ex ? (ex.iamccs_annotations_multi || null) : null,
                      };
                    } catch {}
                    const res = await orig(...args);
                    try { handleWorkflowChange(); } catch (e) { console.warn('[IAMCCS] handleWorkflowChange failed:', e); }
                    return res;
                  };
                  Object.defineProperty(app, '__iamccs_wrapped_load', { value: true, configurable: true });
                }
              }
            } catch (e) {
              console.warn('[IAMCCS] Could not wrap app.loadGraphData:', e);
            }
            return;
          }
          setTimeout(wait, 250);
        };
        wait();
      },
    });

            // Prevent workflow-level annotations from hitchhiking on node copy/paste.
            // This installs a LiteGraph clipboard filter and optional selection-only transfer.
            try { installNodeClipboardHooks(); } catch {}
    console.log('[IAMCCS] Extension registered');
  })();
}

// Handle loading/clearing annotations when workflow changes
function handleWorkflowChange() {
  try {
    const g = window?.app?.graph || (window?.ComfyApp?.app?.graph);
  } catch {}
  try {
    // app is module local above; retrieve via global import cache if available
  } catch {}
  try {
    // The async IIFE scope holds state and helpers; expose a small bridge on window
    const mod = window.IAMCCS_ANNOTATE_MODULE;
    if (mod && typeof mod._handleWorkflowChange === 'function') mod._handleWorkflowChange();
  } catch {}
}

// This code was written entirely by hand by Carmine Cristallo Scalzi (IAMCCS) with final AI-assisted debugging – if you copy parts of the code, the result of hard work, please mention the author! Thank you and happy experimenting!
