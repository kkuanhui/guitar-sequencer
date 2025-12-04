"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";
import { Play, Square, Plus, Trash2, Volume2, Settings, RotateCcw } from "lucide-react";

// --- 1. 樂理常數與資料 ---
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], // 大調
  minor: [0, 2, 3, 5, 7, 8, 10], // 自然小調
};

// --- 型別定義 ---
type Measure = {
  id: string; // 用於 React key
  chordIndex: number; // -1 代表休止符
  rhythm: string; // "1n", "2n", "4n"...
};

type Chord = {
  name: string;
  notes: string[];
  root: string;
};

// --- 輔助函式：計算調性內和弦 (已更新為 C4) ---
const getScaleChords = (root: string, type: "major" | "minor"): Chord[] => {
  const rootIndex = NOTES.indexOf(root);
  const intervals = SCALES[type];
  const chords: Chord[] = [];

  intervals.forEach((interval, index) => {
    const noteIndex = (rootIndex + interval) % 12;
    const noteName = NOTES[noteIndex];
    let chordSuffix = "";
    let chordType = ""; 

    if (type === "major") {
      if ([1, 2, 5].includes(index)) { chordSuffix = "m"; chordType = "minor"; }
      else if (index === 6) { chordSuffix = "dim"; chordType = "dim"; }
      else chordType = "major";
    } else {
      if ([0, 3, 4].includes(index)) { chordSuffix = "m"; chordType = "minor"; }
      else if (index === 1) { chordSuffix = "dim"; chordType = "dim"; }
      else chordType = "major";
    }

    const thirdInterval = chordType === "major" ? 4 : 3;
    const fifthInterval = chordType === "dim" ? 6 : 7;

    // *** 關鍵變動：使用 C4 八度音高 ***
    const notes = [
      NOTES[noteIndex] + "4",
      NOTES[(noteIndex + thirdInterval) % 12] + "4",
      NOTES[(noteIndex + fifthInterval) % 12] + "4",
    ];

    chords.push({ name: noteName + chordSuffix, notes, root: noteName });
  });
  return chords;
};

