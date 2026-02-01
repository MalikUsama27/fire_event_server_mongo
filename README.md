# Fire Event Server (Node.js + Express + Nodemon + MongoDB)

This server receives realtime fire/smoke activation events (POST JSON) and stores them in MongoDB using Mongoose.

## 1) Requirements
- Node.js (LTS)
- MongoDB (local or Atlas)

## 2) Install
```bash
npm install
```

## 3) Configure env
Create `.env`:
```bash
copy .env.example .env
```

Edit `.env` and set:
- `MONGODB_URI=...`  (local or Atlas)
- optional `API_KEY=...`
- `PORT=3000`

## 4) Run with nodemon (dev)
```bash
npm run dev
```

## Endpoints
- GET `/health`
- POST `/api/fire-events`
- GET `/api/fire-events?limit=50`

## Client (your Python detector)
Set in `config.json`:
```json
"api_url": "http://localhost:3000/api/fire-events"
```

If you enable API_KEY, set in python too:
```json
"api_key": "your_token"
```

## MongoDB URI examples
### Local MongoDB
```
MONGODB_URI=mongodb://127.0.0.1:27017/fire_alarm
```

### MongoDB Atlas
```
MONGODB_URI=mongodb+srv://USER:PASS@CLUSTER.mongodb.net/fire_alarm?retryWrites=true&w=majority
```
