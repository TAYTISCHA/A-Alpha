/**
 * appsscript.gs — ChemSheet Backend
 * คลังชีทเรียนสายรหัส | KMUTT Chemistry
 *
 * SETUP:
 * 1. สร้าง Google Apps Script Project ใหม่
 * 2. วางโค้ดนี้ใน Code.gs
 * 3. แก้ค่าใน SHEET_ID และ DRIVE_ROOT_FOLDER_ID
 * 4. Deploy > New Deployment > Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy deployment URL ไปใส่ใน js/config.js → GAS_URL
 */

// ════════════════════════════════════════════════
// CONFIGURATION — แก้ค่าเหล่านี้ก่อน Deploy
// ════════════════════════════════════════════════
const CONFIG_GAS = {
  SHEET_ID: "YOUR_GOOGLE_SHEET_ID",          // Google Sheet สำหรับเก็บ users, sessions
  DRIVE_ROOT_FOLDER_ID: "YOUR_DRIVE_FOLDER_ID", // Google Drive folder root
  SESSION_TTL_MS: 8 * 60 * 60 * 1000,        // 8 hours
  JUNIOR_PASS_DEFAULT_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  MAX_AVATAR_SIZE_BYTES: 5 * 1024 * 1024,
  ALLOWED_MIME_TYPES: ["application/pdf"],
};

// Sheet names
const SHEETS = {
  USERS: "Users",
  SESSIONS: "Sessions",
  FILES: "Files",
  SETTINGS: "Settings",
  INVITES: "Invites",
  ANALYTICS: "Analytics",
};

// ════════════════════════════════════════════════
// ENTRY POINT
// ════════════════════════════════════════════════

/**
 * รับทุก GET request (ใช้สำหรับ test endpoint)
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: "ChemSheet API", version: "1.0" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * รับทุก POST request และ route ไปยัง handler
 */
function doPost(e) {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const action = (e.parameter.action || body.action || "").trim();

    if (!action) return jsonResponse({ success: false, error: "Missing action" });

    // Route map
    const routes = {
      // Auth
      login: handleLogin,
      logout: handleLogout,
      register: handleRegister,
      // Profile
      getProfile: handleGetProfile,
      updateProfile: handleUpdateProfile,
      updateAvatar: handleUpdateAvatar,
      changePassword: handleChangePassword,
      // Users (admin)
      listUsers: handleListUsers,
      updateUser: handleUpdateUser,
      deleteUser: handleDeleteUser,
      // Files
      listFiles: handleListFiles,
      getFolderTree: handleGetFolderTree,
      searchFiles: handleSearchFiles,
      getPreviewUrl: handleGetPreviewUrl,
      getDownloadUrl: handleGetDownloadUrl,
      // Files admin
      uploadFile: handleUploadFile,
      deleteFile: handleDeleteFile,
      renameFile: handleRenameFile,
      createFolder: handleCreateFolder,
      pinFile: handlePinFile,
      // Password management
      getJuniorPassword: handleGetJuniorPassword,
      setJuniorPassword: handleSetJuniorPassword,
      // Invite codes
      generateInviteCode: handleGenerateInviteCode,
      // Announcements
      setAnnouncement: handleSetAnnouncement,
      // Analytics
      getAnalytics: handleGetAnalytics,
    };

    const handler = routes[action];
    if (!handler) return jsonResponse({ success: false, error: `Unknown action: ${action}` });

    const result = handler(body);
    return jsonResponse(result);

  } catch (err) {
    Logger.log("doPost error: " + err.message + "\n" + err.stack);
    return jsonResponse({ success: false, error: "Internal server error" });
  }
}

// ════════════════════════════════════════════════
// AUTH HANDLERS
// ════════════════════════════════════════════════

