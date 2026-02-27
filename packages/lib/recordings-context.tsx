import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { Storage } from '@/packages/platform';
import { Recording, Highlight, Transcript, Summary, Analysis, QAMessage } from '@/packages/types/recording';
import type { TranscriptSegment as RealtimeTranscriptSegment } from '@/packages/types/realtime-transcription';

const STORAGE_KEY = 'pleno_live_recordings';

interface RecordingsState {
  recordings: Recording[];
  isLoading: boolean;
}

type RecordingsAction =
  | { type: 'SET_RECORDINGS'; payload: Recording[] }
  | { type: 'ADD_RECORDING'; payload: Recording }
  | { type: 'UPDATE_RECORDING'; payload: { id: string; updates: Partial<Recording> } }
  | { type: 'DELETE_RECORDING'; payload: string }
  | { type: 'ADD_HIGHLIGHT'; payload: { recordingId: string; highlight: Highlight } }
  | { type: 'SET_TRANSCRIPT'; payload: { recordingId: string; transcript: Transcript } }
  | { type: 'SET_SUMMARY'; payload: { recordingId: string; summary: Summary } }
  | { type: 'SET_ANALYSIS'; payload: { recordingId: string; analysis: Analysis } }
  | { type: 'ADD_QA_MESSAGE'; payload: { recordingId: string; message: QAMessage } }
  | { type: 'UPDATE_REALTIME_TRANSCRIPT'; payload: { recordingId: string; segments: RealtimeTranscriptSegment[] } }
  | { type: 'CLEAR_REALTIME_TRANSCRIPT'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean };

