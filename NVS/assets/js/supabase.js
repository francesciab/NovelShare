// Supabase Configuration for NovelShare
// This file handles all Supabase authentication and database operations

const SUPABASE_URL = 'https://dakeojhwurvhstxiuzsl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRha2Vvamh3dXJ2aHN0eGl1enNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MTc1OTgsImV4cCI6MjA4MDE5MzU5OH0.087Hz8XWS-PxRxdNQ1oW_tb9UQKom6YNNYJyKfQIMI4';

// Initialize Supabase client (with guard for when SDK hasn't loaded)
let supabase = null;
if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('Supabase initialized successfully');
} else {
  console.warn('Supabase SDK not available - running in offline mode');
}

// Helper to check if Supabase is available
function isSupabaseAvailable() {
  return supabase !== null;
}

// Track locally deleted novels so all pages stay consistent
function getDeletedIdSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem('novelshare_deleted_ids') || '[]'));
  } catch {
    return new Set();
  }
}

function filterOutDeleted(list) {
  const deleted = getDeletedIdSet();
  if (!Array.isArray(list) || deleted.size === 0) return Array.isArray(list) ? list : [];
  return list.filter(item => item && !deleted.has(item.id) && !deleted.has(item.novel_id));
}

// Count chapters for a novel (schema has no status column)
async function countChapters(novelId) {
  try {
    const { count, error } = await supabase
      .from('chapters')
      .select('*', { count: 'exact', head: true })
      .eq('novel_id', novelId);
    if (error) throw error;
    return count || 0;
  } catch (err) {
    console.warn('countChapters failed:', err);
    return 0;
  }
}

// Count published chapters only (for public-facing displays)
async function countPublishedChapters(novelId) {
  try {
    const { count, error } = await supabase
      .from('chapters')
      .select('*', { count: 'exact', head: true })
      .eq('novel_id', novelId)
      .eq('status', 'published');
    if (error) throw error;
    return count || 0;
  } catch (err) {
    console.warn('countPublishedChapters failed:', err);
    return 0;
  }
}

// Update work chapter count in localStorage (keeps dashboard in sync)
function updateWorkChapterCount(workId, count) {
  try {
    // Update novelshare_my_works (author dashboard)
    const works = JSON.parse(localStorage.getItem('novelshare_my_works') || '[]');
    const idx = works.findIndex(w => w.id === workId);
    if (idx >= 0) {
      works[idx].chapters = count;
      works[idx].publishedChapters = count;
      works[idx].total_chapters = count;
      localStorage.setItem('novelshare_my_works', JSON.stringify(works));
    }
  } catch (err) {
    console.warn('updateWorkChapterCount (my_works) failed:', err);
  }

  try {
    // Update novelshare_library (library page)
    const library = JSON.parse(localStorage.getItem('novelshare_library') || '[]');
    const libIdx = library.findIndex(n => n.id === workId || n.novelId === workId);
    if (libIdx >= 0) {
      library[libIdx].totalChapters = count;
      library[libIdx].chapters = count;
      localStorage.setItem('novelshare_library', JSON.stringify(library));
    }
  } catch (err) {
    console.warn('updateWorkChapterCount (library) failed:', err);
  }
}

// Refresh and sync chapter count for a work (fetches from Supabase and updates localStorage)
// Uses countPublishedChapters to match what readers see on browse/library/novel pages
async function refreshWorkChapterCount(workId) {
  try {
    const count = await countPublishedChapters(workId);
    updateWorkChapterCount(workId, count);
    return count;
  } catch (err) {
    console.warn('refreshWorkChapterCount failed:', err);
    return null;
  }
}

// ============================================
// Offline Sync Queue System
// ============================================

const SyncQueue = {
  QUEUE_KEY: 'novelshare_sync_queue',

  // Get current queue
  getQueue() {
    try {
      return JSON.parse(localStorage.getItem(this.QUEUE_KEY) || '[]');
    } catch {
      return [];
    }
  },

  // Save queue
  saveQueue(queue) {
    try {
      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to save sync queue:', e);
    }
  },

  // Add operation to queue
  add(operation) {
    const queue = this.getQueue();
    queue.push({
      ...operation,
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      retries: 0
    });
    this.saveQueue(queue);
  },

  // Remove operation from queue
  remove(operationId) {
    const queue = this.getQueue().filter(op => op.id !== operationId);
    this.saveQueue(queue);
  },

  // Clear entire queue
  clear() {
    localStorage.removeItem(this.QUEUE_KEY);
  },

  // Get queue length
  length() {
    return this.getQueue().length;
  }
};

// ============================================
// Timeout Wrapper for Sync Operations
// ============================================
function withTimeout(promise, ms = 10000, operationName = 'Operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${operationName} timed out after ${ms}ms`)), ms)
    )
  ]);
}

// ============================================
// Network Status Detection
// ============================================

