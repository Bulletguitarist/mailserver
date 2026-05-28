# 🔐 SecureMail — Self-Hosted Encrypted Mail Server

> A production-grade, privacy-first email service built from scratch with end-to-end encryption, JWT authentication, OTP/2FA, spam detection, and a full React dashboard.

![SecureMail](https://img.shields.io/badge/SecureMail-v1.0-2E86C1?style=for-the-badge&logo=mail.ru&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-v24-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 🌐 Live Demo

| Service | URL |
|---|---|
| 🖥️ Frontend | [mailserver-ui.vercel.app](https://mailserver-ui.vercel.app) |
| ⚙️ Backend API | [securemail-backend-xahl.onrender.com](https://securemail-backend-xahl.onrender.com) |

---

## ✨ Features

### 🔐 Security
- **End-to-End Encryption** - Messages encrypted with libsodium (crypto_box_seal) using recipient's public key. Server never sees plaintext.
- **JWT Authentication** - Access tokens (15min) + Refresh tokens (7 days) with automatic rotation
- **Token Revocation** - Logout invalidates tokens via JTI blocklist
- **OTP / 2FA** - TOTP-based two-factor auth compatible with Google Authenticator & Authy
- **bcrypt Passwords** - Cost factor 12, never stored in plaintext
- **Rate Limiting** - Auth: 10req/15min | API: 200req/15min | Mail: 50/hr
- **Security Headers** - Helmet.js (CSP, HSTS, X-Frame-Options, etc.)

### 📧 Mail System
- **Internal Messaging** - Direct DB-based delivery between SecureMail users
- **Spam Detection** - Custom rule-based scoring engine (0-10 score)
  - Keyword matching (50+ spam words)
  - Pattern matching (ALL CAPS, `!!!`, regex patterns)
  - Sender validation
- **Inbox / Sent / Spam** - Full folder management
- **Read/Unread** tracking
- **Message Decryption** - Client-side decryption with private key

### 🖥️ Dashboard
- Clean React UI with sidebar navigation
- Email compose with encryption indicator
- Click-to-open email modal
- Login activity timeline
- Key management page with QR code support
- Real-time toast notifications

---

## 🏗️ Architecture

```
Browser (React + Vercel)
         ↕ HTTPS
Express Server (Node.js + Render)
         ↕                    ↕
  PostgreSQL (Supabase)    In-memory Sessions
         ↕
  libsodium Encryption
```

---

## 🛠️ Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| Node.js v24 + Express | HTTP server & API |
| PostgreSQL (Supabase) | Persistent database |
| bcryptjs | Password hashing (cost 12) |
| jsonwebtoken | JWT access + refresh tokens |
| speakeasy | TOTP/OTP 2FA |
| qrcode | QR code generation |
| libsodium-wrappers | E2E encryption |
| helmet | HTTP security headers |
| express-rate-limit | Rate limiting |
| winston | Structured logging |
| uuid | Unique ID generation |

### Frontend
| Technology | Purpose |
|---|---|
| React 18 + Vite | UI framework |
| React Router v6 | Client-side routing |
| Axios | API requests with interceptors |
| react-hot-toast | Notifications |
| lucide-react | Icons |

### Infrastructure
| Service | Purpose |
|---|---|
| Render.com | Backend hosting (free tier) |
| Vercel | Frontend hosting |
| Supabase | PostgreSQL database |

---

## 📁 Project Structure

```
mailserver/                     # Backend
├── src/
│   ├── index.js                # Express entry point
│   ├── config/
│   │   ├── db.js               # PostgreSQL pool + table init
│   │   ├── mailer.js           # Mail system config
│   │   └── sessions.js         # In-memory session store
│   ├── middleware/
│   │   ├── auth.js             # JWT verification
│   │   └── ratelimiter.js      # Rate limiting
│   ├── routes/
│   │   ├── auth.js             # Auth endpoints
│   │   ├── mail.js             # Mail endpoints
│   │   ├── keys.js             # Key management
│   │   └── health.js           # Health checks
│   └── utils/
│       ├── encryption.js       # libsodium E2E crypto
│       ├── spam.js             # Spam detection engine
│       └── logger.js           # Winston logger
└── package.json

mailserver-ui/                  # Frontend
├── src/
│   ├── api/axios.js            # Axios instance + interceptors
│   ├── context/AuthContext.jsx # Global auth state
│   ├── components/Sidebar.jsx  # Navigation sidebar
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── Inbox.jsx           # Email list + decrypt modal
│   │   ├── Compose.jsx         # Email composer
│   │   ├── Sent.jsx            # Sent emails
│   │   ├── Activity.jsx        # Login activity log
│   │   └── Keys.jsx            # Key management
│   └── App.jsx                 # Router + protected routes
└── package.json
```

---

## 🗄️ Database Schema

### `users`
| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| email | TEXT UNIQUE | User email |
| password_hash | TEXT | bcrypt hash |
| otp_secret | TEXT | TOTP secret |
| otp_enabled | INTEGER | 2FA status |
| public_key | TEXT | libsodium public key |

### `emails`
| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| owner_id | TEXT | References users.id |
| from_address | TEXT | Sender email |
| body_encrypted | TEXT | Encrypted or plaintext body |
| is_encrypted | INTEGER | 1 = E2E encrypted |
| folder | TEXT | inbox/sent/spam/trash |
| spam_score | FLOAT | 0.0 - 10.0 |

### `audit_logs`
| Column | Type | Description |
|---|---|---|
| id | TEXT (UUID) | Primary key |
| user_id | TEXT | References users.id |
| action | TEXT | login_success, logout, otp_verified, etc. |
| ip_address | TEXT | Client IP |
| user_agent | TEXT | Browser/client info |

---

## 🚀 Local Setup

### Prerequisites
- Node.js v18+
- PostgreSQL (or Supabase account)

### Backend

```bash
# Clone repo
git clone https://github.com/Bulletguitarist/mailserver
cd mailserver

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Fill in your values

# Start server
npm run dev
```

### `.env` Configuration

```env
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# JWT
JWT_ACCESS_SECRET=your_secret_min_32_chars
JWT_REFRESH_SECRET=your_refresh_secret_min_32_chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
```

### Frontend

```bash
git clone https://github.com/Bulletguitarist/mailserver-ui
cd mailserver-ui
npm install

# Create .env
echo "VITE_API_URL=http://localhost:3000" > .env

npm run dev
# Open http://localhost:5173
```

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login → JWT tokens |
| POST | `/api/auth/refresh` | Rotate tokens |
| POST | `/api/auth/logout` | Revoke token |
| POST | `/api/auth/otp/setup` | Generate TOTP + QR |
| POST | `/api/auth/otp/verify` | Verify OTP token |
| GET | `/api/auth/activity` | Last 20 login events |
| GET | `/api/auth/me` | Current user profile |

### Mail
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/mail/send` | Send email (auto-encrypts) |
| GET | `/api/mail/inbox` | Fetch inbox |
| GET | `/api/mail/sent` | Fetch sent emails |
| GET | `/api/mail/unread` | Unread count |
| GET | `/api/mail/spam` | Spam folder |
| POST | `/api/mail/decrypt` | Decrypt message with private key |
| DELETE | `/api/mail/:id` | Move to trash |
| PATCH | `/api/mail/:id/read` | Mark as read |

### Keys
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/keys/generate` | Generate keypair |
| POST | `/api/keys/regenerate` | Regenerate keypair |
| GET | `/api/keys/status` | Check if keys exist |
| GET | `/api/keys/public/:email` | Get user's public key |

### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/health/deep` | DB connectivity check |

---

## 🔐 How E2E Encryption Works

```
1. Recipient generates keypair → public key stored in DB
                                  private key saved by user ONLY

2. Sender composes email to recipient

3. Server fetches recipient's public key from DB

4. libsodium crypto_box_seal encrypts message:
   plaintext + recipient_public_key → ciphertext

5. Only ciphertext stored in DB — server never sees plaintext

6. Recipient opens email → pastes private key → 
   client sends to /api/mail/decrypt →
   crypto_box_seal_open(ciphertext, public_key, private_key) → plaintext
```

> ⚠️ **Important**: Save your private key securely! It is shown only once during key generation. Without it, encrypted messages cannot be decrypted.

---

## 🛡️ Spam Detection

Custom rule-based scoring engine:

| Check | Score |
|---|---|
| Spam keyword match | +0.8 per keyword |
| Pattern match (CAPS, `!!!`) | +1.2 per pattern |
| Invalid sender format | +2.0 |
| Empty subject | +1.0 |
| All caps subject | +1.5 |

| Score Range | Label |
|---|---|
| 0 - 3 | ✅ CLEAN |
| 4 - 6 | ⚠️ SUSPICIOUS |
| 7 - 10 | 🚫 SPAM |

---

## 📊 Phases Built

| Phase | Feature | Status |
|---|---|---|
| 1 | Express + PostgreSQL + Middleware | ✅ Complete |
| 2 | Auth System (JWT + OTP + Activity) | ✅ Complete |
| 3 | Mail Core (SMTP + IMAP + Spam) | ✅ Complete |
| 4 | E2E Encryption + Key Management | ✅ Complete |
| 5 | React Dashboard + Deployment | ✅ Complete |

---

## 🚀 Deployment

| Service | Platform | Notes |
|---|---|---|
| Backend | Render.com (free) | Auto-deploy on push |
| Frontend | Vercel (free) | Auto-deploy on push |
| Database | Supabase (free) | Persistent PostgreSQL |

---

## 🔮 Future Improvements

- [ ] WebSocket real-time inbox updates
- [ ] Custom domain + Postfix SMTP server (remove Gmail relay)
- [ ] File attachment support
- [ ] Mobile app (React Native)
- [ ] Email threading / conversation view
- [ ] Admin panel for user management
- [ ] Redis for production session management
- [ ] DKIM/SPF/DMARC signing for outbound mail

## Team HASH 

