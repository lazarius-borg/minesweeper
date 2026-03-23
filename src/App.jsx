import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bomb, Clock, RotateCcw, Trophy, Settings, Flag, MousePointer2 } from 'lucide-react';

const LEVELS = {
  beginner: { name: 'Beginner', w: 8, h: 8, m: 10 },
  intermediate: { name: 'Intermediate', w: 16, h: 16, m: 40 },
  expert: { name: 'Expert', w: 30, h: 16, m: 99 }
};

const NUMBER_COLORS = {
  1: 'text-blue-600',
  2: 'text-green-600',
  3: 'text-red-600',
  4: 'text-purple-600',
  5: 'text-yellow-700',
  6: 'text-teal-600',
  7: 'text-black',
  8: 'text-gray-600'
};

let audioCtx = null;
const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

const playStartTune = () => {
  try {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const playNote = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + start);
      gain.gain.setValueAtTime(0, t + start);
      gain.gain.linearRampToValueAtTime(0.15, t + start + 0.05);
      gain.gain.linearRampToValueAtTime(0, t + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + duration);
    };
    playNote(523.25, 0.0, 0.4); // C5
    playNote(659.25, 0.3, 0.4); // E5
    playNote(783.99, 0.6, 0.4); // G5
    playNote(1046.50, 0.9, 0.8); // C6
  } catch (e) { console.warn("Audio not supported", e); }
};

const playExplosion = () => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) { console.warn("Audio not supported", e); }
};

