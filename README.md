# SocialClone - Social Media Web App

**[Live Demo → https://social-media-clone-gpyn.onrender.com](https://social-media-clone-gpyn.onrender.com/)**

A full-stack social media clone built with vanilla JavaScript, HTML, CSS, Node.js/Express, Supabase (PostgreSQL), and Supabase Storage.

## Features

- User signup, login, and account deletion
- Google Sign-In
- Email verification via Google Apps Script
- Public posting with image uploads
- Like and comment on posts
- Private messaging between users (real-time via WebSocket)
- User profiles with bios and avatars
- Follow/unfollow other users
- Real-time notifications
- Dark mode toggle
- Two-factor authentication (TOTP) via authenticator apps (optional)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JS (no framework) |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| File Storage | Supabase Storage |
| Auth | JWT (JSON Web Tokens) with bcryptjs |

## Project Structure

```
social-media-clone/
├── backend/
│   ├── server.js          # Express + HTTP server entry point
│   ├── ws.js              # WebSocket server manager
│   ├── database.js        # PostgreSQL connection via pg
│   ├── supabase.js        # Supabase client initialization
│   ├── auth.js            # JWT token generation & middleware
│   ├── verify.js          # Email verification middleware
│   ├── schema.sql         # PostgreSQL table definitions (run once)
│   ├── google-apps-script.gs  # GAS source for email verification
│   ├── routes/
│   │   ├── auth.js        # Signup, login, Google OAuth, verify email
│   │   ├── posts.js       # CRUD for posts
│   │   ├── messages.js    # Private messaging with WebSocket push
│   │   ├── users.js       # User search, profiles, follow
│   │   ├── likes.js       # Like/unlike posts
│   │   ├── comments.js    # CRUD for comments
│   │   ├── notifications.js # Notifications
│   │   └── upload.js      # Image upload to Supabase Storage
│   └── uploads/           # (no longer used locally)
├── frontend/
│   ├── index.html         # Main HTML with all page templates
│   ├── css/style.css      # All styles
│   └── js/
│       ├── api.js         # API client + WebSocket functions
│       ├── auth.js        # Session management helpers
│       └── app.js         # Page routing & UI logic
└── package.json
```

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up
2. Create a new project (free tier: 500MB PostgreSQL + 1GB storage)
3. Once created, go to **Project Settings → Database** and copy the **Connection string** (URI format)
4. Go to **Project Settings → API** and copy the **Project URL** and **service_role key**

### 2. Run the schema

1. In the Supabase dashboard, go to **SQL Editor**
2. Open `backend/schema.sql` from this project
3. Paste the entire contents and click **Run**
4. This creates the `users`, `posts`, `messages`, and `follows` tables

### 3. Create a storage bucket

1. In the Supabase dashboard, go to **Storage**
2. Click **New Bucket**
3. Name it `uploads`
4. Set it to **public**
5. Click **Create**

### 4. Configure environment

Create a `.env` file in the `backend/` directory:

```env
PORT=3000
JWT_SECRET=your-secret-key-here
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
DATABASE_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
APP_URL=http://localhost:3000
EMAIL_SERVICE_URL=https://script.google.com/macros/s/your-script-id/exec
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the server runs on |
| `JWT_SECRET` | `change-this-secret-in-production` | Secret key used to sign JWT tokens |
| `SUPABASE_URL` | — | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | — | Your Supabase service_role key (for backend) |
| `DATABASE_URL` | — | PostgreSQL connection string from Supabase |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID for Sign-In |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret |
| `APP_URL` | `http://localhost:3000` | Public URL of your app (used for redirects) |
| `EMAIL_SERVICE_URL` | — | Google Apps Script deployment URL for email verification |

### 5. Install & run

```bash
cd backend
npm install
npm start
```

Then open `http://localhost:3000` in your browser. The backend serves the frontend automatically.

## How It Works (Step by Step)

### 1. Authentication Flow
1. User fills signup or login form in the frontend
2. `api.js` sends a POST request to the backend's `/api/auth/signup` or `/api/auth/login`
3. Backend validates credentials, hashes password with bcryptjs, stores in Supabase (PostgreSQL)
4. A JWT token is generated and returned to the frontend
5. Frontend stores token + user info in `localStorage`
6. All subsequent requests include the token in the `Authorization` header
7. Backend `auth.js` middleware verifies the JWT on protected routes

### 2. Creating a Post
1. User types content and optionally selects an image
2. `createPost()` sends content to `POST /api/posts`
3. If an image is selected, `uploadImage()` sends the file to `POST /api/upload` as `multipart/form-data`
4. The image is uploaded to Supabase Storage and a public URL is returned
5. `attachPostImage()` links the image URL to the post

### 3. Private Messaging
1. Frontend loads conversations via `GET /api/messages/conversations`
2. Clicking a conversation loads messages via `GET /api/messages/:userId`
3. Sending a message calls `POST /api/messages/:userId` with the message content
4. Backend stores the message and pushes it to the receiver in real-time via WebSocket
5. The frontend receives the push and updates the message list instantly without reloading

### 4. Database Design
PostgreSQL stores 7 tables (created by running `schema.sql`):
- **users** - id (UUID), username, email, password (hashed), avatar, bio, verified, google_id, totp_secret, totp_enabled
- **posts** - id (UUID), user_id (FK), content, image
- **messages** - id (UUID), sender_id, receiver_id (FKs), content
- **conversations** - id (UUID), participant1, participant2, last_message
- **likes** - post_id, user_id (composite PK)
- **comments** - id (UUID), post_id (FK), user_id (FK), content
- **notifications** - id (UUID), user_id (FK), actor_id (FK), type, post_id, read

All foreign keys use `ON DELETE CASCADE` — deleting a user removes all their data.

## Security Notes

- Passwords are hashed with bcryptjs (12 rounds)
- JWT tokens expire after 7 days
- Optional TOTP two-factor authentication via authenticator apps (Google Authenticator, Authy, etc.)
- File uploads are restricted to images only (max 5MB)
- Account deletion cascades to all user data
- CORS is enabled for development — restrict in production
