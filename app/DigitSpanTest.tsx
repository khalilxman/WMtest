"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

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
    result: { score: number; total: number; isPerfect: boolean; userInput: number[] } | null;
}
type TestAction =
    | { type: 'START_GENERATION' }
    | { type: 'SEQUENCE_GENERATED'; payload: GenerateDigitsResult }
    | { type: 'START_DISPLAY' }
    | { type: 'FINISH_DISPLAY' }
    | { type: 'SET_RESULT'; payload: { score: number; total: number; isPerfect: boolean; userInput: number[] } }
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
            return { ...state, digits: action.payload.sequence };
        case 'START_DISPLAY':
            return { ...state, status: 'displaying' };
        case 'FINISH_DISPLAY':
            return { ...state, status: 'input' };
        case 'SET_RESULT':
            return { ...state, status: 'result', result: action.payload };
        case 'RESET':
            return { ...initialState, span: state.span, speedIndex: state.speedIndex, mode: state.mode };
        case 'SET_SPAN':
            if (state.status === 'displaying' || state.status === 'generating') return state;
            return { ...state, span: Math.max(3, Math.min(18, action.payload)) };
        case 'SET_SPEED':
            if (state.status === 'displaying' || state.status === 'generating') return state;
            return { ...state, speedIndex: action.payload };
        case 'SET_MODE':
            if (state.status === 'displaying' || state.status === 'generating') return state;
            return { ...state, mode: action.payload };
        default:
            return state;
    }
}

// --- CUSTOM HOOKS ---
function useDigitSequence(dispatch: React.Dispatch<TestAction>) {
    const workerRef = useRef<Worker | null>(null);
    useEffect(() => {
        if (typeof window === 'undefined') return;
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
    return useCallback((length: number) => {
        dispatch({ type: 'START_GENERATION' });
        workerRef.current?.postMessage({ length });
    }, []);
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
    const { span, digits, mode, status } = state;
    const isInputDisabled = status !== 'input';

    const resetInput = useCallback(() => setInput([]), []);
    useEffect(() => {
        if (status !== 'input' && status !== 'result') {
            resetInput();
        }
    }, [status, resetInput]);

    const handleInput = useCallback((num: number) => {
        if (isInputDisabled || input.length >= span) return;
        setInput(current => [...current, num]);
    }, [input.length, isInputDisabled, span]);

    const handleDelete = useCallback(() => {
        if (isInputDisabled) return;
        setInput(current => current.slice(0, -1));
    }, [isInputDisabled]);

    const handleRemoveByIndex = useCallback((indexToRemove: number) => {
        if (isInputDisabled) return;
        setInput(current => current.filter((_, index) => index !== indexToRemove));
    }, [isInputDisabled]);

    useEffect(() => {
        if (input.length === span) {
            const correct = mode === 'forward' ? digits : [...digits].reverse();
            const score = input.reduce((acc, val, i) => acc + (val === correct[i] ? 1 : 0), 0);
            dispatch({ type: 'SET_RESULT', payload: { score, total: span, isPerfect: score === span, userInput: input } });
        }
    }, [input, span, digits, mode, dispatch]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isInputDisabled) return;
            if (e.key >= '0' && e.key <= '9') {
                e.preventDefault();
                handleInput(parseInt(e.key));
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                handleDelete();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleInput, handleDelete, isInputDisabled]);

    return { input, handleInput, resetInput, handleRemoveByIndex };
}

function useButtonFeedback(onClick: Function) {
    const [isPressed, setIsPressed] = useState(false);
    const handleClick = (...args: any) => {
        setIsPressed(true);
        if (onClick) onClick(...args);
        setTimeout(() => setIsPressed(false), 150);
    };
    return { isPressed, handleClick };
}

// --- SUB-COMPONENTS ---
const Display = ({ state, displayedDigit }: { state: TestState; displayedDigit: number | null }) => {
    const { status, result, mode, digits, span } = state;
    const getMessage = () => {
        switch (status) {
            case 'generating': return "Generating...";
            case 'displaying': return "Memorize...";
            case 'input': return `Enter ${span} digits...`;
            case 'result': return `You scored: ${result?.score}/${result?.total}`;
            default: return "Press 'Start Test'";
        }
    };

    return (
        <div className="h-32 flex flex-col items-center justify-center space-y-2 text-center">
            <AnimatePresence mode="wait">
                {status === 'displaying' && displayedDigit !== null ? (
                    <motion.div
                        key={`digit-${displayedDigit}-${Math.random()}`}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.2 }}
                        className="text-7xl font-mono text-gray-800 font-bold"
                    >
                        {displayedDigit}
                    </motion.div>
                ) : (
                    <motion.p
                        key="message"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-xl text-gray-600"
                    >
                        {getMessage()}
                    </motion.p>
                )}
            </AnimatePresence>
            {status === 'generating' && <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mt-2"></div>}
            {status === 'result' && result && (
                <div className="text-sm text-gray-500 mt-2">
                    <p>Correct: {mode === 'forward' ? digits.join(' ') : [...digits].reverse().join(' ')}</p>
                    <p>Your input: {result.userInput.join(' ')}</p>
                </div>
            )}
        </div>
    );
};

