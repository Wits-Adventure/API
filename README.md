# API
The API

## Required environment variables
The api has two environment variables, the first of which is hidden for sercurity reasons

```properties
# base64-encoded Firebase service account JSON
FIREBASE_SERVICE_ACCOUNT=BASE64_SERVICE_ACCOUNT_JSON

# Firestore storage bucket
REACT_APP_FIREBASE_STORAGE_BUCKET=bloobase2.firebasestorage.app


## Run locally
1. Install dependencies:
```
npm install
```
2. Start the server:
```
npm start
```
3. Open in your browser:
- http://localhost:5000/  (landing page)
- http://localhost:5000/api/health  (JSON health check)

<p align="center">
  <strong>Code Coverage</strong><br><br>
  <a href="https://codecov.io/gh/Wits-Adventure/API" > 
 <img src="https://codecov.io/gh/Wits-Adventure/API/branch/main/graph/badge.svg?token=V241TYLXLH"/> 
 </a>
 <br><br>
  <a href="https://codecov.io/gh/Wits-Adventure/API">
    <img src="https://codecov.io/gh/Wits-Adventure/API/branch/main/graphs/sunburst.svg?token=V241TYLXLH" />
  </a>
</p>

