/**
 * config.js — App-wide constants & configuration
 * คลังชีทเรียนสายรหัส | KMUTT Chemistry
 */

const CONFIG = {
  APP_NAME: "ChemSheet",
  APP_SUBTITLE: "คลังชีทเรียนสายรหัส",
  UNIVERSITY: "KMUTT | ภาควิชาเคมี",

  // Google Apps Script Web App URL — ใส่ URL จาก GAS deployment
  GAS_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",

  // Session settings
  SESSION_KEY: "chemsheet_session",
  SESSION_DURATION_MS: 8 * 60 * 60 * 1000, // 8 hours
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes

  // Roles
  ROLES: {
    SENIOR: "senior",
    JUNIOR: "junior",
  },

  // Password expiry for junior (24h in ms)
  JUNIOR_PASSWORD_EXPIRY_MS: 24 * 60 * 60 * 1000,

  // File types allowed
  ALLOWED_FILE_TYPES: ["application/pdf"],
  MAX_FILE_SIZE_MB: 50,

  // Pagination
  FILES_PER_PAGE: 20,

  // Toast duration
  TOAST_DURATION_MS: 3500,

  // Local storage keys
  STORAGE_KEYS: {
    SESSION: "chemsheet_session",
    THEME: "chemsheet_theme",
    BOOKMARKS: "chemsheet_bookmarks",
    RECENT: "chemsheet_recent",
    DEVICE_ID: "chemsheet_device_id",
    LOGIN_ATTEMPTS: "chemsheet_login_attempts",
    LOCKOUT_UNTIL: "chemsheet_lockout_until",
  },

  // Routes
  ROUTES: {
    LOGIN: "login.html",
    DASHBOARD: "dashboard.html",
    ADMIN: "admin.html",
    PROFILE: "profile.html",
  },
};

// Generate or retrieve persistent device ID
function getDeviceId() {
  let id = localStorage.getItem(CONFIG.STORAGE_KEYS.DEVICE_ID);
  if (!id) {
    id =
      "dev_" +
      Date.now().toString(36) +
      Math.random().toString(36).substring(2, 10);
    localStorage.setItem(CONFIG.STORAGE_KEYS.DEVICE_ID, id);
  }
  return id;
}

// Freeze config to prevent mutation
Object.freeze(CONFIG);
Object.freeze(CONFIG.ROLES);
Object.freeze(CONFIG.STORAGE_KEYS);
Object.freeze(CONFIG.ROUTES);
