/* ==============================================
   Keyboard Mode - Terminal Input Handler
   ==============================================
   Handles:
   - Mode toggling (click ↔ keyboard)
   - Text input with command execution
   - Tab completion with cycling
   - Fuzzy matching with suggestions
   - Command history (up/down arrows)
   ============================================== */

var TerminalKeyboard = (function() {
  'use strict';

  var _isKeyboardMode = false;
  var _history = [];
  var _historyIndex = -1;
  var _historyDraft = '';
  var _tabState = {
    matches: [],
    index: -1,
    partial: ''
  };

  /**
   * Initialise keyboard mode.
   * Called once on DOMContentLoaded.
   */
  function init() {
    var modeToggle = document.getElementById('mode-toggle');
    if (modeToggle) {
      modeToggle.addEventListener('click', toggleMode);
    }

    var input = document.getElementById('keyboard-input');
    if (input) {
      input.addEventListener('keydown', _handleKeydown);
      input.addEventListener('input', _resetTabState);
    }

    // Load mode preference from localStorage
    var savedMode = localStorage.getItem('terminalMode');
    if (savedMode === 'keyboard') {
      _activateKeyboardMode();
    }
  }

  /**
   * Toggle between click mode and keyboard mode.
   */
  function toggleMode() {
    if (_isKeyboardMode) {
      _activateClickMode();
    } else {
      _activateKeyboardMode();
    }
  }

  /**
   * Switch to keyboard mode.
   */
  function _activateKeyboardMode() {
    _isKeyboardMode = true;
    localStorage.setItem('terminalMode', 'keyboard');

    var body = document.body;
    body.setAttribute('data-mode', 'keyboard');

    var input = document.getElementById('keyboard-input');
    if (input) {
      input.focus();
    }

    _updateModeToggle();
  }

  /**
   * Switch to click mode.
   */
  function _activateClickMode() {
    _isKeyboardMode = false;
    localStorage.setItem('terminalMode', 'click');

    var body = document.body;
    body.setAttribute('data-mode', 'click');

    // Clear any suggestion display
    _hideSuggestions();

    _updateModeToggle();
  }

  /**
   * Update the mode toggle button text.
   */
  function _updateModeToggle() {
    var icon = document.getElementById('mode-toggle-icon');
    var label = document.getElementById('mode-toggle-label');
    if (icon) icon.textContent = _isKeyboardMode ? '🖱' : '⌨';
    if (label) label.textContent = _isKeyboardMode ? ' Click Mode' : ' Keyboard';
  }

  /**
   * Handle keydown events on the terminal input.
   */
  function _handleKeydown(e) {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        _executeInput();
        break;

      case 'Tab':
        e.preventDefault();
        _handleTab(e.shiftKey);
        break;

      case 'ArrowUp':
        e.preventDefault();
        _navigateHistory(-1);
        break;

      case 'ArrowDown':
        e.preventDefault();
        _navigateHistory(1);
        break;

      case 'Escape':
        e.preventDefault();
        _hideSuggestions();
        _resetTabState();
        break;

      case 'c':
        // Ctrl+C: clear input
        if (e.ctrlKey) {
          e.preventDefault();
          _clearInput();
        }
        break;

      case 'l':
        // Ctrl+L: clear terminal
        if (e.ctrlKey) {
          e.preventDefault();
          TerminalCommands.execute('clear');
        }
        break;
    }
  }

  /**
   * Execute the current input value as a command.
   */
  function _executeInput() {
    var input = document.getElementById('keyboard-input');
    if (!input) return;

    var value = input.value.trim();
    if (!value) return;

    // Add to history
    if (_history.length === 0 || _history[_history.length - 1] !== value) {
      _history.push(value);
    }
    _historyIndex = -1;
    _historyDraft = '';

    // Clear input
    input.value = '';

    // Hide suggestions
    _hideSuggestions();
    _resetTabState();

    // Try exact command
    var executed = TerminalCommands.execute(value);

    if (!executed) {
      // Try fuzzy match
      var fuzzy = TerminalCommands.fuzzyMatch(value.split(' ')[0]);
      if (fuzzy.length > 0) {
        _showCommandNotFound(value, fuzzy);
      } else {
        _showCommandNotFound(value, []);
      }
    }

    // Focus back on input
    setTimeout(function() {
      input.focus();
    }, 50);
  }

  /**
   * Show a "command not found" message with suggestions.
   */
  function _showCommandNotFound(input, suggestions) {
    var dc = document.getElementById('dynamic-content');
    if (!dc) return;

    var html = '<div class="command-output">';
    html += '<div class="prompt-line">';
    html += '<span class="prompt">$</span> <span class="command-echo">' + _escapeHtml(input) + '</span>';
    html += '</div>';
    html += '<div class="output-body">';
    html += '<p><span class="text-error">Command not found: ' + _escapeHtml(input.split(' ')[0]) + '</span></p>';

    if (suggestions.length > 0) {
      html += '<p class="text-dim">Did you mean:</p>';
      html += '<ul>';
      for (var i = 0; i < Math.min(suggestions.length, 3); i++) {
        html += '<li><span class="text-command">' + suggestions[i].name + '</span>';
        var desc = TerminalCommands.get(suggestions[i].name);
        if (desc && desc.description) {
          html += ' - ' + _escapeHtml(desc.description);
        }
        html += '</li>';
      }
      html += '</ul>';
    }

    html += '<p class="text-dim">Type "help" to see available commands.</p>';
    html += '</div></div>';

    dc.insertAdjacentHTML('beforeend', html);

    // Scroll to bottom
    var tb = document.getElementById('terminal-body');
    if (tb) {
      requestAnimationFrame(function() {
        tb.scrollTo({ top: tb.scrollHeight, behavior: 'smooth' });
      });
    }
  }

  /**
   * Handle Tab key for completion.
   */
  function _handleTab(shiftKey) {
    var input = document.getElementById('keyboard-input');
    if (!input) return;

    var value = input.value.trim();

    // Check if we're currently cycling through matches
    var isCycling = _tabState.matches.length > 1 && _tabState.index >= 0;

    // If not cycling, start a new tab sequence
    if (!isCycling) {
      _tabState.partial = value;
      _tabState.matches = TerminalCommands.tabComplete(value);
      _tabState.index = -1;

      if (_tabState.matches.length === 0) {
        // No prefix matches - try fuzzy
        var fuzzy = TerminalCommands.fuzzyMatch(value);
        if (fuzzy.length > 0) {
          _tabState.matches = fuzzy.map(function(r) { return r.name; });
        } else {
          return;
        }
      }
    }

    if (_tabState.matches.length === 1) {
      // Single match - complete it
      input.value = _tabState.matches[0];
      _tabState.partial = input.value;
      _hideSuggestions();
      return;
    }

    // Multiple matches - cycle through them
    if (shiftKey) {
      _tabState.index--;
      if (_tabState.index < 0) _tabState.index = _tabState.matches.length - 1;
    } else {
      _tabState.index++;
      if (_tabState.index >= _tabState.matches.length) _tabState.index = 0;
    }

    input.value = _tabState.matches[_tabState.index];

    // Show all matches in suggestions dropdown
    _showSuggestions(_tabState.matches, _tabState.index);
  }

  /**
   * Show tab-completion suggestions.
   * @param {string[]} matches - Matching command names.
   * @param {number} activeIndex - Currently selected index.
   */
  function _showSuggestions(matches, activeIndex) {
    var container = document.getElementById('keyboard-suggestions');
    var input = document.getElementById('keyboard-input');
    if (!container) return;

    var html = '';
    for (var i = 0; i < matches.length; i++) {
      var cls = 'keyboard-suggestion';
      if (i === activeIndex) cls += ' keyboard-suggestion--active';
      var cmd = TerminalCommands.get(matches[i]);
      var desc = cmd ? cmd.description : '';
      var optionId = 'suggestion-' + i;
      html += '<div class="' + cls + '" data-command="' + matches[i] + '" role="option" id="' + optionId + '"' + (i === activeIndex ? ' aria-selected="true"' : ' aria-selected="false"') + '>';
      html += '<span class="keyboard-suggestion__name">' + matches[i] + '</span>';
      if (desc) {
        html += '<span class="keyboard-suggestion__desc"> - ' + _escapeHtml(desc) + '</span>';
      }
      html += '</div>';
    }

    container.innerHTML = html;
    var isVisible = matches.length > 0;
    container.style.display = isVisible ? 'block' : 'none';

    // Update ARIA state on input
    if (input) {
      input.setAttribute('aria-expanded', isVisible ? 'true' : 'false');
      if (isVisible && activeIndex >= 0) {
        input.setAttribute('aria-activedescendant', 'suggestion-' + activeIndex);
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    // Add click handlers to suggestions
    var items = container.querySelectorAll('.keyboard-suggestion');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', _onSuggestionClick);
    }
  }

  /**
   * Handle clicking a suggestion.
   */
  function _onSuggestionClick(e) {
    var el = e.currentTarget;
    var cmd = el.getAttribute('data-command');
    if (cmd) {
      var input = document.getElementById('keyboard-input');
      if (input) {
        input.value = cmd;
        input.focus();
      }
      _hideSuggestions();
    }
  }

  /**
   * Hide the suggestions dropdown.
   */
  function _hideSuggestions() {
    var container = document.getElementById('keyboard-suggestions');
    var input = document.getElementById('keyboard-input');
    if (container) {
      container.innerHTML = '';
      container.style.display = 'none';
    }
    if (input) {
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
  }

  /**
   * Navigate command history.
   * @param {number} direction - -1 for up (older), 1 for down (newer).
   */
  function _navigateHistory(direction) {
    var input = document.getElementById('keyboard-input');
    if (!input || _history.length === 0) return;

    if (_historyIndex === -1) {
      // Save current draft
      _historyDraft = input.value;
    }

    var newIndex = _historyIndex + direction;

    if (direction === -1) {
      // Going up (older)
      if (_historyIndex === -1) {
        newIndex = _history.length - 1;
      } else if (newIndex < 0) {
        newIndex = 0;
        return;
      }
    } else {
      // Going down (newer)
      if (newIndex >= _history.length) {
        // Back to draft
        _historyIndex = -1;
        input.value = _historyDraft;
        return;
      }
    }

    _historyIndex = newIndex;
    input.value = _history[_historyIndex];
  }

  /**
   * Clear the input field.
   */
  function _clearInput() {
    var input = document.getElementById('keyboard-input');
    if (input) {
      input.value = '';
    }
    _hideSuggestions();
    _resetTabState();
  }

  /**
   * Reset tab completion state.
   */
  function _resetTabState() {
    _tabState.matches = [];
    _tabState.index = -1;
    _tabState.partial = '';
  }

  /**
   * Escape HTML entities.
   */
  function _escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check if keyboard mode is active.
   * @returns {boolean}
   */
  function isActive() {
    return _isKeyboardMode;
  }

  // Public API
  return {
    init: init,
    toggleMode: toggleMode,
    isActive: isActive
  };
})();
