/* ==============================================
   Terminal JS - Autoscroll, Clear, Mode Toggle, Theme, Lightbox
   ============================================== */

document.addEventListener('DOMContentLoaded', function() {
  var terminalBody = document.getElementById('terminal-body');

  // After every HTMX swap, scroll to bottom and bind lightbox to new images
  document.body.addEventListener('htmx:afterSwap', function(event) {
    if (event.detail.target && event.detail.target.id === 'dynamic-content') {
      requestAnimationFrame(function() {
        terminalBody.scrollTo({
          top: terminalBody.scrollHeight,
          behavior: 'smooth'
        });
      });
      _bindLightboxImages(event.detail.target);
    }
  });

  // HTMX request error handler - shows error message on failed fetches
  document.body.addEventListener('htmx:responseError', function(event) {
    if (event.detail.target && event.detail.target.id === 'dynamic-content') {
      var dynamicContent = document.getElementById('dynamic-content');
      if (dynamicContent) {
        var errorDiv = document.createElement('div');
        errorDiv.className = 'command-output';
        errorDiv.innerHTML = '<div class="output-body"><p class="text-error">Error: Failed to load content (HTTP ' + event.detail.xhr.status + ')</p></div>';
        dynamicContent.appendChild(errorDiv);
        requestAnimationFrame(function() {
          terminalBody.scrollTo({ top: terminalBody.scrollHeight, behavior: 'smooth' });
        });
      }
    }
  });

  // Initialize theme toggle button text
  var theme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeToggle(theme);

  // Register config-driven commands from data attribute
  _registerConfigCommands();

  // Initialize keyboard mode
  if (typeof TerminalKeyboard !== 'undefined') {
    TerminalKeyboard.init();
  }
});

/**
 * Register commands defined in hugo.yaml via data attributes on the command bar.
 * Each command link has data-cmd-name and data-cmd-description attributes.
 */
function _registerConfigCommands() {
  var links = document.querySelectorAll('[data-cmd-name]');
  for (var i = 0; i < links.length; i++) {
    var name = links[i].getAttribute('data-cmd-name');
    var description = links[i].getAttribute('data-cmd-description') || '';
    var fragmentUrl = links[i].getAttribute('data-cmd-fragment') || ('/' + name + '/fragment.html');

    // Don't re-register built-in commands that already have specific actions
    if (TerminalCommands.has(name) && TerminalCommands.get(name).source === 'builtin') {
      // Update description if provided
      var existing = TerminalCommands.get(name);
      if (description && !existing.description) {
        TerminalCommands.register(name, {
          description: description,
          action: existing.action,
          source: existing.source
        });
      }
      continue;
    }

    // Register as a config command with HTMX fetch action
    (function(cmdName, cmdFragment) {
      TerminalCommands.register(cmdName, {
        description: description,
        source: 'config',
        action: function(args, context) {
          if (typeof htmx !== 'undefined') {
            htmx.ajax('GET', cmdFragment, {
              target: '#dynamic-content',
              swap: 'beforeend'
            });
          }
        }
      });
    })(name, fragmentUrl);
  }
}

/**
 * Clear dynamic terminal content (preserves home content).
 */
function clearTerminal() {
  TerminalCommands.execute('clear');
}

/**
 * Toggle between dark and light themes.
 */
function toggleTheme() {
  var html = document.documentElement;
  var current = html.getAttribute('data-theme') || 'dark';
  var next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeToggle(next);
}

/**
 * Update the theme toggle button text to reflect current state.
 */
function updateThemeToggle(theme) {
  var icon = document.getElementById('theme-toggle-icon');
  var label = document.getElementById('theme-toggle-label');
  if (icon) icon.textContent = theme === 'dark' ? '☀' : '☾';
  if (label) label.textContent = theme === 'dark' ? ' Light' : ' Dark';
}

/* ==============================================
   Image Lightbox
   ============================================== */

/**
 * Bind lightbox click handlers to all terminal-image frames in a container.
 * @param {Element} container - Parent element to search for images.
 */
function _bindLightboxImages(container) {
  var frames = container.querySelectorAll('.terminal-image__frame');
  for (var i = 0; i < frames.length; i++) {
    // Only bind once
    if (frames[i].dataset.lightboxBound) continue;
    frames[i].dataset.lightboxBound = 'true';
    frames[i].addEventListener('click', _openLightbox);
    frames[i].addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _openLightbox.call(this, e);
      }
    });
  }
}

/**
 * Open the lightbox for the clicked image.
 */
function _openLightbox(e) {
  var frame = e.currentTarget;
  var img = frame.querySelector('img');
  if (!img) return;

  var figure = frame.closest('.terminal-image');
  var captionEl = figure ? figure.querySelector('.terminal-image__caption') : null;
  var captionText = captionEl ? captionEl.textContent : (img.alt || '');

  // Create lightbox overlay
  var overlay = document.createElement('div');
  overlay.className = 'terminal-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Image preview');

  var closeBtn = document.createElement('button');
  closeBtn.className = 'terminal-lightbox__close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close image preview');

  var bigImg = document.createElement('img');
  bigImg.src = img.src;
  bigImg.alt = img.alt;

  overlay.appendChild(closeBtn);
  overlay.appendChild(bigImg);

  if (captionText) {
    var caption = document.createElement('div');
    caption.className = 'terminal-lightbox__caption';
    caption.textContent = captionText;
    overlay.appendChild(caption);
  }

  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(function() {
    overlay.classList.add('terminal-lightbox--active');
  });

  // Close handlers
  function closeLightbox() {
    overlay.classList.remove('terminal-lightbox--active');
    setTimeout(function() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 200);
    document.removeEventListener('keydown', escHandler);
  }

  function escHandler(e) {
    if (e.key === 'Escape') closeLightbox();
  }

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay || e.target === closeBtn) closeLightbox();
  });
  closeBtn.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', escHandler);
}