const NetworkStatus = {
  _listeners: [],
  _isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  _lastCheck: 0,
  _checkInterval: 30000, // Re-check every 30 seconds max

  init() {
    window.addEventListener('online', async () => {
      // Verify actual connectivity before declaring online
      const actuallyOnline = await this.checkActualConnectivity();
      if (actuallyOnline) {
        this._isOnline = true;
        this._notifyListeners('online');
        // Auto-process queue when back online
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.processQueue) {
          SupabaseSync.processQueue();
        }
      }
    });

    window.addEventListener('offline', () => {
      this._isOnline = false;
      this._notifyListeners('offline');
    });
  },

  // Perform actual connectivity test to Supabase
  async checkActualConnectivity() {
    const now = Date.now();
    // Throttle checks to avoid hammering the server
    if (now - this._lastCheck < this._checkInterval && this._isOnline) {
      return this._isOnline;
    }
    this._lastCheck = now;

    try {
      // HEAD request to Supabase REST API (lightweight check)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(SUPABASE_URL + '/rest/v1/', {
        method: 'HEAD',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      return response.ok || response.status === 400; // 400 is expected without proper auth
    } catch (err) {
      // Network error or timeout - actually offline
      return false;
    }
  },

  isOnline() {
    return this._isOnline && navigator.onLine;
  },

  // Async version that performs actual connectivity check
  async isActuallyOnline() {
    if (!navigator.onLine) return false;
    return await this.checkActualConnectivity();
  },

  onStatusChange(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  },

  _notifyListeners(status) {
    this._listeners.forEach(cb => cb(status));
  }
};

// Initialize network status detection
NetworkStatus.init();

// ============================================
// Authentication Functions
// ============================================

const SupabaseAuth = {
  // Get current user
  async getCurrentUser() {
    if (!isSupabaseAvailable()) return null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    } catch (e) {
      console.warn('getCurrentUser failed:', e);
      return null;
    }
  },

  // Get current session
  async getSession() {
    if (!isSupabaseAvailable()) return null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    } catch (e) {
      console.warn('getSession failed:', e);
      return null;
    }
  },

  // Sign up with email and password
  async signUp(email, password, username) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username,
          display_name: username
        }
      }
    });

    if (error) throw error;

    // Create user profile in profiles table
    if (data.user) {
      await SupabaseDB.createProfile(data.user.id, username, email);
    }

    return data;
  },

  // Sign in with email and password
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  },

  // Sign out
  async signOut() {
    // CRITICAL: Clear all user-specific localStorage to prevent data leakage
    // This must happen BEFORE signOut to ensure clean state
    // NOTE: novelshare_offline is NOT cleared - downloads should persist across sessions
    const userDataKeys = [
      'novelshare_library',
      'novelshare_history',
      'novelshare_ratings',
      'novelshare_following',
      'novelshare_profile',
      'novelshare_downloads',
      'novelshare_sync_queue',
      'novelshare_my_works'
      // 'novelshare_offline' - Keep downloads across sessions
    ];
    userDataKeys.forEach(key => localStorage.removeItem(key));

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Sign in with Google
  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/pages/home.html'
      }
    });

    if (error) throw error;
    return data;
  },

  // Send password reset email
  async resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/pages/reset-password.html'
    });

    if (error) throw error;
    return data;
  },

  // Update password
  async updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;
    return data;
  },

  // Listen for auth state changes
  onAuthStateChange(callback) {
    if (!isSupabaseAvailable()) {
      console.warn('Supabase not available for auth state changes');
      return { data: { subscription: { unsubscribe: () => {} } } };
    }
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  },

  // Check if user is logged in
  async isLoggedIn() {
    const session = await this.getSession();
    return !!session;
  }
};

// ============================================
// Database Functions
// ============================================

