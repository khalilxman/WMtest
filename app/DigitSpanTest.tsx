"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import clsx from 'clsx';

// --- TYPES AND CONSTANTS ---
interface GenerateDigitsResult {
  sequence: number[];
  isValid: boolean;
}
type SpeedSetting = {
  label: string;
  speed: number;
  displayDuration: number;
};
const SPEED_SETTINGS: SpeedSetting[] = [
  { label: 'Slow', speed: 1400, displayDuration: 1390 },
  { label: 'Fast', speed: 700, displayDuration: 690 },
];
type TestMode = 'forward' | 'reverse';
interface TestState {
  span: number;
  speedIndex: number;
  mode: TestMode;
  digits: number[];
  status: 'idle' | 'generating' | 'displaying' | 'input' | 'result';
  result: { score: number; total: number; isPerfect: boolean } | null;
}
type TestAction =
  | { type: 'START_GENERATION' }
  | { type: 'SEQUENCE_GENERATED'; payload: GenerateDigitsResult }
  | { type: 'START_DISPLAY' }
  | { type: 'FINISH_DISPLAY' }
  | { type: 'SET_RESULT'; payload: { score: number; total: number; isPerfect: boolean } }
  | { type: 'RESET' }
  | { type: 'SET_SPAN'; payload: number }
  | { type: 'SET_SPEED'; payload: number }
  | { type: 'SET_MODE'; payload: TestMode };
const initialState: TestState = {
  span: 6,
  speedIndex: 0,
  mode: 'forward',
  digits: [],
  status: 'idle',
  result: null,
};

// --- REDUCER ---
function testReducer(state: TestState, action: TestAction): TestState {
  switch (action.type) {
    case 'START_GENERATION':
      return { ...initialState, span: state.span, speedIndex: state.speedIndex, mode: state.mode, status: 'generating' };
    case 'SEQUENCE_GENERATED':
      return {
        ...state,
        digits: action.payload.sequence,
      };
    case 'START_DISPLAY':
      return { ...state, status: 'displaying' };
    case 'FINISH_DISPLAY':
      return { ...state, status: 'input' };
    case 'SET_RESULT':
      return { ...state, status: 'result', result: action.payload };
    case 'RESET':
      return { ...initialState };
    case 'SET_SPAN':
      return { ...state, span: Math.max(3, Math.min(18, action.payload)) };
    case 'SET_SPEED':
      return { ...state, speedIndex: action.payload };
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    default:
      return state;
  }
}

// --- CUSTOM HOOKS ---
function useDigitSequence(dispatch: React.Dispatch<TestAction>) {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const workerUrl = new URL('/generation.worker.js', window.location.origin);
    workerRef.current = new Worker(workerUrl);

    workerRef.current.onmessage = (e: MessageEvent<GenerateDigitsResult>) => {
      dispatch({ type: 'SEQUENCE_GENERATED', payload: e.data });
      setTimeout(() => dispatch({ type: 'START_DISPLAY' }), 50);
    };
    return () => {
        workerRef.current?.terminate();
    };
  }, [dispatch]);

  const generateSequence = useCallback((length: number) => {
    dispatch({ type: 'START_GENERATION' });
    workerRef.current?.postMessage({ length });
  }, []);

  return generateSequence;
}

function useSequenceDisplay(state: TestState, dispatch: React.Dispatch<TestAction>) {
  const [displayedDigit, setDisplayedDigit] = useState<number | null>(null);
  const { status, digits, speedIndex } = state;
  const currentSpeed = SPEED_SETTINGS[speedIndex];
  useEffect(() => {
    if (status !== 'displaying' || digits.length === 0) {
      setDisplayedDigit(null);
      return;
    }
    let index = 0;
    let displayTimeout: NodeJS.Timeout;
    let gapTimeout: NodeJS.Timeout;
    const showNext = () => {
      if (index < digits.length) {
        setDisplayedDigit(digits[index]);
        displayTimeout = setTimeout(() => {
          setDisplayedDigit(null);
          gapTimeout = setTimeout(() => {
            index++;
            showNext();
          }, currentSpeed.speed - currentSpeed.displayDuration);
        }, currentSpeed.displayDuration);
      } else {
        dispatch({ type: 'FINISH_DISPLAY' });
      }
    };
    const startTimeout = setTimeout(showNext, 500);
    return () => {
      clearTimeout(startTimeout);
      clearTimeout(displayTimeout);
      clearTimeout(gapTimeout);
    };
  }, [status, digits, currentSpeed, dispatch]);
  return displayedDigit;
}