function handleLogin(body) {
  const { studentId, password, deviceId } = body;
  if (!studentId || !password) return { success: false, error: "กรุณากรอกข้อมูลให้ครบ" };

  const usersSheet = getSheet(SHEETS.USERS);
  const user = findUserById(usersSheet, studentId);
  if (!user) return { success: false, error: "รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง" };
  if (!user.active) return { success: false, error: "บัญชีนี้ถูกระงับการใช้งาน" };

  // Verify password
  const validPass = verifyPassword(user, password);
  if (!validPass) return { success: false, error: "รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง" };

  // Check junior password expiry
  if (user.role === "junior" && user.passwordExpiresAt) {
    if (Date.now() > parseInt(user.passwordExpiresAt)) {
      return { success: false, error: "รหัสผ่านหมดอายุแล้ว กรุณาติดต่อรุ่นพี่เพื่อรับรหัสใหม่" };
    }
  }

  // Create session
  const token = generateToken();
  saveSession(studentId, token, deviceId || "unknown", user.role);

  // Update last login
  updateUserField(usersSheet, studentId, "lastLogin", Date.now());
  recordAnalytic("login", studentId);

  return {
    success: true,
    user: {
      studentId: user.studentId,
      name: user.name,
      role: user.role,
      year: user.year,
    },
  };
}

function handleLogout(body) {
  const { token, studentId } = body;
  if (token) deleteSession(token);
  return { success: true };
}

function handleRegister(body) {
  const { studentId, name, year, password, inviteCode, deviceId } = body;
  if (!studentId || !name || !password || !inviteCode) {
    return { success: false, error: "กรุณากรอกข้อมูลให้ครบ" };
  }

  // Validate invite code
  const inviteSheet = getSheet(SHEETS.INVITES);
  const invite = findInviteCode(inviteSheet, inviteCode);
  if (!invite) return { success: false, error: "รหัสเชิญไม่ถูกต้อง" };
  if (invite.used) return { success: false, error: "รหัสเชิญนี้ถูกใช้ไปแล้ว" };

  // Check if studentId already exists
  const usersSheet = getSheet(SHEETS.USERS);
  const existing = findUserById(usersSheet, studentId);
  if (existing) return { success: false, error: "รหัสนักศึกษานี้มีในระบบแล้ว" };

  // Get current junior password (all juniors share one password)
  const juniorPass = getSetting("juniorPassword");
  const juniorPassExpiry = getSetting("juniorPasswordExpiresAt");

  if (!juniorPass) return { success: false, error: "ระบบยังไม่ได้ตั้งรหัสผ่านรุ่นน้อง กรุณาติดต่อรุ่นพี่" };

  // Verify password matches current junior password
  if (password !== juniorPass) {
    return { success: false, error: "รหัสผ่านไม่ถูกต้อง กรุณาขอรหัสจากรุ่นพี่" };
  }

  // Create user
  const now = Date.now();
  const newUser = [
    studentId,           // A: studentId
    hashPassword(password), // B: passwordHash
    name,                // C: name
    year || "1",         // D: year
    "junior",            // E: role
    "true",              // F: active
    now,                 // G: joinedAt
    now,                 // H: lastLogin
    juniorPassExpiry || (now + CONFIG_GAS.JUNIOR_PASS_DEFAULT_TTL_MS), // I: passwordExpiresAt
    "",                  // J: avatarUrl
  ];
  usersSheet.appendRow(newUser);

  // Mark invite as used
  markInviteUsed(inviteSheet, inviteCode, studentId);

  return { success: true, message: "สมัครสมาชิกสำเร็จ" };
}

// ════════════════════════════════════════════════
// PROFILE HANDLERS
// ════════════════════════════════════════════════

function handleGetProfile(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session) return { success: false, error: "Unauthorized" };

  const usersSheet = getSheet(SHEETS.USERS);
  const user = findUserById(usersSheet, body.studentId);
  if (!user) return { success: false, error: "User not found" };

  return {
    success: true,
    profile: {
      studentId: user.studentId,
      name: user.name,
      year: user.year,
      role: user.role,
      joinedAt: user.joinedAt,
      lastLogin: user.lastLogin,
      avatarUrl: user.avatarUrl || "",
    },
  };
}

