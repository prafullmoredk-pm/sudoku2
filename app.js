/**
 * Sudoku 9x9 Offline Game Controller
 * Manages game state, keyboard & touch inputs, timer, and UI updates.
 */

(function () {
  'use strict';

  // Storage Keys
  const STORAGE_KEY = 'sudoku_saved_game_v1';
  const THEME_KEY = 'sudoku_theme_pref';

  // Game State
  const state = {
    difficulty: 'medium',
    puzzle: [],       // Initial clues (immutable during play)
    solution: [],     // Precomputed solution
    board: [],        // Current board values
    notes: [],        // 9x9 array of Sets
    selected: null,   // { row, col }
    notesMode: false,
    mistakes: 0,
    timerSeconds: 0,
    isPaused: false,
    history: [],      // Undo stack
    isWon: false
  };

  let timerInterval = null;

  // DOM Elements
  const gridEl = document.getElementById('sudoku-grid');
  const difficultySelect = document.getElementById('difficulty-select');
  const displayDifficulty = document.getElementById('display-difficulty');
  const displayMistakes = document.getElementById('display-mistakes');
  const timerDisplay = document.getElementById('timer-display');
  const btnPause = document.getElementById('btn-pause');
  const iconPause = document.getElementById('icon-pause');
  const iconPlay = document.getElementById('icon-play');
  const pauseOverlay = document.getElementById('pause-overlay');
  const btnResumeOverlay = document.getElementById('btn-resume-overlay');
  const btnNewGame = document.getElementById('btn-new-game');
  const btnUndo = document.getElementById('btn-undo');
  const btnErase = document.getElementById('btn-erase');
  const btnNotes = document.getElementById('btn-notes');
  const notesBadge = document.getElementById('notes-badge');
  const btnHint = document.getElementById('btn-hint');
  const themeToggle = document.getElementById('theme-toggle');
  const themeIconSun = document.getElementById('theme-icon-sun');
  const themeIconMoon = document.getElementById('theme-icon-moon');
  const winModal = document.getElementById('win-modal');
  const winTime = document.getElementById('win-time');
  const winDiff = document.getElementById('win-diff');
  const winMistakes = document.getElementById('win-mistakes');
  const btnWinNew = document.getElementById('btn-win-new');
  const numpadButtons = document.querySelectorAll('.num-key');

  // Pre-created 81 cell elements map
  const cellElements = [];

  /**
   * Initialize Grid DOM structure
   */
  function initGridDOM() {
    gridEl.innerHTML = '';
    cellElements.length = 0;

    for (let r = 0; r < 9; r++) {
      cellElements[r] = [];
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('tabindex', '0');

        // Main value container
        const valSpan = document.createElement('span');
        valSpan.className = 'cell-value';
        cell.appendChild(valSpan);

        // Notes 3x3 container
        const notesDiv = document.createElement('div');
        notesDiv.className = 'cell-notes';
        for (let n = 1; n <= 9; n++) {
          const noteSpan = document.createElement('span');
          noteSpan.className = 'note-item';
          noteSpan.dataset.num = n;
          notesDiv.appendChild(noteSpan);
        }
        cell.appendChild(notesDiv);

        // Click / Touch Event
        cell.addEventListener('click', () => selectCell(r, c));

        gridEl.appendChild(cell);
        cellElements[r][c] = cell;
      }
    }
  }

  /**
   * Start a brand new game
   */
  function startNewGame(difficulty = state.difficulty) {
    state.difficulty = difficulty;
    difficultySelect.value = difficulty;
    displayDifficulty.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

    const generated = SudokuEngine.generatePuzzle(difficulty);
    state.puzzle = generated.puzzle;
    state.solution = generated.solution;
    state.board = SudokuEngine.cloneGrid(generated.puzzle);
    state.notes = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
    state.selected = null;
    state.mistakes = 0;
    state.history = [];
    state.isWon = false;
    state.timerSeconds = 0;

    displayMistakes.textContent = '0';
    winModal.classList.add('hidden');
    unpauseGame();
    resetTimer();
    startTimer();

    // Select first empty cell if available
    for (let r = 0; r < 9; r++) {
      let found = false;
      for (let c = 0; c < 9; c++) {
        if (state.board[r][c] === 0) {
          state.selected = { row: r, col: c };
          found = true;
          break;
        }
      }
      if (found) break;
    }

    renderBoard();
    saveGameState();
  }

  /**
   * Render the entire board and update highlights
   */
  function renderBoard() {
    const conflicts = SudokuEngine.findConflicts(state.board);
    const selectedNum = state.selected ? state.board[state.selected.row][state.selected.col] : null;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = cellElements[r][c];
        const val = state.board[r][c];
        const isGiven = state.puzzle[r][c] !== 0;
        const valSpan = cell.querySelector('.cell-value');
        const notesDiv = cell.querySelector('.cell-notes');

        // Classes reset
        cell.className = 'cell';
        if (isGiven) cell.classList.add('given');
        else if (val !== 0) cell.classList.add('user-filled');

        // Selected state
        const isSelected = state.selected && state.selected.row === r && state.selected.col === c;
        if (isSelected) {
          cell.classList.add('selected');
        } else if (state.selected) {
          // Highlight same row, col, or 3x3 box
          const sameRow = state.selected.row === r;
          const sameCol = state.selected.col === c;
          const sameBox = Math.floor(state.selected.row / 3) === Math.floor(r / 3) &&
                          Math.floor(state.selected.col / 3) === Math.floor(c / 3);
          if (sameRow || sameCol || sameBox) {
            cell.classList.add('related');
          }
        }

        // Highlight matching numbers across the board
        if (val !== 0 && selectedNum && val === selectedNum && !isSelected) {
          cell.classList.add('same-digit');
        }

        // Conflicts
        if (conflicts.has(`${r},${c}`)) {
          cell.classList.add('conflict');
        }

        // Display Value or Notes
        if (val !== 0) {
          valSpan.textContent = val;
          valSpan.style.display = 'block';
          notesDiv.style.display = 'none';
        } else {
          valSpan.textContent = '';
          valSpan.style.display = 'none';
          notesDiv.style.display = 'grid';

          // Update notes
          const cellNotes = state.notes[r][c];
          const noteItems = notesDiv.children;
          for (let n = 1; n <= 9; n++) {
            const noteItem = noteItems[n - 1];
            if (cellNotes.has(n)) {
              noteItem.textContent = n;
            } else {
              noteItem.textContent = '';
            }
          }
        }
      }
    }

    updateNumpadBadges();
  }

  /**
   * Update count badges on the numpad (how many digits remain)
   */
  function updateNumpadBadges() {
    const counts = Array(10).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = state.board[r][c];
        if (val >= 1 && val <= 9) counts[val]++;
      }
    }

    numpadButtons.forEach((btn) => {
      const digit = parseInt(btn.dataset.digit, 10);
      const remaining = 9 - counts[digit];
      const badge = btn.querySelector('.count-badge');
      if (badge) {
        badge.textContent = remaining > 0 ? remaining : '✓';
      }
      if (remaining <= 0) {
        btn.classList.add('completed');
      } else {
        btn.classList.remove('completed');
      }
    });
  }

  /**
   * Select a cell
   */
  function selectCell(row, col) {
    if (state.isPaused || state.isWon) return;
    state.selected = { row, col };
    renderBoard();
  }

  /**
   * Handle placing a digit or toggling a note
   */
  function handleInputDigit(num) {
    if (state.isPaused || state.isWon || !state.selected) return;
    const { row, col } = state.selected;

    // Given clues cannot be modified
    if (state.puzzle[row][col] !== 0) return;

    if (state.notesMode) {
      // Toggle note candidate
      const currentNotes = state.notes[row][col];
      const prevNotesSet = new Set(currentNotes);

      if (currentNotes.has(num)) {
        currentNotes.delete(num);
      } else {
        currentNotes.add(num);
      }

      state.history.push({
        type: 'notes',
        row,
        col,
        prevNotes: prevNotesSet,
        nextNotes: new Set(currentNotes)
      });
      renderBoard();
      saveGameState();
      return;
    }

    // Normal digit placement
    const prevVal = state.board[row][col];
    const prevNotesSet = new Set(state.notes[row][col]);

    if (prevVal === num) {
      // Erase if tapping the same number
      state.board[row][col] = 0;
      state.history.push({
        type: 'digit',
        row,
        col,
        prevVal,
        nextVal: 0,
        prevNotes: prevNotesSet
      });
    } else {
      state.board[row][col] = num;
      state.notes[row][col].clear();

      // Check if mistaken against ground truth solution
      if (num !== state.solution[row][col]) {
        state.mistakes++;
        displayMistakes.textContent = state.mistakes;
      }

      state.history.push({
        type: 'digit',
        row,
        col,
        prevVal,
        nextVal: num,
        prevNotes: prevNotesSet
      });

      // Automatically prune candidate notes in same row, column, and box
      pruneNotes(row, col, num);
    }

    renderBoard();
    saveGameState();
    checkVictory();
  }

  /**
   * Remove digit candidate from neighbor cells' notes
   */
  function pruneNotes(row, col, num) {
    const boxStartRow = Math.floor(row / 3) * 3;
    const boxStartCol = Math.floor(col / 3) * 3;

    for (let i = 0; i < 9; i++) {
      state.notes[row][i].delete(num);
      state.notes[i][col].delete(num);
    }

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        state.notes[boxStartRow + r][boxStartCol + c].delete(num);
      }
    }
  }

  /**
   * Erase selected cell (digit or notes)
   */
  function eraseSelected() {
    if (state.isPaused || state.isWon || !state.selected) return;
    const { row, col } = state.selected;

    if (state.puzzle[row][col] !== 0) return; // Clue

    const prevVal = state.board[row][col];
    const prevNotes = new Set(state.notes[row][col]);

    if (prevVal === 0 && prevNotes.size === 0) return;

    state.board[row][col] = 0;
    state.notes[row][col].clear();

    state.history.push({
      type: 'erase',
      row,
      col,
      prevVal,
      prevNotes
    });

    renderBoard();
    saveGameState();
  }

  /**
   * Undo last action
   */
  function undoLastAction() {
    if (state.isPaused || state.isWon || state.history.length === 0) return;
    const lastAction = state.history.pop();
    const { row, col } = lastAction;

    if (lastAction.type === 'digit' || lastAction.type === 'erase' || lastAction.type === 'hint') {
      state.board[row][col] = lastAction.prevVal;
      state.notes[row][col] = new Set(lastAction.prevNotes || []);
    } else if (lastAction.type === 'notes') {
      state.notes[row][col] = new Set(lastAction.prevNotes);
    }

    state.selected = { row, col };
    renderBoard();
    saveGameState();
  }

  /**
   * Provide a Hint
   */
  function provideHint() {
    if (state.isPaused || state.isWon) return;

    let targetRow = -1;
    let targetCol = -1;

    // If an empty or incorrect cell is currently selected, use it
    if (state.selected && state.puzzle[state.selected.row][state.selected.col] === 0) {
      const { row, col } = state.selected;
      if (state.board[row][col] !== state.solution[row][col]) {
        targetRow = row;
        targetCol = col;
      }
    }

    // Otherwise find the first empty or wrong cell
    if (targetRow === -1) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (state.puzzle[r][c] === 0 && state.board[r][c] !== state.solution[r][c]) {
            targetRow = r;
            targetCol = c;
            break;
          }
        }
        if (targetRow !== -1) break;
      }
    }

    if (targetRow === -1) return; // Already solved

    const correctNum = state.solution[targetRow][targetCol];
    const prevVal = state.board[targetRow][targetCol];
    const prevNotes = new Set(state.notes[targetRow][targetCol]);

    state.board[targetRow][targetCol] = correctNum;
    state.notes[targetRow][targetCol].clear();
    pruneNotes(targetRow, targetCol, correctNum);

    state.history.push({
      type: 'hint',
      row: targetRow,
      col: targetCol,
      prevVal,
      prevNotes
    });

    state.selected = { row: targetRow, col: targetCol };
    renderBoard();
    saveGameState();
    checkVictory();
  }

  /**
   * Check for Victory
   */
  function checkVictory() {
    if (SudokuEngine.isSolved(state.board, state.solution)) {
      state.isWon = true;
      stopTimer();
      localStorage.removeItem(STORAGE_KEY);

      winTime.textContent = formatTime(state.timerSeconds);
      winDiff.textContent = state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1);
      winMistakes.textContent = state.mistakes;
      winModal.classList.remove('hidden');
    }
  }

  /**
   * Timer Utilities
   */
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (!state.isPaused && !state.isWon) {
        state.timerSeconds++;
        timerDisplay.textContent = formatTime(state.timerSeconds);
        // Persist periodically
        if (state.timerSeconds % 5 === 0) {
          saveGameState();
        }
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function resetTimer() {
    stopTimer();
    state.timerSeconds = 0;
    timerDisplay.textContent = '00:00';
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function pauseGame() {
    if (state.isWon) return;
    state.isPaused = true;
    iconPause.classList.add('hidden');
    iconPlay.classList.remove('hidden');
    pauseOverlay.classList.remove('hidden');
  }

  function unpauseGame() {
    state.isPaused = false;
    iconPause.classList.remove('hidden');
    iconPlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
  }

  function togglePause() {
    if (state.isPaused) {
      unpauseGame();
    } else {
      pauseGame();
    }
  }

  /**
   * Toggle Pencil Notes Mode
   */
  function toggleNotesMode() {
    state.notesMode = !state.notesMode;
    btnNotes.classList.toggle('active', state.notesMode);
    notesBadge.textContent = state.notesMode ? 'ON' : 'OFF';
  }

  /**
   * Theme Manager (Dark / Light)
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
      themeIconSun.classList.add('hidden');
      themeIconMoon.classList.remove('hidden');
    } else {
      themeIconSun.classList.remove('hidden');
      themeIconMoon.classList.add('hidden');
    }
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  }

  /**
   * Persistence (localStorage)
   */
  function saveGameState() {
    if (state.isWon) return;

    const serializableNotes = state.notes.map(row =>
      row.map(set => Array.from(set))
    );

    const data = {
      difficulty: state.difficulty,
      puzzle: state.puzzle,
      solution: state.solution,
      board: state.board,
      notes: serializableNotes,
      mistakes: state.mistakes,
      timerSeconds: state.timerSeconds
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Storage full or disabled
    }
  }

  function loadGameState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return false;

      const data = JSON.parse(saved);
      if (!data.puzzle || !data.solution || !data.board) return false;

      state.difficulty = data.difficulty || 'medium';
      difficultySelect.value = state.difficulty;
      displayDifficulty.textContent = state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1);

      state.puzzle = data.puzzle;
      state.solution = data.solution;
      state.board = data.board;
      state.mistakes = data.mistakes || 0;
      state.timerSeconds = data.timerSeconds || 0;
      displayMistakes.textContent = state.mistakes;
      timerDisplay.textContent = formatTime(state.timerSeconds);

      state.notes = data.notes.map(row =>
        row.map(arr => new Set(arr))
      );

      // Select first open cell
      state.selected = { row: 0, col: 0 };
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (state.board[r][c] === 0) {
            state.selected = { row: r, col: c };
            break;
          }
        }
        if (state.selected.row !== 0 || state.selected.col !== 0) break;
      }

      startTimer();
      renderBoard();
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Keyboard Navigation & Shortcuts
   */
  function setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept if user is typing in a form or dialog
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePause();
        return;
      }

      if (state.isPaused || state.isWon) return;

      // Digits 1-9
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        handleInputDigit(parseInt(e.key, 10));
        return;
      }

      // Delete / Backspace
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        e.preventDefault();
        eraseSelected();
        return;
      }

      // Toggle Notes (N)
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        toggleNotesMode();
        return;
      }

      // Hint (H)
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        provideHint();
        return;
      }

      // Undo (Ctrl+Z or Meta+Z or U)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undoLastAction();
        return;
      }
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        undoLastAction();
        return;
      }

      // Arrow navigation
      if (state.selected && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        let { row, col } = state.selected;

        if (e.key === 'ArrowUp') row = (row + 8) % 9;
        if (e.key === 'ArrowDown') row = (row + 1) % 9;
        if (e.key === 'ArrowLeft') col = (col + 8) % 9;
        if (e.key === 'ArrowRight') col = (col + 1) % 9;

        selectCell(row, col);
      }
    });
  }

  /**
   * Service Worker Registration for Offline Capability
   */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {
          // Fallback or dev mode
        });
      });
    }
  }

  /**
   * Initialize App
   */
  function init() {
    initGridDOM();

    // Theme initialization
    const savedTheme = localStorage.getItem(THEME_KEY) ||
      (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    applyTheme(savedTheme);

    // Event Listeners
    themeToggle.addEventListener('click', toggleTheme);
    btnPause.addEventListener('click', togglePause);
    btnResumeOverlay.addEventListener('click', unpauseGame);
    btnUndo.addEventListener('click', undoLastAction);
    btnErase.addEventListener('click', eraseSelected);
    btnNotes.addEventListener('click', toggleNotesMode);
    btnHint.addEventListener('click', provideHint);

    btnNewGame.addEventListener('click', () => {
      startNewGame(difficultySelect.value);
    });

    btnWinNew.addEventListener('click', () => {
      startNewGame(difficultySelect.value);
    });

    difficultySelect.addEventListener('change', (e) => {
      startNewGame(e.target.value);
    });

    // Numpad key listeners
    numpadButtons.forEach((btn) => {
      const digit = parseInt(btn.dataset.digit, 10);
      btn.addEventListener('click', () => {
        handleInputDigit(digit);
      });
    });

    setupKeyboard();
    registerServiceWorker();

    // Restore saved game or start fresh
    if (!loadGameState()) {
      startNewGame('medium');
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
