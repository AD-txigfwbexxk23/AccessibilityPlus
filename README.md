# AccessibilityPlus

AccessibilityPlus turns citizen photos into trustworthy accessibility data.  
Every report now includes:

1. **Automatic location capture** – the web client requests the user’s GPS coordinates via the browser Geolocation API.
2. **AI verification** – images are analyzed with Amazon Rekognition and cross-checked against the description with OpenAI.
3. **Persistent storage in S3** – both the raw photo and the enriched metadata live under the `reports/` prefix in your bucket.
4. **Map-ready feeds** – the API returns the aggregated reports as JSON + GeoJSON so the Leaflet map (or any GIS tool) can render live markers.

## Architecture Overview

```
Browser (HTML + JS)
 ├─ Captures geolocation + photo
 └─ POST /reports (FastAPI)
        │
        ├─ Upload photo → Amazon S3
        ├─ Rekognition.detect_labels(image)
        ├─ GPT compares labels vs. citizen description
        └─ Persist metadata + update reports/index.json in S3

GET /reports/geojson → Leaflet map fetches FeatureCollection for visualization
```

This keeps the workflow serverless-friendly: the FastAPI app can later move into AWS Lambda + API Gateway without code changes, and S3 remains the single source of truth for both media assets and map data.

## Prerequisites

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Used to call GPT for description verification. |
| `OPENAI_MODEL` *(default `gpt-4o-mini`)* | Optional override for the OpenAI model used in validation. |
| `ACCESSIBILITYPLUS_BUCKET` (or `S3_BUCKET_NAME`) | Target S3 bucket for photos + metadata. |
| `AWS_REGION` *(default `us-east-1`)* | Region for S3/Rekognition. |
| `REPORTS_INDEX_KEY` *(optional)* | Override the default `reports/index.json` manifest path. |

Standard AWS credentials (env vars, `~/.aws/credentials`, or AWS SSO) must also be configured locally.

## Running Locally

```bash
pip install -r requirements.txt
# web server
uvicorn server:app --reload
# cli workflow for manual uploads
python main.py
```

- Visit `http://127.0.0.1:8000/` to submit a report with location capture.
- Visit `http://127.0.0.1:8000/map` to see the Leaflet-based accessibility map.
- Use `python main.py` if you prefer the CLI helper to upload a local image directly to S3.

## S3 Object Layout

```
reports/
  {report_id}/
    photo.jpg
    metadata.json
  index.json   ← append-only manifest used by /reports + /reports/geojson
```

Each `metadata.json` bundle contains the image description, lat/lon, Rekognition labels, GPT verdict, and helpful URLs (public + pre-signed) so downstream tooling can retrieve the supporting evidence.