const SupabaseDB = {
  // --- Profiles ---
  async createProfile(userId, username, email) {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        username: username,
        email: email,
        bio: 'New NovelShare member',
        created_at: new Date().toISOString()
      });

    if (error && error.code !== '23505') throw error; // Ignore duplicate key error
    return data;
  },

  async getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  // Update profile
  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- Novels ---
  async getNovels(limit = 20, offset = 0) {
    const { data, error } = await supabase
      .from('novels')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    const base = filterOutDeleted(data);
    const withCounts = await Promise.all(base.map(async novel => ({
      ...novel,
      total_chapters: await countChapters(novel.id)
    })));
    return withCounts;
  },

  async upsertNovel(novel) {
    if (!novel || !novel.title) return null;
    const payload = {
      title: novel.title,
      description: novel.description || '',
      cover_image: novel.cover_image || novel.cover || null,
      genres: novel.genres || (novel.genre ? [novel.genre] : []),
      status: (novel.status || 'ongoing').toLowerCase(),
      total_chapters: novel.total_chapters || novel.totalChapters || novel.chapters || 0,
      author_id: novel.author_id || novel.authorId || null,
      author: novel.author || 'Unknown'
    };
    if (novel.id) payload.id = novel.id;
    const { data, error } = await supabase.from('novels').upsert(payload).select().limit(1);
    if (error) throw error;
    return data?.[0] || null;
  },

  async getNovelById(novelId) {
    if (!isSupabaseAvailable()) return null;

    // Skip anything the user marked as deleted locally
    const deleted = getDeletedIdSet();
    if (deleted.has(novelId)) return null;

    // Skip Supabase lookup for local-only IDs (work-* prefix)
    if (novelId && novelId.startsWith('work-')) {
      return null;
    }

    // Check if novelId is a valid UUID format
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(novelId);

    if (isUUID) {
      const { data, error } = await supabase
        .from('novels')
        .select('*')
        .eq('id', novelId)
        .single();

      if (!error && data) {
        const chapterCount = await countChapters(data.id);
        return { ...data, total_chapters: chapterCount };
      }
    }

    // Try by slug if not UUID or UUID lookup failed (only for slug-like IDs)
    if (novelId && !novelId.startsWith('work-')) {
      const { data: slugData, error: slugError } = await supabase
        .from('novels')
        .select('*')
        .eq('slug', novelId)
        .maybeSingle();

      if (!slugError && slugData) {
        const chapterCount = await countChapters(slugData.id);
        return { ...slugData, total_chapters: chapterCount };
      }
    }

    // If both failed, return null (don't throw for graceful degradation)
    return null;
  },

  async getNovelsByAuthor(authorId, limit = 50, offset = 0) {
    // First get novels for this author
    const { data: novels, error } = await supabase
      .from('novels')
      .select('*')
      .eq('author_id', authorId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    if (!novels || novels.length === 0) return [];

    // For each novel, get the chapter count from chapters table
    const novelsWithCounts = await Promise.all(
      novels.map(async (novel) => {
        const count = await countChapters(novel.id);
        return {
          ...novel,
          published_chapters: count,
          chapters: count,
          total_chapters: count
        };
      })
    );

    return filterOutDeleted(novelsWithCounts);
  },

  async deleteNovels(ids = [], authorId) {
    if (!ids.length) return [];
    let query = supabase.from('novels').delete().in('id', ids);
    if (authorId) query = query.eq('author_id', authorId);
    const { data, error } = await query.select('id');
    if (error) throw error;

    // Clean up any dangling references so deleted novels don't reappear in UI
    const cleanupTables = [
      { table: 'user_library', column: 'novel_id' },
      { table: 'reading_history', column: 'novel_id' }
    ];

    await Promise.all(cleanupTables.map(async ({ table, column }) => {
      try {
        await supabase.from(table).delete().in(column, ids);
      } catch (cleanupErr) {
        console.warn(`Cleanup failed for ${table}:`, cleanupErr);
      }
    }));

    return data;
  },

  async searchNovels(query) {
    const { data, error } = await supabase
      .from('novels')
      .select('*')
      .ilike('title', `%${query}%`)
      .limit(20);

    if (error) throw error;
    const base = filterOutDeleted(data);
    const withCounts = await Promise.all(base.map(async novel => ({
      ...novel,
      total_chapters: await countChapters(novel.id)
    })));
    return withCounts;
  },

  async getNovelsByGenre(genre) {
    const { data, error } = await supabase
      .from('novels')
      .select('*')
      .contains('genres', [genre])
      .limit(20);

    if (error) throw error;
    const base = filterOutDeleted(data);
    const withCounts = await Promise.all(base.map(async novel => ({
      ...novel,
      total_chapters: await countChapters(novel.id)
    })));
    return withCounts;
  },

  // --- Chapters ---
  async getChapters(novelId) {
    if (!isSupabaseAvailable()) return [];

    // Check if novelId is a valid UUID format
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(novelId);

    if (!isUUID) {
      // For non-UUID IDs (slugs), return empty array - chapters require UUID novel_id
      console.log('getChapters: Non-UUID novel ID, returning empty array');
      return [];
    }

    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .eq('novel_id', novelId)
      .order('chapter_number', { ascending: true });

    if (error) {
      console.warn('getChapters error:', error);
      return [];
    }
    return data || [];
  },

  async getChapter(novelId, chapterNumber) {
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .eq('novel_id', novelId)
      .eq('chapter_number', chapterNumber)
      .single();

    if (error) throw error;
    return data;
  },

  async getChapterById(novelId, chapterId) {
    const query = supabase.from('chapters').select('*').eq('novel_id', novelId).eq('id', chapterId).single();
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async upsertChapter(chapter) {
    if (!chapter || !chapter.novel_id) throw new Error('Chapter requires novel_id');
    const status = (chapter.status || 'draft').toLowerCase();
    const rawNumber = Number(chapter.chapter_number ?? chapter.number ?? chapter.order);
    const hasValidNumber = Number.isFinite(rawNumber) && rawNumber > 0;
    const chapterNumber = status === 'published'
      ? (hasValidNumber ? rawNumber : 1)
      : (hasValidNumber ? rawNumber : Math.max(1, Date.now()));
    const payload = {
      novel_id: chapter.novel_id,
      title: chapter.title || '',
      content: chapter.content || '',
      status,
      chapter_number: chapterNumber,
      updated_at: chapter.updated_at || new Date().toISOString(),
    };
    if (chapter.id) payload.id = chapter.id;
    // Defensive: strip any accidental fields not in schema
    delete payload.author_id;
    const { data, error } = await supabase.from('chapters').upsert(payload).select('id');
    if (error) throw error;
    return { ...payload, id: data?.[0]?.id || chapter.id };
  },

  async deleteChapter(novelId, chapterId) {
    const { data, error } = await supabase
      .from('chapters')
      .delete()
      .eq('novel_id', novelId)
      .eq('id', chapterId)
      .select('id');

    if (error) throw error;
    return data;
  },

  // --- User Library ---
  async getUserLibrary(userId) {
    const { data, error } = await supabase
      .from('user_library')
      .select(`
        *,
        novels (*)
      `)
      .eq('user_id', userId)
      .order('added_at', { ascending: false });

    if (error) throw error;
    return filterOutDeleted(data);
  },

  async addToLibrary(userId, novelId) {
    const { data, error } = await supabase
      .from('user_library')
      .insert({
        user_id: userId,
        novel_id: novelId,
        current_chapter: 0,
        added_at: new Date().toISOString()
      });

    if (error && error.code !== '23505') throw error;
    return data;
  },

  async removeFromLibrary(userId, novelId) {
    const { data, error } = await supabase
      .from('user_library')
      .delete()
      .eq('user_id', userId)
      .eq('novel_id', novelId);

    if (error) throw error;
    return data;
  },

  async updateReadingProgress(userId, novelId, currentChapter) {
    const { data, error } = await supabase
      .from('user_library')
      .update({
        current_chapter: currentChapter,
        last_read_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('novel_id', novelId);

    if (error) throw error;
    return data;
  },

  async isInLibrary(userId, novelId) {
    const { data, error } = await supabase
      .from('user_library')
      .select('id')
      .eq('user_id', userId)
      .eq('novel_id', novelId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  },

  // --- Reading History ---
  async addToHistory(userId, novelId, chapterId, chapterTitle) {
    // chapter_id should be stored as the full UUID string
    // Note: Database schema needs chapter_id as TEXT/UUID, not INTEGER
    const { data, error } = await supabase
      .from('reading_history')
      .upsert({
        user_id: userId,
        novel_id: novelId,
        chapter_id: chapterId, // Store full UUID, not parsed integer
        chapter_title: chapterTitle,
        read_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,novel_id'
      });

    if (error) throw error;
    return data;
  },

  async getReadingHistory(userId, limit = 20) {
    const { data, error } = await supabase
      .from('reading_history')
      .select(`
        *,
        novels (*)
      `)
      .eq('user_id', userId)
      .order('read_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return filterOutDeleted(data);
  },

  async clearHistory(userId) {
    const { data, error } = await supabase
      .from('reading_history')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
    return data;
  },

  // --- Ratings ---
  async rateNovel(userId, novelId, rating) {
    const { data, error } = await supabase
      .from('ratings')
      .upsert({
        user_id: userId,
        novel_id: novelId,
        rating: rating,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,novel_id'
      });

    if (error) throw error;
    return data;
  },

  async getUserRating(userId, novelId) {
    const { data, error } = await supabase
      .from('ratings')
      .select('rating')
      .eq('user_id', userId)
      .eq('novel_id', novelId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.rating || null;
  },

  async getNovelAverageRating(novelId) {
    const { data, error } = await supabase
      .from('ratings')
      .select('rating')
      .eq('novel_id', novelId);

    if (error) throw error;

    if (!data || data.length === 0) return null;

    const sum = data.reduce((acc, r) => acc + r.rating, 0);
    return (sum / data.length).toFixed(1);
  },

  // --- Following Authors ---
  async followAuthor(userId, authorId) {
    const { data, error } = await supabase
      .from('follows')
      .insert({
        follower_id: userId,
        following_id: authorId,
        created_at: new Date().toISOString()
      });

    if (error && error.code !== '23505') throw error;
    return data;
  },

  async unfollowAuthor(userId, authorId) {
    const { data, error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', userId)
      .eq('following_id', authorId);

    if (error) throw error;
    return data;
  },

  async isFollowing(userId, authorId) {
    const { data, error } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', authorId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  },

  async getFollowing(userId) {
    const { data, error } = await supabase
      .from('follows')
      .select(`
        *,
        profiles!follows_following_id_fkey (*)
      `)
      .eq('follower_id', userId);

    if (error) throw error;
    return data;
  }
};

// ============================================
// Helper function to sync with existing localStorage system
// ============================================

const SupabaseSync = {
  // Small helper to persist deleted IDs locally so all pages can hide them
  _addDeletedIds(ids = []) {
    try {
      const key = 'novelshare_deleted_ids';
      const current = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
      ids.filter(Boolean).forEach(id => current.add(id));
      localStorage.setItem(key, JSON.stringify(Array.from(current)));
    } catch {
      /* ignore */
    }
  },

  _purgeLocalCachesFor(ids = []) {
    if (!ids.length) return;
    try {
      // library
      const lib = JSON.parse(localStorage.getItem('novelshare_library') || '[]');
      const cleanedLib = Array.isArray(lib) ? lib.filter(item => item && !ids.includes(item.id) && !ids.includes(item.novelId)) : [];
      localStorage.setItem('novelshare_library', JSON.stringify(cleanedLib));
    } catch {}

    try {
      // history
      const history = JSON.parse(localStorage.getItem('novelshare_history') || '[]');
      const cleanedHistory = Array.isArray(history) ? history.filter(item => item && !ids.includes(item.novelId)) : [];
      localStorage.setItem('novelshare_history', JSON.stringify(cleanedHistory));
    } catch {}

    try {
      // cached chapters
      const chapters = JSON.parse(localStorage.getItem('novelshare_chapters') || '{}');
      ids.forEach(id => { if (chapters[id]) delete chapters[id]; });
      localStorage.setItem('novelshare_chapters', JSON.stringify(chapters));
    } catch {}

    try {
      // offline downloads
      const offline = JSON.parse(localStorage.getItem('novelshare_offline') || '{}');
      let changed = false;
      ids.forEach(id => {
        if (offline[id]) {
          delete offline[id];
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem('novelshare_offline', JSON.stringify(offline));
      }
    } catch {}
  },

  // Sync local library with Supabase
  async syncLibrary() {
    if (!isSupabaseAvailable()) return null;
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return;

    // Backup current library before clearing (prevents data loss on network failure)
    const backupLibrary = localStorage.getItem('novelshare_library');

    // CRITICAL: Clear localStorage FIRST to prevent data leakage between users
    // Without this, User A's library would leak into User B's when they log in
    localStorage.removeItem('novelshare_library');

    try {
      const cloudLibrary = await SupabaseDB.getUserLibrary(user.id);

      // Drop any cloud rows pointing at novels that no longer exist
      const staleEntries = cloudLibrary.filter(item => !item?.novels);
      if (staleEntries.length) {
        const staleNovelIds = staleEntries.map(item => item?.novel_id).filter(Boolean);
        if (staleNovelIds.length) {
          try {
            await supabase.from('user_library')
              .delete()
              .eq('user_id', user.id)
              .in('novel_id', staleNovelIds);
          } catch (cleanupErr) {
            console.warn('Failed to purge stale library rows:', cleanupErr);
          }
          this._addDeletedIds(staleNovelIds);
          this._purgeLocalCachesFor(staleNovelIds);
        }
      }

      const validCloudLibrary = cloudLibrary.filter(item => item?.novels);

      // Convert to local format and fetch actual chapter counts
      const localFormat = await Promise.all(validCloudLibrary.map(async (item) => {
        // Fetch actual chapter count from chapters table
        let actualChapterCount = item.novels?.total_chapters || 0;
        try {
          actualChapterCount = await countChapters(item.novel_id);
        } catch (e) {
          // Use total_chapters as fallback
        }

        const addedAtMs = item.added_at ? new Date(item.added_at).getTime() : Date.now();
        const lastReadMs = item.last_read_at
          ? new Date(item.last_read_at).getTime()
          : (item.updated_at ? new Date(item.updated_at).getTime() : addedAtMs);

        return {
          id: item.novel_id,
          novelId: item.novel_id,
          title: item.novels?.title || 'Unknown',
          author: item.novels?.author || 'Unknown',
          cover: item.novels?.cover_image || null,
          coverImage: item.novels?.cover_image || null,
          genre: Array.isArray(item.novels?.genres) ? item.novels.genres[0] : (item.novels?.genre || ''),
          status: item.novels?.status || 'ongoing',
          description: item.novels?.description || '',
          rating: item.novels?.rating || item.novels?.avg_rating || 0,
          totalChapters: actualChapterCount,
          chapters: actualChapterCount,
          currentChapter: item.current_chapter || 0,
          progress: item.progress || 0,
          lastRead: lastReadMs,
          addedAt: addedAtMs
        };
      }));

      // Update localStorage
      localStorage.setItem('novelshare_library', JSON.stringify(localFormat));

      return localFormat;
    } catch (error) {
      console.error('Failed to sync library:', error);
      // Restore backup on failure to prevent data loss
      if (backupLibrary) {
        localStorage.setItem('novelshare_library', backupLibrary);
      }
      return null;
    }
  },

  // Sync reading history
  async syncHistory() {
    if (!isSupabaseAvailable()) return null;
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return;

    // Backup current history before clearing (prevents data loss on network failure)
    const backupHistory = localStorage.getItem('novelshare_history');

    // CRITICAL: Clear localStorage FIRST to prevent data leakage between users
    localStorage.removeItem('novelshare_history');

    try {
      const cloudHistory = await SupabaseDB.getReadingHistory(user.id);
      const deleted = getDeletedIdSet();

      const localFormat = (cloudHistory || []).filter(item => item && !deleted.has(item.novel_id)).map(item => ({
        novelId: item.novel_id,
        chapterId: item.chapter_id,
        novelTitle: item.novels?.title || 'Unknown',
        chapterTitle: item.chapter_title,
        coverImage: item.novels?.cover_image || null,
        timestamp: new Date(item.read_at).getTime()
      }));

      localStorage.setItem('novelshare_history', JSON.stringify(localFormat));

      return localFormat;
    } catch (error) {
      console.error('Failed to sync history:', error);
      // Restore backup on failure to prevent data loss
      if (backupHistory) {
        localStorage.setItem('novelshare_history', backupHistory);
      }
      return null;
    }
  },

  // Sync chapters for novels in library
  async syncChapters() {
    if (!isSupabaseAvailable()) return null;
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return;

    try {
      // Get user's library to know which novels to sync chapters for
      const library = await SupabaseDB.getUserLibrary(user.id);
      if (!Array.isArray(library)) return null;

      const chapterStore = JSON.parse(localStorage.getItem('novelshare_chapters') || '{}');

      for (const item of library) {
        const novelId = item.novel_id || item.novels?.id;
        if (!novelId) continue;

        try {
          const supaChapters = await SupabaseDB.getChapters(novelId);
          if (Array.isArray(supaChapters)) {
            const refreshed = supaChapters.map(ch => ({
              id: ch.id,
              title: ch.title || 'Untitled',
              content: ch.content || '',
              // Preserve server status so drafts don't get mis-labeled
              status: (ch.status || 'published').toLowerCase(),
              number: ch.chapter_number || ch.number || ch.order,
              createdAt: ch.created_at || ch.updated_at,
              updatedAt: ch.updated_at || ch.created_at
            }));

            // Merge with local chapters using timestamp-based conflict resolution
            // If same chapter exists locally and remotely, keep the newer version
            const localChapters = Array.isArray(chapterStore[novelId]) ? chapterStore[novelId] : [];
            const merged = [...refreshed];
            localChapters.forEach(localCh => {
              const idx = merged.findIndex(existing => existing.id === localCh.id);
              if (idx >= 0) {
                // Timestamp-based conflict resolution: keep the newer version
                const localTime = localCh.updatedAt ? new Date(localCh.updatedAt).getTime() : 0;
                const remoteTime = merged[idx].updatedAt ? new Date(merged[idx].updatedAt).getTime() : 0;

                if (localTime > remoteTime) {
                  // Local is newer - keep local content, merge with remote metadata
                  merged[idx] = {
                    ...merged[idx],
                    title: localCh.title || merged[idx].title,
                    content: localCh.content || merged[idx].content,
                    status: (localCh.status || merged[idx].status || 'published').toLowerCase(),
                    updatedAt: localCh.updatedAt
                  };
                } else {
                  // Remote is newer - keep remote, but preserve local-only status if draft
                  merged[idx] = {
                    ...merged[idx],
                    status: (localCh.status === 'draft' ? 'draft' : merged[idx].status || 'published').toLowerCase()
                  };
                }
              } else {
                // Local-only chapter (not in cloud) - add it
                merged.push(localCh);
              }
            });
            chapterStore[novelId] = merged;
          }
        } catch (err) {
          console.warn('Failed to sync chapters for novel:', novelId, err);
        }
      }

      localStorage.setItem('novelshare_chapters', JSON.stringify(chapterStore));
      return chapterStore;
    } catch (error) {
      console.error('Failed to sync chapters:', error);
      return null;
    }
  },

  // Full sync on login - uses Promise.allSettled to handle partial failures gracefully
  // Each sync operation has a 10-second timeout to prevent hanging
  async fullSync() {
    const SYNC_TIMEOUT = 10000; // 10 seconds per operation

    const results = await Promise.allSettled([
      withTimeout(this.syncLibrary(), SYNC_TIMEOUT, 'Library sync'),
      withTimeout(this.syncHistory(), SYNC_TIMEOUT, 'History sync'),
      withTimeout(this.syncChapters(), SYNC_TIMEOUT, 'Chapters sync')
    ]);

    // Log any failures but don't throw - partial sync is better than no sync
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.warn('Some syncs failed:', failures.map(f => f.reason));
    }

    return {
      library: results[0].status === 'fulfilled' ? results[0].value : null,
      history: results[1].status === 'fulfilled' ? results[1].value : null,
      chapters: results[2].status === 'fulfilled' ? results[2].value : null,
      failures: failures.length
    };
  },

  // ============================================
  // PUSH Functions (Local → Cloud)
  // ============================================

  // Push library item to cloud
  async pushLibraryItem(novelId, action = 'add', novelData = undefined) {
    if (!isSupabaseAvailable()) return { error: 'Supabase not available' };

    // Validate novel ID format - all Supabase novels should have UUID IDs
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(novelId);
    if (!isUUID) {
      // Non-UUID IDs are likely local-only works (work-*) or old slug IDs
      // These can't be synced to cloud - they don't exist in Supabase novels table
      console.warn('Cannot sync non-UUID novel to cloud:', novelId);
      return { skipped: true, reason: 'Non-UUID novel ID - local only' };
    }

    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    if (!NetworkStatus.isOnline()) {
      SyncQueue.add({ type: 'library', novelId, action, userId: user.id, novelData });
      return { queued: true };
    }

    try {
      // Skip novel upsert - novels already exist in database and users can't create them (RLS)
      // Just add the library entry directly

      if (action === 'add') {
        await SupabaseDB.addToLibrary(user.id, novelId);
      } else if (action === 'remove') {
        await SupabaseDB.removeFromLibrary(user.id, novelId);
      }
      return { success: true };
    } catch (error) {
      console.error('Push library failed:', error);
      SyncQueue.add({ type: 'library', novelId, action, userId: user.id });
      return { queued: true, error };
    }
  },

  // Push rating to cloud
  async pushRating(novelId, rating) {
    if (!isSupabaseAvailable()) return { error: 'Supabase not available' };

    // Skip non-UUID novel IDs (e.g., slug-based IDs like "lord-of-mysteries")
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(novelId);
    if (!isUUID) {
      console.log('Skipping cloud sync for non-UUID novel ID:', novelId);
      return { skipped: true, reason: 'Non-UUID novel ID' };
    }

    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    if (!NetworkStatus.isOnline()) {
      SyncQueue.add({ type: 'rating', novelId, rating, userId: user.id });
      return { queued: true };
    }

    try {
      await SupabaseDB.rateNovel(user.id, novelId, rating);
      return { success: true };
    } catch (error) {
      console.error('Push rating failed:', error);
      SyncQueue.add({ type: 'rating', novelId, rating, userId: user.id });
      return { queued: true, error };
    }
  },

  // Push reading progress to cloud
  async pushReadingProgress(novelId, currentChapter) {
    if (!isSupabaseAvailable()) return { error: 'Supabase not available' };
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    if (!NetworkStatus.isOnline()) {
      SyncQueue.add({ type: 'progress', novelId, currentChapter, userId: user.id });
      return { queued: true };
    }

    try {
      await SupabaseDB.updateReadingProgress(user.id, novelId, currentChapter);
      return { success: true };
    } catch (error) {
      console.error('Push progress failed:', error);
      SyncQueue.add({ type: 'progress', novelId, currentChapter, userId: user.id });
      return { queued: true, error };
    }
  },

  // Push follow/unfollow to cloud
  async pushFollow(authorId, action = 'follow') {
    if (!isSupabaseAvailable()) return { error: 'Supabase not available' };
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    if (!NetworkStatus.isOnline()) {
      SyncQueue.add({ type: 'follow', authorId, action, userId: user.id });
      return { queued: true };
    }

    try {
      if (action === 'follow') {
        await SupabaseDB.followAuthor(user.id, authorId);
      } else {
        await SupabaseDB.unfollowAuthor(user.id, authorId);
      }
      return { success: true };
    } catch (error) {
      console.error('Push follow failed:', error);
      SyncQueue.add({ type: 'follow', authorId, action, userId: user.id });
      return { queued: true, error };
    }
  },

  // Push history entry to cloud
  async pushHistoryEntry(novelId, chapterId, chapterTitle, novelData = undefined) {
    if (!isSupabaseAvailable()) return { error: 'Supabase not available' };
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    if (!NetworkStatus.isOnline()) {
      SyncQueue.add({ type: 'history', novelId, chapterId, chapterTitle, userId: user.id, novelData });
      return { queued: true };
    }

    try {
      if (novelData) {
        try {
          await SupabaseDB.upsertNovel({
            id: novelId,
            title: novelData.title,
            author: novelData.author,
            cover_image: novelData.coverImage || novelData.cover,
            total_chapters: novelData.totalChapters,
            status: novelData.status,
            genres: novelData.genre ? [novelData.genre] : []
          });
        } catch (e) {
          console.warn('History upsert failed (continuing):', e);
        }
      }
      await SupabaseDB.addToHistory(user.id, novelId, chapterId, chapterTitle);
      return { success: true };
    } catch (error) {
      console.error('Push history failed:', error);
      SyncQueue.add({ type: 'history', novelId, chapterId, chapterTitle, userId: user.id, novelData });
      return { queued: true, error };
    }
  },

  // ============================================
  // Queue Processing
  // ============================================

  async processQueue() {
    if (!NetworkStatus.isOnline()) return { processed: 0, remaining: SyncQueue.length() };

    const queue = SyncQueue.getQueue();
    if (queue.length === 0) return { processed: 0, remaining: 0 };

    console.log(`Processing ${queue.length} queued operations...`);
    let processed = 0;

    for (const operation of queue) {
      try {
        let success = false;

        switch (operation.type) {
          case 'library':
            if (operation.action === 'add') {
              if (operation.novelData) {
                try {
                  await SupabaseDB.upsertNovel(operation.novelData);
                } catch (e) {
                  console.warn('Upsert during queue failed:', e);
                }
              }
              await SupabaseDB.addToLibrary(operation.userId, operation.novelId);
            } else {
              await SupabaseDB.removeFromLibrary(operation.userId, operation.novelId);
            }
            success = true;
            break;

          case 'rating':
            await SupabaseDB.rateNovel(operation.userId, operation.novelId, operation.rating);
            success = true;
            break;

          case 'progress':
            await SupabaseDB.updateReadingProgress(operation.userId, operation.novelId, operation.currentChapter);
            success = true;
            break;

          case 'follow':
            if (operation.action === 'follow') {
              await SupabaseDB.followAuthor(operation.userId, operation.authorId);
            } else {
              await SupabaseDB.unfollowAuthor(operation.userId, operation.authorId);
            }
            success = true;
            break;

          case 'history':
            if (operation.novelData) {
              try {
                await SupabaseDB.upsertNovel(operation.novelData);
              } catch (e) {
                console.warn('Upsert during history queue failed:', e);
              }
            }
            await SupabaseDB.addToHistory(operation.userId, operation.novelId, operation.chapterId, operation.chapterTitle);
            success = true;
            break;
        }

        if (success) {
          SyncQueue.remove(operation.id);
          processed++;
        }
      } catch (error) {
        console.error(`Failed to process operation ${operation.id}:`, error);
        // Increment retry count
        const queue = SyncQueue.getQueue();
        const opIndex = queue.findIndex(op => op.id === operation.id);
        if (opIndex !== -1) {
          queue[opIndex].retries = (queue[opIndex].retries || 0) + 1;
          // Remove after 3 failed retries
          if (queue[opIndex].retries >= 3) {
            queue.splice(opIndex, 1);
          }
          SyncQueue.saveQueue(queue);
        }
      }
    }

    console.log(`Queue processing complete. ${processed} processed, ${SyncQueue.length()} remaining.`);
    return { processed, remaining: SyncQueue.length() };
  },

  // ============================================
  // Conflict Detection
  // ============================================

  async detectConflicts() {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { hasConflicts: false, conflicts: [] };

    const conflicts = [];

    try {
      // Check library conflicts
      const localLibrary = JSON.parse(localStorage.getItem('novelshare_library') || '[]');
      const cloudLibrary = await SupabaseDB.getUserLibrary(user.id);

      const localIds = new Set(localLibrary.map(item => item.novelId));
      const cloudIds = new Set(cloudLibrary.map(item => item.novel_id));

      // Items in local but not cloud
      const localOnly = localLibrary.filter(item => !cloudIds.has(item.novelId));
      if (localOnly.length > 0) {
        conflicts.push({
          type: 'library_local_only',
          message: `${localOnly.length} item(s) in local library not synced to cloud`,
          items: localOnly
        });
      }

      // Items in cloud but not local
      const cloudOnly = cloudLibrary.filter(item => !localIds.has(item.novel_id));
      if (cloudOnly.length > 0) {
        conflicts.push({
          type: 'library_cloud_only',
          message: `${cloudOnly.length} item(s) in cloud not in local library`,
          items: cloudOnly
        });
      }

      // Check for pending queue items
      const queueLength = SyncQueue.length();
      if (queueLength > 0) {
        conflicts.push({
          type: 'pending_sync',
          message: `${queueLength} operation(s) pending sync`,
          items: SyncQueue.getQueue()
        });
      }

    } catch (error) {
      console.error('Conflict detection failed:', error);
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts
    };
  },

  // Resolve conflicts by pushing local items to cloud
  async resolveConflicts(strategy = 'push_local') {
    const user = await SupabaseAuth.getCurrentUser();
    if (!user) return { error: 'Not logged in' };

    const { conflicts } = await this.detectConflicts();
    let resolved = 0;

    for (const conflict of conflicts) {
      if (conflict.type === 'library_local_only' && strategy === 'push_local') {
        // Push local items to cloud
        for (const item of conflict.items) {
          try {
            await SupabaseDB.addToLibrary(user.id, item.novelId);
            resolved++;
          } catch (e) {
            console.error('Failed to resolve conflict:', e);
          }
        }
      } else if (conflict.type === 'pending_sync') {
        // Process the queue
        const result = await this.processQueue();
        resolved += result.processed;
      }
    }

    return { resolved, remaining: (await this.detectConflicts()).conflicts.length };
  },

  // Get sync status
  getSyncStatus() {
    return {
      isOnline: NetworkStatus.isOnline(),
      queueLength: SyncQueue.length(),
      queue: SyncQueue.getQueue()
    };
  }
};

// Export for use in other files
window.SupabaseAuth = SupabaseAuth;
window.SupabaseDB = SupabaseDB;
window.SupabaseSync = SupabaseSync;
window.SyncQueue = SyncQueue;
window.NetworkStatus = NetworkStatus;
window.supabaseClient = supabase;

// ============================================
// Auth State Listener - Clear data on logout
// ============================================
// This catches logout events from ANY source (browser close, token expiry, etc.)
if (isSupabaseAvailable()) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      // Clear all user-specific localStorage
      const userDataKeys = [
        'novelshare_library',
        'novelshare_history',
        'novelshare_ratings',
        'novelshare_following',
        'novelshare_profile',
        'novelshare_downloads',
        'novelshare_sync_queue'
      ];
      userDataKeys.forEach(key => localStorage.removeItem(key));
      console.log('User signed out - localStorage cleared');
    }
  });
}

console.log('Supabase initialized successfully');
