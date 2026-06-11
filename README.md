# SocialClone - Social Media Web App

A full-stack social media clone built with vanilla JavaScript, HTML, CSS, Node.js/Express, Supabase (PostgreSQL), and Supabase Storage.

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
| Database | Supabase (PostgreSQL) |
| File Storage | Supabase Storage |
| Auth | JWT (JSON Web Tokens) with bcryptjs |

## Project Structure

```
social-media-clone/
├── backend/
│   ├── server.js          # Express server entry point
│   ├── database.js        # PostgreSQL connection via pg
│   ├── supabase.js        # Supabase client initialization
│   ├── auth.js            # JWT token generation & middleware
│   ├── schema.sql         # PostgreSQL table definitions (run once)
│   ├── routes/
│   │   ├── auth.js        # POST /login, /signup, DELETE /account
│   │   ├── posts.js       # CRUD for posts
│   │   ├── messages.js    # Private messaging
│   │   ├── users.js       # User search, profiles, follow
│   │   └── upload.js      # Image upload to Supabase Storage
│   └── uploads/           # (no longer used locally)
├── frontend/
│   ├── index.html         # Main HTML with all page templates
│   ├── css/style.css      # All styles
│   └── js/
│       ├── api.js         # API client functions
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
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the server runs on |
| `JWT_SECRET` | `change-this-secret-in-production` | Secret key used to sign JWT tokens |
| `SUPABASE_URL` | — | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | — | Your Supabase service_role key (for backend) |
| `DATABASE_URL` | — | PostgreSQL connection string from Supabase |

### 5. Install & run

```bash
cd backend
npm install
npm start
```

Then open `frontend/index.html` in your browser (or serve it with any static server).

The backend runs on `http://localhost:3000`. Update `API_BASE` in `frontend/js/api.js` if needed.

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
4. Backend stores the message with sender and receiver IDs

### 4. Database Design
PostgreSQL stores 4 tables (created by running `schema.sql`):
- **users** - id (UUID), username, email, password (hashed), avatar, bio
- **posts** - id (UUID), user_id (FK), content, image
- **messages** - id (UUID), sender_id, receiver_id (FKs), content
- **follows** - follower_id, following_id (composite PK, FKs)

All foreign keys use `ON DELETE CASCADE` — deleting a user removes all their data.

## Security Notes

- Passwords are hashed with bcryptjs (10 rounds)
- JWT tokens expire after 7 days
- File uploads are restricted to images only (max 5MB)
- Account deletion cascades to all user data
- CORS is enabled for development — restrict in production
