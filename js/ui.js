/**
 * ui.js — UI utilities: Toast, Modal, Skeleton, Theme, Sidebar
 * คลังชีทเรียนสายรหัส | KMUTT Chemistry
 */

const UI = (() => {
  // ─── Theme ───────────────────────────────────────────────────────────────

  function initTheme() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    setTheme(theme, false);
  }

  function setTheme(theme, save = true) {
    document.documentElement.setAttribute("data-theme", theme);
    if (save) localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
    // update toggle icons
    document.querySelectorAll(".theme-toggle-btn").forEach((btn) => {
      btn.innerHTML = theme === "dark"
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    });
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "light" : "dark");
  }

  // ─── Toast ────────────────────────────────────────────────────────────────

  let _toastContainer = null;

  function _getToastContainer() {
    if (!_toastContainer) {
      _toastContainer = document.createElement("div");
      _toastContainer.id = "toast-container";
      document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
  }

  /** @param {'success'|'error'|'info'|'warning'} type */
  function toast(message, type = "info", duration = CONFIG.TOAST_DURATION_MS) {
    const container = _getToastContainer();
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;

    const icons = {
      success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
      warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    };

    el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${message}</span>`;
    container.appendChild(el);

    requestAnimationFrame(() => el.classList.add("toast-show"));

    setTimeout(() => {
      el.classList.remove("toast-show");
      el.classList.add("toast-hide");
      setTimeout(() => el.remove(), 400);
    }, duration);
  }

  // ─── Modal ────────────────────────────────────────────────────────────────

  function showModal(options = {}) {
    const {
      title = "",
      content = "",
      confirmText = "ยืนยัน",
      cancelText = "ยกเลิก",
      type = "default", // 'default' | 'danger' | 'info'
      onConfirm = null,
      onCancel = null,
    } = options;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal modal-${type}" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" aria-label="ปิด">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">${content}</div>
        ${onConfirm || onCancel ? `
        <div class="modal-footer">
          ${onCancel !== false ? `<button class="btn btn-ghost modal-cancel">${cancelText}</button>` : ""}
          ${onConfirm ? `<button class="btn btn-primary ${type === "danger" ? "btn-danger" : ""} modal-confirm">${confirmText}</button>` : ""}
        </div>` : ""}
      </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("modal-open"));

    const close = () => {
      overlay.classList.remove("modal-open");
      setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector(".modal-close")?.addEventListener("click", () => {
      onCancel?.();
      close();
    });
    overlay.querySelector(".modal-cancel")?.addEventListener("click", () => {
      onCancel?.();
      close();
    });
    overlay.querySelector(".modal-confirm")?.addEventListener("click", () => {
      onConfirm?.();
      close();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        onCancel?.();
        close();
      }
    });

    return { close };
  }

  // ─── Skeleton Loading ─────────────────────────────────────────────────────

  function createSkeleton(count = 6) {
    return Array.from({ length: count }, () => `
      <div class="skeleton-card">
        <div class="skeleton-line skeleton-line-sm"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line skeleton-line-lg"></div>
        <div class="skeleton-line skeleton-line-sm"></div>
      </div>`).join("");
  }

  // ─── Sidebar ──────────────────────────────────────────────────────────────

  function initSidebar() {
    const toggle = document.getElementById("sidebar-toggle");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");

    if (!toggle || !sidebar) return;

    toggle.addEventListener("click", () => {
      const isOpen = sidebar.classList.contains("sidebar-open");
      if (isOpen) closeSidebar();
      else openSidebar();
    });

    overlay?.addEventListener("click", closeSidebar);
  }

  function openSidebar() {
    document.getElementById("sidebar")?.classList.add("sidebar-open");
    document.getElementById("sidebar-overlay")?.classList.add("overlay-show");
    document.body.classList.add("sidebar-active");
  }

  function closeSidebar() {
    document.getElementById("sidebar")?.classList.remove("sidebar-open");
    document.getElementById("sidebar-overlay")?.classList.remove("overlay-show");
    document.body.classList.remove("sidebar-active");
  }

  // ─── Empty State ──────────────────────────────────────────────────────────

  function emptyState(message = "ไม่พบข้อมูล", subtitle = "") {
    return `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
            <polyline points="13 2 13 9 20 9"/>
          </svg>
        </div>
        <p class="empty-title">${message}</p>
        ${subtitle ? `<p class="empty-sub">${subtitle}</p>` : ""}
      </div>`;
  }

  // ─── Loading Button ───────────────────────────────────────────────────────

  function setButtonLoading(btn, loading, originalText = null) {
    if (loading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = `<span class="btn-spinner"></span>`;
      btn.disabled = true;
    } else {
      btn.innerHTML = originalText || btn.dataset.originalText || btn.innerHTML;
      btn.disabled = false;
    }
  }

  // ─── Relative Time ────────────────────────────────────────────────────────

  function relativeTime(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "เมื่อกี้";
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
    if (days < 7) return `${days} วันที่แล้ว`;
    return new Date(timestamp).toLocaleDateString("th-TH");
  }

  return {
    initTheme,
    setTheme,
    toggleTheme,
    toast,
    showModal,
    createSkeleton,
    initSidebar,
    openSidebar,
    closeSidebar,
    emptyState,
    setButtonLoading,
    relativeTime,
  };
})();
