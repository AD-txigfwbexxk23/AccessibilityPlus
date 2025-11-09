const statusEl = document.getElementById("status");
const form = document.getElementById("report-form");
const locateBtn = document.getElementById("locate-btn");
const latInput = document.getElementById("latitude");
const lonInput = document.getElementById("longitude");
const locationDisplay = document.getElementById("location-display");
const fileInput = document.querySelector(".file-input");
const fileSelectedRow = document.querySelector("[data-file-selected]");
const fileNameEl = document.querySelector("[data-file-name]");
const submitProgress = document.getElementById("submit-progress");
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
  if (submitProgress) {
    submitProgress.hidden = false;
  }

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
    setTimeout(() => {
      window.location.href = "/map";
    }, 1200);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    if (submitProgress) {
      submitProgress.hidden = true;
    }
  }
});

const teamTrack = document.querySelector("[data-team-track]");
const teamPrev = document.querySelector("[data-team-prev]");
const teamNext = document.querySelector("[data-team-next]");
const TEAM_AUTO_SPEED = 1.2; // pixels per frame
let teamOriginalCount = 0;
let teamSegmentWidth = 0;
let teamAutoFrame = null;
let teamWrapTimer = null;

function getCardScrollAmount() {
  if (!teamTrack) return 0;
  const firstCard = teamTrack.querySelector(".team-member");
  if (!firstCard) return 0;
  const cardWidth = firstCard.getBoundingClientRect().width;
  const gapValue = getComputedStyle(teamTrack).columnGap || getComputedStyle(teamTrack).gap || "0";
  const gap = parseFloat(gapValue) || 0;
  return cardWidth + gap;
}

function updateTeamSegmentWidth() {
  if (!teamTrack || teamOriginalCount <= 0) return;
  const amount = getCardScrollAmount();
  if (!amount) return;
  teamSegmentWidth = amount * teamOriginalCount;
}

function normalizeTeamPosition(force = false) {
  if (!teamTrack || !teamSegmentWidth) return;
  const current = teamTrack.scrollLeft;
  const start = teamSegmentWidth;
  const end = teamSegmentWidth * 2;

  if (current < start) {
    teamTrack.scrollTo({ left: current + teamSegmentWidth, behavior: "auto" });
  } else if (current >= end) {
    teamTrack.scrollTo({ left: current - teamSegmentWidth, behavior: "auto" });
  } else if (force) {
    const clamped = Math.min(end - 1, Math.max(start, current));
    teamTrack.scrollTo({ left: clamped, behavior: "auto" });
  }
}

function scrollTeam(direction, { manual = false } = {}) {
  if (!teamTrack) return;
  if (!teamSegmentWidth) updateTeamSegmentWidth();
  const amount = getCardScrollAmount();
  if (!amount) return;

  stopTeamAutoplay();
  teamTrack.scrollBy({ left: direction * amount, behavior: "smooth" });

  clearTimeout(teamWrapTimer);
  teamWrapTimer = window.setTimeout(() => {
    normalizeTeamPosition();
    if (manual) {
      startTeamAutoplay();
    }
  }, 450);
}

function stopTeamAutoplay() {
  if (teamAutoFrame) {
    cancelAnimationFrame(teamAutoFrame);
    teamAutoFrame = null;
  }
}

function autoplayStep() {
  if (!teamTrack) return;
  if (!teamSegmentWidth) updateTeamSegmentWidth();
  if (!teamSegmentWidth) return;

  teamTrack.scrollLeft += TEAM_AUTO_SPEED;
  normalizeTeamPosition();
  teamAutoFrame = requestAnimationFrame(autoplayStep);
}

function startTeamAutoplay() {
  stopTeamAutoplay();
  teamAutoFrame = requestAnimationFrame(autoplayStep);
}

function restartTeamAutoplay() {
  stopTeamAutoplay();
  startTeamAutoplay();
}

function setupTeamCarousel() {
  if (!teamTrack) return;

  const originals = Array.from(teamTrack.children);
  teamOriginalCount = originals.length;

  if (teamOriginalCount <= 1) {
    updateTeamSegmentWidth();
    return;
  }

  const fragmentStart = document.createDocumentFragment();
  const fragmentEnd = document.createDocumentFragment();

  for (let i = originals.length - 1; i >= 0; i -= 1) {
    const clone = originals[i].cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    fragmentStart.appendChild(clone);
  }

  originals.forEach((card) => {
    const clone = card.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    fragmentEnd.appendChild(clone);
  });

  teamTrack.insertBefore(fragmentStart, teamTrack.firstChild);
  teamTrack.appendChild(fragmentEnd);

  requestAnimationFrame(() => {
    updateTeamSegmentWidth();
    if (teamSegmentWidth) {
      teamTrack.scrollTo({ left: teamSegmentWidth, behavior: "auto" });
      startTeamAutoplay();
    }
  });
}

setupTeamCarousel();

teamPrev?.addEventListener("click", () => scrollTeam(-1, { manual: true }));
teamNext?.addEventListener("click", () => scrollTeam(1, { manual: true }));

teamTrack?.addEventListener(
  "scroll",
  () => {
    clearTimeout(teamWrapTimer);
    teamWrapTimer = window.setTimeout(() => normalizeTeamPosition(), 400);
  },
  { passive: true }
);

teamTrack?.addEventListener("pointerdown", stopTeamAutoplay);
["pointerup", "pointercancel", "mouseleave", "touchend"].forEach((eventName) => {
  teamTrack?.addEventListener(eventName, () => restartTeamAutoplay());
});

window.addEventListener("resize", () => {
  updateTeamSegmentWidth();
  normalizeTeamPosition(true);
  restartTeamAutoplay();
});