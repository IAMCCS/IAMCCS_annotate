// IAMCCS Annotate — clean ComfyUI extension with floating button + context menu
console.log('[IAMCCS] Extension file loaded');

// Single-init guard to avoid duplicate loads
if (!window.IAMCCS_ANNOTATE_LOADED) {
  console.log('[IAMCCS] Initializing...');
  window.IAMCCS_ANNOTATE_LOADED = true;

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
      hydrated: false,
      uiShown: false,
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
    };

  // Offscreen buffer so eraser only affects annotations, not the ComfyUI graph
  let __annoCanvas = null;
  let __annoCtx = null;
  let __annoW = 0, __annoH = 0;

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
      }
      // Floating button
      if (ui.floating) {
        ui.floating.textContent = state.enabled ? 'Annotate: ON' : 'Annotate: OFF';
        ui.floating.style.background = state.enabled ? '#2e7d32' : '#9e2b25';
        ui.floating.style.borderColor = state.enabled ? '#66bb6a' : '#ef5350';
      }
      // Sync context menu if open
      if (ui.contextMenu && ui.contextMenu.parentElement) {
        const tgl = ui.contextMenu.querySelector('#ctx_toggle');
        if (tgl) {
          tgl.textContent = state.enabled ? 'ENABLED' : 'DISABLED';
          tgl.style.background = state.enabled ? '#4CAF50' : '#f44336';
        }
      }
    }

    function syncFlagsUI() {
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
        }
      } catch {}
    }

    function setEnabled(val) {
      state.enabled = !!val;
      // If disabling while drawing, finish current stroke gracefully
      if (!state.enabled && state.current) {
        state.paths.push(state.current);
        state.current = null;
      }
      // Preserve user brush settings; but on enable force dashed back to off per requirement
      if (state.enabled && state.dashed) {
        state.dashed = false;
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
      app?.canvas?.setDirty(true, true);
      console.log('[IAMCCS] Annotate:', state.enabled ? 'ON' : 'OFF');
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
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;">
            <input id="iam_penonly" type="checkbox">
            <span>Pen only</span>
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
        <div style="margin-top:8px;font-size:10px;color:#9aa;opacity:0.85;text-align:right;">IAMCCS_annotate · draw & note on ComfyUI</div>
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
        const saveChk = section.querySelector('#iam_save_with_wf');
        const saveNow = section.querySelector('#iam_save_now');
        const loadNow = section.querySelector('#iam_load_now');

      ui.btn.addEventListener('click', () => {
        setEnabled(!state.enabled);
      });
      clr.addEventListener('click', () => {
        // Clear all non-locked layers
        for (const lyr of state.layers) if (!lyr.locked) lyr.paths = [];
        // Refresh flat paths for backward compatibility
        state.paths = [];
        for (const lyr of state.layers) for (const p of lyr.paths) state.paths.push(p);
        app?.canvas?.setDirty(true, true);
        console.log('[IAMCCS] Cleared (unlocked layers)');
        if (state.saveWithWorkflow) persistToGraphExtra(true); else removeFromGraphExtra();
      });
      color.addEventListener('input', () => {
        state.color = color.value;
      });
      width.addEventListener('input', () => {
        state.width = parseInt(width.value, 10) || 3;
        if (state.eraser) state.widthErase = state.width; else state.widthDraw = state.width;
        if (ui.widthValue) ui.widthValue.textContent = String(state.width);
      });
      opacity.addEventListener('input', () => {
        const pct = parseInt(opacity.value, 10) || 100;
        state.opacity = Math.max(0.1, Math.min(1, pct / 100));
        if (state.eraser) state.opacityErase = state.opacity; else state.opacityDraw = state.opacity;
        if (ui.opacityValue) ui.opacityValue.textContent = String(Math.round(state.opacity * 100));
      });
      ui.eraserBtn.addEventListener('click', () => {
        setEraserMode(!state.eraser);
      });
      ui.constantChk.addEventListener('change', () => {
        state.constantScreen = !!ui.constantChk.checked;
        app?.canvas?.setDirty(true, true);
      });
      dashedChk.addEventListener('change', () => {
        state.dashed = !!dashedChk.checked;
        app?.canvas?.setDirty(true, true);
      });
      hidpiChk.addEventListener('change', () => {
        state.hiDPIx2 = !!hidpiChk.checked;
        app?.canvas?.setDirty(true, true);
      });
      hiddenChk.addEventListener('change', () => {
        state.hidden = !!hiddenChk.checked;
        app?.canvas?.setDirty(true, true);
      });
      penOnlyChk.addEventListener('change', () => {
        state.penOnly = !!penOnlyChk.checked;
      });
        saveChk?.addEventListener('change', () => {
          state.saveWithWorkflow = !!saveChk.checked;
          if (state.saveWithWorkflow) persistToGraphExtra(); else removeFromGraphExtra();
        });
        saveNow?.addEventListener('click', () => {
          persistToGraphExtra(true);
        });
        loadNow?.addEventListener('click', () => {
          const loaded = loadFromGraphExtra();
          if (!loaded) console.warn('[IAMCCS] Nessuna annotazione trovata in workflow.extra');
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
            </label>
            <label style=\"display:flex;align-items:center;gap:6px;font-size:12px;color:#ddd;\">
              <input id=\"iam_penonly\" type=\"checkbox\">
              <span>Pen only</span>
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
          <div style=\"margin-top:8px;font-size:10px;color:#9aa;opacity:0.85;text-align:right;\">IAMCCS_annotate · draw & note on ComfyUI</div>
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
        const saveChk = panel.querySelector('#iam_save_with_wf');
        const saveNow = panel.querySelector('#iam_save_now');
        const loadNow = panel.querySelector('#iam_load_now');

        ui.btn.addEventListener('click', () => setEnabled(!state.enabled));
        clr.addEventListener('click', () => {
          // Clear all non-locked layers
          for (const lyr of state.layers) if (!lyr.locked) lyr.paths = [];
          // Refresh flat paths for backward compatibility
          state.paths = [];
          for (const lyr of state.layers) for (const p of lyr.paths) state.paths.push(p);
          app?.canvas?.setDirty(true, true);
          console.log('[IAMCCS] Cleared (unlocked layers)');
          if (state.saveWithWorkflow) persistToGraphExtra(true); else removeFromGraphExtra();
        });
        color.addEventListener('input', () => { state.color = color.value; });
        width.addEventListener('input', () => {
          state.width = parseInt(width.value, 10) || 3;
          if (state.eraser) state.widthErase = state.width; else state.widthDraw = state.width;
          if (ui.widthValue) ui.widthValue.textContent = String(state.width);
        });
        opacity.addEventListener('input', () => {
          const pct = parseInt(opacity.value, 10) || 100;
          state.opacity = Math.max(0.1, Math.min(1, pct / 100));
          if (state.eraser) state.opacityErase = state.opacity; else state.opacityDraw = state.opacity;
          if (ui.opacityValue) ui.opacityValue.textContent = String(Math.round(state.opacity * 100));
        });
        ui.eraserBtn.addEventListener('click', () => {
          setEraserMode(!state.eraser);
        });
        ui.constantChk.addEventListener('change', () => {
          state.constantScreen = !!ui.constantChk.checked;
          app?.canvas?.setDirty(true, true);
        });
        dashedChk.addEventListener('change', () => {
          state.dashed = !!dashedChk.checked;
          app?.canvas?.setDirty(true, true);
        });
        hidpiChk.addEventListener('change', () => {
          state.hiDPIx2 = !!hidpiChk.checked;
          app?.canvas?.setDirty(true, true);
        });
        hiddenChk.addEventListener('change', () => {
          state.hidden = !!hiddenChk.checked;
          app?.canvas?.setDirty(true, true);
        });
        penOnlyChk.addEventListener('change', () => {
          state.penOnly = !!penOnlyChk.checked;
        });
        saveChk?.addEventListener('change', () => {
          state.saveWithWorkflow = !!saveChk.checked;
          if (state.saveWithWorkflow) persistToGraphExtra(); else removeFromGraphExtra();
        });
        saveNow?.addEventListener('click', () => persistToGraphExtra(true));
        loadNow?.addEventListener('click', () => {
          const loaded = loadFromGraphExtra();
          if (!loaded) console.warn('[IAMCCS] Nessuna annotazione trovata in workflow.extra');
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
      // Hide floating toggle if dock is visible
      if (ui.floating) ui.floating.style.display = 'none';
      return panel;
    }

      function ensureStateHydratedFromExisting() {
        try {
          if (state.hydrated) return;
          const existing = app?.graph?.extra?.iamccs_annotations;
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
          // Clamp current layer index
          if (state.currentLayerIdx >= state.layers.length) state.currentLayerIdx = Math.max(0, state.layers.length - 1);
          state.hydrated = true;
        } catch (e) {
          console.warn('[IAMCCS] ensureStateHydratedFromExisting failed:', e);
        }
      }

      function persistToGraphExtra(force = false) {
        if (!app?.graph) return;
        if (!state.saveWithWorkflow && !force) return;
        // Merge existing annotations if we haven't hydrated yet (prevents overwriting)
        ensureStateHydratedFromExisting();
        app.graph.extra = app.graph.extra || {};
        app.graph.extra.iamccs_annotations = {
          version: 2,
          color: state.color,
          width: state.width,
          paths: state.paths,
          layers: state.layers,
          currentLayerIdx: state.currentLayerIdx,
        };
        console.log('[IAMCCS] Annotazioni salvate in workflow.extra');
      }

      function removeFromGraphExtra() {
        if (!app?.graph?.extra) return;
        delete app.graph.extra.iamccs_annotations;
        console.log('[IAMCCS] Annotazioni rimosse da workflow.extra');
      }

      function loadFromGraphExtra() {
        const data = app?.graph?.extra?.iamccs_annotations;
        if (!data) return false;

        state.color = data.color || state.color;
        state.width = data.width || state.width;

        // Load layers if available (v2), otherwise load paths (v1)
        if (Array.isArray(data.layers) && data.layers.length > 0) {
          state.layers = data.layers.map(layer => ({
            name: layer.name || 'Layer',
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
        // Refresh flat paths from layers to keep v1 compatibility
        state.paths = [];
        for (const lyr of state.layers) for (const p of lyr.paths) state.paths.push(p);
        state.hydrated = true;
        app?.canvas?.setDirty(true, true);
        console.log('[IAMCCS] Annotazioni caricate da workflow.extra');
        // Apply style of selected layer to current brush
        try { applyLayerStyleToState(); } catch {}
        return true;
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
            // If the new graph contains annotations, load them; otherwise clear local state
            const loaded = loadFromGraphExtra();
            if (!loaded) {
              // Reset to default state with single empty layer
              state.paths = [];
              state.current = null;
              state.currentLayerIdx = 0;
              state.layers = [{ name: 'Layer 1', visible: true, locked: false, paths: [], style: { color: state.color || '#ff4444', dashed: !!state.dashed, widthDraw: state.widthDraw || 7, widthErase: state.widthErase || 48, opacityDraw: (typeof state.opacityDraw === 'number' ? state.opacityDraw : 1.0), opacityErase: (typeof state.opacityErase === 'number' ? state.opacityErase : 1.0) } }];
              app?.canvas?.setDirty(true, true);
            }
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
      syncUI();
      app?.canvas?.setDirty(true, true);
    }
    function addLayer() {
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
      return state.layers.length - 1;
    }
    function deleteLayer(idx) {
      if (state.layers.length <= 1) return false; // Keep at least one layer
      state.layers.splice(idx, 1);
      if (state.currentLayerIdx >= state.layers.length) state.currentLayerIdx = state.layers.length - 1;
      app?.canvas?.setDirty(true, true);
      return true;
    }
    function toggleLayerVisibility(idx) {
      if (state.layers[idx]) state.layers[idx].visible = !state.layers[idx].visible;
      app?.canvas?.setDirty(true, true);
    }
    function toggleLayerLock(idx) {
      if (state.layers[idx]) state.layers[idx].locked = !state.layers[idx].locked;
    }
    function setCurrentLayer(idx) {
      if (idx >= 0 && idx < state.layers.length) {
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
            <input id="ctx_savewf" type="checkbox" ${state.saveWithWorkflow ? 'checked' : ''}>
            <span>Save into WF</span>
          </label>
        </div>
        <div style="margin-top:10px;border-top:1px solid #555;padding-top:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="font-weight:600;color:#fff;font-size:12px;">Layers</div>
            <button id="ctx_add_layer" title="Add new layer" style="padding:2px 6px;border:none;border-radius:4px;background:#4CAF50;color:#fff;cursor:pointer;font-size:11px;">+ Layer</button>
          </div>
          <div id="ctx_layers_list" style="max-height:150px;overflow-y:auto;"></div>
        </div>
        <div style="display:flex;gap:6px;justify-content:space-between;align-items:center;margin-top:8px;">
          <div style="font-size:10px;color:#9aa;opacity:0.85;">IAMCCS_annotate · draw & note on ComfyUI</div>
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
        list.innerHTML = order.map((idx) => {
          const layer = state.layers[idx];
          return `
          <div data-layer-row="${idx}" style="display:flex;gap:4px;align-items:center;padding:4px 6px;margin:2px 0;background:${idx === state.currentLayerIdx ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.05)'};border-radius:4px;border:1px solid ${idx === state.currentLayerIdx ? '#4CAF50' : 'transparent'};">
            <input data-layer-name="${idx}" type="text" value="${layer.name}" readonly style="flex:1;padding:2px 4px;border:none;border-radius:3px;background:rgba(0,0,0,0.3);color:#fff;font-size:11px;cursor:pointer;" title="Double-click to rename; click to select">
            <button data-layer-toggle-vis="${idx}" title="Toggle visibility" style="padding:2px 4px;border:none;border-radius:3px;background:#555;color:#fff;cursor:pointer;font-size:10px;">${layer.visible ? '👁️' : '🚫'}</button>
            <button data-layer-toggle-lock="${idx}" title="Toggle lock" style="padding:2px 4px;border:none;border-radius:3px;background:${layer.locked ? '#d32f2f' : '#2e7d32'};color:#fff;cursor:pointer;font-size:10px;">${layer.locked ? '🔒' : '🔓'}</button>
            <button data-layer-delete="${idx}" title="Delete layer" style="padding:2px 4px;border:none;border-radius:3px;background:#d32f2f;color:#fff;cursor:pointer;font-size:10px;">✕</button>
          </div>`;
        }).join('');

        // Add event listeners
        list.querySelectorAll('[data-layer-row]').forEach(row => {
          row.addEventListener('click', () => {
            const idx = parseInt(row.dataset.layerRow, 10);
            setCurrentLayer(idx);
            renderLayersList();
          });
        });
        list.querySelectorAll('[data-layer-name]').forEach(inp => {
          // Single click selects; does not start editing
          inp.addEventListener('click', (e) => {
            const idx = parseInt(inp.dataset.layerName, 10);
            setCurrentLayer(idx);
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
            renderLayersList();
          });
        });
        list.querySelectorAll('[data-layer-toggle-lock]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.layerToggleLock, 10);
            toggleLayerLock(idx);
            renderLayersList();
          });
        });
        list.querySelectorAll('[data-layer-delete]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.layerDelete, 10);
            if (deleteLayer(idx)) renderLayersList();
          });
        });
      }

      // Initial render
      renderLayersList();

      // Add layer button
      const addLayerBtn = menu.querySelector('#ctx_add_layer');
      if (addLayerBtn) {
        addLayerBtn.addEventListener('click', () => {
          addLayer();
          renderLayersList();
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
  ui.hiddenChk = hid; // Store reference for keyboard shortcut
      const swf = menu.querySelector('#ctx_savewf');
  const exp = menu.querySelector('#ctx_export');
  const imp = menu.querySelector('#ctx_import');
      const cls = menu.querySelector('#ctx_close');

      tgl.addEventListener('click', () => {
        setEnabled(!state.enabled);
        // Update menu button color immediately
        tgl.style.background = state.enabled ? '#4CAF50' : '#f44336';
        tgl.textContent = state.enabled ? 'ENABLED' : 'DISABLED';
      });
      clr.addEventListener('click', () => {
        // Clear all non-locked layers
        for (const lyr of state.layers) if (!lyr.locked) lyr.paths = [];
        // Refresh flat paths for backward compatibility
        state.paths = [];
        for (const lyr of state.layers) for (const p of lyr.paths) state.paths.push(p);
        app?.canvas?.setDirty(true, true);
        if (state.saveWithWorkflow) persistToGraphExtra(true); else removeFromGraphExtra();
      });
      col.addEventListener('input', () => { state.color = col.value; });
      w.addEventListener('input', () => {
        state.width = parseInt(w.value, 10) || 3;
        if (state.eraser) state.widthErase = state.width; else state.widthDraw = state.width;
        wv.textContent = String(state.width);
      });
      op.addEventListener('input', () => {
        const pct = parseInt(op.value,10)||100;
        state.opacity = Math.max(0.1, Math.min(1, pct/100));
        if (state.eraser) state.opacityErase = state.opacity; else state.opacityDraw = state.opacity;
        ov.textContent = String(Math.round(state.opacity*100));
      });
      ers.addEventListener('click', () => {
        setEraserMode(!state.eraser);
        // Update context button state immediately
        ers.textContent = state.eraser ? '🩹 Eraser' : '✏️ Draw';
        ers.style.background = state.eraser ? '#c2185b' : '#795548';
      });
      cst.addEventListener('change', () => { state.constantScreen = !!cst.checked; app?.canvas?.setDirty(true,true); });
      dsh.addEventListener('change', () => { state.dashed = !!dsh.checked; app?.canvas?.setDirty(true,true); });
  hdp.addEventListener('change', () => { state.hiDPIx2 = !!hdp.checked; app?.canvas?.setDirty(true,true); });
      hid.addEventListener('change', () => { state.hidden = !!hid.checked; app?.canvas?.setDirty(true,true); });
      pen.addEventListener('change', () => { state.penOnly = !!pen.checked; });
      swf.addEventListener('change', () => { state.saveWithWorkflow = !!swf.checked; if (state.saveWithWorkflow) persistToGraphExtra(); else removeFromGraphExtra(); });
      exp.addEventListener('click', () => exportAnnotations());
      imp.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'application/json';
        inp.onchange = () => { if (inp.files && inp.files[0]) importAnnotations(inp.files[0]); };
        inp.click();
      });
      cls.addEventListener('click', () => { menu.remove(); });
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
      const x = (e.clientX - rect.left) / (window.devicePixelRatio || 1);
      const y = (e.clientY - rect.top) / (window.devicePixelRatio || 1);
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
        // Create floating button on first draw (proper timing)
        if (!state.uiShown) {
          console.log('[IAMCCS] Creating floating button...');
          ensureFloatingToggle();
          state.uiShown = true;
        }
        if (state.hidden) return; // do not render when hidden

        const cw = ctx.canvas.width | 0;
        const ch = ctx.canvas.height | 0;
        const supersample = state.hiDPIx2 ? 2 : 1;
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
        const dpr = (window.devicePixelRatio || 1) * supersample;
        const g2s = (pt) => ({
          x: ((pt.x + (ds.offset?.[0] || 0)) * (ds.scale || 1)) * dpr,
          y: ((pt.y + (ds.offset?.[1] || 0)) * (ds.scale || 1)) * dpr,
        });
        const widthPx = (w) => state.constantScreen ? (w * dpr) : (w * (ds.scale || 1) * dpr);
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
        if (cur && Array.isArray(cur.points) && cur.points.length) {
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

        // Composite the offscreen buffer back to the main canvas
        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.imageSmoothingEnabled = true;
        ctx.globalCompositeOperation = 'source-over';
  // Composite with downscale if supersampled
  ctx.drawImage(__annoCanvas, 0, 0, __annoW, __annoH, 0, 0, cw, ch);
        ctx.restore();
      };

      // Pointer events on the graph canvas only
      const el = canvas.canvas;
      const onDown = (e) => {
        if (!state.enabled) return;
        if (e.target && e.target.closest('#iamccs-sidebar')) return;
        if (e.button !== 0) return; // only left button draws; allow middle-button pan
        if (state.penOnly && e.pointerType && e.pointerType !== 'pen') return;
        const p = toGraphPos(e, canvas);
        if (!p) return;
        // Capture pointer so we always receive pointerup even if leaving the canvas
        try { if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId); } catch {}
        state.activePointerId = e.pointerId;
        state.current = { color: state.color, width: state.width, opacity: state.opacity, dashed: state.dashed, mode: state.eraser ? 'erase' : 'draw', points: [p] };
        e.preventDefault();
        e.stopPropagation();
        app.canvas.setDirty(true, true);
      };
      const onMove = (e) => {
        if (!state.current) return;
        if (state.penOnly && state.activePointerId != null && e.pointerId !== state.activePointerId) return;
        const p = toGraphPos(e, canvas);
        if (!p) return;
        state.current.points.push(p);
        // Change cursor to pen while drawing
        el.style.cursor = state.eraser ? 'cell' : 'crosshair';
        e.preventDefault();
        e.stopPropagation();
        app.canvas.setDirty(true, false);
      };
      const onUp = (e) => {
        // Release pointer capture if active
        try { if (e && typeof el.releasePointerCapture === 'function') el.releasePointerCapture(e.pointerId); } catch {}
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
          persistToGraphExtra();
      };

    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    // Prefer element-level pointerup with pointer capture; add window fallback
    el.addEventListener('pointerup', onUp, true);
    el.addEventListener('pointercancel', onUp, true);
    window.addEventListener('pointerup', onUp, false);

      console.log('[IAMCCS] Hooks attached');
      return true;
    }

    // Register as ComfyUI extension
    app.registerExtension({
      name: 'IAMCCS.Annotate',
      init() {
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
          } else if (e.altKey && (e.key === 'd' || e.key === 'D')) {
            // Toggle eraser/draw with Alt+D
            setEraserMode(!state.eraser);
            console.log('[IAMCCS] Eraser:', state.eraser ? 'ON' : 'OFF');
            e.preventDefault();
          } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
            // Toggle hide notes with Option+S (Alt+S on Windows)
            state.hidden = !state.hidden;
            if (ui.hiddenChk) ui.hiddenChk.checked = state.hidden;
            app?.canvas?.setDirty(true, true);
            e.preventDefault();
          } else if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'i' || e.key === 'I')) {
            // Ctrl+I: Import workflow (or annotations JSON)
            e.preventDefault();
            promptImportWorkflow();
          } else if (e.key === 'Escape') {
            if (state.current) {
              state.paths.push(state.current);
              state.current = null;
              app?.canvas?.setDirty(true, true);
            }
          }
        });
      },
      setup() {
        const wait = () => {
          if (app?.canvas?.canvas) {
            console.log('[IAMCCS] Setup called - canvas ready');
            attachCanvasHooks();
            // Fallback: create button after 1 second if not created by draw
            setTimeout(() => {
              if (!state.uiShown) {
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
