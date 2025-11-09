import boto3
import os

# ---------------------------
# CONFIG
# ---------------------------
region = "us-east-1"
bucket_name = "accessibility-audit-uploads"   # <-- your bucket

# The image file already in your repo
local_file_path = "elavator.png"                 # <-- change to your file
s3_object_key = "test4.png"                   # Name it'll have in S3

# ---------------------------
# AWS CLIENT
# ---------------------------
s3 = boto3.client("s3", region_name=region)

# ---------------------------
# UPLOAD
# ---------------------------
def upload_file():
    if not os.path.exists(local_file_path):
        print(f"❌ ERROR: File '{local_file_path}' not found.")
        return

    try:
        s3.upload_file(local_file_path, bucket_name, s3_object_key)
        print(f"✅ Successfully uploaded '{local_file_path}' → s3://{bucket_name}/{s3_object_key}")
    except Exception as e:
        print("❌ Upload failed:", e)

if __name__ == "__main__":
    upload_file()
