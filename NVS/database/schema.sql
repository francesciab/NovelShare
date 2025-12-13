-- NovelShare Database Schema for Supabase
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  avatar_url TEXT,
  bio TEXT DEFAULT 'New NovelShare member',
  location VARCHAR(100),
  website VARCHAR(255),
  is_author BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- NOVELS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS novels (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  author VARCHAR(100) NOT NULL,
  description TEXT,
  cover_image TEXT,
  genres TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'completed', 'hiatus')),
  total_chapters INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  rating_avg DECIMAL(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE novels ENABLE ROW LEVEL SECURITY;

-- Policies for novels
DROP POLICY IF EXISTS "Novels are viewable by everyone" ON novels;
CREATE POLICY "Novels are viewable by everyone" ON novels
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authors can insert novels" ON novels;
CREATE POLICY "Authors can insert novels" ON novels
  FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can update own novels" ON novels;
CREATE POLICY "Authors can update own novels" ON novels
  FOR UPDATE USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can delete own novels" ON novels;
CREATE POLICY "Authors can delete own novels" ON novels
  FOR DELETE USING (true);

-- ============================================
-- CHAPTERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS chapters (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  novel_id UUID REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  chapter_number INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','published','trash')),
  word_count INTEGER DEFAULT 0,
  is_premium BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(novel_id, chapter_number)
);

-- Enable RLS
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

-- Policies for chapters
DROP POLICY IF EXISTS "Chapters are viewable by everyone" ON chapters;
CREATE POLICY "Chapters are viewable by everyone" ON chapters
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authors can manage chapters" ON chapters;
CREATE POLICY "Authors can manage chapters" ON chapters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM novels WHERE novels.id = chapters.novel_id AND novels.author_id = auth.uid()
    )
  );

-- ============================================
-- USER LIBRARY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_library (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  novel_id UUID REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  current_chapter INTEGER DEFAULT 0,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, novel_id)
);

-- Enable RLS
ALTER TABLE user_library ENABLE ROW LEVEL SECURITY;

-- Policies for user_library
DROP POLICY IF EXISTS "Users can view own library" ON user_library;
CREATE POLICY "Users can view own library" ON user_library
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own library" ON user_library;
CREATE POLICY "Users can manage own library" ON user_library
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- READING HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS reading_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  novel_id UUID REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  chapter_id TEXT NOT NULL,  -- Changed from INTEGER to TEXT to store full UUID
  chapter_title VARCHAR(255),
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, novel_id)
);

-- Enable RLS
ALTER TABLE reading_history ENABLE ROW LEVEL SECURITY;

-- Policies for reading_history
DROP POLICY IF EXISTS "Users can view own history" ON reading_history;
CREATE POLICY "Users can view own history" ON reading_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own history" ON reading_history;
CREATE POLICY "Users can manage own history" ON reading_history
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- BOOKMARKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  novel_id UUID REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  chapter_id TEXT NOT NULL,  -- Changed from INTEGER to TEXT to store full UUID
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- Policies for bookmarks
DROP POLICY IF EXISTS "Users can view own bookmarks" ON bookmarks;
CREATE POLICY "Users can view own bookmarks" ON bookmarks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own bookmarks" ON bookmarks;
CREATE POLICY "Users can manage own bookmarks" ON bookmarks
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- RATINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ratings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  novel_id UUID REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, novel_id)
);

-- Enable RLS
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Policies for ratings
DROP POLICY IF EXISTS "Ratings are viewable by everyone" ON ratings;
CREATE POLICY "Ratings are viewable by everyone" ON ratings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own ratings" ON ratings;
CREATE POLICY "Users can manage own ratings" ON ratings
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- FOLLOWS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS follows (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Enable RLS
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Policies for follows
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON follows;
CREATE POLICY "Follows are viewable by everyone" ON follows
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own follows" ON follows;
CREATE POLICY "Users can manage own follows" ON follows
  FOR ALL USING (auth.uid() = follower_id);

-- ============================================
-- COMMENTS TABLE (Optional - for future)
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  novel_id UUID REFERENCES novels(id) ON DELETE CASCADE NOT NULL,
  chapter_id INTEGER,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Policies for comments
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
CREATE POLICY "Comments are viewable by everyone" ON comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create comments" ON comments;
CREATE POLICY "Users can create comments" ON comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own comments" ON comments;
CREATE POLICY "Users can update own comments" ON comments
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own comments" ON comments;
CREATE POLICY "Users can delete own comments" ON comments
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_novels_author_id ON novels(author_id);
CREATE INDEX IF NOT EXISTS idx_novels_created_at ON novels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapters_novel_id ON chapters(novel_id);
CREATE INDEX IF NOT EXISTS idx_user_library_user_id ON user_library(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_history_user_id ON reading_history(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_novel_id ON ratings(novel_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update novel rating average
CREATE OR REPLACE FUNCTION update_novel_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE novels
  SET
    rating_avg = (SELECT AVG(rating)::DECIMAL(3,2) FROM ratings WHERE novel_id = NEW.novel_id),
    rating_count = (SELECT COUNT(*) FROM ratings WHERE novel_id = NEW.novel_id)
  WHERE id = NEW.novel_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for rating updates
DROP TRIGGER IF EXISTS on_rating_change ON ratings;
CREATE TRIGGER on_rating_change
  AFTER INSERT OR UPDATE OR DELETE ON ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_novel_rating();

-- Function to update chapter count
CREATE OR REPLACE FUNCTION update_chapter_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE novels SET total_chapters = total_chapters + 1 WHERE id = NEW.novel_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE novels SET total_chapters = total_chapters - 1 WHERE id = OLD.novel_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for chapter count
DROP TRIGGER IF EXISTS on_chapter_change ON chapters;
CREATE TRIGGER on_chapter_change
  AFTER INSERT OR DELETE ON chapters
  FOR EACH ROW
  EXECUTE FUNCTION update_chapter_count();

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- Insert sample novels (you can run this after creating your first user)
/*
INSERT INTO novels (title, author, description, cover_image, genres, status, total_chapters) VALUES
('Shadow Slave', 'Guiltythree', 'Growing up in poverty, Sunny never expected anything good from life. However, even he did not anticipate being chosen by the Nightmare Spell and becoming one of the Awakened.', 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=300&q=80', ARRAY['Fantasy', 'Action', 'Adventure'], 'ongoing', 2721),
('Lord of Mysteries', 'Cuttlefish That Loves Diving', 'With the rising tide of steam power and machinery, who can come close to being a Savior?', 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=300&q=80', ARRAY['Fantasy', 'Mystery', 'Horror'], 'completed', 1432),
('Solo Leveling', 'Chugong', 'In a world where hunters must battle deadly monsters to protect humanity, Sung Jinwoo finds himself in an unexpected situation.', 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=300&q=80', ARRAY['Fantasy', 'Action', 'Adventure'], 'completed', 270),
('Supreme Magus', 'Legion20', 'Derek McCoy was a man that lived his whole life guided by a thirst for revenge.', 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=300&q=80', ARRAY['Fantasy', 'Magic', 'Adventure'], 'ongoing', 3995);
*/