function recordingsReducer(state: RecordingsState, action: RecordingsAction): RecordingsState {
  switch (action.type) {
    case 'SET_RECORDINGS':
      return { ...state, recordings: action.payload, isLoading: false };
    case 'ADD_RECORDING':
      return { ...state, recordings: [action.payload, ...state.recordings] };
    case 'UPDATE_RECORDING':
      return {
        ...state,
        recordings: state.recordings.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates, updatedAt: new Date() } : r
        ),
      };
    case 'DELETE_RECORDING':
      return {
        ...state,
        recordings: state.recordings.filter((r) => r.id !== action.payload),
      };
    case 'ADD_HIGHLIGHT':
      return {
        ...state,
        recordings: state.recordings.map((r) =>
          r.id === action.payload.recordingId
            ? { ...r, highlights: [...r.highlights, action.payload.highlight], updatedAt: new Date() }
            : r
        ),
      };
    case 'SET_TRANSCRIPT':
      return {
        ...state,
        recordings: state.recordings.map((r) =>
          r.id === action.payload.recordingId
            ? { ...r, transcript: action.payload.transcript, status: 'transcribed', updatedAt: new Date() }
            : r
        ),
      };
    case 'SET_SUMMARY':
      return {
        ...state,
        recordings: state.recordings.map((r) =>
          r.id === action.payload.recordingId
            ? { ...r, summary: action.payload.summary, status: 'analyzed' as const, updatedAt: new Date() }
            : r
        ),
      };
    case 'SET_ANALYSIS':
      return {
        ...state,
        recordings: state.recordings.map((r) =>
          r.id === action.payload.recordingId
            ? {
                ...r,
                analysis: action.payload.analysis,
                tags: action.payload.analysis.tags,
                actionItems: action.payload.analysis.actionItems.map(newItem => {
                  // Preserve completed state of existing action items
                  const existing = r.actionItems.find(a => a.text === newItem.text);
                  return existing ? { ...newItem, completed: existing.completed } : newItem;
                }),
                keywords: action.payload.analysis.keywords,
                sentiment: action.payload.analysis.sentiment,
                status: 'analyzed' as const,
                updatedAt: new Date(),
              }
            : r
        ),
      };
    case 'ADD_QA_MESSAGE':
      return {
        ...state,
        recordings: state.recordings.map((r) =>
          r.id === action.payload.recordingId
            ? { ...r, qaHistory: [...r.qaHistory, action.payload.message], updatedAt: new Date() }
            : r
        ),
      };
    case 'UPDATE_REALTIME_TRANSCRIPT':
      return {
        ...state,
        recordings: state.recordings.map((r) =>
          r.id === action.payload.recordingId
            ? {
              ...r,
              realtimeTranscript: {
                segments: action.payload.segments,
                lastUpdated: new Date(),
              },
              updatedAt: new Date(),
            }
            : r
        ),
      };
    case 'CLEAR_REALTIME_TRANSCRIPT':
      return {
        ...state,
        recordings: state.recordings.map((r) =>
          r.id === action.payload
            ? { ...r, realtimeTranscript: undefined, updatedAt: new Date() }
            : r
        ),
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

interface RecordingsContextValue {
  state: RecordingsState;
  addRecording: (recording: Recording) => Promise<void>;
  updateRecording: (id: string, updates: Partial<Recording>) => Promise<void>;
  deleteRecording: (id: string) => Promise<void>;
  addHighlight: (recordingId: string, highlight: Highlight) => Promise<void>;
  setTranscript: (recordingId: string, transcript: Transcript) => Promise<void>;
  setSummary: (recordingId: string, summary: Summary) => Promise<void>;
  setAnalysis: (recordingId: string, analysis: Analysis) => Promise<void>;
  addQAMessage: (recordingId: string, message: QAMessage) => Promise<void>;
  updateRealtimeTranscript: (recordingId: string, segments: RealtimeTranscriptSegment[]) => void;
  clearRealtimeTranscript: (recordingId: string) => void;
  getRecording: (id: string) => Recording | undefined;
}

const RecordingsContext = createContext<RecordingsContextValue | null>(null);

export function RecordingsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(recordingsReducer, {
    recordings: [],
    isLoading: true,
  });

  // Load recordings from storage on mount
  useEffect(() => {
    loadRecordings();
  }, []);

  // Save recordings to storage whenever they change
  useEffect(() => {
    if (!state.isLoading) {
      saveRecordings(state.recordings).catch((error) => {
        console.error('Failed to save recordings:', error);
      });
    }
  }, [state.recordings, state.isLoading]);

  const loadRecordings = async () => {
    try {
      const stored = await Storage.getItem(STORAGE_KEY);
      if (!stored) {
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }

      const parsed = JSON.parse(stored);

      const recordings = parsed.map((r: any) => {
        // 日付文字列をそのまま保持し、必要時に変換
        const createdAtStr = r.createdAt;
        const updatedAtStr = r.updatedAt;
        const transcriptProcessedAtStr = r.transcript?.processedAt;
        const summaryProcessedAtStr = r.summary?.processedAt;
        const analysisProcessedAtStr = r.analysis?.processedAt;

        // Status migration: summarizing → analyzing, summarized → analyzed
        let status = r.status;
        if (status === 'summarizing') status = 'analyzing';
        if (status === 'summarized') status = 'analyzed';

        // Migrate legacy data: build analysis from summary + individual fields
        let analysis = r.analysis;
        if (!analysis && r.summary) {
          analysis = {
            overview: r.summary.overview || '',
            keyPoints: r.summary.keyPoints || [],
            tags: r.tags || [],
            actionItems: r.actionItems || [],
            keywords: r.keywords || [],
            sentiment: r.sentiment || {
              overallSentiment: 'neutral' as const,
              score: 0,
              confidence: 0,
              emotions: { joy: 0, sadness: 0, anger: 0, fear: 0, surprise: 0, disgust: 0 },
              summary: '',
              processedAt: new Date(),
            },
            processedAt: typeof summaryProcessedAtStr === 'string'
              ? new Date(summaryProcessedAtStr)
              : summaryProcessedAtStr || new Date(),
          };
        }

        return {
          ...r,
          status,
          // 日付変換は必要に応じて実行（アクセス時に変換）
          createdAt: typeof createdAtStr === 'string' ? new Date(createdAtStr) : createdAtStr,
          updatedAt: typeof updatedAtStr === 'string' ? new Date(updatedAtStr) : updatedAtStr,
          transcript: r.transcript
            ? {
                ...r.transcript,
                processedAt: typeof transcriptProcessedAtStr === 'string'
                  ? new Date(transcriptProcessedAtStr)
                  : transcriptProcessedAtStr,
              }
            : undefined,
          summary: r.summary
            ? {
                ...r.summary,
                processedAt: typeof summaryProcessedAtStr === 'string'
                  ? new Date(summaryProcessedAtStr)
                  : summaryProcessedAtStr,
              }
            : undefined,
          analysis: analysis
            ? {
                ...analysis,
                processedAt: typeof analysisProcessedAtStr === 'string'
                  ? new Date(analysisProcessedAtStr)
                  : analysis.processedAt,
              }
            : undefined,
          qaHistory: (r.qaHistory || []).map((m: QAMessage) => ({
            ...m,
            timestamp: typeof m.timestamp === 'string' ? new Date(m.timestamp) : m.timestamp,
          })),
        };
      });

      dispatch({ type: 'SET_RECORDINGS', payload: recordings });
    } catch (error) {
      console.error('Failed to load recordings:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const saveRecordings = async (recordings: Recording[]) => {
    try {
      // realtimeTranscriptは一時データなので保存から除外
      const recordingsToSave = recordings.map(({ realtimeTranscript, ...rest }) => rest);
      await Storage.setItem(STORAGE_KEY, JSON.stringify(recordingsToSave));
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('Storage quota exceeded. Consider cleaning up old recordings.');
      }
      console.error('Failed to save recordings:', error);
    }
  };

  const addRecording = useCallback(async (recording: Recording) => {
    dispatch({ type: 'ADD_RECORDING', payload: recording });
  }, []);

  const updateRecording = useCallback(async (id: string, updates: Partial<Recording>) => {
    dispatch({ type: 'UPDATE_RECORDING', payload: { id, updates } });
  }, []);

  const deleteRecording = useCallback(async (id: string) => {
    dispatch({ type: 'DELETE_RECORDING', payload: id });
  }, []);

  const addHighlight = useCallback(async (recordingId: string, highlight: Highlight) => {
    dispatch({ type: 'ADD_HIGHLIGHT', payload: { recordingId, highlight } });
  }, []);

  const setTranscript = useCallback(async (recordingId: string, transcript: Transcript) => {
    dispatch({ type: 'SET_TRANSCRIPT', payload: { recordingId, transcript } });
  }, []);

  const setSummary = useCallback(async (recordingId: string, summary: Summary) => {
    dispatch({ type: 'SET_SUMMARY', payload: { recordingId, summary } });
  }, []);

  const setAnalysis = useCallback(async (recordingId: string, analysis: Analysis) => {
    dispatch({ type: 'SET_ANALYSIS', payload: { recordingId, analysis } });
  }, []);

  const addQAMessage = useCallback(async (recordingId: string, message: QAMessage) => {
    dispatch({ type: 'ADD_QA_MESSAGE', payload: { recordingId, message } });
  }, []);

  const updateRealtimeTranscript = useCallback((recordingId: string, segments: RealtimeTranscriptSegment[]) => {
    dispatch({ type: 'UPDATE_REALTIME_TRANSCRIPT', payload: { recordingId, segments } });
  }, []);

  const clearRealtimeTranscript = useCallback((recordingId: string) => {
    dispatch({ type: 'CLEAR_REALTIME_TRANSCRIPT', payload: recordingId });
  }, []);

  const getRecording = useCallback(
    (id: string) => state.recordings.find((r) => r.id === id),
    [state.recordings]
  );

  return (
    <RecordingsContext.Provider
      value={{
        state,
        addRecording,
        updateRecording,
        deleteRecording,
        addHighlight,
        setTranscript,
        setSummary,
        setAnalysis,
        addQAMessage,
        updateRealtimeTranscript,
        clearRealtimeTranscript,
        getRecording,
      }}
    >
      {children}
    </RecordingsContext.Provider>
  );
}

// ウェブのランディングページなど、プロバイダーがない場合のデフォルト値
const defaultValue: RecordingsContextValue = {
  state: { recordings: [], isLoading: false },
  addRecording: async () => {},
  updateRecording: async () => {},
  deleteRecording: async () => {},
  addHighlight: async () => {},
  setTranscript: async () => {},
  setSummary: async () => {},
  setAnalysis: async () => {},
  addQAMessage: async () => {},
  updateRealtimeTranscript: () => {},
  clearRealtimeTranscript: () => {},
  getRecording: () => undefined,
};

export function useRecordings() {
  const context = useContext(RecordingsContext);
  // プロバイダーがない場合はデフォルト値を返す（ウェブのランディングページなど）
  return context ?? defaultValue;
}