function handleUpdateProfile(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session) return { success: false, error: "Unauthorized" };

  const usersSheet = getSheet(SHEETS.USERS);
  updateUserField(usersSheet, body.studentId, "name", sanitize(body.name || ""));
  updateUserField(usersSheet, body.studentId, "year", body.year || "1");

  return { success: true };
}

function handleUpdateAvatar(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    // Save avatar to Drive as image file
    const folder = getDriveFolder("Avatars");
    const fileName = `avatar_${body.studentId}.jpg`;
    const blob = Utilities.newBlob(
      Utilities.base64Decode(body.imageData),
      body.mimeType || "image/jpeg",
      fileName
    );

    // Delete old avatar if exists
    const files = folder.getFilesByName(fileName);
    while (files.hasNext()) files.next().setTrashed(true);

    // Save new one
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const avatarUrl = `https://drive.google.com/uc?id=${file.getId()}`;

    const usersSheet = getSheet(SHEETS.USERS);
    updateUserField(usersSheet, body.studentId, "avatarUrl", avatarUrl);

    return { success: true, avatarUrl };
  } catch (err) {
    Logger.log("Avatar upload error: " + err.message);
    return { success: false, error: "อัปโหลดรูปไม่สำเร็จ" };
  }
}

function handleChangePassword(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session) return { success: false, error: "Unauthorized" };

  const usersSheet = getSheet(SHEETS.USERS);
  const user = findUserById(usersSheet, body.studentId);
  if (!user) return { success: false, error: "User not found" };

  if (!verifyPassword(user, body.currentPassword)) {
    return { success: false, error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  }

  // Senior can change their own password freely (permanent)
  // Junior: password change is not allowed — only senior can reset
  if (user.role === "junior") {
    return { success: false, error: "รุ่นน้องไม่สามารถเปลี่ยนรหัสผ่านได้ด้วยตัวเอง" };
  }

  updateUserField(usersSheet, body.studentId, "passwordHash", hashPassword(body.newPassword));
  return { success: true };
}

// ════════════════════════════════════════════════
// USER MANAGEMENT (Admin)
// ════════════════════════════════════════════════

function handleListUsers(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  const usersSheet = getSheet(SHEETS.USERS);
  const data = usersSheet.getDataRange().getValues();
  const headers = data[0];
  const users = data.slice(1).map(row => rowToUser(headers, row)).filter(u => u.role === "junior");

  return { success: true, users };
}

function handleUpdateUser(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  const usersSheet = getSheet(SHEETS.USERS);
  if (body.active !== undefined) {
    updateUserField(usersSheet, body.targetId, "active", body.active ? "true" : "false");
  }
  return { success: true };
}

function handleDeleteUser(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };
  if (body.targetId === body.studentId) return { success: false, error: "ไม่สามารถลบตัวเองได้" };

  const usersSheet = getSheet(SHEETS.USERS);
  deleteUserById(usersSheet, body.targetId);
  return { success: true };
}

// ════════════════════════════════════════════════
// FILE HANDLERS
// ════════════════════════════════════════════════

function handleGetFolderTree(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const rootFolder = DriveApp.getFolderById(CONFIG_GAS.DRIVE_ROOT_FOLDER_ID);
    const folders = buildFolderTree(rootFolder, 1);

    // Get pinned files
    const filesSheet = getSheet(SHEETS.FILES);
    const pinned = getPinnedFiles(filesSheet);

    // Get announcement
    const announcement = {
      title: getSetting("announcementTitle"),
      body: getSetting("announcementBody"),
    };

    return {
      success: true,
      folders,
      pinned,
      announcement: (announcement.title || announcement.body) ? announcement : null,
    };
  } catch (err) {
    Logger.log("getFolderTree error: " + err.message);
    return { success: false, error: "ไม่สามารถโหลดโครงสร้างโฟลเดอร์ได้" };
  }
}

