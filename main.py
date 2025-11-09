import os
import json
import uuid
import boto3
from openai import OpenAI
from dotenv import load_dotenv
from datetime import datetime

# ---------------------------
# CONFIG
# ---------------------------
region = "us-east-1"
bucket_name = "accessibility-audit-uploads"  # your bucket

load_dotenv()
openai_key = os.getenv("OPENAI_API_KEY")
if not openai_key:
    raise Exception("Missing OPENAI_API_KEY")

client = OpenAI(api_key=openai_key)

s3 = boto3.client("s3", region_name=region)
rekognition = boto3.client("rekognition", region_name=region)


# ---------------------------
# 1. LOAD LOCAL IMAGE
# ---------------------------
def load_image(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"Image '{path}' not found")
    with open(path, "rb") as f:
        return f.read()


# ---------------------------
# 2. RUN REKOGNITION ON IMAGE BYTES
# ---------------------------
def analyze_with_rekognition(image_bytes):
    response = rekognition.detect_labels(
        Image={"Bytes": image_bytes},
        MaxLabels=10,
        MinConfidence=75
    )
    return [label["Name"] for label in response["Labels"]]


# ---------------------------
# 3. RUN GPT VALIDATION & SCORING
# ---------------------------
def analyze_with_gpt(feature_name, user_desc, labels):
    prompt = f"""
You evaluate whether an accessibility feature exists in an image.

Detected visual labels:
{labels}

Claimed feature: "{feature_name}"
User description: "{user_desc}"

Return ONLY JSON:
{{
  "verified": true/false,
  "confidence": number (0-100),
  "reason": "short explanation"
}}
"""

    result = client.responses.create(
        model="gpt-4.1-mini",
        input=prompt
    )

    return json.loads(result.output_text)


# ---------------------------
# 4. UPLOAD TO S3 WITH METADATA
# ---------------------------
def upload_to_s3(image_bytes, labels, gpt_data, location, feature_name, description, image_path):
    filename = os.path.basename(image_path)
    key = f"uploads/{filename}"

    # Clean & size-limit metadata fields
    metadata = {
        "location": location[:200],
        "feature_name": feature_name[:200],
        "description": description[:400],
        "labels": json.dumps(labels, separators=(",", ":"))[:600],  # keep under safe limit
        "verified": str(gpt_data.get("verified", False)).lower(),
        "confidence": str(gpt_data.get("confidence", 0)),
        "reason": gpt_data.get("reason", "")[:400],  # truncate to avoid overflow
        "timestamp": datetime.utcnow().isoformat()
    }

    s3.put_object(
        Bucket=bucket_name,
        Key=key,
        Body=image_bytes,
        Metadata=metadata
    )

    print("\n✅ Uploaded to S3 with metadata:")
    print("s3://", bucket_name, "/", key, sep="")
    print(json.dumps(metadata, indent=2))

    return key


# ---------------------------
# MAIN WORKFLOW
# ---------------------------
if __name__ == "__main__":

    print("Enter image file path:")
    image_path = input("> ")

    if not os.path.exists(image_path):
        print(f"❌ ERROR: File '{image_path}' not found.")
        exit(1)

    print("Enter location name (for now just text):")
    location = input("> ")

    print("Enter accessibility feature name:")
    feature_name = input("> ")

    print("Enter short description:")
    description = input("> ")

    print("\n🔄 Loading image...")
    image_bytes = load_image(image_path)

    print("🔍 Running Rekognition...")
    labels = analyze_with_rekognition(image_bytes)
    print("Detected:", labels)

    print("\n🤖 Running GPT reasoning...")
    gpt_result = analyze_with_gpt(feature_name, description, labels)
    print("GPT Result:", gpt_result)

    print("\n☁️ Uploading to S3 with metadata...")
    s3_key = upload_to_s3(
        image_bytes,
        labels,
        gpt_result,
        location,
        feature_name,
        description,
        image_path
    )

    print("\n🎉 DONE!")
