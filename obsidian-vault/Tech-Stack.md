# Tech Stack

Back to [[Home]] · Related: [[Architecture]] · [[Deployment]]

Both frontend and backend are **v3.0.0**.

## Frontend (`vendora-pos/frontend`)

| Concern | Choice |
|---|---|
| Framework | React 18 |
| Build tool | Vite 5 |
| Routing | react-router-dom 6 |
| Styling | Tailwind CSS 3 + PostCSS |
| Charts | Recharts 2 |
| Icons | lucide-react |
| HTTP | axios |
| Real-time | socket.io-client 4 |
| Forms | react-hook-form 7 |
| Toasts | react-hot-toast |
| Dates | dayjs |
| Class utils | clsx |

Entry: `src/main.jsx` → `src/App.jsx`. See [[Frontend-Overview]].

## Backend (`vendora-pos/backend`)

| Concern | Choice |
|---|---|
| Runtime | Node.js |
| Framework | Express 4 |
| Database | MongoDB via Mongoose 8 |
| Cache/queue | Redis via ioredis |
| Real-time | socket.io 4 |
| Auth | jsonwebtoken (JWT) + bcryptjs |
| 2FA | otplib / speakeasy |
| Validation | joi |
| Billing | stripe |
| PDFs | pdfkit (payslips, receipts) |
| PDF parsing | pdf-parse (invoice reader / OCR) |
| QR codes | qrcode |
| Email | nodemailer |
| Fuzzy match | fastest-levenshtein |
| Market data | google-trends-api |
| Scheduling | node-cron |
| Logging | winston + daily-rotate-file |
| Security | helmet, express-rate-limit |
| Uploads | multer |
| CSV | csv-parse / csv-stringify |

Entry: `server.js` → `src/app.js` → `src/routes/index.js`.

## Testing
- Backend: **Jest** + supertest + mongodb-memory-server. Tests in `backend/src/__tests__/`.
- Run: `npm test` (in `backend/`).

## Dev commands

```bash
# frontend
cd vendora-pos/frontend
npm install
npm run dev       # vite dev server
npm run build     # production build

# backend
cd vendora-pos/backend
npm install
npm run dev       # nodemon
npm start         # node server.js
npm run seed      # seed sample data
npm test          # jest
```
