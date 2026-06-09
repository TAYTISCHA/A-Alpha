/**
 * api.js — ฟังก์ชันกลางสำหรับส่ง Request ไปหา GAS Backend
 * ป้องกันปัญหา CORS โดยใช้ text/plain ในการข้าม Preflight เช็ค
 */

async function callAPI(action, data = {}) {
  // ลองแกะข้อมูล Session เก่า (ถ้ามีล็อกอินค้างไว้) เพื่อส่ง Token ยืนยันตัวตนอัตโนมัติ
  let token = "";
  let studentId = data.studentId || "";
  
  try {
    const savedSession = localStorage.getItem(CONFIG.STORAGE_KEYS.SESSION);
    if (savedSession) {
      const user = JSON.parse(savedSession);
      token = user.token || "";
      if (!studentId) studentId = user.studentId || "";
    }
  } catch (e) {
    console.error("Error reading session from local storage", e);
  }

  // สร้าง Payload หลักตามเงื่อนไขของฝั่งหลังบ้าน
  const payload = {
    action: action,
    deviceId: getDeviceId(),
    token: token,
    studentId: studentId,
    ...data
  };

  try {
    const response = await fetch(CONFIG.GAS_URL, {
      method: "POST",
      headers: {
        //  หัวใจสำคัญ: ใช้ text/plain เพื่อแก้ปัญหา CORS หลบเลี่ยงคำขอแบบ OPTIONS
        "Content-Type": "text/plain" 
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;

  } catch (error) {
    console.error(`API Error [${action}]:`, error);
    return { success: false, error: "ไม่สามารถเชื่อมต่อระบบหลังบ้านได้ (Network Error)" };
  }
}