function useUserInput(state: TestState, dispatch: React.Dispatch<TestAction>) {
  const [input, setInput] = useState<number[]>([]);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const { span, digits, mode, status } = state;
  const isInputDisabled = status !== 'input';

  const resetInput = useCallback(() => {
    setInput([]);
    setCursorPosition(null);
  }, []);

  useEffect(() => {
    if (status === 'generating') {
      resetInput();
    }
  }, [status, resetInput]);

  const handleInput = useCallback((num: number) => {
    if (isInputDisabled || input.length >= span) return;
    const newPosition = cursorPosition === null ? input.length + 1 : cursorPosition + 1;
    const insertAt = cursorPosition === null ? input.length : cursorPosition;
    const newInput = [...input];
    newInput.splice(insertAt, 0, num);
    setInput(newInput);
    setCursorPosition(newPosition);
    if (newInput.length === span) {
      const correct = mode === 'forward' ? digits : [...digits].reverse();
      const score = newInput.reduce((acc, val, i) => acc + (val === correct[i] ? 1 : 0), 0);
      dispatch({ type: 'SET_RESULT', payload: { score, total: span, isPerfect: score === span } });
      setCursorPosition(null);
    }
  }, [input, cursorPosition, isInputDisabled, span, digits, mode, dispatch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputDisabled) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleInput(parseInt(e.key));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (cursorPosition === 0) return;
        const deleteAt = cursorPosition === null ? input.length - 1 : cursorPosition - 1;
        if (deleteAt < 0) return;
        const newInput = [...input];
        newInput.splice(deleteAt, 1);
        setInput(newInput);
        setCursorPosition(deleteAt);
      } else if (e.key === 'Delete') {
          e.preventDefault();
          if (cursorPosition === null || cursorPosition >= input.length) return;
          const newInput = [...input];
          newInput.splice(cursorPosition, 1);
          setInput(newInput);
        } else if (e.key === 'ArrowLeft') {
        setCursorPosition(p => Math.max(0, (p ?? 0) - 1));
      } else if (e.key === 'ArrowRight') {
        setCursorPosition(p => Math.min(input.length, (p ?? 0) + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInput, isInputDisabled, input, cursorPosition]);

  return { input, cursorPosition, setCursorPosition, handleInput };
}

// --- SUB-COMPONENTS ---
const Display = ({ state, displayedDigit }: { state: TestState; displayedDigit: number | null }) => {
    const { status, result, mode, digits } = state;
    const getMessage = () => {
    switch (status) {
      case 'generating': return "Generating...";
      case 'displaying': return null;
      case 'input': return `Enter ${state.span} digits...`;
      case 'result': return `Score: ${result?.score}/${result?.total}`;
      default: return "Press 'New Test'";
    }
    };
    return (
        <div className="h-28 flex flex-col items-center justify-center space-y-2 text-center">
            {status === 'generating' && <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>}
            {displayedDigit !== null ? (
            <div className="text-5xl sm:text-6xl font-mono text-blue-700 font-bold">{displayedDigit}</div>
            ) : (
            <p className="text-lg text-gray-600">{getMessage()}</p>
            )}
            {result && (
                <p className="text-sm text-gray-500">
                    Correct: {mode === 'forward' ? digits.join(' ') : [...digits].reverse().join(' ')}
                </p>
            )}
        </div>
    );
};

const InputDisplay = ({ 
    input, 
    cursorPosition, 
    setCursorPosition,
    status 
}: { 
    input: number[], 
    cursorPosition: number | null, 
    setCursorPosition: (pos: number) => void,
    status: TestState['status'] 
}) => {
    const isInputDisabled = status !== 'input';
    return (
        <div 
            onClick={() => !isInputDisabled && setCursorPosition(input.length)}
            className={clsx(
                "h-16 w-full border-2 border-blue-500 rounded-lg px-4 font-mono text-3xl bg-white shadow-inner flex items-center justify-center relative",
                !isInputDisabled && "cursor-text"
            )}
        >
            <div className="flex items-center tracking-widest">
                {input.map((digit, index) => (
                <React.Fragment key={index}>
                    {cursorPosition === index && <div className="w-0.5 h-8 bg-blue-600 animate-pulse"></div>}
                    <span 
                        className="cursor-pointer px-1"
                        onClick={(e) => {
                            if (!isInputDisabled) {
                            e.stopPropagation();
                            setCursorPosition(index + 1);
                            }
                        }}
                    >
                    {digit}
                    </span>
                </React.Fragment>
                ))}
                {cursorPosition === input.length && input.length > 0 && <div className="w-0.5 h-8 bg-blue-600 animate-pulse"></div>}
            </div>
        </div>
    );
};

const KeypadAndControls = ({ 
    state, 
    dispatch, 
    onNumberClick, 
    onNewTest, 
    isInputDisabled, 
    isControlDisabled 
}: { 
    state: TestState, 
    dispatch: React.Dispatch<TestAction>, 
    onNumberClick: (n: number) => void,
    onNewTest: () => void,
    isInputDisabled: boolean,
    isControlDisabled: boolean 
}) => {
    
    const { span, speedIndex, mode } = state;
    const numberKeys = [7, 8, 9, 4, 5, 6, 1, 2, 3];
    const blueBtn = "bg-blue-600 hover:bg-blue-700";
    const greenBtn = "bg-green-600 hover:bg-green-700";
    const orangeBtn = "bg-orange-500 hover:bg-orange-600";
    const baseBtn = "text-white py-4 rounded-md font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center";

    return (
        <div className="space-y-2">
            {/* Main Number Pad - This is your "mouse keyboard" */}
            <div className="grid grid-cols-3 gap-2">
                {numberKeys.map(n => (
                    <button key={n} onClick={() => onNumberClick(n)} disabled={isInputDisabled} className={clsx(baseBtn, blueBtn, "text-xl")}>
                        {n}
                    </button>
                ))}
            </div>

            {/* Zero Button Row */}
            <div className="grid grid-cols-3 gap-2">
                 <button onClick={() => onNumberClick(0)} disabled={isInputDisabled} className={clsx(baseBtn, blueBtn, "text-xl col-start-2")}>0</button>
            </div>
            
            {/* Lower Controls Row */}
            <div className="grid grid-cols-3 gap-2 items-stretch">
                {/* Col 1: Span Control (FIXED) */}
                <div className={clsx(
                    baseBtn, 
                    // This now uses isControlDisabled to conditionally apply the gray background
                    isControlDisabled ? 'bg-gray-400' : orangeBtn, 
                    "py-0 text-base"
                )}>
                    <button onClick={() => dispatch({ type: 'SET_SPAN', payload: span - 1 })} disabled={isControlDisabled} className="hover:bg-orange-600 px-3 py-3 rounded-l-md disabled:opacity-50 text-lg">–</button>
                    <span className="flex-grow text-center text-sm font-semibold">Span: {span}</span>
                    <button onClick={() => dispatch({ type: 'SET_SPAN', payload: span + 1 })} disabled={isControlDisabled} className="hover:bg-orange-600 px-3 py-3 rounded-r-md disabled:opacity-50 text-lg">+</button>
                </div>

                {/* Col 2: Speed and Mode stacked */}
                <div className="flex flex-col gap-2">
                    <button onClick={() => dispatch({ type: 'SET_SPEED', payload: (speedIndex + 1) % 2 })} disabled={isControlDisabled} className={clsx(baseBtn, orangeBtn, "text-xs px-1 py-2 flex-1")}>
                        Speed: {SPEED_SETTINGS[speedIndex].label}
                    </button>
                    <button onClick={() => dispatch({ type: 'SET_MODE', payload: mode === 'forward' ? 'reverse' : 'forward' })} disabled={isControlDisabled} className={clsx(baseBtn, orangeBtn, "text-xs px-1 py-2 flex-1")}>
                        {mode === 'forward' ? 'Forward' : 'Reverse'}
                    </button>
                </div>

                {/* Col 3: New Test Button */}
                <button onClick={onNewTest} disabled={isControlDisabled} className={clsx(baseBtn, greenBtn, "text-lg h-full")}>
                    New Test
                </button>
            </div>
        </div>
    );
}

// --- MAIN COMPONENT ---
export default function DigitSpanTest() {
  const [state, dispatch] = useReducer(testReducer, initialState);
  const generateSequence = useDigitSequence(dispatch);
  const displayedDigit = useSequenceDisplay(state, dispatch);
  const { input, cursorPosition, setCursorPosition, handleInput } = useUserInput(state, dispatch);
  
  const isControlDisabled = useMemo(() => state.status === 'displaying' || state.status === 'generating', [state.status]);
  const isInputDisabled = useMemo(() => state.status !== 'input', [state.status]);

  const handleNewTest = () => {
    generateSequence(state.span);
  };
  
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 pt-8">
      
      {/* Logo and Link Section */}
      <div className="text-center w-full max-w-sm md:max-w-2xl px-4">
            <img 
                src="/working-memory-logo.jpg" 
                alt="Working Memory Test Logo"
                className="w-28 h-28 mx-auto mb-4" 
            />
            <a href="/personality-test" className="text-lg text-blue-600 hover:underline font-semibold">
              Personality test
            </a>
      </div>

      {/* Introduction Text Section */}
      <div className="w-full max-w-sm md:max-w-2xl bg-white shadow-md rounded-lg p-5 my-6 text-left">
          <p className="text-gray-700 leading-relaxed mb-4">
              Working Memory is the capacity of our brains to hold a certain amount of novel information and manipulate or "play" with it over a short period.
          </p>
          <p className="text-gray-700 leading-relaxed mb-4">
              Based on Dr. Jordan Peterson's model, we can view the world as two territories: the <strong>Known</strong> (what we've mapped) and the <strong>Unknown</strong> (what we haven't). A problem or threat is often a manifestation of the Unknown. The capacity to process that Unknown and integrate it into our map of the world is Working Memory.
          </p>
          <p className="text-gray-700 leading-relaxed mb-4">
              You see this in action during IQ tests, especially "Culture Fair" tests. A sequence of abstract objects is presented, and you must mentally manipulate the patterns to infer which object fits next. While the famous "7 plus-or-minus 2" is often cited, performance varies greatly. For this kind of test, most people can hold between 3 to 5 items.
          </p>
          <h2 className="text-lg font-semibold text-gray-800 mt-4 mb-2">Correlation with Intelligence</h2>
          <p className="text-gray-700 leading-relaxed">
             You can think of Working Memory as the brain's "RAM"—its capacity and manipulation ability. This works alongside processing speed, which is the ability to comprehend and assign meaning to that information. Both are crucial aspects of intelligence.
          </p>
      </div>

      {/* Main Test Application */}
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-xl w-full max-w-sm md:max-w-md text-center space-y-4">
        
        <Display state={state} displayedDigit={displayedDigit} />

        <InputDisplay 
            input={input} 
            cursorPosition={cursorPosition}
            setCursorPosition={setCursorPosition}
            status={state.status}
        />
        
        <KeypadAndControls
            state={state}
            dispatch={dispatch}
            onNumberClick={handleInput}
            onNewTest={handleNewTest}
            isInputDisabled={isInputDisabled}
            isControlDisabled={isControlDisabled}
        />
        
      </div>
    </div>
  );
}
