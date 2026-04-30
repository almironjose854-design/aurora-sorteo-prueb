document.addEventListener("DOMContentLoaded", () => {
  const core = window.AuroraCore;

  const state = {
    entries: [],
    draws: [],
    activity: [],
    analyticsPeriod: "all",
    charts: {
      daily: null,
      ownership: null
    },
    lastDrawSnapshot: null
  };

  const elements = {
    headerCount: document.getElementById("headerCount"),
    loginView: document.getElementById("loginView"),
    dashboardView: document.getElementById("dashboardView"),
    loginForm: document.getElementById("adminLoginForm"),
    loginNotice: document.getElementById("loginNotice"),
    logoutBtn: document.getElementById("logoutBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    exportCsvBtn: document.getElementById("exportCsvBtn"),
    exportExcelBtn: document.getElementById("exportExcelBtn"),
    exportPdfBtn: document.getElementById("exportPdfBtn"),
    exportTxtBtn: document.getElementById("exportTxtBtn"),
    exportHtmlBtn: document.getElementById("exportHtmlBtn"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    analyticsPeriod: document.getElementById("analyticsPeriod"),
    systemStatus: document.getElementById("systemStatus"),
    statsGrid: document.getElementById("statsGrid"),
    domainList: document.getElementById("domainList"),
    prefixList: document.getElementById("prefixList"),
    qualityList: document.getElementById("qualityList"),
    activityList: document.getElementById("activityList"),
    latestDrawResult: document.getElementById("latestDrawResult"),
    entriesSearch: document.getElementById("entriesSearch"),
    lotFilter: document.getElementById("lotFilter"),
    tableDateFilter: document.getElementById("tableDateFilter"),
    tableSort: document.getElementById("tableSort"),
    visibleCount: document.getElementById("visibleCount"),
    entriesTableBody: document.getElementById("entriesTableBody"),
    emptyEntriesState: document.getElementById("emptyEntriesState"),
    raffleForm: document.getElementById("raffleForm"),
    raffleTitle: document.getElementById("raffleTitle"),
    raffleOwnershipFilter: document.getElementById("raffleOwnershipFilter"),
    raffleWinnerCount: document.getElementById("raffleWinnerCount"),
    raffleReserveCount: document.getElementById("raffleReserveCount"),
    raffleNotes: document.getElementById("raffleNotes"),
    raffleExcludePrevious: document.getElementById("raffleExcludePrevious"),
    rafflePoolInfo: document.getElementById("rafflePoolInfo"),
    raffleNotice: document.getElementById("raffleNotice"),
    raffleSubmitBtn: document.getElementById("raffleSubmitBtn"),
    raffleResults: document.getElementById("raffleResults"),
    copyWinnersBtn: document.getElementById("copyWinnersBtn"),
    drawHistory: document.getElementById("drawHistory"),
    chartDaily: document.getElementById("chartDaily"),
    chartOwnership: document.getElementById("chartOwnership")
  };

  core.applyBrandImages();
  core.applyAppLinks();
  bindEvents();
  bootstrap();

  function bindEvents() {
    elements.loginForm.addEventListener("submit", handleLogin);
    elements.logoutBtn.addEventListener("click", handleLogout);
    elements.refreshBtn.addEventListener("click", loadDashboard);
    elements.exportCsvBtn.addEventListener("click", exportVisibleCsv);
    elements.exportExcelBtn.addEventListener("click", exportExcelLike);
    elements.exportPdfBtn.addEventListener("click", exportPdfReport);
    elements.exportTxtBtn.addEventListener("click", exportTxtReport);
    elements.exportHtmlBtn.addEventListener("click", exportHtmlReport);
    elements.exportJsonBtn.addEventListener("click", exportJson);
    elements.analyticsPeriod.addEventListener("change", () => {
      state.analyticsPeriod = elements.analyticsPeriod.value;
      renderAll();
    });
    elements.entriesSearch.addEventListener("input", renderEntriesTable);
    elements.lotFilter.addEventListener("change", renderEntriesTable);
    elements.tableDateFilter.addEventListener("change", renderEntriesTable);
    elements.tableSort.addEventListener("change", renderEntriesTable);
    elements.entriesTableBody.addEventListener("click", handleTableAction);
    elements.raffleForm.addEventListener("submit", handleRaffle);
    elements.raffleOwnershipFilter.addEventListener("change", renderRafflePoolInfo);
    elements.raffleWinnerCount.addEventListener("input", renderRafflePoolInfo);
    elements.raffleReserveCount.addEventListener("input", renderRafflePoolInfo);
    elements.raffleExcludePrevious.addEventListener("change", renderRafflePoolInfo);
    elements.copyWinnersBtn.addEventListener("click", copyLatestResult);
  }

  async function bootstrap() {
    try {
      await core.api.getAdminSession();
      showDashboard();
      await loadDashboard();
    } catch (error) {
      showLogin();
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    hideNotice(elements.loginNotice);

    const formData = new FormData(elements.loginForm);
    const payload = {
      adminUser: String(formData.get("adminUser") || "").trim(),
      adminPassword: String(formData.get("adminPassword") || "")
    };

    if (!payload.adminUser || !payload.adminPassword) {
      showNotice(elements.loginNotice, "Completa usuario y contrasena.", "error");
      return;
    }

    try {
      await core.api.loginAdmin(payload);
      elements.loginForm.reset();
      showDashboard();
      await loadDashboard();
    } catch (error) {
      showNotice(elements.loginNotice, error?.message || "No se pudo iniciar sesion.", "error");
    }
  }

  async function handleLogout() {
    try {
      await core.api.logoutAdmin();
    } catch (error) {
      // no-op
    }

    state.entries = [];
    state.draws = [];
    state.activity = [];
    state.lastDrawSnapshot = null;
    destroyCharts();
    showLogin();
  }

  async function loadDashboard() {
    try {
      const payload = await core.api.getAdminDashboard();
      state.entries = Array.isArray(payload.entries) ? payload.entries : [];
      state.draws = Array.isArray(payload.draws) ? payload.draws : [];
      state.activity = Array.isArray(payload.activity) ? payload.activity : [];
      renderAll();
    } catch (error) {
      if (error.status === 401) {
        showLogin();
        showNotice(elements.loginNotice, "Tu sesion expiro. Ingresa nuevamente.", "error");
      }
    }
  }

  async function handleTableAction(event) {
    const button = event.target.closest("[data-delete-id]");
    if (!button) return;

    const { deleteId } = button.dataset;
    const confirmed = window.confirm("Se eliminara este registro del archivo JSON. Deseas continuar?");
    if (!confirmed) return;

    try {
      await core.api.deleteEntry(deleteId);
      await loadDashboard();
    } catch (error) {
      window.alert(error?.message || "No se pudo eliminar el registro.");
    }
  }

  async function handleRaffle(event) {
    event.preventDefault();
    hideNotice(elements.raffleNotice);
    setRaffleSubmitting(true);

    const payload = {
      title: String(elements.raffleTitle.value || "").trim(),
      filter: elements.raffleOwnershipFilter.value,
      winnerCount: Number.parseInt(elements.raffleWinnerCount.value || "0", 10),
      reserveCount: Number.parseInt(elements.raffleReserveCount.value || "0", 10),
      notes: String(elements.raffleNotes.value || "").trim(),
      excludePrevious: elements.raffleExcludePrevious.checked
    };

    try {
      const result = await core.api.createDraw(payload);
      state.lastDrawSnapshot = result;
      showNotice(
        elements.raffleNotice,
        `Sorteo guardado correctamente. ${result.winners.length} ganador(es) y ${result.reserves.length} suplente(s).`,
        "success"
      );
      await loadDashboard();
      elements.raffleTitle.value = "";
      elements.raffleNotes.value = "";
      elements.raffleWinnerCount.value = String(payload.winnerCount || 1);
      elements.raffleReserveCount.value = String(payload.reserveCount || 0);
    } catch (error) {
      showNotice(elements.raffleNotice, error?.message || "No se pudo realizar el sorteo.", "error");
    } finally {
      setRaffleSubmitting(false);
    }
  }

  function renderAll() {
    const summary = buildSummary(filterEntriesByPreset(state.entries, state.analyticsPeriod), state.draws);
    const totalSummary = buildSummary(state.entries, state.draws);
    const quality = buildQualityReport(state.entries);

    elements.headerCount.textContent = String(totalSummary.total);
    renderSystemStatus(totalSummary, summary);
    renderStats(summary, totalSummary);
    renderInsightList(elements.domainList, summary.topDomains, "Sin dominios", "correo(s) registrados");
    renderInsightList(elements.prefixList, summary.topPhonePrefixes, "Sin prefijos", "registro(s)");
    renderQuality(quality);
    renderActivity();
    renderCharts(summary);
    renderEntriesTable();
    renderRafflePoolInfo();
    renderLatestDraw();
    renderDrawHistory();
  }

  function renderSystemStatus(totalSummary, summary) {
    const chips = [
      `Periodo: ${getPeriodLabel(state.analyticsPeriod)}`,
      `Registros analizados: ${summary.total}`,
      `Sorteos acumulados: ${totalSummary.drawCount}`,
      `Seleccionados unicos: ${totalSummary.uniqueSelectedCount}`,
      `Disponibles: ${totalSummary.availableForFreshDraw}`
    ];

    elements.systemStatus.innerHTML = chips.map((label) => `<div class="meta-chip">${core.escapeHtml(label)}</div>`).join("");
  }

  function renderStats(summary, totalSummary) {
    const cards = [
      {
        label: "Participantes del periodo",
        value: summary.total,
        note: summary.latestEntry
          ? `Ultimo ingreso: ${summary.latestEntry.fullName} | ${core.formatDateTime(summary.latestEntry.createdAt)}`
          : "Sin registros en el periodo"
      },
      {
        label: "Clientes con lote",
        value: summary.withLot,
        note: summary.total ? `${summary.withLotPercent}% del periodo` : "Sin datos todavia"
      },
      {
        label: "Clientes sin lote",
        value: summary.withoutLot,
        note: summary.total ? `${summary.withoutLotPercent}% del periodo` : "Sin datos todavia"
      },
      {
        label: "Dia mas activo",
        value: summary.peakDayLabel,
        note: summary.peakDayCount ? `${summary.peakDayCount} registro(s)` : "Sin movimiento"
      },
      {
        label: "Registros hoy",
        value: totalSummary.todayCount,
        note: `${totalSummary.last7DaysCount} en los ultimos 7 dias`
      },
      {
        label: "Promedio por dia activo",
        value: summary.averagePerActiveDay,
        note: `${summary.activeDays} dia(s) con actividad`
      },
      {
        label: "Sorteos guardados",
        value: totalSummary.drawCount,
        note: `${totalSummary.uniqueSelectedCount} personas ya seleccionadas`
      },
      {
        label: "Disponibles para nuevo sorteo",
        value: totalSummary.availableForFreshDraw,
        note: `${totalSummary.total} registros totales`
      }
    ];

    elements.statsGrid.innerHTML = cards
      .map(
        (card) => `
          <article class="surface metric-card">
            <span>${core.escapeHtml(card.label)}</span>
            <strong>${core.escapeHtml(String(card.value))}</strong>
            <small>${core.escapeHtml(card.note)}</small>
          </article>
        `
      )
      .join("");
  }

  function renderInsightList(container, items, emptyLabel, suffix) {
    if (!items.length) {
      container.innerHTML = `
        <div class="insight-item">
          <div>
            <strong>${core.escapeHtml(emptyLabel)}</strong>
            <p>Los datos apareceran cuando existan registros suficientes.</p>
          </div>
          <div class="insight-value">0</div>
        </div>
      `;
      return;
    }

    container.innerHTML = items
      .map(
        (item) => `
          <div class="insight-item">
            <div>
              <strong>${core.escapeHtml(item.label)}</strong>
              <p>${core.escapeHtml(`${item.count} ${suffix}`)}</p>
            </div>
            <div class="insight-value">${core.escapeHtml(String(item.count))}</div>
          </div>
        `
      )
      .join("");
  }

  function renderQuality(report) {
    const items = [
      {
        title: "Telefonos compartidos",
        value: report.duplicatePhoneCount,
        detail: report.duplicatePhones[0]
          ? `${report.duplicatePhones[0].value} | ${report.duplicatePhones[0].names.slice(0, 3).join(", ")}`
          : "Sin coincidencias."
      },
      {
        title: "Correos compartidos",
        value: report.duplicateEmailCount,
        detail: report.duplicateEmails[0]
          ? `${report.duplicateEmails[0].value} | ${report.duplicateEmails[0].names.slice(0, 3).join(", ")}`
          : "Sin coincidencias."
      },
      {
        title: "Nombres repetidos",
        value: report.duplicateNameCount,
        detail: report.duplicateNames[0]
          ? `${report.duplicateNames[0].names[0]} | ${report.duplicateNames[0].count} coincidencias`
          : "Sin coincidencias."
      }
    ];

    elements.qualityList.innerHTML = items
      .map(
        (item) => `
          <div class="insight-item">
            <div>
              <strong>${core.escapeHtml(item.title)}</strong>
              <p>${core.escapeHtml(item.detail)}</p>
            </div>
            <div class="insight-value">${core.escapeHtml(String(item.value))}</div>
          </div>
        `
      )
      .join("");
  }

  function renderActivity() {
    if (!state.activity.length) {
      elements.activityList.innerHTML = `<div class="empty-state">Todavia no hay actividad registrada.</div>`;
      return;
    }

    elements.activityList.innerHTML = state.activity
      .slice(0, 8)
      .map(
        (item) => `
          <div class="insight-item">
            <div>
              <strong>${core.escapeHtml(getActivityLabel(item.type))}</strong>
              <p>${core.escapeHtml(item.detail || "")}</p>
            </div>
            <div class="activity-tag">${core.escapeHtml(core.formatDateTime(item.createdAt))}</div>
          </div>
        `
      )
      .join("");
  }

  function renderCharts(summary) {
    if (!window.Chart) return;

    destroyCharts();

    state.charts.daily = new window.Chart(elements.chartDaily, {
      type: "line",
      data: {
        labels: summary.dailyLabels,
        datasets: [
          {
            label: "Registros",
            data: summary.dailyCounts,
            borderColor: "#ea6909",
            backgroundColor: "rgba(234, 105, 9, 0.18)",
            tension: 0.35,
            fill: true,
            pointRadius: 3
          }
        ]
      },
      options: baseChartOptions()
    });

    state.charts.ownership = new window.Chart(elements.chartOwnership, {
      type: "doughnut",
      data: {
        labels: ["Con lote", "Sin lote"],
        datasets: [
          {
            data: [summary.withLot, summary.withoutLot],
            backgroundColor: ["#ea6909", "#10223b"],
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom"
          }
        }
      }
    });
  }

  function destroyCharts() {
    Object.values(state.charts).forEach((chart) => {
      if (chart && typeof chart.destroy === "function") chart.destroy();
    });
    state.charts.daily = null;
    state.charts.ownership = null;
  }

  function renderEntriesTable() {
    const filtered = getFilteredEntries();
    elements.visibleCount.textContent = String(filtered.length);

    if (!filtered.length) {
      elements.entriesTableBody.innerHTML = "";
      elements.emptyEntriesState.classList.remove("hidden");
      return;
    }

    elements.emptyEntriesState.classList.add("hidden");
    elements.entriesTableBody.innerHTML = filtered
      .map(
        (entry) => `
          <tr>
            <td>
              <strong class="table-primary">${core.escapeHtml(entry.fullName)}</strong>
              <span class="table-secondary">CI ${core.escapeHtml(entry.ci)}</span>
            </td>
            <td>
              <strong class="table-primary">${core.escapeHtml(entry.phone)}</strong>
              <span class="table-secondary">${core.escapeHtml(entry.email)}</span>
            </td>
            <td>
              <span class="status-badge ${entry.hasLot ? "yes" : "no"}">${entry.hasLot ? "Con lote" : "Sin lote"}</span>
            </td>
            <td>${core.escapeHtml(core.formatDateTime(entry.createdAt))}</td>
            <td>
              <div class="row-actions">
                <button class="delete-btn" type="button" data-delete-id="${core.escapeHtml(entry.id)}">Eliminar</button>
              </div>
            </td>
          </tr>
        `
      )
      .join("");
  }

  function renderRafflePoolInfo() {
    const settings = getRaffleSettings();
    const eligible = getRafflePool(state.entries, state.draws, settings);
    const requested = settings.winnerCount + settings.reserveCount;

    elements.rafflePoolInfo.innerHTML = `
      <div class="pool-grid">
        <article class="pool-stat">
          <span>Participantes disponibles</span>
          <strong>${core.escapeHtml(String(eligible.length))}</strong>
        </article>
        <article class="pool-stat">
          <span>Ganadores solicitados</span>
          <strong>${core.escapeHtml(String(settings.winnerCount))}</strong>
        </article>
        <article class="pool-stat">
          <span>Suplentes solicitados</span>
          <strong>${core.escapeHtml(String(settings.reserveCount))}</strong>
        </article>
        <article class="pool-stat">
          <span>Total a seleccionar</span>
          <strong>${core.escapeHtml(String(requested))}</strong>
        </article>
      </div>
    `;
  }

  function renderLatestDraw() {
    const latest = state.lastDrawSnapshot || buildLatestDrawSnapshot();
    if (!latest) {
      elements.latestDrawResult.className = "empty-state";
      elements.latestDrawResult.textContent = "Aun no se realizaron sorteos.";
      elements.raffleResults.innerHTML = `<div class="empty-state">Todavia no hay resultados guardados.</div>`;
      return;
    }

    const block = renderDrawResultBlock(latest, false);
    elements.latestDrawResult.className = "";
    elements.latestDrawResult.innerHTML = block;
    elements.raffleResults.innerHTML = renderDrawResultBlock(latest, true);
  }

  function renderDrawHistory() {
    if (!state.draws.length) {
      elements.drawHistory.innerHTML = `<div class="empty-state">Todavia no hay sorteos guardados.</div>`;
      return;
    }

    elements.drawHistory.innerHTML = state.draws
      .map((draw) => {
        const winners = resolveEntriesByIds(draw.winnerIds);
        const reserves = resolveEntriesByIds(draw.reserveIds);
        return `
          <article class="history-item">
            <div>
              <strong>${core.escapeHtml(draw.title || "Sorteo Aurora")}</strong>
              <span>${core.escapeHtml(core.formatDateTime(draw.createdAt))}</span>
              <small>${core.escapeHtml(draw.notes || "Sin notas.")}</small>
            </div>
            <div class="activity-tag">${core.escapeHtml(`${winners.length} ganador(es)`)} | ${core.escapeHtml(`${reserves.length} suplente(s)`)}</div>
          </article>
        `;
      })
      .join("");
  }

  async function copyLatestResult() {
    const latest = state.lastDrawSnapshot || buildLatestDrawSnapshot();
    if (!latest) {
      showNotice(elements.raffleNotice, "Todavia no hay un sorteo para copiar.", "error");
      return;
    }

    const text = buildDrawCopyText(latest);
    try {
      await navigator.clipboard.writeText(text);
      showNotice(elements.raffleNotice, "Resultado copiado al portapapeles.", "success");
    } catch (error) {
      showNotice(elements.raffleNotice, "No se pudo copiar el resultado.", "error");
    }
  }

  function exportVisibleCsv() {
    const rows = getFilteredEntries().map((entry) => ({
      nombre: entry.fullName,
      cedula: entry.ci,
      telefono: entry.phone,
      correo: entry.email,
      lote: entry.hasLot ? "Con lote" : "Sin lote",
      fecha: core.formatDateTime(entry.createdAt)
    }));

    core.downloadFile(core.convertRowsToCsv(rows), buildFilename("registros", "csv"), "text/csv;charset=utf-8");
  }

  function exportExcelLike() {
    const rows = getFilteredEntries().map((entry) => ({
      Nombre: entry.fullName,
      Cedula: entry.ci,
      Telefono: entry.phone,
      Correo: entry.email,
      Lote: entry.hasLot ? "Con lote" : "Sin lote",
      Fecha: core.formatDateTime(entry.createdAt)
    }));

    const html = buildTableDocument("Aurora Sorteo - Registros", rows);
    core.downloadFile(html, buildFilename("registros", "xls"), "application/vnd.ms-excel");
  }

  async function exportPdfReport() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      window.alert("La libreria PDF aun no esta disponible. Recarga la pagina e intenta de nuevo.");
      return;
    }

    const rows = getFilteredEntries();
    const summary = buildSummary(filterEntriesByPreset(state.entries, state.analyticsPeriod), state.draws);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    let cursorY = 48;

    const logo = await core.getBrandLogoPngDataUrl();
    if (logo) {
      try {
        doc.addImage(logo, "PNG", 40, 28, 140, 42);
      } catch (error) {
        // Si el logo falla, el informe igual se exporta.
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Informe Aurora Sorteo", pageWidth - 40, 48, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generado: ${core.formatDateTime(new Date().toISOString())}`, pageWidth - 40, 66, { align: "right" });

    cursorY = 96;
    doc.setFontSize(11);
    doc.text(`Periodo: ${getPeriodLabel(state.analyticsPeriod)}`, 40, cursorY);
    doc.text(`Registros visibles: ${rows.length}`, 40, cursorY + 16);
    doc.text(`Con lote: ${summary.withLot} | Sin lote: ${summary.withoutLot}`, 40, cursorY + 32);
    doc.text(`Sorteos guardados: ${state.draws.length}`, 40, cursorY + 48);

    doc.autoTable({
      startY: cursorY + 70,
      head: [["Nombre", "Cedula", "Telefono", "Correo", "Lote", "Fecha"]],
      body: rows.map((entry) => [
        entry.fullName,
        entry.ci,
        entry.phone,
        entry.email,
        entry.hasLot ? "Con lote" : "Sin lote",
        core.formatDateTime(entry.createdAt)
      ]),
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 6
      },
      headStyles: {
        fillColor: [234, 105, 9]
      },
      alternateRowStyles: {
        fillColor: [248, 244, 238]
      }
    });

    doc.save(buildFilename("informe", "pdf"));
  }

  function exportTxtReport() {
    const summary = buildSummary(filterEntriesByPreset(state.entries, state.analyticsPeriod), state.draws);
    const rows = getFilteredEntries();
    const lines = [
      "AURORA SORTEO - INFORME",
      `Fecha de exportacion: ${core.formatDateTime(new Date().toISOString())}`,
      `Periodo analizado: ${getPeriodLabel(state.analyticsPeriod)}`,
      `Registros visibles: ${rows.length}`,
      `Con lote: ${summary.withLot}`,
      `Sin lote: ${summary.withoutLot}`,
      `Sorteos guardados: ${state.draws.length}`,
      "",
      "DETALLE DE REGISTROS",
      ...rows.map(
        (entry, index) =>
          `${index + 1}. ${entry.fullName} | CI ${entry.ci} | ${entry.phone} | ${entry.email} | ${entry.hasLot ? "Con lote" : "Sin lote"} | ${core.formatDateTime(entry.createdAt)}`
      )
    ];

    core.downloadFile(lines.join("\r\n"), buildFilename("informe", "txt"), "text/plain;charset=utf-8");
  }

  function exportHtmlReport() {
    const summary = buildSummary(filterEntriesByPreset(state.entries, state.analyticsPeriod), state.draws);
    const rows = getFilteredEntries().map((entry) => ({
      Nombre: entry.fullName,
      Cedula: entry.ci,
      Telefono: entry.phone,
      Correo: entry.email,
      Lote: entry.hasLot ? "Con lote" : "Sin lote",
      Fecha: core.formatDateTime(entry.createdAt)
    }));

    const extra = `
      <section>
        <h2>Resumen</h2>
        <ul>
          <li>Total visible: ${core.escapeHtml(String(rows.length))}</li>
          <li>Con lote: ${core.escapeHtml(String(summary.withLot))}</li>
          <li>Sin lote: ${core.escapeHtml(String(summary.withoutLot))}</li>
          <li>Sorteos guardados: ${core.escapeHtml(String(state.draws.length))}</li>
        </ul>
      </section>
    `;

    const html = buildTableDocument("Aurora Sorteo - Informe HTML", rows, extra);
    core.downloadFile(html, buildFilename("informe", "html"), "text/html;charset=utf-8");
  }

  function exportJson() {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        entries: state.entries,
        draws: state.draws,
        activity: state.activity
      },
      null,
      2
    );
    core.downloadFile(payload, buildFilename("backup", "json"), "application/json");
  }

  function buildTableDocument(title, rows, extraContent = "") {
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    const thead = headers.length
      ? `<tr>${headers.map((header) => `<th>${core.escapeHtml(header)}</th>`).join("")}</tr>`
      : "";
    const tbody = rows.length
      ? rows
          .map(
            (row) =>
              `<tr>${headers.map((header) => `<td>${core.escapeHtml(row[header])}</td>`).join("")}</tr>`
          )
          .join("")
      : `<tr><td colspan="${Math.max(headers.length, 1)}">Sin registros</td></tr>`;

    return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>${core.escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #10223b; }
      h1 { margin-bottom: 8px; }
      p, li { line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; margin-top: 18px; }
      th, td { border: 1px solid #cfd7e3; padding: 10px; text-align: left; }
      th { background: #f1e8dc; }
    </style>
  </head>
  <body>
    <img src="${core.DEFAULT_LOGO}" alt="Aurora Inmobiliaria" style="max-width: 240px; height: auto; display: block; margin-bottom: 16px;" />
    <h1>${core.escapeHtml(title)}</h1>
    <p>Generado el ${core.escapeHtml(core.formatDateTime(new Date().toISOString()))}</p>
    ${extraContent}
    <table>
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
    </table>
  </body>
</html>`;
  }

  function buildFilename(base, extension) {
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0")
    ].join("-");
    return `aurora-${base}-${stamp}.${extension}`;
  }

  function getFilteredEntries() {
    const search = String(elements.entriesSearch.value || "").trim().toLowerCase();
    const lotFilter = elements.lotFilter.value;
    const dateFilter = elements.tableDateFilter.value;
    const sort = elements.tableSort.value;

    let filtered = state.entries.filter((entry) => {
      const haystack = `${entry.fullName} ${entry.ci} ${entry.phone} ${entry.email}`.toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (lotFilter === "with" && !entry.hasLot) return false;
      if (lotFilter === "without" && entry.hasLot) return false;
      if (!matchesDatePreset(entry.createdAt, dateFilter)) return false;
      return true;
    });

    filtered = filtered.slice().sort((left, right) => {
      if (sort === "oldest") return new Date(left.createdAt) - new Date(right.createdAt);
      if (sort === "name") return left.fullName.localeCompare(right.fullName, "es");
      return new Date(right.createdAt) - new Date(left.createdAt);
    });

    return filtered;
  }

  function getRaffleSettings() {
    return {
      filter: elements.raffleOwnershipFilter.value,
      winnerCount: Math.max(1, Number.parseInt(elements.raffleWinnerCount.value || "1", 10)),
      reserveCount: Math.max(0, Number.parseInt(elements.raffleReserveCount.value || "0", 10)),
      excludePrevious: elements.raffleExcludePrevious.checked
    };
  }

  function getRafflePool(entries, draws, settings) {
    const previousIds = new Set();
    if (settings.excludePrevious) {
      draws.forEach((draw) => {
        (draw.winnerIds || []).forEach((id) => previousIds.add(id));
        (draw.reserveIds || []).forEach((id) => previousIds.add(id));
      });
    }

    return entries.filter((entry) => {
      if (settings.filter === "with" && !entry.hasLot) return false;
      if (settings.filter === "without" && entry.hasLot) return false;
      if (previousIds.has(entry.id)) return false;
      return true;
    });
  }

  function buildSummary(entries, draws) {
    const today = startOfDay(new Date());
    const sevenDaysAgo = addDays(today, -6);
    const dayMap = new Map();
    const domainMap = new Map();
    const prefixMap = new Map();

    entries.forEach((entry) => {
      const date = new Date(entry.createdAt);
      if (Number.isNaN(date.getTime())) return;
      const key = toDayKey(date);
      dayMap.set(key, (dayMap.get(key) || 0) + 1);
      const domain = extractEmailDomain(entry.email);
      const prefix = extractPhonePrefix(entry.phone);
      if (domain) domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
      if (prefix) prefixMap.set(prefix, (prefixMap.get(prefix) || 0) + 1);
    });

    const withLot = entries.filter((entry) => entry.hasLot).length;
    const withoutLot = entries.length - withLot;
    const selectedIds = new Set();
    draws.forEach((draw) => {
      (draw.winnerIds || []).forEach((id) => selectedIds.add(id));
      (draw.reserveIds || []).forEach((id) => selectedIds.add(id));
    });

    const dayEntries = Array.from(dayMap.entries()).sort((left, right) => left[0].localeCompare(right[0]));
    const topDomains = toTopItems(domainMap);
    const topPhonePrefixes = toTopItems(prefixMap);
    const latestEntry = entries[0] || null;
    const todayCount = entries.filter((entry) => isSameDay(entry.createdAt, today)).length;
    const last7DaysCount = entries.filter((entry) => {
      const date = new Date(entry.createdAt);
      return !Number.isNaN(date.getTime()) && date >= sevenDaysAgo;
    }).length;
    const peakDay = dayEntries.slice().sort((left, right) => right[1] - left[1])[0] || null;
    const activeDays = dayEntries.length || 1;

    return {
      total: entries.length,
      withLot,
      withoutLot,
      withLotPercent: entries.length ? Math.round((withLot / entries.length) * 100) : 0,
      withoutLotPercent: entries.length ? Math.round((withoutLot / entries.length) * 100) : 0,
      latestEntry,
      todayCount,
      last7DaysCount,
      drawCount: draws.length,
      uniqueSelectedCount: selectedIds.size,
      availableForFreshDraw: Math.max(0, entries.length - selectedIds.size),
      dailyLabels: dayEntries.map(([key]) => key.slice(5)),
      dailyCounts: dayEntries.map(([, count]) => count),
      topDomains,
      topPhonePrefixes,
      peakDayLabel: peakDay ? peakDay[0] : "Sin datos",
      peakDayCount: peakDay ? peakDay[1] : 0,
      activeDays,
      averagePerActiveDay: entries.length ? (entries.length / activeDays).toFixed(1) : "0.0"
    };
  }

  function buildQualityReport(entries) {
    const duplicatePhones = buildDuplicateGroups(entries, "phone", (value) => value);
    const duplicateEmails = buildDuplicateGroups(entries, "email", (value) => String(value).toLowerCase());
    const duplicateNames = buildDuplicateGroups(entries, "fullName", (value) => String(value).toLowerCase());

    return {
      duplicatePhones,
      duplicateEmails,
      duplicateNames,
      duplicatePhoneCount: duplicatePhones.length,
      duplicateEmailCount: duplicateEmails.length,
      duplicateNameCount: duplicateNames.length
    };
  }

  function buildDuplicateGroups(entries, key, transform) {
    const groups = new Map();
    entries.forEach((entry) => {
      const raw = String(entry[key] || "");
      if (!raw) return;
      const value = transform(raw);
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(entry.fullName);
    });

    return Array.from(groups.entries())
      .filter(([, group]) => group.length > 1)
      .sort((left, right) => right[1].length - left[1].length)
      .map(([value, names]) => ({
        value,
        names,
        count: names.length
      }));
  }

  function renderDrawResultBlock(snapshot, darkTheme) {
    const winners = snapshot.winners || resolveEntriesByIds(snapshot.draw?.winnerIds || []);
    const reserves = snapshot.reserves || resolveEntriesByIds(snapshot.draw?.reserveIds || []);
    const wrapperClass = darkTheme ? "winner-card" : "surface winner-card";

    const sections = [
      { title: "Ganadores", items: winners, kind: "winner" },
      { title: "Suplentes", items: reserves, kind: "reserve" }
    ];

    return sections
      .map(
        (section) => `
          <div>
            <span class="winner-group-title">${core.escapeHtml(section.title)}</span>
            ${
              section.items.length
                ? section.items
                    .map(
                      (item, index) => `
                        <article class="${wrapperClass}">
                          <div class="winner-rank">${section.kind === "winner" ? `#${index + 1}` : `S${index + 1}`}</div>
                          <strong>${core.escapeHtml(item.fullName)}</strong>
                          <span>CI ${core.escapeHtml(item.ci)}</span>
                          <small>${core.escapeHtml(item.phone)} | ${core.escapeHtml(item.email)}</small>
                        </article>
                      `
                    )
                    .join("")
                : `<div class="empty-state">Sin ${core.escapeHtml(section.title.toLowerCase())}.</div>`
            }
          </div>
        `
      )
      .join("");
  }

  function buildLatestDrawSnapshot() {
    const latestDraw = state.draws[0];
    if (!latestDraw) return null;
    return {
      draw: latestDraw,
      winners: resolveEntriesByIds(latestDraw.winnerIds),
      reserves: resolveEntriesByIds(latestDraw.reserveIds)
    };
  }

  function resolveEntriesByIds(ids) {
    return (Array.isArray(ids) ? ids : [])
      .map((id) => state.entries.find((entry) => entry.id === id))
      .filter(Boolean);
  }

  function buildDrawCopyText(snapshot) {
    const draw = snapshot.draw || {};
    const winners = snapshot.winners || [];
    const reserves = snapshot.reserves || [];
    return [
      draw.title || "Sorteo Aurora",
      `Fecha: ${core.formatDateTime(draw.createdAt)}`,
      "",
      "Ganadores:",
      ...winners.map((entry, index) => `${index + 1}. ${entry.fullName} | CI ${entry.ci} | ${entry.phone}`),
      "",
      "Suplentes:",
      ...reserves.map((entry, index) => `${index + 1}. ${entry.fullName} | CI ${entry.ci} | ${entry.phone}`)
    ].join("\n");
  }

  function toTopItems(map) {
    return Array.from(map.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));
  }

  function extractEmailDomain(email) {
    const value = String(email || "");
    return value.includes("@") ? value.split("@")[1].toLowerCase() : "";
  }

  function extractPhonePrefix(phone) {
    return String(phone || "").slice(0, 4);
  }

  function filterEntriesByPreset(entries, preset) {
    if (preset === "all") return entries.slice();
    const now = new Date();
    const today = startOfDay(now);
    const minDate = preset === "today" ? today : addDays(today, preset === "7d" ? -6 : -29);
    return entries.filter((entry) => {
      const date = new Date(entry.createdAt);
      return !Number.isNaN(date.getTime()) && date >= minDate;
    });
  }

  function matchesDatePreset(value, preset) {
    if (preset === "all") return true;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const today = startOfDay(new Date());
    if (preset === "today") return date >= today;
    if (preset === "7d") return date >= addDays(today, -6);
    if (preset === "30d") return date >= addDays(today, -29);
    return true;
  }

  function isSameDay(value, day) {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && toDayKey(date) === toDayKey(day);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function toDayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function getPeriodLabel(period) {
    if (period === "today") return "Solo hoy";
    if (period === "7d") return "Ultimos 7 dias";
    if (period === "30d") return "Ultimos 30 dias";
    return "Toda la base";
  }

  function getActivityLabel(type) {
    return (
      {
        "entry-created": "Nuevo registro",
        "entry-deleted": "Registro eliminado",
        "draw-created": "Sorteo generado"
      }[type] || "Actividad"
    );
  }

  function baseChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    };
  }

  function setRaffleSubmitting(isSubmitting) {
    elements.raffleSubmitBtn.disabled = isSubmitting;
    elements.raffleSubmitBtn.textContent = isSubmitting ? "Sorteando..." : "Realizar sorteo";
  }

  function showDashboard() {
    elements.loginView.classList.add("hidden");
    elements.dashboardView.classList.remove("hidden");
  }

  function showLogin() {
    elements.loginView.classList.remove("hidden");
    elements.dashboardView.classList.add("hidden");
  }

  function showNotice(element, message, type) {
    element.textContent = message;
    element.className = `notice is-visible ${type}`;
  }

  function hideNotice(element) {
    element.textContent = "";
    element.className = "notice";
  }
});
