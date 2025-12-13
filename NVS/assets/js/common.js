/* ============================================
   NovelShare - Shared JavaScript Components
   ============================================ */

// ============================================
// Navigation Helpers (relative-proof redirects)
// ============================================
function navigateToPage(pageName) {
  // Handle redirects that work from any directory level
  const currentPath = window.location.pathname;
  const isInPagesDir = currentPath.includes('/pages/');

  if (isInPagesDir) {
    // Already in pages directory - use direct filename
    window.location.href = pageName;
  } else {
    // In root or other directory - prefix with pages/
    window.location.href = 'pages/' + pageName;
  }
}

// ============================================
// Safe Storage Wrapper (handles localStorage errors)
// ============================================
const SafeStorage = {
  // Check if localStorage is available
  isAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  },

  // Safe getItem with fallback
  getItem(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? value : defaultValue;
    } catch (e) {
      console.warn(`SafeStorage: Failed to get "${key}"`, e.message);
      return defaultValue;
    }
  },

  // Safe setItem with quota handling
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('SafeStorage: Storage quota exceeded. Attempting cleanup...');
        // Try to free up space by removing old/large items
        this.cleanup();
        // Retry once
        try {
          localStorage.setItem(key, value);
          return true;
        } catch (retryError) {
          console.error('SafeStorage: Still unable to save after cleanup', retryError.message);
          this.showStorageWarning();
          return false;
        }
      }
      console.error(`SafeStorage: Failed to set "${key}"`, e.message);
      return false;
    }
  },

  // Safe removeItem
  removeItem(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn(`SafeStorage: Failed to remove "${key}"`, e.message);
      return false;
    }
  },

  // Get JSON with parsing and error handling
  getJSON(key, defaultValue = null) {
    try {
      const value = this.getItem(key);
      if (value === null) return defaultValue;
      return JSON.parse(value);
    } catch (e) {
      console.warn(`SafeStorage: Failed to parse JSON for "${key}"`, e.message);
      return defaultValue;
    }
  },

  // Set JSON with stringifying and error handling
  setJSON(key, value) {
    try {
      return this.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`SafeStorage: Failed to stringify JSON for "${key}"`, e.message);
      return false;
    }
  },

  // Get current storage usage
  getUsage() {
    try {
      let total = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          total += localStorage.getItem(key).length * 2; // UTF-16 = 2 bytes per char
        }
      }
      return {
        used: total,
        usedMB: (total / (1024 * 1024)).toFixed(2),
        // Most browsers have 5-10MB limit
        estimatedLimit: 5 * 1024 * 1024,
        percentUsed: ((total / (5 * 1024 * 1024)) * 100).toFixed(1)
      };
    } catch (e) {
      return { used: 0, usedMB: '0', estimatedLimit: 0, percentUsed: '0' };
    }
  },

  // Cleanup old/unnecessary data to free space
  cleanup() {
    try {
      // Items that can be safely trimmed or removed
      const trimmableKeys = [
        'novelshare_history',  // Can trim old entries
        'novelshare_offline'   // Can remove cached chapters
      ];

      trimmableKeys.forEach(key => {
        const data = this.getJSON(key, []);
        if (Array.isArray(data) && data.length > 20) {
          // Keep only last 20 items
          this.setJSON(key, data.slice(-20));
        }
      });

      console.log('SafeStorage: Cleanup completed');
    } catch (e) {
      console.warn('SafeStorage: Cleanup failed', e.message);
    }
  },

  // Show warning to user about storage issues
  showStorageWarning() {
    if (typeof showToast === 'function') {
      showToast('Storage is full. Some data may not be saved.', 'warning');
    }
  }
};

// ============================================
// Search Functionality
// ============================================
function initSearch(inputSelector, itemsSelector, searchKey = 'textContent') {
  const searchInput = document.querySelector(inputSelector);
  const items = document.querySelectorAll(itemsSelector);

  if (!searchInput || !items.length) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    items.forEach(item => {
      const text = searchKey === 'textContent'
        ? item.textContent.toLowerCase()
        : item.getAttribute(searchKey)?.toLowerCase() || '';

      if (text.includes(query)) {
        item.style.display = '';
        item.classList.remove('hidden');
      } else {
        item.style.display = 'none';
        item.classList.add('hidden');
      }
    });

    // Update empty state if exists
    const emptyState = document.querySelector('.empty-state');
    const visibleItems = document.querySelectorAll(`${itemsSelector}:not(.hidden)`);
    if (emptyState) {
      emptyState.style.display = visibleItems.length === 0 ? 'block' : 'none';
    }
  });
}

// ============================================
// Filter Pills Functionality
// ============================================
function initFilterPills(pillsSelector, itemsSelector, filterAttr = 'data-category') {
  // Exclude pills that have custom handling (those inside a [data-filter-type] container)
  const pills = Array.from(document.querySelectorAll(pillsSelector)).filter(pill => !pill.closest('[data-filter-type]'));
  const items = document.querySelectorAll(itemsSelector);

  if (!pills.length || !items.length) return;

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      // Update active state
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const filterValue = pill.dataset.filter || pill.textContent.toLowerCase().trim();

      // Filter items
      items.forEach(item => {
        const itemValue = item.getAttribute(filterAttr)?.toLowerCase() || '';

        if (filterValue === 'all' || itemValue.includes(filterValue)) {
          item.style.display = '';
          item.classList.remove('hidden');
        } else {
          item.style.display = 'none';
          item.classList.add('hidden');
        }
      });

      // Update results count if exists
      updateResultsCount(itemsSelector);
    });
  });
}

// ============================================
// Genre Sidebar Filter
// ============================================
function initGenreFilter(genreListSelector, itemsSelector) {
  const genreItems = document.querySelectorAll(`${genreListSelector} li`);
  const items = document.querySelectorAll(itemsSelector);

  if (!genreItems.length || !items.length) return;

  genreItems.forEach(genre => {
    genre.addEventListener('click', () => {
      // Update active state
      genreItems.forEach(g => g.classList.remove('active'));
      genre.classList.add('active');

      const filterValue = genre.dataset.genre || genre.textContent.toLowerCase().trim();

      // Filter items
      items.forEach(item => {
        const itemGenre = item.getAttribute('data-genre')?.toLowerCase() || '';

        if (filterValue === 'all' || itemGenre.includes(filterValue)) {
          item.style.display = '';
          item.classList.remove('hidden');
        } else {
          item.style.display = 'none';
          item.classList.add('hidden');
        }
      });

      // Update results count
      updateResultsCount(itemsSelector);
    });
  });
}

