import boto3
from openai import OpenAI
from dotenv import load_dotenv
import os

# ---------------------------
# 1. REKOGNITION SETUP
# ---------------------------

rekognition = boto3.client(
    "rekognition",
    region_name="us-east-1" 
)

with open("ramp.jpg", "rb") as f:
    image_bytes = f.read()

rekog_response = rekognition.detect_labels(
    Image={"Bytes": image_bytes},
    MaxLabels=10,
    MinConfidence=80
)

detected_labels = [label["Name"] for label in rekog_response["Labels"]]

# ---------------------------
# 2. GPT SETUP
# ---------------------------

load_dotenv() 
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


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

completion = client.responses.create(
    model="gpt-4.1-mini",
    input=prompt
)

print(completion.output_text)