const InputDisplay = ({ input, onRemove, isDisabled }: { input: number[], onRemove: (index: number) => void, isDisabled: boolean }) => {
    // UPDATED: Style is now based on current input length, not max span
    const styles = useMemo(() => {
        const length = input.length || 1; // Use 1 for placeholder to avoid zero
        if (length <= 8) return { fontSize: '2.25rem', gap: '0.4rem', padding: '0.25rem' }; // Large
        if (length <= 11) return { fontSize: '2rem', gap: '0.2rem', padding: '0.2rem' };    // Medium
        if (length <= 14) return { fontSize: '1.75rem', gap: '0.1rem', padding: '0.1rem' }; // Small
        return { fontSize: '1.5rem', gap: '0rem', padding: '0.1rem' };                   // Smallest, no gap
    }, [input.length]);

    return (
        <div className="h-16 w-full bg-white border-2 border-gray-300 rounded-lg flex items-center justify-center px-2 overflow-hidden shadow-inner">
            <div
                className="w-full font-mono text-center flex justify-center items-center"
                style={{ gap: styles.gap }}
            >
                <AnimatePresence>
                    {input.length > 0 ? (
                        input.map((digit, index) => (
                            <motion.button
                                key={`${digit}-${index}`}
                                onClick={() => onRemove(index)}
                                disabled={isDisabled}
                                layout
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                className="text-gray-800 rounded-md hover:bg-red-100 hover:text-red-500 disabled:hover:bg-transparent disabled:hover:text-gray-800 cursor-pointer disabled:cursor-default"
                                style={{
                                    fontSize: styles.fontSize,
                                    lineHeight: 1,
                                    padding: styles.padding
                                }}
                            >
                                {digit}
                            </motion.button>
                        ))
                    ) : (
                        <span className="text-gray-400" style={{ fontSize: styles.fontSize }}>|</span>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};


const Button = ({ onClick, children, className, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
    const { isPressed, handleClick } = useButtonFeedback(onClick!);
    return (
        <motion.button
            onClick={handleClick}
            disabled={disabled}
            className={clsx(className)}
            animate={{ scale: isPressed ? 0.95 : 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 15 }}
            {...props}
        >
            {children}
        </motion.button>
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
    const numberKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const tealBtn = "bg-[#0A7E7A] hover:bg-[#086864] text-white";
    const orangeBtn = "bg-orange-500 hover:bg-orange-600 text-white";
    const baseBtn = "rounded-lg font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed shadow-md flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500";

    return (
        <div className="w-full space-y-2">
            <Button onClick={onNewTest} disabled={isControlDisabled} className={clsx(baseBtn, orangeBtn, "text-lg w-full py-4")}>
                Start Test
            </Button>
            
            <div className="grid grid-cols-3 gap-2">
                {numberKeys.map(n => (
                    <Button key={n} onClick={() => onNumberClick(n)} disabled={isInputDisabled} className={clsx(baseBtn, tealBtn, "text-2xl h-14")}>
                        {n}
                    </Button>
                ))}
                
                <div className={clsx(baseBtn, orangeBtn, "py-0 text-base h-14")}>
                    <Button onClick={() => dispatch({ type: 'SET_SPAN', payload: span - 1 })} disabled={isControlDisabled} className="hover:bg-orange-600/80 px-3 h-full rounded-l-lg disabled:opacity-50 text-xl w-1/3">–</Button>
                    <span className="flex-grow text-center text-sm font-semibold w-1/3">Span: {span}</span>
                    <Button onClick={() => dispatch({ type: 'SET_SPAN', payload: span + 1 })} disabled={isControlDisabled} className="hover:bg-orange-600/80 px-3 h-full rounded-r-lg disabled:opacity-50 text-xl w-1/3">+</Button>
                </div>

                <Button onClick={() => onNumberClick(0)} disabled={isInputDisabled} className={clsx(baseBtn, tealBtn, "text-2xl h-14")}>
                    0
                </Button>

                <div className="flex flex-col gap-2 h-14">
                    <Button onClick={() => dispatch({ type: 'SET_SPEED', payload: (speedIndex + 1) % 2 })} disabled={isControlDisabled} className={clsx(baseBtn, orangeBtn, "text-xs px-1 flex-1")}>
                        Speed: {SPEED_SETTINGS[speedIndex].label}
                    </Button>
                    <Button onClick={() => dispatch({ type: 'SET_MODE', payload: mode === 'forward' ? 'reverse' : 'forward' })} disabled={isControlDisabled} className={clsx(baseBtn, orangeBtn, "text-xs px-1 flex-1")}>
                        {mode === 'forward' ? 'Forward' : 'Reverse'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// --- MAIN COMPONENT ---
export default function DigitSpanTest() {
    const [state, dispatch] = useReducer(testReducer, initialState);
    const generateSequence = useDigitSequence(dispatch);
    const displayedDigit = useSequenceDisplay(state, dispatch);
    const { input, handleInput, resetInput, handleRemoveByIndex } = useUserInput(state, dispatch);

    const isControlDisabled = useMemo(() => ['displaying', 'generating'].includes(state.status), [state.status]);
    const isInputDisabled = useMemo(() => state.status !== 'input', [state.status]);

    const handleNewTest = () => {
        dispatch({ type: 'RESET' });
        setTimeout(() => {
            generateSequence(state.span);
        }, 50);
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col p-2 sm:p-4 font-sans">
             <header className="w-full max-w-sm mx-auto px-4 pt-4 shrink-0">
                <img 
                    src="/working-memory-logo.svg" 
                    alt="Working Memory Logo"
                    className="w-28 h-28 mx-auto mb-4" 
                />
            </header>
            
            <main className="flex-grow flex flex-col items-center justify-center w-full py-4">
                <div className="bg-[#f7f7f7] p-4 rounded-2xl shadow-xl w-full max-w-xs text-center space-y-4 flex flex-col h-full">
                    <div className="flex-grow flex items-center justify-center">
                        <Display state={state} displayedDigit={displayedDigit} />
                    </div>
                    
                    <div className="shrink-0 space-y-4">
                        <InputDisplay 
                            input={input} 
                            onRemove={handleRemoveByIndex}
                            isDisabled={isInputDisabled}
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
            </main>
        </div>
    );
}