// ============================================
// Pagination
// ============================================
function initPagination(options = {}) {
  const {
    containerSelector = '.pagination',
    itemsSelector = '.card',
    itemsPerPage = 12
  } = options;

  const container = document.querySelector(containerSelector);
  const items = document.querySelectorAll(itemsSelector);

  if (!container || !items.length) return;

  let currentPage = 1;
  const totalPages = Math.ceil(items.length / itemsPerPage);

  function showPage(page) {
    currentPage = page;
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;

    items.forEach((item, index) => {
      if (index >= start && index < end) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });

    renderPagination();
  }

  function renderPagination() {
    container.innerHTML = '';

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-link';
    prevBtn.textContent = '← Previous';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => showPage(currentPage - 1));
    container.appendChild(prevBtn);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-link ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => showPage(i));
        container.appendChild(pageBtn);
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'page-ellipsis';
        ellipsis.textContent = '...';
        container.appendChild(ellipsis);
      }
    }

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-link';
    nextBtn.textContent = 'Next →';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => showPage(currentPage + 1));
    container.appendChild(nextBtn);
  }

  showPage(1);
}

// ============================================
// Tabs Component
// ============================================
function initTabs(tabsSelector, contentSelector) {
  const tabs = document.querySelectorAll(tabsSelector);
  const contents = document.querySelectorAll(contentSelector);

  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;

      // Update tab states
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update content visibility
      if (contents.length) {
        contents.forEach(content => {
          if (content.id === targetId || content.dataset.tab === targetId) {
            content.style.display = '';
            content.classList.add('active');
          } else {
            content.style.display = 'none';
            content.classList.remove('active');
          }
        });
      }
    });
  });
}

// ============================================
// Toast Notifications
// ============================================
function showToast(message, duration = 3000) {
  // Remove existing toast if any
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Show toast
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Hide after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// ============================================
// Add to Library Button
// ============================================
function initAddToLibrary(buttonSelector) {
  const buttons = document.querySelectorAll(buttonSelector);

  buttons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();

      const isAdded = button.classList.toggle('added');
      const novelId = button.dataset.novelId;

      if (isAdded) {
        showToast('Added to your library!');
        // In production, make API call here
        // saveToLibrary(novelId);
      } else {
        showToast('Removed from library');
        // removeFromLibrary(novelId);
      }
    });
  });
}

// ============================================
// Form Validation
// ============================================
const Validators = {
  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },

  password: (value, minLength = 8) => {
    return value.length >= minLength;
  },

  username: (value, minLength = 3) => {
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    return value.length >= minLength && usernameRegex.test(value);
  },

  required: (value) => {
    return value.trim().length > 0;
  },

  match: (value, matchValue) => {
    return value === matchValue;
  }
};

function validateField(input, validationType, options = {}) {
  const value = input.value;
  let isValid = false;

  switch (validationType) {
    case 'email':
      isValid = Validators.email(value);
      break;
    case 'password':
      isValid = Validators.password(value, options.minLength);
      break;
    case 'username':
      isValid = Validators.username(value, options.minLength);
      break;
    case 'required':
      isValid = Validators.required(value);
      break;
    case 'match':
      isValid = Validators.match(value, options.matchValue);
      break;
    default:
      isValid = true;
  }

  // Update input state
  input.classList.remove('valid', 'invalid');
  if (value.length > 0) {
    input.classList.add(isValid ? 'valid' : 'invalid');
  }

  return isValid;
}

// ============================================
// Password Strength Indicator
// ============================================
function getPasswordStrength(password) {
  let strength = 0;

  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;

  const levels = ['', 'weak', 'fair', 'good', 'strong', 'strong'];
  return {
    score: strength,
    level: levels[strength]
  };
}

function initPasswordStrength(inputSelector, barSelector) {
  const input = document.querySelector(inputSelector);
  const bar = document.querySelector(barSelector);

  if (!input || !bar) return;

  input.addEventListener('input', () => {
    const { level } = getPasswordStrength(input.value);
    bar.className = 'password-strength-fill';
    if (level) {
      bar.classList.add(level);
    }
  });
}

// ============================================
// Dropdown / TOC Toggle
// ============================================
function initDropdown(toggleSelector, dropdownSelector) {
  const toggle = document.querySelector(toggleSelector);
  const dropdown = document.querySelector(dropdownSelector);

  if (!toggle || !dropdown) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle('open');
    toggle.classList.toggle('active', isOpen);
  });

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !toggle.contains(e.target)) {
      dropdown.classList.remove('open');
      toggle.classList.remove('active');
    }
  });

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.classList.remove('open');
      toggle.classList.remove('active');
    }
  });
}

