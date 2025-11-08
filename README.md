# AccessibilityPlus

We use AWS to power the intelligence and scalability of our accessibility-auditing platform.  
User photos are stored in Amazon S3, then processed by an AWS Lambda function that uses Amazon Rekognition to automatically detect accessibility features and validate citizen-submitted reports.

Our verification pipeline is exposed through API Gateway so the mobile app can securely trigger AI checks in real time. This creates a fully serverless, scalable workflow where AWS handles storage, compute, and vision analysis to make our crowdsourced city-mapping system both reliable and future-proof.

## Running Locally
pip install -r requirements.txt
python test.py
