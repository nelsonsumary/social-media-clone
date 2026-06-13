-- Run this SQL in your Supabase project's SQL Editor
-- (https://supabase.com/dashboard/project/_/sql/new)

-- 1. Create tables
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT DEFAULT NULL,
  avatar TEXT DEFAULT NULL,
  bio TEXT DEFAULT '',
  verified BOOLEAN DEFAULT false,
  verification_token TEXT DEFAULT NULL,
  google_id TEXT UNIQUE DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

-- 2. Conversations table for fast lookups
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant1 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant2 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message TEXT DEFAULT NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant1, participant2),
  CONSTRAINT chk_participants CHECK (participant1 < participant2)
);

-- 3. Migration: add columns for email verification and Google OAuth (safe to run if table already exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE DEFAULT NULL;
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

-- 4. Index for fast conversation lookups
CREATE INDEX IF NOT EXISTS idx_conversations_p1 ON conversations(participant1);
CREATE INDEX IF NOT EXISTS idx_conversations_p2 ON conversations(participant2);
CREATE INDEX IF NOT EXISTS idx_conversations_last_at ON conversations(last_message_at DESC);

-- 5. Likes, Comments, Notifications tables
CREATE TABLE IF NOT EXISTS likes (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'message')),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);