// ============================================
// Helper Functions
// ============================================
function updateResultsCount(itemsSelector) {
  const countElement = document.querySelector('.results-count');
  if (!countElement) return;

  const visibleItems = document.querySelectorAll(`${itemsSelector}:not(.hidden):not([style*="display: none"])`);
  countElement.textContent = `${visibleItems.length} results`;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ============================================
// Initialize on DOM Load
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Auto-initialize common components if they exist
  initPasswordToggle();

  // Initialize search if search bar exists
  const searchBar = document.querySelector('.search-bar input, .search input');
  if (searchBar) {
    initSearch('.search-bar input, .search input', '.card');
  }

  // Initialize filter pills if they exist
  const filterPills = document.querySelector('.pill-row .pill, .filters .pill');
  if (filterPills) {
    initFilterPills('.pill-row .pill, .filters .pill', '.card');
  }

  // Initialize genre filter if sidebar exists
  const genreList = document.querySelector('.genre-list');
  if (genreList) {
    initGenreFilter('.genre-list', '.card');
  }

  // Initialize tabs if they exist
  const tabs = document.querySelector('.tabs .tab');
  if (tabs) {
    initTabs('.tabs .tab', '.tab-content');
  }

  // Global profile dropdown toggle (supports multiple wrappers, works via delegation)
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.profile-wrapper .profile');
    const isInsideDropdown = event.target.closest('.profile-dropdown');

    // Close if clicking outside any dropdown/profile
    if (!btn && !isInsideDropdown) {
      document.querySelectorAll('.profile-dropdown.open').forEach(dd => dd.classList.remove('open'));
      return;
    }

    if (btn) {
      const wrapper = btn.closest('.profile-wrapper');
      const dropdown = wrapper ? wrapper.querySelector('.profile-dropdown') : null;
      if (dropdown) {
        event.preventDefault();
        event.stopPropagation();
        // Close other open dropdowns
        document.querySelectorAll('.profile-dropdown.open').forEach(dd => {
          if (dd !== dropdown) dd.classList.remove('open');
        });
        dropdown.classList.toggle('open');
      }
    }
  });

  // Logout handlers (ensure full cleanup instead of just following link)
  const logoutLinks = document.querySelectorAll('.logout');
  if (logoutLinks.length) {
    logoutLinks.forEach(link => {
      link.addEventListener('click', async (event) => {
        event.preventDefault();
        try {
          if (typeof GuestMode !== 'undefined' && GuestMode.fullLogout) {
            await GuestMode.fullLogout();
            return;
          }
        } catch (err) {
          console.warn('Logout failed, fallback redirect', err);
        }
        navigateToPage('login.html');
      });
    });
  }

  // Block library navigation for guests
  const libraryLinks = document.querySelectorAll('a[href*="library.html"]');
  if (libraryLinks.length) {
    libraryLinks.forEach(link => {
      link.addEventListener('click', (event) => {
        if (typeof GuestMode !== 'undefined' && GuestMode.isGuest && GuestMode.isGuest()) {
          event.preventDefault();
          showToast('Please sign up to access your library');
          setTimeout(() => { navigateToPage('signup.html'); }, 1200);
        }
      }, { passive: false });
    });
  }

  // Initialize TOC dropdown if it exists
  const tocBtn = document.querySelector('.toc-btn');
  if (tocBtn) {
    initDropdown('.toc-btn', '.toc-dropdown');
  }

  // Initialize add to library buttons
  const addLibraryBtns = document.querySelector('.add-btn[data-novel-id]');
  if (addLibraryBtns) {
    initAddToLibrary('.add-btn[data-novel-id]');
  }
});

// ============================================
// Rating System
// ============================================
const RatingSystem = {
  // Get all ratings from localStorage
  getAllRatings() {
    const ratings = localStorage.getItem('novelshare_ratings');
    return ratings ? JSON.parse(ratings) : {};
  },

  // Get rating for a specific novel
  getRating(novelId) {
    const ratings = this.getAllRatings();
    return ratings[novelId] || null;
  },

  // Save rating for a novel
  saveRating(novelId, rating, review = '') {
    const ratings = this.getAllRatings();
    ratings[novelId] = {
      rating: rating,
      review: review,
      timestamp: Date.now()
    };
    localStorage.setItem('novelshare_ratings', JSON.stringify(ratings));

    // Push to Supabase when logged in
    if (typeof GuestMode !== 'undefined' && !GuestMode.isGuest() && typeof SupabaseSync !== 'undefined' && SupabaseSync.pushRating) {
      SupabaseSync.pushRating(novelId, rating, review);
    }

    return ratings[novelId];
  },

  // Remove rating
  removeRating(novelId) {
    const ratings = this.getAllRatings();
    delete ratings[novelId];
    localStorage.setItem('novelshare_ratings', JSON.stringify(ratings));
  },

  // Calculate average rating (mock - would be from API in production)
  calculateAverage(novelId) {
    const rating = this.getRating(novelId);
    // In production, this would aggregate all user ratings
    return rating ? rating.rating : 0;
  },

  // Render star rating display
  renderStars(rating, maxStars = 5) {
    let html = '';
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;

    for (let i = 1; i <= maxStars; i++) {
      if (i <= fullStars) {
        html += '<span class="star filled">★</span>';
      } else if (i === fullStars + 1 && hasHalf) {
        html += '<span class="star half">★</span>';
      } else {
        html += '<span class="star empty">☆</span>';
      }
    }
    return html;
  },

  // Initialize interactive star rating with touch support
  initStarRating(containerSelector, options = {}) {
    const containers = document.querySelectorAll(containerSelector);
    const { maxStars = 5, onRate = null, initialRating = 0 } = options;

    containers.forEach(container => {
      let currentRating = initialRating;
      let isTouching = false;

      // Create stars
      container.innerHTML = '';
      for (let i = 1; i <= maxStars; i++) {
        const star = document.createElement('span');
        star.className = 'star-input';
        star.dataset.value = i;
        star.textContent = '★';

        // Mouse events (for desktop)
        star.addEventListener('mouseenter', () => {
          if (!isTouching) highlightStars(container, i);
        });
        star.addEventListener('mouseleave', () => {
          if (!isTouching) highlightStars(container, currentRating);
        });

        // Click/tap to select rating
        star.addEventListener('click', (e) => {
          e.preventDefault();
          currentRating = i;
          highlightStars(container, i);
          container.dataset.rating = i;
          if (onRate) onRate(i);
        });

        container.appendChild(star);
      }

      // Touch events for mobile - allow sliding to select stars
      // Use CSS touch-action: none on container to prevent scroll without blocking page scroll
      container.style.touchAction = 'manipulation';

      container.addEventListener('touchstart', (e) => {
        isTouching = true;
        handleTouchRating(e);
      }, { passive: true });

      container.addEventListener('touchmove', (e) => {
        // Only prevent default if actively rating (touch started on container)
        if (isTouching) {
          handleTouchRating(e);
        }
      }, { passive: true });

      container.addEventListener('touchend', (e) => {
        // Commit the rating on touch end
        const stars = container.querySelectorAll('.star-input.active');
        if (stars.length > 0) {
          currentRating = stars.length;
          container.dataset.rating = currentRating;
          if (onRate) onRate(currentRating);
        }
        isTouching = false;
      }, { passive: true });

      function handleTouchRating(e) {
        const touch = e.touches[0];
        const stars = container.querySelectorAll('.star-input');

        stars.forEach((star, index) => {
          const rect = star.getBoundingClientRect();
          if (touch.clientX >= rect.left && touch.clientX <= rect.right) {
            highlightStars(container, index + 1);
          }
        });
      }

      // Set initial rating
      if (initialRating > 0) {
        highlightStars(container, initialRating);
        container.dataset.rating = initialRating;
      }
    });

    function highlightStars(container, rating) {
      const stars = container.querySelectorAll('.star-input');
      stars.forEach((star, index) => {
        star.classList.toggle('active', index < rating);
      });
    }
  }
};

