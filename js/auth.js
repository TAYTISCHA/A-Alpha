/**
 * auth.js — Authentication, session management, role-based access
 * คลังชีทเรียนสายรหัส | KMUTT Chemistry
 */

const Auth = (() => {
  // ─── Session ────────────────────────────────────────────────────────────

  /** สร้าง session token แบบ pseudo-random */
  function _generateToken() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  /** บันทึก session ลง localStorage */
  function _saveSession(userData, token) {
    const session = {
      token,
      studentId: userData.studentId,
      name: userData.name,
      role: userData.role,
      deviceId: getDeviceId(),
      loginAt: Date.now(),
      expiresAt: Date.now() + CONFIG.SESSION_DURATION_MS,
    };
    localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(session));
    return session;
  }

  /** ดึง session ปัจจุบัน */
  function getSession() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.SESSION);
      if (!raw) return null;
      const session = JSON.parse(raw);
      // Check expiry
      if (Date.now() > session.expiresAt) {
        clearSession();
        return null;
      }
      // Check device match
      if (session.deviceId !== getDeviceId()) {
        clearSession();
        return null;
      }
      return session;
    } catch {
      clearSession();
      return null;
    }
  }

  /** ล้าง session */
  function clearSession() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.SESSION);
  }

  // ─── Rate Limiting ───────────────────────────────────────────────────────

  function _getAttempts() {
    try {
      return parseInt(
        localStorage.getItem(CONFIG.STORAGE_KEYS.LOGIN_ATTEMPTS) || "0"
      );
    } catch {
      return 0;
    }
  }

  function _incrementAttempts() {
    const attempts = _getAttempts() + 1;
    localStorage.setItem(CONFIG.STORAGE_KEYS.LOGIN_ATTEMPTS, attempts);
    if (attempts >= CONFIG.MAX_LOGIN_ATTEMPTS) {
      localStorage.setItem(
        CONFIG.STORAGE_KEYS.LOCKOUT_UNTIL,
        Date.now() + CONFIG.LOCKOUT_DURATION_MS
      );
    }
    return attempts;
  }

  function _resetAttempts() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.LOGIN_ATTEMPTS);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.LOCKOUT_UNTIL);
  }

  function isLockedOut() {
    try {
      const lockoutUntil = parseInt(
        localStorage.getItem(CONFIG.STORAGE_KEYS.LOCKOUT_UNTIL) || "0"
      );
      if (lockoutUntil && Date.now() < lockoutUntil) {
        return {
          locked: true,
          remainingMs: lockoutUntil - Date.now(),
        };
      }
      if (lockoutUntil && Date.now() >= lockoutUntil) {
        _resetAttempts();
      }
      return { locked: false };
    } catch {
      return { locked: false };
    }
  }

  // ─── Input Sanitization ──────────────────────────────────────────────────

  function _sanitize(str) {
    if (typeof str !== "string") return "";
    return str
      .trim()
      .replace(/[<>"'&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "&": "&amp;" }[c]));
  }

  function _validateStudentId(id) {
    // KMUTT student ID format: 2 digit year + 2 digit faculty + 5 digits = 9 chars e.g. 6610501234
    return /^\d{9,11}$/.test(id);
  }

  // ─── Login ───────────────────────────────────────────────────────────────

  /**
   * เรียก GAS API เพื่อ login
   * @returns {Promise<{success, user, error}>}
   */
  async function login(studentId, password) {
    const lockout = isLockedOut();
    if (lockout.locked) {
      const mins = Math.ceil(lockout.remainingMs / 60000);
      return {
        success: false,
        error: `ลองใหม่ใน ${mins} นาที (ล็อกเนื่องจากพยายามล็อกอินเกิน ${CONFIG.MAX_LOGIN_ATTEMPTS} ครั้ง)`,
      };
    }

    const cleanId = _sanitize(studentId);
    const cleanPass = _sanitize(password);

    if (!_validateStudentId(cleanId)) {
      return { success: false, error: "รหัสนักศึกษาไม่ถูกต้อง" };
    }
    if (!cleanPass || cleanPass.length < 4) {
      return { success: false, error: "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร" };
    }

    try {
      const res = await _gasRequest("login", {
        studentId: cleanId,
        password: cleanPass,
        deviceId: getDeviceId(),
      });

      if (res.success) {
        _resetAttempts();
        const token = _generateToken();
        const session = _saveSession(res.user, token);
        return { success: true, session };
      } else {
        _incrementAttempts();
        return { success: false, error: res.error || "รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง" };
      }
    } catch (err) {
      return { success: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
    }
  }

  /**
   * สมัครสมาชิก (junior เท่านั้น)
   */
  async function register(payload) {
    const { studentId, name, year, password, inviteCode } = payload;
    const cleanId = _sanitize(studentId);
    const cleanName = _sanitize(name);
    const cleanInvite = _sanitize(inviteCode);

    if (!_validateStudentId(cleanId))
      return { success: false, error: "รหัสนักศึกษาไม่ถูกต้อง" };
    if (!cleanName || cleanName.length < 2)
      return { success: false, error: "กรุณาใส่ชื่อ" };
    if (!cleanInvite)
      return { success: false, error: "กรุณาใส่รหัสเชิญ" };

    try {
      const res = await _gasRequest("register", {
        studentId: cleanId,
        name: cleanName,
        year: _sanitize(String(year)),
        password: _sanitize(password),
        inviteCode: cleanInvite,
        deviceId: getDeviceId(),
      });
      return res;
    } catch {
      return { success: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
    }
  }

  /** ออกจากระบบ */
  async function logout() {
    const session = getSession();
    if (session) {
      try {
        await _gasRequest("logout", {
          token: session.token,
          studentId: session.studentId,
        });
      } catch {}
    }
    clearSession();
    window.location.href = CONFIG.ROUTES.LOGIN;
  }

  // ─── Route Protection ────────────────────────────────────────────────────

  /**
   * ป้องกันหน้าที่ต้อง login
   * @param {string} requiredRole - 'senior' | 'junior' | null (any role)
   */
  function requireAuth(requiredRole = null) {
    const session = getSession();
    if (!session) {
      window.location.href = CONFIG.ROUTES.LOGIN;
      return null;
    }
    if (requiredRole && session.role !== requiredRole) {
      // Redirect to appropriate dashboard
      if (session.role === CONFIG.ROLES.SENIOR) {
        window.location.href = CONFIG.ROUTES.ADMIN;
      } else {
        window.location.href = CONFIG.ROUTES.DASHBOARD;
      }
      return null;
    }
    return session;
  }

  /** Redirect logged-in user away from login page */
  function redirectIfLoggedIn() {
    const session = getSession();
    if (!session) return;
    if (session.role === CONFIG.ROLES.SENIOR) {
      window.location.href = CONFIG.ROUTES.ADMIN;
    } else {
      window.location.href = CONFIG.ROUTES.DASHBOARD;
    }
  }

  // ─── GAS Request Helper ──────────────────────────────────────────────────

  async function _gasRequest(action, payload = {}) {
    // เอา action มารวมไว้ใน payload แทนการต่อท้าย URL (?action=...)
    const finalPayload = {
      action: action,
      ...payload
    };

    const response = await fetch(CONFIG.GAS_URL, {
      method: "POST",
      redirect: "follow", // บังคับให้ตาม Redirect เพื่อป้องกัน CORS error จาก GAS
      headers: { 
        "Content-Type": "text/plain;charset=utf-8" // ใช้ text/plain เพื่อข้าม Preflight (OPTIONS request)
      },
      body: JSON.stringify(finalPayload),
    });

    if (!response.ok) throw new Error("Network error: " + response.status);
    return response.json();
  }

  // Public API
  return {
    login,
    logout,
    register,
    getSession,
    clearSession,
    requireAuth,
    redirectIfLoggedIn,
    isLockedOut,
    gasRequest: _gasRequest,
  };
})();
