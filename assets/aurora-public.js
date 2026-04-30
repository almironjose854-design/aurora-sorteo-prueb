document.addEventListener("DOMContentLoaded", () => {
  const core = window.AuroraCore;

  const elements = {
    form: document.getElementById("clientForm"),
    formNotice: document.getElementById("formNotice"),
    submitBtn: document.getElementById("submitBtn"),
    companyWebsite: document.getElementById("companyWebsite"),
    fullName: document.getElementById("fullName"),
    ci: document.getElementById("ci"),
    phone: document.getElementById("phone"),
    email: document.getElementById("email"),
    consent: document.getElementById("consent"),
    hasLotYes: document.getElementById("hasLotYes"),
    hasLotNo: document.getElementById("hasLotNo"),
    errorTargets: Array.from(document.querySelectorAll("[data-error-for]")),
    fieldBlocks: Array.from(document.querySelectorAll("[data-field]"))
  };

  core.applyBrandImages();
  core.applyAppLinks();
  elements.fullName.focus();

  elements.form.addEventListener("submit", handleSubmit);
  elements.ci.addEventListener("input", () => {
    elements.ci.value = core.normalizeDigits(elements.ci.value);
    clearFieldError("ci");
  });
  elements.ci.addEventListener("blur", checkExistingCi);
  elements.phone.addEventListener("input", () => {
    elements.phone.value = core.normalizePhone(elements.phone.value);
    clearFieldError("phone");
  });
  elements.email.addEventListener("input", () => clearFieldError("email"));
  elements.fullName.addEventListener("input", () => clearFieldError("fullName"));
  elements.consent.addEventListener("change", () => clearFieldError("consent"));
  elements.hasLotYes.addEventListener("change", () => clearFieldError("hasLot"));
  elements.hasLotNo.addEventListener("change", () => clearFieldError("hasLot"));

  async function handleSubmit(event) {
    event.preventDefault();
    clearAllFieldErrors();
    hideNotice();

    const payload = getFormData();
    const validation = core.validateEntryData(payload);

    if (!validation.valid) {
      showFieldError(validation.field, validation.message);
      showNotice(validation.message, "error");
      focusField(validation.field);
      return;
    }

    setSubmitting(true);

    try {
      await core.api.submitPublicEntry(payload);
      elements.form.reset();
      showNotice("Registro guardado correctamente. Tus datos ya quedaron almacenados.", "success");
      elements.fullName.focus();
    } catch (error) {
      const message = error?.payload?.message || error?.message || "No se pudo guardar el registro.";
      const field = error?.payload?.field || null;

      if (field) {
        showFieldError(field, message);
        focusField(field);
      }

      showNotice(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function checkExistingCi() {
    const ci = core.normalizeDigits(elements.ci.value);
    if (!ci) return;

    try {
      const response = await core.api.checkEntryCi(ci);
      if (response.exists) {
        showFieldError("ci", `La cedula ${ci} ya fue registrada.`);
      }
    } catch (error) {
      showNotice("No se pudo validar la cedula en este momento.", "error");
    }
  }

  function getFormData() {
    return {
      companyWebsite: String(elements.companyWebsite.value || "").trim(),
      fullName: core.normalizeName(elements.fullName.value),
      ci: core.normalizeDigits(elements.ci.value),
      phone: core.normalizePhone(elements.phone.value),
      email: core.normalizeEmail(elements.email.value),
      hasLot: elements.hasLotYes.checked ? true : elements.hasLotNo.checked ? false : null,
      consent: elements.consent.checked
    };
  }

  function setSubmitting(isSubmitting) {
    elements.submitBtn.disabled = isSubmitting;
    elements.submitBtn.textContent = isSubmitting ? "Guardando..." : "Guardar registro";
  }

  function getErrorTarget(fieldName) {
    return elements.errorTargets.find((element) => element.dataset.errorFor === fieldName) || null;
  }

  function getFieldBlock(fieldName) {
    return elements.fieldBlocks.find((element) => element.dataset.field === fieldName) || null;
  }

  function showFieldError(fieldName, message) {
    if (!fieldName) return;
    const errorTarget = getErrorTarget(fieldName);
    const fieldBlock = getFieldBlock(fieldName);
    if (errorTarget) errorTarget.textContent = message;
    if (fieldBlock) fieldBlock.classList.add("is-invalid");
  }

  function clearFieldError(fieldName) {
    const errorTarget = getErrorTarget(fieldName);
    const fieldBlock = getFieldBlock(fieldName);
    if (errorTarget) errorTarget.textContent = "";
    if (fieldBlock) fieldBlock.classList.remove("is-invalid");
  }

  function clearAllFieldErrors() {
    elements.errorTargets.forEach((element) => {
      element.textContent = "";
    });
    elements.fieldBlocks.forEach((element) => {
      element.classList.remove("is-invalid");
    });
  }

  function focusField(fieldName) {
    const targetMap = {
      fullName: elements.fullName,
      ci: elements.ci,
      phone: elements.phone,
      email: elements.email,
      consent: elements.consent,
      hasLot: elements.hasLotYes
    };

    const target = targetMap[fieldName];
    if (target && typeof target.focus === "function") {
      target.focus();
    }
  }

  function showNotice(message, type) {
    elements.formNotice.textContent = message;
    elements.formNotice.className = `notice is-visible ${type}`;
  }

  function hideNotice() {
    elements.formNotice.textContent = "";
    elements.formNotice.className = "notice";
  }
});