// ============================================
// Library/Bookmark System
// ============================================
const LibrarySystem = {
  // Get all library items
  getLibrary() {
    const raw = localStorage.getItem('novelshare_library');
    let library = raw ? JSON.parse(raw) : [];
    // Filter out novels marked as deleted anywhere in the app
    try {
      const deleted = new Set(JSON.parse(localStorage.getItem('novelshare_deleted_ids') || '[]'));
      const cleaned = Array.isArray(library)
        ? library.filter(item => item && !deleted.has(item.id) && !deleted.has(item.novelId))
        : [];
      if (cleaned.length !== library.length) {
        localStorage.setItem('novelshare_library', JSON.stringify(cleaned));
      }
      library = cleaned;
    } catch {
      // fallback to whatever we had
    }
    return library;
  },

  // Check if novel is in library
  isInLibrary(novelId) {
    const library = this.getLibrary();
    return library.some(item => item.id === novelId || item.novelId === novelId);
  },

  // Add to library
  addToLibrary(novelId, novelData = {}) {
    // Allow signature LibrarySystem.addToLibrary({ novelId, ... })
    if (typeof novelId === 'object' && novelId !== null) {
      novelData = novelId;
      novelId = novelData.novelId || novelData.id;
    }

    if (!novelId) return false;

    const library = this.getLibrary();
    const existingIndex = library.findIndex(item => item.id === novelId || item.novelId === novelId);

    const item = {
      id: novelId,
      novelId: novelId,
      title: novelData.title || '',
      author: novelData.author || '',
      genre: novelData.genre || '',
      status: novelData.status || '',
      description: novelData.description || '',
      rating: novelData.rating || 0,
      reads: novelData.reads || novelData.popularity || 0,
      coverImage: novelData.coverImage || novelData.cover || '',
      cover: novelData.coverImage || novelData.cover || '',
      totalChapters: novelData.totalChapters || novelData.chapters || 0,
      currentChapter: novelData.currentChapter || 0,
      progress: novelData.progress || 0,
      addedAt: Date.now()
    };

    if (existingIndex >= 0) {
      library[existingIndex] = { ...library[existingIndex], ...item };
      localStorage.setItem('novelshare_library', JSON.stringify(library));
      // Also push updates to Supabase
      if (!GuestMode.isGuest() && typeof SupabaseSync !== 'undefined' && SupabaseSync.pushLibraryItem) {
        SupabaseSync.pushLibraryItem(novelId, 'add', library[existingIndex]);
      }
      return false; // already existed, just updated
    } else {
      library.push(item);
      localStorage.setItem('novelshare_library', JSON.stringify(library));
      // Push to Supabase when logged in
      if (!GuestMode.isGuest() && typeof SupabaseSync !== 'undefined' && SupabaseSync.pushLibraryItem) {
        SupabaseSync.pushLibraryItem(novelId, 'add', item);
      }
      return true;
    }
  },

  // Remove from library
  removeFromLibrary(novelId) {
    let library = this.getLibrary();
    library = library.filter(item => item.id !== novelId && item.novelId !== novelId);
    localStorage.setItem('novelshare_library', JSON.stringify(library));
    if (!GuestMode.isGuest() && typeof SupabaseSync !== 'undefined' && SupabaseSync.pushLibraryItem) {
      SupabaseSync.pushLibraryItem(novelId, 'remove');
    }
  },

  // Toggle library status
  toggleLibrary(novelId, novelData = {}) {
    if (this.isInLibrary(novelId)) {
      this.removeFromLibrary(novelId);
      return false;
    } else {
      return this.addToLibrary(novelId, novelData);
    }
  },

  // Update reading progress
  updateProgress(novelId, progress, currentChapter, currentChapterId = null) {
    const library = this.getLibrary();
    const item = library.find(item => item.id === novelId || item.novelId === novelId);
    if (item) {
      item.progress = progress;
      item.currentChapter = currentChapter;
      if (currentChapterId) item.currentChapterId = currentChapterId;
      item.lastRead = Date.now();
      localStorage.setItem('novelshare_library', JSON.stringify(library));
      if (!GuestMode.isGuest() && typeof SupabaseSync !== 'undefined' && SupabaseSync.pushReadingProgress) {
        SupabaseSync.pushReadingProgress(novelId, currentChapter);
      }
    }
  },

  // Get reading progress
  getProgress(novelId) {
    const library = this.getLibrary();
    const item = library.find(item => item.id === novelId || item.novelId === novelId);
    return item ? { progress: item.progress, currentChapter: item.currentChapter, currentChapterId: item.currentChapterId } : null;
  },

  // Update chapter count for a novel in library
  updateChapterCount(novelId, newChapterCount) {
    const library = this.getLibrary();
    const item = library.find(item => item.id === novelId || item.novelId === novelId);
    if (item) {
      item.totalChapters = newChapterCount;
      item.chapters = newChapterCount;
      localStorage.setItem('novelshare_library', JSON.stringify(library));
      return true;
    }
    return false;
  }
};

// ============================================
// Favorites System
// ============================================
const FavoritesSystem = {
  // Get all favorites
  getFavorites() {
    const raw = localStorage.getItem('novelshare_favorites');
    let favorites = raw ? JSON.parse(raw) : [];
    // Filter out novels marked as deleted
    try {
      const deleted = new Set(JSON.parse(localStorage.getItem('novelshare_deleted_ids') || '[]'));
      const cleaned = Array.isArray(favorites)
        ? favorites.filter(item => item && !deleted.has(item.id) && !deleted.has(item.novelId))
        : [];
      if (cleaned.length !== favorites.length) {
        localStorage.setItem('novelshare_favorites', JSON.stringify(cleaned));
      }
      favorites = cleaned;
    } catch {
      // fallback to whatever we had
    }
    return favorites;
  },

  // Check if novel is in favorites
  isFavorite(novelId) {
    const favorites = this.getFavorites();
    return favorites.some(item => item.id === novelId || item.novelId === novelId);
  },

  // Add to favorites
  addFavorite(novelId, novelData = {}) {
    if (typeof novelId === 'object' && novelId !== null) {
      novelData = novelId;
      novelId = novelData.novelId || novelData.id;
    }

    if (!novelId) return false;

    const favorites = this.getFavorites();
    const existingIndex = favorites.findIndex(item => item.id === novelId || item.novelId === novelId);

    const item = {
      id: novelId,
      novelId: novelId,
      title: novelData.title || '',
      author: novelData.author || '',
      genre: novelData.genre || '',
      status: novelData.status || '',
      description: novelData.description || '',
      rating: novelData.rating || 0,
      coverImage: novelData.coverImage || novelData.cover || '',
      cover: novelData.coverImage || novelData.cover || '',
      totalChapters: novelData.totalChapters || novelData.chapters || 0,
      addedAt: Date.now()
    };

    if (existingIndex >= 0) {
      favorites[existingIndex] = { ...favorites[existingIndex], ...item };
      localStorage.setItem('novelshare_favorites', JSON.stringify(favorites));
      return false; // already existed
    } else {
      favorites.push(item);
      localStorage.setItem('novelshare_favorites', JSON.stringify(favorites));
      // Push to Supabase when logged in
      if (!GuestMode.isGuest() && typeof SupabaseSync !== 'undefined' && SupabaseSync.pushFavorite) {
        SupabaseSync.pushFavorite(novelId, 'add', item);
      }
      return true;
    }
  },

  // Remove from favorites
  removeFavorite(novelId) {
    let favorites = this.getFavorites();
    favorites = favorites.filter(item => item.id !== novelId && item.novelId !== novelId);
    localStorage.setItem('novelshare_favorites', JSON.stringify(favorites));
    if (!GuestMode.isGuest() && typeof SupabaseSync !== 'undefined' && SupabaseSync.pushFavorite) {
      SupabaseSync.pushFavorite(novelId, 'remove');
    }
  },

  // Toggle favorite status
  toggleFavorite(novelId, novelData = {}) {
    if (this.isFavorite(novelId)) {
      this.removeFavorite(novelId);
      return false;
    } else {
      return this.addFavorite(novelId, novelData);
    }
  }
};

