-- ============================================
-- NovelShare: Seed Chapters for All Novels
-- ============================================
-- This script adds 3 sample chapters to each novel in the database.
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================

-- Disable RLS temporarily for this operation (run as admin)
-- Note: If you get permission errors, you may need to run this as the service_role

-- First, let's see what novels exist and need chapters
-- SELECT id, title, total_chapters FROM novels;

-- ============================================
-- Insert chapters for ALL novels dynamically
-- ============================================

-- This uses a DO block to iterate over all novels and insert 3 chapters each
DO $$
DECLARE
    novel_rec RECORD;
    chapter_exists BOOLEAN;
BEGIN
    -- Loop through all novels
    FOR novel_rec IN SELECT id, title, description FROM novels LOOP

        -- Check if this novel already has chapters
        SELECT EXISTS(SELECT 1 FROM chapters WHERE novel_id = novel_rec.id) INTO chapter_exists;

        -- Only add chapters if none exist
        IF NOT chapter_exists THEN

            -- Chapter 1: Prologue
            INSERT INTO chapters (novel_id, chapter_number, title, content, word_count, is_premium, created_at, updated_at)
            VALUES (
                novel_rec.id,
                1,
                'Chapter 1: Prologue',
                E'The story begins on a day like any other, yet nothing would ever be the same again.\n\n' ||
                E'In the quiet moments before dawn, when the world still held its breath between night and day, something extraordinary was about to unfold. The air carried a sense of anticipation, as if the universe itself knew that this moment would mark the beginning of an incredible journey.\n\n' ||
                E'Our protagonist stood at the threshold of destiny, unaware of the adventures that lay ahead. The path forward was shrouded in mystery, but one thing was certain—life would never be ordinary again.\n\n' ||
                E'The first rays of sunlight broke through the horizon, painting the sky in brilliant shades of gold and crimson. It was beautiful, this moment of transition, this bridge between what was and what would be.\n\n' ||
                E'"Every great story begins with a single step," whispered the wind, carrying words of ancient wisdom. "And yours begins now."\n\n' ||
                E'With determination in their heart and courage as their guide, the journey commenced. Whatever challenges lay ahead, whatever trials awaited, there was no turning back. The adventure had begun.\n\n' ||
                E'This is where our tale truly starts—at the edge of the known world, looking out into the vast unknown. What lies beyond? Only time will tell, but one thing is certain: it will be unforgettable.',
                487,
                false,
                NOW(),
                NOW()
            );

            -- Chapter 2: The First Step
            INSERT INTO chapters (novel_id, chapter_number, title, content, word_count, is_premium, created_at, updated_at)
            VALUES (
                novel_rec.id,
                2,
                'Chapter 2: The First Step',
                E'Moving forward requires leaving something behind. This fundamental truth echoed through every decision, every choice that led to this moment.\n\n' ||
                E'The road stretched endlessly before them, winding through landscapes both familiar and strange. Each step brought new discoveries—small wonders hidden in plain sight, waiting to be noticed by those with eyes to see.\n\n' ||
                E'Along the way, companions were found in the most unexpected places. Strangers became allies, and shared struggles forged bonds stronger than steel. Together, they faced the challenges that no one could overcome alone.\n\n' ||
                E'"Trust," said a wise traveler met along the path, "is the foundation upon which all great achievements are built. Without it, even the mightiest fortress crumbles."\n\n' ||
                E'The lessons came quickly now, each one more valuable than the last. Patience, perseverance, and the power of hope—these were the tools that would see them through the darkest hours.\n\n' ||
                E'Night fell, and with it came reflection. Around the campfire, stories were shared—tales of triumph and defeat, of love and loss, of ordinary people doing extraordinary things. In these stories, they found inspiration.\n\n' ||
                E'"Tomorrow brings new challenges," came the reminder as the stars wheeled overhead. "But tonight, we rest. Tonight, we remember why we fight."\n\n' ||
                E'And so the second chapter of their journey drew to a close, but this was merely the beginning. Greater adventures awaited just beyond the horizon.',
                512,
                false,
                NOW(),
                NOW()
            );

            -- Chapter 3: Rising Challenges
            INSERT INTO chapters (novel_id, chapter_number, title, content, word_count, is_premium, created_at, updated_at)
            VALUES (
                novel_rec.id,
                3,
                'Chapter 3: Rising Challenges',
                E'Every hero faces a moment of doubt. That moment had arrived.\n\n' ||
                E'The obstacles seemed insurmountable, the enemies too powerful, the goal too distant. It would have been easy to give up, to accept defeat and return to the safety of the familiar. Many had done so before.\n\n' ||
                E'But within every challenge lies an opportunity. Within every setback, a lesson waiting to be learned. This was the truth that separated those who merely dreamed from those who achieved.\n\n' ||
                E'"The mountain does not care how tired you are," spoke the mentor who had guided so many before. "It only asks one question: will you climb?"\n\n' ||
                E'With renewed resolve, they pressed forward. The path grew steeper, the air thinner, but each step upward brought them closer to their goal. And with each step, they grew stronger.\n\n' ||
                E'Unexpected allies appeared when hope seemed lost. A helping hand extended in the darkness, a word of encouragement when silence would have been easier. These small acts of kindness became the fuel that powered their journey.\n\n' ||
                E'The chapter''s end brought a hard-won victory, but it was clear this was merely a preview of greater battles to come. The real test still lay ahead, but now they faced it not as individuals, but as a united force.\n\n' ||
                E'"We have come so far," they reflected, looking back at the path traveled. "And we will go further still."\n\n' ||
                E'The adventure continues...',
                478,
                false,
                NOW(),
                NOW()
            );

            RAISE NOTICE 'Added 3 chapters to novel: %', novel_rec.title;

        ELSE
            RAISE NOTICE 'Novel already has chapters, skipping: %', novel_rec.title;
        END IF;

    END LOOP;
END $$;

-- ============================================
-- Verify the chapters were added
-- ============================================
SELECT
    n.title as novel_title,
    COUNT(c.id) as chapter_count
FROM novels n
LEFT JOIN chapters c ON n.id = c.novel_id
GROUP BY n.id, n.title
ORDER BY n.title;

-- ============================================
-- Optional: Update novel total_chapters count to match actual chapters
-- (The trigger should handle this, but just in case)
-- ============================================
UPDATE novels n
SET total_chapters = (
    SELECT COUNT(*) FROM chapters c WHERE c.novel_id = n.id
)
WHERE EXISTS (
    SELECT 1 FROM chapters c WHERE c.novel_id = n.id
);

-- Show final result
SELECT
    n.title,
    n.total_chapters,
    (SELECT COUNT(*) FROM chapters c WHERE c.novel_id = n.id) as actual_chapters
FROM novels n
ORDER BY n.title;
