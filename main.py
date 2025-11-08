import boto3
from openai import OpenAI
from dotenv import load_dotenv
import os
import sys

# ---------------------------
# 1. AWS SETUP
# ---------------------------

region = "us-east-1"

s3 = boto3.client("s3", region_name=region)
rekognition = boto3.client("rekognition", region_name=region)

bucket_name = "accessibility-audit-uploads"

print("\nListing objects in S3 bucket:")
resp = s3.list_objects_v2(Bucket=bucket_name)

if "Contents" not in resp:
    print("Bucket is empty or you do not have permission.")
    sys.exit(1)

available_keys = [obj["Key"] for obj in resp["Contents"]]
for k in available_keys:
    print(" -", k)

# ---------------------------
# SELECT WHICH IMAGE TO PROCESS
# ---------------------------

# Choose an actual key that exists in your bucket
# (From your output: "ramp.jpg", "ramp (1).jpg", or "ramp.webp")
object_key = "ramp (1).jpg"

if object_key not in available_keys:
    print(f"\nERROR: object_key '{object_key}' not found in bucket.")
    sys.exit(1)

print("\nUsing object key:", object_key)

# ---------------------------
# 2. DOWNLOAD FROM S3
# ---------------------------

try:
    s3_obj = s3.get_object(Bucket=bucket_name, Key=object_key)
    image_bytes = s3_obj["Body"].read()
    print("\nSuccessfully retrieved image from S3.")
    print("Image size:", len(image_bytes), "bytes")
except Exception as e:
    print("\nERROR retrieving S3 object:", e)
    sys.exit(1)

# Save a local debug copy
local_filename = "downloaded_debug.jpg"
with open(local_filename, "wb") as f:
    f.write(image_bytes)

print("Saved local copy:", local_filename)

# ---------------------------
# 3. REKOGNITION
# ---------------------------

print("\nCalling Rekognition...")

try:
    rekog_response = rekognition.detect_labels(
        Image={"Bytes": image_bytes},
        MaxLabels=10,
        MinConfidence=80
    )
except Exception as e:
    print("\nRekognition failed:", e)
    sys.exit(1)

print("\nRekognition response received.")

detected_labels = [label["Name"] for label in rekog_response["Labels"]]
print("Detected labels:", detected_labels)

# ---------------------------
# 4. GPT SETUP
# ---------------------------

load_dotenv()
openai_key = os.getenv("OPENAI_API_KEY")

if not openai_key:
    print("\nMissing OPENAI_API_KEY in environment variables.")
    sys.exit(1)

client = OpenAI(api_key=openai_key)

user_description = """
A sidewalk ramp with tactile paving at the street corner, next to a crosswalk.
"""

prompt = f"""
You are comparing an image description from Rekognition with a user-submitted description.

Rekognition detected these labels:
{detected_labels}

User says the image contains:
"{user_description.strip()}"

Your job:
1. Say how well the Rekognition results match the user's description.
2. List any major mismatches.
3. Give a confidence score 0–100.

Respond in JSON like:
{{
  "match_summary": "...",
  "mismatches": [...],
  "confidence": 0
}}
"""

# ---------------------------
# 5. GPT CALL
# ---------------------------

print("\nCalling GPT model...\n")

try:
    completion = client.responses.create(
        model="gpt-4.1-mini",
        input=prompt
    )
except Exception as e:
    print("\nGPT request failed:", e)
    sys.exit(1)

print("GPT Response:\n")
print(completion.output_text)