// ============================================
// Following System
// ============================================
const FollowingSystem = {
  // Get all following
  getFollowing() {
    const following = localStorage.getItem('novelshare_following');
    return following ? JSON.parse(following) : [];
  },

  // Check if following an author
  isFollowing(authorId) {
    const following = this.getFollowing();
    return following.some(item => item.id === authorId);
  },

  // Follow author
  follow(authorId, authorData = {}) {
    const following = this.getFollowing();
    if (!this.isFollowing(authorId)) {
      following.push({
        id: authorId,
        name: authorData.name || '',
        avatar: authorData.avatar || '',
        followedAt: Date.now()
      });
      localStorage.setItem('novelshare_following', JSON.stringify(following));
      return true;
    }
    return false;
  },

  // Unfollow author
  unfollow(authorId) {
    let following = this.getFollowing();
    following = following.filter(item => item.id !== authorId);
    localStorage.setItem('novelshare_following', JSON.stringify(following));
  },

  // Toggle follow status
  toggleFollow(authorId, authorData = {}) {
    if (this.isFollowing(authorId)) {
      this.unfollow(authorId);
      return false;
    } else {
      this.follow(authorId, authorData);
      return true;
    }
  },

  // Get follower count (mock)
  getFollowerCount(authorId) {
    // In production, this would be from API
    return Math.floor(Math.random() * 10000) + 100;
  }
};

// ============================================
// Reading History System
// ============================================
function getDeletedIdSetLocal() {
  try {
    return new Set(JSON.parse(localStorage.getItem('novelshare_deleted_ids') || '[]'));
  } catch {
    return new Set();
  }
}

const ReadingHistory = {
  // Get history
  getHistory() {
    const history = localStorage.getItem('novelshare_history');
    let parsed = history ? JSON.parse(history) : [];
    const deleted = getDeletedIdSetLocal();
    if (deleted.size && Array.isArray(parsed)) {
      parsed = parsed.filter(item => item && !deleted.has(item.novelId));
      localStorage.setItem('novelshare_history', JSON.stringify(parsed));
    }
    return parsed;
  },

  // Add to history
  addToHistory(novelId, chapterId, novelData = {}) {
    let history = this.getHistory();

    // Remove if already exists
    history = history.filter(item => item.novelId !== novelId);

    // Add to beginning
    history.unshift({
      novelId: novelId,
      chapterId: chapterId,
      novelTitle: novelData.title || novelData.novelTitle || '',
      chapterTitle: novelData.chapterTitle || '',
      coverImage: novelData.coverImage || novelData.cover || '',
      timestamp: Date.now()
    });

    // Keep only last 50 items
    history = history.slice(0, 50);

    localStorage.setItem('novelshare_history', JSON.stringify(history));

    // Push to Supabase when logged in
    if (!GuestMode.isGuest() && typeof SupabaseSync !== 'undefined' && SupabaseSync.pushHistoryEntry) {
      SupabaseSync.pushHistoryEntry(novelId, chapterId, novelData.chapterTitle || '', novelData);
    }
  },

  // Get last read chapter for a novel
  getLastRead(novelId) {
    const history = this.getHistory();
    return history.find(item => item.novelId === novelId);
  },

  // Clear history
  clearHistory() {
    localStorage.removeItem('novelshare_history');
  }
};

// ============================================
// Mock Data Initializer (DISABLED - All data comes from Supabase)
// ============================================
const MockDataInitializer = {
  // Mock data is disabled - all new accounts start with empty library
  // Data should come from Supabase cloud sync
  shouldInitialize() {
    return false;
  },

  // No-op - mock data initialization is disabled
  initialize() {
    // All user data comes from Supabase, not mock data
    return;
  },

  // Clear all user data (useful for testing/logout)
  // NOTE: novelshare_offline is NOT cleared - downloads should persist across sessions
  reset() {
    localStorage.removeItem('novelshare_library');
    localStorage.removeItem('novelshare_history');
    localStorage.removeItem('novelshare_ratings');
    localStorage.removeItem('novelshare_following');
    // localStorage.removeItem('novelshare_offline'); // Keep downloads across sessions
    localStorage.removeItem('novelshare_profile');
    localStorage.removeItem('novelshare_guest_mock_initialized');
    localStorage.removeItem('novelshare_user_mock_initialized');
    console.log('NovelShare: User data cleared');
  }
};

// ============================================
// User Credentials Storage (for auto-fill)
// ============================================
const UserCredentials = {
  // Storage key for saved credentials
  STORAGE_KEY: 'novelshare_saved_credentials',

  // Get saved credentials
  getSavedCredentials() {
    const creds = localStorage.getItem(this.STORAGE_KEY);
    return creds ? JSON.parse(creds) : null;
  },

  // Save user credentials (email only for security - password is not stored)
  saveCredentials(email, username) {
    const credentials = {
      email: email,
      username: username,
      savedAt: Date.now()
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(credentials));
  },

  // Clear saved credentials
  clearCredentials() {
    localStorage.removeItem(this.STORAGE_KEY);
  },

  // Check if user has saved credentials
  hasSavedCredentials() {
    return this.getSavedCredentials() !== null;
  }
};

