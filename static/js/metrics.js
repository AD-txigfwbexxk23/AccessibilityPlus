const metricsTargetsPresent = document.querySelector("[data-stat]") || document.querySelector("[data-progress]");

if (metricsTargetsPresent) {
  fetch("/reports")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Unable to load metrics");
      }
      return response.json();
    })
    .then((reports) => {
      const stats = computeMetrics(Array.isArray(reports) ? reports : []);
      applyMetrics(stats);
    })
    .catch((error) => {
      console.warn(error);
    });
}

function computeMetrics(reports) {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const stats = {
    totalReports: reports.length,
    sumConfidence: 0,
    confidenceCount: 0,
    highConfidenceCount: 0,
    last24h: 0,
    last7d: 0,
    mismatchCount: 0,
    latestReportDate: null,
  };

  for (const report of reports) {
    const createdAt = report?.created_at ? new Date(report.created_at) : null;
    const confidence = Number.parseFloat(report?.ai_verdict?.confidence);
    const mismatches = Array.isArray(report?.ai_verdict?.mismatches)
      ? report.ai_verdict.mismatches
      : [];

    if (Number.isFinite(confidence)) {
      stats.sumConfidence += confidence;
      stats.confidenceCount += 1;
      if (confidence >= 80) {
        stats.highConfidenceCount += 1;
      }
    }

    if (createdAt && !Number.isNaN(createdAt.getTime())) {
      if (!stats.latestReportDate || createdAt > stats.latestReportDate) {
        stats.latestReportDate = createdAt;
      }

      const diff = now - createdAt.getTime();
      if (diff <= DAY) {
        stats.last24h += 1;
      }
      if (diff <= 7 * DAY) {
        stats.last7d += 1;
      }
    }

    if (mismatches.length > 0) {
      stats.mismatchCount += 1;
    }
  }

  stats.avgConfidence = stats.confidenceCount
    ? stats.sumConfidence / stats.confidenceCount
    : null;

  stats.highConfidenceShare = stats.confidenceCount
    ? (stats.highConfidenceCount / stats.confidenceCount) * 100
    : null;

  return stats;
}

function applyMetrics(stats) {
  setStatText("reports-count", formatNumber(stats.totalReports));
  setStatText("avg-confidence", formatPercent(stats.avgConfidence));
  setStatText("reports-24h", formatNumber(stats.last24h));

  const lastUpdated = formatRelative(stats.latestReportDate);
  setStatText("last-updated", lastUpdated.display, { title: lastUpdated.title });

  setStatText("mismatch-count", formatNumber(stats.mismatchCount));
  setStatText("high-confidence-share", formatPercent(stats.highConfidenceShare));

  const avgProgress = Number.isFinite(stats.avgConfidence)
    ? clamp(stats.avgConfidence / 100, 0, 1)
    : 0;
  setProgress("avg-confidence", avgProgress);

  const freshRatio =
    stats.totalReports > 0 ? clamp(stats.last24h / stats.totalReports, 0, 1) : 0;
  setProgress("reports-24h-ratio", freshRatio);
}

function setStatText(statName, value, options = {}) {
  const elements = document.querySelectorAll(`[data-stat="${statName}"]`);
  if (!elements.length) {
    return;
  }

  const displayValue = value ?? "—";
  for (const element of elements) {
    element.textContent = displayValue;
    if (options.title && element instanceof HTMLElement) {
      element.title = options.title;
    }
  }
}

function setProgress(statName, ratio) {
  document
    .querySelectorAll(`[data-progress="${statName}"]`)
    .forEach((element) => {
      element.style.setProperty("--progress", ratio);
    });
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) {
    return "0";
  }
  return Number(value).toLocaleString();
}

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) {
    return "—";
  }
  return `${Math.round(value)}%`;
}

function formatRelative(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return { display: "—", title: "" };
  }

  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const safeSeconds = Math.max(seconds, 0);
  const minutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(safeSeconds / 3600);
  const days = Math.floor(safeSeconds / 86400);

  let label = "";
  if (safeSeconds < 60) {
    label = `${safeSeconds}s ago`;
  } else if (minutes < 60) {
    label = `${minutes}m ago`;
  } else if (hours < 24) {
    label = `${hours}h ago`;
  } else if (days < 7) {
    label = `${days}d ago`;
  } else {
    label = date.toLocaleDateString();
  }

  return { display: label, title: date.toLocaleString() };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

