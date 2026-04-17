/* ==============================================
   Command Registry - Extensible Command System
   ==============================================
   Architecture:
   - Commands are registered with a name, description,
     and an action function.
   - Theme built-in commands (clear, help) are registered
     by default.
   - Hugo-configured commands (from params.commands) are
     registered at page load via data attributes.
   - Users can register custom commands via
     TerminalCommands.register().
   ============================================== */

var TerminalCommands = (function() {
  'use strict';

  /**
   * Internal command store.
   * Each entry: { name, description, action, source }
   * source: 'builtin' | 'config' | 'custom'
   */
  var _commands = {};

  /**
   * Register a command.
   * @param {string} name      - Command name (lowercase, no spaces).
   * @param {object} options   - { description, action, source }
   *   description {string}    - Short help text.
   *   action {function}       - Called when command is executed.
   *                             Receives (args, context) where:
   *                             - args: string after the command name
   *                             - context: { terminalBody, dynamicContent }
   *   source {string}         - 'builtin', 'config', or 'custom'.
   */
  function register(name, options) {
    var key = name.toLowerCase().trim();
    if (!key) return;
    _commands[key] = {
      name: key,
      description: options.description || '',
      action: options.action || null,
      source: options.source || 'custom'
    };
  }

  /**
   * Unregister a command.
   * @param {string} name - Command name to remove.
   */
  function unregister(name) {
    delete _commands[name.toLowerCase().trim()];
  }

  /**
   * Get a command by exact name.
   * @param {string} name
   * @returns {object|null}
   */
  function get(name) {
    return _commands[name.toLowerCase().trim()] || null;
  }

  /**
   * Get all registered command names.
   * @returns {string[]}
   */
  function list() {
    return Object.keys(_commands).sort();
  }

  /**
   * Get all registered commands as an array of objects.
   * @returns {object[]}
   */
  function all() {
    return list().map(function(k) { return _commands[k]; });
  }

  /**
   * Check if a command exists.
   * @param {string} name
   * @returns {boolean}
   */
  function has(name) {
    return name.toLowerCase().trim() in _commands;
  }

  /**
   * Tab-complete a partial command string.
   * Returns exact matches first, then prefix matches.
   * @param {string} partial - The partial input to complete.
   * @returns {string[]} - Sorted array of matching command names.
   */
  function tabComplete(partial) {
    var input = partial.toLowerCase().trim();
    if (!input) return list();

    var names = list();
    var matches = [];

    // Exact match - return just that
    if (_commands[input]) {
      return [input];
    }

    // Prefix matches
    for (var i = 0; i < names.length; i++) {
      if (names[i].indexOf(input) === 0) {
        matches.push(names[i]);
      }
    }

    return matches;
  }

  /**
   * Fuzzy match a command string.
   * Uses a subsequence matching algorithm with scoring.
   * @param {string} query - The fuzzy input to match.
   * @returns {object[]} - Array of { name, score } sorted by score desc.
   */
  function fuzzyMatch(query) {
    var input = query.toLowerCase().trim();
    if (!input) return [];

    var names = list();
    var results = [];

    for (var i = 0; i < names.length; i++) {
      var score = _fuzzyScore(input, names[i]);
      if (score > 0) {
        results.push({ name: names[i], score: score });
      }
    }

    // Sort by score descending, then alphabetically
    results.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  /**
   * Calculate a fuzzy match score between query and target.
   * Higher score = better match.
   * Scoring:
   *   - Exact match: 1000
   *   - Prefix match: 500 + (query.length / target.length) * 100
   *   - Contains match: 200 + (query.length / target.length) * 50
   *   - Subsequence match: sum of bonuses for consecutive chars
   *       and position bonuses (early matches score higher)
   * @param {string} query
   * @param {string} target
   * @returns {number} Score (0 = no match)
   */
  function _fuzzyScore(query, target) {
    if (query === target) return 1000;
    if (target.indexOf(query) === 0) return 500 + (query.length / target.length) * 100;
    if (target.indexOf(query) !== -1) return 200 + (query.length / target.length) * 50;

    // Subsequence matching
    var qi = 0;
    var score = 0;
    var consecutive = 0;
    var lastMatchIdx = -2;

    for (var ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) {
        qi++;
        // Consecutive character bonus
        if (ti === lastMatchIdx + 1) {
          consecutive++;
          score += consecutive * 10;
        } else {
          consecutive = 1;
          score += 5;
        }
        // Position bonus: earlier matches are worth more
        score += Math.max(0, 10 - ti);
        lastMatchIdx = ti;
      }
    }

    // All query chars must match
    if (qi < query.length) return 0;

    // Length similarity bonus
    score += (query.length / target.length) * 20;

    return score;
  }

  /**
   * Execute a command string (may include arguments).
   * @param {string} input - Full command string, e.g. "help" or "blog my-post"
   * @returns {boolean} - True if command was found and executed.
   */
  function execute(input) {
    var trimmed = input.trim();
    if (!trimmed) return false;

    // Split into command and args
    var spaceIdx = trimmed.indexOf(' ');
    var cmdName, args;
    if (spaceIdx === -1) {
      cmdName = trimmed.toLowerCase();
      args = '';
    } else {
      cmdName = trimmed.substring(0, spaceIdx).toLowerCase();
      args = trimmed.substring(spaceIdx + 1).trim();
    }

    var cmd = _commands[cmdName];
    if (!cmd) return false;

    var context = {
      terminalBody: document.getElementById('terminal-body'),
      dynamicContent: document.getElementById('dynamic-content')
    };

    if (typeof cmd.action === 'function') {
      cmd.action(args, context);
    }

    return true;
  }

  // Public API
  return {
    register: register,
    unregister: unregister,
    get: get,
    list: list,
    all: all,
    has: has,
    tabComplete: tabComplete,
    fuzzyMatch: fuzzyMatch,
    execute: execute
  };
})();

/* ==============================================
   Built-in Commands
   ============================================== */

// clear - Clears dynamic content
TerminalCommands.register('clear', {
  description: 'Clear terminal output',
  source: 'builtin',
  action: function(args, context) {
    if (context.dynamicContent) {
      context.dynamicContent.innerHTML = '';
    }
    if (context.terminalBody) {
      context.terminalBody.scrollTop = 0;
    }
  }
});

// help - Shows available commands (built-in behaviour, overridden if help page exists)
TerminalCommands.register('help', {
  description: 'Show available commands',
  source: 'builtin',
  action: function(args, context) {
    // If there's a help fragment, fetch it via HTMX
    // Otherwise display inline help
    if (typeof htmx !== 'undefined') {
      htmx.ajax('GET', '/help/fragment.html', {
        target: '#dynamic-content',
        swap: 'beforeend'
      });
    } else {
      // Fallback: inline help
      _showInlineHelp(context);
    }
  }
});

/**
 * Display inline help listing all registered commands.
 * Used as fallback when HTMX is not available.
 */
function _showInlineHelp(context) {
  if (!context.dynamicContent) return;

  var commands = TerminalCommands.all();
  var html = '<div class="command-output">';
  html += '<div class="prompt-line">';
  html += '<span class="prompt">$</span> <span class="command-echo">help</span>';
  html += '</div>';
  html += '<div class="output-body">';
  html += '<p><strong>Available commands:</strong></p>';
  html += '<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>';
  for (var i = 0; i < commands.length; i++) {
    html += '<tr><td><strong>' + commands[i].name + '</strong></td>';
    html += '<td>' + commands[i].description + '</td></tr>';
  }
  html += '</tbody></table>';
  html += '</div></div>';

  context.dynamicContent.insertAdjacentHTML('beforeend', html);
}