// ============================================
// Data Isolation System
// ============================================
const DataIsolation = {
  // Storage keys that need to be isolated between guest and user
  // NOTE: novelshare_profile is NOT included here - it should persist and be overwritten on login
  // NOTE: novelshare_offline is NOT included - downloads should persist across login/logout
  ISOLATED_KEYS: [
    'novelshare_library',
    'novelshare_history',
    'novelshare_ratings',
    'novelshare_following'
  ],

  // Get prefix for current mode
  getPrefix(isGuest) {
    return isGuest ? 'guest_' : 'user_';
  },

  // Backup current data before switching modes
  backupCurrentData(currentIsGuest) {
    const prefix = this.getPrefix(currentIsGuest);
    this.ISOLATED_KEYS.forEach(key => {
      const data = localStorage.getItem(key);
      if (data) {
        localStorage.setItem(prefix + key, data);
      }
    });
  },

  // Restore data for new mode
  restoreData(newIsGuest) {
    const prefix = this.getPrefix(newIsGuest);
    this.ISOLATED_KEYS.forEach(key => {
      const backupData = localStorage.getItem(prefix + key);
      if (backupData) {
        localStorage.setItem(key, backupData);
      } else if (newIsGuest) {
        // Clear data for guest if no backup exists (fresh guest session)
        localStorage.removeItem(key);
      }
    });
  },

  // Clear guest data completely
  clearGuestData() {
    const prefix = this.getPrefix(true);
    this.ISOLATED_KEYS.forEach(key => {
      localStorage.removeItem(prefix + key);
      // Also clear current if in guest mode
      if (GuestMode.isGuest()) {
        localStorage.removeItem(key);
      }
    });
  },

  // Switch between guest and user mode with data isolation
  switchMode(toGuestMode) {
    const currentIsGuest = GuestMode.isGuest();

    // If already in the target mode, do nothing
    if (currentIsGuest === toGuestMode) return;

    // Backup current mode's data
    this.backupCurrentData(currentIsGuest);

    // Restore data for new mode
    this.restoreData(toGuestMode);
  },

  // Initialize guest mode with fresh data (no user data leakage)
  initGuestSession() {
    // Backup user data first
    this.backupCurrentData(false);

    // Clear all isolated keys for fresh guest session - guests always start empty
    this.ISOLATED_KEYS.forEach(key => {
      localStorage.removeItem(key);
    });

    // Also clear any old guest backups to ensure fresh start
    this.ISOLATED_KEYS.forEach(key => {
      localStorage.removeItem('guest_' + key);
    });

    // Clear guest mock initialized flag so it doesn't try to restore old data
    localStorage.removeItem('novelshare_guest_mock_initialized');

    // Guest always starts with empty data - no restore, no mock data
  },

  // Initialize user session (restore user data)
  initUserSession() {
    // Try to restore user data
    const userLibrary = localStorage.getItem('user_novelshare_library');
    if (userLibrary) {
      this.restoreData(false);
    }
    // If no user backup exists, mock data initializer will handle it
  }
};

// ============================================
// Guest Mode System
// ============================================
const GuestMode = {
  // Check if user is in guest mode
  isGuest() {
    return localStorage.getItem('novelshare_guest_mode') === 'true';
  },

  // Set guest mode with data isolation
  setGuestMode(value) {
    if (value) {
      // Switching to guest mode
      DataIsolation.initGuestSession();
      localStorage.setItem('novelshare_guest_mode', 'true');
    } else {
      // Switching to user mode
      // Backup guest data first if currently in guest mode
      if (this.isGuest()) {
        DataIsolation.backupCurrentData(true);
      }
      localStorage.removeItem('novelshare_guest_mode');
      DataIsolation.initUserSession();
    }
  },

  // Log out (clear guest mode and redirect to login)
  logout() {
    return this.fullLogout();
  },

  // Full logout (clears all session data)
  async fullLogout() {
    // Sign out from Supabase if available
    try {
      if (typeof SupabaseAuth !== 'undefined' && SupabaseAuth.signOut) {
        await SupabaseAuth.signOut();
      }
    } catch (error) {
      console.warn('Supabase sign-out failed (continuing logout):', error);
    }

    // Clear saved credentials used for auto-fill
    if (typeof UserCredentials !== 'undefined' && UserCredentials.clearCredentials) {
      UserCredentials.clearCredentials();
    }

    // Clear all session data (user and guest copies)
    // NOTE: Profile is NOT cleared here - it will be overwritten on next login
    DataIsolation.ISOLATED_KEYS.forEach(key => {
      localStorage.removeItem(key);
      localStorage.removeItem('guest_' + key);
      localStorage.removeItem('user_' + key);
    });
    // Backup profile for potential restore, but don't clear it
    // localStorage.removeItem('novelshare_profile'); // Removed - profile persists
    localStorage.removeItem('novelshare_user_mock_initialized');
    localStorage.removeItem('novelshare_guest_mock_initialized');

    // Enter clean guest mode to avoid auto-restoring user state
    localStorage.setItem('novelshare_guest_mode', 'true');

    navigateToPage('login.html');
  },

  // Update profile UI based on guest mode
  updateProfileUI() {
    const isGuest = this.isGuest();
    const profile = JSON.parse(localStorage.getItem('novelshare_profile') || '{}');

    // Update header profile section
    const profileWrapper = document.querySelector('.profile-wrapper');
    const profileLink = document.querySelector('a.profile');
    const avatarElements = document.querySelectorAll('.avatar:not(.avatar-lg)');
    const avatarLgElements = document.querySelectorAll('.avatar-lg');
    const usernameElements = document.querySelectorAll('.username');
    const nameElements = document.querySelectorAll('.profile-dropdown-header .name');
    const emailElements = document.querySelectorAll('.profile-dropdown-header .email');

    if (isGuest) {
      // Guest mode - show guest UI
      avatarElements.forEach(el => el.textContent = 'G');
      avatarLgElements.forEach(el => el.textContent = 'G');
      usernameElements.forEach(el => el.textContent = 'Guest');
      nameElements.forEach(el => el.textContent = 'Guest User');
      emailElements.forEach(el => el.textContent = 'Not signed in');

      // Change profile link to login page for guests (if it's a simple link)
      if (profileLink && !profileWrapper) {
        profileLink.href = 'login.html';
      }

      // Update profile dropdown menu for guest
      const profileMenu = document.querySelector('.profile-dropdown-menu');
      if (profileMenu) {
        profileMenu.innerHTML = `
          <a href="login.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>Sign In</a>
          <a href="signup.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>Create Account</a>
        `;
      }
    } else {
      // Logged in - show user data
      const initial = profile.name ? profile.name.charAt(0).toUpperCase() : 'U';
      avatarElements.forEach(el => el.textContent = initial);
      avatarLgElements.forEach(el => el.textContent = initial);
      usernameElements.forEach(el => el.textContent = profile.username || 'User');
      nameElements.forEach(el => el.textContent = profile.name || 'User');
      emailElements.forEach(el => el.textContent = profile.email || '');

      // Ensure profile link goes to profile page when logged in
      if (profileLink && !profileWrapper) {
        profileLink.href = 'profile.html';
      }

      // Populate logged-in menu if present
      const profileMenu = document.querySelector('.profile-dropdown-menu');
      if (profileMenu) {
        profileMenu.innerHTML = `
          <a href="profile.html">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
            </svg>
            My Profile
          </a>
          <a href="author-dashboard.html">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            My Works
          </a>
          <a href="login.html" class="logout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Log Out
          </a>
        `;
      }
    }
  }
};

