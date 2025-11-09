const statusEl = document.getElementById("status");
const form = document.getElementById("report-form");
const locateBtn = document.getElementById("locate-btn");
const latInput = document.getElementById("latitude");
const lonInput = document.getElementById("longitude");
const locationDisplay = document.getElementById("location-display");
const fileInput = document.querySelector(".file-input");
const fileSelectedRow = document.querySelector("[data-file-selected]");
const fileNameEl = document.querySelector("[data-file-name]");
let locationReady = false;

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.classList.remove("success", "error");
  if (type === "success") {
    statusEl.classList.add("success");
  } else if (type === "error") {
    statusEl.classList.add("error");
  }
}

function setLocationMessage(message, type = "info") {
  locationDisplay.textContent = message;
  locationDisplay.classList.remove("ready", "error");
  if (type === "success") {
    locationDisplay.classList.add("ready");
  } else if (type === "error") {
    locationDisplay.classList.add("error");
  }
}

function handleLocationSuccess(latitude, longitude) {
  const lat = latitude.toFixed(6);
  const lon = longitude.toFixed(6);
  latInput.value = lat;
  lonInput.value = lon;
  locationReady = true;
  setLocationMessage(`Current location locked: ${lat}, ${lon}`, "success");
  setStatus("Location captured. You can submit a report or jump to the live map.");
  locateBtn.disabled = false;
}

function handleLocationError(message, silent = false) {
  locationReady = false;
  latInput.value = "";
  lonInput.value = "";
  const errorText = message || "Unable to fetch location.";
  setLocationMessage(errorText, "error");
  if (!silent) {
    setStatus(errorText, "error");
  }
  locateBtn.disabled = false;
}

function requestLocation({ silent = false } = {}) {
  if (!navigator.geolocation) {
    handleLocationError("Geolocation is not supported by this browser.");
    return;
  }

  locateBtn.disabled = true;
  if (!silent) {
    setStatus("Requesting current location…");
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      handleLocationSuccess(latitude, longitude);
    },
    (error) => {
      handleLocationError(`Unable to fetch location: ${error.message}`, silent);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}

locateBtn?.addEventListener("click", () => requestLocation());
requestLocation({ silent: true });

fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file && fileNameEl && fileSelectedRow) {
    fileNameEl.textContent = `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB`;
    fileSelectedRow.hidden = false;
  } else if (fileSelectedRow) {
    fileSelectedRow.hidden = true;
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!locationReady) {
    setStatus("We need your current location before submitting.", "error");
    return;
  }

  const formData = new FormData(form);
  setStatus("Uploading report…");

  try {
    const response = await fetch("/reports", {
      method: "POST",
      body: formData,
    });

    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const detail = data?.detail || raw || "Upload failed";
      throw new Error(detail);
    }

    setStatus(
      `Report saved. AI confidence: ${data?.ai_verdict?.confidence ?? "n/a"}%`,
      "success"
    );
    form.reset();
    requestLocation({ silent: true });
  } catch (error) {
    setStatus(error.message, "error");
  }
});