function handleListFiles(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session) return { success: false, error: "Unauthorized" };

  const path = (body.path || "").trim();
  const page = parseInt(body.page) || 1;
  const limit = parseInt(body.limit) || 20;

  try {
    const rootFolder = DriveApp.getFolderById(CONFIG_GAS.DRIVE_ROOT_FOLDER_ID);
    const targetFolder = path ? navigateToPath(rootFolder, path.split("/")) : rootFolder;
    if (!targetFolder) return { success: false, error: "ไม่พบโฟลเดอร์" };

    // Sub-folders
    const subfolders = [];
    const folderIter = targetFolder.getFolders();
    while (folderIter.hasNext()) {
      const f = folderIter.next();
      const fileCount = countFilesInFolder(f);
      subfolders.push({ name: f.getName(), count: fileCount });
    }

    // Files (PDF only)
    const allFiles = [];
    const fileIter = targetFolder.getFilesByType(MimeType.PDF);
    while (fileIter.hasNext()) {
      const f = fileIter.next();
      allFiles.push(driveFileToObj(f));
    }

    // Pagination
    const total = allFiles.length;
    const start = (page - 1) * limit;
    const files = allFiles.slice(start, start + limit);

    // Categories from file names
    const categories = [...new Set(allFiles.map(f => f.category).filter(Boolean))];

    return { success: true, subfolders, files, total, page, limit, categories };
  } catch (err) {
    Logger.log("listFiles error: " + err.message);
    return { success: false, error: "ไม่สามารถโหลดไฟล์ได้" };
  }
}

function handleSearchFiles(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session) return { success: false, error: "Unauthorized" };

  const query = sanitize(body.query || "").toLowerCase();
  if (!query) return { success: true, files: [] };

  try {
    const results = [];
    const driveQuery = `title contains '${query}' and mimeType = 'application/pdf' and trashed = false`;
    const files = DriveApp.searchFiles(driveQuery);
    while (files.hasNext() && results.length < 50) {
      results.push(driveFileToObj(files.next()));
    }
    return { success: true, files: results };
  } catch (err) {
    Logger.log("searchFiles error: " + err.message);
    return { success: false, error: "ค้นหาไม่สำเร็จ" };
  }
}

function handleGetPreviewUrl(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const file = DriveApp.getFileById(body.fileId);
    // Set public view
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const previewUrl = `https://drive.google.com/file/d/${file.getId()}/preview`;
    recordAnalytic("preview", body.studentId, body.fileId);
    return { success: true, url: previewUrl };
  } catch (err) {
    return { success: false, error: "ไม่สามารถโหลด Preview ได้" };
  }
}