// Auto-initialize mock data and guest mode UI on page load
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize mock data for logged-in users, not guests
  // This prevents user data from leaking to guest sessions
  if (!GuestMode.isGuest()) {
    MockDataInitializer.initialize();
  }

  // If a Supabase session exists, ensure guest mode is off and profile UI reflects the logged-in user
  if (typeof SupabaseAuth !== 'undefined' && SupabaseAuth.getSession) {
    SupabaseAuth.getSession()
      .then(async (result) => {
        const session = result?.session || result?.data?.session;
        const user = session?.user;
        if (user) {
          // Force user mode
          GuestMode.setGuestMode(false);

          // Try to fetch profile from DB for accurate name/username
          let profile = {};
          if (typeof SupabaseDB !== 'undefined' && SupabaseDB.getProfile) {
            try {
              const dbProfile = await SupabaseDB.getProfile(user.id);
              profile = {
                name: dbProfile?.display_name || dbProfile?.username || user.email || 'User',
                username: dbProfile?.username || dbProfile?.display_name || 'user',
                email: dbProfile?.email || user.email || ''
              };
            } catch (e) {
              // Fallback to user metadata
              const meta = user.user_metadata || {};
              profile = {
                name: meta.display_name || meta.full_name || 'User',
                username: meta.username || meta.user_name || 'user',
                email: user.email || ''
              };
            }
          }

          // Store profile for UI
          if (Object.keys(profile).length === 0) {
            const meta = user?.user_metadata || {};
            profile = {
              name: meta.display_name || meta.full_name || 'User',
              username: meta.username || meta.user_name || 'user',
              email: user?.email || ''
            };
          }
          localStorage.setItem('novelshare_profile', JSON.stringify(profile));

          // Sync all data from cloud for cross-device compatibility
          if (typeof SupabaseSync !== 'undefined' && SupabaseSync.fullSync) {
            try {
              await SupabaseSync.fullSync();
            } catch (syncErr) {
              console.warn('Full sync failed on login:', syncErr);
            }
          }
        }
      })
      .finally(() => {
        GuestMode.updateProfileUI();
      });

    // Listen for auth state changes across tabs/devices
    if (SupabaseAuth.onAuthStateChange) {
      SupabaseAuth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          // User logged out (possibly from another tab/device)
          GuestMode.setGuestMode(true);
          localStorage.removeItem('novelshare_profile');
          // Redirect to login if not already there
          if (!window.location.pathname.includes('login.html') &&
              !window.location.pathname.includes('signup.html')) {
            navigateToPage('login.html');
          }
        } else if (event === 'SIGNED_IN' && session) {
          // User logged in (possibly from another tab/device)
          GuestMode.setGuestMode(false);
          const user = session.user;
          const meta = user?.user_metadata || {};
          const profile = {
            name: meta.display_name || meta.full_name || user?.email || 'User',
            username: meta.username || meta.user_name || 'user',
            email: user?.email || ''
          };
          localStorage.setItem('novelshare_profile', JSON.stringify(profile));
          GuestMode.updateProfileUI(false, profile);
        } else if (event === 'TOKEN_REFRESHED') {
          // Session token was refreshed - no action needed
        }
      });
    }
  } else {
    GuestMode.updateProfileUI();
  }
});

// Export functions for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initSearch,
    initFilterPills,
    initGenreFilter,
    initPagination,
    initTabs,
    showToast,
    initAddToLibrary,
    initPasswordToggle,
    validateField,
    getPasswordStrength,
    initPasswordStrength,
    initDropdown,
    Validators,
    debounce,
    throttle,
    RatingSystem,
    LibrarySystem,
    FavoritesSystem,
    FollowingSystem,
    ReadingHistory,
    MockDataInitializer,
    GuestMode,
    UserCredentials,
    DataIsolation
  };
}

// ============================================
// Password Toggle Functionality
// ============================================
let passwordToggleInitialized = false;

function initPasswordToggle(toggleSelector = '.password-toggle') {
  // Prevent multiple initializations
  if (passwordToggleInitialized) return;
  passwordToggleInitialized = true;

  // Event delegation so it works even if elements render after init
  document.addEventListener('click', (event) => {
    const toggle = event.target.closest(toggleSelector);
    if (!toggle) return;

    event.preventDefault();
    event.stopPropagation();

    const container = toggle.closest('.password-input-container');
    if (!container) {
      console.warn('Password toggle: container not found');
      return;
    }

    const input = container.querySelector('input');
    if (!input) {
      console.warn('Password toggle: input not found');
      return;
    }

    // Toggle password visibility
    const isCurrentlyPassword = input.type === 'password';
    input.type = isCurrentlyPassword ? 'text' : 'password';
    toggle.classList.toggle('active', isCurrentlyPassword);

    // Update icon if present
    const icon = toggle.querySelector('.eye-icon');
    if (icon && icon.tagName === 'IMG' && icon.src) {
      if (isCurrentlyPassword) {
        // Showing password - use show icon
        icon.src = icon.src.replace('hide', 'show');
      } else {
        // Hiding password - use hide icon
        icon.src = icon.src.replace('show', 'hide');
      }
      icon.alt = isCurrentlyPassword ? 'Hide password' : 'Show password';
    }

    toggle.setAttribute('aria-label', isCurrentlyPassword ? 'Hide password' : 'Show password');
  });
}

