-- Enable UUID extension okay
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username varchar(50) UNIQUE NOT NULL,
  email varchar(255) NOT NULL,
  display_name varchar(100),
  avatar_url text,
  bio text DEFAULT 'New NovelShare member',
  location varchar(100),
  website varchar(255),
  is_author boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- NOVELS
CREATE TABLE IF NOT EXISTS novels (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  title varchar(255) NOT NULL,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  author varchar(100) NOT NULL,
  description text,
  cover_image text,
  genres text[] DEFAULT '{}',
  tags text[] DEFAULT '{}',
  status varchar(20) DEFAULT 'ongoing' CHECK (status IN ('ongoing','completed','hiatus')),
  total_chapters int DEFAULT 0,
  view_count int DEFAULT 0,
  rating_avg decimal(3,2) DEFAULT 0,
  rating_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE novels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Novels are viewable by everyone" ON novels;
DROP POLICY IF EXISTS "Authors can insert novels" ON novels;
DROP POLICY IF EXISTS "Authors can update own novels" ON novels;
CREATE POLICY "Novels are viewable by everyone" ON novels FOR SELECT USING (true);
CREATE POLICY "Authors can insert novels" ON novels FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update own novels" ON novels FOR UPDATE USING (auth.uid() = author_id);

-- CHAPTERS
CREATE TABLE IF NOT EXISTS chapters (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  novel_id uuid REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  chapter_number int NOT NULL,
  title varchar(255) NOT NULL,
  content text NOT NULL,
  word_count int DEFAULT 0,
  is_premium boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(novel_id, chapter_number)
);
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Chapters are viewable by everyone" ON chapters;
DROP POLICY IF EXISTS "Authors can manage chapters" ON chapters;
CREATE POLICY "Chapters are viewable by everyone" ON chapters FOR SELECT USING (true);
CREATE POLICY "Authors can manage chapters" ON chapters FOR ALL USING (
  EXISTS (SELECT 1 FROM novels WHERE novels.id = chapters.novel_id AND novels.author_id = auth.uid())
);

-- USER LIBRARY
CREATE TABLE IF NOT EXISTS user_library (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  novel_id uuid REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  current_chapter int DEFAULT 0,
  added_at timestamptz DEFAULT now(),
  last_read_at timestamptz DEFAULT now(),
  UNIQUE(user_id, novel_id)
);
ALTER TABLE user_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own library" ON user_library;
DROP POLICY IF EXISTS "Users can manage own library" ON user_library;
CREATE POLICY "Users can view own library" ON user_library FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own library" ON user_library FOR ALL USING (auth.uid() = user_id);

-- READING HISTORY
CREATE TABLE IF NOT EXISTS reading_history (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  novel_id uuid REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  chapter_id int NOT NULL,
  chapter_title varchar(255),
  read_at timestamptz DEFAULT now(),
  UNIQUE(user_id, novel_id)
);
ALTER TABLE reading_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own history" ON reading_history;
DROP POLICY IF EXISTS "Users can manage own history" ON reading_history;
CREATE POLICY "Users can view own history" ON reading_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own history" ON reading_history FOR ALL USING (auth.uid() = user_id);

-- BOOKMARKS
CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  novel_id uuid REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  chapter_id int NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own bookmarks" ON bookmarks;
DROP POLICY IF EXISTS "Users can manage own bookmarks" ON bookmarks;
CREATE POLICY "Users can view own bookmarks" ON bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own bookmarks" ON bookmarks FOR ALL USING (auth.uid() = user_id);

-- RATINGS
CREATE TABLE IF NOT EXISTS ratings (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  novel_id uuid REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  rating int CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, novel_id)
);
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ratings are viewable by everyone" ON ratings;
DROP POLICY IF EXISTS "Users can manage own ratings" ON ratings;
CREATE POLICY "Ratings are viewable by everyone" ON ratings FOR SELECT USING (true);
CREATE POLICY "Users can manage own ratings" ON ratings FOR ALL USING (auth.uid() = user_id);

-- FOLLOWS
CREATE TABLE IF NOT EXISTS follows (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON follows;
DROP POLICY IF EXISTS "Users can manage own follows" ON follows;
CREATE POLICY "Follows are viewable by everyone" ON follows FOR SELECT USING (true);
CREATE POLICY "Users can manage own follows" ON follows FOR ALL USING (auth.uid() = follower_id);

-- COMMENTS (optional)
CREATE TABLE IF NOT EXISTS comments (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  novel_id uuid REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  chapter_id int,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  content text NOT NULL,
  likes_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
DROP POLICY IF EXISTS "Users can create comments" ON comments;
DROP POLICY IF EXISTS "Users can update own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;
CREATE POLICY "Comments are viewable by everyone" ON comments FOR SELECT USING (true);
CREATE POLICY "Users can create comments" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON comments FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_novels_author_id ON novels(author_id);
CREATE INDEX IF NOT EXISTS idx_novels_created_at ON novels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapters_novel_id ON chapters(novel_id);
CREATE INDEX IF NOT EXISTS idx_user_library_user_id ON user_library(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_history_user_id ON reading_history(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_novel_id ON ratings(novel_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- Functions & triggers
CREATE OR REPLACE FUNCTION update_novel_rating()
RETURNS trigger AS $$
BEGIN
  UPDATE novels
    SET rating_avg = (SELECT AVG(rating)::decimal(3,2) FROM ratings WHERE novel_id = NEW.novel_id),
        rating_count = (SELECT COUNT(*) FROM ratings WHERE novel_id = NEW.novel_id)
    WHERE id = NEW.novel_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_rating_change ON ratings;
CREATE TRIGGER on_rating_change
  AFTER INSERT OR UPDATE OR DELETE ON ratings
  FOR EACH ROW EXECUTE FUNCTION update_novel_rating();

CREATE OR REPLACE FUNCTION update_chapter_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE novels SET total_chapters = total_chapters + 1 WHERE id = NEW.novel_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE novels SET total_chapters = total_chapters - 1 WHERE id = OLD.novel_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_chapter_change ON chapters;
CREATE TRIGGER on_chapter_change
  AFTER INSERT OR DELETE ON chapters
  FOR EACH ROW EXECUTE FUNCTION update_chapter_count();