export default function GuitarSequencer() {
  // --- State 管理 ---
  const [root, setRoot] = useState("C");
  const [scaleType, setScaleType] = useState<"major" | "minor">("major");
  const [bpm, setBpm] = useState(80);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [isLooping, setIsLooping] = useState(true); // 新增：循環播放開關
  
  // 核心資料：小節列表 (預設一個小節)
  const [measures, setMeasures] = useState<Measure[]>([
    { id: crypto.randomUUID(), chordIndex: -1, rhythm: "4n" }
  ]);

  const currentChords = React.useMemo(() => getScaleChords(root, scaleType), [root, scaleType]);

  // --- Audio Refs ---
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const loopRef = useRef<Tone.Loop | null>(null);
  const measuresRef = useRef(measures);
  
  // 讓 Tone.js Loop 存取到最新的 measures 狀態
  useEffect(() => { measuresRef.current = measures; }, [measures]);

  // --- 初始化 Audio & 合成器 ---
  useEffect(() => {
    const synth = new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 3,
      detune: 0,
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 1.5 },
      modulation: { type: "square" },
      modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 }
    }).toDestination();
    
    const reverb = new Tone.Reverb(1.5).toDestination();
    synth.connect(reverb);
    synth.volume.value = -6;
    
    synthRef.current = synth;

    return () => {
      synth.dispose();
      reverb.dispose();
    };
  }, []);

  // --- 停止功能 (Memoized) ---
  const stopSequence = useCallback(() => {
    Tone.Transport.stop();
    if (loopRef.current) {
        loopRef.current.dispose();
        loopRef.current = null;
    }
    setIsPlaying(false);
    setCurrentStep(-1);
  }, []);

  // --- 播放功能 ---
  const togglePlay = useCallback(async () => {
    if (isPlaying) {
      stopSequence();
    } else {
      await Tone.start();
      Tone.Transport.bpm.value = bpm;
      
      let stepCounter = 0;
      const totalMeasures = measuresRef.current.length;

      // 建立 Loop，每一小節觸發一次 (1m)
      const loop = new Tone.Loop((time) => {
        const currentMeasures = measuresRef.current;
        let actualIndex = stepCounter;
        
        // --- 結束條件檢查 ---
        if (actualIndex >= totalMeasures) {
          if (!isLooping) {
            // 如果非循環模式，且已播完最後一個小節，則排程停止
            Tone.Draw.schedule(stopSequence, time); 
            loop.stop();
            return;
          }
          // 如果是循環模式，重設計數器
          stepCounter = 0;
          actualIndex = 0;
        }

        // UI update
        Tone.Draw.schedule(() => {
          setCurrentStep(actualIndex);
        }, time);

        const measureData = currentMeasures[actualIndex];
        
        // 播放聲音邏輯
        if (measureData && measureData.chordIndex !== -1) {
          const chord = currentChords[measureData.chordIndex];
          if (chord) {
             const rhythm = measureData.rhythm;
             let repeatCount = 1;
             if (rhythm === "2n") repeatCount = 2;
             if (rhythm === "4n") repeatCount = 4;
             if (rhythm === "8n") repeatCount = 8;
             if (rhythm === "16n") repeatCount = 16;
             
             const intervalTime = Tone.Time("1m").toSeconds() / repeatCount;

             for (let i = 0; i < repeatCount; i++) {
                const strumTime = time + (i * intervalTime);
                chord.notes.forEach((note, noteIdx) => {
                    synthRef.current?.triggerAttackRelease(
                        note, 
                        rhythm, 
                        strumTime + (noteIdx * 0.03)
                    );
                });
             }
          }
        }

        stepCounter++;
      }, "1m");

      loop.start(0);
      Tone.Transport.start();
      loopRef.current = loop;
      setIsPlaying(true);
    }
  }, [isPlaying, stopSequence, bpm, isLooping, currentChords]); // 依賴 isLooping

  // 即時更新 BPM
  useEffect(() => {
    Tone.Transport.bpm.value = bpm;
  }, [bpm]);

  // --- UI 操作 ---
  const addMeasure = () => {
    setMeasures(prev => [...prev, { id: crypto.randomUUID(), chordIndex: -1, rhythm: "4n" }]);
  };

  const removeMeasure = (id: string) => {
    if (measures.length <= 1) return;
    setMeasures(prev => prev.filter(m => m.id !== id));
    if (isPlaying) stopSequence(); // 刪除時如果有在播放，先停止
  };

  const updateMeasure = (id: string, field: keyof Measure, value: any) => {
    setMeasures(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const playSingleChord = (chord: Chord) => {
    if (!synthRef.current) return;
    const now = Tone.now();
    chord.notes.forEach((note, i) => {
      synthRef.current?.triggerAttackRelease(note, "2n", now + (i * 0.03));
    });
  };

  // *** 新增：清除所有小節功能 ***
  const clearAllMeasures = () => {
    if (isPlaying) {
        stopSequence();
    }
    // 重設為一個休止的小節
    setMeasures([
        { id: crypto.randomUUID(), chordIndex: -1, rhythm: "4n" }
    ]);
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-gray-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header and Play/Stop */}
        <header className="flex flex-col md:flex-row justify-between items-center border-b border-gray-700 pb-6 gap-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            Frontend Guitar Sequencer
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all ${
                isPlaying 
                  ? "bg-red-500 hover:bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]" 
                  : "bg-green-500 hover:bg-green-600 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)]"
              }`}
            >
              {isPlaying ? <><Square size={20} fill="currentColor" /> 停止</> : <><Play size={20} fill="currentColor" /> 播放序列</>}
            </button>
            <button
              onClick={clearAllMeasures}
              className="flex items-center gap-2 px-4 py-3 rounded-full font-bold transition-all bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              <RotateCcw size={20} /> 清除全部
            </button>
          </div>
        </header>

        {/* Block 1: 全域設定 */}
        <section className="bg-neutral-800 rounded-xl p-6 shadow-lg border border-neutral-700">
          <div className="flex items-center gap-2 mb-4 text-green-400">
            <Settings size={20} />
            <h2 className="text-xl font-semibold">基本設定 (Global Settings)</h2>
          </div>
          
          <div className="flex flex-wrap gap-6 items-end">
            {/* 根音選擇 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">根音 (Key Root)</label>
              <select 
                value={root} 
                onChange={(e) => setRoot(e.target.value)}
                className="bg-neutral-900 border border-gray-600 rounded px-3 py-2 focus:ring-2 focus:ring-green-500 outline-none"
              >
                {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* 音階選擇 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">音階 (Scale)</label>
              <select 
                value={scaleType} 
                onChange={(e) => setScaleType(e.target.value as any)}
                className="bg-neutral-900 border border-gray-600 rounded px-3 py-2 focus:ring-2 focus:ring-green-500 outline-none"
              >
                <option value="major">大調 (Major)</option>
                <option value="minor">小調 (Minor)</option>
              </select>
            </div>

            {/* BPM 調整 */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-gray-400">速度 (BPM: {bpm})</label>
              <input 
                type="range" 
                min="40" max="220" 
                value={bpm} 
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-48 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
            </div>
            
            {/* *** 新增：循環播放開關 *** */}
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="loop-toggle"
                checked={isLooping}
                onChange={(e) => setIsLooping(e.target.checked)}
                className="w-4 h-4 text-green-500 bg-gray-700 border-gray-600 rounded focus:ring-green-500 cursor-pointer"
              />
              <label htmlFor="loop-toggle" className="text-sm text-gray-400 cursor-pointer">循環播放 (Loop)</label>
            </div>
          </div>
        </section>

        {/* Block 2: 和弦調色盤 */}
        <section className="bg-neutral-800 rounded-xl p-6 shadow-lg border border-neutral-700">
          <div className="flex items-center gap-2 mb-4 text-blue-400">
            <Volume2 size={20} />
            <h2 className="text-xl font-semibold">和弦試聽 (Chord Palette)</h2>
            <span className="text-xs text-gray-500">(音高：C4)</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {currentChords.map((chord, idx) => (
              <button
                key={idx}
                onClick={() => playSingleChord(chord)}
                className="px-4 py-3 bg-neutral-700 hover:bg-neutral-600 hover:-translate-y-1 active:translate-y-0 transition-all rounded-lg border border-neutral-600 text-lg font-medium shadow-md min-w-[80px]"
              >
                {chord.name}
              </button>
            ))}
          </div>
        </section>

        {/* Block 3: 動態編曲區 */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              🎼 編曲區 (Timeline)
              <span className="text-sm font-normal text-gray-400 bg-neutral-800 px-2 py-1 rounded">
                {measures.length} Measures
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {measures.map((measure, index) => (
              <div 
                key={measure.id}
                className={`relative p-4 rounded-lg border-2 transition-all duration-200 flex flex-col gap-3 group ${
                  index === currentStep 
                    ? "border-green-500 bg-neutral-800 shadow-[0_0_15px_rgba(34,197,94,0.3)] scale-105 z-10" 
                    : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
                }`}
              >
                {/* 刪除按鈕 (Hover 顯示) */}
                {measures.length > 1 && (
                  <button 
                    onClick={() => removeMeasure(measure.id)}
                    className="absolute top-2 right-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="移除此小節"
                  >
                    <Trash2 size={16} />
                  </button>
                )}

                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Bar {index + 1}
                </div>

                {/* 和弦選擇 */}
                <select
                  value={measure.chordIndex}
                  onChange={(e) => updateMeasure(measure.id, 'chordIndex', Number(e.target.value))}
                  className={`w-full p-2 rounded text-sm font-bold border outline-none cursor-pointer ${
                    measure.chordIndex === -1 
                    ? "bg-neutral-900 border-neutral-600 text-gray-500" 
                    : "bg-blue-900/30 border-blue-500 text-blue-300"
                  }`}
                >
                  <option value={-1}>-- 休止 (Rest) --</option>
                  {currentChords.map((c, i) => (
                    <option key={i} value={i}>{c.name}</option>
                  ))}
                </select>

                {/* 節奏選擇 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Rhythm:</span>
                  <select
                    value={measure.rhythm}
                    onChange={(e) => updateMeasure(measure.id, 'rhythm', e.target.value)}
                    className="flex-1 bg-neutral-900 border border-neutral-600 rounded p-1 text-xs outline-none"
                  >
                    <option value="1n">全音符 (Whole)</option>
                    <option value="2n">二分 (1/2)</option>
                    <option value="4n">四分 (1/4)</option>
                    <option value="8n">八分 (1/8)</option>
                    <option value="16n">十六分 (1/16)</option>
                  </select>
                </div>
              </div>
            ))}

            {/* 新增小節按鈕 */}
            <button
              onClick={addMeasure}
              className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-neutral-600 text-neutral-500 hover:text-green-400 hover:border-green-500 hover:bg-neutral-800/50 transition-all min-h-[140px]"
            >
              <Plus size={32} />
              <span className="mt-2 font-medium">Add Measure</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
