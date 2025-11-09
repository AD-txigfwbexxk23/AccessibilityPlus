import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI

load_dotenv()

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_BUCKET = os.getenv("ACCESSIBILITYPLUS_BUCKET") or os.getenv("S3_BUCKET_NAME")
REPORTS_INDEX_KEY = os.getenv("REPORTS_INDEX_KEY", "reports/index.json")
REKOGNITION_MIN_CONFIDENCE = float(os.getenv("REKOGNITION_MIN_CONFIDENCE", "70"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

if not S3_BUCKET:
    raise RuntimeError("Set ACCESSIBILITYPLUS_BUCKET or S3_BUCKET_NAME for storage.")

if not OPENAI_API_KEY:
    raise RuntimeError("Set OPENAI_API_KEY to enable GPT-based checks.")

s3_client = boto3.client("s3", region_name=AWS_REGION)
rekognition_client = boto3.client("rekognition", region_name=AWS_REGION)
openai_client = OpenAI(api_key=OPENAI_API_KEY)

app = FastAPI(
    title="AccessibilityPlus Reporter",
    description="Capture geotagged accessibility reports, store them in S3, and surface an AI-verified map feed.",
)

STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _read_static_page(filename: str) -> str:
    path = STATIC_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"Missing static asset: {filename}")
    return path.read_text(encoding="utf-8")


def _store_image(report_id: str, upload: UploadFile, data: bytes) -> Dict[str, str]:
    extension = Path(upload.filename or "image").suffix or ".jpg"
    object_key = f"reports/{report_id}/photo{extension}"
    s3_client.put_object(
        Bucket=S3_BUCKET,
        Key=object_key,
        Body=data,
        ContentType=upload.content_type or "image/jpeg",
    )

    public_url = f"https://{S3_BUCKET}.s3.amazonaws.com/{object_key}"
    presigned_url = s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": object_key},
        ExpiresIn=60 * 60 * 24 * 7,
    )

    return {"key": object_key, "public_url": public_url, "presigned_url": presigned_url}


def _detect_labels(image_bytes: bytes) -> List[str]:
    response = rekognition_client.detect_labels(
        Image={"Bytes": image_bytes},
        MaxLabels=15,
        MinConfidence=REKOGNITION_MIN_CONFIDENCE,
    )
    return [label["Name"] for label in response.get("Labels", [])]


def _evaluate_report(labels: List[str], user_description: str) -> Dict[str, Any]:
    prompt = f"""
You receive labels detected by Amazon Rekognition as well as a citizen description of the same image.

Detected labels: {labels}
Citizen description: "{user_description.strip()}"

Compare them and respond with strictly valid JSON:
{{
  "match_summary": "<one sentence on how close they are>",
  "mismatches": ["<list any major discrepancies>"],
  "confidence": <integer 0-100 indicating confidence in the match>
}}
"""

    completion = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You are a JSON-only analyst comparing Rekognition output with a citizen description.",
            },
            {"role": "user", "content": prompt.strip()},
        ],
        response_format={"type": "json_object"},
    )

    raw_text = completion.choices[0].message.content.strip()
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        return {
            "match_summary": raw_text or "Model response could not be parsed.",
            "mismatches": [],
            "confidence": 0,
        }


def _load_report_index() -> List[Dict[str, Any]]:
    try:
        obj = s3_client.get_object(Bucket=S3_BUCKET, Key=REPORTS_INDEX_KEY)
        body = obj["Body"].read()
        return json.loads(body) if body else []
    except s3_client.exceptions.NoSuchKey:
        return []
    except ClientError as exc:
        if exc.response["Error"].get("Code") == "NoSuchKey":
            return []
        raise HTTPException(status_code=500, detail="Unable to load reports manifest.") from exc

def _persist_report(metadata: Dict[str, Any]) -> Dict[str, Any]:
    metadata_key = f"reports/{metadata['report_id']}/metadata.json"
    try:
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=metadata_key,
            Body=json.dumps(metadata).encode("utf-8"),
            ContentType="application/json",
        )

        reports = _load_report_index()
        reports.append(metadata)
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=REPORTS_INDEX_KEY,
            Body=json.dumps(reports, indent=2).encode("utf-8"),
            ContentType="application/json",
        )
        return metadata
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=f"S3 write failed: {exc.response['Error'].get('Message')}") from exc


def _reports_to_geojson(reports: List[Dict[str, Any]]) -> Dict[str, Any]:
    features = []
    for report in reports:
        location = report.get("location") or {}
        lat = location.get("latitude")
        lon = location.get("longitude")
        if lat is None or lon is None:
            continue

        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "report_id": report["report_id"],
                    "description": report["description"],
                    "labels": report.get("rekognition_labels", []),
                    "match_summary": report.get("ai_verdict", {}).get("match_summary"),
                    "confidence": report.get("ai_verdict", {}).get("confidence"),
                    "image_url": report.get("image", {}).get("presigned_url"),
                    "created_at": report.get("created_at"),
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


@app.get("/", response_class=HTMLResponse)
def reporter_page() -> HTMLResponse:
    return HTMLResponse(_read_static_page("report.html"))


@app.get("/map", response_class=HTMLResponse)
def map_page() -> HTMLResponse:
    return HTMLResponse(_read_static_page("map.html"))


@app.get("/reports")
def list_reports() -> JSONResponse:
    reports = _load_report_index()
    return JSONResponse(content=reports)


@app.get("/reports/geojson")
def reports_geojson() -> JSONResponse:
    reports = _load_report_index()
    return JSONResponse(content=_reports_to_geojson(reports))


@app.post("/reports")
async def create_report(
    description: str = Form(..., min_length=5),
    latitude: float = Form(...),
    longitude: float = Form(...),
    image: UploadFile = File(...),
):
    if not image.filename:
        raise HTTPException(status_code=400, detail="Image upload is required.")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    report_id = str(uuid.uuid4())
    uploaded_image = _store_image(report_id, image, image_bytes)
    detected_labels = _detect_labels(image_bytes)
    ai_verdict = _evaluate_report(detected_labels, description)

    metadata = {
        "report_id": report_id,
        "description": description,
        "location": {"latitude": latitude, "longitude": longitude},
        "rekognition_labels": detected_labels,
        "ai_verdict": ai_verdict,
        "image": uploaded_image,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    saved_metadata = _persist_report(metadata)
    return JSONResponse(content=saved_metadata, status_code=201)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )

