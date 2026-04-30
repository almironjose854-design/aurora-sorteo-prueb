(function () {
  const currentScriptUrl = document.currentScript
    ? new URL(document.currentScript.src, window.location.href)
    : new URL(window.location.href);
  const assetsBaseUrl = new URL("./", currentScriptUrl);
  const appBaseUrl = new URL("../", assetsBaseUrl);

  const DEFAULT_LOGO = new URL("aurora55logo.webp", assetsBaseUrl).href;

  function toAppUrl(path = "") {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    return new URL(cleanPath, appBaseUrl).href;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(toAppUrl(url), {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let payload = {};

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      const error = new Error(payload.message || "No se pudo completar la solicitud.");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  const api = {
    getPublicConfig() {
      return requestJson("api/public/config");
    },
    checkEntryCi(ci) {
      return requestJson(`api/public/entries/check?ci=${encodeURIComponent(ci)}`);
    },
    submitPublicEntry(payload) {
      return requestJson("api/public/entries", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    getAdminSession() {
      return requestJson("api/admin/session");
    },
    loginAdmin(payload) {
      return requestJson("api/admin/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    logoutAdmin() {
      return requestJson("api/admin/logout", {
        method: "POST"
      });
    },
    getAdminDashboard() {
      return requestJson("api/admin/dashboard");
    },
    createDraw(payload) {
      return requestJson("api/admin/draws", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    deleteEntry(id) {
      return requestJson(`api/admin/entries/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
    }
  };

  function normalizeName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizePhone(value) {
    return String(value || "").replace(/[^\d]/g, "");
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function validateEntryData(data) {
    if (String(data.companyWebsite || "").trim()) {
      return { valid: false, field: "companyWebsite", message: "No se pudo validar el envio." };
    }

    if (!data.fullName || data.fullName.length < 5 || data.fullName.split(/\s+/).length < 2) {
      return { valid: false, field: "fullName", message: "Ingresa nombre y apellido validos." };
    }

    if (!/^(?=.{5,120}$)[\p{L}\s'.,-]+$/u.test(data.fullName)) {
      return { valid: false, field: "fullName", message: "El nombre contiene caracteres no permitidos." };
    }

    if (!/^\d{5,12}$/.test(data.ci)) {
      return { valid: false, field: "ci", message: "La cedula debe contener entre 5 y 12 digitos." };
    }

    if (!/^\d{9,15}$/.test(data.phone)) {
      return { valid: false, field: "phone", message: "El numero de celular debe contener entre 9 y 15 digitos." };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return { valid: false, field: "email", message: "Ingresa un correo electronico valido." };
    }

    if (typeof data.hasLot !== "boolean") {
      return { valid: false, field: "hasLot", message: "Indica si el cliente tiene lote o no." };
    }

    if (!data.consent) {
      return { valid: false, field: "consent", message: "Debes autorizar el uso de datos para continuar." };
    }

    return { valid: true };
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("es-PY", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function applyBrandImages(root = document) {
    root.querySelectorAll("[data-brand-logo]").forEach((image) => {
      image.src = DEFAULT_LOGO;
      image.alt = "Aurora Inmobiliaria";
    });
  }

  function applyAppLinks(root = document) {
    root.querySelectorAll("[data-app-route]").forEach((link) => {
      link.href = toAppUrl(link.dataset.appRoute || "");
    });
  }

  async function getBrandLogoPngDataUrl() {
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth || image.width || 1200;
            canvas.height = image.naturalHeight || image.height || 400;
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/png"));
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = reject;
        image.src = DEFAULT_LOGO;
      });
    } catch (error) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function convertRowsToCsv(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      return "\ufeff";
    }

    const headers = Object.keys(rows[0]);
    const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    return `\ufeff${[
      headers.map(escapeCell).join(","),
      ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(","))
    ].join("\r\n")}`;
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  window.AuroraCore = {
    api,
    DEFAULT_LOGO,
    APP_BASE_URL: appBaseUrl.href,
    toAppUrl,
    normalizeName,
    normalizeDigits,
    normalizePhone,
    normalizeEmail,
    validateEntryData,
    formatDateTime,
    applyBrandImages,
    applyAppLinks,
    getBrandLogoPngDataUrl,
    escapeHtml,
    convertRowsToCsv,
    downloadFile
  };
})();
