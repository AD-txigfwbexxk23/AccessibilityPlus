const statusBox = document.getElementById("map-status");
const map = L.map("map").setView([51.0447, -114.0719], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  maxZoom: 19,
}).addTo(map);

function setMapStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.style.color = isError ? "#b91c1c" : "#0f172a";
}

function buildPopup(properties) {
  const imageLink = properties.image_url
    ? `<p><a href="${properties.image_url}" target="_blank" rel="noopener">View supporting image</a></p>`
    : "";

  return `
    <h3>${properties.description ?? "Accessibility feature"}</h3>
    <p><strong>Detected labels:</strong> ${(properties.labels || []).join(", ") || "n/a"}</p>
    <p><strong>AI verdict:</strong> ${properties.match_summary ?? "pending"} (confidence: ${
      properties.confidence ?? "n/a"
    }%)</p>
    ${imageLink}
    <p><small>Report ID: ${properties.report_id}</small></p>
  `;
}

async function loadReports() {
  try {
    setMapStatus("Loading reports…");
    const response = await fetch("/reports/geojson");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Unable to fetch data");
    }

    if (!data.features?.length) {
      setMapStatus("No reports available yet. Submit one to populate the map.");
      return;
    }

    const layer = L.geoJSON(data, {
      onEachFeature: (feature, layer) => {
        layer.bindPopup(buildPopup(feature.properties));
      },
    }).addTo(map);

    map.fitBounds(layer.getBounds(), { padding: [30, 30] });
    setMapStatus(`${data.features.length} report(s) loaded.`);
  } catch (error) {
    setMapStatus(error.message, true);
  }
}

loadReports();