function handleGetDownloadUrl(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const file = DriveApp.getFileById(body.fileId);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.getId()}`;
    recordAnalytic("download", body.studentId, body.fileId);
    return { success: true, url: downloadUrl };
  } catch (err) {
    return { success: false, error: "ไม่สามารถโหลด Download URL ได้" };
  }
}

// ════════════════════════════════════════════════
// FILE ADMIN HANDLERS
// ════════════════════════════════════════════════

function handleUploadFile(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  try {
    const { year, subject, type, fileName, fileData, mimeType } = body;
    if (!fileData || !fileName) return { success: false, error: "ไม่มีข้อมูลไฟล์" };
    if (mimeType !== "application/pdf") return { success: false, error: "รองรับเฉพาะ PDF" };

    const rootFolder = DriveApp.getFolderById(CONFIG_GAS.DRIVE_ROOT_FOLDER_ID);
    const targetFolder = getOrCreatePath(rootFolder, [year, subject, type]);

    const blob = Utilities.newBlob(Utilities.base64Decode(fileData), mimeType, sanitize(fileName));
    const file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Record in Files sheet
    const filesSheet = getSheet(SHEETS.FILES);
    filesSheet.appendRow([
      file.getId(), sanitize(fileName), year, subject, type,
      file.getSize(), Date.now(), body.studentId, "false", ""
    ]);

    recordAnalytic("upload", body.studentId, file.getId());
    return { success: true, fileId: file.getId() };
  } catch (err) {
    Logger.log("uploadFile error: " + err.message);
    return { success: false, error: "อัปโหลดไม่สำเร็จ" };
  }
}

function handleDeleteFile(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  try {
    DriveApp.getFileById(body.fileId).setTrashed(true);
    // Remove from Files sheet
    const filesSheet = getSheet(SHEETS.FILES);
    deleteFileRecord(filesSheet, body.fileId);
    return { success: true };
  } catch (err) {
    return { success: false, error: "ลบไฟล์ไม่สำเร็จ" };
  }
}

function handleRenameFile(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  try {
    DriveApp.getFileById(body.fileId).setName(sanitize(body.newName));
    const filesSheet = getSheet(SHEETS.FILES);
    updateFileRecord(filesSheet, body.fileId, "name", sanitize(body.newName));
    return { success: true };
  } catch (err) {
    return { success: false, error: "เปลี่ยนชื่อไม่สำเร็จ" };
  }
}

function handleCreateFolder(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  try {
    const rootFolder = DriveApp.getFolderById(CONFIG_GAS.DRIVE_ROOT_FOLDER_ID);
    const parentFolder = body.path ? navigateToPath(rootFolder, body.path.split("/").filter(Boolean)) : rootFolder;
    if (!parentFolder) return { success: false, error: "ไม่พบโฟลเดอร์ parent" };

    const newFolder = parentFolder.createFolder(sanitize(body.name));
    return { success: true, folderId: newFolder.getId() };
  } catch (err) {
    return { success: false, error: "สร้างโฟลเดอร์ไม่สำเร็จ" };
  }
}

function handlePinFile(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  const filesSheet = getSheet(SHEETS.FILES);
  updateFileRecord(filesSheet, body.fileId, "pinned", body.pinned ? "true" : "false");
  return { success: true };
}

// ════════════════════════════════════════════════
// PASSWORD MANAGEMENT
// ════════════════════════════════════════════════

function handleGetJuniorPassword(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  const password = getSetting("juniorPassword");
  const expiresAt = getSetting("juniorPasswordExpiresAt");
  if (!password) return { success: true, password: null };

  return {
    success: true,
    password,
    expiresAt: expiresAt ? parseInt(expiresAt) : null,
  };
}

function handleSetJuniorPassword(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  if (!body.password || body.password.length < 6) {
    return { success: false, error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" };
  }

  const expireHours = parseInt(body.expireHours) || 24;
  const expiresAt = Date.now() + expireHours * 60 * 60 * 1000;

  setSetting("juniorPassword", sanitize(body.password));
  setSetting("juniorPasswordExpiresAt", expiresAt);
  setSetting("juniorPasswordSetBy", body.studentId);
  setSetting("juniorPasswordSetAt", Date.now());

  // Update all junior users' password expiry
  const usersSheet = getSheet(SHEETS.USERS);
  const data = usersSheet.getDataRange().getValues();
  const headers = data[0];
  const passwordExpiresAtIdx = headers.indexOf("passwordExpiresAt");
  const passwordHashIdx = headers.indexOf("passwordHash");
  const roleIdx = headers.indexOf("role");

  for (let i = 1; i < data.length; i++) {
    if (data[i][roleIdx] === "junior") {
      if (passwordExpiresAtIdx >= 0) usersSheet.getRange(i + 1, passwordExpiresAtIdx + 1).setValue(expiresAt);
      if (passwordHashIdx >= 0) usersSheet.getRange(i + 1, passwordHashIdx + 1).setValue(hashPassword(body.password));
    }
  }

  return { success: true, expiresAt };
}

// ════════════════════════════════════════════════
// INVITE CODES
// ════════════════════════════════════════════════

function handleGenerateInviteCode(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  const code = "CHEM-" + generateShortToken(8).toUpperCase();
  const inviteSheet = getSheet(SHEETS.INVITES);
  inviteSheet.appendRow([code, body.studentId, Date.now(), "false", ""]);

  return { success: true, code };
}

// ════════════════════════════════════════════════
// ANNOUNCEMENTS
// ════════════════════════════════════════════════

function handleSetAnnouncement(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  setSetting("announcementTitle", sanitize(body.title || ""));
  setSetting("announcementBody", sanitize(body.body || ""));
  setSetting("announcementSetBy", body.studentId);
  setSetting("announcementSetAt", Date.now());

  return { success: true };
}

// ════════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════════

function handleGetAnalytics(body) {
  const session = validateSession(body.token, body.studentId);
  if (!session || session.role !== "senior") return { success: false, error: "Unauthorized" };

  try {
    const usersSheet = getSheet(SHEETS.USERS);
    const filesSheet = getSheet(SHEETS.FILES);
    const analyticsSheet = getSheet(SHEETS.ANALYTICS);

    const totalUsers = Math.max(0, usersSheet.getLastRow() - 1);
    const totalFiles = Math.max(0, filesSheet.getLastRow() - 1);

    // Today's visits
    const today = new Date().toDateString();
    const analyticsData = analyticsSheet.getDataRange().getValues();
    const todayVisits = analyticsData.slice(1).filter(row =>
      row[0] === "login" && new Date(parseInt(row[2] || 0)).toDateString() === today
    ).length;

    const downloads = analyticsData.slice(1).filter(row => row[0] === "download").length;

    // Recent files (last 5)
    const filesData = filesSheet.getDataRange().getValues();
    const fileHeaders = filesData[0];
    const recentFiles = filesData.slice(-6, -1).reverse().map(row => ({
      id: row[fileHeaders.indexOf("id")],
      name: row[fileHeaders.indexOf("name")],
      createdAt: row[fileHeaders.indexOf("createdAt")],
    }));

    // Recent users (last 5)
    const usersData = usersSheet.getDataRange().getValues();
    const userHeaders = usersData[0];
    const recentUsers = usersData.slice(1).filter(r => r[userHeaders.indexOf("role")] === "junior")
      .sort((a, b) => b[userHeaders.indexOf("lastLogin")] - a[userHeaders.indexOf("lastLogin")])
      .slice(0, 5).map(row => ({
        studentId: row[userHeaders.indexOf("studentId")],
        name: row[userHeaders.indexOf("name")],
        lastLogin: row[userHeaders.indexOf("lastLogin")],
      }));

    return { success: true, totalUsers, totalFiles, todayVisits, downloads, recentFiles, recentUsers };
  } catch (err) {
    Logger.log("getAnalytics error: " + err.message);
    return { success: false, error: "ไม่สามารถโหลด Analytics ได้" };
  }
}

// ════════════════════════════════════════════════
// HELPERS — Session
// ════════════════════════════════════════════════

function generateToken() {
  return Utilities.getUuid().replace(/-/g, "") + Date.now().toString(36);
}

function generateShortToken(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function saveSession(studentId, token, deviceId, role) {
  const sessSheet = getSheet(SHEETS.SESSIONS);
  const expiresAt = Date.now() + CONFIG_GAS.SESSION_TTL_MS;
  // Remove old sessions for this device
  deleteSessionsByDevice(sessSheet, studentId, deviceId);
  sessSheet.appendRow([token, studentId, deviceId, role, Date.now(), expiresAt, "active"]);
}

function validateSession(token, studentId) {
  if (!token || !studentId) return null;
  const sessSheet = getSheet(SHEETS.SESSIONS);
  const data = sessSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === token && row[1] === studentId && row[6] === "active") {
      if (Date.now() < parseInt(row[5])) {
        return { studentId: row[1], role: row[3] };
      }
    }
  }
  return null;
}

function deleteSession(token) {
  const sessSheet = getSheet(SHEETS.SESSIONS);
  const data = sessSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      sessSheet.getRange(i + 1, 7).setValue("expired");
      return;
    }
  }
}

function deleteSessionsByDevice(sheet, studentId, deviceId) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === studentId && data[i][2] === deviceId) {
      sheet.getRange(i + 1, 7).setValue("expired");
    }
  }
}

// ════════════════════════════════════════════════
// HELPERS — Password
// ════════════════════════════════════════════════

function hashPassword(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + "chemsheet_salt_kmutt"
  );
  return bytes.map(b => ("0" + (b & 0xff).toString(16)).slice(-2)).join("");
}

function verifyPassword(user, password) {
  return user.passwordHash === hashPassword(password);
}

// ════════════════════════════════════════════════
// HELPERS — Sheets
// ════════════════════════════════════════════════

function getSheet(name) {
  const ss = SpreadsheetApp.openById(CONFIG_GAS.SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = initializeSheet(ss, name);
  return sheet;
}

function initializeSheet(ss, name) {
  const sheet = ss.insertSheet(name);
  const headers = {
    [SHEETS.USERS]: ["studentId", "passwordHash", "name", "year", "role", "active", "joinedAt", "lastLogin", "passwordExpiresAt", "avatarUrl"],
    [SHEETS.SESSIONS]: ["token", "studentId", "deviceId", "role", "createdAt", "expiresAt", "status"],
    [SHEETS.FILES]: ["id", "name", "year", "subject", "type", "size", "createdAt", "uploadedBy", "pinned", "category"],
    [SHEETS.SETTINGS]: ["key", "value"],
    [SHEETS.INVITES]: ["code", "createdBy", "createdAt", "used", "usedBy"],
    [SHEETS.ANALYTICS]: ["event", "studentId", "timestamp", "fileId"],
  };
  if (headers[name]) sheet.appendRow(headers[name]);
  return sheet;
}

function findUserById(sheet, studentId) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(studentId)) {
      return rowToUser(headers, data[i]);
    }
  }
  return null;
}

function rowToUser(headers, row) {
  const user = {};
  headers.forEach((h, i) => { user[h] = row[i]; });
  user.active = String(user.active) === "true";
  return user;
}

function updateUserField(sheet, studentId, field, value) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = headers.indexOf(field);
  if (colIdx < 0) return;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(studentId)) {
      sheet.getRange(i + 1, colIdx + 1).setValue(value);
      return;
    }
  }
}

function deleteUserById(sheet, studentId) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(studentId)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

// ════════════════════════════════════════════════
// HELPERS — Settings
// ════════════════════════════════════════════════

function getSetting(key) {
  const sheet = getSheet(SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function setSetting(key, value) {
  const sheet = getSheet(SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

// ════════════════════════════════════════════════
// HELPERS — Invite
// ════════════════════════════════════════════════

function findInviteCode(sheet, code) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      const obj = {};
      headers.forEach((h, j) => obj[h] = data[i][j]);
      obj.used = String(obj.used) === "true";
      return obj;
    }
  }
  return null;
}

function markInviteUsed(sheet, code, usedBy) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      sheet.getRange(i + 1, 4).setValue("true");
      sheet.getRange(i + 1, 5).setValue(usedBy);
      return;
    }
  }
}

// ════════════════════════════════════════════════
// HELPERS — Files / Drive
// ════════════════════════════════════════════════

function buildFolderTree(folder, depth) {
  if (depth <= 0) return [];
  const result = [];
  const iter = folder.getFolders();
  while (iter.hasNext()) {
    const sub = iter.next();
    result.push({
      name: sub.getName(),
      count: countFilesInFolder(sub),
      children: depth > 1 ? buildFolderTree(sub, depth - 1) : [],
    });
  }
  return result;
}

function countFilesInFolder(folder) {
  let count = 0;
  const files = folder.getFilesByType(MimeType.PDF);
  while (files.hasNext()) { files.next(); count++; }
  const subs = folder.getFolders();
  while (subs.hasNext()) count += countFilesInFolder(subs.next());
  return count;
}

function navigateToPath(rootFolder, pathParts) {
  let current = rootFolder;
  for (const part of pathParts) {
    if (!part) continue;
    const iter = current.getFoldersByName(part);
    if (!iter.hasNext()) return null;
    current = iter.next();
  }
  return current;
}

function getOrCreatePath(rootFolder, parts) {
  let current = rootFolder;
  for (const part of parts) {
    if (!part) continue;
    const iter = current.getFoldersByName(part);
    current = iter.hasNext() ? iter.next() : current.createFolder(part);
  }
  return current;
}

function driveFileToObj(file) {
  return {
    id: file.getId(),
    name: file.getName(),
    size: file.getSize(),
    date: file.getDateCreated().getTime(),
    mimeType: file.getMimeType(),
    pinned: false,
    category: "",
  };
}

function getDriveFolder(name) {
  const root = DriveApp.getFolderById(CONFIG_GAS.DRIVE_ROOT_FOLDER_ID);
  const iter = root.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : root.createFolder(name);
}

function getPinnedFiles(filesSheet) {
  const data = filesSheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1)
    .filter(row => String(row[headers.indexOf("pinned")]) === "true")
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function deleteFileRecord(sheet, fileId) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(fileId)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

function updateFileRecord(sheet, fileId, field, value) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = headers.indexOf(field);
  if (colIdx < 0) return;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(fileId)) {
      sheet.getRange(i + 1, colIdx + 1).setValue(value);
      return;
    }
  }
}

// ════════════════════════════════════════════════
// HELPERS — Analytics
// ════════════════════════════════════════════════

function recordAnalytic(event, studentId, fileId) {
  try {
    const sheet = getSheet(SHEETS.ANALYTICS);
    sheet.appendRow([event, studentId || "", Date.now(), fileId || ""]);
  } catch {}
}

// ════════════════════════════════════════════════
// HELPERS — Misc
// ════════════════════════════════════════════════

function sanitize(str) {
  if (typeof str !== "string") return "";
  return str.trim().replace(/[<>"'&]/g, c => ({
    "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "&": "&amp;"
  })[c]);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════
// ONE-TIME SETUP — เรียกครั้งเดียวเพื่อสร้าง Sheets + Senior account
// ════════════════════════════════════════════════

/**
 * เรียก setupProject() ครั้งแรกจาก Apps Script Editor
 * เพื่อสร้าง Sheet headers และ Senior account เริ่มต้น
 */
function setupProject() {
  const ss = SpreadsheetApp.openById(CONFIG_GAS.SHEET_ID);

  // Initialize all sheets
  Object.values(SHEETS).forEach(name => {
    if (!ss.getSheetByName(name)) {
      Logger.log("Creating sheet: " + name);
      initializeSheet(ss, name);
    }
  });

  // Create default senior account (แก้ studentId และ password ด้านล่าง)
  const DEFAULT_SENIOR_ID = "6510000000";  // ← แก้ตรงนี้
  const DEFAULT_SENIOR_PASS = "admin1234"; // ← แก้ตรงนี้

  const usersSheet = getSheet(SHEETS.USERS);
  if (!findUserById(usersSheet, DEFAULT_SENIOR_ID)) {
    usersSheet.appendRow([
      DEFAULT_SENIOR_ID,
      hashPassword(DEFAULT_SENIOR_PASS),
      "Admin Senior",
      "4",
      "senior",
      "true",
      Date.now(),
      Date.now(),
      "",
      "",
    ]);
    Logger.log("✅ Created senior account: " + DEFAULT_SENIOR_ID);
  }

  Logger.log("✅ Setup complete!");
}
