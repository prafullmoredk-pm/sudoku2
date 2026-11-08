/**
 * Sudoku Engine
 * Pure algorithmic logic for Sudoku generation, solving, and validation.
 * Zero external dependencies.
 */

(function (global) {
  'use strict';

  const GRID_SIZE = 9;
  const BOX_SIZE = 3;

  /**
   * Create an empty 9x9 grid (all zeros)
   */
  function createEmptyGrid() {
    return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
  }

  /**
   * Clone a 9x9 grid
   */
  function cloneGrid(grid) {
    return grid.map(row => [...row]);
  }

  /**
   * Shuffle an array using Fisher-Yates
   */
  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Check if placing `num` at (row, col) is valid in `grid`
   */
  function isValid(grid, row, col, num) {
    for (let i = 0; i < GRID_SIZE; i++) {
      if (grid[row][i] === num && i !== col) return false;
      if (grid[i][col] === num && i !== row) return false;
    }

    const startRow = Math.floor(row / BOX_SIZE) * BOX_SIZE;
    const startCol = Math.floor(col / BOX_SIZE) * BOX_SIZE;

    for (let r = 0; r < BOX_SIZE; r++) {
      for (let c = 0; c < BOX_SIZE; c++) {
        const curR = startRow + r;
        const curC = startCol + c;
        if (grid[curR][curC] === num && (curR !== row || curC !== col)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Fill a 3x3 box with random permutation of 1..9
   */
  function fillBox(grid, rowStart, colStart) {
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    let idx = 0;
    for (let r = 0; r < BOX_SIZE; r++) {
      for (let c = 0; c < BOX_SIZE; c++) {
        grid[rowStart + r][colStart + c] = nums[idx++];
      }
    }
  }

  /**
   * Find first empty cell (returns [row, col] or null)
   */
  function findEmptyCell(grid) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (grid[r][c] === 0) return [r, c];
      }
    }
    return null;
  }

  /**
   * Solve grid with randomized choices (generates a valid full board)
   */
  function solveRandom(grid) {
    const empty = findEmptyCell(grid);
    if (!empty) return true;

    const [row, col] = empty;
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    for (const num of nums) {
      if (isValid(grid, row, col, num)) {
        grid[row][col] = num;
        if (solveRandom(grid)) return true;
        grid[row][col] = 0;
      }
    }

    return false;
  }

  /**
   * Count solutions up to `limit` (for uniqueness verification)
   */
  function countSolutions(grid, limit = 2) {
    let count = 0;

    function backtrack(g) {
      if (count >= limit) return;

      const empty = findEmptyCell(g);
      if (!empty) {
        count++;
        return;
      }

      const [row, col] = empty;
      for (let num = 1; num <= 9; num++) {
        if (isValid(g, row, col, num)) {
          g[row][col] = num;
          backtrack(g);
          g[row][col] = 0;
          if (count >= limit) return;
        }
      }
    }

    const workingCopy = cloneGrid(grid);
    backtrack(workingCopy);
    return count;
  }

  /**
   * Solve grid deterministically, returns solved copy or null if unsolvable
   */
  function solve(grid) {
    const copy = cloneGrid(grid);

    function backtrack(g) {
      const empty = findEmptyCell(g);
      if (!empty) return true;

      const [row, col] = empty;
      for (let num = 1; num <= 9; num++) {
        if (isValid(g, row, col, num)) {
          g[row][col] = num;
          if (backtrack(g)) return true;
          g[row][col] = 0;
        }
      }
      return false;
    }

    return backtrack(copy) ? copy : null;
  }

  /**
   * Generate a complete valid board
   */
  function generateCompleteBoard() {
    const grid = createEmptyGrid();
    // Fill the 3 independent diagonal 3x3 boxes first (fast optimization)
    fillBox(grid, 0, 0);
    fillBox(grid, 3, 3);
    fillBox(grid, 6, 6);
    // Solve the rest with randomized order
    solveRandom(grid);
    return grid;
  }

  /**
   * Generate a puzzle with a specified difficulty
   * Difficulty clue targets:
   * - 'easy': ~40-44 clues
   * - 'medium': ~32-35 clues (default)
   * - 'hard': ~27-30 clues
   */
  function generatePuzzle(difficulty = 'medium') {
    const targets = {
      easy: 42,
      medium: 33,
      hard: 28
    };

    const targetClues = targets[difficulty] || 33;
    const solution = generateCompleteBoard();
    const puzzle = cloneGrid(solution);

    // List all cell positions [r, c] and shuffle
    const positions = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        positions.push([r, c]);
      }
    }
    const shuffledPositions = shuffle(positions);

    let cluesRemaining = 81;

    for (const [r, c] of shuffledPositions) {
      if (cluesRemaining <= targetClues) break;

      const temp = puzzle[r][c];
      puzzle[r][c] = 0;

      // Check if puzzle still has exactly one unique solution
      if (countSolutions(puzzle, 2) === 1) {
        cluesRemaining--;
      } else {
        // Not unique, restore value
        puzzle[r][c] = temp;
      }
    }

    return {
      puzzle,
      solution,
      cluesCount: cluesRemaining,
      difficulty
    };
  }

  /**
   * Detect all conflicting cells on the current board
   * Returns a Set of "row,col" strings that violate Sudoku rules
   */
  function findConflicts(grid) {
    const conflicts = new Set();

    // Check rows
    for (let r = 0; r < GRID_SIZE; r++) {
      const seen = new Map();
      for (let c = 0; c < GRID_SIZE; c++) {
        const val = grid[r][c];
        if (val !== 0) {
          if (seen.has(val)) {
            conflicts.add(`${r},${c}`);
            conflicts.add(`${r},${seen.get(val)}`);
          } else {
            seen.set(val, c);
          }
        }
      }
    }

    // Check columns
    for (let c = 0; c < GRID_SIZE; c++) {
      const seen = new Map();
      for (let r = 0; r < GRID_SIZE; r++) {
        const val = grid[r][c];
        if (val !== 0) {
          if (seen.has(val)) {
            conflicts.add(`${r},${c}`);
            conflicts.add(`${seen.get(val)},${c}`);
          } else {
            seen.set(val, r);
          }
        }
      }
    }

    // Check 3x3 boxes
    for (let br = 0; br < GRID_SIZE; br += BOX_SIZE) {
      for (let bc = 0; bc < GRID_SIZE; bc += BOX_SIZE) {
        const seen = new Map();
        for (let r = 0; r < BOX_SIZE; r++) {
          for (let c = 0; c < BOX_SIZE; c++) {
            const curR = br + r;
            const curC = bc + c;
            const val = grid[curR][curC];
            if (val !== 0) {
              if (seen.has(val)) {
                conflicts.add(`${curR},${curC}`);
                const [prevR, prevC] = seen.get(val);
                conflicts.add(`${prevR},${prevC}`);
              } else {
                seen.set(val, [curR, curC]);
              }
            }
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if a board is completely and correctly solved
   */
  function isSolved(grid, solution) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (grid[r][c] === 0 || grid[r][c] !== solution[r][c]) {
          return false;
        }
      }
    }
    return true;
  }

  const SudokuEngine = {
    createEmptyGrid,
    cloneGrid,
    isValid,
    solve,
    countSolutions,
    generateCompleteBoard,
    generatePuzzle,
    findConflicts,
    isSolved,
    GRID_SIZE,
    BOX_SIZE
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SudokuEngine;
  } else {
    global.SudokuEngine = SudokuEngine;
  }
})(typeof window !== 'undefined' ? window : globalThis);
