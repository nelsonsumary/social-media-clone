# SocialClone - Social Media Web App

A full-stack social media clone built with vanilla JavaScript, HTML, CSS, Node.js/Express, and SQLite.

## Features

- User signup, login, and account deletion
- Public posting with image uploads
- Private messaging between users
- User profiles with bios and avatars
- Follow/unfollow other users
- Real-time-like feed

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JS (no framework) |
| Backend | Node.js + Express |
| Database | SQLite (via better-sqlite3) |
| File Storage | Local filesystem via multer |
| Auth | JWT (JSON Web Tokens) |

## Project Structure

```
social-media-clone/
├── backend/
│   ├── server.js          # Express server entry point
│   ├── database.js        # SQLite setup + table creation
│   ├── auth.js            # JWT token generation & middleware
│   ├── routes/
│   │   ├── auth.js        # POST /login, /signup, DELETE /account
│   │   ├── posts.js       # CRUD for posts
│   │   ├── messages.js    # Private messaging
│   │   ├── users.js       # User search, profiles, follow
│   │   └── upload.js      # Image upload handler
│   ├── uploads/           # Uploaded images stored here
│   └── social.db          # SQLite database (auto-created)
├── frontend/
│   ├── index.html         # Main HTML with all page templates
│   ├── css/style.css      # All styles
│   └── js/
│       ├── api.js         # API client functions
│       ├── auth.js        # Session management helpers
│       └── app.js         # Page routing & UI logic
└── package.json
```

## How It Works (Step by Step)

### 1. Authentication Flow
1. User fills signup or login form in the frontend
2. `api.js` sends a POST request to the backend's `/api/auth/signup` or `/api/auth/login`
3. Backend validates credentials, hashes password with bcryptjs, stores in SQLite
4. A JWT token is generated and returned to the frontend
5. Frontend stores token + user info in `localStorage`
6. All subsequent requests include the token in the `Authorization` header
7. Backend `auth.js` middleware verifies the JWT on protected routes

### 2. Creating a Post
1. User types content and optionally selects an image
2. `createPost()` sends content to `POST /api/posts`
3. If an image is selected, `uploadImage()` sends the file to `POST /api/upload` as `multipart/form-data`
4. The image is saved to `backend/uploads/` and the URL is returned
5. `attachPostImage()` links the image URL to the post

### 3. Private Messaging
1. Frontend loads conversations via `GET /api/messages/conversations`
2. Clicking a conversation loads messages via `GET /api/messages/:userId`
3. Sending a message calls `POST /api/messages/:userId` with the message content
4. Backend stores the message with sender and receiver IDs

### 4. Database Design
SQLite stores 4 tables:
- **users** - id, username, email, password (hashed), avatar, bio
- **posts** - id, user_id (FK), content, image
- **messages** - id, sender_id, receiver_id (FKs), content
- **follows** - follower_id, following_id (composite PK, FKs)

All foreign keys use `ON DELETE CASCADE` — deleting a user removes all their data.

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
PORT=3000
JWT_SECRET=your-secret-key-here
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the server runs on |
| `JWT_SECRET` | `change-this-secret-in-production` | Secret key used to sign JWT tokens |

## Running Locally

```bash
cd backend
npm install
npm start
```

Then open `frontend/index.html` in your browser (or serve it with any static server).

The backend runs on `http://localhost:3000`. Update `API_BASE` in `frontend/js/api.js` if needed.

## Deploying for Free

### Option 1: Render (backend) + Vercel (frontend) + Cloudinary (images)

**Backend on Render:**
1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service → Connect repo
3. Set:
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add environment variable: `JWT_SECRET=your-secret-key`
5. Deploy (free tier sleeps after inactivity, wakes on request)

**Frontend on Vercel:**
1. Go to [vercel.com](https://vercel.com) → New Project → Import repo
2. Set Root Directory: `frontend`
3. Update `API_BASE` in `api.js` to your Render URL
4. Deploy

**Images on Cloudinary (free):**
1. Sign up at [cloudinary.com](https://cloudinary.com) (free tier: 10GB storage)
2. Replace the upload route to upload to Cloudinary instead of local disk
3. Or use Render's persistent disk

### Option 2: All-in-one on Railway
1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set Root Directory: `backend`
4. Add `JWT_SECRET` environment variable
5. Railway provides $5 credit free (no credit card required to start)

### Option 3: Fly.io
1. Install flyctl and run `fly launch` in the project
2. Uses 256MB RAM on free tier, stays on 24/7

### Database Upgrades
For production, switch from SQLite to:
- **NeonDB** (free PostgreSQL, 500MB storage) - update `database.js` to use `pg` driver
- **Supabase** (free PostgreSQL, 500MB storage) - includes auth and storage too

### File Storage Upgrades
For production, switch from local storage to:
- **Cloudinary** (10GB free)
- **Supabase Storage** (1GB free)
- **AWS S3** (12 months free)

## Security Notes

- Passwords are hashed with bcryptjs (10 rounds)
- JWT tokens expire after 7 days
- File uploads are restricted to images only (max 5MB)
- Account deletion cascades to all user data
- CORS is enabled for development — restrict in production
