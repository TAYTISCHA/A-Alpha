/**
 * drive.js — Google Drive file operations via GAS
 * คลังชีทเรียนสายรหัส | KMUTT Chemistry
 */

const Drive = (() => {
  // ─── File Fetching ────────────────────────────────────────────────────────

  /**
   * ดึงรายการโฟลเดอร์/ไฟล์ทั้งหมดตาม path
   * @param {string} path - "year/subject/category"
   */
  async function listFiles(path = "", page = 1) {
    const session = Auth.getSession();
    if (!session) throw new Error("Not authenticated");

    return Auth.gasRequest("listFiles", {
      token: session.token,
      studentId: session.studentId,
      path,
      page,
      limit: CONFIG.FILES_PER_PAGE,
    });
  }

  /** ดึงโครงสร้างโฟลเดอร์ทั้งหมด (tree) */
  async function getFolderTree() {
    const session = Auth.getSession();
    if (!session) throw new Error("Not authenticated");

    return Auth.gasRequest("getFolderTree", {
      token: session.token,
      studentId: session.studentId,
    });
  }

  /** ค้นหาไฟล์ */
  async function searchFiles(query, filters = {}) {
    const session = Auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const sanitizedQuery = query.trim().substring(0, 100);
    return Auth.gasRequest("searchFiles", {
      token: session.token,
      studentId: session.studentId,
      query: sanitizedQuery,
      ...filters,
    });
  }

  /** รับ preview URL ของ PDF */
  async function getPreviewUrl(fileId) {
    const session = Auth.getSession();
    if (!session) throw new Error("Not authenticated");

    return Auth.gasRequest("getPreviewUrl", {
      token: session.token,
      studentId: session.studentId,
      fileId,
    });
  }

  /** รับ download URL */
  async function getDownloadUrl(fileId) {
    const session = Auth.getSession();
    if (!session) throw new Error("Not authenticated");

    return Auth.gasRequest("getDownloadUrl", {
      token: session.token,
      studentId: session.studentId,
      fileId,
    });
  }

  // ─── Admin: File Management ───────────────────────────────────────────────

  async function uploadFile(formData) {
    const session = Auth.getSession();
    if (!session || session.role !== CONFIG.ROLES.SENIOR)
      throw new Error("Unauthorized");

    return Auth.gasRequest("uploadFile", {
      token: session.token,
      studentId: session.studentId,
      ...formData,
    });
  }

  async function deleteFile(fileId) {
    const session = Auth.getSession();
    if (!session || session.role !== CONFIG.ROLES.SENIOR)
      throw new Error("Unauthorized");

    return Auth.gasRequest("deleteFile", {
      token: session.token,
      studentId: session.studentId,
      fileId,
    });
  }

  async function renameFile(fileId, newName) {
    const session = Auth.getSession();
    if (!session || session.role !== CONFIG.ROLES.SENIOR)
      throw new Error("Unauthorized");

    return Auth.gasRequest("renameFile", {
      token: session.token,
      studentId: session.studentId,
      fileId,
      newName: newName.trim().substring(0, 200),
    });
  }

  async function createFolder(path, name) {
    const session = Auth.getSession();
    if (!session || session.role !== CONFIG.ROLES.SENIOR)
      throw new Error("Unauthorized");

    return Auth.gasRequest("createFolder", {
      token: session.token,
      studentId: session.studentId,
      path,
      name: name.trim().substring(0, 100),
    });
  }

  async function pinFile(fileId, pinned) {
    const session = Auth.getSession();
    if (!session || session.role !== CONFIG.ROLES.SENIOR)
      throw new Error("Unauthorized");

    return Auth.gasRequest("pinFile", {
      token: session.token,
      studentId: session.studentId,
      fileId,
      pinned,
    });
  }

  // ─── Bookmarks (local) ────────────────────────────────────────────────────

  function getBookmarks() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.BOOKMARKS) || "[]");
    } catch {
      return [];
    }
  }

  function toggleBookmark(file) {
    const bookmarks = getBookmarks();
    const idx = bookmarks.findIndex((b) => b.id === file.id);
    if (idx >= 0) {
      bookmarks.splice(idx, 1);
    } else {
      bookmarks.unshift({ id: file.id, name: file.name, path: file.path, savedAt: Date.now() });
      if (bookmarks.length > 50) bookmarks.pop(); // limit 50
    }
    localStorage.setItem(CONFIG.STORAGE_KEYS.BOOKMARKS, JSON.stringify(bookmarks));
    return idx < 0; // returns true if added
  }

  function isBookmarked(fileId) {
    return getBookmarks().some((b) => b.id === fileId);
  }

  // ─── Recently Viewed (local) ──────────────────────────────────────────────

  function addRecent(file) {
    try {
      let recent = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.RECENT) || "[]");
      recent = recent.filter((r) => r.id !== file.id);
      recent.unshift({ id: file.id, name: file.name, path: file.path, viewedAt: Date.now() });
      if (recent.length > 20) recent.pop();
      localStorage.setItem(CONFIG.STORAGE_KEYS.RECENT, JSON.stringify(recent));
    } catch {}
  }

  function getRecent() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.RECENT) || "[]");
    } catch {
      return [];
    }
  }

  // ─── Analytics (Admin) ────────────────────────────────────────────────────

  async function getAnalytics() {
    const session = Auth.getSession();
    if (!session || session.role !== CONFIG.ROLES.SENIOR)
      throw new Error("Unauthorized");

    return Auth.gasRequest("getAnalytics", {
      token: session.token,
      studentId: session.studentId,
    });
  }

  return {
    listFiles,
    getFolderTree,
    searchFiles,
    getPreviewUrl,
    getDownloadUrl,
    uploadFile,
    deleteFile,
    renameFile,
    createFolder,
    pinFile,
    getBookmarks,
    toggleBookmark,
    isBookmarked,
    addRecent,
    getRecent,
    getAnalytics,
  };
})();