export default function App() {
  const [level, setLevel] = useState('beginner');
  const [board, setBoard] = useState([]);
  const [status, setStatus] = useState('idle'); // idle, playing, won, lost, animating
  const [time, setTime] = useState(0);
  const [flagsCount, setFlagsCount] = useState(0);
  const [history, setHistory] = useState({ beginner: null, intermediate: null, expert: null });
  const [showOverlay, setShowOverlay] = useState(false);
  const [interactionMode, setInteractionMode] = useState('dig'); // 'dig' or 'flag'
  const explosionTimeouts = useRef([]);

  const config = LEVELS[level];

  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('minesweeper_history');
      if (savedHistory) setHistory(JSON.parse(savedHistory));
    } catch (e) {
      console.warn("Could not load history", e);
    }
  }, []);

  // Timer
  useEffect(() => {
    let interval = null;
    if (status === 'playing') {
      interval = setInterval(() => setTime(t => t + 1), 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [status]);

  // Board Initialization
  const initBoard = useCallback(() => {
    explosionTimeouts.current.forEach(clearTimeout);
    explosionTimeouts.current = [];

    const newBoard = Array.from({ length: config.h }, (_, y) =>
      Array.from({ length: config.w }, (_, x) => ({
        x, y,
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        neighborMines: 0
      }))
    );
    setBoard(newBoard);
    setStatus('idle');
    setTime(0);
    setFlagsCount(0);
    setShowOverlay(false);
  }, [config]);

  useEffect(() => {
    initBoard();
  }, [initBoard, level]);

  const placeMines = (currentBoard, firstX, firstY) => {
    let minesPlaced = 0;
    while (minesPlaced < config.m) {
      const rx = Math.floor(Math.random() * config.w);
      const ry = Math.floor(Math.random() * config.h);

      const isFirstClickArea = Math.abs(rx - firstX) <= 1 && Math.abs(ry - firstY) <= 1;

      if (!currentBoard[ry][rx].isMine && !isFirstClickArea) {
        currentBoard[ry][rx].isMine = true;
        minesPlaced++;
      }
    }

    for (let y = 0; y < config.h; y++) {
      for (let x = 0; x < config.w; x++) {
        if (!currentBoard[y][x].isMine) {
          let count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < config.h && nx >= 0 && nx < config.w && currentBoard[ny][nx].isMine) {
                count++;
              }
            }
          }
          currentBoard[y][x].neighborMines = count;
        }
      }
    }
    return currentBoard;
  };

  const processReveal = (startBoard, startCoords) => {
    const currentBoard = [...startBoard.map(row => [...row.map(cell => ({ ...cell }))])];
    const stack = [...startCoords];
    let hitMine = null;

    while (stack.length > 0) {
      const [cx, cy] = stack.pop();
      const cell = currentBoard[cy][cx];

      if (cell.isRevealed || cell.isFlagged) continue;

      cell.isRevealed = true;

      if (cell.isMine) {
        hitMine = { x: cx, y: cy };
        break;
      }

      if (cell.neighborMines === 0) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = cy + dy;
            const nx = cx + dx;
            if (ny >= 0 && ny < config.h && nx >= 0 && nx < config.w) {
              if (!currentBoard[ny][nx].isRevealed && !currentBoard[ny][nx].isFlagged) {
                stack.push([nx, ny]);
              }
            }
          }
        }
      }
    }
    return { newBoard: currentBoard, hitMine };
  };

  const handleLoss = (currentBoard, hitMine) => {
    setStatus('animating');
    playExplosion();

    const newBoard = [...currentBoard.map(row => [...row.map(cell => ({ ...cell }))])];
    if (hitMine) {
      newBoard[hitMine.y][hitMine.x].isRevealed = true;
    }
    setBoard(newBoard);

    const otherMines = [];
    newBoard.forEach(row => row.forEach(cell => {
      if (cell.isMine && (!hitMine || cell.x !== hitMine.x || cell.y !== hitMine.y) && !cell.isFlagged && !cell.isRevealed) {
        otherMines.push(cell);
      }
    }));

    for (let i = otherMines.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [otherMines[i], otherMines[j]] = [otherMines[j], otherMines[i]];
    }

    let index = 0;
    const animateExplosions = () => {
      if (index < otherMines.length) {
        const m = otherMines[index];
        setBoard(prev => {
          const b = [...prev.map(r => [...r.map(c => ({ ...c }))])];
          b[m.y][m.x].isRevealed = true;
          return b;
        });
        playExplosion();
        index++;
        const tid = setTimeout(animateExplosions, 80 + Math.random() * 50);
        explosionTimeouts.current.push(tid);
      } else {
        setStatus('lost');
        setShowOverlay(true);
      }
    };

    if (otherMines.length > 0) {
      const tid = setTimeout(animateExplosions, 400);
      explosionTimeouts.current.push(tid);
    } else {
      const tid = setTimeout(() => {
        setStatus('lost');
        setShowOverlay(true);
      }, 500);
      explosionTimeouts.current.push(tid);
    }
  };

  const checkWin = (currentBoard) => {
    let revealedCount = 0;
    currentBoard.forEach(row => row.forEach(cell => {
      if (cell.isRevealed) revealedCount++;
    }));

    if (revealedCount === (config.w * config.h) - config.m) {
      currentBoard.forEach(row => row.forEach(cell => {
        if (cell.isMine) cell.isFlagged = true;
      }));
      setBoard(currentBoard);
      setStatus('won');
      setFlagsCount(config.m);
      setShowOverlay(true);

      const currentBest = history[level];
      if (!currentBest || time < currentBest) {
        const newHistory = { ...history, [level]: time };
        setHistory(newHistory);
        try {
          localStorage.setItem('minesweeper_history', JSON.stringify(newHistory));
        } catch (e) {
          console.warn("Could not save history", e);
        }
      }
    }
  };

  const revealCell = (x, y) => {
    if (status === 'won' || status === 'lost' || status === 'animating') return;
    if (board[y][x].isRevealed || board[y][x].isFlagged) return;

    let currentBoard = board;

    if (status === 'idle') {
      currentBoard = placeMines([...board.map(row => [...row.map(cell => ({ ...cell }))])], x, y);
      setStatus('playing');
      playStartTune();
    }

    const { newBoard, hitMine } = processReveal(currentBoard, [[x, y]]);

    if (hitMine) {
      handleLoss(newBoard, hitMine);
    } else {
      setBoard(newBoard);
      checkWin(newBoard);
    }
  };

  const handleRightClick = (e, x, y) => {
    e.preventDefault();
    if (status === 'won' || status === 'lost' || status === 'animating') return;

    const cell = board[y][x];

    if (cell.isRevealed) {
      if (cell.neighborMines > 0) {
        let flagCount = 0;
        const neighborsToReveal = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < config.h && nx >= 0 && nx < config.w) {
              if (board[ny][nx].isFlagged) flagCount++;
              else if (!board[ny][nx].isRevealed) neighborsToReveal.push([nx, ny]);
            }
          }
        }

        if (flagCount === cell.neighborMines && neighborsToReveal.length > 0) {
          const { newBoard, hitMine } = processReveal(board, neighborsToReveal);
          if (hitMine) {
            handleLoss(newBoard, hitMine);
          } else {
            setBoard(newBoard);
            checkWin(newBoard);
          }
        }
      }
    } else {
      const currentBoard = [...board.map(row => [...row.map(c => ({ ...c }))])];
      currentBoard[y][x].isFlagged = !currentBoard[y][x].isFlagged;
      setBoard(currentBoard);
      setFlagsCount(currentBoard.flat().filter(c => c.isFlagged).length);
    }
  };

  const handleClick = (e, x, y) => {
    if (e.ctrlKey || interactionMode === 'flag') {
      handleRightClick(e, x, y);
    } else {
      revealCell(x, y);
    }
  };

  const formatTime = (seconds) => {
    if (seconds === null) return '--:--';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans flex flex-col items-center py-8 px-4 selection:bg-transparent">

      {/* Header */}
      <div className="w-full max-w-4xl flex flex-col items-center gap-6 mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight flex items-center gap-3">
          <Bomb className="w-10 h-10 text-red-500" />
          Minesweeper
        </h1>

        {/* Controls Row */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
          {/* Difficulty Selector */}
          <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            {Object.keys(LEVELS).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all ${level === lvl
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
              >
                {LEVELS[lvl].name}
              </button>
            ))}
          </div>

          {/* Touch Mode Controller */}
          <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setInteractionMode('dig')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${interactionMode === 'dig' ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-inner' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <MousePointer2 className="w-4 h-4" /> Dig
            </button>
            <button
              onClick={() => setInteractionMode('flag')}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${interactionMode === 'flag' ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 shadow-inner' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <Flag className="w-4 h-4" /> Flag
            </button>
          </div>
        </div>
      </div>

      {/* Game Container */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-min">

        {/* Status Bar */}
        <div className="flex justify-between items-center bg-gray-100 dark:bg-gray-900 p-4 rounded-xl mb-6 shadow-inner border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-2xl font-mono font-bold text-red-500 bg-black px-4 py-2 rounded-lg shadow-inner min-w-[100px] justify-center">
            <Flag className="w-5 h-5 text-red-500" />
            {String(config.m - flagsCount).padStart(3, '0')}
          </div>

          <button
            onClick={initBoard}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-transform active:scale-95 shadow-sm border border-gray-300 dark:border-gray-600 text-xl font-bold"
          >
            {status === 'won' ? '😎' : (status === 'lost' || status === 'animating') ? '😵' : '😀'}
          </button>

          <div className="flex items-center gap-2 text-2xl font-mono font-bold text-red-500 bg-black px-4 py-2 rounded-lg shadow-inner min-w-[100px] justify-center">
            <Clock className="w-5 h-5 text-red-500" />
            {String(time).padStart(3, '0')}
          </div>
        </div>

        {/* Board */}
        <div className="overflow-x-auto overflow-y-hidden max-w-[90vw] touch-pan-x touch-pan-y rounded-lg border-4 border-gray-300 dark:border-gray-600 w-fit mx-auto">
          <div
            className="grid select-none"
            style={{
              gridTemplateColumns: `repeat(${config.w}, minmax(0, 1fr))`,
              width: `${config.w * 2}rem`
            }}
          >
            {board.map((row, y) =>
              row.map((cell, x) => (
                <div
                  key={`${x}-${y}`}
                  onContextMenu={(e) => handleRightClick(e, x, y)}
                  onClick={(e) => handleClick(e, x, y)}
                  className={`w-8 h-8 flex items-center justify-center font-bold text-lg leading-none transition-colors border
                    ${cell.isRevealed
                      ? cell.isMine
                        ? 'bg-red-500 border-red-600'
                        : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                      : 'bg-gray-300 dark:bg-gray-600 border-t-white border-l-white border-b-gray-400 border-r-gray-400 hover:bg-gray-200 dark:hover:bg-gray-500 cursor-pointer'
                    }
                  `}
                >
                  {cell.isRevealed ? (
                    cell.isMine ? '💣' : cell.neighborMines > 0 ? (
                      <span className={NUMBER_COLORS[cell.neighborMines]}>{cell.neighborMines}</span>
                    ) : ''
                  ) : cell.isFlagged ? (
                    '🚩'
                  ) : ''}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* History Panel */}
      <div className="mt-8 flex gap-4 flex-wrap justify-center">
        {Object.keys(LEVELS).map((lvl) => (
          <div key={lvl} className="flex items-center gap-3 bg-white dark:bg-gray-800 px-5 py-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <Trophy className={`w-5 h-5 ${history[lvl] ? 'text-yellow-500' : 'text-gray-400'}`} />
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 font-semibold uppercase">{LEVELS[lvl].name}</span>
              <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{formatTime(history[lvl])}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Game Over Modal */}
      {showOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 flex flex-col items-center text-center scale-in-center border border-gray-200 dark:border-gray-700">
            <div className="text-6xl mb-4">
              {status === 'won' ? '🎉' : '💥'}
            </div>
            <h2 className={`text-3xl font-extrabold mb-2 ${status === 'won' ? 'text-green-500' : 'text-red-500'}`}>
              {status === 'won' ? 'You Won!' : 'Game Over'}
            </h2>

            <div className="w-full bg-gray-50 dark:bg-gray-900 rounded-xl p-4 my-6 flex flex-col gap-3 border border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-center text-lg">
                <span className="text-gray-500 font-medium">Time</span>
                <span className="font-mono font-bold">{formatTime(time)}</span>
              </div>
              <div className="h-px w-full bg-gray-200 dark:bg-gray-700"></div>
              <div className="flex justify-between items-center text-lg">
                <span className="text-gray-500 font-medium">Best Time</span>
                <span className="font-mono font-bold text-yellow-600 dark:text-yellow-400">
                  {formatTime(history[level])}
                </span>
              </div>
            </div>

            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowOverlay(false)}
                className="flex-1 py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 font-semibold rounded-xl transition-colors text-gray-800 dark:text-gray-200"
              >
                View Board
              </button>
              <button
                onClick={initBoard}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}