// ============================================
// Mobile Sidebar Navigation
// ============================================
let mobileSidebarInitialized = false;

function initMobileSidebar() {
  if (mobileSidebarInitialized) return;
  mobileSidebarInitialized = true;

  const hamburgerBtn = document.querySelector('.hamburger-btn');
  const mobileSidebar = document.querySelector('.mobile-sidebar');
  const overlay = document.querySelector('.mobile-sidebar-overlay');
  const closeBtn = document.querySelector('.mobile-sidebar-close');

  if (!hamburgerBtn || !mobileSidebar || !overlay) return;

  // Open sidebar
  hamburgerBtn.addEventListener('click', () => {
    mobileSidebar.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  });

  // Close sidebar functions
  function closeSidebar() {
    mobileSidebar.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', closeSidebar);
  }

  // Close on overlay click
  overlay.addEventListener('click', closeSidebar);

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileSidebar.classList.contains('active')) {
      closeSidebar();
    }
  });

  // Close sidebar when clicking nav items
  mobileSidebar.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      // Small delay to allow navigation to start
      setTimeout(closeSidebar, 100);
    });
  });

  // Close sidebar when clicking genre items
  mobileSidebar.querySelectorAll('.genre-list li').forEach(item => {
    item.addEventListener('click', closeSidebar);
  });

  // Handle touch events for swipe to close
  let touchStartX = 0;
  let touchCurrentX = 0;

  mobileSidebar.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  mobileSidebar.addEventListener('touchmove', (e) => {
    touchCurrentX = e.touches[0].clientX;
    const diff = touchStartX - touchCurrentX;

    // Only allow swiping left (to close)
    if (diff > 0) {
      const translateX = Math.min(diff, 280);
      mobileSidebar.style.transform = `translateX(-${translateX}px)`;
    }
  }, { passive: true });

  mobileSidebar.addEventListener('touchend', () => {
    const diff = touchStartX - touchCurrentX;

    // If swiped more than 80px, close the sidebar
    if (diff > 80) {
      closeSidebar();
    }

    // Reset transform
    mobileSidebar.style.transform = '';
  }, { passive: true });
}

// Create mobile sidebar HTML dynamically
function createMobileSidebar(currentPage = 'home') {
  // Check if already exists
  if (document.querySelector('.mobile-sidebar')) return;

  const currentPageLower = currentPage.toLowerCase();

  const sidebarHTML = `
    <div class="mobile-sidebar-overlay"></div>
    <nav class="mobile-sidebar" aria-label="Mobile navigation">
      <div class="mobile-sidebar-header">
        <a class="logo" href="home.html">
          <div class="logo-icon">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <path d="M32 12c-4.8-3.3-10.4-4.4-16-4.4a6.6 6.6 0 0 0-6.6 6.6v28.2c0 1.1.9 2 2 2H18c4.7 0 9.3 1.5 13.2 4.2 3.9-2.7 8.5-4.2 13.2-4.2h6.6c1.1 0 2-.9 2-2V14.2A6.6 6.6 0 0 0 48 7.6C42.4 7.6 36.8 8.7 32 12Zm0 6.9c4.3-2.6 9.2-3.9 14.2-3.9 1.1 0 2 .9 2 2v24.1h-4.6c-4.5 0-8.9 1.1-12.8 3.2v-25.4Zm-4 25.4c-3.9-2.1-8.3-3.2-12.8-3.2H10.6V17c0-1.1.9-2 2-2 5 0 9.9 1.3 14.2 3.9v25.4Z" fill="currentColor"/>
            </svg>
          </div>
          <div class="logo-text">
            <span class="logo-name">NovelShare</span>
          </div>
        </a>
        <button class="mobile-sidebar-close" aria-label="Close menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="mobile-sidebar-nav">
        <div class="nav-title">Navigation</div>
        <div class="nav-items">
          <a href="home.html" class="nav-item ${currentPageLower === 'home' ? 'active' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9,22 9,12 15,12 15,22"/>
            </svg>
            Home
          </a>
          <a href="library.html" class="nav-item ${currentPageLower === 'library' ? 'active' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z"/>
            </svg>
            Library
          </a>
          <a href="browse.html" class="nav-item ${currentPageLower === 'browse' ? 'active' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            Browse
          </a>
          <a href="profile.html" class="nav-item ${currentPageLower === 'profile' ? 'active' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
            </svg>
            Profile
          </a>
        </div>
      </div>

      <div class="mobile-sidebar-divider"></div>

      <div class="mobile-sidebar-nav">
        <div class="nav-title">Account</div>
        <div class="nav-items">
          <a href="login.html" class="nav-item" id="mobileLogoutBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16,17 21,12 16,7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Log Out
          </a>
        </div>
      </div>
    </nav>
  `;

  document.body.insertAdjacentHTML('beforeend', sidebarHTML);

  // Initialize after creating
  initMobileSidebar();

  // Handle logout click
  const mobileLogoutBtn = document.querySelector('#mobileLogoutBtn');
  if (mobileLogoutBtn && typeof GuestMode !== 'undefined') {
    mobileLogoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      GuestMode.fullLogout();
    });
  }
}

// Add hamburger button to header if not exists
function addHamburgerButton() {
  const topBar = document.querySelector('.top-bar');
  if (!topBar || topBar.querySelector('.hamburger-btn')) return;

  const hamburgerHTML = `
    <button class="hamburger-btn" aria-label="Open menu" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
  `;

  // Insert hamburger as first child of top-bar
  topBar.insertAdjacentHTML('afterbegin', hamburgerHTML);
}

// Hide notification bell for guest mode
function hideGuestElements() {
  if (typeof GuestMode !== 'undefined' && GuestMode.isGuest()) {
    // Hide notification bell for guests
    const bellBtn = document.querySelector('.bell-btn');
    if (bellBtn) {
      bellBtn.style.display = 'none';
    }
  }
}

// Auto-initialize mobile navigation on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Detect current page from URL
  const path = window.location.pathname;
  let currentPage = 'home';

  if (path.includes('library')) currentPage = 'library';
  else if (path.includes('browse')) currentPage = 'browse';
  else if (path.includes('profile')) currentPage = 'profile';
  else if (path.includes('novel')) currentPage = 'novel';
  else if (path.includes('search')) currentPage = 'search';

  // Only add mobile nav for pages with top-bar
  if (document.querySelector('.top-bar')) {
    addHamburgerButton();
    createMobileSidebar(currentPage);
  }

  // Hide elements that should not appear for guests
  hideGuestElements();
});
